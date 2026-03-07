'use strict';

/* relatorio_coaf.js — Relatório COAF / Lavagem de Dinheiro (ES5) */

var API_BASE = '/api/baserow';

var CONFIG = {
  tables: {
    controle: 745,
    tipagem:  746,
    coaf:     756
  },
  fields: {
    // Controle (745)
    ctrlLivro:        'field_7189',
    ctrlPagina:       'field_7190',
    ctrlTipoEscritura:'field_7194',
    ctrlData:         'field_7226',
    ctrlCoaf:         'field_7260',
    // Tipagem (746)
    tipNome:          'field_7191',
    tipSujeitoCoaf:   'field_7427',
    // COAF (756)
    coafAnalise:      'field_7264',
    coafDetalhamento: 'field_7265',
    coafNumCom:       'field_7266',
    coafDataCom:      'field_7267'
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

function truncarTexto(texto, max) {
  if (!texto) return '\u2014';
  return texto.length > max ? texto.substring(0, max) + '\u2026' : texto;
}

function stripMarkdown(text) {
  if (!text) return '';
  // Links [text](url) → text
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Bold **text** or __text__
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  // Italic *text* or _text_
  text = text.replace(/(\*|_)(.*?)\1/g, '$2');
  // Strikethrough ~~text~~
  text = text.replace(/~~(.*?)~~/g, '$1');
  // Inline code `text`
  text = text.replace(/`([^`]*)`/g, '$1');
  // Headers # ## ### etc
  text = text.replace(/^#{1,6}\s+/gm, '');
  // Unordered lists - or *
  text = text.replace(/^[\s]*[-*+]\s+/gm, '');
  // Ordered lists 1. 2. etc
  text = text.replace(/^[\s]*\d+\.\s+/gm, '');
  // Horizontal rules
  text = text.replace(/^[-*_]{3,}\s*$/gm, '');
  // Checklist [ ] [x]
  text = text.replace(/\[[ x]\]\s*/gi, '');
  // Multiple newlines → single space
  text = text.replace(/\n+/g, ' ');
  return text;
}

/* ---------- ABRIR COAF ---------- */

function abrirCoaf(livro, pagina) {
  window.open('/coaf?livro=' + encodeURIComponent(livro) + '&pagina=' + encodeURIComponent(pagina), '_blank');
}

/* ---------- BUSCA ---------- */

function consultarLivro(livro) {
  livroAtual = livro;
  mostrarOverlay();
  esconderMsg('searchMsg');

  var urlControle = API_BASE + '/database/rows/table/' + CONFIG.tables.controle + '/' +
    '?user_field_names=false' +
    '&filter__' + CONFIG.fields.ctrlLivro + '__equal=' + encodeURIComponent(livro) +
    '&order_by=' + CONFIG.fields.ctrlPagina +
    '&size=200';

  var urlTipagem = API_BASE + '/database/rows/table/' + CONFIG.tables.tipagem + '/' +
    '?user_field_names=false&size=200';

  // Passos A e B em paralelo
  Promise.all([
    fetch(urlControle, { headers: apiHeaders() }).then(function(r) {
      if (!r.ok) throw new Error('Erro ao buscar registros do livro.');
      return r.json();
    }),
    fetch(urlTipagem, { headers: apiHeaders() }).then(function(r) {
      if (!r.ok) throw new Error('Erro ao buscar tipos de escritura.');
      return r.json();
    })
  ])
  .then(function(respostas) {
    var controleData = respostas[0];
    var tipagemData = respostas[1];

    var registros = controleData.results || [];

    // Passo B — montar mapa de tipos
    var mapaTypes = {};
    var tiposArr = tipagemData.results || [];
    for (var t = 0; t < tiposArr.length; t++) {
      var tipo = tiposArr[t];
      mapaTypes[tipo.id] = {
        nome: tipo[CONFIG.fields.tipNome] || '',
        sujeitoCoaf: !!tipo[CONFIG.fields.tipSujeitoCoaf]
      };
    }

    // Passo C — filtrar linhas cujo tipo tem sujeitoCoaf === true
    var linhasFiltradas = [];
    var coafIds = [];
    for (var i = 0; i < registros.length; i++) {
      var row = registros[i];
      var tipoArr = row[CONFIG.fields.ctrlTipoEscritura];
      if (!tipoArr || tipoArr.length === 0) continue;

      var tipoId = tipoArr[0].id;
      var tipoInfo = mapaTypes[tipoId];
      if (!tipoInfo || !tipoInfo.sujeitoCoaf) continue;

      var coafArr = row[CONFIG.fields.ctrlCoaf];
      var coafId = (coafArr && coafArr.length > 0) ? coafArr[0].id : null;

      linhasFiltradas.push({
        row: row,
        tipoNome: tipoInfo.nome,
        coafId: coafId
      });

      if (coafId !== null && coafIds.indexOf(coafId) === -1) {
        coafIds.push(coafId);
      }
    }

    // Passo D — buscar dados COAF em lote
    if (coafIds.length === 0) {
      renderizarResultados(linhasFiltradas, livro, {});
      return;
    }

    var urlCoaf = API_BASE + '/database/rows/table/' + CONFIG.tables.coaf + '/' +
      '?user_field_names=false' +
      '&filter__id__in=' + coafIds.join(',') +
      '&size=200';

    return fetch(urlCoaf, { headers: apiHeaders() })
      .then(function(r) {
        if (!r.ok) throw new Error('Erro ao buscar dados COAF.');
        return r.json();
      })
      .then(function(coafData) {
        var dadosCoaf = {};
        var coafRows = coafData.results || [];
        for (var c = 0; c < coafRows.length; c++) {
          dadosCoaf[coafRows[c].id] = coafRows[c];
        }
        renderizarResultados(linhasFiltradas, livro, dadosCoaf);
      });
  })
  .catch(function(e) {
    mostrarMsg('searchMsg', 'error', '<i class="ph ph-x-circle"></i> ' + (e.message || 'Erro ao consultar.'));
    console.error(e);
  })
  .then(function() {
    esconderOverlay();
  });
}

/* ---------- RENDERIZAÇÃO ---------- */

function renderizarResultados(linhasFiltradas, livro, dadosCoaf) {
  var container = document.getElementById('resultadosContainer');
  var header = document.getElementById('resultadosHeader');
  var body = document.getElementById('resultadosBody');

  container.style.display = 'block';

  if (linhasFiltradas.length === 0) {
    header.innerHTML = '<i class="ph ph-hand-coins"></i> Livro ' + livro;
    body.innerHTML = '<div class="no-results">Nenhuma escritura do Livro ' + livro + ' est\u00e1 sujeita \u00e0 an\u00e1lise COAF.</div>';
    return;
  }

  header.innerHTML = '<i class="ph ph-hand-coins"></i> Livro ' + livro + ' \u2014 ' + linhasFiltradas.length + ' escritura(s) sujeita(s) \u00e0 an\u00e1lise COAF';

  var html = '<div class="table-wrapper"><table class="report-table">';
  html += '<thead><tr>';
  html += '<th>P\u00e1gina</th>';
  html += '<th>Data</th>';
  html += '<th>Tipo Escritura</th>';
  html += '<th>An\u00e1lise</th>';
  html += '<th>N\u00ba Comunica\u00e7\u00e3o</th>';
  html += '<th>Data Comunica\u00e7\u00e3o</th>';
  html += '<th>A\u00e7\u00f5es</th>';
  html += '</tr></thead>';
  html += '<tbody>';

  for (var i = 0; i < linhasFiltradas.length; i++) {
    var item = linhasFiltradas[i];
    var row = item.row;
    var coafId = item.coafId;
    var pagina = row[CONFIG.fields.ctrlPagina] || '';

    // Colunas da linha principal
    var analiseHtml;
    var numComHtml = '\u2014';
    var dataComHtml = '\u2014';
    var coafRow = null;

    if (coafId !== null && dadosCoaf[coafId]) {
      coafRow = dadosCoaf[coafId];
      var analiseObj = coafRow[CONFIG.fields.coafAnalise];
      if (analiseObj && analiseObj.value) {
        var textoCompleto = analiseObj.value;
        analiseHtml = '<span title="' + textoCompleto.replace(/"/g, '&quot;') + '">' + truncarTexto(textoCompleto, 50) + '</span>';
      } else {
        analiseHtml = '<span class="badge-pendente">Sem parecer</span>';
      }
      numComHtml = coafRow[CONFIG.fields.coafNumCom] || '\u2014';
      dataComHtml = formatarData(coafRow[CONFIG.fields.coafDataCom]);
    } else if (coafId !== null) {
      analiseHtml = '<span class="badge-pendente">Sem parecer</span>';
    } else {
      analiseHtml = '<span class="badge-nao-cadastrado">N\u00e3o cadastrado</span>';
    }

    html += '<tr>';
    html += '<td>' + (pagina || '\u2014') + '</td>';
    html += '<td>' + formatarData(row[CONFIG.fields.ctrlData]) + '</td>';
    html += '<td>' + item.tipoNome + '</td>';
    html += '<td>' + analiseHtml + '</td>';
    html += '<td>' + numComHtml + '</td>';
    html += '<td>' + dataComHtml + '</td>';
    html += '<td><button type="button" class="btn-action" onclick="abrirCoaf(\'' + livro + '\', \'' + pagina.replace(/'/g, "\\'") + '\')" title="Abrir no Controle COAF"><i class="ph ph-arrow-square-out"></i></button></td>';
    html += '</tr>';

    // Linha de detalhamento (condicional)
    if (coafRow) {
      var detalhamentoRaw = coafRow[CONFIG.fields.coafDetalhamento] || '';
      var detalhamentoTexto = stripMarkdown(detalhamentoRaw).replace(/^\s+|\s+$/g, '');
      if (detalhamentoTexto) {
        html += '<tr class="pendencia-row">';
        html += '<td colspan="7"><div class="pendencia-content"><i class="ph ph-note"></i>' + detalhamentoTexto + '</div></td>';
        html += '</tr>';
      }
    }
  }

  html += '</tbody></table></div>';
  body.innerHTML = html;
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
