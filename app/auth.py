# app/auth.py — Blueprint: login, logout, sessão
from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import login_user, logout_user

from app.models import User

auth_bp = Blueprint("auth", __name__, url_prefix="/")


@auth_bp.route("login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return render_template("login.html")
    email = (request.form.get("email") or "").strip()
    senha = request.form.get("senha") or ""
    if not email or not senha:
        flash("Informe e-mail e senha.", "error")
        return render_template("login.html"), 400
    user = User.get_by_email(email)
    if user is None or not user.ativo:
        flash("E-mail ou senha inválidos.", "error")
        return render_template("login.html"), 401
    if not user.check_password(senha):
        flash("E-mail ou senha inválidos.", "error")
        return render_template("login.html"), 401
    login_user(user, remember=False)
    return redirect(url_for("main.index"))


@auth_bp.route("logout")
def logout():
    logout_user()
    flash("Você saiu do sistema.", "info")
    return redirect(url_for("auth.login"))
