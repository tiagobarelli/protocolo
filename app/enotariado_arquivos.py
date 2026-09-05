# app/enotariado_arquivos.py - Blueprint do acervo de anexos dos lancamentos do e-Notariado Financeiro
#
# Mesmo modelo do escrituras_arquivos.py (disco como fonte da verdade; nomes
# legiveis; _historico.txt como trilha de auditoria local; notas por anexo em
# arquivo-irmao .nota.txt; nenhuma chamada ao Baserow). A chave e a tripla
# (ano de realizacao, numero do pedido, row_id da tabela 788):
#
#   data/enotariado_anexos/<ano>/<pedido>/<row_id>/<arquivo>
#
# row_id e o identificador imutavel do lancamento; ano e pedido sao organizacao
# legivel por humano. Os tres trafegam SEMPRE por query (GET/DELETE) ou form
# (POST), nunca como segmento de URL. O pedido e sanitizado para um nome de
# pasta seguro (so [A-Za-z0-9._-], resto vira hifen) e valores compostos apenas
# por pontos sao recusados, o que fecha o traversal por "..".
#
# Diferencas conscientes em relacao aos outros acervos: listar e baixar exigem
# master ou administrador (o modulo inteiro e restrito a esses perfis) e a linha
# do _historico.txt usa hifen como separador.
#
# Porta de vidro: o backend nao confere se row_id existe na 788 nem se ano e
# pedido batem com o registro; o frontend garante a coerencia.
import os
import re

from datetime import datetime

from flask import Blueprint, current_app, jsonify, request, send_from_directory
from flask_login import current_user, login_required
from pathlib import Path

enotariado_arquivos_bp = Blueprint("enotariado_arquivos", __name__, url_prefix="/api/enotariado-anexos")

ALLOWED_EXTENSIONS = {"pdf", "jpg", "jpeg", "png", "tif", "tiff", "doc", "docx", "odt", "txt", "md"}
HISTORICO_NOME = "_historico.txt"
NOTA_SUFIXO = ".nota.txt"
NOTA_MAX_CHARS = 1000
PEDIDO_MAX_CHARS = 64
ERRO_CHAVE = "Ano, pedido ou lançamento inválidos."

# Caracteres ilegais de filesystem a remover de nomes de arquivo
_ILEGAIS_RE = re.compile(r'[\\/:*?"<>|]')
_UNDERSCORE_RE = re.compile(r"_+")

# Chave do lancamento
_ANO_RE = re.compile(r"^\d{4}$")
_ROW_ID_RE = re.compile(r"^\d+$")
_PEDIDO_INVALIDO_RE = re.compile(r"[^A-Za-z0-9._-]")
_HIFENS_RE = re.compile(r"-+")


# ---------------------------------------------------------------------------
# Helpers copiados do molde (nomes de arquivo, extensoes, notas, listagem,
# historico, colisao)
# ---------------------------------------------------------------------------

def _sanitizar_nome(nome):
    """Reduz a basename, minusculas, espacos viram _, remove ilegais e colapsa _.

    Preserva acentos/UTF-8: a legibilidade e o objetivo do modulo.
    """
    nome = os.path.basename(nome or "")
    nome = nome.strip().lower()
    nome = nome.replace(" ", "_")
    nome = _ILEGAIS_RE.sub("", nome)
    nome = _UNDERSCORE_RE.sub("_", nome)
    nome = nome.strip("_")
    return nome


def _extensao_permitida(filename):
    """Verifica se a extensao do arquivo esta na allowlist (case-insensitive)."""
    if "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[1].lower()
    return ext in ALLOWED_EXTENSIONS


def _nome_reservado(nome):
    """True para os nomes internos do modulo (historico e notas), em qualquer caixa."""
    nome_baixo = (nome or "").lower()
    return nome_baixo == HISTORICO_NOME or nome_baixo.endswith(NOTA_SUFIXO)


def _caminho_nota(diretorio, nome):
    """Caminho do arquivo-irmao de nota do anexo (nome completo + .nota.txt)."""
    return os.path.join(diretorio, nome + NOTA_SUFIXO)


def _ler_nota(diretorio, nome):
    """Conteudo da nota do anexo; string vazia se nao existir ou ilegivel."""
    caminho = _caminho_nota(diretorio, nome)
    if not os.path.isfile(caminho):
        return ""
    try:
        with open(caminho, "r", encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def _listar_anexos(diretorio):
    """Lista arquivos reais da pasta, excluindo _historico.txt e *.nota.txt.

    Cada item: {"nome", "tamanho", "extensao", "nota"}. Pasta inexistente vira [].
    """
    if not diretorio or not os.path.isdir(diretorio):
        return []
    anexos = []
    for nome in sorted(os.listdir(diretorio)):
        if nome == HISTORICO_NOME or nome.endswith(NOTA_SUFIXO):
            continue
        caminho = os.path.join(diretorio, nome)
        if not os.path.isfile(caminho):
            continue
        ext = nome.rsplit(".", 1)[1].lower() if "." in nome else ""
        anexos.append({
            "nome": nome,
            "tamanho": os.path.getsize(caminho),
            "extensao": ext,
            "nota": _ler_nota(diretorio, nome),
        })
    return anexos


def _tem_anexos(anexos):
    """True se a lista tem ao menos um anexo real."""
    return len(anexos) >= 1


def _registrar_historico(diretorio, usuario, acao, nome_arquivo):
    """Faz append de uma linha em _historico.txt.

    Formato: YYYY-MM-DD HH:MM - {usuario} {acao}: "{nome_arquivo}"
    acao e "anexou", "excluiu", "editou nota de" ou "removeu nota de".
    Usa a data local do servidor.
    """
    carimbo = datetime.now().strftime("%Y-%m-%d %H:%M")
    linha = '{} - {} {}: "{}"\n'.format(carimbo, usuario, acao, nome_arquivo)
    caminho = os.path.join(diretorio, HISTORICO_NOME)
    with open(caminho, "a", encoding="utf-8") as f:
        f.write(linha)


def _nome_disponivel(diretorio, nome):
    """Se ja existir um arquivo com esse nome, sufixa (_2, _3...) sem sobrescrever."""
    if not os.path.exists(os.path.join(diretorio, nome)):
        return nome
    if "." in nome:
        raiz, ext = nome.rsplit(".", 1)
        ext = "." + ext
    else:
        raiz, ext = nome, ""
    i = 2
    while True:
        candidato = "{}_{}{}".format(raiz, i, ext)
        if not os.path.exists(os.path.join(diretorio, candidato)):
            return candidato
        i += 1


# ---------------------------------------------------------------------------
# Chave do lancamento: validadores e caminho da pasta
# ---------------------------------------------------------------------------

def _validar_ano(valor):
    """Ano de realizacao: exatamente 4 digitos entre 2000 e 2100. Devolve a string ou None."""
    valor = (valor or "").strip()
    if not _ANO_RE.match(valor):
        return None
    numero = int(valor)
    if numero < 2000 or numero > 2100:
        return None
    return valor


def _validar_row_id(valor):
    """row_id da tabela 788: inteiro decimal > 0, sem sinal e sem espacos. Devolve a string normalizada ou None."""
    valor = valor or ""
    if not _ROW_ID_RE.match(valor):
        return None
    numero = int(valor)
    if numero <= 0:
        return None
    return str(numero)


def _sanitizar_pedido(valor):
    """Numero do pedido como nome de pasta: mantem [A-Za-z0-9._-], o resto vira hifen,
    hifens repetidos colapsam, caixa preservada. Recusa (None) vazio, mais de
    PEDIDO_MAX_CHARS caracteres ou valor composto so por pontos (fecha o "..").
    """
    valor = (valor or "").strip()
    valor = _PEDIDO_INVALIDO_RE.sub("-", valor)
    valor = _HIFENS_RE.sub("-", valor)
    if not valor or len(valor) > PEDIDO_MAX_CHARS:
        return None
    if valor.strip(".") == "":
        return None
    return valor


def _ler_chave(origem):
    """Le ano, pedido e row_id de request.args ou request.form.

    Devolve a tupla normalizada (ano, pedido, row_id) ou None se qualquer um falhar.
    """
    ano = _validar_ano(origem.get("ano"))
    pedido = _sanitizar_pedido(origem.get("pedido"))
    row_id = _validar_row_id(origem.get("row_id"))
    if ano is None or pedido is None or row_id is None:
        return None
    return ano, pedido, row_id


def _get_lancamento_dir(ano, pedido, row_id, criar=False):
    """Monta {ENOTARIADO_FOLDER}/{ano}/{pedido}/{row_id}/ com valores ja validados e
    confirma via realpath que o caminho permanece dentro de ENOTARIADO_FOLDER.
    Retorna o caminho (str) ou None.
    """
    if not ano or not pedido or not row_id:
        return None
    base = current_app.config["ENOTARIADO_FOLDER"]
    diretorio = os.path.join(base, ano, pedido, row_id)

    # Anti path traversal: o caminho resolvido tem de ficar dentro da base
    base_real = os.path.realpath(base)
    if not os.path.realpath(diretorio).startswith(base_real + os.sep):
        return None

    if criar:
        Path(diretorio).mkdir(parents=True, exist_ok=True)
    return diretorio


# ---------------------------------------------------------------------------
# Perfis (403 JSON local; nunca @perfil_required, que redireciona com flash)
# ---------------------------------------------------------------------------

def _pode_ver():
    """Listar e baixar: master e administrador (o modulo inteiro e restrito a eles)."""
    return current_user.perfil in ("master", "administrador")


def _pode_anexar():
    """Anexar (e criar/editar/remover notas): master e administrador."""
    return current_user.perfil in ("master", "administrador")


def _pode_excluir():
    """Excluir: somente master."""
    return current_user.perfil == "master"


# ---------------------------------------------------------------------------
# Rotas
# ---------------------------------------------------------------------------

@enotariado_arquivos_bp.route("/listar", methods=["GET"])
@login_required
def listar_arquivos():
    """Lista os anexos do lancamento. Pasta inexistente vira lista vazia (nunca 404)."""
    if not _pode_ver():
        return jsonify({"erro": "Sem permissão para ver anexos."}), 403

    chave = _ler_chave(request.args)
    diretorio = _get_lancamento_dir(*chave) if chave else None
    if diretorio is None:
        return jsonify({"erro": ERRO_CHAVE}), 400

    anexos = _listar_anexos(diretorio)
    return jsonify({"arquivos": anexos, "tem_anexos": _tem_anexos(anexos)})


@enotariado_arquivos_bp.route("/upload", methods=["POST"])
@login_required
def upload_arquivo():
    """Recebe (multipart: campos 'ano', 'pedido', 'row_id' e 'arquivo') e grava um anexo legivel."""
    if not _pode_anexar():
        return jsonify({"erro": "Sem permissão para anexar arquivos."}), 403

    chave = _ler_chave(request.form)
    if chave is None or _get_lancamento_dir(*chave) is None:
        return jsonify({"erro": ERRO_CHAVE}), 400

    if "arquivo" not in request.files:
        return jsonify({"erro": "Nenhum arquivo enviado."}), 400

    arquivo = request.files["arquivo"]
    if not arquivo.filename:
        return jsonify({"erro": "Nome de arquivo vazio."}), 400

    # Nomes reservados do modulo nao podem virar anexo: checados no nome recebido
    # (antes da sanitizacao, que removeria o "_" inicial de _historico.txt) e no
    # nome final. Um "*.nota.txt" ficaria invisivel na listagem e passaria por
    # nota de outro arquivo.
    if _nome_reservado(os.path.basename(arquivo.filename)):
        return jsonify({"erro": "Nome de arquivo inválido."}), 400

    if not _extensao_permitida(arquivo.filename):
        return jsonify({"erro": "Extensão de arquivo não permitida."}), 400

    conteudo = arquivo.read()
    max_size = current_app.config.get("MAX_UPLOAD_SIZE_ENOTARIADO", 100 * 1024 * 1024)
    if len(conteudo) > max_size:
        return jsonify({"erro": "Arquivo excede o tamanho máximo de 100 MB."}), 400

    nome = _sanitizar_nome(arquivo.filename)
    if not nome or "." not in nome:
        return jsonify({"erro": "Nome de arquivo inválido."}), 400
    if _nome_reservado(nome):
        return jsonify({"erro": "Nome de arquivo inválido."}), 400

    # Cria a pasta apenas agora, quando ha um anexo valido para gravar
    diretorio = _get_lancamento_dir(chave[0], chave[1], chave[2], criar=True)
    if diretorio is None:
        return jsonify({"erro": ERRO_CHAVE}), 400

    nome = _nome_disponivel(diretorio, nome)
    caminho = os.path.join(diretorio, nome)

    # Confirmacao final anti path traversal sobre o caminho do arquivo
    base_real = os.path.realpath(current_app.config["ENOTARIADO_FOLDER"])
    if not os.path.realpath(caminho).startswith(base_real + os.sep):
        return jsonify({"erro": "Caminho inválido."}), 400

    with open(caminho, "wb") as f:
        f.write(conteudo)

    _registrar_historico(diretorio, current_user.nome, "anexou", nome)

    anexos = _listar_anexos(diretorio)
    ext = nome.rsplit(".", 1)[1].lower() if "." in nome else ""
    return jsonify({
        "arquivos": anexos,
        "tem_anexos": _tem_anexos(anexos),
        "arquivo": {
            "nome": nome,
            "tamanho": len(conteudo),
            "extensao": ext,
            "nota": "",
        },
    }), 201


@enotariado_arquivos_bp.route("/download", methods=["GET"])
@login_required
def download_arquivo():
    """Faz o download de um anexo. Nome reservado vira 400; inexistente vira 404 amigavel."""
    if not _pode_ver():
        return jsonify({"erro": "Sem permissão para ver anexos."}), 403

    chave = _ler_chave(request.args)
    diretorio = _get_lancamento_dir(*chave) if chave else None
    if diretorio is None:
        return jsonify({"erro": ERRO_CHAVE}), 400

    nome = os.path.basename(request.args.get("nome") or "")
    if not nome or _nome_reservado(nome):
        return jsonify({"erro": "Nome de arquivo inválido."}), 400

    caminho = os.path.join(diretorio, nome)
    if not os.path.isfile(caminho):
        return jsonify({"erro": "Arquivo não disponível neste ambiente."}), 404

    return send_from_directory(diretorio, nome, as_attachment=True)


@enotariado_arquivos_bp.route("/excluir", methods=["DELETE"])
@login_required
def deletar_arquivo():
    """Remove um anexo e seu irmao de nota (somente master); mantem a pasta e o _historico.txt."""
    if not _pode_excluir():
        return jsonify({"erro": "Sem permissão para excluir anexos."}), 403

    chave = _ler_chave(request.args)
    diretorio = _get_lancamento_dir(*chave) if chave else None
    if diretorio is None:
        return jsonify({"erro": ERRO_CHAVE}), 400

    nome = os.path.basename(request.args.get("nome") or "")
    if not nome or _nome_reservado(nome):
        return jsonify({"erro": "Arquivo não encontrado."}), 404

    caminho = os.path.join(diretorio, nome)
    if not os.path.isfile(caminho):
        return jsonify({"erro": "Arquivo não encontrado."}), 404

    try:
        os.remove(caminho)
    except OSError:
        pass

    _registrar_historico(diretorio, current_user.nome, "excluiu", nome)

    # Remove o irmao de nota, se existir (com entrada propria no historico)
    caminho_nota = _caminho_nota(diretorio, nome)
    if os.path.isfile(caminho_nota):
        try:
            os.remove(caminho_nota)
        except OSError:
            pass
        _registrar_historico(diretorio, current_user.nome, "removeu nota de", nome)

    anexos = _listar_anexos(diretorio)
    return jsonify({"arquivos": anexos, "tem_anexos": _tem_anexos(anexos)})


@enotariado_arquivos_bp.route("/nota", methods=["POST"])
@login_required
def salvar_nota():
    """Grava/sobrescreve a nota explicativa de um anexo; texto vazio remove."""
    if not _pode_anexar():
        return jsonify({"erro": "Sem permissão para editar notas."}), 403

    chave = _ler_chave(request.form)
    diretorio = _get_lancamento_dir(*chave) if chave else None
    if diretorio is None:
        return jsonify({"erro": ERRO_CHAVE}), 400

    nome = os.path.basename(request.form.get("nome") or "")
    if not nome or _nome_reservado(nome):
        return jsonify({"erro": "Arquivo não encontrado."}), 404

    caminho = os.path.join(diretorio, nome)
    if not os.path.isfile(caminho):
        return jsonify({"erro": "Arquivo não encontrado."}), 404

    texto = (request.form.get("texto") or "").strip()
    if len(texto) > NOTA_MAX_CHARS:
        return jsonify({"erro": "A nota excede o limite de {} caracteres.".format(NOTA_MAX_CHARS)}), 400

    caminho_nota = _caminho_nota(diretorio, nome)
    if texto:
        with open(caminho_nota, "w", encoding="utf-8") as f:
            f.write(texto)
        _registrar_historico(diretorio, current_user.nome, "editou nota de", nome)
    elif os.path.isfile(caminho_nota):
        try:
            os.remove(caminho_nota)
        except OSError:
            pass
        _registrar_historico(diretorio, current_user.nome, "removeu nota de", nome)

    anexos = _listar_anexos(diretorio)
    return jsonify({"arquivos": anexos, "tem_anexos": _tem_anexos(anexos)})
