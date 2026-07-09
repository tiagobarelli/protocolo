# app/eventos_arquivos.py — Blueprint para o acervo de anexos dos eventos societários
#
# Mesmo modelo do oficios.py (disco como fonte da verdade; nomes legíveis;
# _historico.txt como trilha de auditoria local; nenhuma chamada ao Baserow).
#
# Estrutura de pastas:
#   data/eventos_societarios/<CNPJ>__<denominacao-slug>/<ano>/<tipo-slug>-<data>__<id_evento>/<arquivo>
#
# A pasta-mãe é localizada pelo PREFIXO do CNPJ (glob "<CNPJ>__*"); o slug da
# denominação é cosmético — mudança de denominação não quebra o vínculo. A
# subpasta do evento é determinística e o id_evento é o localizador estável.
# Um único arquivo por evento: novo upload substitui o anterior.
import glob
import os
import re

from datetime import datetime

from flask import Blueprint, current_app, jsonify, request, send_from_directory
from flask_login import current_user, login_required
from pathlib import Path

eventos_arquivos_bp = Blueprint("eventos_arquivos", __name__, url_prefix="/api/eventos-arquivos")

ALLOWED_EXTENSIONS = {"pdf", "jpg", "jpeg", "png", "tif", "tiff"}
HISTORICO_NOME = "_historico.txt"

# Caracteres ilegais de filesystem a remover de nomes/slugs
_ILEGAIS_RE = re.compile(r'[\\/:*?"<>|]')
_UNDERSCORE_RE = re.compile(r"_+")
_HIFEN_RE = re.compile(r"-+")


# ── Helpers de validação/normalização ─────────────────────────────────────
def _limpar_cnpj(cnpj):
    """Reduz a dígitos; retorna a string de 14 dígitos ou None."""
    so_digitos = re.sub(r"\D", "", cnpj or "")
    return so_digitos if len(so_digitos) == 14 else None


def _slug(texto):
    """Slug legível: minúsculas, espaços→hífen, remove ilegais de FS, colapsa hífens.

    Preserva acentos (legibilidade; o volume é Linux/UTF-8).
    """
    texto = os.path.basename(texto or "")
    texto = texto.strip().lower()
    texto = texto.replace(" ", "-")
    texto = _ILEGAIS_RE.sub("", texto)
    texto = _HIFEN_RE.sub("-", texto)
    # Remove pontos/espaços/hífens das pontas — trailing dot é ilegal no Windows
    # (silenciosamente removido), o que faria construir/localizar divergirem.
    texto = texto.strip("-. ")
    return texto


def _validar_data(data):
    """Aceita 'YYYY-MM-DD'; retorna a string ou None."""
    return data if (data and re.match(r"^\d{4}-\d{2}-\d{2}$", data)) else None


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


# ── Helpers de caminho ────────────────────────────────────────────────────
def _dentro_da_base(caminho):
    """True se realpath(caminho) está dentro de EVENTOS_FOLDER."""
    base_real = os.path.realpath(current_app.config["EVENTOS_FOLDER"])
    alvo_real = os.path.realpath(caminho)
    return alvo_real == base_real or alvo_real.startswith(base_real + os.sep)


def _pasta_mae(cnpj, denominacao=None, criar=False):
    """Localiza (ou cria) a pasta-mãe da PJ pelo prefixo do CNPJ.

    Procura por glob "<CNPJ>__*"; se não achar e criar+denominacao, cria
    "<CNPJ>__<slug>". Retorna o caminho (str) ou None.
    """
    cnpj = _limpar_cnpj(cnpj)
    if not cnpj:
        return None

    base = current_app.config["EVENTOS_FOLDER"]
    matches = sorted(glob.glob(os.path.join(base, cnpj + "__*")))
    if matches:
        mae = matches[0]
    elif criar and denominacao:
        mae = os.path.join(base, cnpj + "__" + _slug(denominacao))
        Path(mae).mkdir(parents=True, exist_ok=True)
    else:
        return None

    return mae if _dentro_da_base(mae) else None


def _subpasta_nome(tipo, data, id_evento):
    """Nome determinístico da subpasta do evento."""
    return _slug(tipo) + "-" + data + "__" + str(id_evento)


def _pasta_evento_construir(cnpj, denominacao, tipo, data, id_evento, criar=False):
    """Monta {mae}/{ano}/{tipo-slug}-{data}__{id_evento}/ (para upload).

    Se o evento já tem pasta (localizada por id), reutiliza-a — evita duplicar
    quando tipo/data mudaram após uma edição e houve reenvio do anexo.
    """
    # Reutiliza a pasta já existente do evento (localizada por id), se houver.
    existente = _pasta_evento_localizar(cnpj, id_evento)
    if existente:
        return existente

    mae = _pasta_mae(cnpj, denominacao, criar=criar)
    if mae is None:
        return None
    ano = data[:4]
    caminho = os.path.join(mae, ano, _subpasta_nome(tipo, data, id_evento))
    if criar:
        Path(caminho).mkdir(parents=True, exist_ok=True)
    return caminho if _dentro_da_base(caminho) else None


def _pasta_evento_localizar(cnpj, id_evento):
    """Localiza a subpasta do evento pelo id (para listar/baixar/excluir; sem criar)."""
    mae = _pasta_mae(cnpj)
    if mae is None:
        return None
    matches = sorted(glob.glob(os.path.join(mae, "*", "*__" + str(id_evento))))
    if not matches:
        return None
    caminho = matches[0]
    return caminho if _dentro_da_base(caminho) else None


# ── Helpers de arquivo ────────────────────────────────────────────────────
def _listar_anexos(diretorio):
    """Lista arquivos reais da pasta, excluindo _historico.txt.

    Cada item: {"nome", "tamanho", "extensao"}. Pasta inexistente/None → [].
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


def _tem_anexo(diretorio):
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


# ── Permissões ────────────────────────────────────────────────────────────
def _pode_anexar():
    """Anexar: master e administrador."""
    return current_user.perfil in ("master", "administrador")


def _pode_excluir():
    """Excluir: somente master."""
    return current_user.perfil == "master"


# ── Rotas ─────────────────────────────────────────────────────────────────
@eventos_arquivos_bp.route("/<cnpj>/<int:id_evento>/arquivo", methods=["GET"])
@login_required
def listar_arquivo(cnpj, id_evento):
    """Lista o anexo de um evento. Pasta inexistente → sem arquivo (nunca 404)."""
    if _limpar_cnpj(cnpj) is None:
        return jsonify({"erro": "CNPJ inválido."}), 400
    diretorio = _pasta_evento_localizar(cnpj, id_evento)
    anexos = _listar_anexos(diretorio)
    return jsonify({"arquivo": anexos[0] if anexos else None, "tem_anexo": len(anexos) >= 1})


@eventos_arquivos_bp.route("/<cnpj>/<int:id_evento>/arquivo", methods=["POST"])
@login_required
def upload_arquivo(cnpj, id_evento):
    """Recebe (multipart) e grava o anexo do evento, substituindo o anterior."""
    if not _pode_anexar():
        return jsonify({"erro": "Sem permissão para anexar arquivos."}), 403

    if _limpar_cnpj(cnpj) is None:
        return jsonify({"erro": "CNPJ inválido."}), 400

    denominacao = request.form.get("denominacao", "")
    tipo = request.form.get("tipo", "")
    data = _validar_data(request.form.get("data", ""))
    if not data:
        return jsonify({"erro": "Data inválida (use YYYY-MM-DD)."}), 400

    if "arquivo" not in request.files:
        return jsonify({"erro": "Nenhum arquivo enviado."}), 400

    arquivo = request.files["arquivo"]
    if not arquivo.filename:
        return jsonify({"erro": "Nome de arquivo vazio."}), 400

    if not _extensao_permitida(arquivo.filename):
        return jsonify({"erro": "Extensão de arquivo não permitida."}), 400

    conteudo = arquivo.read()
    max_size = current_app.config.get("MAX_UPLOAD_SIZE", 100 * 1024 * 1024)
    if len(conteudo) > max_size:
        return jsonify({"erro": "Arquivo excede o tamanho máximo de 100 MB."}), 400

    nome = _sanitizar_nome(arquivo.filename)
    if not nome or "." not in nome:
        return jsonify({"erro": "Nome de arquivo inválido."}), 400

    diretorio = _pasta_evento_construir(cnpj, denominacao, tipo, data, id_evento, criar=True)
    if diretorio is None:
        return jsonify({"erro": "Não foi possível preparar a pasta do evento."}), 400

    # Substituir: remove os anexos existentes (tudo, exceto _historico.txt)
    for existente in _listar_anexos(diretorio):
        try:
            os.remove(os.path.join(diretorio, existente["nome"]))
        except OSError:
            pass

    caminho = os.path.join(diretorio, nome)

    # Confirmação final anti path traversal sobre o caminho do arquivo
    base_real = os.path.realpath(current_app.config["EVENTOS_FOLDER"])
    if not os.path.realpath(caminho).startswith(base_real + os.sep):
        return jsonify({"erro": "Caminho inválido."}), 400

    with open(caminho, "wb") as f:
        f.write(conteudo)

    _registrar_historico(diretorio, current_user.nome, "anexou", nome)

    ext = nome.rsplit(".", 1)[1].lower() if "." in nome else ""
    return jsonify({
        "arquivo": {"nome": nome, "tamanho": len(conteudo), "extensao": ext},
        "tem_anexo": True,
    }), 201


@eventos_arquivos_bp.route("/<cnpj>/<int:id_evento>/arquivo/<nome>", methods=["GET"])
@login_required
def download_arquivo(cnpj, id_evento, nome):
    """Faz o download do anexo. Inexistente neste ambiente → 404 amigável."""
    if _limpar_cnpj(cnpj) is None:
        return jsonify({"erro": "CNPJ inválido."}), 400

    diretorio = _pasta_evento_localizar(cnpj, id_evento)
    nome = os.path.basename(nome or "")
    if diretorio is None or not nome or nome == HISTORICO_NOME:
        return jsonify({"erro": "Arquivo não disponível neste ambiente."}), 404

    caminho = os.path.join(diretorio, nome)
    if not os.path.isfile(caminho):
        return jsonify({"erro": "Arquivo não disponível neste ambiente."}), 404

    return send_from_directory(diretorio, nome, as_attachment=True)


@eventos_arquivos_bp.route("/<cnpj>/<int:id_evento>/arquivo/<nome>", methods=["DELETE"])
@login_required
def deletar_arquivo(cnpj, id_evento, nome):
    """Remove o anexo (somente master); mantém a pasta e o _historico.txt."""
    if not _pode_excluir():
        return jsonify({"erro": "Sem permissão para excluir arquivos."}), 403

    if _limpar_cnpj(cnpj) is None:
        return jsonify({"erro": "CNPJ inválido."}), 400

    diretorio = _pasta_evento_localizar(cnpj, id_evento)
    nome = os.path.basename(nome or "")
    if diretorio is None or not nome or nome == HISTORICO_NOME:
        return jsonify({"erro": "Arquivo não encontrado."}), 404

    caminho = os.path.join(diretorio, nome)
    if not os.path.isfile(caminho):
        return jsonify({"erro": "Arquivo não encontrado."}), 404

    try:
        os.remove(caminho)
    except OSError:
        pass

    _registrar_historico(diretorio, current_user.nome, "removeu", nome)

    return jsonify({"arquivo": None, "tem_anexo": _tem_anexo(diretorio)})
