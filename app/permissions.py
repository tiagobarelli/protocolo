# app/permissions.py — Decorators: @perfil_required
from functools import wraps

from flask import flash, redirect, url_for
from flask_login import current_user, login_required


def perfil_required(*perfis):
    """Exige login e que current_user.perfil esteja em perfis. Caso contrário, redireciona para / com flash."""

    def decorator(f):
        @wraps(f)
        def inner(*args, **kwargs):
            if not current_user.is_authenticated:
                return redirect(url_for("auth.login"))
            if current_user.perfil not in perfis:
                flash("Acesso negado. Você não tem permissão para esta página.", "error")
                return redirect(url_for("main.index"))
            return f(*args, **kwargs)

        return inner

    return decorator
