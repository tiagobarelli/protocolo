# app/paperless_proxy.py — Proxy de API para o Paperless-ngx (somente leitura)
import requests
from flask import Blueprint, current_app, request, Response
from flask_login import login_required

paperless_bp = Blueprint("paperless", __name__, url_prefix="/api/paperless")


def _proxy_request():
    """Repassa a requisição GET atual para o Paperless com o token de autorização."""
    base = current_app.config["PAPERLESS_URL"]
    token = current_app.config.get("PAPERLESS_TOKEN")
    if not token:
        return Response(
            '{"detail": "Paperless não configurado."}',
            status=502,
            mimetype="application/json",
        )

    path = request.path[len(paperless_bp.url_prefix):].lstrip("/")
    url = base + "/" + path
    if request.query_string:
        url += "?" + request.query_string.decode("utf-8")

    headers = {"Authorization": "Token " + token}
    if request.headers.get("Accept"):
        headers["Accept"] = request.headers.get("Accept")

    try:
        r = requests.get(url, headers=headers, timeout=30)

        excluded = {"transfer-encoding", "connection", "content-encoding", "content-length"}
        resp_headers = [(k, v) for k, v in r.headers.items() if k.lower() not in excluded]

        return Response(r.content, status=r.status_code, headers=dict(resp_headers))
    except requests.RequestException as e:
        current_app.logger.warning("Paperless proxy error: %s", e)
        return Response(
            '{"detail": "Erro ao comunicar com o Paperless."}',
            status=502,
            mimetype="application/json",
        )


@paperless_bp.route("/", defaults={"path": ""}, methods=["GET"])
@paperless_bp.route("/<path:path>", methods=["GET"])
@login_required
def proxy(path):
    """Qualquer caminho GET sob /api/paperless/ é repassado ao Paperless-ngx."""
    return _proxy_request()
