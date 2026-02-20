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
    clienteOab: 'field_7256'
  }
};

var protocoloRowId = null;

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
      preencherCabecalho(proto);
      preencherDadosProtocolo(proto);
      preencherAndamento(proto);
      return carregarCliente(proto);
    })
    .then(function() {
      mostrarOverlay(false);
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
  if (agendado) {
    setText('infoAgendado', formatarData(agendado));
    document.getElementById('infoAgendadoRow').style.display = '';
  }

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

/* ---------- INIT ---------- */

document.addEventListener('DOMContentLoaded', function() {
  if (typeof window.PROTOCOLO_ID !== 'undefined') {
    carregarProtocolo(window.PROTOCOLO_ID);
  }

  var btnSalvar = document.getElementById('btnSalvarAndamento');
  if (btnSalvar) {
    btnSalvar.addEventListener('click', salvarAndamento);
  }
});
