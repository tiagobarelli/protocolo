/* protocolo.js — Detalhe do protocolo e campo Andamento (ES5) */

var API_BASE = '/api/baserow';
var CONFIG = {
  tables: { clientes: 754, protocolo: 755 },
  fields: {
    protocolo: 'field_7240',
    interessado: 'field_7241',
    servico: 'field_7242',
    telefone: 'field_7243',
    email: 'field_7244',
    responsavel: 'field_7249',
    dataEntrada: 'field_7250',
    detalhamentos: 'field_7251',
    status: 'field_7252',
    advogado: 'field_7254',
    criadoPor: 'field_7248',
    agendadoPara: 'field_7268',
    depositoPrevio: 'field_7340',
    andamento: 'field_7346',
    clienteNome: 'field_7237',
    clienteCpf: 'field_7238',
    clienteCnpj: 'field_7239',
    clienteTelefone: 'field_7243',
    clienteEmail: 'field_7244',
    clienteOab: 'field_7256',
    clienteAlerta: 'field_7394',
    justificativaCancelamento: 'field_7396',
    log: 'field_7397'
  },
  statusIds: {
    emAndamento: 3064,
    finalizado: 3065,
    cancelado: 3066
  },
  statusLabels: {
    3064: 'Em andamento',
    3065: 'Finalizado',
    3066: 'Cancelado'
  },
  collaborators: [
    { id: 4, name: 'Aderbal W. Curioni' },
    { id: 6, name: 'Daniela T. Barbosa' },
    { id: 7, name: 'Edmundo M. Filho' },
    { id: 2, name: 'Fernanda R. T. Palhari' },
    { id: 5, name: 'José A. S. Oliveira' },
    { id: 8, name: 'Júlia Cazetta' },
    { id: 3, name: 'Natália M. Rodrigues' },
    { id: 1, name: 'Tiago Barelli' }
  ]
};

var protocoloRowId = null;
var protocoloAtual = null;
var snapshotProtocolo = null;
var collaboratorsList = [];

var FIELD_LABELS = {
  status: 'Status',
  agendadoPara: 'Agendado para',
  responsavel: 'Responsável'
};

function apiHeaders() {
  return { 'Content-Type': 'application/json' };
}

/* ---------- CARREGAR PROTOCOLO ---------- */

function carregarProtocolo(id) {
  protocoloRowId = id;
  mostrarOverlay(true);

  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.protocolo + '/' + id + '/?user_field_names=false';

  fetch(url, { headers: apiHeaders() })
    .then(function(resp) {
      if (!resp.ok) throw new Error('Protocolo não encontrado');
      return resp.json();
    })
    .then(function(proto) {
      protocoloAtual = proto;
      snapshotProtocolo = capturarSnapshotProtocolo(proto);
      preencherCabecalho(proto);
      preencherDadosProtocolo(proto);
      preencherAndamento(proto);
      renderizarControleStatus(proto);
      exibirJustificativa(proto);
      exibirLogsProtocolo(proto);
      return carregarCliente(proto);
    })
    .then(function() {
      configurarEdicaoInline(protocoloAtual);
      mostrarOverlay(false);
      carregarArquivos();
    })
    .catch(function(err) {
      console.error('Erro:', err);
      mostrarOverlay(false);
      document.getElementById('protoNumero').textContent = 'Erro ao carregar protocolo';
    });
}

function preencherCabecalho(proto) {
  var numero = proto[CONFIG.fields.protocolo] || '—';
  document.getElementById('protoNumero').textContent = numero;

  var statusObj = proto[CONFIG.fields.status];
  var statusTexto = statusObj ? (statusObj.value || '') : '';
  var badge = document.getElementById('protoBadge');
  badge.textContent = statusTexto;
  badge.className = 'status-badge ' + classificarStatus(statusTexto);
}

function preencherDadosProtocolo(proto) {
  var servicoArr = proto[CONFIG.fields.servico] || [];
  setText('infoServico', servicoArr.length > 0 ? servicoArr[0].value : '—');

  var respArr = proto[CONFIG.fields.responsavel] || [];
  setText('infoResponsavel', respArr.length > 0 ? respArr[0].name : '—');

  var criadoPor = proto[CONFIG.fields.criadoPor];
  if (criadoPor && criadoPor.name) {
    setText('infoCriadoPor', criadoPor.name);
    document.getElementById('infoCriadoPorRow').style.display = '';
  }

  setText('infoDataEntrada', formatarData(proto[CONFIG.fields.dataEntrada]));

  var agendado = proto[CONFIG.fields.agendadoPara];
  setText('infoAgendado', agendado ? formatarData(agendado) : '—');

  var deposito = proto[CONFIG.fields.depositoPrevio];
  if (deposito) {
    setText('infoDeposito', formatarMoeda(deposito));
    document.getElementById('infoDepositoRow').style.display = '';
  }

  var telefone = proto[CONFIG.fields.telefone];
  if (telefone) {
    setText('infoTelefone', telefone);
    document.getElementById('infoTelefoneRow').style.display = '';
  }

  var email = proto[CONFIG.fields.email];
  if (email) {
    setText('infoEmail', email);
    document.getElementById('infoEmailRow').style.display = '';
  }

  var detalhamentos = proto[CONFIG.fields.detalhamentos];
  if (detalhamentos) {
    var container = document.getElementById('infoDetalhamentos');
    if (typeof marked !== 'undefined' && marked.parse) {
      container.innerHTML = marked.parse(detalhamentos);
    } else {
      container.textContent = detalhamentos;
    }
    document.getElementById('infoDetalhamentosRow').style.display = '';
  }
}

function preencherAndamento(proto) {
  var andamento = proto[CONFIG.fields.andamento] || '';
  document.getElementById('andamentoTexto').value = andamento;
}

function carregarCliente(proto) {
  var interessadoArr = proto[CONFIG.fields.interessado] || [];
  if (interessadoArr.length === 0) {
    setText('infoInteressado', '—');
    return Promise.resolve();
  }

  var clienteId = interessadoArr[0].id;
  setText('infoInteressado', interessadoArr[0].value || '—');

  var advArr = proto[CONFIG.fields.advogado] || [];

  var clienteUrl = API_BASE + '/database/rows/table/' + CONFIG.tables.clientes + '/' + clienteId + '/?user_field_names=false';

  return fetch(clienteUrl, { headers: apiHeaders() })
    .then(function(resp) { return resp.json(); })
    .then(function(cliente) {
      var cpf = cliente[CONFIG.fields.clienteCpf] || '';
      var cnpj = cliente[CONFIG.fields.clienteCnpj] || '';
      var doc = cpf || cnpj || '—';
      setText('infoDocumento', doc);

      // Exibir alerta do cliente, se existir
      var alertaVal = cliente[CONFIG.fields.clienteAlerta] || '';
      var alertaEl = document.getElementById('alertaProtocolo');
      if (alertaVal.trim()) {
        alertaEl.textContent = 'Alerta cadastrado nos dados do cliente: ' + alertaVal.trim();
        alertaEl.style.display = '';
      } else {
        alertaEl.style.display = 'none';
      }

      if (advArr.length > 0) {
        var advId = advArr[0].id;
        setText('infoAdvogado', advArr[0].value || '');
        document.getElementById('infoAdvogadoRow').style.display = '';

        var advUrl = API_BASE + '/database/rows/table/' + CONFIG.tables.clientes + '/' + advId + '/?user_field_names=false';
        return fetch(advUrl, { headers: apiHeaders() })
          .then(function(resp) { return resp.json(); })
          .then(function(adv) {
            var oab = adv[CONFIG.fields.clienteOab] || '';
            if (oab) {
              setText('infoOab', oab);
              document.getElementById('infoOabRow').style.display = '';
            }
          });
      }
    })
    .catch(function(err) {
      console.error('Erro ao carregar cliente:', err);
    });
}

/* ---------- SALVAR ANDAMENTO ---------- */

function salvarAndamento() {
  var texto = document.getElementById('andamentoTexto').value;
  var btn = document.getElementById('btnSalvarAndamento');
  var msgBox = document.getElementById('andamentoMsg');

  btn.disabled = true;
  btn.innerHTML = '<i class="ph ph-spinner"></i> Salvando...';
  msgBox.className = 'msg-box';
  msgBox.style.display = 'none';

  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.protocolo + '/' + protocoloRowId + '/?user_field_names=false';
  var body = {};
  body[CONFIG.fields.andamento] = texto;

  fetch(url, {
    method: 'PATCH',
    headers: apiHeaders(),
    body: JSON.stringify(body)
  })
    .then(function(resp) {
      if (!resp.ok) throw new Error('Erro ao salvar');
      return resp.json();
    })
    .then(function() {
      msgBox.className = 'msg-box success';
      msgBox.innerHTML = '<i class="ph ph-check-circle"></i> Andamento salvo com sucesso.';
      msgBox.style.display = 'flex';
      btn.disabled = false;
      btn.innerHTML = '<i class="ph ph-floppy-disk"></i> Salvar Andamento';
    })
    .catch(function(err) {
      console.error('Erro ao salvar andamento:', err);
      msgBox.className = 'msg-box error';
      msgBox.innerHTML = '<i class="ph ph-x-circle"></i> Erro ao salvar andamento.';
      msgBox.style.display = 'flex';
      btn.disabled = false;
      btn.innerHTML = '<i class="ph ph-floppy-disk"></i> Salvar Andamento';
    });
}

/* ---------- HELPERS ---------- */

function setText(id, texto) {
  var el = document.getElementById(id);
  if (el) el.textContent = texto || '';
}

function classificarStatus(texto) {
  if (!texto) return '';
  var t = texto.toLowerCase();
  if (t.indexOf('andamento') !== -1) return 'andamento';
  if (t.indexOf('finalizado') !== -1) return 'finalizado';
  if (t.indexOf('cancelado') !== -1) return 'cancelado';
  return '';
}

function formatarData(dataStr) {
  if (!dataStr) return '—';
  var partes = dataStr.split('-');
  if (partes.length !== 3) return dataStr;
  return partes[2] + '/' + partes[1] + '/' + partes[0];
}

function formatarMoeda(valor) {
  var num = parseFloat(valor);
  if (isNaN(num)) return '—';
  return 'R$ ' + num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function mostrarOverlay(show) {
  var overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.style.display = show ? 'flex' : 'none';
}

/* ---------- PERMISSÕES ---------- */

function ehResponsavel() {
  if (!protocoloAtual) return false;
  var respArr = protocoloAtual[CONFIG.fields.responsavel] || [];
  if (respArr.length === 0) return false;
  for (var i = 0; i < respArr.length; i++) {
    if (respArr[i].name === window.CURRENT_USER.nome) return true;
  }
  return false;
}

function podeEditarStatus() {
  var perfil = window.CURRENT_USER.perfil;
  if (perfil === 'master' || perfil === 'administrador') return true;
  if (perfil === 'escrevente' && ehResponsavel()) return true;
  return false;
}

function podeEditarAgendado() {
  var perfil = window.CURRENT_USER.perfil;
  if (perfil === 'master' || perfil === 'administrador') return true;
  if (perfil === 'escrevente' && ehResponsavel()) return true;
  return false;
}

function podeEditarResponsavel() {
  var perfil = window.CURRENT_USER.perfil;
  return (perfil === 'master' || perfil === 'administrador');
}

function statusAtualEhCancelado() {
  if (!protocoloAtual) return false;
  var statusObj = protocoloAtual[CONFIG.fields.status];
  var statusId = statusObj ? statusObj.id : null;
  return statusId === CONFIG.statusIds.cancelado;
}

function getStatusTextoAtual() {
  if (!protocoloAtual) return '';
  var statusObj = protocoloAtual[CONFIG.fields.status];
  return statusObj ? (statusObj.value || '') : '';
}

/* ---------- CONTROLE DE STATUS ---------- */

function renderizarControleStatus(proto) {
  var select = document.getElementById('statusSelect');
  if (!select) return;

  if (!podeEditarStatus()) {
    select.style.display = 'none';
    return;
  }

  var statusObj = proto[CONFIG.fields.status];
  var statusId = statusObj ? statusObj.id : null;

  // Pré-selecionar status atual
  select.value = statusId ? String(statusId) : '';

  // Desabilitar se cancelado e não é master
  if (statusId === CONFIG.statusIds.cancelado && window.CURRENT_USER.perfil !== 'master') {
    select.disabled = true;
  } else {
    select.disabled = false;
  }

  select.style.display = '';
}

function onStatusChange() {
  var select = document.getElementById('statusSelect');
  var novoStatusId = parseInt(select.value);
  var statusObj = protocoloAtual ? protocoloAtual[CONFIG.fields.status] : null;
  var statusIdAnterior = statusObj ? statusObj.id : null;
  var statusTextoAnterior = statusObj ? (statusObj.value || '') : '';

  // Se selecionou Cancelado → mostrar textarea de justificativa
  if (novoStatusId === CONFIG.statusIds.cancelado) {
    mostrarJustificativaEditavel();
    return;
  }

  // Se revertendo de Cancelado (só master pode)
  if (statusIdAnterior === CONFIG.statusIds.cancelado) {
    if (window.CURRENT_USER.perfil !== 'master') {
      select.value = String(statusIdAnterior);
      return;
    }
    if (!confirm('Deseja reverter o status de "Cancelado" para "' + CONFIG.statusLabels[novoStatusId] + '"?')) {
      select.value = String(statusIdAnterior);
      return;
    }
    reverterCancelamento(novoStatusId, statusTextoAnterior);
    return;
  }

  // Alteração normal de status
  salvarStatusChange(novoStatusId, statusTextoAnterior);
}

function salvarStatusChange(novoStatusId, statusTextoAnterior) {
  mostrarOverlay(true);

  var logDescricao = 'O campo Status foi alterado. Valor anterior: ' + (statusTextoAnterior || '(vazio)') + '.';
  var novaLinhaLog = gerarLinhaLog(logDescricao);
  var logsAtualizados = prependLog(novaLinhaLog);

  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.protocolo + '/' + protocoloRowId + '/?user_field_names=false';
  var body = {};
  body[CONFIG.fields.status] = novoStatusId;
  body[CONFIG.fields.log] = logsAtualizados;

  fetch(url, {
    method: 'PATCH',
    headers: apiHeaders(),
    body: JSON.stringify(body)
  })
    .then(function(resp) {
      if (!resp.ok) throw new Error('Erro ao alterar status');
      return resp.json();
    })
    .then(function(data) {
      protocoloAtual = data;
      snapshotProtocolo = capturarSnapshotProtocolo(data);
      atualizarBadgeStatus(data);
      renderizarControleStatus(data);
      exibirJustificativa(data);
      exibirLogsProtocolo(data);
      mostrarOverlay(false);
    })
    .catch(function(err) {
      console.error('Erro ao alterar status:', err);
      mostrarOverlay(false);
      alert('Erro ao alterar status: ' + err.message);
      // Restaurar select para valor anterior
      var statusObj = protocoloAtual ? protocoloAtual[CONFIG.fields.status] : null;
      var select = document.getElementById('statusSelect');
      if (select && statusObj) select.value = String(statusObj.id);
    });
}

function reverterCancelamento(novoStatusId, statusTextoAnterior) {
  mostrarOverlay(true);

  var justificativaAnterior = protocoloAtual ? (protocoloAtual[CONFIG.fields.justificativaCancelamento] || '') : '';
  var logDescricao = 'O campo Status foi alterado. Valor anterior: ' + statusTextoAnterior + '.';
  if (justificativaAnterior.trim()) {
    logDescricao += ' Justificativa removida: "' + justificativaAnterior.trim() + '".';
  }
  var novaLinhaLog = gerarLinhaLog(logDescricao);
  var logsAtualizados = prependLog(novaLinhaLog);

  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.protocolo + '/' + protocoloRowId + '/?user_field_names=false';
  var body = {};
  body[CONFIG.fields.status] = novoStatusId;
  body[CONFIG.fields.justificativaCancelamento] = '';
  body[CONFIG.fields.log] = logsAtualizados;

  fetch(url, {
    method: 'PATCH',
    headers: apiHeaders(),
    body: JSON.stringify(body)
  })
    .then(function(resp) {
      if (!resp.ok) throw new Error('Erro ao reverter cancelamento');
      return resp.json();
    })
    .then(function(data) {
      protocoloAtual = data;
      snapshotProtocolo = capturarSnapshotProtocolo(data);
      atualizarBadgeStatus(data);
      renderizarControleStatus(data);
      exibirJustificativa(data);
      exibirLogsProtocolo(data);
      mostrarOverlay(false);
    })
    .catch(function(err) {
      console.error('Erro ao reverter cancelamento:', err);
      mostrarOverlay(false);
      alert('Erro ao reverter cancelamento: ' + err.message);
      var statusObj = protocoloAtual ? protocoloAtual[CONFIG.fields.status] : null;
      var select = document.getElementById('statusSelect');
      if (select && statusObj) select.value = String(statusObj.id);
    });
}

function mostrarJustificativaEditavel() {
  var card = document.getElementById('justificativaCard');
  var editavel = document.getElementById('justificativaEditavel');
  var readonly = document.getElementById('justificativaReadonly');
  if (card) card.style.display = '';
  if (editavel) editavel.style.display = '';
  if (readonly) readonly.style.display = 'none';
  var textarea = document.getElementById('justificativaTexto');
  if (textarea) {
    textarea.value = '';
    textarea.focus();
  }
}

function confirmarCancelamento() {
  var textarea = document.getElementById('justificativaTexto');
  var msgBox = document.getElementById('justificativaMsg');
  var justificativa = textarea ? textarea.value.trim() : '';

  if (!justificativa) {
    if (msgBox) {
      msgBox.className = 'msg-box error';
      msgBox.innerHTML = '<i class="ph ph-x-circle"></i> Informe a justificativa do cancelamento.';
      msgBox.style.display = 'flex';
    }
    return;
  }

  if (msgBox) msgBox.style.display = 'none';
  mostrarOverlay(true);

  var statusTextoAnterior = getStatusTextoAtual();
  var logDescricao = 'O campo Status foi alterado. Valor anterior: ' + (statusTextoAnterior || '(vazio)') + '.';
  var novaLinhaLog = gerarLinhaLog(logDescricao);
  var logsAtualizados = prependLog(novaLinhaLog);

  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.protocolo + '/' + protocoloRowId + '/?user_field_names=false';
  var body = {};
  body[CONFIG.fields.status] = CONFIG.statusIds.cancelado;
  body[CONFIG.fields.justificativaCancelamento] = justificativa;
  body[CONFIG.fields.log] = logsAtualizados;

  fetch(url, {
    method: 'PATCH',
    headers: apiHeaders(),
    body: JSON.stringify(body)
  })
    .then(function(resp) {
      if (!resp.ok) throw new Error('Erro ao cancelar protocolo');
      return resp.json();
    })
    .then(function(data) {
      protocoloAtual = data;
      snapshotProtocolo = capturarSnapshotProtocolo(data);
      atualizarBadgeStatus(data);
      renderizarControleStatus(data);
      exibirJustificativa(data);
      exibirLogsProtocolo(data);
      // Ocultar área editável
      var editavel = document.getElementById('justificativaEditavel');
      if (editavel) editavel.style.display = 'none';
      mostrarOverlay(false);
    })
    .catch(function(err) {
      console.error('Erro ao cancelar protocolo:', err);
      mostrarOverlay(false);
      if (msgBox) {
        msgBox.className = 'msg-box error';
        msgBox.innerHTML = '<i class="ph ph-x-circle"></i> ' + err.message;
        msgBox.style.display = 'flex';
      }
    });
}

function cancelarCancelamento() {
  var card = document.getElementById('justificativaCard');
  var editavel = document.getElementById('justificativaEditavel');
  var msgBox = document.getElementById('justificativaMsg');
  if (editavel) editavel.style.display = 'none';
  if (msgBox) msgBox.style.display = 'none';
  // Se protocolo não é cancelado, ocultar card
  if (!statusAtualEhCancelado() && card) {
    card.style.display = 'none';
  }
  // Restaurar select para valor anterior
  var statusObj = protocoloAtual ? protocoloAtual[CONFIG.fields.status] : null;
  var select = document.getElementById('statusSelect');
  if (select && statusObj) select.value = String(statusObj.id);
}

function exibirJustificativa(proto) {
  var card = document.getElementById('justificativaCard');
  var readonly = document.getElementById('justificativaReadonly');
  var editavel = document.getElementById('justificativaEditavel');
  if (!card || !readonly) return;

  var statusObj = proto[CONFIG.fields.status];
  var statusId = statusObj ? statusObj.id : null;
  var justificativa = proto[CONFIG.fields.justificativaCancelamento] || '';

  if (statusId === CONFIG.statusIds.cancelado && justificativa.trim()) {
    readonly.textContent = justificativa;
    readonly.style.display = '';
    if (editavel) editavel.style.display = 'none';
    card.style.display = '';
  } else {
    readonly.style.display = 'none';
    if (editavel) editavel.style.display = 'none';
    card.style.display = 'none';
  }
}

function atualizarBadgeStatus(proto) {
  var statusObj = proto[CONFIG.fields.status];
  var statusTexto = statusObj ? (statusObj.value || '') : '';
  var badge = document.getElementById('protoBadge');
  if (badge) {
    badge.textContent = statusTexto;
    badge.className = 'status-badge ' + classificarStatus(statusTexto);
  }
}

/* ---------- SISTEMA DE LOGS ---------- */

function capturarSnapshotProtocolo(proto) {
  if (!proto) return null;
  var snap = {};
  var statusObj = proto[CONFIG.fields.status];
  snap.status = statusObj ? (statusObj.value || '') : '';
  snap.agendadoPara = proto[CONFIG.fields.agendadoPara] || '';
  var respArr = proto[CONFIG.fields.responsavel] || [];
  snap.responsavel = respArr.length > 0 ? respArr[0].name : '';
  return snap;
}

function gerarLinhaLog(descricao) {
  var agora = new Date();
  var dia = ('0' + agora.getDate()).slice(-2);
  var mes = ('0' + (agora.getMonth() + 1)).slice(-2);
  var ano = agora.getFullYear();
  var hora = ('0' + agora.getHours()).slice(-2);
  var min = ('0' + agora.getMinutes()).slice(-2);
  var dataHora = dia + '/' + mes + '/' + ano + ' ' + hora + ':' + min;
  var nomeUsuario = (window.CURRENT_USER && window.CURRENT_USER.nome) ? window.CURRENT_USER.nome : 'Usuário';
  return nomeUsuario + '. ' + dataHora + ': ' + descricao;
}

function prependLog(novaLinha) {
  var logsExistentes = (protocoloAtual && protocoloAtual[CONFIG.fields.log]) ? protocoloAtual[CONFIG.fields.log] : '';
  return logsExistentes ? (novaLinha + '\n' + logsExistentes) : novaLinha;
}

function salvarLogProtocolo(novaLinha) {
  var logsAtualizados = prependLog(novaLinha);
  // Atualizar localmente para evitar race condition
  if (protocoloAtual) {
    protocoloAtual[CONFIG.fields.log] = logsAtualizados;
  }
  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.protocolo + '/' + protocoloRowId + '/?user_field_names=false';
  var body = {};
  body[CONFIG.fields.log] = logsAtualizados;
  return fetch(url, {
    method: 'PATCH',
    headers: apiHeaders(),
    body: JSON.stringify(body)
  })
    .then(function(resp) { return resp.json(); })
    .then(function(data) {
      protocoloAtual[CONFIG.fields.log] = data[CONFIG.fields.log];
      exibirLogsProtocolo(data);
    });
}

function exibirLogsProtocolo(proto) {
  var logCard = document.getElementById('logCardProto');
  var logContent = document.getElementById('logContentProto');
  if (!logCard || !logContent) return;
  var logsVal = (proto && proto[CONFIG.fields.log]) ? proto[CONFIG.fields.log] : '';
  if (logsVal.trim()) {
    logContent.textContent = logsVal;
    logCard.style.display = '';
  } else {
    logContent.textContent = '';
    logCard.style.display = 'none';
  }
}

/* ---------- EDIÇÃO INLINE ---------- */

function carregarCollaborators() {
  var url = API_BASE + '/database/fields/table/' + CONFIG.tables.protocolo + '/';
  return fetch(url, { headers: apiHeaders() })
    .then(function(resp) {
      if (!resp.ok) throw new Error('Erro ao carregar campos');
      return resp.json();
    })
    .then(function(fields) {
      var fieldResp = null;
      for (var i = 0; i < fields.length; i++) {
        if (fields[i].id === 7249) {
          fieldResp = fields[i];
          break;
        }
      }
      if (fieldResp && fieldResp.available_collaborators && fieldResp.available_collaborators.length > 0) {
        collaboratorsList = fieldResp.available_collaborators;
      } else {
        collaboratorsList = CONFIG.collaborators;
      }
    })
    .catch(function(err) {
      console.error('Erro ao carregar collaborators:', err);
      collaboratorsList = CONFIG.collaborators;
    });
}

function configurarEdicaoInline(proto) {
  var btnEditAgendado = document.getElementById('btnEditAgendado');
  var btnEditResp = document.getElementById('btnEditResponsavel');

  if (btnEditAgendado && podeEditarAgendado()) {
    btnEditAgendado.style.display = '';
  }

  if (btnEditResp && podeEditarResponsavel()) {
    btnEditResp.style.display = '';
    popularSelectResponsavel(proto);
  }
}

function popularSelectResponsavel(proto) {
  var select = document.getElementById('editResponsavelSelect');
  if (!select) return;
  select.innerHTML = '<option value="">Selecione...</option>';
  for (var i = 0; i < collaboratorsList.length; i++) {
    var c = collaboratorsList[i];
    var opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    select.appendChild(opt);
  }
  // Pré-selecionar atual
  var respArr = proto[CONFIG.fields.responsavel] || [];
  if (respArr.length > 0) {
    select.value = String(respArr[0].id);
  }
}

function iniciarEdicaoAgendado() {
  var display = document.getElementById('infoAgendado');
  var editArea = document.getElementById('infoAgendadoEdit');
  var input = document.getElementById('editAgendadoInput');
  var btnEdit = document.getElementById('btnEditAgendado');
  if (display) display.style.display = 'none';
  if (btnEdit) btnEdit.style.display = 'none';
  if (editArea) editArea.style.display = 'flex';
  // Preencher com valor atual em formato YYYY-MM-DD
  var agendado = protocoloAtual ? (protocoloAtual[CONFIG.fields.agendadoPara] || '') : '';
  if (input) input.value = agendado;
}

function cancelarEdicaoAgendado() {
  var display = document.getElementById('infoAgendado');
  var editArea = document.getElementById('infoAgendadoEdit');
  var btnEdit = document.getElementById('btnEditAgendado');
  if (display) display.style.display = '';
  if (editArea) editArea.style.display = 'none';
  if (btnEdit && podeEditarAgendado()) btnEdit.style.display = '';
}

function salvarAgendado() {
  var input = document.getElementById('editAgendadoInput');
  var novoValor = input ? input.value : '';
  var valorAnterior = snapshotProtocolo ? snapshotProtocolo.agendadoPara : '';

  // Se não mudou, só fechar
  if (novoValor === valorAnterior) {
    cancelarEdicaoAgendado();
    return;
  }

  mostrarOverlay(true);

  var valorAnteriorFormatado = valorAnterior ? formatarData(valorAnterior) : '(vazio)';
  var logDescricao = 'O campo Agendado para foi alterado. Valor anterior: ' + valorAnteriorFormatado + '.';
  var novaLinhaLog = gerarLinhaLog(logDescricao);
  var logsAtualizados = prependLog(novaLinhaLog);

  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.protocolo + '/' + protocoloRowId + '/?user_field_names=false';
  var body = {};
  body[CONFIG.fields.agendadoPara] = novoValor || null;
  body[CONFIG.fields.log] = logsAtualizados;

  fetch(url, {
    method: 'PATCH',
    headers: apiHeaders(),
    body: JSON.stringify(body)
  })
    .then(function(resp) {
      if (!resp.ok) throw new Error('Erro ao salvar agendamento');
      return resp.json();
    })
    .then(function(data) {
      protocoloAtual = data;
      snapshotProtocolo = capturarSnapshotProtocolo(data);
      var agendado = data[CONFIG.fields.agendadoPara];
      setText('infoAgendado', agendado ? formatarData(agendado) : '—');
      exibirLogsProtocolo(data);
      cancelarEdicaoAgendado();
      mostrarOverlay(false);
    })
    .catch(function(err) {
      console.error('Erro ao salvar agendamento:', err);
      mostrarOverlay(false);
      alert('Erro ao salvar agendamento: ' + err.message);
    });
}

function iniciarEdicaoResponsavel() {
  var display = document.getElementById('infoResponsavel');
  var editArea = document.getElementById('infoResponsavelEdit');
  var btnEdit = document.getElementById('btnEditResponsavel');
  if (display) display.style.display = 'none';
  if (btnEdit) btnEdit.style.display = 'none';
  if (editArea) editArea.style.display = 'flex';
  // Pré-selecionar atual
  var respArr = protocoloAtual ? (protocoloAtual[CONFIG.fields.responsavel] || []) : [];
  var select = document.getElementById('editResponsavelSelect');
  if (select && respArr.length > 0) {
    select.value = String(respArr[0].id);
  }
}

function cancelarEdicaoResponsavel() {
  var display = document.getElementById('infoResponsavel');
  var editArea = document.getElementById('infoResponsavelEdit');
  var btnEdit = document.getElementById('btnEditResponsavel');
  if (display) display.style.display = '';
  if (editArea) editArea.style.display = 'none';
  if (btnEdit && podeEditarResponsavel()) btnEdit.style.display = '';
}

function salvarResponsavel() {
  var select = document.getElementById('editResponsavelSelect');
  var novoId = select ? parseInt(select.value) : 0;
  if (!novoId) {
    alert('Selecione um responsável.');
    return;
  }

  // Encontrar nome do novo responsável
  var novoNome = '';
  for (var i = 0; i < collaboratorsList.length; i++) {
    if (collaboratorsList[i].id === novoId) {
      novoNome = collaboratorsList[i].name;
      break;
    }
  }

  var nomeAnterior = snapshotProtocolo ? snapshotProtocolo.responsavel : '';

  // Se não mudou, só fechar
  if (novoNome === nomeAnterior) {
    cancelarEdicaoResponsavel();
    return;
  }

  mostrarOverlay(true);

  var logDescricao = 'O campo Responsável foi alterado. Valor anterior: ' + (nomeAnterior || '(vazio)') + '.';
  var novaLinhaLog = gerarLinhaLog(logDescricao);
  var logsAtualizados = prependLog(novaLinhaLog);

  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.protocolo + '/' + protocoloRowId + '/?user_field_names=false';
  var body = {};
  body[CONFIG.fields.responsavel] = [{ id: novoId }];
  body[CONFIG.fields.log] = logsAtualizados;

  fetch(url, {
    method: 'PATCH',
    headers: apiHeaders(),
    body: JSON.stringify(body)
  })
    .then(function(resp) {
      if (!resp.ok) throw new Error('Erro ao salvar responsável');
      return resp.json();
    })
    .then(function(data) {
      protocoloAtual = data;
      snapshotProtocolo = capturarSnapshotProtocolo(data);
      var respArr = data[CONFIG.fields.responsavel] || [];
      setText('infoResponsavel', respArr.length > 0 ? respArr[0].name : '—');
      exibirLogsProtocolo(data);
      cancelarEdicaoResponsavel();
      // Reavaliar permissões (escrevente pode perder acesso)
      renderizarControleStatus(data);
      configurarEdicaoInline(data);
      mostrarOverlay(false);
    })
    .catch(function(err) {
      console.error('Erro ao salvar responsável:', err);
      mostrarOverlay(false);
      alert('Erro ao salvar responsável: ' + err.message);
    });
}

/* ---------- ARQUIVOS ANEXADOS ---------- */

var ALLOWED_EXTENSIONS = ['doc', 'docx', 'odt', 'pdf', 'jpg', 'png', 'txt', 'md', 'xls'];
var MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

function iconeExtensao(ext) {
  var e = (ext || '').toLowerCase();
  if (e === 'pdf') return 'ph-file-pdf';
  if (e === 'doc' || e === 'docx' || e === 'odt') return 'ph-file-doc';
  if (e === 'jpg' || e === 'png') return 'ph-file-image';
  if (e === 'txt' || e === 'md') return 'ph-file-text';
  if (e === 'xls') return 'ph-file-xls';
  return 'ph-file';
}

function formatarTamanho(bytes) {
  if (!bytes || bytes === 0) return '0 KB';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1).replace('.', ',') + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
}

function formatarDataHora(dataStr) {
  if (!dataStr) return '';
  var d = new Date(dataStr);
  if (isNaN(d.getTime())) return dataStr;
  var dia = ('0' + d.getDate()).slice(-2);
  var mes = ('0' + (d.getMonth() + 1)).slice(-2);
  var ano = d.getFullYear();
  var hora = ('0' + d.getHours()).slice(-2);
  var min = ('0' + d.getMinutes()).slice(-2);
  return dia + '/' + mes + '/' + ano + ' ' + hora + ':' + min;
}

function carregarArquivos() {
  var container = document.getElementById('filesList');
  if (!container) return;

  fetch('/api/uploads/' + window.PROTOCOLO_ID, { headers: apiHeaders() })
    .then(function(resp) { return resp.json(); })
    .then(function(data) {
      renderizarListaArquivos(data.files || []);
    })
    .catch(function(err) {
      console.error('Erro ao carregar arquivos:', err);
      container.innerHTML = '<div class="files-empty">Erro ao carregar arquivos.</div>';
    });
}

function renderizarListaArquivos(files) {
  var container = document.getElementById('filesList');
  if (!container) return;

  if (!files || files.length === 0) {
    container.innerHTML = '<div class="files-empty">Nenhum arquivo anexado.</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var iconClass = iconeExtensao(f.extensao);
    var podeDeletar = (
      window.CURRENT_USER.id === f.usuario_id ||
      window.CURRENT_USER.perfil === 'master' ||
      window.CURRENT_USER.perfil === 'administrador'
    );

    html += '<div class="file-item">';
    html += '  <i class="ph ' + iconClass + ' file-icon"></i>';
    html += '  <div class="file-info">';
    html += '    <a href="/api/uploads/download/' + f.id + '" class="file-name">' + f.nome_original + '</a>';
    html += '    <span class="file-meta">Enviado por ' + f.usuario_nome + ' em ' + formatarDataHora(f.criado_em) + ' — ' + formatarTamanho(f.tamanho) + '</span>';
    html += '  </div>';
    if (podeDeletar) {
      html += '  <button type="button" class="file-delete" onclick="deletarArquivo(' + f.id + ', \'' + f.nome_original.replace(/'/g, "\\'") + '\')" title="Excluir arquivo">';
      html += '    <i class="ph ph-trash"></i>';
      html += '  </button>';
    }
    html += '</div>';
  }

  container.innerHTML = html;
}

function uploadArquivo(file) {
  var msgBox = document.getElementById('uploadMsg');
  msgBox.className = 'msg-box';
  msgBox.style.display = 'none';

  // Mostrar feedback de upload
  msgBox.className = 'msg-box success';
  msgBox.innerHTML = '<i class="ph ph-spinner"></i> Enviando arquivo...';
  msgBox.style.display = 'flex';

  var formData = new FormData();
  formData.append('arquivo', file);

  fetch('/api/uploads/' + window.PROTOCOLO_ID, {
    method: 'POST',
    body: formData
  })
    .then(function(resp) {
      if (!resp.ok) {
        return resp.json().then(function(data) {
          throw new Error(data.erro || 'Erro ao enviar arquivo.');
        });
      }
      return resp.json();
    })
    .then(function() {
      msgBox.className = 'msg-box success';
      msgBox.innerHTML = '<i class="ph ph-check-circle"></i> Arquivo enviado com sucesso.';
      msgBox.style.display = 'flex';
      carregarArquivos();
      // Log de upload
      var logLinha = gerarLinhaLog('Arquivo anexado: "' + file.name + '".');
      salvarLogProtocolo(logLinha);
      setTimeout(function() {
        msgBox.style.display = 'none';
      }, 4000);
    })
    .catch(function(err) {
      msgBox.className = 'msg-box error';
      msgBox.innerHTML = '<i class="ph ph-x-circle"></i> ' + err.message;
      msgBox.style.display = 'flex';
    });
}

function deletarArquivo(fileId, nomeOriginal) {
  if (!confirm('Deseja excluir o arquivo "' + nomeOriginal + '"?')) return;

  fetch('/api/uploads/' + fileId, { method: 'DELETE' })
    .then(function(resp) {
      if (!resp.ok) {
        return resp.json().then(function(data) {
          throw new Error(data.erro || 'Erro ao excluir arquivo.');
        });
      }
      return resp.json();
    })
    .then(function() {
      carregarArquivos();
      // Log de exclusão
      var logLinha = gerarLinhaLog('Arquivo removido: "' + nomeOriginal + '".');
      salvarLogProtocolo(logLinha);
    })
    .catch(function(err) {
      alert('Erro: ' + err.message);
    });
}

/* ---------- INIT ---------- */

document.addEventListener('DOMContentLoaded', function() {
  // Carregar collaborators antes do protocolo para ter a lista pronta
  carregarCollaborators().then(function() {
    if (typeof window.PROTOCOLO_ID !== 'undefined') {
      carregarProtocolo(window.PROTOCOLO_ID);
    }
  });

  // Andamento
  var btnSalvar = document.getElementById('btnSalvarAndamento');
  if (btnSalvar) {
    btnSalvar.addEventListener('click', salvarAndamento);
  }

  // Status
  var statusSelect = document.getElementById('statusSelect');
  if (statusSelect) {
    statusSelect.addEventListener('change', onStatusChange);
  }

  // Justificativa de cancelamento
  var btnConfirmar = document.getElementById('btnConfirmarCancelamento');
  if (btnConfirmar) {
    btnConfirmar.addEventListener('click', confirmarCancelamento);
  }
  var btnCancelar = document.getElementById('btnCancelarCancelamento');
  if (btnCancelar) {
    btnCancelar.addEventListener('click', cancelarCancelamento);
  }

  // Edição inline - Agendado
  var btnEditAgendado = document.getElementById('btnEditAgendado');
  if (btnEditAgendado) {
    btnEditAgendado.addEventListener('click', iniciarEdicaoAgendado);
  }
  var btnSalvarAgendado = document.getElementById('btnSalvarAgendado');
  if (btnSalvarAgendado) {
    btnSalvarAgendado.addEventListener('click', salvarAgendado);
  }
  var btnCancelarAgendado = document.getElementById('btnCancelarAgendado');
  if (btnCancelarAgendado) {
    btnCancelarAgendado.addEventListener('click', cancelarEdicaoAgendado);
  }

  // Edição inline - Responsável
  var btnEditResp = document.getElementById('btnEditResponsavel');
  if (btnEditResp) {
    btnEditResp.addEventListener('click', iniciarEdicaoResponsavel);
  }
  var btnSalvarResp = document.getElementById('btnSalvarResponsavel');
  if (btnSalvarResp) {
    btnSalvarResp.addEventListener('click', salvarResponsavel);
  }
  var btnCancelarResp = document.getElementById('btnCancelarResponsavel');
  if (btnCancelarResp) {
    btnCancelarResp.addEventListener('click', cancelarEdicaoResponsavel);
  }

  // Upload de arquivos
  var btnSelectFile = document.getElementById('btnSelectFile');
  var fileInput = document.getElementById('fileInput');
  if (btnSelectFile && fileInput) {
    btnSelectFile.addEventListener('click', function() {
      fileInput.click();
    });
    fileInput.addEventListener('change', function() {
      var file = fileInput.files[0];
      if (!file) return;

      // Validar extensão
      var ext = file.name.split('.').pop().toLowerCase();
      if (ALLOWED_EXTENSIONS.indexOf(ext) === -1) {
        var msgBox = document.getElementById('uploadMsg');
        msgBox.className = 'msg-box error';
        msgBox.innerHTML = '<i class="ph ph-x-circle"></i> Extensão ".' + ext + '" não permitida.';
        msgBox.style.display = 'flex';
        fileInput.value = '';
        return;
      }

      // Validar tamanho
      if (file.size > MAX_FILE_SIZE) {
        var msgBox = document.getElementById('uploadMsg');
        msgBox.className = 'msg-box error';
        msgBox.innerHTML = '<i class="ph ph-x-circle"></i> Arquivo excede o tamanho máximo de 20 MB.';
        msgBox.style.display = 'flex';
        fileInput.value = '';
        return;
      }

      uploadArquivo(file);
      fileInput.value = '';
    });
  }
});
