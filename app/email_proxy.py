# app/email_proxy.py — Blueprint para envio de e-mails via SMTP
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from flask import Blueprint, current_app, jsonify, request
from flask_login import login_required

email_bp = Blueprint("email", __name__, url_prefix="/api/email")


def _formatar_data(data_str):
    """Converte YYYY-MM-DD para DD/MM/YYYY."""
    if not data_str:
        return ""
    partes = data_str.split("-")
    if len(partes) != 3:
        return data_str
    return f"{partes[2]}/{partes[1]}/{partes[0]}"


@email_bp.route("/protocolo-cadastrado", methods=["POST"])
@login_required
def enviar_email_protocolo():
    dados = request.get_json(silent=True) or {}

    destinatario_email = (dados.get("destinatario_email") or "").strip()
    numero_protocolo = (dados.get("numero_protocolo") or "").strip()

    if not destinatario_email or not numero_protocolo:
        return jsonify(ok=False, erro="Dados insuficientes."), 400

    cfg = current_app.config
    mail_host = cfg["MAIL_SMTP_HOST"]
    mail_port = cfg["MAIL_SMTP_PORT"]
    mail_user = cfg["MAIL_USERNAME"]
    mail_pass = cfg["MAIL_PASSWORD"]
    sender_name = cfg["MAIL_SENDER_NAME"]

    destinatario_nome = dados.get("destinatario_nome") or ""
    servico = dados.get("servico") or ""
    data_entrada = _formatar_data(dados.get("data_entrada"))
    agendado_para = dados.get("agendado_para") or ""
    hora_agendamento = dados.get("hora_agendamento") or ""
    responsavel = dados.get("responsavel") or ""
    detalhamentos = dados.get("detalhamentos") or ""

    # Formatar agendamento
    agendado_formatado = ""
    if agendado_para:
        agendado_formatado = _formatar_data(agendado_para)
        if hora_agendamento:
            agendado_formatado += " às " + hora_agendamento

    # Blocos condicionais
    bloco_agendado = ""
    if agendado_para:
        bloco_agendado = (
            '      <div class="field-label">Agendado Para</div>\n'
            '      <div class="field-value">{agendado}</div>\n'
        ).format(agendado=agendado_formatado)

    bloco_detalhamentos = ""
    if detalhamentos:
        bloco_detalhamentos = (
            '      <div class="field-label">Detalhamentos</div>\n'
            '      <div class="detalhamentos-box">{det}</div>\n'
        ).format(det=detalhamentos)

    assunto = "Protocolo {num} — {svc} | {sender}".format(
        num=numero_protocolo, svc=servico, sender=sender_name
    )

    corpo_html = (
        '<!DOCTYPE html>\n'
        '<html lang="pt-BR">\n'
        '<head>\n'
        '  <meta charset="UTF-8">\n'
        '  <style>\n'
        '    body {{ font-family: Arial, sans-serif; color: #333; font-size: 14px; }}\n'
        '    .container {{ max-width: 600px; margin: 0 auto; padding: 24px; }}\n'
        '    .header {{ background-color: #4a5e4a; color: #fff; padding: 16px 24px;\n'
        '              border-radius: 6px 6px 0 0; }}\n'
        '    .header h2 {{ margin: 0; font-size: 18px; }}\n'
        '    .body {{ border: 1px solid #ddd; border-top: none; padding: 24px;\n'
        '            border-radius: 0 0 6px 6px; }}\n'
        '    .field-label {{ font-size: 11px; text-transform: uppercase;\n'
        '                   color: #888; margin-bottom: 2px; }}\n'
        '    .field-value {{ font-size: 14px; color: #222; margin-bottom: 16px; }}\n'
        '    .detalhamentos-box {{ background-color: #f5f5f5; border-left: 3px solid #4a5e4a;\n'
        '                          padding: 12px 16px; border-radius: 4px; margin-top: 8px;\n'
        '                          font-size: 13px; white-space: pre-wrap; }}\n'
        '    .footer {{ margin-top: 24px; font-size: 12px; color: #aaa; text-align: center; }}\n'
        '  </style>\n'
        '</head>\n'
        '<body>\n'
        '  <div class="container">\n'
        '    <div class="header">\n'
        '      <h2>Confirmação de Protocolo</h2>\n'
        '    </div>\n'
        '    <div class="body">\n'
        '      <p>Olá, <strong>{dest_nome}</strong>. Seu protocolo foi registrado\n'
        '         com sucesso. Você responder a este e-mail em caso de dúvida ou complementação de documentação.</p>\n'
        '\n'
        '      <div class="field-label">Número do Protocolo</div>\n'
        '      <div class="field-value">{num_proto}</div>\n'
        '\n'
        '      <div class="field-label">Serviço Solicitado</div>\n'
        '      <div class="field-value">{servico}</div>\n'
        '\n'
        '      <div class="field-label">Data de Entrada</div>\n'
        '      <div class="field-value">{data_entrada}</div>\n'
        '\n'
        '{bloco_agendado}'
        '      <div class="field-label">Responsável</div>\n'
        '      <div class="field-value">{responsavel}</div>\n'
        '\n'
        '{bloco_detalhamentos}'
        '    </div>\n'
        '    <div class="footer">{sender_name}</div>\n'
        '  </div>\n'
        '</body>\n'
        '</html>'
    ).format(
        dest_nome=destinatario_nome,
        num_proto=numero_protocolo,
        servico=servico,
        data_entrada=data_entrada,
        bloco_agendado=bloco_agendado,
        responsavel=responsavel,
        bloco_detalhamentos=bloco_detalhamentos,
        sender_name=sender_name,
    )

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = assunto
        msg["From"] = "{name} <{addr}>".format(name=sender_name, addr=mail_user)
        msg["To"] = destinatario_email
        msg.attach(MIMEText(corpo_html, "html", "utf-8"))

        with smtplib.SMTP(mail_host, mail_port) as server:
            server.starttls()
            server.login(mail_user, mail_pass)
            server.sendmail(mail_user, [destinatario_email], msg.as_string())

        return jsonify(ok=True), 200

    except Exception as exc:
        current_app.logger.error("Falha ao enviar e-mail para %s: %s", destinatario_email, exc)
        return jsonify(ok=False, erro="Falha no envio do e-mail."), 500
