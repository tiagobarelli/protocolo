# app/notifications.py — Blueprint de notificações
import math

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from app.db import get_db

notifications_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


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
        "SELECT id, remetente_nome, protocolo_id, previa, lida, criado_em "
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
            "criado_em": r["criado_em"],
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
