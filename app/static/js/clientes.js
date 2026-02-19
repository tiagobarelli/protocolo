// Gestão de Clientes — ES5, proxy Flask /api/baserow
'use strict';

var API_BASE = '/api/baserow';
var TABLE_CLIENTES = 754;
var TABLE_PROTOCOLO = 755;

var FIELDS = {
  nome:        'field_7237',
  cpf:         'field_7238',
  cnpj:        'field_7239',
  telefone:    'field_7243',
  email:       'field_7244',
  endereco:    'field_7245',
  outros:      'field_7246',
  oab:         'field_7256',
  rg:          'field_7342',
  estadoCivil: 'field_7343',
  conjuge:     'field_7344',
  nascimento:  'field_7345',
  profissao:   'field_7347',
  protocolos:  'field_7247'
};

var ESTADO_CIVIL_OPTS = [
  { id: 3092, label: 'Casado (comunhão parcial)' },
  { id: 3093, label: 'Casado (comunhão universal)' },
  { id: 3094, label: 'Casado (participação final nos aquestos)' },
  { id: 3095, label: 'Casado (separação convencional)' },
  { id: 3096, label: 'Casado (separação obrigatória)' },
  { id: 3097, label: 'Separado' },
  { id: 3098, label: 'Divorciado' },
  { id: 3099, label: 'Viúvo' }
];

// ── Estado global ──
var clienteAtual  = null;   // linha do Baserow carregada no formulário
var modoNovo      = false;  // true = criando novo cliente
var conjugeId     = null;   // ID do cônjuge selecionado no autocomplete
var buscaTimer    = null;   // debounce da busca por nome
var conjugeTimer  = null;   // debounce do autocomplete de cônjuge

// ── API header ──
function apiHeaders() {
  return { 'Content-Type': 'application/json' };
}

// ═══════════════════════════════════════════════════════
// MÁSCARAS (copiado de cadastrar.js)
// ═══════════════════════════════════════════════════════
function formatarCPF(v) {
  v = v.replace(/\D/g, '').substring(0, 11);
  if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
  else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
  else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
  return v;
}

function formatarCNPJ(v) {
  v = v.replace(/\D/g, '').substring(0, 14);
  if (v.length > 12) v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, '$1.$2.$3/$4-$5');
  else if (v.length > 8) v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, '$1.$2.$3/$4');
  else if (v.length > 5) v = v.replace(/(\d{2})(\d{3})(\d{1,3})/, '$1.$2.$3');
  else if (v.length > 2) v = v.replace(/(\d{2})(\d{1,3})/, '$1.$2');
  return v;
}

function formatarTelefone(v) {
  v = v.replace(/\D/g, '').substring(0, 11);
  if (v.length > 6) v = v.replace(/(\d{2})(\d{4,5})(\d{1,4})/, '($1) $2-$3');
  else if (v.length > 2) v = v.replace(/(\d{2})(\d{1,5})/, '($1) $2');
  return v;
}

// ═══════════════════════════════════════════════════════
// VALIDAÇÃO CPF / CNPJ
// ═══════════════════════════════════════════════════════
function validarCPF(cpf) {
  cpf = cpf.replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  var todosIguais = true;
  for (var i = 1; i < 11; i++) {
    if (cpf[i] !== cpf[0]) { todosIguais = false; break; }
  }
  if (todosIguais) return false;
  var soma = 0;
  for (var j = 0; j < 9; j++) soma += parseInt(cpf[j], 10) * (10 - j);
  var resto = soma % 11;
  var d1 = resto < 2 ? 0 : 11 - resto;
  if (d1 !== parseInt(cpf[9], 10)) return false;
  soma = 0;
  for (var k = 0; k < 10; k++) soma += parseInt(cpf[k], 10) * (11 - k);
  resto = soma % 11;
  var d2 = resto < 2 ? 0 : 11 - resto;
  return d2 === parseInt(cpf[10], 10);
}

function validarCNPJ(cnpj) {
  cnpj = cnpj.replace(/\D/g, '');
  if (cnpj.length !== 14) return false;
  var todosIguais = true;
  for (var i = 1; i < 14; i++) {
    if (cnpj[i] !== cnpj[0]) { todosIguais = false; break; }
  }
  if (todosIguais) return false;
  var tamanho = 12;
  var soma = 0;
  var pos = tamanho - 7;
  for (var j = tamanho; j >= 1; j--) {
    soma += parseInt(cnpj.charAt(tamanho - j), 10) * pos--;
    if (pos < 2) pos = 9;
  }
  var resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
  if (resultado !== parseInt(cnpj.charAt(12), 10)) return false;
  tamanho++;
  soma = 0;
  pos = tamanho - 7;
  for (var k = tamanho; k >= 1; k--) {
    soma += parseInt(cnpj.charAt(tamanho - k), 10) * pos--;
    if (pos < 2) pos = 9;
  }
  resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
  return resultado === parseInt(cnpj.charAt(13), 10);
}

// ═══════════════════════════════════════════════════════
// UI HELPERS (copiado de cadastrar.js)
// ═══════════════════════════════════════════════════════
function mostrarMsg(id, tipo, texto) {
  var el = document.getElementById(id);
  var icone = '';
  if (tipo === 'success') icone = '<i class="ph ph-check-circle" style="font-size:1.2rem"></i> ';
  else if (tipo === 'warning') icone = '<i class="ph ph-warning" style="font-size:1.2rem"></i> ';
  else if (tipo === 'error') icone = '<i class="ph ph-x-circle" style="font-size:1.2rem"></i> ';
  el.className = 'msg-box ' + tipo;
  el.innerHTML = icone + texto;
  el.style.display = 'flex';
}

function esconderMsg(id) {
  var el = document.getElementById(id);
  el.style.display = 'none';
  el.innerHTML = '';
}

function mostrarOverlay() {
  document.getElementById('overlay').classList.add('active');
}

function esconderOverlay() {
  document.getElementById('overlay').classList.remove('active');
}

// ═══════════════════════════════════════════════════════
// MARKDOWN EDITOR (adaptado de cadastrar.js → #outrosTextarea)
// ═══════════════════════════════════════════════════════
if (window.marked) {
  marked.use({ gfm: true, breaks: true });
}

function renderMarkdownInto(el, md) {
  if (!el) return;
  md = md || '';
  if (window.marked) el.innerHTML = marked.parse(md);
  else el.textContent = md;
}

function atualizarPreviewOutros() {
  var ta = document.getElementById('outrosTextarea');
  var prev = document.getElementById('outrosPreview');
  if (!ta || !prev) return;
  var md = ta.value || '';
  if (!md.trim()) {
    prev.innerHTML = '<div class="md-placeholder">Pré-visualização...</div>';
    return;
  }
  renderMarkdownInto(prev, md);
}

function configurarMarkdownOutros() {
  var ta = document.getElementById('outrosTextarea');
  if (!ta) return;
  ta.addEventListener('input', atualizarPreviewOutros);
  atualizarPreviewOutros();
}

function addMarkdownOutros(tipo) {
  var ta = document.getElementById('outrosTextarea');
  if (!ta) return;
  var start = ta.selectionStart;
  var end = ta.selectionEnd;
  var texto = ta.value;
  var selecionado = texto.substring(start, end);
  var antes = texto.substring(0, start);
  var depois = texto.substring(end);
  var prefixo = '';
  var sufixo = '';
  var textoNovo = '';
  switch (tipo) {
    case 'bold':
      prefixo = '**'; sufixo = '**'; textoNovo = selecionado || 'texto em negrito'; break;
    case 'italic':
      prefixo = '*'; sufixo = '*'; textoNovo = selecionado || 'texto itálico'; break;
    case 'list':
      if (selecionado.indexOf('\n') !== -1) {
        textoNovo = selecionado.split('\n').map(function(l) { return '- ' + l; }).join('\n');
      } else {
        prefixo = '\n- '; textoNovo = selecionado || 'item da lista';
      }
      break;
    case 'heading':
      prefixo = '\n## '; sufixo = '\n'; textoNovo = selecionado || 'Título'; break;
    case 'code':
      prefixo = '`'; sufixo = '`'; textoNovo = selecionado || 'código'; break;
    case 'checklist':
      if (selecionado.indexOf('\n') !== -1) {
        textoNovo = selecionado.split('\n').map(function(l) { return '- [ ] ' + l; }).join('\n');
      } else {
        prefixo = '\n- [ ] '; textoNovo = selecionado || 'item';
      }
      break;
    case 'hr':
      prefixo = '\n\n---\n\n'; textoNovo = ''; break;
  }
  ta.value = antes + prefixo + textoNovo + sufixo + depois;
  ta.focus();
  var novaPos = start + prefixo.length + textoNovo.length + sufixo.length;
  if ((tipo === 'bold' || tipo === 'italic') && !selecionado) {
    ta.setSelectionRange(start + prefixo.length, start + prefixo.length + textoNovo.length);
  } else {
    ta.setSelectionRange(novaPos, novaPos);
  }
  ta.dispatchEvent(new Event('input'));
}

// ═══════════════════════════════════════════════════════
// ESTADO CIVIL — popular select
// ═══════════════════════════════════════════════════════
function popularEstadoCivil() {
  var select = document.getElementById('estadoCivilSelect');
  for (var i = 0; i < ESTADO_CIVIL_OPTS.length; i++) {
    var opt = document.createElement('option');
    opt.value = ESTADO_CIVIL_OPTS[i].id;
    opt.textContent = ESTADO_CIVIL_OPTS[i].label;
    select.appendChild(opt);
  }
}

// ═══════════════════════════════════════════════════════
// MÁSCARAS — configurar eventos
// ═══════════════════════════════════════════════════════
function configurarMascaras() {
  var cpf = document.getElementById('cpfInput');
  cpf.addEventListener('input', function() { cpf.value = formatarCPF(cpf.value); });

  var cnpj = document.getElementById('cnpjInput');
  cnpj.addEventListener('input', function() { cnpj.value = formatarCNPJ(cnpj.value); });

  var tel = document.getElementById('telefoneInput');
  tel.addEventListener('input', function() { tel.value = formatarTelefone(tel.value); });
}

// ═══════════════════════════════════════════════════════
// BUSCA PRINCIPAL
// ═══════════════════════════════════════════════════════
function configurarBusca() {
  var input = document.getElementById('buscaInput');

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.keyCode === 13) {
      e.preventDefault();
      executarBusca();
    }
  });

  input.addEventListener('input', function() {
    var raw = input.value.trim();
    var soDigitos = raw.replace(/\D/g, '');
    // Se parece com documento (só dígitos + separadores), não autocompleta — aguarda Buscar
    if (soDigitos.length >= 1 && soDigitos === raw.replace(/[\.\-\/]/g, '')) {
      fecharAutocompleteBusca();
      return;
    }
    if (buscaTimer) clearTimeout(buscaTimer);
    if (raw.length < 3) { fecharAutocompleteBusca(); return; }
    buscaTimer = setTimeout(function() { buscarPorNome(raw); }, 300);
  });

  document.getElementById('btnBuscar').addEventListener('click', function() {
    executarBusca();
  });
}

function executarBusca() {
  var raw = document.getElementById('buscaInput').value.trim();
  if (!raw) return;
  var soDigitos = raw.replace(/\D/g, '');
  fecharAutocompleteBusca();
  if (soDigitos.length === 11) {
    buscarExato(soDigitos, raw, 'cpf');
  } else if (soDigitos.length === 14) {
    buscarExato(soDigitos, raw, 'cnpj');
  } else if (raw.length >= 3) {
    buscarPorNome(raw);
  }
}

function buscarExato(soDigitos, valorFormatado, tipo) {
  var campo = tipo === 'cpf' ? FIELDS.cpf : FIELDS.cnpj;
  mostrarOverlay();
  var url = API_BASE + '/database/rows/table/' + TABLE_CLIENTES +
    '/?user_field_names=false&filter__' + campo + '__equal=' +
    encodeURIComponent(soDigitos) + '&size=1';
  fetch(url, { headers: apiHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.results && data.results.length > 0) {
        selecionarDaBusca(data.results[0]);
      } else {
        // Fallback: tenta versão formatada (caso esteja armazenado com pontuação)
        var urlFmt = API_BASE + '/database/rows/table/' + TABLE_CLIENTES +
          '/?user_field_names=false&filter__' + campo + '__equal=' +
          encodeURIComponent(valorFormatado) + '&size=1';
        return fetch(urlFmt, { headers: apiHeaders() })
          .then(function(r2) { return r2.json(); })
          .then(function(data2) {
            if (data2.results && data2.results.length > 0) {
              selecionarDaBusca(data2.results[0]);
            } else {
              esconderOverlay();
              mostrarFormulario();
              mostrarMsg('formMsg', 'warning',
                'Nenhum cliente encontrado com este ' + (tipo === 'cpf' ? 'CPF' : 'CNPJ') + '.');
            }
          });
      }
    })
    .catch(function(e) {
      esconderOverlay();
      console.error('Erro na busca exata:', e);
      mostrarMsg('formMsg', 'error', 'Erro ao consultar o banco de dados.');
      mostrarFormulario();
    });
}

function buscarPorNome(termo) {
  var url = API_BASE + '/database/rows/table/' + TABLE_CLIENTES +
    '/?user_field_names=false&filter__' + FIELDS.nome + '__contains=' +
    encodeURIComponent(termo) + '&size=10';
  fetch(url, { headers: apiHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) { mostrarAutocompleteBusca(data.results || []); })
    .catch(function(e) { console.error('Erro na busca por nome:', e); });
}

function mostrarAutocompleteBusca(resultados) {
  var lista = document.getElementById('buscaAutoList');
  lista.innerHTML = '';
  if (resultados.length === 0) { lista.classList.remove('open'); return; }
  for (var i = 0; i < resultados.length; i++) {
    (function(cli) {
      var nome    = cli[FIELDS.nome] || '';
      var cpfVal  = cli[FIELDS.cpf]  || '';
      var cnpjVal = cli[FIELDS.cnpj] || '';
      var detalhe = cpfVal ? ('CPF: ' + cpfVal) : (cnpjVal ? ('CNPJ: ' + cnpjVal) : '');
      var item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.innerHTML =
        '<div class="ac-name">' + nome + '</div>' +
        (detalhe ? '<div class="ac-detail">' + detalhe + '</div>' : '');
      item.addEventListener('click', function() {
        fecharAutocompleteBusca();
        selecionarDaBusca(cli);
      });
      lista.appendChild(item);
    })(resultados[i]);
  }
  lista.classList.add('open');
}

function fecharAutocompleteBusca() {
  document.getElementById('buscaAutoList').classList.remove('open');
}

function selecionarDaBusca(cli) {
  clienteAtual = cli;
  modoNovo = false;
  preencherFormulario(cli);
  mostrarFormulario();
  esconderOverlay();
}

// ═══════════════════════════════════════════════════════
// NOVO CLIENTE
// ═══════════════════════════════════════════════════════
function novoCliente() {
  clienteAtual = null;
  modoNovo = true;
  conjugeId = null;
  limparCamposFormulario();
  document.getElementById('cpfInput').readOnly = false;
  document.getElementById('cnpjInput').readOnly = false;
  esconderMsg('formMsg');
  mostrarFormulario();
  document.getElementById('nomeInput').focus();
}

// ═══════════════════════════════════════════════════════
// FORMULÁRIO — visibilidade e preenchimento
// ═══════════════════════════════════════════════════════
function mostrarFormulario() {
  var card = document.getElementById('formCard');
  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function esconderFormulario() {
  document.getElementById('formCard').style.display = 'none';
}

function preencherFormulario(cli) {
  document.getElementById('nomeInput').value      = cli[FIELDS.nome]      || '';
  document.getElementById('cpfInput').value       = cli[FIELDS.cpf]       || '';
  document.getElementById('cnpjInput').value      = cli[FIELDS.cnpj]      || '';
  document.getElementById('rgInput').value        = cli[FIELDS.rg]        || '';
  document.getElementById('nascimentoInput').value = cli[FIELDS.nascimento] || '';
  document.getElementById('profissaoInput').value = cli[FIELDS.profissao] || '';
  document.getElementById('telefoneInput').value  = cli[FIELDS.telefone]  || '';
  document.getElementById('emailInput').value     = cli[FIELDS.email]     || '';
  document.getElementById('enderecoTextarea').value = cli[FIELDS.endereco] || '';
  document.getElementById('oabInput').value       = cli[FIELDS.oab]       || '';

  var outrosVal = cli[FIELDS.outros] || '';
  document.getElementById('outrosTextarea').value = outrosVal;
  atualizarPreviewOutros();

  // Estado civil — Baserow retorna { id: 3092, value: "Casado..." }
  var ecObj = cli[FIELDS.estadoCivil];
  document.getElementById('estadoCivilSelect').value = (ecObj && ecObj.id) ? String(ecObj.id) : '';

  // Cônjuge — link_row retorna [{ id: X, value: "Nome" }]
  var conjArr = cli[FIELDS.conjuge];
  if (conjArr && conjArr.length > 0) {
    conjugeId = conjArr[0].id;
    document.getElementById('conjugeInput').value = conjArr[0].value || '';
  } else {
    conjugeId = null;
    document.getElementById('conjugeInput').value = '';
  }

  // CPF/CNPJ readonly ao editar cliente existente
  var editando = !!cli.id;
  document.getElementById('cpfInput').readOnly  = editando;
  document.getElementById('cnpjInput').readOnly = editando;

  // Protocolos vinculados (async)
  carregarProtocolos(cli[FIELDS.protocolos] || []);
}

function limparCamposFormulario() {
  document.getElementById('nomeInput').value        = '';
  document.getElementById('cpfInput').value         = '';
  document.getElementById('cnpjInput').value        = '';
  document.getElementById('rgInput').value          = '';
  document.getElementById('nascimentoInput').value  = '';
  document.getElementById('profissaoInput').value   = '';
  document.getElementById('telefoneInput').value    = '';
  document.getElementById('emailInput').value       = '';
  document.getElementById('enderecoTextarea').value = '';
  document.getElementById('oabInput').value         = '';
  document.getElementById('outrosTextarea').value   = '';
  atualizarPreviewOutros();
  document.getElementById('estadoCivilSelect').value = '';
  document.getElementById('conjugeInput').value      = '';
  document.getElementById('protocolosList').innerHTML =
    '<div class="protocols-empty">Nenhum protocolo vinculado.</div>';
  conjugeId = null;
}

function limparFormulario() {
  clienteAtual = null;
  modoNovo = false;
  conjugeId = null;
  limparCamposFormulario();
  esconderMsg('formMsg');
  esconderFormulario();
}

// ═══════════════════════════════════════════════════════
// CÔNJUGE — autocomplete
// ═══════════════════════════════════════════════════════
function configurarConjuge() {
  var input = document.getElementById('conjugeInput');
  input.addEventListener('input', function() {
    var termo = input.value.trim();
    if (!termo) {
      conjugeId = null;
      fecharAutocompleteConjuge();
      return;
    }
    if (conjugeId) { conjugeId = null; }
    if (conjugeTimer) clearTimeout(conjugeTimer);
    if (termo.length < 3) { fecharAutocompleteConjuge(); return; }
    conjugeTimer = setTimeout(function() { buscarConjuge(termo); }, 300);
  });
}

function buscarConjuge(termo) {
  var url = API_BASE + '/database/rows/table/' + TABLE_CLIENTES +
    '/?user_field_names=false&filter__' + FIELDS.nome + '__contains=' +
    encodeURIComponent(termo) + '&size=8';
  fetch(url, { headers: apiHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) { mostrarAutocompleteConjuge(data.results || []); })
    .catch(function(e) { console.error('Erro na busca de cônjuge:', e); });
}

function mostrarAutocompleteConjuge(resultados) {
  var lista = document.getElementById('conjugeAutoList');
  lista.innerHTML = '';
  if (resultados.length === 0) { lista.classList.remove('open'); return; }
  for (var i = 0; i < resultados.length; i++) {
    (function(cli) {
      var nome    = cli[FIELDS.nome] || '';
      var cpfVal  = cli[FIELDS.cpf]  || '';
      var cnpjVal = cli[FIELDS.cnpj] || '';
      var detalhe = cpfVal ? ('CPF: ' + cpfVal) : (cnpjVal ? ('CNPJ: ' + cnpjVal) : '');
      var item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.innerHTML =
        '<div class="ac-name">' + nome + '</div>' +
        (detalhe ? '<div class="ac-detail">' + detalhe + '</div>' : '');
      item.addEventListener('click', function() { selecionarConjuge(cli); });
      lista.appendChild(item);
    })(resultados[i]);
  }
  lista.classList.add('open');
}

function fecharAutocompleteConjuge() {
  document.getElementById('conjugeAutoList').classList.remove('open');
}

function selecionarConjuge(cli) {
  conjugeId = cli.id;
  document.getElementById('conjugeInput').value = cli[FIELDS.nome] || '';
  fecharAutocompleteConjuge();
}

// ═══════════════════════════════════════════════════════
// PROTOCOLOS VINCULADOS
// ═══════════════════════════════════════════════════════
function carregarProtocolos(protArr) {
  var container = document.getElementById('protocolosList');
  if (!protArr || protArr.length === 0) {
    container.innerHTML = '<div class="protocols-empty">Nenhum protocolo vinculado.</div>';
    return;
  }
  container.innerHTML = '<div class="protocols-empty">Carregando protocolos...</div>';

  var promises = [];
  for (var i = 0; i < protArr.length; i++) {
    promises.push(
      fetch(
        API_BASE + '/database/rows/table/' + TABLE_PROTOCOLO + '/' + protArr[i].id +
          '/?user_field_names=false',
        { headers: apiHeaders() }
      ).then(function(r) { return r.json(); })
    );
  }

  Promise.all(promises)
    .then(function(rows) {
      container.innerHTML = '';
      for (var j = 0; j < rows.length; j++) {
        var proto     = rows[j];
        var numProto  = proto['field_7240'] || (protArr[j] ? (protArr[j].value || '—') : '—');
        var servicoArr = proto['field_7242'] || [];
        var servico   = servicoArr.length > 0 ? (servicoArr[0].value || '—') : '—';
        var statusObj = proto['field_7252'];
        var status    = statusObj ? (statusObj.value || '—') : '—';
        var dataRaw   = proto['field_7250'] || '';
        var data      = dataRaw ? dataRaw.split('-').reverse().join('/') : '—';
        var item = document.createElement('div');
        item.className = 'protocol-item';
        item.textContent = 'N\u00ba ' + numProto + ' \u2014 ' + servico + ' \u2014 ' + status + ' \u2014 ' + data;
        container.appendChild(item);
      }
    })
    .catch(function(e) {
      container.innerHTML = '<div class="protocols-empty">Erro ao carregar protocolos.</div>';
      console.error('Erro ao carregar protocolos vinculados:', e);
    });
}

// ═══════════════════════════════════════════════════════
// VALIDAÇÃO E SAVE
// ═══════════════════════════════════════════════════════
function verificarDuplicata(cpfLimpo, cnpjLimpo) {
  var promises = [];
  if (cpfLimpo) {
    promises.push(
      fetch(
        API_BASE + '/database/rows/table/' + TABLE_CLIENTES +
          '/?user_field_names=false&filter__' + FIELDS.cpf + '__equal=' +
          encodeURIComponent(cpfLimpo) + '&size=1',
        { headers: apiHeaders() }
      )
      .then(function(r) { return r.json(); })
      .then(function(d) { return !!(d.results && d.results.length > 0); })
    );
  }
  if (cnpjLimpo) {
    promises.push(
      fetch(
        API_BASE + '/database/rows/table/' + TABLE_CLIENTES +
          '/?user_field_names=false&filter__' + FIELDS.cnpj + '__equal=' +
          encodeURIComponent(cnpjLimpo) + '&size=1',
        { headers: apiHeaders() }
      )
      .then(function(r) { return r.json(); })
      .then(function(d) { return !!(d.results && d.results.length > 0); })
    );
  }
  if (promises.length === 0) return Promise.resolve(false);
  return Promise.all(promises).then(function(resultados) {
    for (var i = 0; i < resultados.length; i++) {
      if (resultados[i]) return true;
    }
    return false;
  });
}

function construirPayload(incluirDocumentos) {
  var payload = {};
  payload[FIELDS.nome]     = document.getElementById('nomeInput').value.trim();
  payload[FIELDS.rg]       = document.getElementById('rgInput').value.trim();
  payload[FIELDS.profissao] = document.getElementById('profissaoInput').value.trim();
  payload[FIELDS.telefone] = document.getElementById('telefoneInput').value.trim();
  payload[FIELDS.email]    = document.getElementById('emailInput').value.trim();
  payload[FIELDS.endereco] = document.getElementById('enderecoTextarea').value.trim();
  payload[FIELDS.oab]      = document.getElementById('oabInput').value.trim();
  payload[FIELDS.outros]   = document.getElementById('outrosTextarea').value;

  var nasc = document.getElementById('nascimentoInput').value;
  payload[FIELDS.nascimento] = nasc || null;

  var ecVal = document.getElementById('estadoCivilSelect').value;
  payload[FIELDS.estadoCivil] = ecVal ? parseInt(ecVal, 10) : null;

  payload[FIELDS.conjuge] = conjugeId ? [conjugeId] : [];

  if (incluirDocumentos) {
    var cpfFormatado  = document.getElementById('cpfInput').value.trim();
    var cnpjFormatado = document.getElementById('cnpjInput').value.trim();
    if (cpfFormatado)  payload[FIELDS.cpf]  = cpfFormatado;
    if (cnpjFormatado) payload[FIELDS.cnpj] = cnpjFormatado;
  }

  return payload;
}

function salvarCliente() {
  var nome      = document.getElementById('nomeInput').value.trim();
  var cpfRaw    = document.getElementById('cpfInput').value.trim();
  var cnpjRaw   = document.getElementById('cnpjInput').value.trim();
  var cpfLimpo  = cpfRaw.replace(/\D/g, '');
  var cnpjLimpo = cnpjRaw.replace(/\D/g, '');

  if (!nome) {
    return mostrarMsg('formMsg', 'error', 'O nome do cliente é obrigatório.');
  }
  if (modoNovo && !cpfLimpo && !cnpjLimpo) {
    return mostrarMsg('formMsg', 'error', 'Informe CPF ou CNPJ para cadastrar um novo cliente.');
  }
  if (cpfLimpo && !validarCPF(cpfLimpo)) {
    return mostrarMsg('formMsg', 'error', 'CPF inválido. Verifique os dígitos verificadores.');
  }
  if (cnpjLimpo && !validarCNPJ(cnpjLimpo)) {
    return mostrarMsg('formMsg', 'error', 'CNPJ inválido. Verifique os dígitos verificadores.');
  }

  var btnSalvar = document.getElementById('btnSalvar');
  btnSalvar.disabled = true;
  mostrarOverlay();
  esconderMsg('formMsg');

  if (modoNovo) {
    verificarDuplicata(cpfLimpo, cnpjLimpo)
      .then(function(existe) {
        if (existe) {
          esconderOverlay();
          btnSalvar.disabled = false;
          mostrarMsg('formMsg', 'warning',
            'Já existe um cliente cadastrado com este CPF ou CNPJ.');
        } else {
          executarPost(btnSalvar);
        }
      })
      .catch(function(e) {
        esconderOverlay();
        btnSalvar.disabled = false;
        mostrarMsg('formMsg', 'error', 'Erro ao verificar duplicatas.');
        console.error(e);
      });
  } else {
    executarPatch(btnSalvar);
  }
}

function executarPost(btnSalvar) {
  var payload = construirPayload(true);
  var url = API_BASE + '/database/rows/table/' + TABLE_CLIENTES + '/?user_field_names=false';
  fetch(url, { method: 'POST', headers: apiHeaders(), body: JSON.stringify(payload) })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(e) {
        throw new Error(e.detail || 'Erro ao cadastrar cliente.');
      });
      return r.json();
    })
    .then(function(data) {
      clienteAtual = data;
      modoNovo = false;
      document.getElementById('cpfInput').readOnly  = true;
      document.getElementById('cnpjInput').readOnly = true;
      esconderOverlay();
      btnSalvar.disabled = false;
      mostrarMsg('formMsg', 'success', 'Cliente cadastrado com sucesso!');
    })
    .catch(function(e) {
      esconderOverlay();
      btnSalvar.disabled = false;
      mostrarMsg('formMsg', 'error', e.message || 'Erro ao cadastrar cliente.');
      console.error(e);
    });
}

function executarPatch(btnSalvar) {
  var payload = construirPayload(false);
  var url = API_BASE + '/database/rows/table/' + TABLE_CLIENTES + '/' +
    clienteAtual.id + '/?user_field_names=false';
  fetch(url, { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(payload) })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(e) {
        throw new Error(e.detail || 'Erro ao salvar alterações.');
      });
      return r.json();
    })
    .then(function(data) {
      clienteAtual = data;
      esconderOverlay();
      btnSalvar.disabled = false;
      mostrarMsg('formMsg', 'success', 'Alterações salvas com sucesso!');
    })
    .catch(function(e) {
      esconderOverlay();
      btnSalvar.disabled = false;
      mostrarMsg('formMsg', 'error', e.message || 'Erro ao salvar cliente.');
      console.error(e);
    });
}

// ═══════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  popularEstadoCivil();
  configurarBusca();
  configurarConjuge();
  configurarMascaras();
  configurarMarkdownOutros();

  document.getElementById('btnNovoCliente').addEventListener('click', novoCliente);
  document.getElementById('btnSalvar').addEventListener('click', salvarCliente);
  document.getElementById('btnLimpar').addEventListener('click', limparFormulario);

  // Fechar dropdowns ao clicar fora
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#buscaCard')) {
      fecharAutocompleteBusca();
    }
    var conjugeWrapper = document.getElementById('conjugeInput');
    if (conjugeWrapper && !e.target.closest('.autocomplete-wrapper')) {
      fecharAutocompleteConjuge();
    }
  });
});
