# app/comments.py — Blueprint de comentários e lista de usuários ativos
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from app.db import get_db

comments_bp = Blueprint("comments", __name__, url_prefix="/api/comments")


@comments_bp.route("/<int:protocolo_id>", methods=["GET"])
@login_required
def listar_comentarios(protocolo_id):
    db = get_db()
    rows = db.execute(
        "SELECT id, protocolo_id, usuario_id, usuario_nome, conteudo, criado_em "
        "FROM comments WHERE protocolo_id = ? ORDER BY criado_em ASC",
        (protocolo_id,),
    ).fetchall()
    return jsonify({"comments": [dict(r) for r in rows]})


@comments_bp.route("/<int:protocolo_id>", methods=["POST"])
@login_required
def criar_comentario(protocolo_id):
    data = request.get_json(silent=True) or {}
    conteudo = (data.get("conteudo") or "").strip()
    if not conteudo:
        return jsonify({"error": "Conteúdo não pode ser vazio."}), 400
    if len(conteudo) > 2000:
        return jsonify({"error": "Conteúdo excede 2000 caracteres."}), 400

    mencionados = data.get("mencionados") or []

    db = get_db()

    # Inserir comentário
    cur = db.execute(
        "INSERT INTO comments (protocolo_id, usuario_id, usuario_nome, conteudo) "
        "VALUES (?, ?, ?, ?)",
        (protocolo_id, current_user.id, current_user.nome, conteudo),
    )
    comment_id = cur.lastrowid

    # Criar notificações para mencionados
    previa = conteudo[:120]
    for uid in mencionados:
        if uid == current_user.id:
            continue
        user = db.execute(
            "SELECT id FROM users WHERE id = ? AND ativo = 1", (uid,)
        ).fetchone()
        if user:
            db.execute(
                "INSERT INTO notifications "
                "(destinatario_id, remetente_id, remetente_nome, comment_id, protocolo_id, previa) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (uid, current_user.id, current_user.nome, comment_id, protocolo_id, previa),
            )

    db.commit()

    # Retornar o comentário criado
    row = db.execute(
        "SELECT id, protocolo_id, usuario_id, usuario_nome, conteudo, criado_em "
        "FROM comments WHERE id = ?",
        (comment_id,),
    ).fetchone()
    return jsonify(dict(row)), 201


# Blueprint separado para /api/users (usado pelo dropdown de menções)
users_bp = Blueprint("users_api", __name__, url_prefix="/api/users")


@users_bp.route("/active", methods=["GET"])
@login_required
def usuarios_ativos():
    db = get_db()
    rows = db.execute(
        "SELECT id, nome FROM users WHERE ativo = 1 ORDER BY nome ASC"
    ).fetchall()
    return jsonify({"users": [dict(r) for r in rows]})
