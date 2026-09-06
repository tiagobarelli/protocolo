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


def _responder_periodo(db, periodo_id, status=200):
    """Relê o período e devolve o painel completo recalculado (blocos, saldo,
    avisos). Usado pelo GET de um período e por todos os endpoints de blocos."""
    row = _buscar_periodo(db, periodo_id)
    if row is None:
        return jsonify(ok=False, erro=ERRO_PERIODO_NAO_ENCONTRADO), 404
    outros = [
        p for p in _periodos_ativos_do_funcionario(db, row["funcionario_id"])
        if p["id"] != periodo_id
    ]
    hoje = date.today()
    return jsonify(ok=True, periodo=_calcular_periodo(db, row, outros, hoje=hoje)), status


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

    db.execute(
        "INSERT INTO ferias_blocos "
        "(periodo_id, inicio, fim, criado_por_id, criado_por_nome) "
        "VALUES (?, ?, ?, ?, ?)",
        (periodo_id, inicio, fim, current_user.id, current_user.nome),
    )
    db.commit()
    return _responder_periodo(db, periodo_id, 201)


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
