# app/ferias.py - Blueprint do Controle de Férias (estado em SQLite)
#
# Módulo restrito ao perfil master. A checagem de perfil é local e devolve
# 403 JSON (nunca o decorator de perfil das rotas de página, que redireciona
# com flash). Os dados
# vivem nas tabelas ferias_funcionarios, ferias_periodos e ferias_blocos
# criadas em app/db.py; o proxy /api/baserow não participa deste módulo.
#
# Leva 1: endpoints de funcionários (GET, POST, PATCH).
# Leva 2: períodos aquisitivos (GET, POST, PATCH, POST /excluir) com o cálculo
# de saldo e avisos em _calcular_periodo; os blocos de férias já entram no
# cálculo, mas só ganham endpoints na Leva 3. Períodos e blocos têm exclusão
# lógica (excluido_em IS NULL = vigente); um período excluído é tratado como
# inexistente em toda a API.
# Leva 3: GET /periodos/<id> e os endpoints de blocos (POST, PATCH,
# POST /excluir), todos respondendo com o período recalculado por
# _responder_periodo; aviso 7 (bloco sobreposto a outro bloco do mesmo
# funcionário, em qualquer período vigente). Não se valida que o bloco caia
# dentro do período aquisitivo (as férias são gozadas depois dele) nem a
# sobreposição de blocos (é aviso, nunca bloqueio).
# Leva 4: GET /calendario, o único endpoint aberto aos três perfis (só
# login), que alimenta as barras de férias do /calendario com nome, cor e
# datas dos blocos vigentes (funcionários inativos incluídos: histórico).
# Leva 5: alerta de vencimento do período concessivo (12 meses após o fim
# do aquisitivo; as férias devem ser gozadas dentro dele). Campo derivado
# "vencimento" em _calcular_periodo (None quando saldo <= 0) e GET
# /vencimentos com os períodos de funcionários ativos próximos do limite ou
# vencidos. "Hoje" vem de date.today() nos pontos de entrada, uma vez por
# requisição; nunca do SQLite.
# Leva 7: categorias de eventos (GET/POST /categorias, PATCH /categorias/<id>),
# geridas na aba de Configurações; nunca apagadas, só inativadas.
# Leva 8a: eventos funcionais (GET/POST /eventos, PATCH /eventos/<id>,
# POST /eventos/<id>/excluir) com exclusão lógica; a categoria do evento vem
# junto no JSON (nome e se ainda está ativa). Sem notificação nesta leva.
# Leva 8b: notificações só-leitura. Ao registrar (nunca ao editar) um bloco
# ou um evento, o body pode trazer notificar_ids; _notificar grava uma linha
# em notifications por destinatário válido (tipo ferias_bloco/ferias_evento,
# ref_id = id do registro, comment_id/protocolo_id = 0 como sentinelas) na
# mesma transação do registro, e a resposta ganha "notificados".
# Leva 9: endpoint da visão geral (só leitura): resumo numérico e linha do
# tempo do funcionário (admissão, períodos, blocos e eventos vigentes)
# agrupada por ano, do mais recente ao mais antigo; inativo é consultável.
#
# Convenções: datas sem hora trafegam como string 'YYYY-MM-DD', validadas
# mas nunca convertidas; timestamps de auditoria (CURRENT_TIMESTAMP, UTC) só
# saem pelo _iso_utc. Funcionário nunca é apagado: usa a flag ativo.
# REFERENCES no esquema é documental (o app não ativa PRAGMA foreign_keys);
# a integridade entre tabelas é garantida aqui, antes de cada INSERT.
import re
from datetime import date, timedelta

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.db import get_db

ferias_bp = Blueprint("ferias", __name__, url_prefix="/api/ferias")

NOME_MAX_CHARS = 120
OBSERVACOES_MAX_CHARS = 2000
DIAS_DIREITO_PADRAO = 30
DIAS_MAX = 60
ID_MAX = 10 ** 9
ANTECEDENCIA_ALERTA_DIAS = 90

_DATA_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_COR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
_ESPACOS_RE = re.compile(r"\s+")
_INTEIRO_RE = re.compile(r"^-?\d+$")

ERRO_NOME_VAZIO = "Informe o nome do funcionário."
ERRO_NOME_LONGO = "O nome deve ter no máximo {} caracteres.".format(NOME_MAX_CHARS)
ERRO_COR = "Cor inválida. Use o formato #RRGGBB."
ERRO_DATA_ADMISSAO = "Data de admissão inválida (use AAAA-MM-DD)."
ERRO_NOME_DUPLICADO = "Já existe um funcionário com este nome."
ERRO_NAO_ENCONTRADO = "Funcionário não encontrado."
ERRO_ATIVO = "Valor inválido para ativo."
ERRO_SEM_CAMPOS = "Nenhum campo para atualizar."

ERRO_INFORME_FUNCIONARIO = "Informe o funcionário."
ERRO_FUNCIONARIO_INATIVO = "Funcionário inativo."
ERRO_PERIODO_NAO_ENCONTRADO = "Período não encontrado."
ERRO_DATA_INICIAL = "Data inicial inválida (use AAAA-MM-DD)."
ERRO_DATA_FINAL = "Data final inválida (use AAAA-MM-DD)."
ERRO_ORDEM_DATAS = "A data final deve ser igual ou posterior à inicial."
ERRO_DIAS_DIREITO = "Dias de direito inválidos (0 a {}).".format(DIAS_MAX)
ERRO_ABONO = "Dias de abono inválidos (0 a {}).".format(DIAS_MAX)
ERRO_OBSERVACOES_LONGAS = "Observações devem ter no máximo {} caracteres.".format(OBSERVACOES_MAX_CHARS)
ERRO_OBSERVACOES = "Observações inválidas."
ERRO_EXCLUIR_COM_BLOCOS = "Não é possível excluir: há blocos de férias registrados neste período."
ERRO_BLOCO_NAO_ENCONTRADO = "Bloco não encontrado."

CATEGORIA_NOME_MAX_CHARS = 60
ORDEM_MAX = 999
ERRO_CATEGORIA_NOME_VAZIO = "Informe o nome da categoria."
ERRO_CATEGORIA_NOME_LONGO = "O nome deve ter no máximo {} caracteres.".format(CATEGORIA_NOME_MAX_CHARS)
ERRO_CATEGORIA_ORDEM = "Ordem inválida (0 a {}).".format(ORDEM_MAX)
ERRO_CATEGORIA_DUPLICADA = "Já existe uma categoria com este nome."
ERRO_CATEGORIA_NAO_ENCONTRADA = "Categoria não encontrada."

OCORRENCIA_MAX_CHARS = 2000
ERRO_EVENTO_NAO_ENCONTRADO = "Evento não encontrado."
ERRO_CATEGORIA_INATIVA = "Categoria inativa."
ERRO_DATA_EVENTO = "Data inválida (use AAAA-MM-DD)."
ERRO_OCORRENCIA_VAZIA = "Descreva a ocorrência."
ERRO_OCORRENCIA_TAMANHO = "A ocorrência deve ter no máximo {} caracteres.".format(OCORRENCIA_MAX_CHARS)

PREVIA_MAX_CHARS = 120
ERRO_NOTIFICAR_IDS = "Destinatários inválidos."

AVISO_ABONO = "Abono acima de um terço do direito (máximo {} dias)."
AVISO_MUITOS_BLOCOS = "Mais de 3 blocos de férias."
AVISO_SEM_BLOCO_14 = "Nenhum bloco com 14 dias ou mais."
AVISO_BLOCO_CURTO = "Há bloco com menos de 5 dias."
AVISO_SALDO_NEGATIVO = "Saldo negativo: {} dias além do direito."
AVISO_SOBREPOSICAO = "Sobrepõe outro período aquisitivo."
AVISO_BLOCO_SOBREPOSTO = "Há bloco sobreposto a outro bloco de férias."


# ---------------------------------------------------------------------------
# Perfil e formatação
# ---------------------------------------------------------------------------

def _exigir_master():
    """Retorna uma resposta 403 se o usuário atual não for master; senão None."""
    if current_user.perfil != "master":
        return jsonify(ok=False, erro="Apenas o usuário master pode acessar o controle de férias."), 403
    return None


def _iso_utc(timestamp):
    """Converte 'YYYY-MM-DD HH:MM:SS' (CURRENT_TIMESTAMP do SQLite, UTC) em
    ISO 8601 com sufixo Z explícito, para o frontend converter com new Date()
    ao horário local. Sem o Z, o horário exibido ficaria 3h errado (UTC-3).
    Definido nesta leva para as seguintes; os endpoints de funcionários não
    devolvem timestamps."""
    return timestamp.replace(" ", "T") + "Z"


# ---------------------------------------------------------------------------
# Notificações só-leitura (blocos e eventos recém-registrados)
# ---------------------------------------------------------------------------

def _validar_notificar_ids(dados):
    """Lista de ids de destinatários do body (chave notificar_ids). Ausente ou
    None vira []; qualquer valor que não seja lista devolve False (o chamador
    responde 400); itens que não sejam inteiros positivos são descartados."""
    bruto = dados.get("notificar_ids")
    if bruto is None:
        return []
    if not isinstance(bruto, list):
        return False
    ids = []
    for item in bruto:
        if isinstance(item, bool) or not isinstance(item, int):
            continue
        if 1 <= item <= ID_MAX:
            ids.append(item)
    return ids


def _notificar(db, tipo, ref_id, previa, destinatarios):
    """Grava uma notificação só-leitura por destinatário válido (usuário ativo,
    diferente do remetente, sem repetição) e devolve quantas foram gravadas.
    tipo é 'ferias_bloco' ou 'ferias_evento' (fixo no código); comment_id e
    protocolo_id ficam em 0 (a tabela exige NOT NULL; o tipo distingue estas
    linhas das de comentário). Não faz commit: o chamador comita junto com o
    registro que originou a notificação."""
    previa = previa[:PREVIA_MAX_CHARS]
    inseridas = 0
    vistos = set()
    for uid in destinatarios:
        if uid == current_user.id or uid in vistos:
            continue
        vistos.add(uid)
        usuario = db.execute(
            "SELECT id FROM users WHERE id = ? AND ativo = 1", (uid,)
        ).fetchone()
        if usuario is None:
            continue
        db.execute(
            "INSERT INTO notifications "
            "(destinatario_id, remetente_id, remetente_nome, comment_id, protocolo_id, "
            "previa, tipo, ref_id) "
            "VALUES (?, ?, ?, 0, 0, ?, ?, ?)",
            (uid, current_user.id, current_user.nome, previa, tipo, ref_id),
        )
        inseridas += 1
    return inseridas


def _previa_evento(funcionario_nome, data, categoria_nome, ocorrencia):
    """Texto curto da notificação de evento: 'Nome, dd/mm/aaaa (Categoria):
    ocorrência', com espaços internos colapsados (a prévia é de uma linha) e
    cortado em 117 + '...' quando passa de 120 caracteres."""
    texto = "%s, %s (%s): %s" % (
        funcionario_nome, _formatar_br(date.fromisoformat(data)), categoria_nome,
        _ESPACOS_RE.sub(" ", ocorrencia).strip(),
    )
    if len(texto) > PREVIA_MAX_CHARS:
        texto = texto[:PREVIA_MAX_CHARS - 3] + "..."
    return texto


# ---------------------------------------------------------------------------
# Validação de campos
# ---------------------------------------------------------------------------

def _validar_data(valor):
    """None para vazio (None ou ''), a própria string para 'YYYY-MM-DD' válida,
    False para qualquer outra coisa. Distingue "vazio" de "inválido"."""
    if valor is None:
        return None
    if not isinstance(valor, str):
        return False
    valor = valor.strip()
    if valor == "":
        return None
    if not _DATA_RE.match(valor):
        return False
    try:
        date.fromisoformat(valor)
    except ValueError:
        return False
    return valor


def _validar_cor(valor):
    """Devolve a cor '#RRGGBB' em maiúsculas, ou None se inválida."""
    if not isinstance(valor, str):
        return None
    valor = valor.strip()
    if not _COR_RE.match(valor):
        return None
    return valor.upper()


def _validar_ativo(valor):
    """Aceita True/False/0/1 e devolve 0 ou 1; qualquer outro valor devolve None."""
    if isinstance(valor, bool):
        return 1 if valor else 0
    if isinstance(valor, int) and valor in (0, 1):
        return valor
    return None


def _validar_inteiro(valor, minimo, maximo):
    """Aceita int (bool é rejeitado) ou string numérica; devolve o int dentro
    de [minimo, maximo] ou None."""
    if isinstance(valor, bool):
        return None
    if isinstance(valor, int):
        numero = valor
    elif isinstance(valor, str) and _INTEIRO_RE.match(valor.strip()):
        numero = int(valor.strip())
    else:
        return None
    if numero < minimo or numero > maximo:
        return None
    return numero


def _normalizar_nome(valor):
    """Remove espaços das pontas e colapsa espaços internos; '' se vazio."""
    return _ESPACOS_RE.sub(" ", str(valor or "")).strip()


def _dias_entre(inicio, fim):
    """Dias corridos entre duas datas 'YYYY-MM-DD', inclusivas nas duas pontas."""
    return (date.fromisoformat(fim) - date.fromisoformat(inicio)).days + 1


# ---------------------------------------------------------------------------
# Vencimento do período concessivo
# ---------------------------------------------------------------------------

def _somar_um_ano(d):
    """d + 1 ano; 29/02 vira 28/02 no ano seguinte."""
    try:
        return d.replace(year=d.year + 1)
    except ValueError:
        return d.replace(year=d.year + 1, day=28)


def _formatar_br(d):
    """date para 'dd/mm/aaaa'."""
    return d.strftime("%d/%m/%Y")


def _texto_dias(n):
    """'1 dia' ou 'N dias'."""
    return "1 dia" if n == 1 else "{} dias".format(n)


def _calcular_vencimento(fim_aquisitivo, saldo, hoje):
    """Alerta de vencimento do período concessivo para um período com saldo.

    Regra: o concessivo são os 12 meses após o fim do aquisitivo e as férias
    devem ser gozadas dentro dele; a data-limite de início é o último dia em
    que as férias podem começar para o saldo inteiro terminar no prazo
    (fim do concessivo - saldo + 1 dia). None quando saldo <= 0: um bloco
    futuro já registrado reduz o saldo e, ao zerá-lo, encerra o alerta
    (planejado = resolvido). hoje vem do chamador; nunca é lido aqui.
    """
    if saldo <= 0:
        return None

    fim_conc = _somar_um_ano(date.fromisoformat(fim_aquisitivo))
    limite_inicio = fim_conc - timedelta(days=saldo - 1)
    dias = (limite_inicio - hoje).days
    if dias < 0:
        situacao = "vencido"
    elif dias <= ANTECEDENCIA_ALERTA_DIAS:
        situacao = "proximo"
    else:
        situacao = "ok"

    verbo = "terminou" if fim_conc < hoje else "termina"
    x = abs(dias)
    if situacao == "vencido":
        mensagem = (
            "Saldo de {saldo}. O período concessivo {verbo} em {fim_conc}; o último dia para "
            "iniciar as férias dentro do prazo foi {limite} (há {x}). Férias concedidas após o "
            "prazo devem ser pagas em dobro (CLT, arts. 134 e 137)."
        ).format(
            saldo=_texto_dias(saldo), verbo=verbo, fim_conc=_formatar_br(fim_conc),
            limite=_formatar_br(limite_inicio), x=_texto_dias(x),
        )
    else:
        quando = "hoje" if x == 0 else "em {}".format(_texto_dias(x))
        mensagem = (
            "Saldo de {saldo}. O período concessivo {verbo} em {fim_conc}; para gozar todo o "
            "saldo dentro do prazo, as férias devem começar até {limite} ({quando})."
        ).format(
            saldo=_texto_dias(saldo), verbo=verbo, fim_conc=_formatar_br(fim_conc),
            limite=_formatar_br(limite_inicio), quando=quando,
        )

    return {
        "fim_concessivo": fim_conc.isoformat(),
        "limite_inicio": limite_inicio.isoformat(),
        "dias_para_limite": dias,
        "situacao": situacao,
        "mensagem": mensagem,
    }


# ---------------------------------------------------------------------------
# Acesso a dados
# ---------------------------------------------------------------------------

def _nome_duplicado(db, nome, ignorar_id=None):
    """True se já existe funcionário (ativo ou inativo) com o mesmo nome,
    ignorando caixa e acentos maiúsculos (casefold em Python; a função de
    minúsculas do SQLite só dobra ASCII). ignorar_id exclui o próprio
    registro na edição. A tabela é pequena, então a comparação é em memória."""
    alvo = nome.casefold()
    rows = db.execute("SELECT id, nome FROM ferias_funcionarios").fetchall()
    for row in rows:
        if ignorar_id is not None and row["id"] == ignorar_id:
            continue
        if (row["nome"] or "").casefold() == alvo:
            return True
    return False


def _buscar_funcionario(db, funcionario_id):
    """Linha do funcionário por id, ou None."""
    return db.execute(
        "SELECT id, nome, cor, data_admissao, ativo FROM ferias_funcionarios WHERE id = ?",
        (funcionario_id,),
    ).fetchone()


def _serializar_funcionario(row):
    """Formato devolvido ao frontend (sem timestamps nem autoria)."""
    return {
        "id": row["id"],
        "nome": row["nome"],
        "cor": row["cor"],
        "data_admissao": row["data_admissao"],
        "ativo": bool(row["ativo"]),
    }


# ---------------------------------------------------------------------------
# Rotas: funcionários
# ---------------------------------------------------------------------------

@ferias_bp.route("/funcionarios", methods=["GET"])
@login_required
def listar_funcionarios():
    """Lista os funcionários ativos; com ?incluir_inativos=1, todos. Só master."""
    erro = _exigir_master()
    if erro:
        return erro

    incluir_inativos = request.args.get("incluir_inativos") == "1"
    sql = "SELECT id, nome, cor, data_admissao, ativo FROM ferias_funcionarios"
    if not incluir_inativos:
        sql += " WHERE ativo = 1"
    sql += " ORDER BY nome COLLATE NOCASE"

    rows = get_db().execute(sql).fetchall()
    return jsonify(ok=True, funcionarios=[_serializar_funcionario(r) for r in rows])


@ferias_bp.route("/funcionarios", methods=["POST"])
@login_required
def criar_funcionario():
    """Cria um funcionário. Body JSON: nome, cor, data_admissao (opcional). Só master."""
    erro = _exigir_master()
    if erro:
        return erro

    dados = request.get_json(silent=True) or {}

    nome = _normalizar_nome(dados.get("nome"))
    if not nome:
        return jsonify(ok=False, erro=ERRO_NOME_VAZIO), 400
    if len(nome) > NOME_MAX_CHARS:
        return jsonify(ok=False, erro=ERRO_NOME_LONGO), 400

    cor = _validar_cor(dados.get("cor"))
    if cor is None:
        return jsonify(ok=False, erro=ERRO_COR), 400

    data_admissao = _validar_data(dados.get("data_admissao"))
    if data_admissao is False:
        return jsonify(ok=False, erro=ERRO_DATA_ADMISSAO), 400

    db = get_db()
    if _nome_duplicado(db, nome):
        return jsonify(ok=False, erro=ERRO_NOME_DUPLICADO), 409

    cur = db.execute(
        "INSERT INTO ferias_funcionarios "
        "(nome, cor, data_admissao, criado_por_id, criado_por_nome) "
        "VALUES (?, ?, ?, ?, ?)",
        (nome, cor, data_admissao, current_user.id, current_user.nome),
    )
    db.commit()

    row = _buscar_funcionario(db, cur.lastrowid)
    return jsonify(ok=True, funcionario=_serializar_funcionario(row)), 201


@ferias_bp.route("/funcionarios/<int:funcionario_id>", methods=["PATCH"])
@login_required
def atualizar_funcionario(funcionario_id):
    """Atualização parcial: só os campos presentes no body (nome, cor,
    data_admissao, ativo) são alterados. Só master."""
    erro = _exigir_master()
    if erro:
        return erro

    db = get_db()
    if _buscar_funcionario(db, funcionario_id) is None:
        return jsonify(ok=False, erro=ERRO_NAO_ENCONTRADO), 404

    dados = request.get_json(silent=True) or {}
    colunas = []
    valores = []

    if "nome" in dados:
        nome = _normalizar_nome(dados.get("nome"))
        if not nome:
            return jsonify(ok=False, erro=ERRO_NOME_VAZIO), 400
        if len(nome) > NOME_MAX_CHARS:
            return jsonify(ok=False, erro=ERRO_NOME_LONGO), 400
        if _nome_duplicado(db, nome, ignorar_id=funcionario_id):
            return jsonify(ok=False, erro=ERRO_NOME_DUPLICADO), 409
        colunas.append("nome = ?")
        valores.append(nome)

    if "cor" in dados:
        cor = _validar_cor(dados.get("cor"))
        if cor is None:
            return jsonify(ok=False, erro=ERRO_COR), 400
        colunas.append("cor = ?")
        valores.append(cor)

    if "data_admissao" in dados:
        data_admissao = _validar_data(dados.get("data_admissao"))
        if data_admissao is False:
            return jsonify(ok=False, erro=ERRO_DATA_ADMISSAO), 400
        colunas.append("data_admissao = ?")
        valores.append(data_admissao)

    if "ativo" in dados:
        ativo = _validar_ativo(dados.get("ativo"))
        if ativo is None:
            return jsonify(ok=False, erro=ERRO_ATIVO), 400
        colunas.append("ativo = ?")
        valores.append(ativo)

    if not colunas:
        return jsonify(ok=False, erro=ERRO_SEM_CAMPOS), 400

    colunas.append("atualizado_em = CURRENT_TIMESTAMP")
    valores.append(funcionario_id)
    db.execute(
        "UPDATE ferias_funcionarios SET " + ", ".join(colunas) + " WHERE id = ?",
        valores,
    )
    db.commit()

    row = _buscar_funcionario(db, funcionario_id)
    return jsonify(ok=True, funcionario=_serializar_funcionario(row))


# ---------------------------------------------------------------------------
# Períodos aquisitivos: acesso a dados e cálculo
# ---------------------------------------------------------------------------

def _buscar_periodo(db, periodo_id):
    """Linha do período vigente (não excluído) por id, ou None."""
    return db.execute(
        "SELECT * FROM ferias_periodos WHERE id = ? AND excluido_em IS NULL",
        (periodo_id,),
    ).fetchone()


def _blocos_ativos(db, periodo_id):
    """Blocos de férias vigentes do período, ordenados pelo início."""
    return db.execute(
        "SELECT id, inicio, fim FROM ferias_blocos "
        "WHERE periodo_id = ? AND excluido_em IS NULL ORDER BY inicio",
        (periodo_id,),
    ).fetchall()


def _periodos_ativos_do_funcionario(db, funcionario_id):
    """Períodos vigentes do funcionário, do mais recente para o mais antigo."""
    return db.execute(
        "SELECT * FROM ferias_periodos "
        "WHERE funcionario_id = ? AND excluido_em IS NULL ORDER BY inicio DESC",
        (funcionario_id,),
    ).fetchall()


def _blocos_ativos_do_funcionario(db, funcionario_id):
    """Blocos vigentes do funcionário em qualquer período vigente (para o
    aviso de bloco sobreposto, que cruza períodos)."""
    return db.execute(
        "SELECT b.id, b.inicio, b.fim, b.periodo_id "
        "FROM ferias_blocos b "
        "JOIN ferias_periodos p ON p.id = b.periodo_id "
        "WHERE p.funcionario_id = ? AND b.excluido_em IS NULL AND p.excluido_em IS NULL",
        (funcionario_id,),
    ).fetchall()


def _buscar_bloco(db, bloco_id):
    """Linha do bloco vigente (não excluído) por id, ou None."""
    return db.execute(
        "SELECT * FROM ferias_blocos WHERE id = ? AND excluido_em IS NULL",
        (bloco_id,),
    ).fetchone()


def _responder_periodo(db, periodo_id, status=200, extra=None):
    """Relê o período e devolve o painel completo recalculado (blocos, saldo,
    avisos). Usado pelo GET de um período e por todos os endpoints de blocos.
    extra: dict opcional mesclado na resposta (ex.: notificados no POST)."""
    row = _buscar_periodo(db, periodo_id)
    if row is None:
        return jsonify(ok=False, erro=ERRO_PERIODO_NAO_ENCONTRADO), 404
    outros = [
        p for p in _periodos_ativos_do_funcionario(db, row["funcionario_id"])
        if p["id"] != periodo_id
    ]
    hoje = date.today()
    corpo = {"ok": True, "periodo": _calcular_periodo(db, row, outros, hoje=hoje)}
    if extra:
        corpo.update(extra)
    return jsonify(corpo), status


def _calcular_periodo(db, row, outros=None, blocos_funcionario=None, hoje=None):
    """Serializa o período com saldo, blocos vigentes, avisos e vencimento.

    outros: lista dos demais períodos vigentes do mesmo funcionário, para a
    checagem de sobreposição de períodos sem repetir a consulta; None =
    consultar aqui. blocos_funcionario: blocos vigentes do funcionário em
    todos os períodos vigentes, para o aviso de bloco sobreposto; idem.
    hoje: data de referência do vencimento (None = date.today()); as
    listagens calculam uma vez e repassam. Os avisos são informativos e nunca
    bloqueiam operação alguma; o vencimento é campo próprio, fora de avisos.
    """
    if hoje is None:
        hoje = date.today()

    blocos = []
    dias_gozados = 0
    for b in _blocos_ativos(db, row["id"]):
        dias = _dias_entre(b["inicio"], b["fim"])
        blocos.append({"id": b["id"], "inicio": b["inicio"], "fim": b["fim"], "dias": dias})
        dias_gozados += dias

    dias_direito = row["dias_direito"]
    abono_dias = row["abono_dias"]
    saldo = dias_direito - abono_dias - dias_gozados
    qtd_blocos = len(blocos)

    avisos = []
    terco = dias_direito // 3
    if abono_dias > terco:
        avisos.append(AVISO_ABONO.format(terco))
    if qtd_blocos > 3:
        avisos.append(AVISO_MUITOS_BLOCOS)
    if qtd_blocos > 1 and not any(b["dias"] >= 14 for b in blocos):
        avisos.append(AVISO_SEM_BLOCO_14)
    if any(b["dias"] < 5 for b in blocos):
        avisos.append(AVISO_BLOCO_CURTO)
    if saldo < 0:
        avisos.append(AVISO_SALDO_NEGATIVO.format(-saldo))

    if outros is None:
        outros = _periodos_ativos_do_funcionario(db, row["funcionario_id"])
    for outro in outros:
        if outro["id"] == row["id"]:
            continue
        if row["inicio"] <= outro["fim"] and row["fim"] >= outro["inicio"]:
            avisos.append(AVISO_SOBREPOSICAO)
            break

    if blocos and blocos_funcionario is None:
        blocos_funcionario = _blocos_ativos_do_funcionario(db, row["funcionario_id"])
    bloco_sobreposto = False
    for b in blocos:
        for outro in blocos_funcionario or []:
            if outro["id"] == b["id"]:
                continue
            if b["inicio"] <= outro["fim"] and b["fim"] >= outro["inicio"]:
                bloco_sobreposto = True
                break
        if bloco_sobreposto:
            break
    if bloco_sobreposto:
        avisos.append(AVISO_BLOCO_SOBREPOSTO)

    return {
        "id": row["id"],
        "funcionario_id": row["funcionario_id"],
        "inicio": row["inicio"],
        "fim": row["fim"],
        "dias_direito": dias_direito,
        "abono_dias": abono_dias,
        "observacoes": row["observacoes"],
        "blocos": blocos,
        "qtd_blocos": qtd_blocos,
        "dias_gozados": dias_gozados,
        "saldo": saldo,
        "concluido": saldo <= 0,
        "avisos": avisos,
        "vencimento": _calcular_vencimento(row["fim"], saldo, hoje),
    }


# ---------------------------------------------------------------------------
# Rotas: períodos aquisitivos
# ---------------------------------------------------------------------------

@ferias_bp.route("/periodos", methods=["GET"])
@login_required
def listar_periodos():
    """Períodos vigentes de um funcionário (?funcionario_id=, obrigatório);
    concluídos só com ?incluir_concluidos=1. Funcionário inativo pode ser
    consultado (histórico). Só master."""
    erro = _exigir_master()
    if erro:
        return erro

    funcionario_id = _validar_inteiro(request.args.get("funcionario_id"), 1, ID_MAX)
    if funcionario_id is None:
        return jsonify(ok=False, erro=ERRO_INFORME_FUNCIONARIO), 400

    db = get_db()
    if _buscar_funcionario(db, funcionario_id) is None:
        return jsonify(ok=False, erro=ERRO_NAO_ENCONTRADO), 404

    incluir_concluidos = request.args.get("incluir_concluidos") == "1"
    rows = _periodos_ativos_do_funcionario(db, funcionario_id)
    blocos_funcionario = _blocos_ativos_do_funcionario(db, funcionario_id)
    hoje = date.today()
    periodos = []
    for row in rows:
        outros = [p for p in rows if p["id"] != row["id"]]
        calculado = _calcular_periodo(db, row, outros, blocos_funcionario, hoje=hoje)
        if calculado["concluido"] and not incluir_concluidos:
            continue
        periodos.append(calculado)
    return jsonify(ok=True, periodos=periodos)


@ferias_bp.route("/periodos", methods=["POST"])
@login_required
def criar_periodo():
    """Cria um período aquisitivo. Body: funcionario_id, inicio, fim,
    dias_direito (opcional, padrão 30). Só master."""
    erro = _exigir_master()
    if erro:
        return erro

    dados = request.get_json(silent=True) or {}
    db = get_db()

    funcionario_id = _validar_inteiro(dados.get("funcionario_id"), 1, ID_MAX)
    funcionario = _buscar_funcionario(db, funcionario_id) if funcionario_id is not None else None
    if funcionario is None:
        return jsonify(ok=False, erro=ERRO_NAO_ENCONTRADO), 404
    if not funcionario["ativo"]:
        return jsonify(ok=False, erro=ERRO_FUNCIONARIO_INATIVO), 400

    inicio = _validar_data(dados.get("inicio"))
    if not inicio:
        return jsonify(ok=False, erro=ERRO_DATA_INICIAL), 400
    fim = _validar_data(dados.get("fim"))
    if not fim:
        return jsonify(ok=False, erro=ERRO_DATA_FINAL), 400
    if fim < inicio:
        return jsonify(ok=False, erro=ERRO_ORDEM_DATAS), 400

    bruto = dados.get("dias_direito")
    if bruto is None or bruto == "":
        dias_direito = DIAS_DIREITO_PADRAO
    else:
        dias_direito = _validar_inteiro(bruto, 0, DIAS_MAX)
        if dias_direito is None:
            return jsonify(ok=False, erro=ERRO_DIAS_DIREITO), 400

    cur = db.execute(
        "INSERT INTO ferias_periodos "
        "(funcionario_id, inicio, fim, dias_direito, abono_dias, observacoes, "
        "criado_por_id, criado_por_nome) "
        "VALUES (?, ?, ?, ?, 0, NULL, ?, ?)",
        (funcionario_id, inicio, fim, dias_direito, current_user.id, current_user.nome),
    )
    db.commit()

    row = _buscar_periodo(db, cur.lastrowid)
    return jsonify(ok=True, periodo=_calcular_periodo(db, row)), 201


@ferias_bp.route("/periodos/<int:periodo_id>", methods=["PATCH"])
@login_required
def atualizar_periodo(periodo_id):
    """Atualização parcial: inicio, fim, dias_direito, abono_dias, observacoes.
    Campos desconhecidos são ignorados. Só master."""
    erro = _exigir_master()
    if erro:
        return erro

    db = get_db()
    atual = _buscar_periodo(db, periodo_id)
    if atual is None:
        return jsonify(ok=False, erro=ERRO_PERIODO_NAO_ENCONTRADO), 404

    dados = request.get_json(silent=True) or {}
    colunas = []
    valores = []
    inicio_final = atual["inicio"]
    fim_final = atual["fim"]

    if "inicio" in dados:
        inicio = _validar_data(dados.get("inicio"))
        if not inicio:
            return jsonify(ok=False, erro=ERRO_DATA_INICIAL), 400
        colunas.append("inicio = ?")
        valores.append(inicio)
        inicio_final = inicio

    if "fim" in dados:
        fim = _validar_data(dados.get("fim"))
        if not fim:
            return jsonify(ok=False, erro=ERRO_DATA_FINAL), 400
        colunas.append("fim = ?")
        valores.append(fim)
        fim_final = fim

    if ("inicio" in dados or "fim" in dados) and fim_final < inicio_final:
        return jsonify(ok=False, erro=ERRO_ORDEM_DATAS), 400

    if "dias_direito" in dados:
        dias_direito = _validar_inteiro(dados.get("dias_direito"), 0, DIAS_MAX)
        if dias_direito is None:
            return jsonify(ok=False, erro=ERRO_DIAS_DIREITO), 400
        colunas.append("dias_direito = ?")
        valores.append(dias_direito)

    if "abono_dias" in dados:
        abono_dias = _validar_inteiro(dados.get("abono_dias"), 0, DIAS_MAX)
        if abono_dias is None:
            return jsonify(ok=False, erro=ERRO_ABONO), 400
        colunas.append("abono_dias = ?")
        valores.append(abono_dias)

    if "observacoes" in dados:
        observacoes = dados.get("observacoes")
        if observacoes is None:
            observacoes_final = None
        elif isinstance(observacoes, str):
            if len(observacoes) > OBSERVACOES_MAX_CHARS:
                return jsonify(ok=False, erro=ERRO_OBSERVACOES_LONGAS), 400
            observacoes_final = observacoes.strip() or None
        else:
            return jsonify(ok=False, erro=ERRO_OBSERVACOES), 400
        colunas.append("observacoes = ?")
        valores.append(observacoes_final)

    if not colunas:
        return jsonify(ok=False, erro=ERRO_SEM_CAMPOS), 400

    colunas.append("atualizado_em = CURRENT_TIMESTAMP")
    valores.append(periodo_id)
    db.execute(
        "UPDATE ferias_periodos SET " + ", ".join(colunas)
        + " WHERE id = ? AND excluido_em IS NULL",
        valores,
    )
    db.commit()

    row = _buscar_periodo(db, periodo_id)
    return jsonify(ok=True, periodo=_calcular_periodo(db, row))


@ferias_bp.route("/periodos/<int:periodo_id>/excluir", methods=["POST"])
@login_required
def excluir_periodo(periodo_id):
    """Exclusão lógica do período; recusada se houver bloco vigente. Só master."""
    erro = _exigir_master()
    if erro:
        return erro

    db = get_db()
    if _buscar_periodo(db, periodo_id) is None:
        return jsonify(ok=False, erro=ERRO_PERIODO_NAO_ENCONTRADO), 404
    if _blocos_ativos(db, periodo_id):
        return jsonify(ok=False, erro=ERRO_EXCLUIR_COM_BLOCOS), 400

    db.execute(
        "UPDATE ferias_periodos "
        "SET excluido_por_id = ?, excluido_por_nome = ?, excluido_em = CURRENT_TIMESTAMP "
        "WHERE id = ? AND excluido_em IS NULL",
        (current_user.id, current_user.nome, periodo_id),
    )
    db.commit()
    return jsonify(ok=True)


@ferias_bp.route("/periodos/<int:periodo_id>", methods=["GET"])
@login_required
def obter_periodo(periodo_id):
    """Painel completo de um período (blocos, saldo, avisos). Só master.
    Convive com o PATCH do mesmo caminho e com o GET /periodos da listagem."""
    erro = _exigir_master()
    if erro:
        return erro

    db = get_db()
    if _buscar_periodo(db, periodo_id) is None:
        return jsonify(ok=False, erro=ERRO_PERIODO_NAO_ENCONTRADO), 404
    return _responder_periodo(db, periodo_id)


# ---------------------------------------------------------------------------
# Rotas: blocos de férias
# ---------------------------------------------------------------------------

@ferias_bp.route("/blocos", methods=["POST"])
@login_required
def criar_bloco():
    """Cria um bloco de gozo. Body: periodo_id, inicio, fim. Só master.
    Responde com o período recalculado (201)."""
    erro = _exigir_master()
    if erro:
        return erro

    dados = request.get_json(silent=True) or {}
    db = get_db()

    periodo_id = _validar_inteiro(dados.get("periodo_id"), 1, ID_MAX)
    periodo = _buscar_periodo(db, periodo_id) if periodo_id is not None else None
    if periodo is None:
        return jsonify(ok=False, erro=ERRO_PERIODO_NAO_ENCONTRADO), 404

    funcionario = _buscar_funcionario(db, periodo["funcionario_id"])
    if funcionario is None or not funcionario["ativo"]:
        return jsonify(ok=False, erro=ERRO_FUNCIONARIO_INATIVO), 400

    inicio = _validar_data(dados.get("inicio"))
    if not inicio:
        return jsonify(ok=False, erro=ERRO_DATA_INICIAL), 400
    fim = _validar_data(dados.get("fim"))
    if not fim:
        return jsonify(ok=False, erro=ERRO_DATA_FINAL), 400
    if fim < inicio:
        return jsonify(ok=False, erro=ERRO_ORDEM_DATAS), 400

    notificar_ids = _validar_notificar_ids(dados)
    if notificar_ids is False:
        return jsonify(ok=False, erro=ERRO_NOTIFICAR_IDS), 400

    cur = db.execute(
        "INSERT INTO ferias_blocos "
        "(periodo_id, inicio, fim, criado_por_id, criado_por_nome) "
        "VALUES (?, ?, ?, ?, ?)",
        (periodo_id, inicio, fim, current_user.id, current_user.nome),
    )
    bloco_id = cur.lastrowid
    previa = "Férias de %s: %s a %s" % (
        funcionario["nome"],
        _formatar_br(date.fromisoformat(inicio)),
        _formatar_br(date.fromisoformat(fim)),
    )
    notificados = _notificar(db, "ferias_bloco", bloco_id, previa, notificar_ids)
    db.commit()
    return _responder_periodo(db, periodo_id, 201, extra={"notificados": notificados})


@ferias_bp.route("/blocos/<int:bloco_id>", methods=["PATCH"])
@login_required
def atualizar_bloco(bloco_id):
    """Atualização parcial de inicio e fim do bloco (a tabela não tem
    atualizado_em). Só master. Responde com o período recalculado."""
    erro = _exigir_master()
    if erro:
        return erro

    db = get_db()
    bloco = _buscar_bloco(db, bloco_id)
    if bloco is None:
        return jsonify(ok=False, erro=ERRO_BLOCO_NAO_ENCONTRADO), 404

    dados = request.get_json(silent=True) or {}
    colunas = []
    valores = []
    inicio_final = bloco["inicio"]
    fim_final = bloco["fim"]

    if "inicio" in dados:
        inicio = _validar_data(dados.get("inicio"))
        if not inicio:
            return jsonify(ok=False, erro=ERRO_DATA_INICIAL), 400
        colunas.append("inicio = ?")
        valores.append(inicio)
        inicio_final = inicio

    if "fim" in dados:
        fim = _validar_data(dados.get("fim"))
        if not fim:
            return jsonify(ok=False, erro=ERRO_DATA_FINAL), 400
        colunas.append("fim = ?")
        valores.append(fim)
        fim_final = fim

    if not colunas:
        return jsonify(ok=False, erro=ERRO_SEM_CAMPOS), 400
    if fim_final < inicio_final:
        return jsonify(ok=False, erro=ERRO_ORDEM_DATAS), 400

    valores.append(bloco_id)
    db.execute(
        "UPDATE ferias_blocos SET " + ", ".join(colunas)
        + " WHERE id = ? AND excluido_em IS NULL",
        valores,
    )
    db.commit()
    return _responder_periodo(db, bloco["periodo_id"])


@ferias_bp.route("/blocos/<int:bloco_id>/excluir", methods=["POST"])
@login_required
def excluir_bloco(bloco_id):
    """Exclusão lógica do bloco. Só master. Responde com o período recalculado."""
    erro = _exigir_master()
    if erro:
        return erro

    db = get_db()
    bloco = _buscar_bloco(db, bloco_id)
    if bloco is None:
        return jsonify(ok=False, erro=ERRO_BLOCO_NAO_ENCONTRADO), 404

    db.execute(
        "UPDATE ferias_blocos "
        "SET excluido_por_id = ?, excluido_por_nome = ?, excluido_em = CURRENT_TIMESTAMP "
        "WHERE id = ? AND excluido_em IS NULL",
        (current_user.id, current_user.nome, bloco_id),
    )
    db.commit()
    return _responder_periodo(db, bloco["periodo_id"])


# ---------------------------------------------------------------------------
# Rotas: calendário (todos os perfis autenticados)
# ---------------------------------------------------------------------------

@ferias_bp.route("/calendario", methods=["GET"])
@login_required
def calendario_blocos():
    """Blocos de férias vigentes de todos os funcionários, para as barras do
    /calendario. Aberto aos três perfis (só login; sem checagem de master).
    Inativos incluídos: férias passadas de ex-colaboradores seguem no
    histórico. Devolve apenas funcionario_id, nome, cor, inicio e fim (nunca
    saldo, abono, observações, período ou ids de bloco). Sem parâmetros de
    query: o cliente faz uma carga única."""
    rows = get_db().execute(
        "SELECT b.inicio, b.fim, f.id AS funcionario_id, f.nome, f.cor "
        "FROM ferias_blocos b "
        "JOIN ferias_periodos p ON p.id = b.periodo_id "
        "JOIN ferias_funcionarios f ON f.id = p.funcionario_id "
        "WHERE b.excluido_em IS NULL AND p.excluido_em IS NULL "
        "ORDER BY b.inicio, f.nome COLLATE NOCASE"
    ).fetchall()
    blocos = [
        {
            "funcionario_id": r["funcionario_id"],
            "nome": r["nome"],
            "cor": r["cor"],
            "inicio": r["inicio"],
            "fim": r["fim"],
        }
        for r in rows
    ]
    return jsonify(ok=True, pode_gerir=(current_user.perfil == "master"), blocos=blocos)


# ---------------------------------------------------------------------------
# Rotas: vencimentos do período concessivo (master)
# ---------------------------------------------------------------------------

@ferias_bp.route("/vencimentos", methods=["GET"])
@login_required
def listar_vencimentos():
    """Períodos vigentes de funcionários ativos cujo vencimento está próximo
    (até ANTECEDENCIA_ALERTA_DIAS) ou já passou, ordenados pela data-limite de
    início. Só master. Sem observações nem blocos na resposta."""
    erro = _exigir_master()
    if erro:
        return erro

    db = get_db()
    hoje = date.today()
    rows = db.execute(
        "SELECT p.*, f.nome AS funcionario_nome, f.cor AS funcionario_cor "
        "FROM ferias_periodos p "
        "JOIN ferias_funcionarios f ON f.id = p.funcionario_id "
        "WHERE p.excluido_em IS NULL AND f.ativo = 1"
    ).fetchall()

    itens = []
    for row in rows:
        calculado = _calcular_periodo(db, row, hoje=hoje)
        vencimento = calculado["vencimento"]
        if vencimento is None or vencimento["situacao"] not in ("proximo", "vencido"):
            continue
        itens.append({
            "funcionario_id": row["funcionario_id"],
            "funcionario_nome": row["funcionario_nome"],
            "funcionario_cor": row["funcionario_cor"],
            "periodo_id": row["id"],
            "inicio": row["inicio"],
            "fim": row["fim"],
            "saldo": calculado["saldo"],
            "fim_concessivo": vencimento["fim_concessivo"],
            "limite_inicio": vencimento["limite_inicio"],
            "dias_para_limite": vencimento["dias_para_limite"],
            "situacao": vencimento["situacao"],
            "mensagem": vencimento["mensagem"],
        })
    itens.sort(key=lambda item: (item["limite_inicio"], (item["funcionario_nome"] or "").casefold()))

    return jsonify(
        ok=True,
        hoje=hoje.isoformat(),
        antecedencia_dias=ANTECEDENCIA_ALERTA_DIAS,
        vencimentos=itens,
    )


# ---------------------------------------------------------------------------
# Categorias de eventos (fase 2): acesso a dados
# ---------------------------------------------------------------------------

def _buscar_categoria(db, categoria_id):
    """Linha da categoria por id (ativa ou inativa), ou None."""
    return db.execute(
        "SELECT * FROM ferias_categorias WHERE id = ?",
        (categoria_id,),
    ).fetchone()


def _serializar_categoria(row):
    """Formato devolvido ao frontend (sem timestamps nem autoria)."""
    return {
        "id": row["id"],
        "nome": row["nome"],
        "ordem": row["ordem"],
        "ativo": bool(row["ativo"]),
    }


def _categoria_duplicada(db, nome, ignorar_id=None):
    """True se já existe categoria (ativa ou inativa) com o mesmo nome,
    ignorando caixa e acentos maiúsculos (casefold em Python, como
    _nome_duplicado). ignorar_id exclui o próprio registro na edição."""
    alvo = nome.casefold()
    rows = db.execute("SELECT id, nome FROM ferias_categorias").fetchall()
    for row in rows:
        if ignorar_id is not None and row["id"] == ignorar_id:
            continue
        if (row["nome"] or "").casefold() == alvo:
            return True
    return False


def _proxima_ordem(db):
    """Próxima posição livre: maior ordem cadastrada + 1 (1 na primeira)."""
    return db.execute(
        "SELECT COALESCE(MAX(ordem), 0) + 1 FROM ferias_categorias"
    ).fetchone()[0]


def _ordem_ausente(valor):
    """True quando o campo ordem não veio ou veio vazio (None ou '')."""
    return valor is None or (isinstance(valor, str) and valor.strip() == "")


# ---------------------------------------------------------------------------
# Rotas: categorias de eventos (master; aba de Configurações e aba Eventos)
# ---------------------------------------------------------------------------

@ferias_bp.route("/categorias", methods=["GET"])
@login_required
def listar_categorias():
    """Lista as categorias ativas; com ?incluir_inativas=1, todas. Só master."""
    erro = _exigir_master()
    if erro:
        return erro

    incluir_inativas = request.args.get("incluir_inativas") == "1"
    sql = "SELECT * FROM ferias_categorias"
    if not incluir_inativas:
        sql += " WHERE ativo = 1"
    sql += " ORDER BY ordem, nome COLLATE NOCASE"

    rows = get_db().execute(sql).fetchall()
    return jsonify(ok=True, categorias=[_serializar_categoria(r) for r in rows])


@ferias_bp.route("/categorias", methods=["POST"])
@login_required
def criar_categoria():
    """Cria uma categoria. Body: nome (obrigatório), ordem (opcional; ausente
    = próxima posição livre). Só master."""
    erro = _exigir_master()
    if erro:
        return erro

    dados = request.get_json(silent=True) or {}

    nome = _normalizar_nome(dados.get("nome"))
    if not nome:
        return jsonify(ok=False, erro=ERRO_CATEGORIA_NOME_VAZIO), 400
    if len(nome) > CATEGORIA_NOME_MAX_CHARS:
        return jsonify(ok=False, erro=ERRO_CATEGORIA_NOME_LONGO), 400

    db = get_db()
    bruto = dados.get("ordem")
    if _ordem_ausente(bruto):
        ordem = _proxima_ordem(db)
    else:
        ordem = _validar_inteiro(bruto, 0, ORDEM_MAX)
        if ordem is None:
            return jsonify(ok=False, erro=ERRO_CATEGORIA_ORDEM), 400

    if _categoria_duplicada(db, nome):
        return jsonify(ok=False, erro=ERRO_CATEGORIA_DUPLICADA), 409

    cur = db.execute(
        "INSERT INTO ferias_categorias "
        "(nome, ordem, criado_por_id, criado_por_nome) "
        "VALUES (?, ?, ?, ?)",
        (nome, ordem, current_user.id, current_user.nome),
    )
    db.commit()

    row = _buscar_categoria(db, cur.lastrowid)
    return jsonify(ok=True, categoria=_serializar_categoria(row)), 201


@ferias_bp.route("/categorias/<int:categoria_id>", methods=["PATCH"])
@login_required
def atualizar_categoria(categoria_id):
    """Atualização parcial: nome, ordem, ativo. Categoria nunca é apagada
    (só inativada). Só master."""
    erro = _exigir_master()
    if erro:
        return erro

    db = get_db()
    if _buscar_categoria(db, categoria_id) is None:
        return jsonify(ok=False, erro=ERRO_CATEGORIA_NAO_ENCONTRADA), 404

    dados = request.get_json(silent=True) or {}
    colunas = []
    valores = []

    if "nome" in dados:
        nome = _normalizar_nome(dados.get("nome"))
        if not nome:
            return jsonify(ok=False, erro=ERRO_CATEGORIA_NOME_VAZIO), 400
        if len(nome) > CATEGORIA_NOME_MAX_CHARS:
            return jsonify(ok=False, erro=ERRO_CATEGORIA_NOME_LONGO), 400
        if _categoria_duplicada(db, nome, ignorar_id=categoria_id):
            return jsonify(ok=False, erro=ERRO_CATEGORIA_DUPLICADA), 409
        colunas.append("nome = ?")
        valores.append(nome)

    if "ordem" in dados:
        ordem = _validar_inteiro(dados.get("ordem"), 0, ORDEM_MAX)
        if ordem is None:
            return jsonify(ok=False, erro=ERRO_CATEGORIA_ORDEM), 400
        colunas.append("ordem = ?")
        valores.append(ordem)

    if "ativo" in dados:
        ativo = _validar_ativo(dados.get("ativo"))
        if ativo is None:
            return jsonify(ok=False, erro=ERRO_ATIVO), 400
        colunas.append("ativo = ?")
        valores.append(ativo)

    if not colunas:
        return jsonify(ok=False, erro=ERRO_SEM_CAMPOS), 400

    colunas.append("atualizado_em = CURRENT_TIMESTAMP")
    valores.append(categoria_id)
    db.execute(
        "UPDATE ferias_categorias SET " + ", ".join(colunas) + " WHERE id = ?",
        valores,
    )
    db.commit()

    row = _buscar_categoria(db, categoria_id)
    return jsonify(ok=True, categoria=_serializar_categoria(row))


# ---------------------------------------------------------------------------
# Eventos funcionais (fase 2): acesso a dados
# ---------------------------------------------------------------------------

# Leitura sempre com a categoria junto (nome e se ainda está ativa), para a
# tabela marcar "(inativa)" sem uma segunda consulta.
_SQL_EVENTO = (
    "SELECT e.*, c.nome AS categoria_nome, c.ativo AS categoria_ativa "
    "FROM ferias_eventos e "
    "JOIN ferias_categorias c ON c.id = e.categoria_id "
)


def _buscar_evento(db, evento_id):
    """Linha do evento vigente (não excluído) por id, ou None."""
    return db.execute(
        "SELECT * FROM ferias_eventos WHERE id = ? AND excluido_em IS NULL",
        (evento_id,),
    ).fetchone()


def _buscar_evento_completo(db, evento_id):
    """Evento vigente com os dados da categoria (JOIN), ou None."""
    return db.execute(
        _SQL_EVENTO + "WHERE e.id = ? AND e.excluido_em IS NULL",
        (evento_id,),
    ).fetchone()


def _eventos_do_funcionario(db, funcionario_id):
    """Eventos vigentes do funcionário, do mais recente para o mais antigo."""
    return db.execute(
        _SQL_EVENTO + "WHERE e.funcionario_id = ? AND e.excluido_em IS NULL "
        "ORDER BY e.data DESC, e.id DESC",
        (funcionario_id,),
    ).fetchall()


def _serializar_evento(row):
    """Formato devolvido ao frontend (linha do JOIN de _SQL_EVENTO)."""
    return {
        "id": row["id"],
        "funcionario_id": row["funcionario_id"],
        "categoria_id": row["categoria_id"],
        "categoria_nome": row["categoria_nome"],
        "categoria_ativa": bool(row["categoria_ativa"]),
        "data": row["data"],
        "ocorrencia": row["ocorrencia"],
        "criado_por_nome": row["criado_por_nome"],
        "criado_em": _iso_utc(row["criado_em"]),
    }


def _responder_evento(db, evento_id, status=200, extra=None):
    """Relê o evento com o JOIN e devolve jsonify(ok=True, evento=...).
    extra: dict opcional mesclado na resposta (ex.: notificados no POST)."""
    row = _buscar_evento_completo(db, evento_id)
    if row is None:
        return jsonify(ok=False, erro=ERRO_EVENTO_NAO_ENCONTRADO), 404
    corpo = {"ok": True, "evento": _serializar_evento(row)}
    if extra:
        corpo.update(extra)
    return jsonify(corpo), status


def _categoria_para_evento(db, valor):
    """Categoria apta a receber um evento novo ou uma troca: existe e está
    ativa. Devolve (row, None) ou (None, resposta de erro pronta)."""
    categoria_id = _validar_inteiro(valor, 1, ID_MAX)
    row = _buscar_categoria(db, categoria_id) if categoria_id is not None else None
    if row is None:
        return None, (jsonify(ok=False, erro=ERRO_CATEGORIA_NAO_ENCONTRADA), 404)
    if not row["ativo"]:
        return None, (jsonify(ok=False, erro=ERRO_CATEGORIA_INATIVA), 400)
    return row, None


def _validar_ocorrencia(valor):
    """(texto sem espaços nas pontas, None) ou (None, mensagem de erro).
    Quebras de linha internas são preservadas."""
    if not isinstance(valor, str):
        return None, ERRO_OCORRENCIA_VAZIA
    texto = valor.strip()
    if not texto:
        return None, ERRO_OCORRENCIA_VAZIA
    if len(texto) > OCORRENCIA_MAX_CHARS:
        return None, ERRO_OCORRENCIA_TAMANHO
    return texto, None


# ---------------------------------------------------------------------------
# Rotas: eventos funcionais (master; aba Outros Eventos)
# ---------------------------------------------------------------------------

@ferias_bp.route("/eventos", methods=["GET"])
@login_required
def listar_eventos():
    """Eventos vigentes de um funcionário (?funcionario_id=, obrigatório), do
    mais recente para o mais antigo. Funcionário inativo pode ser consultado
    (histórico). Só master."""
    erro = _exigir_master()
    if erro:
        return erro

    funcionario_id = _validar_inteiro(request.args.get("funcionario_id"), 1, ID_MAX)
    if funcionario_id is None:
        return jsonify(ok=False, erro=ERRO_INFORME_FUNCIONARIO), 400

    db = get_db()
    if _buscar_funcionario(db, funcionario_id) is None:
        return jsonify(ok=False, erro=ERRO_NAO_ENCONTRADO), 404

    rows = _eventos_do_funcionario(db, funcionario_id)
    return jsonify(ok=True, eventos=[_serializar_evento(r) for r in rows])


@ferias_bp.route("/eventos", methods=["POST"])
@login_required
def criar_evento():
    """Registra um evento funcional. Body: funcionario_id, categoria_id, data,
    ocorrencia. Só master."""
    erro = _exigir_master()
    if erro:
        return erro

    dados = request.get_json(silent=True) or {}
    db = get_db()

    funcionario_id = _validar_inteiro(dados.get("funcionario_id"), 1, ID_MAX)
    funcionario = _buscar_funcionario(db, funcionario_id) if funcionario_id is not None else None
    if funcionario is None:
        return jsonify(ok=False, erro=ERRO_NAO_ENCONTRADO), 404
    if not funcionario["ativo"]:
        return jsonify(ok=False, erro=ERRO_FUNCIONARIO_INATIVO), 400

    categoria, resposta = _categoria_para_evento(db, dados.get("categoria_id"))
    if resposta:
        return resposta

    data = _validar_data(dados.get("data"))
    if not data:
        return jsonify(ok=False, erro=ERRO_DATA_EVENTO), 400

    ocorrencia, mensagem = _validar_ocorrencia(dados.get("ocorrencia"))
    if mensagem:
        return jsonify(ok=False, erro=mensagem), 400

    notificar_ids = _validar_notificar_ids(dados)
    if notificar_ids is False:
        return jsonify(ok=False, erro=ERRO_NOTIFICAR_IDS), 400

    cur = db.execute(
        "INSERT INTO ferias_eventos "
        "(funcionario_id, categoria_id, data, ocorrencia, criado_por_id, criado_por_nome) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (funcionario_id, categoria["id"], data, ocorrencia, current_user.id, current_user.nome),
    )
    evento_id = cur.lastrowid
    previa = _previa_evento(funcionario["nome"], data, categoria["nome"], ocorrencia)
    notificados = _notificar(db, "ferias_evento", evento_id, previa, notificar_ids)
    db.commit()
    return _responder_evento(db, evento_id, 201, extra={"notificados": notificados})


@ferias_bp.route("/eventos/<int:evento_id>", methods=["PATCH"])
@login_required
def atualizar_evento(evento_id):
    """Atualização parcial: categoria_id, data, ocorrencia. A categoria só
    precisa estar ativa quando é trocada; manter a atual (mesmo inativa) é
    aceito. Campos desconhecidos são ignorados. Só master."""
    erro = _exigir_master()
    if erro:
        return erro

    db = get_db()
    atual = _buscar_evento(db, evento_id)
    if atual is None:
        return jsonify(ok=False, erro=ERRO_EVENTO_NAO_ENCONTRADO), 404

    dados = request.get_json(silent=True) or {}
    colunas = []
    valores = []

    if "categoria_id" in dados:
        categoria_id = _validar_inteiro(dados.get("categoria_id"), 1, ID_MAX)
        if categoria_id != atual["categoria_id"]:
            categoria, resposta = _categoria_para_evento(db, categoria_id)
            if resposta:
                return resposta
            categoria_id = categoria["id"]
        colunas.append("categoria_id = ?")
        valores.append(categoria_id)

    if "data" in dados:
        data = _validar_data(dados.get("data"))
        if not data:
            return jsonify(ok=False, erro=ERRO_DATA_EVENTO), 400
        colunas.append("data = ?")
        valores.append(data)

    if "ocorrencia" in dados:
        ocorrencia, mensagem = _validar_ocorrencia(dados.get("ocorrencia"))
        if mensagem:
            return jsonify(ok=False, erro=mensagem), 400
        colunas.append("ocorrencia = ?")
        valores.append(ocorrencia)

    if not colunas:
        return jsonify(ok=False, erro=ERRO_SEM_CAMPOS), 400

    colunas.append("atualizado_em = CURRENT_TIMESTAMP")
    valores.append(evento_id)
    db.execute(
        "UPDATE ferias_eventos SET " + ", ".join(colunas)
        + " WHERE id = ? AND excluido_em IS NULL",
        valores,
    )
    db.commit()
    return _responder_evento(db, evento_id)


@ferias_bp.route("/eventos/<int:evento_id>/excluir", methods=["POST"])
@login_required
def excluir_evento(evento_id):
    """Exclusão lógica do evento (quem e quando ficam na linha). Só master."""
    erro = _exigir_master()
    if erro:
        return erro

    db = get_db()
    if _buscar_evento(db, evento_id) is None:
        return jsonify(ok=False, erro=ERRO_EVENTO_NAO_ENCONTRADO), 404

    db.execute(
        "UPDATE ferias_eventos "
        "SET excluido_por_id = ?, excluido_por_nome = ?, excluido_em = CURRENT_TIMESTAMP "
        "WHERE id = ? AND excluido_em IS NULL",
        (current_user.id, current_user.nome, evento_id),
    )
    db.commit()
    return jsonify(ok=True)


# ---------------------------------------------------------------------------
# Visão geral (fase 2): linha do tempo por ano
# ---------------------------------------------------------------------------

# Desempate no mesmo dia: bloco antes de período, antes de evento, antes de
# admissão (menor valor primeiro).
_PRIORIDADE_TIPO = {"bloco": 0, "periodo": 1, "evento": 2, "admissao": 3}


def _br(iso):
    """'YYYY-MM-DD' para 'dd/mm/aaaa'."""
    return _formatar_br(date.fromisoformat(iso))


def _item_periodo(calc):
    """Item da linha do tempo para um período já calculado por _calcular_periodo."""
    return {
        "tipo": "periodo",
        "data": calc["inicio"],
        "id": calc["id"],
        "titulo": "Período aquisitivo %s a %s" % (_br(calc["inicio"]), _br(calc["fim"])),
        "detalhe": "Direito %d · Abono %d · Gozados %d · Saldo %d" % (
            calc["dias_direito"], calc["abono_dias"], calc["dias_gozados"], calc["saldo"],
        ),
        "status": "Concluído" if calc["concluido"] else "Aberto",
        "periodo_id": calc["id"],
        "observacoes": calc["observacoes"],
        "vencimento": calc["vencimento"],
        "avisos": calc["avisos"],
    }


def _item_bloco(bloco, calc):
    """Item da linha do tempo para um bloco de férias do período calc."""
    return {
        "tipo": "bloco",
        "data": bloco["inicio"],
        "id": bloco["id"],
        "titulo": "Férias %s a %s" % (_br(bloco["inicio"]), _br(bloco["fim"])),
        "detalhe": "%s · período %s a %s" % (
            _texto_dias(bloco["dias"]), _br(calc["inicio"]), _br(calc["fim"]),
        ),
        "periodo_id": calc["id"],
        "dias": bloco["dias"],
    }


def _item_evento(evento):
    """Item da linha do tempo para um evento já serializado."""
    return {
        "tipo": "evento",
        "data": evento["data"],
        "id": evento["id"],
        "titulo": evento["categoria_nome"] + ("" if evento["categoria_ativa"] else " (inativa)"),
        "detalhe": evento["ocorrencia"],
        "evento_id": evento["id"],
        "criado_por_nome": evento["criado_por_nome"],
    }


def _agrupar_por_ano(itens):
    """Lista plana já ordenada (data decrescente) em blocos por ano, na mesma
    ordem: [{"ano": "2026", "total": n, "itens": [...]}, ...]."""
    anos = []
    for item in itens:
        ano = item["data"][:4]
        if not anos or anos[-1]["ano"] != ano:
            anos.append({"ano": ano, "total": 0, "itens": []})
        anos[-1]["itens"].append(item)
        anos[-1]["total"] += 1
    return anos


@ferias_bp.route("/visao-geral", methods=["GET"])
@login_required
def visao_geral():
    """Resumo numérico e linha do tempo (admissão, períodos, blocos e eventos
    vigentes) de um funcionário (?funcionario_id=, obrigatório; inativo
    permitido), agrupada por ano do mais recente ao mais antigo. Só leitura.
    Só master."""
    erro = _exigir_master()
    if erro:
        return erro

    funcionario_id = _validar_inteiro(request.args.get("funcionario_id"), 1, ID_MAX)
    if funcionario_id is None:
        return jsonify(ok=False, erro=ERRO_INFORME_FUNCIONARIO), 400

    db = get_db()
    funcionario = _buscar_funcionario(db, funcionario_id)
    if funcionario is None:
        return jsonify(ok=False, erro=ERRO_NAO_ENCONTRADO), 404

    hoje = date.today()
    rows = _periodos_ativos_do_funcionario(db, funcionario_id)
    blocos_funcionario = _blocos_ativos_do_funcionario(db, funcionario_id)
    periodos = []
    for row in rows:
        outros = [p for p in rows if p["id"] != row["id"]]
        periodos.append(_calcular_periodo(db, row, outros, blocos_funcionario, hoje=hoje))
    eventos = [_serializar_evento(r) for r in _eventos_do_funcionario(db, funcionario_id)]

    itens = []
    if funcionario["data_admissao"]:
        itens.append({
            "tipo": "admissao",
            "data": funcionario["data_admissao"],
            "id": 0,
            "titulo": "Admissão",
            "detalhe": "",
        })
    for calc in periodos:
        itens.append(_item_periodo(calc))
        for bloco in calc["blocos"]:
            itens.append(_item_bloco(bloco, calc))
    for evento in eventos:
        itens.append(_item_evento(evento))
    # Data decrescente; no mesmo dia, pela prioridade do tipo; depois id decrescente.
    itens.sort(key=lambda item: (item["data"], -_PRIORIDADE_TIPO[item["tipo"]], item["id"]), reverse=True)

    abertos = [p for p in periodos if not p["concluido"]]
    contagem = {}
    for evento in eventos:
        nome = evento["categoria_nome"]
        contagem[nome] = contagem.get(nome, 0) + 1
    por_categoria = [{"categoria": nome, "total": n} for nome, n in contagem.items()]
    por_categoria.sort(key=lambda c: (-c["total"], c["categoria"].casefold()))

    resumo = {
        "periodos": len(periodos),
        "periodos_abertos": len(abertos),
        "periodos_concluidos": len(periodos) - len(abertos),
        "dias_direito_total": sum(p["dias_direito"] for p in periodos),
        "dias_abonados_total": sum(p["abono_dias"] for p in periodos),
        "dias_gozados_total": sum(p["dias_gozados"] for p in periodos),
        "saldo_total": sum(p["saldo"] for p in abertos if p["saldo"] > 0),
        "blocos": sum(p["qtd_blocos"] for p in periodos),
        "eventos": len(eventos),
        "eventos_por_categoria": por_categoria,
    }

    return jsonify(
        ok=True,
        hoje=hoje.isoformat(),
        funcionario=_serializar_funcionario(funcionario),
        resumo=resumo,
        anos=_agrupar_por_ano(itens),
    )
