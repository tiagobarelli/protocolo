'use strict';

/* relatorio_controle_certidoes.js — Relatório de Certidões Expedidas (ES5) */

var API_BASE = '/api/baserow';

var CONFIG = {
  tables: {
    protocolo: 755,
    certidoes: 776,
    controle: 745
  },
  fields: {
    // Protocolo (755)
    protoNumero: 'field_7240',
    protoInteressado: 'field_7241',
    protoServico: 'field_7242',
    protoDataEntrada: 'field_7250',
    protoCertidao: 'field_7416',
    // Controle_Certidao (776)
    certDataEmissao: 'field_7414',
    certProtocolo: 'field_7415',
    certSubtipo: 'field_7417',
    certEntregueEm: 'field_7418',
    certObservacao: 'field_7423',
    certLinkControle: 'field_7424'
  },
  servicoCertidaoId: 11,
  subtipoAtoNotarial: 3110,
  subtipoTermoComparecimento: 3111,
  subtipoDocAcervo: 3116,
  itensPorPagina: 50
};

/* Estado global */
var paginaAtual = 1;
var totalRegistros = 0;
var buscaAtual = null; // { tipo: 'ano' | 'periodo', dataInicio: '', dataFim: '' }

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

function stripMarkdown(text) {
  if (!text) return '';
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*|_)(.*?)\1/g, '$2');
  text = text.replace(/~~(.*?)~~/g, '$1');
  text = text.replace(/`([^`]*)`/g, '$1');
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/^[\s]*[-*+]\s+/gm, '');
  text = text.replace(/^[\s]*\d+\.\s+/gm, '');
  text = text.replace(/^[-*_]{3,}\s*$/gm, '');
  text = text.replace(/\[[ x]\]\s*/gi, '');
  text = text.replace(/\n+/g, ' ');
  return text;
}

function obterValoresLinkRow(arr) {
  if (!arr || arr.length === 0) return '\u2014';
  var vals = [];
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].value) vals.push(arr[i].value);
  }
  return vals.length > 0 ? vals.join(', ') : '\u2014';
}

/* ---------- BUSCA ---------- */

function buscarCertidoes(pagina) {
  if (!pagina) pagina = 1;
  paginaAtual = pagina;

  mostrarOverlay();
  esconderMsg('searchMsg');

  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.protocolo + '/' +
    '?user_field_names=false' +
    '&filter__' + CONFIG.fields.protoServico + '__link_row_has=' + CONFIG.servicoCertidaoId +
    '&filter__' + CONFIG.fields.protoDataEntrada + '__date_after=' + encodeURIComponent(buscaAtual.dataInicio) +
    '&filter__' + CONFIG.fields.protoDataEntrada + '__date_before=' + encodeURIComponent(buscaAtual.dataFim) +
    '&order_by=' + CONFIG.fields.protoDataEntrada +
    '&size=' + CONFIG.itensPorPagina +
    '&page=' + pagina;

  fetch(url, { headers: apiHeaders() })
    .then(function(r) {
      if (!r.ok) throw new Error('Erro na consulta');
      return r.json();
    })
    .then(function(data) {
      totalRegistros = data.count || 0;
      var protocolos = data.results || [];
      buscarDadosCertidao(protocolos);
    })
    .catch(function(e) {
      mostrarMsg('searchMsg', 'error', '<i class="ph ph-x-circle"></i> ' + (e.message || 'Erro ao consultar.'));
      console.error(e);
      esconderOverlay();
    });
}

function buscarDadosCertidao(protocolos) {
  // Identificar protocolos com certidão expedida (field_7416 preenchido)
  var expedidos = [];
  var idsParaBuscar = [];

  for (var i = 0; i < protocolos.length; i++) {
    var certArr = protocolos[i][CONFIG.fields.protoCertidao];
    if (certArr && certArr.length > 0) {
      expedidos.push({ index: i, certId: certArr[0].id });
      idsParaBuscar.push(certArr[0].id);
    }
  }

  if (idsParaBuscar.length === 0) {
    // Nenhuma certidão expedida, renderizar direto
    renderizarResultados(protocolos, {});
    return;
  }

  // Buscar dados da table 776 para cada certidão expedida
  var dadosCert = {};
  var completados = 0;
  var totalBuscas = idsParaBuscar.length;

  for (var j = 0; j < expedidos.length; j++) {
    (function(certId) {
      var urlCert = API_BASE + '/database/rows/table/' + CONFIG.tables.certidoes + '/' + certId + '/?user_field_names=false';
      fetch(urlCert, { headers: apiHeaders() })
        .then(function(r) {
          if (!r.ok) throw new Error('Erro ao buscar certidão ' + certId);
          return r.json();
        })
        .then(function(certData) {
          dadosCert[certId] = certData;
        })
        .catch(function(e) {
          console.error(e);
        })
        .then(function() {
          completados++;
          if (completados === totalBuscas) {
            renderizarResultados(protocolos, dadosCert);
          }
        });
    })(expedidos[j].certId);
  }
}

/* ---------- RENDERIZAÇÃO ---------- */

function renderizarResultados(protocolos, dadosCert) {
  var container = document.getElementById('resultadosContainer');
  var header = document.getElementById('resultadosHeader');
  var body = document.getElementById('resultadosBody');
  var resumo = document.getElementById('resumoBar');

  container.style.display = 'block';

  if (protocolos.length === 0) {
    header.innerHTML = '<i class="ph ph-seal-check"></i> Certid\u00f5es';
    resumo.innerHTML = '';
    body.innerHTML = '<div class="no-results">Nenhum protocolo de certid\u00e3o encontrado no per\u00edodo selecionado.</div>';
    document.getElementById('paginationContainer').style.display = 'none';
    esconderOverlay();
    return;
  }

  header.innerHTML = '<i class="ph ph-seal-check"></i> Certid\u00f5es Expedidas';

  // Contadores da página
  var expedidasPagina = 0;
  var pendentesPagina = 0;
  for (var c = 0; c < protocolos.length; c++) {
    var certArrC = protocolos[c][CONFIG.fields.protoCertidao];
    if (certArrC && certArrC.length > 0) {
      expedidasPagina++;
    } else {
      pendentesPagina++;
    }
  }

  resumo.innerHTML = '<strong>Total: ' + totalRegistros + ' certid\u00e3o(\u00f5es)</strong> \u2014 Nesta p\u00e1gina: ' +
    expedidasPagina + ' expedida(s), ' + pendentesPagina + ' pendente(s)';

  // Montar tabela
  var html = '<div class="table-wrapper"><table class="report-table">';
  html += '<thead><tr>';
  html += '<th>N\u00ba Protocolo</th>';
  html += '<th>Data Protocolo</th>';
  html += '<th>Interessado</th>';
  html += '<th>Situa\u00e7\u00e3o</th>';
  html += '<th>Data Emiss\u00e3o</th>';
  html += '<th>Data Entrega</th>';
  html += '<th>Escritura / Tipo</th>';
  html += '</tr></thead>';
  html += '<tbody>';

  for (var i = 0; i < protocolos.length; i++) {
    var row = protocolos[i];
    var certArr = row[CONFIG.fields.protoCertidao];
    var expedida = certArr && certArr.length > 0;
    var certId = expedida ? certArr[0].id : null;
    var cert = (certId && dadosCert[certId]) ? dadosCert[certId] : null;

    html += '<tr>';

    // Nº Protocolo
    html += '<td>' + (row[CONFIG.fields.protoNumero] || '\u2014') + '</td>';

    // Data Protocolo
    html += '<td>' + formatarData(row[CONFIG.fields.protoDataEntrada]) + '</td>';

    // Interessado (link_row múltiplo)
    html += '<td>' + obterValoresLinkRow(row[CONFIG.fields.protoInteressado]) + '</td>';

    // Situação
    if (expedida) {
      html += '<td><span class="badge-expedida">Expedida</span></td>';
    } else {
      html += '<td><span class="badge-pendente">Pendente</span></td>';
    }

    // Data Emissão
    html += '<td>' + (cert ? formatarData(cert[CONFIG.fields.certDataEmissao]) : '\u2014') + '</td>';

    // Data Entrega
    html += '<td>' + (cert ? formatarData(cert[CONFIG.fields.certEntregueEm]) : '\u2014') + '</td>';

    // Escritura / Tipo
    html += '<td>' + montarColunaEscrituraTipo(expedida, cert) + '</td>';

    html += '</tr>';

    // Linha extra de observação
    if (cert) {
      var obsRaw = cert[CONFIG.fields.certObservacao] || '';
      var obsTexto = stripMarkdown(obsRaw).replace(/^\s+|\s+$/g, '');
      if (obsTexto) {
        html += '<tr class="obs-row">';
        html += '<td colspan="7"><div class="obs-content"><i class="ph ph-note"></i>' + obsTexto + '</div></td>';
        html += '</tr>';
      }
    }
  }

  html += '</tbody></table></div>';
  body.innerHTML = html;

  renderizarPaginacao();
  esconderOverlay();
}

function montarColunaEscrituraTipo(expedida, cert) {
  if (!expedida || !cert) return '\u2014';

  var subtipo = cert[CONFIG.fields.certSubtipo];
  var subtipoId = null;
  if (subtipo && subtipo.id) {
    subtipoId = subtipo.id;
  }

  if (subtipoId === CONFIG.subtipoAtoNotarial) {
    // Ato notarial — verificar link com controle (field_7424)
    var linkControle = cert[CONFIG.fields.certLinkControle];
    if (linkControle && linkControle.length > 0) {
      return obterValoresLinkRow(linkControle);
    }
    return '<span class="text-muted-italic">escritura n\u00e3o vinculada</span>';
  }

  if (subtipoId === CONFIG.subtipoTermoComparecimento) {
    return 'Termo de comparecimento';
  }

  if (subtipoId === CONFIG.subtipoDocAcervo) {
    return 'Documento do acervo';
  }

  // Subtipo desconhecido ou ausente
  if (subtipo && subtipo.value) {
    return subtipo.value;
  }

  return '\u2014';
}

/* ---------- PAGINAÇÃO ---------- */

function renderizarPaginacao() {
  var totalPaginas = Math.ceil(totalRegistros / CONFIG.itensPorPagina);
  var container = document.getElementById('paginationContainer');
  if (!container) return;

  if (totalPaginas <= 1) {
    container.style.display = 'none';
    return;
  }

  var html = '';
  html += '<button class="pagination-btn" id="paginaAnterior"' + (paginaAtual === 1 ? ' disabled' : '') + '>';
  html += '<i class="ph ph-caret-left"></i>';
  html += '</button>';
  html += '<span class="pagination-indicator">P\u00e1gina ' + paginaAtual + ' de ' + totalPaginas + '</span>';
  html += '<button class="pagination-btn" id="paginaProxima"' + (paginaAtual === totalPaginas ? ' disabled' : '') + '>';
  html += '<i class="ph ph-caret-right"></i>';
  html += '</button>';

  container.innerHTML = html;
  container.style.display = 'flex';

  var btnAnterior = document.getElementById('paginaAnterior');
  var btnProxima = document.getElementById('paginaProxima');

  btnAnterior.addEventListener('click', function() {
    if (paginaAtual > 1) {
      paginaAtual--;
      buscarCertidoes(paginaAtual);
      document.getElementById('resultadosContainer').scrollIntoView({ behavior: 'smooth' });
    }
  });

  btnProxima.addEventListener('click', function() {
    if (paginaAtual < totalPaginas) {
      paginaAtual++;
      buscarCertidoes(paginaAtual);
      document.getElementById('resultadosContainer').scrollIntoView({ behavior: 'smooth' });
    }
  });
}

/* ---------- AÇÕES DE BUSCA ---------- */

function buscarAnoCorrente() {
  var ano = new Date().getFullYear();
  buscaAtual = {
    tipo: 'ano',
    dataInicio: ano + '-01-01',
    dataFim: ano + '-12-31'
  };
  paginaAtual = 1;

  mostrarMsg('searchMsg', 'info', '<i class="ph ph-info"></i> Listagem de certid\u00f5es do ano corrente. Para um relat\u00f3rio de per\u00edodo determinado, utilize a busca por data.');
  buscarCertidoes(1);
}

function buscarPorPeriodo() {
  var inputInicio = document.getElementById('dataInicio');
  var inputFim = document.getElementById('dataFim');
  var dataInicio = inputInicio.value;
  var dataFim = inputFim.value;

  if (!dataInicio || !dataFim) {
    mostrarMsg('searchMsg', 'error', '<i class="ph ph-x-circle"></i> Informe a data de in\u00edcio e a data de fim.');
    return;
  }

  // Validar intervalo máximo de 365 dias
  var dtInicio = new Date(dataInicio);
  var dtFim = new Date(dataFim);

  if (dtFim < dtInicio) {
    mostrarMsg('searchMsg', 'error', '<i class="ph ph-x-circle"></i> A data de fim deve ser posterior \u00e0 data de in\u00edcio.');
    return;
  }

  var diffMs = dtFim.getTime() - dtInicio.getTime();
  var diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDias > 365) {
    mostrarMsg('searchMsg', 'error', '<i class="ph ph-x-circle"></i> O per\u00edodo m\u00e1ximo de busca \u00e9 de 1 ano.');
    return;
  }

  buscaAtual = {
    tipo: 'periodo',
    dataInicio: dataInicio,
    dataFim: dataFim
  };
  paginaAtual = 1;

  esconderMsg('searchMsg');
  buscarCertidoes(1);
}

/* ---------- AUTO-REFRESH ---------- */

document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible' && buscaAtual !== null) {
    buscarCertidoes(paginaAtual);
  }
});

/* ---------- INIT ---------- */

document.addEventListener('DOMContentLoaded', function() {
  var btnAno = document.getElementById('btnAnoCorrente');
  if (btnAno) {
    btnAno.addEventListener('click', buscarAnoCorrente);
  }

  var btnPeriodo = document.getElementById('btnBuscarPeriodo');
  if (btnPeriodo) {
    btnPeriodo.addEventListener('click', buscarPorPeriodo);
  }

  // Sidebar overlay
  var overlayEl = document.querySelector('.sidebar-overlay');
  if (overlayEl) {
    overlayEl.addEventListener('click', toggleSidebar);
  }
});
