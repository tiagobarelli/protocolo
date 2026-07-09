# app/routes.py — Blueprint: rotas principais (index, cadastrar, consultar)
from pathlib import Path
from urllib.parse import quote as url_quote

import markdown as md
import requests as http_requests

from flask import Blueprint, current_app, jsonify, render_template
from flask_login import current_user, login_required

from app.permissions import perfil_required

main_bp = Blueprint("main", __name__)


@main_bp.route("/")
@login_required
def index():
    return render_template("index.html")


@main_bp.route("/cadastrar")
@login_required
@perfil_required("master", "administrador", "escrevente")
def cadastrar():
    template_certidao = ""
    certidao_path = Path(current_app.root_path).parent / "Certidão_Notarial.md"
    if certidao_path.exists():
        template_certidao = certidao_path.read_text(encoding="utf-8")
    return render_template("cadastrar.html", template_certidao=template_certidao)


@main_bp.route("/consultar")
@login_required
@perfil_required("master", "administrador", "escrevente")
def consultar():
    return render_template("consultar.html")


@main_bp.route("/clientes")
@login_required
@perfil_required("master", "administrador", "escrevente")
def clientes():
    return render_template("clientes.html")


@main_bp.route("/clientes-pj")
@login_required
@perfil_required("master", "administrador", "escrevente")
def clientes_pj():
    return render_template("clientes_pj.html")


@main_bp.route("/controle")
@login_required
@perfil_required("master", "administrador")
def controle():
    return render_template("controle.html")


@main_bp.route("/controle-certidoes")
@login_required
@perfil_required("master", "administrador")
def controle_certidoes():
    return render_template("controle_certidoes.html")


@main_bp.route("/relatorios/controle-atos")
@login_required
@perfil_required("master", "administrador")
def relatorio_controle_atos():
    return render_template("relatorio_controle_atos.html")


@main_bp.route("/relatorios/controle-certidoes")
@login_required
@perfil_required("master", "administrador")
def relatorio_controle_certidoes():
    return render_template("relatorio_controle_certidoes.html")


@main_bp.route("/estatisticas")
@login_required
@perfil_required("master")
def estatisticas():
    return render_template("estatisticas.html")


@main_bp.route("/retificacoes")
@login_required
@perfil_required("master", "administrador")
def retificacoes():
    return render_template("retificacoes.html")


@main_bp.route("/substabelecimentos")
@login_required
@perfil_required("master", "administrador")
def substabelecimentos():
    return render_template("substabelecimentos.html")


@main_bp.route("/revogacao-procuracao")
@login_required
@perfil_required("master", "administrador")
def revogacao_procuracao():
    return render_template("revogacao_procuracao.html")


@main_bp.route("/relatorios/coaf")
@login_required
@perfil_required("master", "administrador")
def relatorio_coaf():
    return render_template("relatorio_coaf.html")


@main_bp.route("/coaf")
@login_required
@perfil_required("master", "administrador")
def coaf():
    return render_template("coaf.html")


@main_bp.route("/calendario")
@login_required
@perfil_required("master", "administrador", "escrevente")
def calendario():
    return render_template("calendario.html")


@main_bp.route("/protocolo/<int:protocolo_id>")
@login_required
@perfil_required("master", "administrador", "escrevente")
def protocolo_detalhe(protocolo_id):
    return render_template("protocolo.html", protocolo_id=protocolo_id)


@main_bp.route("/protocolo/<int:protocolo_id>/imprimir")
@login_required
@perfil_required("master", "administrador", "escrevente")
def protocolo_imprimir(protocolo_id):
    return render_template("imprimir.html", protocolo_id=protocolo_id)


@main_bp.route("/changelog")
@login_required
def changelog():
    changelog_html = ""
    changelog_path = Path(current_app.root_path).parent / "CHANGELOG.md"
    if changelog_path.exists():
        raw = changelog_path.read_text(encoding="utf-8")
        changelog_html = md.markdown(raw, extensions=["fenced_code", "nl2br"])
    return render_template("changelog.html", changelog_html=changelog_html)


@main_bp.route("/oficios")
@login_required
def oficios():
    return render_template("oficios.html")


@main_bp.route("/oficios/recebido")
@main_bp.route("/oficios/recebido/<int:oficio_id>")
@login_required
def oficio_recebido(oficio_id=None):
    return render_template("oficio_detalhe.html", tipo="recebido", oficio_id=oficio_id)


@main_bp.route("/oficios/enviado")
@main_bp.route("/oficios/enviado/<int:oficio_id>")
@login_required
def oficio_enviado(oficio_id=None):
    return render_template("oficio_detalhe.html", tipo="enviado", oficio_id=oficio_id)


@main_bp.route("/notificacoes")
@login_required
def notificacoes():
    return render_template("notificacoes.html")


@main_bp.route("/todo")
@login_required
def todo():
    return render_template("todo.html")


@main_bp.route("/api/todo/count")
@login_required
def todo_count():
    token = current_app.config.get("BASEROW_TOKEN", "")
    base_url = current_app.config.get("BASEROW_URL", "")
    nome_encoded = url_quote(current_user.nome, safe="")
    url = (
        base_url + "/api/database/rows/table/778/"
        "?filter__field_7460__boolean=true"
        "&filter__field_7461__boolean=false"
        "&filter__field_7464__equal=" + nome_encoded +
        "&page_size=1"
    )
    try:
        resp = http_requests.get(
            url,
            headers={"Authorization": "Token " + token},
            timeout=10,
        )
        count = resp.json().get("count", 0) if resp.ok else 0
    except Exception:
        count = 0
    return jsonify({"count": count})


