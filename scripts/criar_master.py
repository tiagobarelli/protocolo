#!/usr/bin/env python3
# scripts/criar_master.py — Cria o usuário master inicial no SQLite
import os
import sqlite3
import sys
from pathlib import Path

# Raiz do projeto (pasta que contém app/ e scripts/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv

load_dotenv(PROJECT_ROOT / ".env")

DATABASE_PATH = os.environ.get("DATABASE_PATH", str(PROJECT_ROOT / "data" / "sistema.db"))
if not os.path.isabs(DATABASE_PATH):
    DATABASE_PATH = str(PROJECT_ROOT / DATABASE_PATH.replace("/", os.sep).lstrip(os.sep))

MASTER_NOME = "Tiago Barelli"
MASTER_EMAIL = "tiagobarelli@gmail.com"
MASTER_PERFIL = "master"
# Senha inicial: altere após o primeiro login em produção
MASTER_SENHA_PADRAO = "Altere@123"


def main():
    import bcrypt

    Path(DATABASE_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH)
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
    """)
    conn.commit()

    cur = conn.execute("SELECT id FROM users WHERE email = ?", (MASTER_EMAIL,))
    if cur.fetchone() is not None:
        print("Usuário master já existe (email: {}). Nada a fazer.".format(MASTER_EMAIL))
        conn.close()
        return

    senha_hash = bcrypt.hashpw(MASTER_SENHA_PADRAO.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    conn.execute(
        "INSERT INTO users (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)",
        (MASTER_NOME, MASTER_EMAIL, senha_hash, MASTER_PERFIL),
    )
    conn.commit()
    conn.close()
    print("Usuário master criado com sucesso.")
    print("  E-mail: {}".format(MASTER_EMAIL))
    print("  Senha inicial: {} (altere após o primeiro login)".format(MASTER_SENHA_PADRAO))


if __name__ == "__main__":
    main()
