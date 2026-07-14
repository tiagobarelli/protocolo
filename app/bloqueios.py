# app/bloqueios.py — Blueprint de bloqueio de edição por registro (estado em SQLite)
#
# "Porta de vidro": a disciplina de edição vem da UI; o proxy /api/baserow não é
# alterado. Este módulo apenas guarda e serve o estado de bloqueio por registro.
# Bloqueio vigente = linha de registro_bloqueios com desbloqueado_em IS NULL.
# Desbloquear preenche as colunas de desbloqueio (nunca apaga — histórico preservado).
from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from app.db import get_db

bloqueios_bp = Blueprint("bloqueios", __name__, url_prefix="/api/bloqueios")

# Tabelas Baserow com suporte a bloqueio (as 6 páginas de gestão notarial):
# Controle 745, Certidões 776, Retificações 753, Substabelecimentos 762,
# Revogação de Procuração 777, COAF 756.
TABELAS_SUPORTADAS = {745, 776, 753, 762, 777, 756}


def _exigir_master():
    """Retorna uma resposta 403 se o usuário atual não for master; senão None."""
    if current_user.perfil != "master":
        return jsonify(ok=False, erro="Apenas o usuário master pode alterar bloqueios."), 403
    return None


def _validar_tabela(tabela_id):
    """Retorna uma resposta 400 se a tabela não está na whitelist; senão None."""
    if tabela_id not in TABELAS_SUPORTADAS:
        return jsonify(ok=False, erro="Tabela não suportada."), 400
    return None


def _bloqueio_vigente(db, tabela_id, row_id):
    """Linha do bloqueio vigente do par (tabela, registro), ou None."""
    return db.execute(
        "SELECT id, bloqueado_por_nome, bloqueado_em FROM registro_bloqueios "
        "WHERE tabela_id = ? AND row_id = ? AND desbloqueado_em IS NULL",
        (tabela_id, row_id),
    ).fetchone()


def _iso_utc(timestamp):
    """Converte 'YYYY-MM-DD HH:MM:SS' (CURRENT_TIMESTAMP do SQLite, UTC) em
    ISO 8601 com sufixo Z explícito, para o frontend converter com new Date()
    ao horário local. Sem o Z, o horário exibido ficaria 3h errado (UTC-3)."""
    return timestamp.replace(" ", "T") + "Z"


def _resposta_bloqueado(row):
    """Formato compartilhado entre o GET e o POST de bloquear."""
    return jsonify(
        ok=True,
        bloqueado=True,
        bloqueado_por=row["bloqueado_por_nome"],
        bloqueado_em=_iso_utc(row["bloqueado_em"]),
    )


@bloqueios_bp.route("/<int:tabela_id>/<int:row_id>", methods=["GET"])
@login_required
def estado_bloqueio(tabela_id, row_id):
    """Estado de bloqueio do registro — leitura liberada a todos os perfis."""
    erro = _validar_tabela(tabela_id)
    if erro:
        return erro

    row = _bloqueio_vigente(get_db(), tabela_id, row_id)
    if not row:
        return jsonify(ok=True, bloqueado=False)
    return _resposta_bloqueado(row)


@bloqueios_bp.route("/<int:tabela_id>/<int:row_id>/bloquear", methods=["POST"])
@login_required
def bloquear(tabela_id, row_id):
    """Cria o bloqueio vigente do registro — somente master."""
    erro = _validar_tabela(tabela_id)
    if erro:
        return erro
    erro = _exigir_master()
    if erro:
        return erro

    db = get_db()
    if _bloqueio_vigente(db, tabela_id, row_id):
        return jsonify(ok=False, erro="Registro já está bloqueado."), 409

    cur = db.execute(
        "INSERT INTO registro_bloqueios "
        "(tabela_id, row_id, bloqueado_por_id, bloqueado_por_nome) "
        "VALUES (?, ?, ?, ?)",
        (tabela_id, row_id, current_user.id, current_user.nome),
    )
    db.commit()

    row = db.execute(
        "SELECT id, bloqueado_por_nome, bloqueado_em FROM registro_bloqueios WHERE id = ?",
        (cur.lastrowid,),
    ).fetchone()
    return _resposta_bloqueado(row)


@bloqueios_bp.route("/<int:tabela_id>/<int:row_id>/desbloquear", methods=["POST"])
@login_required
def desbloquear(tabela_id, row_id):
    """Encerra o bloqueio vigente preenchendo as colunas de desbloqueio — somente master."""
    erro = _validar_tabela(tabela_id)
    if erro:
        return erro
    erro = _exigir_master()
    if erro:
        return erro

    db = get_db()
    row = _bloqueio_vigente(db, tabela_id, row_id)
    if not row:
        return jsonify(ok=False, erro="Registro não está bloqueado."), 409

    db.execute(
        "UPDATE registro_bloqueios "
        "SET desbloqueado_por_id = ?, desbloqueado_por_nome = ?, "
        "    desbloqueado_em = CURRENT_TIMESTAMP "
        "WHERE id = ?",
        (current_user.id, current_user.nome, row["id"]),
    )
    db.commit()
    return jsonify(ok=True, bloqueado=False)
