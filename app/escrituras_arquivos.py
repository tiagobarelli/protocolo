# app/escrituras_arquivos.py — Blueprint para o acervo de anexos das escrituras (filesystem)
#
# Mesmo modelo do certidoes_arquivos.py (disco como fonte da verdade; nomes
# legíveis; _historico.txt como trilha de auditoria local; nenhuma chamada ao
# Baserow), com dois acréscimos: hierarquia de pastas em dois níveis
# (Livro → Página) e notas explicativas por anexo via arquivo-irmão .nota.txt.
#
# Estrutura de pastas:
#   data/escrituras_anexos/L<livro>/P<pagina>/<arquivo>
#
# A chave é a dupla livro + página (campos Livro/Pagina da tabela Controle;
# identificador canônico L_x_P_y). O frontend envia os valores exatamente como
# armazenados no registro (página já com padding, ex.: "025"); o backend não
# aplica padding — usa os valores recebidos após sanitização, garantindo pasta
# determinística. livro/pagina trafegam SEMPRE por query/form param — nunca
# como segmento de URL.
#
# Cada anexo pode ter uma nota curta em arquivo-irmão de texto puro:
# <nome-completo-do-anexo>.nota.txt (nunca substitui a extensão — evita
# colisão entre a.pdf e a.jpg). Notas e _historico.txt não aparecem na
# listagem nem são baixáveis; a nota é lida via /listar.
import os
import re

from datetime import datetime

from flask import Blueprint, current_app, jsonify, request, send_from_directory
from flask_login import current_user, login_required
from pathlib import Path

escrituras_arquivos_bp = Blueprint("escrituras_arquivos", __name__, url_prefix="/api/escrituras-anexos")

ALLOWED_EXTENSIONS = {"pdf", "jpg", "jpeg", "png", "tif", "tiff", "doc", "docx", "odt", "txt", "md"}
HISTORICO_NOME = "_historico.txt"
NOTA_SUFIXO = ".nota.txt"
NOTA_MAX_CHARS = 1000

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


def _sanitizar_chave(valor):
    """Reduz livro/página a um nome de pasta seguro e localizável por humano.

    Remove separadores de caminho e caracteres ilegais; barras viram hífen.
    Retorna '' se inválido.
    """
    valor = (valor or "").strip()
    valor = valor.replace("/", "-").replace("\\", "-")
    valor = _ILEGAIS_RE.sub("", valor)
    valor = valor.strip()
    return valor


def _get_escritura_dir(livro, pagina, criar=False):
    """Monta {ESCRITURAS_FOLDER}/L{livro}/P{pagina}/ e confirma via realpath que
    o caminho permanece dentro de ESCRITURAS_FOLDER. Retorna o caminho (str) ou None.
    """
    livro_seguro = _sanitizar_chave(livro)
    pagina_segura = _sanitizar_chave(pagina)
    if not livro_seguro or not pagina_segura:
        return None
    base = current_app.config["ESCRITURAS_FOLDER"]
    diretorio = os.path.join(base, "L" + livro_seguro, "P" + pagina_segura)

    # Anti path traversal: o caminho resolvido tem de ficar dentro da base
    base_real = os.path.realpath(base)
    if not os.path.realpath(diretorio).startswith(base_real + os.sep):
        return None

    if criar:
        Path(diretorio).mkdir(parents=True, exist_ok=True)
    return diretorio


def _caminho_nota(diretorio, nome):
    """Caminho do arquivo-irmão de nota do anexo (nome completo + .nota.txt)."""
    return os.path.join(diretorio, nome + NOTA_SUFIXO)


def _ler_nota(diretorio, nome):
    """Conteúdo da nota do anexo; string vazia se não existir ou ilegível."""
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

    Cada item: {"nome", "tamanho", "extensao", "nota"}. Pasta inexistente → [].
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


def _registrar_historico(diretorio, usuario, acao, nome_arquivo):
    """Faz append de uma linha em _historico.txt.

    Formato: YYYY-MM-DD HH:MM — {usuario} {acao}: "{nome_arquivo}"
    acao é "anexou", "excluiu", "editou nota de" ou "removeu nota de".
    Usa a data local do servidor.
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
    """Anexar (e criar/editar/remover notas): master e administrador."""
    return current_user.perfil in ("master", "administrador")


def _pode_excluir():
    """Excluir: somente master."""
    return current_user.perfil == "master"


@escrituras_arquivos_bp.route("/listar", methods=["GET"])
@login_required
def listar_arquivos():
    """Lista os anexos da escritura. Pasta inexistente → lista vazia (nunca 404)."""
    diretorio = _get_escritura_dir(request.args.get("livro"), request.args.get("pagina"))
    if diretorio is None:
        return jsonify({"erro": "Livro ou página inválidos."}), 400
    anexos = _listar_anexos(diretorio)
    return jsonify({"arquivos": anexos, "tem_anexos": len(anexos) >= 1})


@escrituras_arquivos_bp.route("/contagem-livro", methods=["GET"])
@login_required
def contagem_livro():
    """Contagem de anexos por página de um livro (para o relatório de atos).

    Resposta: {"paginas": {"097": 4, ...}} — chave sem o prefixo "P"; só
    páginas com contagem > 0. Pasta inexistente → mapa vazio (nunca 404).
    """
    livro = _sanitizar_chave(request.args.get("livro"))
    if not livro:
        return jsonify({"erro": "Livro inválido."}), 400

    base = current_app.config["ESCRITURAS_FOLDER"]
    dir_livro = os.path.join(base, "L" + livro)

    # Anti path traversal: o caminho resolvido tem de ficar dentro da base
    base_real = os.path.realpath(base)
    if not os.path.realpath(dir_livro).startswith(base_real + os.sep):
        return jsonify({"erro": "Livro inválido."}), 400

    paginas = {}
    if os.path.isdir(dir_livro):
        for nome_pasta in os.listdir(dir_livro):
            if not nome_pasta.startswith("P"):
                continue
            dir_pagina = os.path.join(dir_livro, nome_pasta)
            if not os.path.isdir(dir_pagina):
                continue
            total = 0
            for nome in os.listdir(dir_pagina):
                if nome == HISTORICO_NOME or nome.endswith(NOTA_SUFIXO):
                    continue
                if os.path.isfile(os.path.join(dir_pagina, nome)):
                    total += 1
            if total > 0:
                paginas[nome_pasta[1:]] = total

    return jsonify({"paginas": paginas})


@escrituras_arquivos_bp.route("/upload", methods=["POST"])
@login_required
def upload_arquivo():
    """Recebe (multipart: campos 'livro', 'pagina' e 'arquivo') e grava um anexo legível."""
    if not _pode_anexar():
        return jsonify({"erro": "Sem permissão para anexar arquivos."}), 403

    livro = request.form.get("livro")
    pagina = request.form.get("pagina")
    if _get_escritura_dir(livro, pagina) is None:
        return jsonify({"erro": "Livro ou página inválidos."}), 400

    if "arquivo" not in request.files:
        return jsonify({"erro": "Nenhum arquivo enviado."}), 400

    arquivo = request.files["arquivo"]
    if not arquivo.filename:
        return jsonify({"erro": "Nome de arquivo vazio."}), 400

    if not _extensao_permitida(arquivo.filename):
        return jsonify({"erro": "Extensão de arquivo não permitida."}), 400

    conteudo = arquivo.read()
    max_size = current_app.config.get("MAX_UPLOAD_SIZE_ESCRITURAS", 100 * 1024 * 1024)
    if len(conteudo) > max_size:
        return jsonify({"erro": "Arquivo excede o tamanho máximo de 100 MB."}), 400

    nome = _sanitizar_nome(arquivo.filename)
    if not nome or "." not in nome:
        return jsonify({"erro": "Nome de arquivo inválido."}), 400

    # Nomes reservados do módulo não podem virar anexo: um "*.nota.txt" ficaria
    # invisível na listagem e passaria por nota de outro arquivo
    if nome == HISTORICO_NOME or nome.endswith(NOTA_SUFIXO):
        return jsonify({"erro": "Nome de arquivo inválido."}), 400

    # Cria a pasta apenas agora, quando há um anexo válido para gravar
    diretorio = _get_escritura_dir(livro, pagina, criar=True)
    if diretorio is None:
        return jsonify({"erro": "Livro ou página inválidos."}), 400

    nome = _nome_disponivel(diretorio, nome)
    caminho = os.path.join(diretorio, nome)

    # Confirmação final anti path traversal sobre o caminho do arquivo
    base_real = os.path.realpath(current_app.config["ESCRITURAS_FOLDER"])
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
            "nota": "",
        },
    }), 201


@escrituras_arquivos_bp.route("/download", methods=["GET"])
@login_required
def download_arquivo():
    """Faz o download de um anexo. Inexistente neste ambiente → 404 amigável."""
    diretorio = _get_escritura_dir(request.args.get("livro"), request.args.get("pagina"))
    if diretorio is None:
        return jsonify({"erro": "Livro ou página inválidos."}), 400

    nome = os.path.basename(request.args.get("nome") or "")
    if not nome or nome == HISTORICO_NOME or nome.endswith(NOTA_SUFIXO):
        return jsonify({"erro": "Arquivo não disponível neste ambiente."}), 404

    caminho = os.path.join(diretorio, nome)
    if not os.path.isfile(caminho):
        return jsonify({"erro": "Arquivo não disponível neste ambiente."}), 404

    return send_from_directory(diretorio, nome, as_attachment=True)


@escrituras_arquivos_bp.route("/excluir", methods=["DELETE"])
@login_required
def deletar_arquivo():
    """Remove um anexo e seu irmão de nota (somente master); mantém a pasta e o _historico.txt."""
    if not _pode_excluir():
        return jsonify({"erro": "Sem permissão para excluir arquivos."}), 403

    diretorio = _get_escritura_dir(request.args.get("livro"), request.args.get("pagina"))
    if diretorio is None:
        return jsonify({"erro": "Livro ou página inválidos."}), 400

    nome = os.path.basename(request.args.get("nome") or "")
    if not nome or nome == HISTORICO_NOME or nome.endswith(NOTA_SUFIXO):
        return jsonify({"erro": "Arquivo não encontrado."}), 404

    caminho = os.path.join(diretorio, nome)
    if not os.path.isfile(caminho):
        return jsonify({"erro": "Arquivo não encontrado."}), 404

    try:
        os.remove(caminho)
    except OSError:
        pass

    _registrar_historico(diretorio, current_user.nome, "excluiu", nome)

    # Remove o irmão de nota, se existir (com entrada própria no histórico)
    caminho_nota = _caminho_nota(diretorio, nome)
    if os.path.isfile(caminho_nota):
        try:
            os.remove(caminho_nota)
        except OSError:
            pass
        _registrar_historico(diretorio, current_user.nome, "removeu nota de", nome)

    anexos = _listar_anexos(diretorio)
    return jsonify({"arquivos": anexos, "tem_anexos": len(anexos) >= 1})


@escrituras_arquivos_bp.route("/nota", methods=["POST"])
@login_required
def salvar_nota():
    """Grava/sobrescreve a nota explicativa de um anexo; texto vazio → remove."""
    if not _pode_anexar():
        return jsonify({"erro": "Sem permissão para editar notas."}), 403

    diretorio = _get_escritura_dir(request.form.get("livro"), request.form.get("pagina"))
    if diretorio is None:
        return jsonify({"erro": "Livro ou página inválidos."}), 400

    nome = os.path.basename(request.form.get("nome") or "")
    if not nome or nome == HISTORICO_NOME or nome.endswith(NOTA_SUFIXO):
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
    return jsonify({"arquivos": anexos, "tem_anexos": len(anexos) >= 1})
