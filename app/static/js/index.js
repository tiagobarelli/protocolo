/* index.js — Dashboard: carregar protocolos e filtros (ES5) */

var API_BASE = '/api/baserow';
var CONFIG = {
  tables: { protocolo: 755 },
  fields: {
    protocolo: 'field_7240',
    interessado: 'field_7241',
    servico: 'field_7242',
    responsavel: 'field_7249',
    dataEntrada: 'field_7250',
    status: 'field_7252',
    advogado: 'field_7254',
    agendadoPara: 'field_7268'
  }
};

var todosProtocolos = [];
var colaboradores = [];

function apiHeaders() {
  return { 'Content-Type': 'application/json' };
}

/* ---------- COLABORADORES ---------- */

function carregarColaboradores() {
  var url = API_BASE + '/database/fields/table/' + CONFIG.tables.protocolo + '/';
  fetch(url, { headers: apiHeaders() })
    .then(function(resp) { return resp.json(); })
    .then(function(fields) {
      var fieldResp = null;
      for (var i = 0; i < fields.length; i++) {
        if (fields[i].id === 7249 || fields[i].name === 'Responsável') {
          fieldResp = fields[i];
          break;
        }
      }
      if (fieldResp && fieldResp.select_options) {
        colaboradores = fieldResp.select_options;
      } else if (fieldResp && fieldResp.available_collaborators) {
        colaboradores = fieldResp.available_collaborators;
      }
      popularFiltroResponsavel();
    })
    .catch(function(err) {
      console.error('Erro ao carregar colaboradores:', err);
    });
}

function popularFiltroResponsavel() {
  var select = document.getElementById('filtroResponsavel');
  for (var i = 0; i < colaboradores.length; i++) {
    var opt = document.createElement('option');
    opt.value = colaboradores[i].name || colaboradores[i].value || '';
    opt.textContent = colaboradores[i].name || colaboradores[i].value || '';
    select.appendChild(opt);
  }
}

/* ---------- PROTOCOLOS ---------- */

function carregarProtocolos() {
  var grid = document.getElementById('protocolGrid');
  var loading = document.getElementById('loadingState');
  var empty = document.getElementById('emptyState');

  grid.innerHTML = '';
  loading.style.display = 'block';
  empty.style.display = 'none';

  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.protocolo +
    '/?user_field_names=false&size=200&order_by=-' + CONFIG.fields.dataEntrada;

  fetch(url, { headers: apiHeaders() })
    .then(function(resp) { return resp.json(); })
    .then(function(data) {
      todosProtocolos = data.results || [];
      loading.style.display = 'none';
      aplicarFiltros();
    })
    .catch(function(err) {
      console.error('Erro ao carregar protocolos:', err);
      loading.style.display = 'none';
      grid.innerHTML = '<div class="empty-state"><i class="ph ph-warning"></i>Erro ao carregar protocolos.</div>';
    });
}

function aplicarFiltros() {
  var statusFiltro = document.getElementById('filtroStatus').value;
  var respFiltro = document.getElementById('filtroResponsavel').value;

  var filtrados = [];
  for (var i = 0; i < todosProtocolos.length; i++) {
    var p = todosProtocolos[i];
    var statusObj = p[CONFIG.fields.status];
    var statusTexto = statusObj ? (statusObj.value || '') : '';

    if (statusFiltro && statusTexto !== statusFiltro) continue;

    if (respFiltro) {
      var respArr = p[CONFIG.fields.responsavel] || [];
      var encontrou = false;
      for (var j = 0; j < respArr.length; j++) {
        if (respArr[j].name === respFiltro) {
          encontrou = true;
          break;
        }
      }
      if (!encontrou) continue;
    }

    filtrados.push(p);
  }

  renderizarCards(filtrados);
  atualizarSumario(filtrados.length);
}

function renderizarCards(protocolos) {
  var grid = document.getElementById('protocolGrid');
  var empty = document.getElementById('emptyState');

  if (protocolos.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  var html = '';

  for (var i = 0; i < protocolos.length; i++) {
    var p = protocolos[i];
    html += construirCard(p);
  }

  grid.innerHTML = html;
}

function construirCard(p) {
  var numero = p[CONFIG.fields.protocolo] || '—';
  var statusObj = p[CONFIG.fields.status];
  var statusTexto = statusObj ? (statusObj.value || '') : '';
  var statusClasse = classificarStatus(statusTexto);

  var interessadoArr = p[CONFIG.fields.interessado] || [];
  var interessado = interessadoArr.length > 0 ? interessadoArr[0].value : '—';

  var advArr = p[CONFIG.fields.advogado] || [];
  var advogado = advArr.length > 0 ? advArr[0].value : '';

  var servicoArr = p[CONFIG.fields.servico] || [];
  var servico = servicoArr.length > 0 ? servicoArr[0].value : '—';

  var respArr = p[CONFIG.fields.responsavel] || [];
  var responsavel = respArr.length > 0 ? respArr[0].name : '—';

  var dataEntrada = p[CONFIG.fields.dataEntrada] || '';
  var agendado = p[CONFIG.fields.agendadoPara] || '';

  var diasAberto = '';
  var diasClasse = 'dias-aberto';
  if (statusTexto === 'Em andamento' && dataEntrada) {
    var dias = calcularDiasAberto(dataEntrada);
    diasAberto = dias + (dias === 1 ? ' dia' : ' dias');
    if (dias > 30) diasClasse += ' urgente';
  }

  var statusIcon = '';
  if (statusClasse === 'andamento') statusIcon = 'ph-clock';
  else if (statusClasse === 'finalizado') statusIcon = 'ph-check-circle';
  else if (statusClasse === 'cancelado') statusIcon = 'ph-x-circle';

  var cardClasses = 'protocol-card';
  if (statusTexto === 'Em andamento' && dataEntrada) {
    var diasNum = calcularDiasAberto(dataEntrada);
    if (diasNum > 20) cardClasses += ' card-danger';
    else if (diasNum > 10) cardClasses += ' card-warning';
  }
  if (servico && servico.toLowerCase().indexOf('certid\u00e3o notarial') !== -1) {
    cardClasses += ' card-certidao';
  }

  var cardHtml = '<a href="/protocolo/' + p.id + '" class="' + cardClasses + '">';
  cardHtml += '<div class="card-header">';
  cardHtml += '<span class="proto-number">' + escapeHtml(numero) + '</span>';
  cardHtml += '<span class="status-badge ' + statusClasse + '">';
  if (statusIcon) cardHtml += '<i class="ph ' + statusIcon + '"></i> ';
  cardHtml += escapeHtml(statusTexto) + '</span>';
  cardHtml += '</div>';

  cardHtml += '<div class="card-body">';
  cardHtml += '<div class="card-field"><i class="ph ph-user"></i> ' + escapeHtml(interessado) + '</div>';
  if (advogado) {
    cardHtml += '<div class="card-field secondary"><i class="ph ph-gavel"></i> ' + escapeHtml(advogado) + '</div>';
  }
  cardHtml += '<div class="card-field card-field-servico"><i class="ph ph-file-text"></i> ' + escapeHtml(servico) + '</div>';
  cardHtml += '<div class="card-field"><i class="ph ph-identification-badge"></i> ' + escapeHtml(responsavel) + '</div>';
  cardHtml += '</div>';

  if (diasAberto || agendado) {
    cardHtml += '<div class="card-footer">';
    if (diasAberto) {
      cardHtml += '<span class="' + diasClasse + '"><i class="ph ph-clock"></i> ' + diasAberto + '</span>';
    }
    if (agendado) {
      cardHtml += '<span><i class="ph ph-calendar-blank"></i> ' + formatarData(agendado) + '</span>';
    }
    cardHtml += '</div>';
  }

  cardHtml += '</a>';
  return cardHtml;
}

/* ---------- HELPERS ---------- */

function classificarStatus(texto) {
  if (!texto) return '';
  var t = texto.toLowerCase();
  if (t.indexOf('andamento') !== -1) return 'andamento';
  if (t.indexOf('finalizado') !== -1) return 'finalizado';
  if (t.indexOf('cancelado') !== -1) return 'cancelado';
  return '';
}

function calcularDiasAberto(dataStr) {
  var partes = dataStr.split('-');
  var data = new Date(parseInt(partes[0], 10), parseInt(partes[1], 10) - 1, parseInt(partes[2], 10));
  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  var diff = hoje.getTime() - data.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function formatarData(dataStr) {
  if (!dataStr) return '';
  var partes = dataStr.split('-');
  if (partes.length !== 3) return dataStr;
  return partes[2] + '/' + partes[1] + '/' + partes[0];
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function atualizarSumario(count) {
  var el = document.getElementById('filterSummary');
  if (count === 0) {
    el.textContent = 'Nenhum protocolo encontrado';
  } else if (count === 1) {
    el.textContent = 'Exibindo 1 protocolo';
  } else {
    el.textContent = 'Exibindo ' + count + ' protocolos';
  }
}

/* ---------- HAMBURGER (fallback mobile) ---------- */

function toggleSidebar() {
  var sidebar = document.querySelector('.sidebar');
  var overlay = document.querySelector('.sidebar-overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
}

/* ---------- INIT ---------- */

document.addEventListener('DOMContentLoaded', function() {
  carregarColaboradores();
  carregarProtocolos();

  document.getElementById('filtroStatus').addEventListener('change', aplicarFiltros);
  document.getElementById('filtroResponsavel').addEventListener('change', aplicarFiltros);

  var overlay = document.querySelector('.sidebar-overlay');
  if (overlay) {
    overlay.addEventListener('click', toggleSidebar);
  }
});
