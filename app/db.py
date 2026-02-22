# app/db.py — Inicialização SQLite e criação de tabelas
import os
import sqlite3
from pathlib import Path

from flask import g, current_app


def get_db_path(app=None):
    """Retorna o caminho absoluto do banco a partir da config do app."""
    app = app or current_app
    path = app.config["DATABASE_PATH"]
    if not os.path.isabs(path):
        path = str(Path(app.root_path).parent / path.replace("/", os.sep).lstrip(os.sep))
    return path


def get_db():
    """Obtém conexão SQLite para o request atual (armazena em g)."""
    if "db" not in g:
        db_path = get_db_path()
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        g.db = sqlite3.connect(db_path)
        g.db.row_factory = sqlite3.Row
    return g.db


def close_db(e=None):
    """Fecha a conexão ao final do request."""
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db(app):
    """Cria a tabela users se não existir."""
    with app.app_context():
        db_path = get_db_path(app)
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(db_path)
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                senha_hash TEXT NOT NULL,
                perfil TEXT NOT NULL CHECK(perfil IN ('master', 'administrador', 'escrevente')),
                ativo INTEGER NOT NULL DEFAULT 1,
                criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                ultimo_login DATETIME
            );

            CREATE TABLE IF NOT EXISTS protocol_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                protocolo_id INTEGER NOT NULL,
                nome_original TEXT NOT NULL,
                nome_disco TEXT NOT NULL,
                extensao TEXT NOT NULL,
                tamanho INTEGER NOT NULL,
                usuario_id INTEGER NOT NULL,
                usuario_nome TEXT NOT NULL,
                criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_protocol_files_protocolo
                ON protocol_files(protocolo_id);
        """)
        conn.commit()
        conn.close()
