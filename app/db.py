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

            CREATE TABLE IF NOT EXISTS comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                protocolo_id INTEGER NOT NULL,
                usuario_id INTEGER NOT NULL,
                usuario_nome TEXT NOT NULL,
                conteudo TEXT NOT NULL,
                criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_comments_protocolo
                ON comments(protocolo_id);

            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                destinatario_id INTEGER NOT NULL,
                remetente_id INTEGER NOT NULL,
                remetente_nome TEXT NOT NULL,
                comment_id INTEGER NOT NULL,
                protocolo_id INTEGER NOT NULL,
                previa TEXT NOT NULL,
                lida INTEGER NOT NULL DEFAULT 0,
                criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_notifications_destinatario
                ON notifications(destinatario_id, lida);

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            INSERT OR IGNORE INTO settings (key, value) VALUES ('protocolo_dias_alerta1', '10');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('protocolo_dias_alerta2', '20');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('protocolo_cor_alerta1', '#d97706');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('protocolo_cor_alerta2', '#b91c1c');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('cartorio_denominacao', 'Tabelião de Notas e de Protesto de Letras e Títulos de Itápolis-SP');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('cartorio_endereco', 'Rua Barão do Rio Branco, n. 378 – Centro, Itápolis-SP (CEP 14900-057)');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('cartorio_email', 'contato@cartorioitapolis.com.br');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('cartorio_telefone', '(16) 3273 9448');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('cartorio_site', 'www.cartorioitapolis.com.br');

            CREATE TABLE IF NOT EXISTS internal_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                titulo TEXT NOT NULL,
                corpo TEXT NOT NULL,
                criado_por_id INTEGER NOT NULL,
                criado_por_nome TEXT NOT NULL,
                criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                ativa INTEGER NOT NULL DEFAULT 1
            );
            CREATE INDEX IF NOT EXISTS idx_internal_messages_ativa
                ON internal_messages(ativa);

            CREATE TABLE IF NOT EXISTS internal_message_reads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id INTEGER NOT NULL,
                usuario_id INTEGER NOT NULL,
                usuario_nome TEXT NOT NULL,
                lida_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(message_id, usuario_id)
            );
            CREATE INDEX IF NOT EXISTS idx_internal_reads_message
                ON internal_message_reads(message_id);

            CREATE TABLE IF NOT EXISTS registro_bloqueios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tabela_id INTEGER NOT NULL,
                row_id INTEGER NOT NULL,
                bloqueado_por_id INTEGER NOT NULL,
                bloqueado_por_nome TEXT NOT NULL,
                bloqueado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                desbloqueado_por_id INTEGER,
                desbloqueado_por_nome TEXT,
                desbloqueado_em DATETIME
            );
            CREATE INDEX IF NOT EXISTS idx_registro_bloqueios_registro
                ON registro_bloqueios(tabela_id, row_id);
        """)
        conn.commit()
        conn.close()
