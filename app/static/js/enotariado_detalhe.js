'use strict';

// enotariado_detalhe.js - Detalhe/edicao de lancamento do modulo e-Notariado Financeiro (tabela 788). ES5 estrito.
// Leva 2: catalogo de especies, sugestao do bruto, autocomplete de solicitantes (chips canonicos),
// carga por id, validacao, log de alteracoes e gravacao (POST/PATCH). Exclusao logica chega na Leva 3.
// Convencao do arquivo: proibido em-dash (caractere ou escape); separadores usam '-' ou '·'.

var API_BASE = '/api/baserow';
var TABLE_LANCAMENTOS = 788;
var TABLE_ESPECIES = 787;
var TABLE_CLIENTES = 754;

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
  valorLiquido: 'field_7579',   /* formula read-only: nunca entra em payload */
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

/* Field IDs - Clientes (754) */
var F_CLI = {
  nome: 'field_7237',
  cpf: 'field_7238',
  cnpj: 'field_7239'
};

/* Rotulos para o log de alteracoes (a ordem define a ordem das linhas geradas) */
var FIELD_LABELS = {
  numeroPedido: 'Número do pedido',
  especie: 'Espécie',
  quantidade: 'Quantidade',
  dataRealizacao: 'Data de realização',
  solicitantes: 'Solicitantes',
  dataLancamento: 'Data de lançamento',
  guiaSemanal: 'Guia semanal',
  valorBruto: 'Valor bruto',
  taxasCobranca: 'Taxas de cobrança',
  taxaCnb: 'Taxa do CNB',
  observacoes: 'Observações'
};

/* Estado */
var modoNovo = (window.LANCAMENTO_ID === null);
var lancamentoAtual = null;
var solicitantesSelecionados = [];   /* [{id, nome}] */
var especies = [];                   /* catalogo da 787 (todas; o select lista so as ativas) */
var snapshot = null;                 /* estado comparavel apos carregar/salvar */
var sugestaoBrutoAnterior = null;    /* ultima sugestao aplicada ao bruto */
var buscaTimer = null;               /* debounce do autocomplete */

/* ========================= HELPERS ========================= */

function byId(id) {
  return document.getElementById(id);
}

function apiHeaders() {
  return { 'Content-Type': 'application/json' };
}

function esc(str) {
  if (str === null || str === undefined) return '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

function mostrarOverlay() {
  var el = byId('overlay');
  if (el) el.classList.add('active');
}

function esconderOverlay() {
  var el = byId('overlay');
  if (el) el.classList.remove('active');
}

function mostrarMsg(id, tipo, texto) {
  var el = byId(id);
  if (!el) return;
  var icone = '';
  if (tipo === 'success') icone = '<i class="ph ph-check-circle"></i> ';
  else if (tipo === 'warning') icone = '<i class="ph ph-warning"></i> ';
  else if (tipo === 'error') icone = '<i class="ph ph-x-circle"></i> ';
  else if (tipo === 'info') icone = '<i class="ph ph-info"></i> ';
  el.className = 'msg-box ' + tipo;
  el.innerHTML = icone + texto;
  el.style.display = 'flex';
}

function esconderMsg(id) {
  var el = byId(id);
  if (!el) return;
  el.style.display = 'none';
  el.innerHTML = '';
}

/* Parte YYYY-MM-DD de uma data ISO */
function isoData(dataStr) {
  if (!dataStr) return '';
  return String(dataStr).slice(0, 10);
}

/* Data ISO (YYYY-MM-DD...) para DD/MM/AAAA por fatiamento (sem new Date) */
function formatarData(dataStr) {
  if (!dataStr) return '-';
  var iso = String(dataStr).slice(0, 10);
  var partes = iso.split('-');
  if (partes.length !== 3) return esc(dataStr);
  return partes[2] + '/' + partes[1] + '/' + partes[0];
}

/* Texto de input numerico para Number; aceita virgula decimal; vazio/invalido vira null */
function paraNumero(str) {
  if (str === null || str === undefined) return null;
  var s = String(str).trim().replace(',', '.');
  if (s === '') return null;
  var n = parseFloat(s);
  if (isNaN(n)) return null;
  return n;
}

/* Number (ou string do Baserow) para '123,45'; nulo/invalido vira '-' */
function formatarMoeda(valor) {
  var n = parseFloat(valor);
  if (isNaN(n)) return '-';
  return n.toFixed(2).replace('.', ',');
}

/* Inteiro >= 1 a partir do texto de um input (aceita '02'; rejeita '2.5', vazio e NaN) */
function ehInteiroPositivo(str) {
  var s = String(str === null || str === undefined ? '' : str).trim();
  if (s === '') return false;
  var n = Number(s);
  return !isNaN(n) && Math.floor(n) === n && n >= 1;
}

function nomeUsuario() {
  return (window.CURRENT_USER && window.CURRENT_USER.nome) ? window.CURRENT_USER.nome : 'Usuário';
}

function podeExcluir() {
  return !!(window.CURRENT_USER && window.CURRENT_USER.perfil === 'master');
}

/* Rotulo (field_7566): '{pedido} · {especie} · dd/mm/aaaa' */
function montarRotulo(numeroPedido, nomeEspecie, dataIso) {
  return numeroPedido + ' · ' + nomeEspecie + ' · ' + formatarData(dataIso);
}

/* ========================= VALORES ========================= */

/* Liquido = bruto - taxas de cobranca - taxa do CNB (campo vazio conta como 0) */
function calcularLiquido() {
  var bruto = paraNumero(byId('valorBrutoInput').value);
  var taxas = paraNumero(byId('taxasCobrancaInput').value);
  var cnb = paraNumero(byId('taxaCnbInput').value);
  if (bruto === null) bruto = 0;
  if (taxas === null) taxas = 0;
  if (cnb === null) cnb = 0;
  var liquido = Math.round((bruto - taxas - cnb) * 100) / 100;
  byId('valorLiquidoInput').value = formatarMoeda(liquido);
}

/* Sugestao do bruto = quantidade x valor_unitario da especie. So preenche quando o campo
   esta vazio ou ainda igual a sugestao anterior; nunca sobrescreve valor digitado. */
function atualizarSugestaoBruto() {
  var esp = obterEspecieSelecionada();
  var vu = esp ? paraNumero(esp[F_ESP.valorUnitario]) : null;
  var q = parseInt(byId('quantidadeInput').value, 10);
  if (vu === null || isNaN(q) || q < 1) return;
  var sug = Math.round(vu * q * 100) / 100;
  var brutoInput = byId('valorBrutoInput');
  var atual = paraNumero(brutoInput.value);
  if (atual === null || (sugestaoBrutoAnterior !== null && atual === sugestaoBrutoAnterior)) {
    brutoInput.value = sug.toFixed(2);
  }
  sugestaoBrutoAnterior = sug;
  calcularLiquido();
}

/* ========================= ESPECIES (787) ========================= */

function carregarEspecies(callback) {
  var url = API_BASE + '/database/rows/table/' + TABLE_ESPECIES +
    '/?user_field_names=false&size=200&order_by=' + F_ESP.nome;
  fetch(url, { headers: apiHeaders() })
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function(data) {
      especies = data.results || [];
      var sel = byId('especieSelect');
      sel.innerHTML = '<option value="">Selecione</option>';
      var i;
      for (i = 0; i < especies.length; i++) {
        if (especies[i][F_ESP.ativo] !== true) continue;
        var opt = document.createElement('option');
        opt.value = String(especies[i].id);
        opt.textContent = especies[i][F_ESP.nome] || ('#' + especies[i].id);
        sel.appendChild(opt);
      }
      if (callback) callback();
    })
    .catch(function() {
      mostrarMsg('formMsg', 'error', 'Não foi possível carregar as espécies. Recarregue a página.');
    });
}

/* Garante a option de uma especie inativa usada por registro antigo (texto com sufixo) */
function garantirOpcaoEspecie(id, nome) {
  var sel = byId('especieSelect');
  var i;
  for (i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value === String(id)) return;
  }
  var opt = document.createElement('option');
  opt.value = String(id);
  opt.textContent = (nome || ('#' + id)) + ' (inativa)';
  sel.appendChild(opt);
}

function obterEspecieSelecionada() {
  var valor = Number(byId('especieSelect').value);
  if (!valor) return null;
  var i;
  for (i = 0; i < especies.length; i++) {
    if (especies[i].id === valor) return especies[i];
  }
  return null;
}

/* Nome da especie para o rotulo: do catalogo; fallback = texto da option sem o sufixo '(inativa)' */
function nomeEspecieSelecionada() {
  var esp = obterEspecieSelecionada();
  if (esp) return esp[F_ESP.nome] || '';
  var sel = byId('especieSelect');
  if (!sel.value || sel.selectedIndex < 0) return '';
  return sel.options[sel.selectedIndex].text.replace(' (inativa)', '');
}

/* ========================= SOLICITANTES (754: autocomplete + chips) ========================= */

function fecharListaSolicitantes() {
  var lista = byId('solicitanteAutoList');
  if (lista) lista.classList.remove('open');
}

function buscarSolicitante(termo) {
  var url = API_BASE + '/database/rows/table/' + TABLE_CLIENTES +
    '/?user_field_names=false&filter__' + F_CLI.nome + '__contains=' +
    encodeURIComponent(termo) + '&size=10';
  fetch(url, { headers: apiHeaders() })
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function(data) { mostrarAutoSolicitante(data.results || []); })
    .catch(function() { fecharListaSolicitantes(); });
}

function mostrarAutoSolicitante(resultados) {
  var lista = byId('solicitanteAutoList');
  lista.innerHTML = '';
  if (resultados.length === 0) { lista.classList.remove('open'); return; }
  var i;
  for (i = 0; i < resultados.length; i++) {
    (function(cli) {
      var nome = cli[F_CLI.nome] || '';
      var cpf = cli[F_CLI.cpf] || '';
      var cnpj = cli[F_CLI.cnpj] || '';
      var detalhe = cpf ? ('CPF: ' + cpf) : (cnpj ? ('CNPJ: ' + cnpj) : '');
      var item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.innerHTML = '<div class="ac-name">' + esc(nome) + '</div>' +
        (detalhe ? '<div class="ac-detail">' + esc(detalhe) + '</div>' : '');
      item.addEventListener('click', function() {
        adicionarSolicitante(cli.id, nome);
        byId('solicitanteBusca').value = '';
        lista.classList.remove('open');
      });
      lista.appendChild(item);
    })(resultados[i]);
  }
  lista.classList.add('open');
}

function adicionarSolicitante(id, nome) {
  var i;
  for (i = 0; i < solicitantesSelecionados.length; i++) {
    if (solicitantesSelecionados[i].id === id) return; /* sem duplicar */
  }
  solicitantesSelecionados.push({ id: id, nome: nome });
  renderChipsSolicitantes();
}

function removerSolicitante(id) {
  var novos = [];
  var i;
  for (i = 0; i < solicitantesSelecionados.length; i++) {
    if (solicitantesSelecionados[i].id !== id) novos.push(solicitantesSelecionados[i]);
  }
  solicitantesSelecionados = novos;
  renderChipsSolicitantes();
}

/* Chips canonicos: .chips-container > .chip > span + button.chip-remove (components.css) */
function renderChipsSolicitantes() {
  var cont = byId('solicitantesChips');
  cont.innerHTML = '';
  var i;
  for (i = 0; i < solicitantesSelecionados.length; i++) {
    (function(sol) {
      var chip = document.createElement('div');
      chip.className = 'chip';
      chip.id = 'chip-sol-' + sol.id;
      chip.innerHTML = '<span>' + esc(sol.nome) + '</span>';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip-remove';
      btn.title = 'Remover';
      btn.innerHTML = '<i class="ph ph-x"></i>';
      btn.addEventListener('click', function() { removerSolicitante(sol.id); });
      chip.appendChild(btn);
      cont.appendChild(chip);
    })(solicitantesSelecionados[i]);
  }
}

function nomesSolicitantes() {
  var nomes = [];
  var i;
  for (i = 0; i < solicitantesSelecionados.length; i++) {
    nomes.push(solicitantesSelecionados[i].nome || '');
  }
  nomes.sort(function(a, b) { return a.localeCompare(b); });
  return nomes.join(', ');
}

/* ========================= CARGA (modo edicao) ========================= */

function carregarLancamento() {
  var url = API_BASE + '/database/rows/table/' + TABLE_LANCAMENTOS + '/' +
    window.LANCAMENTO_ID + '/?user_field_names=false';
  mostrarOverlay();
  fetch(url, { headers: apiHeaders() })
    .then(function(r) {
      if (!r.ok) throw new Error('Lançamento não encontrado.');
      return r.json();
    })
    .then(function(data) {
      lancamentoAtual = data;
      preencherFormulario(data);
      snapshot = capturarSnapshot();
      exibirLogs(data);
      esconderOverlay();
      if (data[F.excluido] === true) {
        mostrarMsg('formMsg', 'warning', 'Este lançamento foi excluído e não pode ser editado.');
        return;
      }
      habilitarAcoes();
    })
    .catch(function(e) {
      esconderOverlay();
      mostrarMsg('formMsg', 'error', e.message || 'Erro ao carregar o lançamento.');
    });
}

function preencherFormulario(row) {
  byId('numeroPedidoInput').value = row[F.numeroPedido] || '';

  var sel = byId('especieSelect');
  var espArr = row[F.especie];
  if (espArr && espArr.length > 0) {
    garantirOpcaoEspecie(espArr[0].id, espArr[0].value || '');
    sel.value = String(espArr[0].id);
  } else {
    sel.value = '';
  }

  byId('quantidadeInput').value = parseInt(row[F.quantidade], 10) || 1;
  byId('dataRealizacaoInput').value = isoData(row[F.dataRealizacao]);

  solicitantesSelecionados = [];
  var solArr = row[F.solicitantes] || [];
  var i;
  for (i = 0; i < solArr.length; i++) {
    solicitantesSelecionados.push({ id: solArr[i].id, nome: solArr[i].value || '' });
  }
  renderChipsSolicitantes();

  byId('dataLancamentoInput').value = isoData(row[F.dataLancamento]);

  var guia = row[F.guiaSemanal];
  var guiaInt = (guia === null || guia === undefined || guia === '') ? NaN : parseInt(guia, 10);
  byId('guiaSemanalInput').value = isNaN(guiaInt) ? '' : guiaInt;

  var mapaValores = [
    ['valorBrutoInput', F.valorBruto],
    ['taxasCobrancaInput', F.taxasCobranca],
    ['taxaCnbInput', F.taxaCnb]
  ];
  for (i = 0; i < mapaValores.length; i++) {
    var v = paraNumero(row[mapaValores[i][1]]);
    byId(mapaValores[i][0]).value = (v === null) ? '' : v.toFixed(2);
  }

  byId('observacoesInput').value = row[F.observacoes] || '';

  sugestaoBrutoAnterior = null;   /* bruto carregado e dado, nao sugestao */
  calcularLiquido();
}

/* ========================= VALIDACAO ========================= */

function validarObrigatorios() {
  var numero = byId('numeroPedidoInput').value.trim();
  var especie = byId('especieSelect').value;
  var quantidade = byId('quantidadeInput').value;
  var dataReal = byId('dataRealizacaoInput').value;
  var guia = byId('guiaSemanalInput').value.trim();
  if (!numero) return 'Informe o número do pedido.';
  if (!especie) return 'Selecione a espécie.';
  if (!ehInteiroPositivo(quantidade)) return 'A quantidade deve ser um número inteiro maior ou igual a 1.';
  if (!dataReal) return 'Informe a data de realização.';
  if (guia && !ehInteiroPositivo(guia)) return 'A guia semanal deve ser um número inteiro maior ou igual a 1.';

  var bruto = paraNumero(byId('valorBrutoInput').value);
  var taxas = paraNumero(byId('taxasCobrancaInput').value);
  var cnb = paraNumero(byId('taxaCnbInput').value);
  if ((bruto !== null && bruto < 0) || (taxas !== null && taxas < 0) || (cnb !== null && cnb < 0)) {
    return 'Os valores não podem ser negativos.';
  }
  var liquido = Math.round(((bruto || 0) - (taxas || 0) - (cnb || 0)) * 100) / 100;
  if (liquido < 0) return 'O valor líquido ficou negativo. Confira os valores informados.';
  return null;
}

/* ========================= SNAPSHOT / LOG ========================= */

/* Valor de um input monetario no formato do log ('123,45') ou '' */
function textoValorInput(id) {
  var v = paraNumero(byId(id).value);
  return (v === null) ? '' : formatarMoeda(v);
}

function capturarEstadoAtual() {
  var sel = byId('especieSelect');
  var dr = byId('dataRealizacaoInput').value;
  var dl = byId('dataLancamentoInput').value;
  var estado = {};
  estado.numeroPedido = byId('numeroPedidoInput').value.trim();
  estado.especie = (sel.value && sel.selectedIndex >= 0) ? sel.options[sel.selectedIndex].text : '';
  estado.quantidade = byId('quantidadeInput').value;
  estado.dataRealizacao = dr ? formatarData(dr) : '';
  estado.solicitantes = nomesSolicitantes();
  estado.dataLancamento = dl ? formatarData(dl) : '';
  estado.guiaSemanal = byId('guiaSemanalInput').value;
  estado.valorBruto = textoValorInput('valorBrutoInput');
  estado.taxasCobranca = textoValorInput('taxasCobrancaInput');
  estado.taxaCnb = textoValorInput('taxaCnbInput');
  estado.observacoes = byId('observacoesInput').value;
  return estado;
}

function capturarSnapshot() {
  /* Estado de referencia, tirado logo apos carregar/salvar */
  return capturarEstadoAtual();
}

/* Uma linha por campo alterado: '{usuario}. {dd/mm/aaaa hh:mm}: O campo X foi alterado. Valor anterior: Y.'
   Observacoes: so 'Observações alteradas.' (sem conteudo). */
function gerarLinhasLog(snapAnterior, estadoAtual) {
  if (!snapAnterior) return [];
  var agora = new Date();
  var dia = ('0' + agora.getDate()).slice(-2);
  var mes = ('0' + (agora.getMonth() + 1)).slice(-2);
  var ano = agora.getFullYear();
  var hora = ('0' + agora.getHours()).slice(-2);
  var min = ('0' + agora.getMinutes()).slice(-2);
  var dataHora = dia + '/' + mes + '/' + ano + ' ' + hora + ':' + min;
  var usuario = nomeUsuario();

  var linhas = [];
  var chave;
  for (chave in FIELD_LABELS) {
    if (!Object.prototype.hasOwnProperty.call(FIELD_LABELS, chave)) continue;
    var anterior = (snapAnterior[chave] !== undefined && snapAnterior[chave] !== null) ? String(snapAnterior[chave]) : '';
    var atual = (estadoAtual[chave] !== undefined && estadoAtual[chave] !== null) ? String(estadoAtual[chave]) : '';
    if (anterior === atual) continue;
    if (chave === 'observacoes') {
      linhas.push(usuario + '. ' + dataHora + ': Observações alteradas.');
    } else {
      linhas.push(usuario + '. ' + dataHora + ': O campo ' + FIELD_LABELS[chave] +
        ' foi alterado. Valor anterior: ' + (anterior || '(vazio)') + '.');
    }
  }
  return linhas;
}

function exibirLogs(row) {
  var logCard = byId('logCard');
  var logContent = byId('logContent');
  var logs = (row && row[F.logs]) ? row[F.logs] : '';
  if (logs && logs.trim()) {
    logContent.textContent = logs;
    logCard.style.display = '';
  } else {
    logContent.textContent = '';
    logCard.style.display = 'none';
  }
}

/* ========================= PAYLOAD / GRAVACAO ========================= */

/* Valor monetario para o Baserow: string com 2 decimais e ponto, ou null quando vazio */
function valorPayload(id) {
  var v = paraNumero(byId(id).value);
  return (v === null) ? null : v.toFixed(2);
}

/* Campos do formulario. Nunca inclui a formula (valor liquido), excluido, criado_por/em ou logs:
   esses entram em gravar() conforme o modo. */
function montarPayload() {
  var numero = byId('numeroPedidoInput').value.trim();
  var sel = byId('especieSelect');
  var payload = {};
  payload[F.rotulo] = montarRotulo(numero, nomeEspecieSelecionada(), byId('dataRealizacaoInput').value);
  payload[F.numeroPedido] = numero;
  payload[F.especie] = [Number(sel.value)];
  payload[F.quantidade] = parseInt(byId('quantidadeInput').value, 10);
  payload[F.dataRealizacao] = byId('dataRealizacaoInput').value;

  var ids = [];
  var i;
  for (i = 0; i < solicitantesSelecionados.length; i++) {
    ids.push(Number(solicitantesSelecionados[i].id));
  }
  payload[F.solicitantes] = ids;

  payload[F.dataLancamento] = byId('dataLancamentoInput').value || null;
  var guia = byId('guiaSemanalInput').value.trim();
  payload[F.guiaSemanal] = guia ? parseInt(guia, 10) : null;
  payload[F.valorBruto] = valorPayload('valorBrutoInput');
  payload[F.taxasCobranca] = valorPayload('taxasCobrancaInput');
  payload[F.taxaCnb] = valorPayload('taxaCnbInput');
  payload[F.observacoes] = byId('observacoesInput').value;
  return payload;
}

/* Resposta HTTP do proxy: ok devolve o JSON; erro vira Error com o detail do Baserow (se for texto) */
function tratarRespostaHttp(r, msgPadrao) {
  if (r.ok) return r.json();
  return r.json()
    .catch(function() { return {}; })
    .then(function(e) {
      var msg = (typeof e.detail === 'string') ? e.detail : (e.error ? String(e.error) : '');
      throw new Error(msg || (msgPadrao + ' (' + r.status + ')'));
    });
}

/* modo: 'salvar' (permanece no registro) | 'salvarNovo' (so em modo novo: grava e limpa) */
function gravar(modo) {
  esconderMsg('formMsg');
  var erro = validarObrigatorios();
  if (erro) {
    mostrarMsg('formMsg', 'warning', erro);
    var msgEl = byId('formMsg');
    if (msgEl && msgEl.scrollIntoView) msgEl.scrollIntoView({ block: 'nearest' });
    return;
  }

  mostrarOverlay();
  desabilitarAcoes();
  var agora = new Date().toISOString();
  var payload = montarPayload();
  payload[F.atualizadoEm] = agora;

  var eraNovo = modoNovo;
  var req;
  if (eraNovo) {
    payload[F.criadoPor] = nomeUsuario();
    payload[F.criadoEm] = agora;
    req = fetch(API_BASE + '/database/rows/table/' + TABLE_LANCAMENTOS + '/?user_field_names=false',
      { method: 'POST', headers: apiHeaders(), body: JSON.stringify(payload) });
  } else {
    var linhas = gerarLinhasLog(snapshot, capturarEstadoAtual());
    if (linhas.length > 0) {
      var existentes = (lancamentoAtual && lancamentoAtual[F.logs]) ? lancamentoAtual[F.logs] : '';
      payload[F.logs] = linhas.join('\n') + (existentes ? '\n' + existentes : '');
    }
    req = fetch(API_BASE + '/database/rows/table/' + TABLE_LANCAMENTOS + '/' + lancamentoAtual.id + '/?user_field_names=false',
      { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(payload) });
  }

  req
    .then(function(r) { return tratarRespostaHttp(r, 'Erro ao salvar'); })
    .then(function(data) {
      if (eraNovo && modo === 'salvarNovo') {
        mostrarToast('Lançamento salvo.', 'success');
        limparParaNovo();
        byId('numeroPedidoInput').focus();
      } else if (eraNovo) {
        modoNovo = false;
        window.LANCAMENTO_ID = data.id;
        lancamentoAtual = data;
        snapshot = capturarSnapshot();
        try {
          history.replaceState(null, '', '/enotariado/lancamento/' + data.id);
        } catch (e) {}
        aplicarRotulos();
        byId('btnSalvarNovo').style.display = 'none';
        exibirLogs(data);
        mostrarToast('Lançamento criado com sucesso.', 'success');
      } else {
        lancamentoAtual = data;
        snapshot = capturarSnapshot();
        exibirLogs(data);
        mostrarToast('Alterações salvas com sucesso.', 'success');
      }
      esconderOverlay();
      habilitarAcoes();
    })
    .catch(function(e) {
      esconderOverlay();
      habilitarAcoes();
      mostrarMsg('formMsg', 'error', e.message || 'Erro ao salvar.');
    });
}

/* Limpa para o proximo lancamento, preservando data de lancamento e guia semanal */
function limparParaNovo() {
  byId('numeroPedidoInput').value = '';
  byId('especieSelect').value = '';
  byId('quantidadeInput').value = '1';
  byId('dataRealizacaoInput').value = '';
  solicitantesSelecionados = [];
  renderChipsSolicitantes();
  byId('solicitanteBusca').value = '';
  fecharListaSolicitantes();
  byId('valorBrutoInput').value = '';
  byId('taxasCobrancaInput').value = '';
  byId('taxaCnbInput').value = '';
  byId('observacoesInput').value = '';
  sugestaoBrutoAnterior = null;
  calcularLiquido();
  esconderMsg('formMsg');
}

/* Botao Limpar: modo novo zera tudo (inclusive guia e data de lancamento); edicao restaura o banco */
function limparFormulario() {
  if (modoNovo) {
    limparParaNovo();
    byId('dataLancamentoInput').value = '';
    byId('guiaSemanalInput').value = '';
  } else if (lancamentoAtual) {
    preencherFormulario(lancamentoAtual);
    esconderMsg('formMsg');
  }
}

/* ========================= HABILITACAO ========================= */

/* Excluir (btnExcluir) nao e tocado aqui: Leva 3 */
function habilitarAcoes() {
  byId('btnSalvar').disabled = false;
  byId('btnLimpar').disabled = false;
  var btnNovo = byId('btnSalvarNovo');
  btnNovo.disabled = false;
  if (!modoNovo) btnNovo.style.display = 'none';
}

function desabilitarAcoes() {
  byId('btnSalvar').disabled = true;
  byId('btnLimpar').disabled = true;
  byId('btnSalvarNovo').disabled = true;
}

/* ========================= ROTULOS ========================= */

function aplicarRotulos() {
  var titulo = byId('tituloPagina');
  if (!titulo) return;
  titulo.innerHTML = '<i class="ph ph-currency-circle-dollar"></i> ' +
    (modoNovo ? 'Novo lançamento' : 'Lançamento');
}

/* ========================= INIT ========================= */

document.addEventListener('DOMContentLoaded', function() {
  aplicarRotulos();

  /* Recalculo do liquido a cada digitacao nos tres campos de valor */
  var idsValores = ['valorBrutoInput', 'taxasCobrancaInput', 'taxaCnbInput'];
  var i;
  for (i = 0; i < idsValores.length; i++) {
    var elValor = byId(idsValores[i]);
    if (elValor) elValor.addEventListener('input', calcularLiquido);
  }
  calcularLiquido();

  /* Sugestao do bruto */
  byId('especieSelect').addEventListener('change', atualizarSugestaoBruto);
  byId('quantidadeInput').addEventListener('input', atualizarSugestaoBruto);

  /* Autocomplete de solicitantes (min. 3 caracteres, debounce 300 ms) */
  var busca = byId('solicitanteBusca');
  busca.addEventListener('input', function() {
    var raw = busca.value.trim();
    if (buscaTimer) clearTimeout(buscaTimer);
    if (raw.length < 3) { fecharListaSolicitantes(); return; }
    buscaTimer = setTimeout(function() { buscarSolicitante(raw); }, 300);
  });

  /* Fecha a lista ao clicar fora */
  document.addEventListener('click', function(ev) {
    if (!ev.target.closest || !ev.target.closest('.autocomplete-wrapper')) {
      fecharListaSolicitantes();
    }
  });

  /* Barra de acao */
  byId('btnSalvar').addEventListener('click', function() { gravar('salvar'); });
  byId('btnSalvarNovo').addEventListener('click', function() { gravar('salvarNovo'); });
  byId('btnLimpar').addEventListener('click', limparFormulario);

  var overlayEl = document.querySelector('.sidebar-overlay');
  if (overlayEl) overlayEl.addEventListener('click', toggleSidebar);

  /* Catalogo de especies primeiro; depois carga do registro (edicao) ou liberacao dos botoes (novo) */
  carregarEspecies(function() {
    if (!modoNovo) {
      carregarLancamento();
    } else {
      habilitarAcoes();
    }
  });
});
