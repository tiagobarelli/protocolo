# app/__init__.py — create_app(), configuração Flask
from flask import Flask
from flask_login import LoginManager

from app.config import ProdConfig
from app.db import close_db, init_db
from app.models import User


def create_app(config=None):
    app = Flask(__name__)
    app.config.from_object(config or ProdConfig)

    init_db(app)
    app.teardown_appcontext(close_db)

    from app.settings import Settings, derivar_cores_alerta

    @app.context_processor
    def inject_settings():
        try:
            all_settings = Settings.get_all()
            cor1 = all_settings.get('protocolo_cor_alerta1', '#d97706')
            cor2 = all_settings.get('protocolo_cor_alerta2', '#b91c1c')
            all_settings['_alerta1_cores'] = derivar_cores_alerta(cor1)
            all_settings['_alerta2_cores'] = derivar_cores_alerta(cor2)
        except Exception:
            all_settings = {}
        return dict(app_settings=all_settings)

    login_manager = LoginManager(app)
    login_manager.login_view = "auth.login"
    login_manager.login_message = "Faça login para acessar esta página."
    login_manager.login_message_category = "info"

    @login_manager.user_loader
    def load_user(user_id):
        return User.get_by_id(int(user_id))

    from app.auth import auth_bp
    from app.routes import main_bp
    from app.baserow_proxy import baserow_bp
    from app.admin import admin_bp
    from app.paperless_proxy import paperless_bp
    from app.cep_proxy import cep_bp
    from app.uploads import uploads_bp
    from app.comments import comments_bp, users_bp
    from app.notifications import notifications_bp
    from app.email_proxy import email_bp
    from app.protocolo_api import protocolo_api_bp
    from app.internal_messages import internal_messages_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)
    app.register_blueprint(baserow_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(paperless_bp)
    app.register_blueprint(cep_bp)
    app.register_blueprint(uploads_bp)
    app.register_blueprint(comments_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(email_bp)
    app.register_blueprint(protocolo_api_bp)
    app.register_blueprint(internal_messages_bp)

    return app
