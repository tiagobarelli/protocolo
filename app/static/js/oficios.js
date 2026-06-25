'use strict';

/* oficios.js — Módulo Ofícios: listagem read-only (Recebidos | Enviados). ES5 estrito. */

var API_BASE = '/api/baserow';
var TABLE_RECEBIDOS = 781;
var TABLE_ENVIADOS = 782;
var ANO_INICIAL = 2024;
var PAGE_SIZE = 200;

/* Field IDs — recebidos (781) */
var F_REC = {
  numero: 'field_7486',
  letra: 'field_7487',
  dataEntrada: 'field_7488',
  remetente: 'field_7489',
  descricao: 'field_7491',
  cliente: 'field_7492',
  dataCumprimento: 'field_7494',
  resposta: 'field_7503'
};

/* Field IDs — enviados (782) */
var F_ENV = {
  numero: 'field_7495',
  letra: 'field_7496',
  dataEnvio: 'field_7497',
  destinatario: 'field_7498',
  descricao: 'field_7500',
  cliente: 'field_7501',
  resposta: 'field_7504'
};

/* Estado: conjunto carregado por aba (cache do ano corrente) */
var dadosRecebidos = [];
var dadosEnviados = [];
var carregadoRecebidos = false;
var carregadoEnviados = false;

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

/* Data ISO (YYYY-MM-DD...) → DD/MM/AAAA por fatiamento (sem new Date, evita fuso) */
function formatarData(dataStr) {
  if (!dataStr) return '—';
  var iso = String(dataStr).slice(0, 10);
  var partes = iso.split('-');
  if (partes.length !== 3) return esc(dataStr);
  return partes[2] + '/' + partes[1] + '/' + partes[0];
}

/* Parte YYYY-MM-DD para ordenação direta de string */
function chaveData(dataStr) {
  if (!dataStr) return '';
  return String(dataStr).slice(0, 10);
}

/* Link único → primeiro .value, ou '' */
function valorLinkUnico(arr) {
  if (arr && arr.length > 0 && arr[0].value) return arr[0].value;
  return '';
}

/* Link múltiplo → values juntos por ', ', ou '' */
function valoresLink(arr) {
  if (!arr || arr.length === 0) return '';
  var vals = [];
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].value) vals.push(arr[i].value);
  }
  return vals.join(', ');
}

/* Descrição (markdown) → HTML sanitizado, exibido como prévia de 3 linhas.
   Se as libs não estiverem disponíveis, cai para texto escapado. */
function renderDescricao(texto) {
  if (!texto) return '<span class="oficios-desc-vazio">—</span>';
  var html;
  if (window.marked && window.DOMPurify) {
    html = DOMPurify.sanitize(marked.parse(String(texto)));
  } else {
    html = esc(texto);
  }
  return '<div class="oficios-desc-md">' + html + '</div>';
}

/* ---------- CARGA POR ANO ---------- */

function buscarAno(tableId, campoData, ano, callback) {
  var resultados = [];
  var baseUrl = API_BASE + '/database/rows/table/' + tableId + '/' +
    '?user_field_names=false' +
    '&filter__' + campoData + '__date_after_or_equal=' + encodeURIComponent(ano + '-01-01') +
    '&filter__' + campoData + '__date_before_or_equal=' + encodeURIComponent(ano + '-12-31') +
    '&order_by=-' + campoData +
    '&size=' + PAGE_SIZE;

  function carregarPagina(pagina) {
    fetch(baseUrl + '&page=' + pagina, { headers: apiHeaders() })
      .then(function(r) {
        if (!r.ok) throw new Error('Erro na consulta');
        return r.json();
      })
      .then(function(data) {
        var linhas = data.results || [];
        var i;
        for (i = 0; i < linhas.length; i++) {
          resultados.push(linhas[i]);
        }
        if (data.next) {
          carregarPagina(pagina + 1);
        } else {
          callback(resultados);
        }
      })
      .catch(function() {
        callback(resultados);
      });
  }

  carregarPagina(1);
}

/* ---------- RECEBIDOS ---------- */

function carregarRecebidos() {
  var ano = document.getElementById('anoRecebidos').value;
  mostrarOverlay();
  buscarAno(TABLE_RECEBIDOS, F_REC.dataEntrada, ano, function(linhas) {
    linhas.sort(function(a, b) {
      var ka = chaveData(a[F_REC.dataEntrada]);
      var kb = chaveData(b[F_REC.dataEntrada]);
      if (ka < kb) return 1;
      if (ka > kb) return -1;
      return 0;
    });
    dadosRecebidos = linhas;
    carregadoRecebidos = true;
    esconderOverlay();
    renderRecebidos();
  });
}

function filtrarRecebidos() {
  var termo = (document.getElementById('buscaRecebidos').value || '').toLowerCase();
  var status = document.getElementById('statusRecebidos').value;
  var saida = [];
  var i;
  for (i = 0; i < dadosRecebidos.length; i++) {
    var row = dadosRecebidos[i];
    var cumprido = !!row[F_REC.dataCumprimento];

    if (status === 'cumprido' && !cumprido) continue;
    if (status === 'pendente' && cumprido) continue;

    if (termo) {
      var numero = String(row[F_REC.numero] || '').toLowerCase();
      var remetente = valorLinkUnico(row[F_REC.remetente]).toLowerCase();
      if (numero.indexOf(termo) === -1 && remetente.indexOf(termo) === -1) continue;
    }
    saida.push(row);
  }
  return saida;
}

function renderRecebidos() {
  var container = document.getElementById('tabelaRecebidos');
  var linhas = filtrarRecebidos();

  if (linhas.length === 0) {
    container.innerHTML = estadoVazio();
    return;
  }

  var html = '<div class="oficios-table-wrapper"><table class="oficios-table">';
  html += '<thead><tr>';
  html += '<th>Nº</th><th>Data de entrada</th><th>Remetente</th>';
  html += '<th>Descrição</th><th>Cliente(s)</th><th>Status</th><th>Resposta</th>';
  html += '</tr></thead><tbody>';

  var i;
  for (i = 0; i < linhas.length; i++) {
    var row = linhas[i];
    var numero = esc(row[F_REC.numero] || '—');
    var letra = esc(row[F_REC.letra] || '');
    var numLabel = letra ? numero + '/' + letra : numero;

    var remetente = valorLinkUnico(row[F_REC.remetente]);
    var clientes = valoresLink(row[F_REC.cliente]);
    var cumprido = !!row[F_REC.dataCumprimento];

    html += '<tr class="oficios-row" data-row-id="' + row.id + '">';
    html += '<td class="oficios-num">' + numLabel + '</td>';
    html += '<td>' + formatarData(row[F_REC.dataEntrada]) + '</td>';
    html += '<td>' + (remetente ? esc(remetente) : '—') + '</td>';
    html += '<td class="oficios-desc">' + renderDescricao(row[F_REC.descricao]) + '</td>';
    html += '<td>' + (clientes ? esc(clientes) : '—') + '</td>';
    if (cumprido) {
      html += '<td><span class="oficios-badge oficios-badge--cumprido">Cumprido</span></td>';
    } else {
      html += '<td><span class="oficios-badge oficios-badge--pendente">Pendente</span></td>';
    }
    html += '<td>' + colunaResposta(row[F_REC.resposta]) + '</td>';
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  container.innerHTML = html;
  ligarCliqueLinhas(container, 'recebido');
}

/* ---------- ENVIADOS ---------- */

function carregarEnviados() {
  var ano = document.getElementById('anoEnviados').value;
  mostrarOverlay();
  buscarAno(TABLE_ENVIADOS, F_ENV.dataEnvio, ano, function(linhas) {
    linhas.sort(function(a, b) {
      var ka = chaveData(a[F_ENV.dataEnvio]);
      var kb = chaveData(b[F_ENV.dataEnvio]);
      if (ka < kb) return 1;
      if (ka > kb) return -1;
      return 0;
    });
    dadosEnviados = linhas;
    carregadoEnviados = true;
    esconderOverlay();
    renderEnviados();
  });
}

function filtrarEnviados() {
  var termo = (document.getElementById('buscaEnviados').value || '').toLowerCase();
  var saida = [];
  var i;
  for (i = 0; i < dadosEnviados.length; i++) {
    var row = dadosEnviados[i];
    if (termo) {
      var numero = String(row[F_ENV.numero] || '').toLowerCase();
      var destinatario = valorLinkUnico(row[F_ENV.destinatario]).toLowerCase();
      if (numero.indexOf(termo) === -1 && destinatario.indexOf(termo) === -1) continue;
    }
    saida.push(row);
  }
  return saida;
}

function renderEnviados() {
  var container = document.getElementById('tabelaEnviados');
  var linhas = filtrarEnviados();

  if (linhas.length === 0) {
    container.innerHTML = estadoVazio();
    return;
  }

  var html = '<div class="oficios-table-wrapper"><table class="oficios-table">';
  html += '<thead><tr>';
  html += '<th>Nº</th><th>Data de envio</th><th>Destinatário</th>';
  html += '<th>Descrição</th><th>Cliente(s)</th><th>Resposta</th>';
  html += '</tr></thead><tbody>';

  var i;
  for (i = 0; i < linhas.length; i++) {
    var row = linhas[i];
    var numero = esc(row[F_ENV.numero] || '—');
    var letra = esc(row[F_ENV.letra] || '');
    var numLabel = letra ? numero + '/' + letra : numero;

    var destinatario = valorLinkUnico(row[F_ENV.destinatario]);
    var clientes = valoresLink(row[F_ENV.cliente]);

    html += '<tr class="oficios-row" data-row-id="' + row.id + '">';
    html += '<td class="oficios-num">' + numLabel + '</td>';
    html += '<td>' + formatarData(row[F_ENV.dataEnvio]) + '</td>';
    html += '<td>' + (destinatario ? esc(destinatario) : '—') + '</td>';
    html += '<td class="oficios-desc">' + renderDescricao(row[F_ENV.descricao]) + '</td>';
    html += '<td>' + (clientes ? esc(clientes) : '—') + '</td>';
    html += '<td>' + colunaResposta(row[F_ENV.resposta]) + '</td>';
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  container.innerHTML = html;
  ligarCliqueLinhas(container, 'enviado');
}

/* ---------- COMUNS ---------- */

/* Torna as linhas da tabela clicáveis → navega para o detalhe do ofício */
function ligarCliqueLinhas(container, tipo) {
  var linhas = container.querySelectorAll('.oficios-row');
  var i;
  for (i = 0; i < linhas.length; i++) {
    linhas[i].addEventListener('click', function() {
      var id = this.getAttribute('data-row-id');
      if (id) window.location.href = '/oficios/' + tipo + '/' + id;
    });
  }
}

function colunaResposta(arr) {
  var valor = valorLinkUnico(arr);
  if (!valor) return '<span class="oficios-muted">—</span>';
  var titulo = 'Ofício vinculado: ' + valor;
  return '<i class="ph ph-link oficios-resposta-ok" title="' + esc(titulo) + '"></i>';
}

function estadoVazio() {
  return '<div class="oficios-vazio"><i class="ph ph-tray"></i>' +
    'Nenhum ofício encontrado para os filtros.</div>';
}

/* ---------- ABAS ---------- */

function ativarAba(nomeAba) {
  var botoes = document.querySelectorAll('.tab-btn');
  var paineis = document.querySelectorAll('.tab-content');
  var i;
  for (i = 0; i < botoes.length; i++) {
    botoes[i].classList.remove('active');
  }
  for (i = 0; i < paineis.length; i++) {
    paineis[i].classList.remove('active');
  }
  var botao = document.querySelector('[data-tab="' + nomeAba + '"]');
  var painel = document.getElementById('tab-' + nomeAba);
  if (botao) botao.classList.add('active');
  if (painel) painel.classList.add('active');

  if (nomeAba === 'recebidos' && !carregadoRecebidos) {
    carregarRecebidos();
  } else if (nomeAba === 'enviados' && !carregadoEnviados) {
    carregarEnviados();
  }
}

/* ---------- INIT ---------- */

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

document.addEventListener('DOMContentLoaded', function() {
  popularAnos('anoRecebidos');
  popularAnos('anoEnviados');

  document.getElementById('anoRecebidos').addEventListener('change', carregarRecebidos);
  document.getElementById('statusRecebidos').addEventListener('change', renderRecebidos);
  document.getElementById('buscaRecebidos').addEventListener('input', renderRecebidos);

  document.getElementById('anoEnviados').addEventListener('change', carregarEnviados);
  document.getElementById('buscaEnviados').addEventListener('input', renderEnviados);

  var overlayEl = document.querySelector('.sidebar-overlay');
  if (overlayEl) {
    overlayEl.addEventListener('click', toggleSidebar);
  }

  carregarRecebidos();
});
