# app/config.py — Configurações do Flask (carrega .env)
import os
from pathlib import Path

from dotenv import load_dotenv

# Carrega variáveis do .env a partir da raiz do projeto
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


class BaseConfig:
    """Configuração base."""
    SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", "dev-secret-change-in-production")
    DATABASE_PATH = os.environ.get("DATABASE_PATH", str(BASE_DIR / "data" / "sistema.db"))

    # Baserow (proxy na Fase 2)
    BASEROW_URL = os.environ.get("BASEROW_URL", "http://192.168.0.31:8084").rstrip("/")
    BASEROW_TOKEN = os.environ.get("BASEROW_TOKEN", "")
    BASEROW_DATABASE_ID = os.environ.get("BASEROW_DATABASE_ID", "195")
    BASEROW_TABLE_CLIENTES = os.environ.get("BASEROW_TABLE_CLIENTES", "754")
    BASEROW_TABLE_PROTOCOLO = os.environ.get("BASEROW_TABLE_PROTOCOLO", "755")
    BASEROW_TABLE_SERVICOS = os.environ.get("BASEROW_TABLE_SERVICOS", "746")

    # Paperless-ngx (proxy somente leitura)
    PAPERLESS_URL = os.environ.get("PAPERLESS_URL", "http://192.168.0.31:8094").rstrip("/")
    PAPERLESS_TOKEN = os.environ.get("PAPERLESS_TOKEN", "")


class DevConfig(BaseConfig):
    """Configuração de desenvolvimento."""
    FLASK_ENV = os.environ.get("FLASK_ENV", "development")
    DEBUG = os.environ.get("FLASK_DEBUG", "1") == "1"
