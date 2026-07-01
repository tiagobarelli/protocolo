# app/certidoes_arquivos.py — Blueprint para o acervo de anexos das certidões (filesystem)
#
# Mesmo modelo do oficios.py (disco como fonte da verdade; nomes legíveis;
# _historico.txt como trilha de auditoria local; nenhuma chamada ao Baserow).
#
# Estrutura de pastas:
#   data/certidoes_anexos/<numero-do-protocolo-sanitizado>/<arquivo>
#
# A pasta é nomeada pelo nº do protocolo (localizável por humano); como
# protocolo ↔ certidão é 1:1, o nº é chave inequívoca. O nº pode conter "/"
# (vira hífen na pasta), por isso trafega SEMPRE por query/form param —
# nunca como segmento de URL.
import os
import re

from datetime import datetime

from flask import Blueprint, current_app, jsonify, request, send_from_directory
from flask_login import current_user, login_required
from pathlib import Path

certidoes_arquivos_bp = Blueprint("certidoes_arquivos", __name__, url_prefix="/api/certidoes-anexos")

ALLOWED_EXTENSIONS = {"pdf", "jpg", "jpeg", "png", "tif", "tiff", "doc", "docx", "odt", "txt", "md"}
HISTORICO_NOME = "_historico.txt"

# Caracteres ilegais de filesystem a remover de nomes de arquivo/pasta
_ILEGAIS_RE = re.compile(r'[\\/:*?"<>|]')
_UNDERSCORE_RE = re.compile(r"_+")


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


def _sanitizar_proto(proto):
    """Reduz o nº de protocolo a um nome de pasta seguro e localizável por humano.

    Remove separadores de caminho e caracteres ilegais; barras viram hífen.
    Ex.: '2024/123' -> '2024-123'. Retorna '' se inválido.
    """
    proto = (proto or "").strip()
    proto = proto.replace("/", "-").replace("\\", "-")
    proto = _ILEGAIS_RE.sub("", proto)
    proto = proto.strip()
    return proto


def _get_certidao_dir(proto, criar=False):
    """Monta {CERTIDOES_FOLDER}/{proto_sanitizado}/ e confirma via realpath que o
    caminho permanece dentro de CERTIDOES_FOLDER. Retorna o caminho (str) ou None.
    """
    seguro = _sanitizar_proto(proto)
    if not seguro:
        return None
    base = current_app.config["CERTIDOES_FOLDER"]
    diretorio = os.path.join(base, seguro)

    # Anti path traversal: o caminho resolvido tem de ficar dentro da base
    base_real = os.path.realpath(base)
    if not os.path.realpath(diretorio).startswith(base_real + os.sep):
        return None

    if criar:
        Path(diretorio).mkdir(parents=True, exist_ok=True)
    return diretorio


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


def _registrar_historico(diretorio, usuario, acao, nome_arquivo):
    """Faz append de uma linha em _historico.txt.

    Formato: YYYY-MM-DD HH:MM — {usuario} {acao}: "{nome_arquivo}"
    acao é "anexou" ou "excluiu". Usa a data local do servidor.
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


def _pode_anexar():
    """Anexar: master e administrador."""
    return current_user.perfil in ("master", "administrador")


def _pode_excluir():
    """Excluir: somente master."""
    return current_user.perfil == "master"


@certidoes_arquivos_bp.route("/listar", methods=["GET"])
@login_required
def listar_arquivos():
    """Lista os anexos da certidão. Pasta inexistente → lista vazia (nunca 404)."""
    diretorio = _get_certidao_dir(request.args.get("proto"))
    if diretorio is None:
        return jsonify({"erro": "Protocolo inválido."}), 400
    anexos = _listar_anexos(diretorio)
    return jsonify({"arquivos": anexos, "tem_anexos": len(anexos) >= 1})


@certidoes_arquivos_bp.route("/upload", methods=["POST"])
@login_required
def upload_arquivo():
    """Recebe (multipart: campos 'proto' e 'arquivo') e grava um anexo legível."""
    if not _pode_anexar():
        return jsonify({"erro": "Sem permissão para anexar arquivos."}), 403

    proto = request.form.get("proto")
    if _get_certidao_dir(proto) is None:
        return jsonify({"erro": "Protocolo inválido."}), 400

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
        return jsonify({"erro": "Arquivo excede o tamanho máximo de 100 MB."}), 400

    nome = _sanitizar_nome(arquivo.filename)
    if not nome or "." not in nome:
        return jsonify({"erro": "Nome de arquivo inválido."}), 400

    # Cria a pasta apenas agora, quando há um anexo válido para gravar
    diretorio = _get_certidao_dir(proto, criar=True)
    if diretorio is None:
        return jsonify({"erro": "Protocolo inválido."}), 400

    nome = _nome_disponivel(diretorio, nome)
    caminho = os.path.join(diretorio, nome)

    # Confirmação final anti path traversal sobre o caminho do arquivo
    base_real = os.path.realpath(current_app.config["CERTIDOES_FOLDER"])
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


@certidoes_arquivos_bp.route("/download", methods=["GET"])
@login_required
def download_arquivo():
    """Faz o download de um anexo. Inexistente neste ambiente → 404 amigável."""
    diretorio = _get_certidao_dir(request.args.get("proto"))
    if diretorio is None:
        return jsonify({"erro": "Protocolo inválido."}), 400

    nome = os.path.basename(request.args.get("nome") or "")
    if not nome or nome == HISTORICO_NOME:
        return jsonify({"erro": "Arquivo não disponível neste ambiente."}), 404

    caminho = os.path.join(diretorio, nome)
    if not os.path.isfile(caminho):
        return jsonify({"erro": "Arquivo não disponível neste ambiente."}), 404

    return send_from_directory(diretorio, nome, as_attachment=True)


@certidoes_arquivos_bp.route("/excluir", methods=["DELETE"])
@login_required
def deletar_arquivo():
    """Remove um anexo (somente master); mantém a pasta e o _historico.txt."""
    if not _pode_excluir():
        return jsonify({"erro": "Sem permissão para excluir arquivos."}), 403

    diretorio = _get_certidao_dir(request.args.get("proto"))
    if diretorio is None:
        return jsonify({"erro": "Protocolo inválido."}), 400

    nome = os.path.basename(request.args.get("nome") or "")
    if not nome or nome == HISTORICO_NOME:
        return jsonify({"erro": "Arquivo não encontrado."}), 404

    caminho = os.path.join(diretorio, nome)
    if not os.path.isfile(caminho):
        return jsonify({"erro": "Arquivo não encontrado."}), 404

    try:
        os.remove(caminho)
    except OSError:
        pass

    _registrar_historico(diretorio, current_user.nome, "excluiu", nome)

    anexos = _listar_anexos(diretorio)
    return jsonify({"arquivos": anexos, "tem_anexos": len(anexos) >= 1})
