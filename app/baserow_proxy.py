# app/baserow_proxy.py — Proxy de API para o Baserow (token no servidor)
import requests
from flask import Blueprint, current_app, request, Response, stream_with_context
from flask_login import login_required

baserow_bp = Blueprint("baserow", __name__, url_prefix="/api/baserow")


def _proxy_request():
    """Repassa a requisição atual para o Baserow com o token de autorização."""
    base = current_app.config["BASEROW_URL"]
    token = current_app.config.get("BASEROW_TOKEN")
    if not token:
        return Response('{"detail": "Baserow não configurado."}', status=502, mimetype="application/json")

    path = request.path[len(baserow_bp.url_prefix) :].lstrip("/")
    url = base + "/api/" + path
    if request.query_string:
        url += "?" + request.query_string.decode("utf-8")

    headers = {"Authorization": "Token " + token}
    if request.content_type:
        headers["Content-Type"] = request.content_type
    if request.headers.get("Accept"):
        headers["Accept"] = request.headers.get("Accept")

    try:
        if request.method == "GET":
            r = requests.get(url, headers=headers, timeout=30, stream=True)
        elif request.method == "POST":
            r = requests.post(url, headers=headers, data=request.get_data(), timeout=30)
        elif request.method == "PATCH":
            r = requests.patch(url, headers=headers, data=request.get_data(), timeout=30)
        elif request.method == "PUT":
            r = requests.put(url, headers=headers, data=request.get_data(), timeout=30)
        elif request.method == "DELETE":
            r = requests.delete(url, headers=headers, timeout=30)
        else:
            return Response('{"detail": "Método não permitido."}', status=405, mimetype="application/json")

        excluded = ("Transfer-Encoding", "Connection", "Content-Encoding")
        resp_headers = [(k, v) for k, v in r.headers.items() if k not in excluded]

        if request.method == "GET" and r.headers.get("Transfer-Encoding") == "chunked":
            return Response(
                stream_with_context(r.iter_content(chunk_size=8192)),
                status=r.status_code,
                headers=dict(resp_headers),
            )
        return Response(r.content, status=r.status_code, headers=dict(resp_headers))
    except requests.RequestException as e:
        current_app.logger.warning("Baserow proxy error: %s", e)
        return Response(
            '{"detail": "Erro ao comunicar com o Baserow."}',
            status=502,
            mimetype="application/json",
        )


@baserow_bp.route("/", defaults={"path": ""}, methods=["GET", "POST", "PATCH", "PUT", "DELETE"])
@baserow_bp.route("/<path:path>", methods=["GET", "POST", "PATCH", "PUT", "DELETE"])
@login_required
def proxy(path):
    """Qualquer método e caminho sob /api/baserow/ é repassado ao Baserow."""
    return _proxy_request()
