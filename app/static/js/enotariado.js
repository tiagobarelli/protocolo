'use strict';

// enotariado.js - Listagem do modulo e-Notariado Financeiro (tabela 788). ES5 estrito.
// Leva 1: esqueleto sem fetch. Filtros, busca paginada por ano e tabela real chegam na Leva 3.
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
  valorLiquido: 'field_7579',
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

/* Link multiplo: values juntos por ', ', ou '' */
function valoresLink(arr) {
  if (!arr || arr.length === 0) return '';
  var vals = [];
  var i;
  for (i = 0; i < arr.length; i++) {
    if (arr[i].value) vals.push(arr[i].value);
  }
  return vals.join(', ');
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

/* ---------- RENDER ---------- */

function estadoVazio() {
  return '<div class="enot-vazio"><i class="ph ph-tray"></i>' +
    'Nenhum lançamento encontrado para os filtros.</div>';
}

/* Leva 1: stub. A tabela real (fetch paginado por ano + filtros em memoria) chega na Leva 3. */
function renderLancamentos() {
  var container = document.getElementById('tabelaLancamentos');
  if (!container) return;
  container.innerHTML = estadoVazio();
}

/* ---------- INIT ---------- */

document.addEventListener('DOMContentLoaded', function() {
  popularAnos('filtroAno');
  renderLancamentos();

  var overlayEl = document.querySelector('.sidebar-overlay');
  if (overlayEl) {
    overlayEl.addEventListener('click', toggleSidebar);
  }
});
