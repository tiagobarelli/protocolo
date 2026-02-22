'use strict';

/* relatorio_controle_atos.js — Relatório de Controle de Atos (ES5) */

var API_BASE = '/api/baserow';

var CONFIG = {
  tables: {
    controle: 745
  },
  fields: {
    livro: 'field_7189',
    pagina: 'field_7190',
    tipoEscritura: 'field_7194',
    digitalizacao: 'field_7200',
    doi: 'field_7201',
    odin: 'field_7202',
    data: 'field_7226',
    retificacaoReversa: 'field_7232',
    substabelecimentoReverso: 'field_7331',
    protocolo: 'field_7377',
    clientes: 'field_7379',
    imoveis: 'field_7384'
  }
};

var livroAtual = null;

/* ---------- HELPERS ---------- */

function apiHeaders() {
  return { 'Content-Type': 'application/json' };
}

function mostrarMsg(id, tipo, texto) {
  var el = document.getElementById(id);
  if (!el) return;
  el.className = 'msg-box ' + tipo;
  el.innerHTML = texto;
  el.style.display = 'flex';
}

function esconderMsg(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.style.display = 'none';
  el.className = 'msg-box';
  el.innerHTML = '';
}

function mostrarOverlay() {
  var el = document.getElementById('overlay');
  if (el) el.classList.add('active');
}

function esconderOverlay() {
  var el = document.getElementById('overlay');
  if (el) el.classList.remove('active');
}

function formatarData(dataStr) {
  if (!dataStr) return '\u2014';
  var partes = dataStr.split('-');
  if (partes.length !== 3) return dataStr;
  return partes[2] + '/' + partes[1] + '/' + partes[0];
}

function obterValorLinkRow(arr) {
  if (!arr || arr.length === 0) return '\u2014';
  return arr[0].value || '\u2014';
}

function obterValorSelect(obj, alerta) {
  if (!obj || !obj.value) return '\u2014';
  var val = obj.value;
  if (alerta && val.toLowerCase() === alerta.toLowerCase()) {
    return '<span class="badge-alerta">' + val + '</span>';
  }
  return val;
}

function badgeSimNao(arr) {
  if (arr && arr.length > 0) {
    return '<span class="badge-sim">Sim</span>';
  }
  return '<span class="badge-nao">N\u00e3o</span>';
}

/* ---------- BUSCA ---------- */

function consultarLivro(livro) {
  livroAtual = livro;
  mostrarOverlay();
  esconderMsg('searchMsg');

  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.controle + '/' +
    '?user_field_names=false' +
    '&filter__' + CONFIG.fields.livro + '__equal=' + encodeURIComponent(livro) +
    '&order_by=' + CONFIG.fields.pagina +
    '&size=200';

  fetch(url, { headers: apiHeaders() })
    .then(function(r) {
      if (!r.ok) throw new Error('Erro na consulta');
      return r.json();
    })
    .then(function(data) {
      var results = data.results || [];
      renderizarResultados(results, livro);
    })
    .catch(function(e) {
      mostrarMsg('searchMsg', 'error', '<i class="ph ph-x-circle"></i> ' + (e.message || 'Erro ao consultar.'));
      console.error(e);
    })
    .then(function() {
      esconderOverlay();
    });
}

function renderizarResultados(results, livro) {
  var container = document.getElementById('resultadosContainer');
  var header = document.getElementById('resultadosHeader');
  var body = document.getElementById('resultadosBody');

  container.style.display = 'block';

  if (results.length === 0) {
    header.innerHTML = '<i class="ph ph-book-open-text"></i> Livro ' + livro;
    body.innerHTML = '<div class="no-results">Nenhum registro cadastrado para o Livro ' + livro + '.</div>';
    return;
  }

  header.innerHTML = '<i class="ph ph-book-open-text"></i> Livro ' + livro + ' \u2014 ' + results.length + ' registro(s) encontrado(s)';

  var html = '<div class="table-wrapper"><table class="report-table">';
  html += '<thead><tr>';
  html += '<th>P\u00e1gina</th>';
  html += '<th>Protocolo</th>';
  html += '<th>Data</th>';
  html += '<th>Tipo Escritura</th>';
  html += '<th>Digitaliza\u00e7\u00e3o</th>';
  html += '<th>DOI</th>';
  html += '<th>ODIN</th>';
  html += '<th>Retificada</th>';
  html += '<th>Substab.</th>';
  html += '<th>Clientes</th>';
  html += '<th>Im\u00f3veis</th>';
  html += '<th>A\u00e7\u00f5es</th>';
  html += '</tr></thead>';
  html += '<tbody>';

  for (var i = 0; i < results.length; i++) {
    var row = results[i];
    var pagina = row[CONFIG.fields.pagina] || '';

    html += '<tr>';
    html += '<td>' + (pagina || '\u2014') + '</td>';
    html += '<td>' + obterValorLinkRow(row[CONFIG.fields.protocolo]) + '</td>';
    html += '<td>' + formatarData(row[CONFIG.fields.data]) + '</td>';
    html += '<td>' + obterValorLinkRow(row[CONFIG.fields.tipoEscritura]) + '</td>';
    html += '<td>' + obterValorSelect(row[CONFIG.fields.digitalizacao], 'Ausente') + '</td>';
    html += '<td>' + obterValorSelect(row[CONFIG.fields.doi], 'Ausente') + '</td>';
    html += '<td>' + obterValorSelect(row[CONFIG.fields.odin], 'Pendente') + '</td>';
    html += '<td>' + badgeSimNao(row[CONFIG.fields.retificacaoReversa]) + '</td>';
    html += '<td>' + badgeSimNao(row[CONFIG.fields.substabelecimentoReverso]) + '</td>';
    html += '<td>' + badgeSimNao(row[CONFIG.fields.clientes]) + '</td>';
    html += '<td>' + badgeSimNao(row[CONFIG.fields.imoveis]) + '</td>';
    html += '<td><button type="button" class="btn-action" onclick="abrirControle(\'' + livro + '\', \'' + pagina.replace(/'/g, "\\'") + '\')" title="Editar no Controle"><i class="ph ph-arrow-square-out"></i></button></td>';
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  body.innerHTML = html;
}

function abrirControle(livro, pagina) {
  window.open('/controle?livro=' + encodeURIComponent(livro) + '&pagina=' + encodeURIComponent(pagina), '_blank');
}

/* ---------- VALIDAÇÃO E EVENTOS ---------- */

function validarEConsultar() {
  var input = document.getElementById('inputLivro');
  var valor = input.value.trim();

  if (!valor) {
    mostrarMsg('searchMsg', 'error', '<i class="ph ph-x-circle"></i> Informe o n\u00famero do Livro.');
    return;
  }

  if (!/^\d+$/.test(valor)) {
    mostrarMsg('searchMsg', 'error', '<i class="ph ph-x-circle"></i> O n\u00famero do Livro deve conter apenas d\u00edgitos.');
    return;
  }

  consultarLivro(valor);
}

/* ---------- AUTO-REFRESH ---------- */

document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible' && livroAtual !== null) {
    consultarLivro(livroAtual);
  }
});

/* ---------- INIT ---------- */

document.addEventListener('DOMContentLoaded', function() {
  var btnConsultar = document.getElementById('btnConsultar');
  if (btnConsultar) {
    btnConsultar.addEventListener('click', validarEConsultar);
  }

  var inputLivro = document.getElementById('inputLivro');
  if (inputLivro) {
    inputLivro.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        validarEConsultar();
      }
    });
    inputLivro.focus();
  }

  // Sidebar overlay
  var overlayEl = document.querySelector('.sidebar-overlay');
  if (overlayEl) {
    overlayEl.addEventListener('click', toggleSidebar);
  }
});
