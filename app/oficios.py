# app/oficios.py — Blueprint para o acervo de arquivos dos ofícios (filesystem)
#
# Diferente de uploads.py (UUID + metadados no SQLite), aqui o disco é a fonte da
# verdade: nomes originais legíveis, estrutura de pastas por ano/número/letra e um
# _historico.txt como trilha de auditoria local. Nenhuma chamada ao Baserow.
import os
import re

from datetime import datetime

from flask import Blueprint, current_app, jsonify, request, send_from_directory
from flask_login import current_user, login_required
from pathlib import Path

oficios_bp = Blueprint("oficios", __name__, url_prefix="/api/oficios")

ALLOWED_EXTENSIONS = {"pdf", "jpg", "jpeg", "png", "tif", "tiff", "doc", "docx", "odt", "txt", "md"}
TIPOS = {"recebidos": "oficios_recebidos", "enviados": "oficios_enviados"}
HISTORICO_NOME = "_historico.txt"

# Caracteres ilegais de filesystem a remover do nome do arquivo
_ILEGAIS_RE = re.compile(r'[\\/:*?"<>|]')
_UNDERSCORE_RE = re.compile(r"_+")


def _validar_tipo(tipo):
    """Retorna o nome da subpasta (TIPOS[tipo]) ou None se inválido."""
    return TIPOS.get(tipo)


def _validar_ano(ano):
    """Aceita inteiro de 4 dígitos em faixa razoável (1900–2200); retorna str ou None."""
    try:
        ano_int = int(ano)
    except (TypeError, ValueError):
        return None
    if 1900 <= ano_int <= 2200:
        return str(ano_int)
    return None


def _validar_numero(numero):
    """Aceita inteiro positivo; retorna a string do número ou None."""
    try:
        numero_int = int(numero)
    except (TypeError, ValueError):
        return None
    if numero_int >= 1:
        return str(numero_int)
    return None


def _validar_letra(letra):
    """Aceita ^[A-Za-z]{1,3}$; retorna em MAIÚSCULAS, ou None."""
    if letra and re.match(r"^[A-Za-z]{1,3}$", letra):
        return letra.upper()
    return None


def _sanitizar_nome(nome):
    """Reduz a basename, minúsculas, espaços→_, remove ilegais e colapsa _.

    Preserva acentos/UTF-8 — a legibilidade é o objetivo do módulo.
    """
    nome = os.path.basename(nome or "")
    nome = nome.strip().lower()
    nome = nome.replace(" ", "_")
    nome = _ILEGAIS_RE.sub("", nome)
    nome = _UNDERSCORE_RE.sub("_", nome)
    nome = nome.strip("_")
    return nome


def _extensao_permitida(filename):
    """Verifica se a extensão do arquivo está na allowlist (case-insensitive)."""
    if "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[1].lower()
    return ext in ALLOWED_EXTENSIONS


def _get_oficio_dir(tipo, ano, numero, letra, criar=False):
    """Monta {OFICIOS_FOLDER}/{TIPOS[tipo]}/{ano}/{numero}_{LETRA}/.

    Valida os parâmetros e confirma (via realpath) que o caminho permanece dentro
    de OFICIOS_FOLDER. Retorna o caminho (str) ou None se inválido/escapar.
    """
    subpasta = _validar_tipo(tipo)
    ano = _validar_ano(ano)
    numero = _validar_numero(numero)
    letra = _validar_letra(letra)
    if not subpasta or not ano or not numero or not letra:
        return None

    base = current_app.config["OFICIOS_FOLDER"]
    oficio_dir = os.path.join(base, subpasta, ano, numero + "_" + letra)

    if criar:
        Path(oficio_dir).mkdir(parents=True, exist_ok=True)

    # Anti path traversal: o caminho resolvido tem de ficar dentro da base
    base_real = os.path.realpath(base)
    dir_real = os.path.realpath(oficio_dir)
    if dir_real != base_real and not dir_real.startswith(base_real + os.sep):
        return None

    return oficio_dir


def _listar_anexos(diretorio):
    """Lista arquivos reais da pasta, excluindo _historico.txt.

    Cada item: {"nome", "tamanho", "extensao"}. Pasta inexistente → [].
    """
    if not diretorio or not os.path.isdir(diretorio):
        return []
    anexos = []
    for nome in sorted(os.listdir(diretorio)):
        if nome == HISTORICO_NOME:
            continue
        caminho = os.path.join(diretorio, nome)
        if not os.path.isfile(caminho):
            continue
        ext = nome.rsplit(".", 1)[1].lower() if "." in nome else ""
        anexos.append({
            "nome": nome,
            "tamanho": os.path.getsize(caminho),
            "extensao": ext,
        })
    return anexos


def _tem_anexos(diretorio):
    """True se houver ao menos um anexo real (fora o _historico.txt)."""
    return len(_listar_anexos(diretorio)) >= 1


def _registrar_historico(diretorio, usuario, acao, nome_arquivo):
    """Faz append de uma linha em _historico.txt.

    Formato: YYYY-MM-DD HH:MM — {usuario} {acao}: "{nome_arquivo}"
    acao é "anexou" ou "removeu". Usa a data local do servidor.
    """
    carimbo = datetime.now().strftime("%Y-%m-%d %H:%M")
    linha = '{} — {} {}: "{}"\n'.format(carimbo, usuario, acao, nome_arquivo)
    caminho = os.path.join(diretorio, HISTORICO_NOME)
    with open(caminho, "a", encoding="utf-8") as f:
        f.write(linha)


def _nome_disponivel(diretorio, nome):
    """Se já existir um arquivo com esse nome, sufixa (_2, _3…) sem sobrescrever."""
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


def _pode_editar():
    """Apenas master e administrador podem enviar/excluir anexos."""
    return current_user.perfil in ("master", "administrador")


@oficios_bp.route("/<tipo>/<int:ano>/<int:numero>/<letra>/arquivos", methods=["GET"])
@login_required
def listar_arquivos(tipo, ano, numero, letra):
    """Lista os anexos de um ofício. Pasta inexistente → lista vazia (nunca 404)."""
    diretorio = _get_oficio_dir(tipo, ano, numero, letra)
    if diretorio is None:
        return jsonify({"erro": "Parâmetros inválidos."}), 400
    anexos = _listar_anexos(diretorio)
    return jsonify({"arquivos": anexos, "tem_anexos": len(anexos) >= 1})


@oficios_bp.route("/<tipo>/<int:ano>/<int:numero>/<letra>/arquivos", methods=["POST"])
@login_required
def upload_arquivo(tipo, ano, numero, letra):
    """Recebe (multipart, campo 'arquivo') e grava um anexo com nome legível."""
    if not _pode_editar():
        return jsonify({"erro": "Sem permissão para anexar arquivos."}), 403

    diretorio = _get_oficio_dir(tipo, ano, numero, letra, criar=False)
    if diretorio is None:
        return jsonify({"erro": "Parâmetros inválidos."}), 400

    if "arquivo" not in request.files:
        return jsonify({"erro": "Nenhum arquivo enviado."}), 400

    arquivo = request.files["arquivo"]
    if not arquivo.filename:
        return jsonify({"erro": "Nome de arquivo vazio."}), 400

    if not _extensao_permitida(arquivo.filename):
        return jsonify({"erro": "Extensão de arquivo não permitida."}), 400

    conteudo = arquivo.read()
    max_size = current_app.config.get("MAX_UPLOAD_SIZE", 20 * 1024 * 1024)
    if len(conteudo) > max_size:
        return jsonify({"erro": "Arquivo excede o tamanho máximo de 20 MB."}), 400

    nome = _sanitizar_nome(arquivo.filename)
    if not nome or "." not in nome:
        return jsonify({"erro": "Nome de arquivo inválido."}), 400

    # Cria a pasta apenas agora, quando há um anexo válido para gravar
    diretorio = _get_oficio_dir(tipo, ano, numero, letra, criar=True)
    if diretorio is None:
        return jsonify({"erro": "Parâmetros inválidos."}), 400

    nome = _nome_disponivel(diretorio, nome)
    caminho = os.path.join(diretorio, nome)

    # Confirmação final anti path traversal sobre o caminho do arquivo
    base_real = os.path.realpath(current_app.config["OFICIOS_FOLDER"])
    if not os.path.realpath(caminho).startswith(base_real + os.sep):
        return jsonify({"erro": "Caminho inválido."}), 400

    with open(caminho, "wb") as f:
        f.write(conteudo)

    _registrar_historico(diretorio, current_user.nome, "anexou", nome)

    anexos = _listar_anexos(diretorio)
    ext = nome.rsplit(".", 1)[1].lower() if "." in nome else ""
    return jsonify({
        "arquivos": anexos,
        "tem_anexos": len(anexos) >= 1,
        "arquivo": {
            "nome": nome,
            "tamanho": len(conteudo),
            "extensao": ext,
        },
    }), 201


@oficios_bp.route("/<tipo>/<int:ano>/<int:numero>/<letra>/arquivos/<nome>", methods=["GET"])
@login_required
def download_arquivo(tipo, ano, numero, letra, nome):
    """Faz o download de um anexo. Inexistente neste ambiente → 404 amigável."""
    diretorio = _get_oficio_dir(tipo, ano, numero, letra)
    if diretorio is None:
        return jsonify({"erro": "Parâmetros inválidos."}), 400

    nome = os.path.basename(nome or "")
    if not nome or nome == HISTORICO_NOME:
        return jsonify({"erro": "Arquivo não disponível neste ambiente."}), 404

    caminho = os.path.join(diretorio, nome)
    if not os.path.isfile(caminho):
        return jsonify({"erro": "Arquivo não disponível neste ambiente."}), 404

    return send_from_directory(diretorio, nome, as_attachment=True)


@oficios_bp.route("/<tipo>/<int:ano>/<int:numero>/<letra>/arquivos/<nome>", methods=["DELETE"])
@login_required
def deletar_arquivo(tipo, ano, numero, letra, nome):
    """Remove um anexo; mantém a pasta e o _historico.txt (trilha de auditoria)."""
    if not _pode_editar():
        return jsonify({"erro": "Sem permissão para excluir arquivos."}), 403

    diretorio = _get_oficio_dir(tipo, ano, numero, letra)
    if diretorio is None:
        return jsonify({"erro": "Parâmetros inválidos."}), 400

    nome = os.path.basename(nome or "")
    if not nome or nome == HISTORICO_NOME:
        return jsonify({"erro": "Arquivo não encontrado."}), 404

    caminho = os.path.join(diretorio, nome)
    if not os.path.isfile(caminho):
        return jsonify({"erro": "Arquivo não encontrado."}), 404

    try:
        os.remove(caminho)
    except OSError:
        pass

    _registrar_historico(diretorio, current_user.nome, "removeu", nome)

    anexos = _listar_anexos(diretorio)
    return jsonify({"arquivos": anexos, "tem_anexos": len(anexos) >= 1})
