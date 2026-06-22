# app/cep_proxy.py — Consulta de CEP via ViaCEP (API pública, sem token)
import re
import requests
from flask import Blueprint, current_app, jsonify
from flask_login import login_required

cep_bp = Blueprint("cep", __name__, url_prefix="/api/cep")

_CEP_RE = re.compile(r"^\d{8}$")


@cep_bp.route("/<cep>", methods=["GET"])
@login_required
def consultar_cep(cep):
    """Consulta um CEP na API pública ViaCEP e devolve JSON normalizado.

    Regras de segurança:
    - Aceita SOMENTE 8 dígitos numéricos (impede SSRF / URLs arbitrárias).
    - Chama exclusivamente o host fixo VIACEP_URL.
    """
    if not _CEP_RE.match(cep or ""):
        return jsonify(ok=False, erro="CEP inválido. Informe 8 dígitos."), 400

    base = current_app.config["VIACEP_URL"]
    url = base + "/" + cep + "/json/"

    try:
        r = requests.get(url, timeout=5)
        r.raise_for_status()
        data = r.json()
    except requests.RequestException as e:
        current_app.logger.warning("ViaCEP erro: %s", e)
        return jsonify(ok=False, erro="Não foi possível consultar o CEP."), 502
    except ValueError as e:
        current_app.logger.warning("ViaCEP resposta inválida: %s", e)
        return jsonify(ok=False, erro="Resposta inválida do serviço de CEP."), 502

    # ViaCEP devolve {"erro": true} com HTTP 200 quando o CEP não existe
    if isinstance(data, dict) and data.get("erro"):
        return jsonify(ok=False, erro="CEP não encontrado.", nao_encontrado=True), 404

    # Normalização — devolve apenas o necessário para o front
    normalizado = {
        "cep": (data.get("cep") or "").replace("-", ""),
        "logradouro": data.get("logradouro") or "",
        "complemento": data.get("complemento") or "",
        "bairro": data.get("bairro") or "",
        "municipio": data.get("localidade") or "",  # ViaCEP chama de "localidade"
        "uf": data.get("uf") or ""
    }
    return jsonify(ok=True, endereco=normalizado)
