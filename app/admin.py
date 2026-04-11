# app/admin.py — Blueprint: gerenciamento de usuários (master only)
import re

from flask import Blueprint, flash, jsonify, redirect, render_template, request, url_for
from flask_login import login_required

from app.models import User
from app.permissions import perfil_required
from app.settings import Settings

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")


@admin_bp.route("/usuarios")
@login_required
@perfil_required("master")
def usuarios():
    users = User.get_all()
    master_user = User.get_master()
    return render_template("admin_usuarios.html", users=users, master_user=master_user)


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


@admin_bp.route("/usuarios/master/editar", methods=["POST"])
@login_required
@perfil_required("master")
def usuarios_master_editar():
    master_user = User.get_master()
    if master_user is None:
        flash("Usuário master não encontrado.", "error")
        return redirect(url_for("admin.usuarios"))

    nome = (request.form.get("nome") or "").strip()
    email = (request.form.get("email") or "").strip().lower()

    if not nome or not email:
        flash("Nome e e-mail são obrigatórios.", "error")
        return redirect(url_for("admin.usuarios"))

    existing = User.get_by_email(email)
    if existing and existing.id != master_user.id:
        flash("Já existe outro usuário com este e-mail.", "error")
        return redirect(url_for("admin.usuarios"))

    if master_user.update(nome, email, perfil="master", ativo=1):
        flash("Dados do master atualizados com sucesso.", "success")
    else:
        flash("Erro ao atualizar dados do master.", "error")
    return redirect(url_for("admin.usuarios"))


@admin_bp.route("/usuarios/master/senha", methods=["POST"])
@login_required
@perfil_required("master")
def usuarios_master_senha():
    master_user = User.get_master()
    if master_user is None:
        flash("Usuário master não encontrado.", "error")
        return redirect(url_for("admin.usuarios"))

    nova_senha = request.form.get("nova_senha") or ""
    confirmar = request.form.get("confirmar_senha") or ""

    if len(nova_senha) < 6:
        flash("A senha deve ter no mínimo 6 caracteres.", "error")
        return redirect(url_for("admin.usuarios"))

    if nova_senha != confirmar:
        flash("As senhas não conferem.", "error")
        return redirect(url_for("admin.usuarios"))

    master_user.update_password(nova_senha)
    flash("Senha do master alterada com sucesso.", "success")
    return redirect(url_for("admin.usuarios"))


# ─── Configurações ────────────────────────────────────────

@admin_bp.route("/configuracoes")
@login_required
@perfil_required("master")
def configuracoes():
    return render_template("configuracoes.html")


@admin_bp.route("/configuracoes/salvar", methods=["POST"])
@login_required
@perfil_required("master")
def configuracoes_salvar():
    data = request.get_json(silent=True) or {}

    chaves_permitidas = {
        'protocolo_dias_alerta1', 'protocolo_dias_alerta2',
        'protocolo_cor_alerta1', 'protocolo_cor_alerta2',
        'cartorio_denominacao', 'cartorio_endereco',
        'cartorio_email', 'cartorio_telefone', 'cartorio_site',
    }

    salvar = {}
    for key, value in data.items():
        if key in chaves_permitidas:
            salvar[key] = value.strip() if isinstance(value, str) else value

    dias1 = salvar.get('protocolo_dias_alerta1')
    dias2 = salvar.get('protocolo_dias_alerta2')
    if dias1 is not None and dias2 is not None:
        try:
            d1 = int(dias1)
            d2 = int(dias2)
            if d1 <= 0 or d2 <= 0:
                return jsonify(ok=False, erro="Os dias devem ser maiores que zero."), 400
            if d1 >= d2:
                return jsonify(ok=False, erro="O primeiro alerta deve ter menos dias que o segundo."), 400
        except (ValueError, TypeError):
            return jsonify(ok=False, erro="Dias inválidos."), 400

    hex_re = re.compile(r'^#[0-9a-fA-F]{6}$')
    for ck in ('protocolo_cor_alerta1', 'protocolo_cor_alerta2'):
        if ck in salvar and not hex_re.match(salvar[ck]):
            return jsonify(ok=False, erro="Cor inválida: " + salvar[ck]), 400

    try:
        Settings.set_many(salvar)
        return jsonify(ok=True)
    except Exception as e:
        return jsonify(ok=False, erro=str(e)), 500
