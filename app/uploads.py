# app/uploads.py — Blueprint para upload/download/exclusão de arquivos de protocolo
import os
import uuid

from flask import Blueprint, current_app, jsonify, request, send_from_directory
from flask_login import current_user, login_required
from pathlib import Path

from app.db import get_db

uploads_bp = Blueprint("uploads", __name__, url_prefix="/api/uploads")

ALLOWED_EXTENSIONS = {"doc", "docx", "odt", "pdf", "jpg", "png", "txt", "md", "xls"}


def _extensao_permitida(filename):
    """Verifica se a extensão do arquivo está na allowlist (case-insensitive)."""
    if "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[1].lower()
    return ext in ALLOWED_EXTENSIONS


def _get_upload_dir(protocolo_id):
    """Retorna o diretório de upload para um protocolo, criando se necessário."""
    base = current_app.config["UPLOAD_FOLDER"]
    upload_dir = os.path.join(base, str(protocolo_id))
    Path(upload_dir).mkdir(parents=True, exist_ok=True)
    return upload_dir


@uploads_bp.route("/<int:protocolo_id>", methods=["GET"])
@login_required
def listar_arquivos(protocolo_id):
    """Lista todos os arquivos de um protocolo."""
    db = get_db()
    rows = db.execute(
        "SELECT id, protocolo_id, nome_original, extensao, tamanho, "
        "usuario_id, usuario_nome, criado_em "
        "FROM protocol_files WHERE protocolo_id = ? ORDER BY criado_em DESC",
        (protocolo_id,),
    ).fetchall()
    files = []
    for r in rows:
        files.append({
            "id": r["id"],
            "protocolo_id": r["protocolo_id"],
            "nome_original": r["nome_original"],
            "extensao": r["extensao"],
            "tamanho": r["tamanho"],
            "usuario_id": r["usuario_id"],
            "usuario_nome": r["usuario_nome"],
            "criado_em": r["criado_em"],
        })
    return jsonify({"files": files})


@uploads_bp.route("/<int:protocolo_id>", methods=["POST"])
@login_required
def upload_arquivo(protocolo_id):
    """Recebe e salva um arquivo para o protocolo."""
    if "arquivo" not in request.files:
        return jsonify({"erro": "Nenhum arquivo enviado."}), 400

    arquivo = request.files["arquivo"]
    if not arquivo.filename:
        return jsonify({"erro": "Nome de arquivo vazio."}), 400

    # Validar extensão
    if not _extensao_permitida(arquivo.filename):
        return jsonify({"erro": "Extensão de arquivo não permitida."}), 400

    # Ler conteúdo e validar tamanho
    conteudo = arquivo.read()
    max_size = current_app.config.get("MAX_UPLOAD_SIZE", 20 * 1024 * 1024)
    if len(conteudo) > max_size:
        return jsonify({"erro": "Arquivo excede o tamanho máximo de 20 MB."}), 400

    # Extrair extensão e gerar nome seguro
    nome_original = arquivo.filename
    ext = nome_original.rsplit(".", 1)[1].lower()
    nome_disco = str(uuid.uuid4()) + "." + ext

    # Salvar no disco
    upload_dir = _get_upload_dir(protocolo_id)
    caminho = os.path.join(upload_dir, nome_disco)
    with open(caminho, "wb") as f:
        f.write(conteudo)

    # Inserir registro no SQLite
    db = get_db()
    cur = db.execute(
        "INSERT INTO protocol_files "
        "(protocolo_id, nome_original, nome_disco, extensao, tamanho, usuario_id, usuario_nome) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (protocolo_id, nome_original, nome_disco, ext, len(conteudo),
         current_user.id, current_user.nome),
    )
    db.commit()

    registro = db.execute(
        "SELECT id, protocolo_id, nome_original, extensao, tamanho, "
        "usuario_id, usuario_nome, criado_em "
        "FROM protocol_files WHERE id = ?",
        (cur.lastrowid,),
    ).fetchone()

    return jsonify({
        "id": registro["id"],
        "protocolo_id": registro["protocolo_id"],
        "nome_original": registro["nome_original"],
        "extensao": registro["extensao"],
        "tamanho": registro["tamanho"],
        "usuario_id": registro["usuario_id"],
        "usuario_nome": registro["usuario_nome"],
        "criado_em": registro["criado_em"],
    }), 201


@uploads_bp.route("/download/<int:file_id>", methods=["GET"])
@login_required
def download_arquivo(file_id):
    """Faz download de um arquivo pelo ID do registro."""
    db = get_db()
    registro = db.execute(
        "SELECT * FROM protocol_files WHERE id = ?", (file_id,)
    ).fetchone()

    if not registro:
        return jsonify({"erro": "Arquivo não encontrado."}), 404

    upload_dir = os.path.join(
        current_app.config["UPLOAD_FOLDER"], str(registro["protocolo_id"])
    )
    return send_from_directory(
        upload_dir,
        registro["nome_disco"],
        as_attachment=True,
        download_name=registro["nome_original"],
    )


@uploads_bp.route("/<int:file_id>", methods=["DELETE"])
@login_required
def deletar_arquivo(file_id):
    """Exclui um arquivo (apenas dono, administrador ou master)."""
    db = get_db()
    registro = db.execute(
        "SELECT * FROM protocol_files WHERE id = ?", (file_id,)
    ).fetchone()

    if not registro:
        return jsonify({"erro": "Arquivo não encontrado."}), 404

    # Verificar permissão
    pode_deletar = (
        current_user.id == registro["usuario_id"]
        or current_user.perfil in ("master", "administrador")
    )
    if not pode_deletar:
        return jsonify({"erro": "Sem permissão para excluir este arquivo."}), 403

    # Remover arquivo do disco
    upload_dir = os.path.join(
        current_app.config["UPLOAD_FOLDER"], str(registro["protocolo_id"])
    )
    caminho = os.path.join(upload_dir, registro["nome_disco"])
    try:
        os.remove(caminho)
    except OSError:
        pass  # Arquivo pode já ter sido removido manualmente

    # Remover registro do SQLite
    db.execute("DELETE FROM protocol_files WHERE id = ?", (file_id,))
    db.commit()

    return jsonify({"ok": True}), 200
