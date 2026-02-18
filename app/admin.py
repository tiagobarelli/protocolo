# app/admin.py — Blueprint: gerenciamento de usuários (master only)
from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import login_required

from app.models import User
from app.permissions import perfil_required

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")


@admin_bp.route("/usuarios")
@login_required
@perfil_required("master")
def usuarios():
    users = User.get_all()
    return render_template("admin_usuarios.html", users=users)


@admin_bp.route("/usuarios/criar", methods=["POST"])
@login_required
@perfil_required("master")
def usuarios_criar():
    nome = (request.form.get("nome") or "").strip()
    email = (request.form.get("email") or "").strip().lower()
    senha = request.form.get("senha") or ""
    perfil = request.form.get("perfil") or ""

    if not nome or not email or not senha:
        flash("Preencha todos os campos obrigatórios.", "error")
        return redirect(url_for("admin.usuarios"))

    if perfil not in ("administrador", "escrevente"):
        flash("Perfil inválido.", "error")
        return redirect(url_for("admin.usuarios"))

    if len(senha) < 6:
        flash("A senha deve ter no mínimo 6 caracteres.", "error")
        return redirect(url_for("admin.usuarios"))

    if User.get_by_email(email):
        flash("Já existe um usuário com este e-mail.", "error")
        return redirect(url_for("admin.usuarios"))

    user = User.criar(nome, email, senha, perfil)
    if user:
        flash("Usuário " + user.nome + " criado com sucesso.", "success")
    else:
        flash("Erro ao criar usuário.", "error")
    return redirect(url_for("admin.usuarios"))


@admin_bp.route("/usuarios/<int:user_id>/editar", methods=["POST"])
@login_required
@perfil_required("master")
def usuarios_editar(user_id):
    user = User.get_by_id(user_id)
    if user is None or user.perfil == "master":
        flash("Usuário não encontrado.", "error")
        return redirect(url_for("admin.usuarios"))

    nome = (request.form.get("nome") or "").strip()
    email = (request.form.get("email") or "").strip().lower()
    perfil = request.form.get("perfil") or ""
    ativo = 1 if request.form.get("ativo") else 0

    if not nome or not email:
        flash("Nome e e-mail são obrigatórios.", "error")
        return redirect(url_for("admin.usuarios"))

    if perfil not in ("administrador", "escrevente"):
        flash("Perfil inválido.", "error")
        return redirect(url_for("admin.usuarios"))

    existing = User.get_by_email(email)
    if existing and existing.id != user.id:
        flash("Já existe outro usuário com este e-mail.", "error")
        return redirect(url_for("admin.usuarios"))

    if user.update(nome, email, perfil, ativo):
        flash("Usuário " + user.nome + " atualizado.", "success")
    else:
        flash("Erro ao atualizar usuário.", "error")
    return redirect(url_for("admin.usuarios"))


@admin_bp.route("/usuarios/<int:user_id>/senha", methods=["POST"])
@login_required
@perfil_required("master")
def usuarios_senha(user_id):
    user = User.get_by_id(user_id)
    if user is None or user.perfil == "master":
        flash("Usuário não encontrado.", "error")
        return redirect(url_for("admin.usuarios"))

    nova_senha = request.form.get("nova_senha") or ""
    confirmar = request.form.get("confirmar_senha") or ""

    if len(nova_senha) < 6:
        flash("A senha deve ter no mínimo 6 caracteres.", "error")
        return redirect(url_for("admin.usuarios"))

    if nova_senha != confirmar:
        flash("As senhas não conferem.", "error")
        return redirect(url_for("admin.usuarios"))

    user.update_password(nova_senha)
    flash("Senha de " + user.nome + " alterada com sucesso.", "success")
    return redirect(url_for("admin.usuarios"))
