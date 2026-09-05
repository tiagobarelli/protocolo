/* index.js — Dashboard: carregar protocolos e filtros (ES5) */

var API_BASE = '/api/baserow';
var CONFIG = {
  tables: { protocolo: 755, andamentos: 778 },
  fields: {
    protocolo: 'field_7240',
    interessado: 'field_7241',
    servico: 'field_7242',
    responsavel: 'field_7249',
    dataEntrada: 'field_7250',
    status: 'field_7252',
    advogado: 'field_7254',
    agendadoPara: 'field_7268',
    andIsTarefa:  'field_7460',
    andConcluido: 'field_7461',
    andCriadoPor: 'field_7464',
    andProtocolo: 'field_7457'
  }
};

var colaboradores = [];
var statusOpcoes = {}; // mapa texto → id (ex: {"Em andamento": 123})
var paginaAtual = 1;
var totalRegistros = 0;
var CARDS_POR_PAGINA = 20;
var statusAtual = 'Em andamento';          // texto; convertido em id via statusOpcoes na query
var ordemAtual = 'recentes';               // 'recentes' | 'antigos'
var viewAtual = 'grid';                    // 'grid' | 'list'
var ultimosProtocolos = [];                // cache da pagina atual para re-render ao trocar view
var ultimosContadores = {};
var STORAGE_PREFIX = 'thoth_painel_';

function chaveStorage(nome) {
  var uid = (window.CURRENT_USER && window.CURRENT_USER.id) ? String(window.CURRENT_USER.id) : 'anon';
  return STORAGE_PREFIX + nome + '_' + uid;
}
function lerPreferencia(nome, padrao) {
  try { var v = window.localStorage.getItem(chaveStorage(nome)); return v || padrao; } catch (e) { return padrao; }
}
function gravarPreferencia(nome, valor) {
  try { window.localStorage.setItem(chaveStorage(nome), valor); } catch (e) { /* silencioso */ }
}

/* ---------- QUERY STRING (status/resp compartilhaveis) ---------- */

var STATUS_SLUGS = { andamento: 'Em andamento', finalizado: 'Finalizado', cancelado: 'Cancelado', todos: '' };

function slugDoStatus(texto) {
  for (var k in STATUS_SLUGS) {
    if (Object.prototype.hasOwnProperty.call(STATUS_SLUGS, k) && STATUS_SLUGS[k] === texto) return k;
  }
  return 'andamento';
}

function lerQueryString() {
  var out = {};
  var q = window.location.search || '';
  if (q.charAt(0) === '?') q = q.substring(1);
  if (!q) return out;
  var partes = q.split('&');
  for (var i = 0; i < partes.length; i++) {
    if (!partes[i]) continue;
    var par = partes[i].split('=');
    try {
      var chave = decodeURIComponent(par[0].replace(/\+/g, ' '));
      var valor = par.length > 1 ? decodeURIComponent(par.slice(1).join('=').replace(/\+/g, ' ')) : '';
      out[chave] = valor;
    } catch (e) {
      // par malformado (ex.: % solto): ignora sem derrubar o init
    }
  }
  return out;
}

var respDaUrl = null; // null = sem parametro; '' = todos; 'NN' = id do colaborador

function atualizarUrl() {
  if (!window.history || !window.history.replaceState) return;
  var respVal = document.getElementById('filtroResponsavel').value;
  var qs = '?status=' + slugDoStatus(statusAtual) + '&resp=' + (respVal ? encodeURIComponent(respVal) : 'todos');
  window.history.replaceState(null, '', window.location.pathname + qs);
}

function apiHeaders() {
  return { 'Content-Type': 'application/json' };
}

/* ---------- METADADOS DOS CAMPOS ---------- */

function carregarMetadados() {
  var url = API_BASE + '/database/fields/table/' + CONFIG.tables.protocolo + '/';
  fetch(url, { headers: apiHeaders() })
    .then(function(resp) { return resp.json(); })
    .then(function(fields) {
      var fieldResp = null;
      var fieldStatus = null;
      for (var i = 0; i < fields.length; i++) {
        if (fields[i].id === 7249 || fields[i].name === 'Responsável') {
          fieldResp = fields[i];
        }
        if (fields[i].id === 7252 || fields[i].name === 'Status Atual') {
          fieldStatus = fields[i];
        }
      }
      if (fieldResp && fieldResp.select_options) {
        colaboradores = fieldResp.select_options;
      } else if (fieldResp && fieldResp.available_collaborators) {
        colaboradores = fieldResp.available_collaborators;
      }
      popularFiltroResponsavel();

      if (fieldStatus && fieldStatus.select_options) {
        for (var j = 0; j < fieldStatus.select_options.length; j++) {
          var opt = fieldStatus.select_options[j];
          statusOpcoes[opt.value] = opt.id;
        }
      }
      carregarProtocolos(1);
    })
    .catch(function(err) {
      console.error('Erro ao carregar metadados:', err);
      carregarProtocolos(1);
    });
}

function popularFiltroResponsavel() {
  var select = document.getElementById('filtroResponsavel');
  for (var i = 0; i < colaboradores.length; i++) {
    var colab = colaboradores[i];
    var opt = document.createElement('option');
    opt.value = colab.id || '';
    opt.textContent = colab.name || colab.value || '';
    select.appendChild(opt);
  }

  // Parametro resp da URL prevalece sobre a pre-selecao do usuario logado
  if (respDaUrl !== null) {
    var selUrl = document.getElementById('filtroResponsavel');
    if (respDaUrl === '') { selUrl.value = ''; return; }
    for (var u = 0; u < selUrl.options.length; u++) {
      if (selUrl.options[u].value === respDaUrl) { selUrl.value = respDaUrl; return; }
    }
    // id desconhecido: cai na pre-selecao padrao abaixo
  }

  // Pré-selecionar o usuário logado como responsável
  if (window.CURRENT_USER && window.CURRENT_USER.nome) {
    var nomeUsuario = window.CURRENT_USER.nome;
    var selectResp = document.getElementById('filtroResponsavel');
    var opcoes = selectResp.options;
    var encontrou = false;
    for (var k = 0; k < opcoes.length; k++) {
      if (opcoes[k].text === nomeUsuario) {
        selectResp.value = opcoes[k].value;
        encontrou = true;
        break;
      }
    }
  }
}

/* ---------- PROTOCOLOS ---------- */

function carregarProtocolos(pagina) {
  if (!pagina) pagina = 1;
  paginaAtual = pagina;

  var grid = document.getElementById('protocolGrid');
  var loading = document.getElementById('loadingState');
  var empty = document.getElementById('emptyState');

  grid.innerHTML = '';
  document.getElementById('protocolListBody').innerHTML = '';
  loading.style.display = 'block';
  empty.style.display = 'none';

  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.protocolo +
    '/?user_field_names=false' +
    '&size=' + CARDS_POR_PAGINA +
    '&page=' + pagina +
    '&order_by=' + (ordemAtual === 'antigos' ? '' : '-') + CONFIG.fields.dataEntrada +
    ',' + (ordemAtual === 'antigos' ? '' : '-') + CONFIG.fields.protocolo;

  var statusFiltro = statusAtual ? String(statusOpcoes[statusAtual] || statusAtual) : '';
  var respFiltro = document.getElementById('filtroResponsavel').value;

  if (statusFiltro) {
    url += '&filter__' + CONFIG.fields.status + '__single_select_equal=' + encodeURIComponent(statusFiltro);
  }
  if (respFiltro) {
    url += '&filter__' + CONFIG.fields.responsavel + '__multiple_collaborators_has=' + encodeURIComponent(respFiltro);
  }

  fetch(url, { headers: apiHeaders() })
    .then(function(resp) { return resp.json(); })
    .then(function(data) {
      totalRegistros = data.count || 0;
      loading.style.display = 'none';
      var protocolos = data.results || [];
      renderizarPaginacao();
      atualizarSumario(protocolos.length, totalRegistros);

      // Protocolos → tarefas → render com badge (degradação graciosa)
      carregarContadorTarefas()
        .then(function(mapa) {
          ultimosProtocolos = protocolos;
          ultimosContadores = mapa;
          renderizarCards(protocolos, mapa);
        })
        .catch(function(err) {
          console.error('Erro ao carregar contador de tarefas:', err);
          ultimosProtocolos = protocolos;
          ultimosContadores = {};
          renderizarCards(protocolos, {});
        });
    })
    .catch(function(err) {
      console.error('Erro ao carregar protocolos:', err);
      loading.style.display = 'none';
      document.getElementById('protocolList').style.display = 'none';
      grid.style.display = 'grid';
      grid.innerHTML = '<div class="empty-state"><i class="ph ph-warning"></i>Erro ao carregar protocolos.</div>';
    });
}

function aplicarFiltros() {
  paginaAtual = 1;
  carregarProtocolos(1);
}

/* ---------- CONTADOR DE TAREFAS ABERTAS ---------- */

function carregarContadorTarefas() {
  var mapa = {};
  var perfilMaster = (window.CURRENT_USER && window.CURRENT_USER.perfil === 'master');
  var nome = (window.CURRENT_USER && window.CURRENT_USER.nome) ? window.CURRENT_USER.nome : '';

  var baseUrl = API_BASE + '/database/rows/table/' + CONFIG.tables.andamentos +
    '/?user_field_names=false' +
    '&size=200' +
    '&filter__' + CONFIG.fields.andIsTarefa + '__boolean=true' +
    '&filter__' + CONFIG.fields.andConcluido + '__boolean=false';

  if (!perfilMaster && nome) {
    baseUrl += '&filter__' + CONFIG.fields.andCriadoPor + '__equal=' + encodeURIComponent(nome);
  }

  function buscarPagina(pagina) {
    var url = baseUrl + '&page=' + pagina;
    return fetch(url, { headers: apiHeaders() })
      .then(function(resp) {
        if (!resp.ok) throw new Error('Erro ao carregar tarefas');
        return resp.json();
      })
      .then(function(data) {
        var results = data.results || [];
        for (var i = 0; i < results.length; i++) {
          var protoArr = results[i][CONFIG.fields.andProtocolo] || [];
          if (protoArr.length > 0) {
            var pid = protoArr[0].id;
            mapa[pid] = (mapa[pid] || 0) + 1;
          }
        }
        var totalCount = data.count || 0;
        if (pagina * 200 < totalCount) {
          return buscarPagina(pagina + 1);
        }
        return mapa;
      });
  }

  return buscarPagina(1);
}

/* ---------- EXTRACAO DE DADOS (compartilhada por grade e lista) ---------- */

var ICONES_SERVICO = [
  { chave: 'certid\u00e3o notarial', icone: 'ph-seal-check' },
  { chave: 'nomea\u00e7\u00e3o',      icone: 'ph-user-check' },
  { chave: 'invent\u00e1rio',         icone: 'ph-scroll' },
  { chave: 'doa\u00e7\u00e3o',        icone: 'ph-hand-heart' },
  { chave: 'retifica',                icone: 'ph-note-pencil' },
  { chave: 'permuta',                 icone: 'ph-swap' },
  { chave: 'ata notarial',            icone: 'ph-file-text' },
  { chave: 'procura\u00e7\u00e3o',    icone: 'ph-signature' }
];

// Ordem de precedencia intencional: "Nomeacao Inventariante" casa 'nomeacao' antes de 'inventario'.
function iconeServico(nome) {
  var n = (nome || '').toLowerCase();
  for (var i = 0; i < ICONES_SERVICO.length; i++) {
    if (n.indexOf(ICONES_SERVICO[i].chave) !== -1) return ICONES_SERVICO[i].icone;
  }
  return 'ph-file-text';
}

function classificarFaixa(dias) {
  var d1 = (window.ALERTA_CONFIG && window.ALERTA_CONFIG.dias1) || 10;
  var d2 = (window.ALERTA_CONFIG && window.ALERTA_CONFIG.dias2) || 20;
  if (dias > d2) return 'atrasado';
  if (dias > d1) return 'atencao';
  return 'ok';
}

function iniciaisNome(nome) {
  if (!nome || nome === '\u2014') return '';
  var partes = nome.trim().split(/\s+/);
  var a = partes[0].charAt(0);
  var b = partes.length > 1 ? partes[partes.length - 1].charAt(0) : '';
  return (a + b).toUpperCase();
}

function extrairDadosCard(p, contadorTarefas) {
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

  var dias = null, faixa = '', diasLabel = '', barPct = 0;
  if (statusTexto === 'Em andamento' && dataEntrada) {
    dias = calcularDiasAberto(dataEntrada);
    faixa = classificarFaixa(dias);
    diasLabel = dias === 0 ? 'hoje' : (dias === 1 ? '1 dia' : dias + ' dias');
    barPct = Math.min(100, Math.round((dias / 180) * 100));
  }
  return {
    id: p.id,
    numero: numero, statusTexto: statusTexto, statusClasse: statusClasse,
    interessado: interessado, advogado: advogado, servico: servico,
    servicoIcone: iconeServico(servico),
    certidao: !!(servico && servico.toLowerCase().indexOf('certid\u00e3o notarial') !== -1),
    responsavel: responsavel, iniciais: iniciaisNome(responsavel),
    agendado: agendado, tarefas: contadorTarefas || 0,
    dias: dias, faixa: faixa, diasLabel: diasLabel, barPct: barPct
  };
}

/* Bloco de prazo / agenda / tarefas, compartilhado pelos dois renderizadores */
function htmlPrazoPill(d) {
  if (!d.diasLabel) return '';
  return '<span class="prazo-pill prazo-' + d.faixa + '"><i class="ph ph-clock"></i> ' + d.diasLabel + '</span>';
}
function htmlExtrasCard(d) {
  var h = '';
  if (d.agendado) h += '<span class="card-agendado"><i class="ph ph-calendar-blank"></i> ' + formatarData(d.agendado) + '</span>';
  if (d.tarefas >= 1) h += '<span class="card-tarefas-badge"><i class="ph ph-list-checks"></i> ' + d.tarefas + '</span>';
  return h;
}

/* ---------- RENDERIZADORES (grade e lista) ---------- */

function construirCard(p, contadorTarefas) {
  var d = extrairDadosCard(p, contadorTarefas);
  var cls = 'protocol-card' + (d.certidao ? ' card-certidao' : '');
  var h = '<a href="/protocolo/' + d.id + '" class="' + cls + '">';
  h += '<div class="card-header"><span class="proto-number">N\u00ba ' + escapeHtml(d.numero) + '</span>' + htmlPrazoPill(d) + '</div>';
  h += '<div class="card-body">';
  h += '<div class="card-interessado">' + escapeHtml(d.interessado) + '</div>';
  if (d.advogado) h += '<div class="card-advogado"><i class="ph ph-gavel"></i> ' + escapeHtml(d.advogado) + '</div>';
  h += '<div class="card-field-servico"><i class="ph ' + d.servicoIcone + '"></i> <span class="card-servico-nome">' + escapeHtml(d.servico) + '</span></div>';
  h += '</div>';
  h += '<div class="card-footer">';
  h += '<span class="card-resp"><span class="card-avatar">' + escapeHtml(d.iniciais) + '</span>' + escapeHtml(d.responsavel) + '</span>';
  h += '<span class="card-footer-dir">' + htmlExtrasCard(d);
  h += '<span class="status-badge ' + d.statusClasse + '">' + escapeHtml(d.statusTexto) + '</span></span>';
  h += '</div>';
  if (d.faixa) h += '<div class="card-aging"><div class="card-aging-fill prazo-' + d.faixa + '" style="width:' + d.barPct + '%"></div></div>';
  h += '</a>';
  return h;
}

function construirLinhaLista(p, contadorTarefas) {
  var d = extrairDadosCard(p, contadorTarefas);
  var h = '<a href="/protocolo/' + d.id + '" class="protocol-row' + (d.certidao ? ' row-certidao' : '') + '">';
  h += '<span class="row-num">' + escapeHtml(d.numero) + '</span>';
  h += '<span class="row-interessado">' + escapeHtml(d.interessado) + '</span>';
  h += '<span class="row-servico"><i class="ph ' + d.servicoIcone + '"></i> ' + escapeHtml(d.servico) + '</span>';
  h += '<span class="row-resp">' + escapeHtml(d.responsavel) + '</span>';
  h += '<span class="row-prazo">' + htmlPrazoPill(d) + htmlExtrasCard(d) + '</span>';
  h += '<span class="status-badge ' + d.statusClasse + '">' + escapeHtml(d.statusTexto) + '</span>';
  h += '</a>';
  return h;
}

function renderizarCards(protocolos, contadores) {
  var grid = document.getElementById('protocolGrid');
  var lista = document.getElementById('protocolList');
  var listaBody = document.getElementById('protocolListBody');
  var empty = document.getElementById('emptyState');
  if (!contadores) contadores = {};

  grid.innerHTML = '';
  listaBody.innerHTML = '';
  if (protocolos.length === 0) {
    grid.style.display = 'none';
    lista.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  var html = '';
  for (var i = 0; i < protocolos.length; i++) {
    var p = protocolos[i];
    html += (viewAtual === 'list') ? construirLinhaLista(p, contadores[p.id] || 0) : construirCard(p, contadores[p.id] || 0);
  }
  if (viewAtual === 'list') {
    listaBody.innerHTML = html;
    grid.style.display = 'none';
    lista.style.display = 'block';
  } else {
    grid.innerHTML = html;
    lista.style.display = 'none';
    grid.style.display = 'grid';
  }
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
  if (dataStr.indexOf('T') !== -1) dataStr = dataStr.split('T')[0];
  var partes = dataStr.split('-');
  if (partes.length !== 3) return dataStr;
  return partes[2] + '/' + partes[1] + '/' + partes[0];
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---------- PAGINAÇÃO ---------- */

function renderizarPaginacao() {
  var totalPaginas = Math.ceil(totalRegistros / CARDS_POR_PAGINA);
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
      carregarProtocolos(paginaAtual);
      scrollTopoResultados();
    }
  });

  btnProxima.addEventListener('click', function() {
    if (paginaAtual < totalPaginas) {
      paginaAtual++;
      carregarProtocolos(paginaAtual);
      scrollTopoResultados();
    }
  });
}

function scrollTopoResultados() {
  var alvo = document.getElementById(viewAtual === 'list' ? 'protocolList' : 'protocolGrid');
  if (alvo) alvo.scrollIntoView({ behavior: 'smooth' });
}

/* ---------- SAUDACAO E SUBTITULO ---------- */

function atualizarSaudacao() {
  var el = document.getElementById('painelSaudacao');
  if (!el) return;
  var h = new Date().getHours();
  var prefixo = h < 12 ? 'Bom dia' : (h < 18 ? 'Boa tarde' : 'Boa noite');
  var nome = (window.CURRENT_USER && window.CURRENT_USER.nome) ? window.CURRENT_USER.nome : '';
  var primeiro = nome ? nome.split(' ')[0] : '';
  el.textContent = primeiro ? prefixo + ', ' + primeiro : prefixo;
}

function dataHojeExtenso() {
  var d = new Date();
  var txt = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function atualizarSumario(naPagina, total) {
  var el = document.getElementById('painelSubtitulo');
  if (!el) return;
  var resumo;
  if (total === 0) resumo = 'nenhum protocolo encontrado';
  else if (total === 1) resumo = 'exibindo 1 protocolo';
  else resumo = 'exibindo ' + naPagina + ' de ' + total + ' protocolos';
  el.textContent = dataHojeExtenso() + ' \u00b7 ' + resumo;
}

/* ---------- HAMBURGER (fallback mobile) ---------- */

function toggleSidebar() {
  var sidebar = document.querySelector('.sidebar');
  var overlay = document.querySelector('.sidebar-overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
}

/* ---------- CONTROLES (segmentado, ordem, view) ---------- */

function definirStatus(texto, btn) {
  statusAtual = texto;
  var btns = document.querySelectorAll('#filtroStatus .painel-seg-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
  btn.classList.add('active');
  atualizarUrl();
  aplicarFiltros();
}

function alternarOrdem() {
  ordemAtual = (ordemAtual === 'recentes') ? 'antigos' : 'recentes';
  gravarPreferencia('ordem', ordemAtual);
  atualizarLabelOrdem();
  aplicarFiltros();
}
function atualizarLabelOrdem() {
  var el = document.getElementById('btnOrdemLabel');
  if (el) el.textContent = (ordemAtual === 'antigos') ? 'Mais antigos' : 'Mais recentes';
}

function atualizarBotoesView() {
  var bg = document.getElementById('btnViewGrid');
  var bl = document.getElementById('btnViewList');
  if (bg) bg.classList.toggle('active', viewAtual === 'grid');
  if (bl) bl.classList.toggle('active', viewAtual === 'list');
}
function definirView(v) {
  viewAtual = (v === 'list') ? 'list' : 'grid';
  gravarPreferencia('view', viewAtual);
  atualizarBotoesView();
  renderizarCards(ultimosProtocolos, ultimosContadores); // re-render sem novo fetch
}

/* ---------- INIT ---------- */

document.addEventListener('DOMContentLoaded', function() {
  ordemAtual = (lerPreferencia('ordem', 'recentes') === 'antigos') ? 'antigos' : 'recentes';
  viewAtual = (lerPreferencia('view', 'grid') === 'list') ? 'list' : 'grid';

  // Filtros vindos da URL (links compartilhaveis): status e resp prevalecem
  var params = lerQueryString();
  if (params.status && Object.prototype.hasOwnProperty.call(STATUS_SLUGS, params.status)) {
    statusAtual = STATUS_SLUGS[params.status];
    var segs = document.querySelectorAll('#filtroStatus .painel-seg-btn');
    for (var s = 0; s < segs.length; s++) {
      segs[s].classList.toggle('active', (segs[s].getAttribute('data-status') || '') === statusAtual);
    }
  }
  if (Object.prototype.hasOwnProperty.call(params, 'resp')) {
    respDaUrl = (params.resp === 'todos') ? '' : params.resp;
  }

  atualizarSaudacao();
  atualizarLabelOrdem();
  atualizarBotoesView(); // so ajusta os botoes; o primeiro render vem de carregarProtocolos

  carregarMetadados();

  var segBtns = document.querySelectorAll('#filtroStatus .painel-seg-btn');
  for (var i = 0; i < segBtns.length; i++) {
    (function(b) {
      b.addEventListener('click', function() { definirStatus(b.getAttribute('data-status') || '', b); });
    })(segBtns[i]);
  }
  document.getElementById('filtroResponsavel').addEventListener('change', function() {
    atualizarUrl();
    aplicarFiltros();
  });
  document.getElementById('btnOrdem').addEventListener('click', alternarOrdem);
  document.getElementById('btnViewGrid').addEventListener('click', function() { definirView('grid'); });
  document.getElementById('btnViewList').addEventListener('click', function() { definirView('list'); });

  var overlay = document.querySelector('.sidebar-overlay');
  if (overlay) overlay.addEventListener('click', toggleSidebar);
});
