'use strict';

// enotariado.js - Listagem do modulo e-Notariado Financeiro (tabela 788). ES5 estrito.
// Leva 3: busca paginada por ano (server-side, sem excluidos), filtros em memoria
// (especie, guia semanal, status de lancamento, busca textual) e tabela com linha clicavel.
// Convencao do arquivo: proibido em-dash (caractere ou escape); separadores usam '-' ou '·'.

var API_BASE = '/api/baserow';
var TABLE_LANCAMENTOS = 788;
var TABLE_ESPECIES = 787;
var ANO_INICIAL = 2025;
var PAGE_SIZE = 200;

/* Field IDs - lancamentos_enotariado (788) */
var F = {
  rotulo: 'field_7566',
  numeroPedido: 'field_7567',
  especie: 'field_7569',
  quantidade: 'field_7570',
  dataRealizacao: 'field_7571',
  solicitantes: 'field_7572',
  dataLancamento: 'field_7574',
  guiaSemanal: 'field_7575',
  valorBruto: 'field_7576',
  taxasCobranca: 'field_7577',
  taxaCnb: 'field_7578',
  valorLiquido: 'field_7579',   /* formula read-only: so leitura */
  observacoes: 'field_7580',
  criadoPor: 'field_7581',
  criadoEm: 'field_7582',
  atualizadoEm: 'field_7583',
  excluido: 'field_7584',
  logs: 'field_7585'
};

/* Field IDs - especies_enotariado (787) */
var F_ESP = {
  nome: 'field_7562',
  valorUnitario: 'field_7563',
  ativo: 'field_7564',
  observacoes: 'field_7565'
};

/* Estado */
var lancamentos = [];    /* linhas da 788 do ano do filtro (ja sem excluidos) */
var especiesLista = [];  /* linhas da 787 (ativas e inativas) */
var buscaTimer = null;   /* debounce da busca textual */

/* ---------- HELPERS ---------- */

function apiHeaders() {
  return { 'Content-Type': 'application/json' };
}

function esc(texto) {
  if (texto === null || texto === undefined) return '';
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mostrarOverlay() {
  var el = document.getElementById('overlay');
  if (el) el.classList.add('active');
}

function esconderOverlay() {
  var el = document.getElementById('overlay');
  if (el) el.classList.remove('active');
}

/* Data ISO (YYYY-MM-DD...) para DD/MM/AAAA por fatiamento (sem new Date, evita fuso) */
function formatarData(dataStr) {
  if (!dataStr) return '-';
  var iso = String(dataStr).slice(0, 10);
  var partes = iso.split('-');
  if (partes.length !== 3) return esc(dataStr);
  return partes[2] + '/' + partes[1] + '/' + partes[0];
}

/* Parte YYYY-MM-DD para ordenacao direta de string */
function chaveData(dataStr) {
  if (!dataStr) return '';
  return String(dataStr).slice(0, 10);
}

/* Link multiplo: values juntos por ', '; vazio vira '-' */
function valoresLink(arr) {
  if (!arr || arr.length === 0) return '-';
  var vals = [];
  var i;
  for (i = 0; i < arr.length; i++) {
    if (arr[i].value) vals.push(arr[i].value);
  }
  return vals.length ? vals.join(', ') : '-';
}

/* Numero do Baserow (string '123.45' ou number) para '123,45'; nulo/invalido vira '-' */
function formatarMoeda(valor) {
  var n = parseFloat(valor);
  if (isNaN(n)) return '-';
  return n.toFixed(2).replace('.', ',');
}

/* Inteiro do Baserow (string '3' ou number) para '3'; nulo/invalido vira '-' */
function formatarInteiro(valor) {
  var n = parseInt(valor, 10);
  if (isNaN(n)) return '-';
  return String(n);
}

/* ---------- FILTRO DE ANO ---------- */

/* Ano corrente ate ANO_INICIAL, decrescente; ano corrente selecionado */
function popularAnos(selectId) {
  var sel = document.getElementById(selectId);
  if (!sel) return;
  var anoCorrente = new Date().getFullYear();
  var ano;
  for (ano = anoCorrente; ano >= ANO_INICIAL; ano--) {
    var opt = document.createElement('option');
    opt.value = String(ano);
    opt.textContent = String(ano);
    sel.appendChild(opt);
  }
  sel.value = String(anoCorrente);
}

/* ---------- ESPECIES (filtro; todas as linhas da 787, sem sufixo) ---------- */

function carregarEspeciesFiltro() {
  var url = API_BASE + '/database/rows/table/' + TABLE_ESPECIES +
    '/?user_field_names=false&size=200&order_by=' + F_ESP.nome;
  fetch(url, { headers: apiHeaders() })
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function(data) {
      especiesLista = data.results || [];
      var sel = document.getElementById('filtroEspecie');
      if (!sel) return;
      sel.innerHTML = '<option value="">Todas</option>';
      var i;
      for (i = 0; i < especiesLista.length; i++) {
        var opt = document.createElement('option');
        opt.value = String(especiesLista[i].id);
        opt.textContent = especiesLista[i][F_ESP.nome] || ('#' + especiesLista[i].id);
        sel.appendChild(opt);
      }
    })
    .catch(function() {
      mostrarToast('Não foi possível carregar as espécies do filtro.', 'error');
    });
}

/* ---------- BUSCA PAGINADA (788) ---------- */

/* URL de uma pagina do ano: filtro de data inclusivo sobre data_realizacao (mesmos operadores e
   formato de oficios.js), sem excluidos, mais recentes primeiro. O desempate por id fica em
   ordenarLancamentos(): o Baserow rejeita '-id' no order_by (ERROR_ORDER_BY_FIELD_NOT_FOUND). */
function montarUrlLancamentos(ano, page) {
  return API_BASE + '/database/rows/table/' + TABLE_LANCAMENTOS + '/' +
    '?user_field_names=false' +
    '&filter__field_7571__date_after_or_equal=' + encodeURIComponent(ano + '-01-01') +
    '&filter__field_7571__date_before_or_equal=' + encodeURIComponent(ano + '-12-31') +
    '&filter__field_7584__boolean=false' +
    '&order_by=-field_7571' +
    '&size=' + PAGE_SIZE +
    '&page=' + page;
}

/* Data de realizacao decrescente (string YYYY-MM-DD, nunca new Date) com desempate por id decrescente */
function ordenarLancamentos(rows) {
  rows.sort(function(a, b) {
    var ka = chaveData(a[F.dataRealizacao]);
    var kb = chaveData(b[F.dataRealizacao]);
    if (ka < kb) return 1;
    if (ka > kb) return -1;
    return (b.id || 0) - (a.id || 0);
  });
  return rows;
}

/* Acumula todas as paginas do ano (mecanica de estatisticas.js: recursao em Promise enquanto
   houver data.next). Qualquer resposta nao-ok rejeita. Devolve a Promise e chama callback(rows). */
function buscarTodasPaginas(ano, callback) {
  var acumulado = [];

  function buscarPagina(pagina) {
    return fetch(montarUrlLancamentos(ano, pagina), { headers: apiHeaders() })
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(data) {
        var resultados = data.results || [];
        var i;
        for (i = 0; i < resultados.length; i++) {
          acumulado.push(resultados[i]);
        }
        if (data.next) {
          return buscarPagina(pagina + 1);
        }
        return acumulado;
      });
  }

  return buscarPagina(1).then(function(rows) {
    callback(rows);
    return rows;
  });
}

/* Refetch do ano selecionado (sem cache); erro vira toast e a tabela mostra o estado vazio */
function carregarLancamentos() {
  var ano = document.getElementById('filtroAno').value;
  mostrarOverlay();
  lancamentos = [];
  buscarTodasPaginas(ano, function(rows) {
    lancamentos = ordenarLancamentos(rows);
    renderLancamentos();
  })
    .then(function() {
      esconderOverlay();
    })
    .catch(function(e) {
      esconderOverlay();
      mostrarToast('Erro ao carregar lançamentos: ' + ((e && e.message) ? e.message : 'falha na consulta'), 'error');
      renderLancamentos();
    });
}

/* ---------- FILTROS EM MEMORIA ---------- */

function filtrarLancamentos() {
  var especieVal = document.getElementById('filtroEspecie').value;
  var guiaVal = document.getElementById('filtroGuia').value.trim();
  var statusVal = document.getElementById('filtroStatus').value;
  var termo = document.getElementById('filtroBusca').value.trim().toLowerCase();
  var guiaNum = guiaVal ? parseInt(guiaVal, 10) : NaN;
  var saida = [];
  var i, j;

  for (i = 0; i < lancamentos.length; i++) {
    var row = lancamentos[i];

    if (especieVal) {
      var espArr = row[F.especie];
      if (!espArr || espArr.length === 0 || String(espArr[0].id) !== especieVal) continue;
    }

    if (guiaVal) {
      if (parseInt(row[F.guiaSemanal], 10) !== guiaNum) continue;
    }

    if (statusVal === 'lancado' && !row[F.dataLancamento]) continue;
    if (statusVal === 'nao_lancado' && row[F.dataLancamento]) continue;

    if (termo) {
      var achou = String(row[F.numeroPedido] || '').toLowerCase().indexOf(termo) !== -1;
      var sols = row[F.solicitantes] || [];
      for (j = 0; j < sols.length && !achou; j++) {
        if (String(sols[j].value || '').toLowerCase().indexOf(termo) !== -1) achou = true;
      }
      if (!achou) continue;
    }

    saida.push(row);
  }
  return saida;
}

/* ---------- RENDER ---------- */

function estadoVazio() {
  return '<div class="enot-vazio"><i class="ph ph-tray"></i>' +
    'Nenhum lançamento encontrado para os filtros.</div>';
}

/* Coluna Lancamento: data em badge verde; sem data = badge amarelo "Nao lancado" */
function badgeLancamento(dataLancamento) {
  if (dataLancamento) {
    return '<span class="badge badge-success enot-badge">' + formatarData(dataLancamento) + '</span>';
  }
  return '<span class="badge badge-warning enot-badge">Não lançado</span>';
}

/* Linha inteira clicavel: abre o detalhe do lancamento */
function ligarCliqueLinhas(container) {
  var linhas = container.querySelectorAll('.enot-row');
  var i;
  for (i = 0; i < linhas.length; i++) {
    linhas[i].addEventListener('click', function() {
      var id = this.getAttribute('data-id');
      if (id) window.location.href = '/enotariado/lancamento/' + id;
    });
  }
}

function renderLancamentos() {
  var container = document.getElementById('tabelaLancamentos');
  if (!container) return;
  var lista = filtrarLancamentos();

  if (lista.length === 0) {
    container.innerHTML = estadoVazio();
    return;
  }

  var html = '<div class="oficios-table-wrapper"><table class="oficios-table">';
  html += '<thead><tr>';
  html += '<th>Realização</th><th>Pedido</th><th>Espécie</th><th class="enot-td-num">Qtd</th>';
  html += '<th>Solicitantes</th><th class="enot-td-num">Bruto</th><th class="enot-td-num">Taxas</th>';
  html += '<th class="enot-td-num">CNB</th><th class="enot-td-num">Líquido</th><th class="enot-td-num">Guia</th>';
  html += '<th>Lançamento</th>';
  html += '</tr></thead><tbody>';

  var i;
  for (i = 0; i < lista.length; i++) {
    var row = lista[i];
    html += '<tr class="enot-row" data-id="' + row.id + '">';
    html += '<td>' + formatarData(row[F.dataRealizacao]) + '</td>';
    html += '<td class="enot-num">' + esc(row[F.numeroPedido] || '-') + '</td>';
    html += '<td>' + esc(valoresLink(row[F.especie])) + '</td>';
    html += '<td class="enot-td-num">' + formatarInteiro(row[F.quantidade]) + '</td>';
    html += '<td>' + esc(valoresLink(row[F.solicitantes])) + '</td>';
    html += '<td class="enot-td-num">' + formatarMoeda(row[F.valorBruto]) + '</td>';
    html += '<td class="enot-td-num">' + formatarMoeda(row[F.taxasCobranca]) + '</td>';
    html += '<td class="enot-td-num">' + formatarMoeda(row[F.taxaCnb]) + '</td>';
    html += '<td class="enot-td-num">' + formatarMoeda(row[F.valorLiquido]) + '</td>';
    html += '<td class="enot-td-num">' + formatarInteiro(row[F.guiaSemanal]) + '</td>';
    html += '<td>' + badgeLancamento(row[F.dataLancamento]) + '</td>';
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  container.innerHTML = html;
  ligarCliqueLinhas(container);
}

/* ---------- INIT ---------- */

document.addEventListener('DOMContentLoaded', function() {
  popularAnos('filtroAno');

  document.getElementById('filtroAno').addEventListener('change', carregarLancamentos);
  document.getElementById('filtroEspecie').addEventListener('change', renderLancamentos);
  document.getElementById('filtroStatus').addEventListener('change', renderLancamentos);
  document.getElementById('filtroGuia').addEventListener('input', renderLancamentos);
  document.getElementById('filtroBusca').addEventListener('input', function() {
    if (buscaTimer) clearTimeout(buscaTimer);
    buscaTimer = setTimeout(renderLancamentos, 250);
  });

  var overlayEl = document.querySelector('.sidebar-overlay');
  if (overlayEl) {
    overlayEl.addEventListener('click', toggleSidebar);
  }

  /* Independentes: o filtro de especies e a listagem carregam em paralelo */
  carregarEspeciesFiltro();
  carregarLancamentos();
});
