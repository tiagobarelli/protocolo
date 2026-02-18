# wsgi.py — Entry point para Gunicorn
from app import create_app

app = create_app()
