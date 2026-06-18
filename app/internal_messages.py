# app/internal_messages.py — Blueprint de mensagens internas (avisos na home)
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from app.db import get_db

internal_messages_bp = Blueprint(
    "internal_messages", __name__, url_prefix="/api/internal-messages"
)


def _exigir_master():
    """Retorna uma resposta 403 se o usuário atual não for master; senão None."""
    if current_user.perfil != "master":
        return jsonify({"error": "Acesso negado."}), 403
    return None


# ─────────────────────────────────────────────────────────────
# Endpoints para qualquer usuário logado
# ─────────────────────────────────────────────────────────────

@internal_messages_bp.route("/pending", methods=["GET"])
@login_required
def mensagens_pendentes():
    """Mensagens ativas que o usuário atual ainda não confirmou, mais antigas primeiro."""
    db = get_db()
    rows = db.execute(
        "SELECT m.id, m.titulo, m.corpo, m.criado_em "
        "FROM internal_messages m "
        "WHERE m.ativa = 1 "
        "AND NOT EXISTS ("
        "    SELECT 1 FROM internal_message_reads r "
        "    WHERE r.message_id = m.id AND r.usuario_id = ?"
        ") "
        "ORDER BY m.criado_em ASC",
        (current_user.id,),
    ).fetchall()
    return jsonify({"messages": [dict(r) for r in rows]})


@internal_messages_bp.route("/<int:message_id>/read", methods=["POST"])
@login_required
def confirmar_leitura(message_id):
    """Registra a confirmação definitiva de leitura do usuário atual."""
    db = get_db()
    row = db.execute(
        "SELECT id FROM internal_messages WHERE id = ? AND ativa = 1",
        (message_id,),
    ).fetchone()
    if not row:
        return jsonify({"error": "Mensagem não encontrada."}), 404

    db.execute(
        "INSERT OR IGNORE INTO internal_message_reads "
        "(message_id, usuario_id, usuario_nome) VALUES (?, ?, ?)",
        (message_id, current_user.id, current_user.nome),
    )
    db.commit()
    return jsonify({"ok": True})


# ─────────────────────────────────────────────────────────────
# Endpoints de gestão (somente master)
# ─────────────────────────────────────────────────────────────

@internal_messages_bp.route("", methods=["GET"])
@login_required
def listar_mensagens():
    """Lista todas as mensagens (ativas e inativas) com a contagem de leituras."""
    erro = _exigir_master()
    if erro:
        return erro

    db = get_db()
    rows = db.execute(
        "SELECT m.id, m.titulo, m.corpo, m.criado_em, m.ativa, m.criado_por_nome, "
        "       COUNT(r.id) AS total_leituras "
        "FROM internal_messages m "
        "LEFT JOIN internal_message_reads r ON r.message_id = m.id "
        "GROUP BY m.id "
        "ORDER BY m.criado_em DESC"
    ).fetchall()

    mensagens = []
    for r in rows:
        mensagens.append({
            "id": r["id"],
            "titulo": r["titulo"],
            "corpo": r["corpo"],
            "criado_em": r["criado_em"],
            "ativa": bool(r["ativa"]),
            "criado_por_nome": r["criado_por_nome"],
            "total_leituras": r["total_leituras"],
        })
    return jsonify({"messages": mensagens})


@internal_messages_bp.route("", methods=["POST"])
@login_required
def criar_mensagem():
    """Cria uma nova mensagem interna."""
    erro = _exigir_master()
    if erro:
        return erro

    data = request.get_json(silent=True) or {}
    titulo = (data.get("titulo") or "").strip()
    corpo = (data.get("corpo") or "").strip()

    if not titulo:
        return jsonify({"error": "O título não pode ser vazio."}), 400
    if not corpo:
        return jsonify({"error": "O corpo não pode ser vazio."}), 400
    if len(titulo) > 200:
        return jsonify({"error": "O título excede 200 caracteres."}), 400
    if len(corpo) > 20000:
        return jsonify({"error": "O corpo excede 20000 caracteres."}), 400

    db = get_db()
    cur = db.execute(
        "INSERT INTO internal_messages (titulo, corpo, criado_por_id, criado_por_nome) "
        "VALUES (?, ?, ?, ?)",
        (titulo, corpo, current_user.id, current_user.nome),
    )
    db.commit()

    row = db.execute(
        "SELECT id, titulo, corpo, criado_em, ativa, criado_por_nome "
        "FROM internal_messages WHERE id = ?",
        (cur.lastrowid,),
    ).fetchone()
    resultado = dict(row)
    resultado["ativa"] = bool(resultado["ativa"])
    resultado["total_leituras"] = 0
    return jsonify(resultado), 201


@internal_messages_bp.route("/<int:message_id>/deactivate", methods=["PATCH"])
@login_required
def desativar_mensagem(message_id):
    """Soft-delete: marca a mensagem como inativa. Nunca apaga."""
    erro = _exigir_master()
    if erro:
        return erro

    db = get_db()
    row = db.execute(
        "SELECT id FROM internal_messages WHERE id = ?", (message_id,)
    ).fetchone()
    if not row:
        return jsonify({"error": "Mensagem não encontrada."}), 404

    db.execute("UPDATE internal_messages SET ativa = 0 WHERE id = ?", (message_id,))
    db.commit()
    return jsonify({"ok": True})


@internal_messages_bp.route("/<int:message_id>/reads", methods=["GET"])
@login_required
def historico_leitura(message_id):
    """Histórico de quem confirmou a leitura, ordenado por data/hora."""
    erro = _exigir_master()
    if erro:
        return erro

    db = get_db()
    rows = db.execute(
        "SELECT usuario_nome, lida_em FROM internal_message_reads "
        "WHERE message_id = ? ORDER BY lida_em ASC",
        (message_id,),
    ).fetchall()
    return jsonify({"reads": [dict(r) for r in rows]})
