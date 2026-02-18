# app/models.py — Modelo User (SQLite + flask-login)
import bcrypt
from flask_login import UserMixin

from app.db import get_db


class User(UserMixin):
    """Modelo de usuário para autenticação e autorização."""

    def __init__(self, id, nome, email, senha_hash, perfil, ativo=1, criado_em=None, ultimo_login=None):
        self.id = id
        self.nome = nome
        self.email = email
        self.senha_hash = senha_hash
        self.perfil = perfil
        self.ativo = ativo
        self.criado_em = criado_em
        self.ultimo_login = ultimo_login

    @staticmethod
    def _row_to_user(row):
        if row is None:
            return None
        return User(
            id=row["id"],
            nome=row["nome"],
            email=row["email"],
            senha_hash=row["senha_hash"],
            perfil=row["perfil"],
            ativo=row["ativo"],
            criado_em=row["criado_em"],
            ultimo_login=row["ultimo_login"],
        )

    @staticmethod
    def get_by_id(user_id):
        """Busca usuário por id. Retorna None se não existir."""
        db = get_db()
        row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return User._row_to_user(row)

    @staticmethod
    def get_by_email(email):
        """Busca usuário por email. Retorna None se não existir."""
        db = get_db()
        row = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        return User._row_to_user(row)

    @staticmethod
    def criar(nome, email, senha_plana, perfil):
        """Cria usuário com senha hasheada (bcrypt). Retorna o User ou None em caso de erro."""
        senha_hash = bcrypt.hashpw(
            senha_plana.encode("utf-8"),
            bcrypt.gensalt(),
        ).decode("utf-8")
        db = get_db()
        try:
            cur = db.execute(
                "INSERT INTO users (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)",
                (nome, email, senha_hash, perfil),
            )
            db.commit()
            return User.get_by_id(cur.lastrowid)
        except Exception:
            db.rollback()
            return None

    def check_password(self, senha_plana):
        """Verifica se a senha em texto plano confere com o hash armazenado."""
        return bcrypt.checkpw(
            senha_plana.encode("utf-8"),
            self.senha_hash.encode("utf-8"),
        )

    @staticmethod
    def get_all():
        """Retorna lista de todos os usuarios (exceto master), ordenados por nome."""
        db = get_db()
        rows = db.execute(
            "SELECT * FROM users WHERE perfil != 'master' ORDER BY nome"
        ).fetchall()
        return [User._row_to_user(r) for r in rows]

    def update(self, nome, email, perfil, ativo):
        """Atualiza dados do usuario. Retorna True se ok, False se erro (ex: email duplicado)."""
        db = get_db()
        try:
            db.execute(
                "UPDATE users SET nome = ?, email = ?, perfil = ?, ativo = ? WHERE id = ?",
                (nome, email, perfil, ativo, self.id),
            )
            db.commit()
            self.nome = nome
            self.email = email
            self.perfil = perfil
            self.ativo = ativo
            return True
        except Exception:
            db.rollback()
            return False

    def update_password(self, nova_senha):
        """Atualiza a senha do usuario com hash bcrypt."""
        senha_hash = bcrypt.hashpw(
            nova_senha.encode("utf-8"),
            bcrypt.gensalt(),
        ).decode("utf-8")
        db = get_db()
        db.execute(
            "UPDATE users SET senha_hash = ? WHERE id = ?",
            (senha_hash, self.id),
        )
        db.commit()
        self.senha_hash = senha_hash
