# app/protocolo_api.py — Cadastro de protocolo com autonumeração
import requests
from flask import Blueprint, current_app, jsonify, request
from flask_login import login_required

protocolo_api_bp = Blueprint("protocolo_api", __name__, url_prefix="/api/protocolo")

MAX_TENTATIVAS = 3


@protocolo_api_bp.route("/cadastrar", methods=["POST"])
@login_required
def cadastrar():
    """Cria protocolo no Baserow com número sequencial automático."""
    base = current_app.config["BASEROW_URL"]
    token = current_app.config.get("BASEROW_TOKEN")
    if not token:
        return jsonify(ok=False, erro="Baserow não configurado."), 502

    headers = {"Authorization": "Token " + str(token), "Content-Type": "application/json"}
    table_url = base + "/api/database/rows/table/" + str(current_app.config.get("BASEROW_TABLE_PROTOCOLO", "755")) + "/"

    payload = request.get_json(silent=True) or {}

    for tentativa in range(MAX_TENTATIVAS):
        # 1. Obter maior número existente
        try:
            r = requests.get(
                table_url,
                headers=headers,
                params={"user_field_names": "false", "order_by": "-field_7240", "size": "1"},
                timeout=15,
            )
            r.raise_for_status()
            rows = r.json().get("results", [])
            valor_atual = rows[0]["field_7240"] if rows else None
            proximo_numero = int(valor_atual or 0) + 1
        except Exception as e:
            current_app.logger.error("Erro ao consultar próximo número: %s", e)
            return jsonify(ok=False, erro="Erro ao determinar próximo número de protocolo."), 502

        # 2. Montar payload com número gerado
        payload["field_7240"] = proximo_numero

        # 3. Criar registro no Baserow
        try:
            rp = requests.post(
                table_url + "?user_field_names=false",
                headers=headers,
                json=payload,
                timeout=15,
            )
        except Exception as e:
            current_app.logger.error("Erro ao criar protocolo no Baserow: %s", e)
            return jsonify(ok=False, erro="Erro de comunicação com o Baserow."), 502

        if rp.status_code == 200 or rp.status_code == 201:
            data = rp.json()
            return jsonify(ok=True, numero_protocolo=proximo_numero, row_id=data.get("id"), row=data)

        # 4. Verificar conflito de unicidade → retry
        try:
            err_data = rp.json()
        except Exception:
            err_data = {}

        detail = str(err_data.get("detail", ""))
        field_errors = err_data.get("field_errors", {})
        field_7240_err = str(field_errors.get("field_7240", ""))

        if "unique" in detail.lower() or "unique" in field_7240_err.lower():
            if tentativa < MAX_TENTATIVAS - 1:
                current_app.logger.info(
                    "Conflito de unicidade no protocolo %s (tentativa %d/%d), retentando...",
                    proximo_numero, tentativa + 1, MAX_TENTATIVAS,
                )
                continue
            return jsonify(ok=False, erro="Conflito de numeração. Tente novamente."), 409

        # 5. Outro erro do Baserow
        current_app.logger.warning("Erro Baserow ao criar protocolo: %s %s", rp.status_code, err_data)
        return jsonify(ok=False, erro=detail or "Erro ao cadastrar protocolo no Baserow."), 502

    return jsonify(ok=False, erro="Falha após múltiplas tentativas."), 500
