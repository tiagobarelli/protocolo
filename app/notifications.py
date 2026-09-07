# app/notifications.py — Blueprint de notificações
import math

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from app.db import get_db

notifications_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


def _iso_utc(timestamp):
    """Converte 'YYYY-MM-DD HH:MM:SS' (CURRENT_TIMESTAMP do SQLite, UTC) em
    ISO 8601 com sufixo Z explícito, para o frontend converter com new Date()
    ao horário local. Sem o Z, o horário exibido ficaria 3h errado (UTC-3)."""
    if not timestamp:
        return timestamp
    return timestamp.replace(" ", "T") + "Z"


@notifications_bp.route("", methods=["GET"])
@login_required
def listar_notificacoes():
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    if page < 1:
        page = 1
    if per_page < 1 or per_page > 100:
        per_page = 20

    db = get_db()

    total = db.execute(
        "SELECT COUNT(*) FROM notifications WHERE destinatario_id = ?",
        (current_user.id,),
    ).fetchone()[0]

    pages = max(1, math.ceil(total / per_page))
    offset = (page - 1) * per_page

    rows = db.execute(
        "SELECT id, remetente_nome, protocolo_id, previa, lida, criado_em, tipo, ref_id "
        "FROM notifications WHERE destinatario_id = ? "
        "ORDER BY criado_em DESC LIMIT ? OFFSET ?",
        (current_user.id, per_page, offset),
    ).fetchall()

    notifications = []
    for r in rows:
        notifications.append({
            "id": r["id"],
            "remetente_nome": r["remetente_nome"],
            "protocolo_id": r["protocolo_id"],
            "previa": r["previa"],
            "lida": bool(r["lida"]),
            "criado_em": _iso_utc(r["criado_em"]),
            "tipo": r["tipo"],
            "ref_id": r["ref_id"],
        })

    return jsonify({
        "notifications": notifications,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": pages,
    })


@notifications_bp.route("/sent", methods=["GET"])
@login_required
def listar_enviadas():
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    if page < 1:
        page = 1
    if per_page < 1 or per_page > 100:
        per_page = 20

    db = get_db()

    total = db.execute(
        "SELECT COUNT(*) FROM ("
        "    SELECT tipo, comment_id, ref_id FROM notifications"
        "    WHERE remetente_id = ?"
        "    GROUP BY tipo, comment_id, ref_id"
        ")",
        (current_user.id,),
    ).fetchone()[0]

    pages = max(1, math.ceil(total / per_page))
    offset = (page - 1) * per_page

    rows = db.execute(
        "SELECT "
        "    MIN(n.id) AS id, "
        "    n.tipo, "
        "    n.comment_id, "
        "    n.ref_id, "
        "    n.protocolo_id, "
        "    n.previa, "
        "    MAX(n.criado_em) AS criado_em, "
        "    COUNT(n.destinatario_id) AS total_destinatarios, "
        "    GROUP_CONCAT(u.nome, ', ') AS destinatarios_nomes "
        "FROM notifications n "
        "JOIN users u ON u.id = n.destinatario_id "
        "WHERE n.remetente_id = ? "
        "GROUP BY n.tipo, n.comment_id, n.ref_id "
        "ORDER BY criado_em DESC "
        "LIMIT ? OFFSET ?",
        (current_user.id, per_page, offset),
    ).fetchall()

    notifications = []
    for r in rows:
        notifications.append({
            "id": r["id"],
            "tipo": r["tipo"],
            "comment_id": r["comment_id"],
            "ref_id": r["ref_id"],
            "protocolo_id": r["protocolo_id"],
            "previa": r["previa"],
            "criado_em": _iso_utc(r["criado_em"]),
            "total_destinatarios": r["total_destinatarios"],
            "destinatarios_nomes": r["destinatarios_nomes"],
        })

    return jsonify({
        "notifications": notifications,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": pages,
    })


@notifications_bp.route("/count", methods=["GET"])
@login_required
def contar_nao_lidas():
    db = get_db()
    count = db.execute(
        "SELECT COUNT(*) FROM notifications WHERE destinatario_id = ? AND lida = 0",
        (current_user.id,),
    ).fetchone()[0]
    return jsonify({"count": count})


@notifications_bp.route("/<int:notification_id>/read", methods=["PATCH"])
@login_required
def marcar_como_lida(notification_id):
    db = get_db()
    row = db.execute(
        "SELECT id FROM notifications WHERE id = ? AND destinatario_id = ?",
        (notification_id, current_user.id),
    ).fetchone()
    if not row:
        return jsonify({"error": "Notificação não encontrada."}), 404

    db.execute("UPDATE notifications SET lida = 1 WHERE id = ?", (notification_id,))
    db.commit()
    return jsonify({"ok": True})


@notifications_bp.route("/read-all", methods=["PATCH"])
@login_required
def marcar_todas_como_lidas():
    db = get_db()
    cur = db.execute(
        "UPDATE notifications SET lida = 1 WHERE destinatario_id = ? AND lida = 0",
        (current_user.id,),
    )
    db.commit()
    return jsonify({"ok": True, "updated": cur.rowcount})
