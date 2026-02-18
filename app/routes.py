# app/routes.py — Blueprint: rotas principais (index, cadastrar, consultar)
from pathlib import Path

from flask import Blueprint, current_app, render_template
from flask_login import login_required

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
@perfil_required("master", "administrador")
def consultar():
    return render_template("consultar.html")


@main_bp.route("/relatorios")
@login_required
@perfil_required("master", "administrador")
def relatorios():
    return render_template("relatorios.html")


@main_bp.route("/protocolo/<int:protocolo_id>")
@login_required
@perfil_required("master", "administrador", "escrevente")
def protocolo_detalhe(protocolo_id):
    return render_template("protocolo.html", protocolo_id=protocolo_id)


