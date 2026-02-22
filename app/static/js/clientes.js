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
  profissao:        'field_7347',
  regraPatrimonial: 'field_7348',
  protocolos:       'field_7247',
  alerta:           'field_7394',
  logs:             'field_7395'
};

var FIELD_LABELS = {
  nome:             'Nome',
  cpf:              'CPF',
  cnpj:             'CNPJ',
  telefone:         'Telefone',
  email:            'E-mail',
  endereco:         'Endereço',
  oab:              'OAB',
  rg:               'RG',
  estadoCivil:      'Estado Civil',
  conjuge:          'Cônjuge',
  nascimento:       'Data de Nascimento',
  profissao:        'Profissão',
  regraPatrimonial: 'Regra Patrimonial',
  alerta:           'Alerta'
};

var ESTADO_CIVIL_OPTS = [
  { id: 3107, label: 'Solteiro' },
  { id: 3092, label: 'Casado' },
  { id: 3097, label: 'Separado' },
  { id: 3098, label: 'Divorciado' },
  { id: 3099, label: 'Viúvo' },
  { id: 3101, label: 'União estável' }
];

var REGRA_PATRIMONIAL_OPTS = [
  { id: 3102, label: 'Comunhão parcial' },
  { id: 3103, label: 'Comunhão universal' },
  { id: 3104, label: 'Separação convencional' },
  { id: 3105, label: 'Separação obrigatória' },
  { id: 3106, label: 'Participação final nos aquestos' }
];

// ── Estado global ──
var clienteAtual  = null;   // linha do Baserow carregada no formulário
var modoNovo      = false;  // true = criando novo cliente
var clienteCarregadoPorBusca = false; // true quando veio de busca positiva
var conjugeId     = null;   // ID do cônjuge selecionado no autocomplete
var buscaTimer    = null;   // debounce da busca por nome
var conjugeTimer  = null;   // debounce do autocomplete de cônjuge
var snapshotCliente = null;  // snapshot dos dados originais para detecção de alterações

// ── Paperless-ngx ──
var PAPERLESS_API = '/api/paperless';
var PAPERLESS_TAGS_DOCS = [
  'Cart\u00e3o de assinatura',
  'Certid\u00e3o de casamento',
  'Certid\u00e3o de Interdi\u00e7\u00e3o',
  'Certid\u00e3o de nascimento',
  'Certid\u00e3o de \u00f3bito',
  'CNH',
  'CTPS',
  'Documento particular de uni\u00e3o est\u00e1vel',
  'Escritura de uni\u00e3o est\u00e1vel',
  'Funcional (documento de identidade)',
  'Passaporte',
  'RG',
  'RNE (Registro Nacional de Estrangeiro)',
  'Uni\u00e3o est\u00e1vel (certid\u00e3o do RCPN)'
];
var paperlessTags = {};          // mapa id → nome (carregado uma vez)
var paperlessTagsLoaded = false;
var cacheDocsPaperless = {};     // chave: CPF, valor: array de docs

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

function popularRegraPatrimonial() {
  var select = document.getElementById('regraPatrimonialSelect');
  for (var i = 0; i < REGRA_PATRIMONIAL_OPTS.length; i++) {
    var opt = document.createElement('option');
    opt.value = REGRA_PATRIMONIAL_OPTS[i].id;
    opt.textContent = REGRA_PATRIMONIAL_OPTS[i].label;
    select.appendChild(opt);
  }
}

function atualizarVisibilidadeRegraPatrimonial() {
  var ecVal = document.getElementById('estadoCivilSelect').value;
  var grupo = document.getElementById('regraPatrimonialGroup');
  if (ecVal === '3092' || ecVal === '3101') {
    grupo.style.display = '';
  } else {
    grupo.style.display = 'none';
    document.getElementById('regraPatrimonialSelect').value = '';
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
  clienteCarregadoPorBusca = true;
  preencherFormulario(cli);
  mostrarFormulario();
  fecharDrawer();
  esconderOverlay();
}

// ═══════════════════════════════════════════════════════
// NOVO CLIENTE
// ═══════════════════════════════════════════════════════
function novoCliente() {
  clienteAtual = null;
  modoNovo = true;
  clienteCarregadoPorBusca = false;
  snapshotCliente = null;
  conjugeId = null;
  limparCamposFormulario();
  atualizarVisibilidadeDocumentos();
  document.getElementById('cpfInput').readOnly = false;
  document.getElementById('cnpjInput').readOnly = false;
  esconderMsg('formMsg');
  var podeEditarAlerta = window.CURRENT_USER &&
    (window.CURRENT_USER.perfil === 'master' || window.CURRENT_USER.perfil === 'administrador');
  if (podeEditarAlerta) {
    document.getElementById('alertaCard').style.display = '';
    document.getElementById('alertaEditavel').style.display = '';
    document.getElementById('alertaReadonly').style.display = 'none';
  }
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

// ═══════════════════════════════════════════════════════
// LOGS — snapshot e detecção de alterações
// ═══════════════════════════════════════════════════════
function capturarSnapshot(cli) {
  if (!cli) return null;
  var snap = {};
  snap.nome      = cli[FIELDS.nome] || '';
  snap.cpf       = cli[FIELDS.cpf] || '';
  snap.cnpj      = cli[FIELDS.cnpj] || '';
  snap.telefone  = cli[FIELDS.telefone] || '';
  snap.email     = cli[FIELDS.email] || '';
  snap.endereco  = cli[FIELDS.endereco] || '';
  snap.oab       = cli[FIELDS.oab] || '';
  snap.rg        = cli[FIELDS.rg] || '';
  snap.profissao = cli[FIELDS.profissao] || '';
  snap.alerta    = cli[FIELDS.alerta] || '';
  snap.nascimento = cli[FIELDS.nascimento] || '';
  var ecObj = cli[FIELDS.estadoCivil];
  snap.estadoCivil = (ecObj && ecObj.value) ? ecObj.value : '';
  var rpObj = cli[FIELDS.regraPatrimonial];
  snap.regraPatrimonial = (rpObj && rpObj.value) ? rpObj.value : '';
  var conjArr = cli[FIELDS.conjuge];
  snap.conjuge = (conjArr && conjArr.length > 0 && conjArr[0].value) ? conjArr[0].value : '';
  return snap;
}

function capturarEstadoAtualFormulario() {
  var estado = {};
  estado.nome      = document.getElementById('nomeInput').value.trim();
  estado.cpf       = document.getElementById('cpfInput').value.trim();
  estado.cnpj      = document.getElementById('cnpjInput').value.trim();
  estado.telefone  = document.getElementById('telefoneInput').value.trim();
  estado.email     = document.getElementById('emailInput').value.trim();
  estado.endereco  = document.getElementById('enderecoTextarea').value.trim();
  estado.oab       = document.getElementById('oabInput').value.trim();
  estado.rg        = document.getElementById('rgInput').value.trim();
  estado.profissao = document.getElementById('profissaoInput').value.trim();
  estado.nascimento = document.getElementById('nascimentoInput').value || '';

  var alertaEl = document.getElementById('alertaTextarea');
  var podeEditarAlerta = window.CURRENT_USER &&
    (window.CURRENT_USER.perfil === 'master' || window.CURRENT_USER.perfil === 'administrador');
  if (podeEditarAlerta && alertaEl) {
    estado.alerta = alertaEl.value;
  } else {
    estado.alerta = snapshotCliente ? snapshotCliente.alerta : '';
  }

  var ecVal = document.getElementById('estadoCivilSelect').value;
  estado.estadoCivil = '';
  if (ecVal) {
    for (var i = 0; i < ESTADO_CIVIL_OPTS.length; i++) {
      if (String(ESTADO_CIVIL_OPTS[i].id) === String(ecVal)) {
        estado.estadoCivil = ESTADO_CIVIL_OPTS[i].label;
        break;
      }
    }
  }

  var rpVal = document.getElementById('regraPatrimonialSelect').value;
  estado.regraPatrimonial = '';
  if (rpVal) {
    for (var j = 0; j < REGRA_PATRIMONIAL_OPTS.length; j++) {
      if (String(REGRA_PATRIMONIAL_OPTS[j].id) === String(rpVal)) {
        estado.regraPatrimonial = REGRA_PATRIMONIAL_OPTS[j].label;
        break;
      }
    }
  }

  estado.conjuge = conjugeId ? document.getElementById('conjugeInput').value.trim() : '';

  return estado;
}

function gerarLinhasLog(snapAnterior, estadoAtual) {
  if (!snapAnterior) return [];

  var agora = new Date();
  var dia = ('0' + agora.getDate()).slice(-2);
  var mes = ('0' + (agora.getMonth() + 1)).slice(-2);
  var ano = agora.getFullYear();
  var hora = ('0' + agora.getHours()).slice(-2);
  var min = ('0' + agora.getMinutes()).slice(-2);
  var dataHora = dia + '/' + mes + '/' + ano + ' ' + hora + ':' + min;

  var nomeUsuario = (window.CURRENT_USER && window.CURRENT_USER.nome) ? window.CURRENT_USER.nome : 'Usuário';

  var linhas = [];
  var chaves = Object.keys(FIELD_LABELS);
  for (var i = 0; i < chaves.length; i++) {
    var chave = chaves[i];
    var anterior = (snapAnterior[chave] !== undefined && snapAnterior[chave] !== null) ? String(snapAnterior[chave]) : '';
    var atual = (estadoAtual[chave] !== undefined && estadoAtual[chave] !== null) ? String(estadoAtual[chave]) : '';
    if (anterior !== atual) {
      var valorAnterior = anterior || '(vazio)';
      linhas.push(nomeUsuario + '. ' + dataHora + ': O campo ' + FIELD_LABELS[chave] + ' foi alterado. Valor anterior: ' + valorAnterior + '.');
    }
  }
  return linhas;
}

function exibirLogs(cli) {
  var logCard = document.getElementById('logCard');
  var logContent = document.getElementById('logContent');
  var logsVal = (cli && cli[FIELDS.logs]) ? cli[FIELDS.logs] : '';

  if (logsVal.trim()) {
    logContent.textContent = logsVal;
    logCard.style.display = '';
  } else {
    logContent.textContent = '';
    logCard.style.display = 'none';
  }
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

  // Regra patrimonial
  var rpObj = cli[FIELDS.regraPatrimonial];
  document.getElementById('regraPatrimonialSelect').value = (rpObj && rpObj.id) ? rpObj.id : '';
  atualizarVisibilidadeRegraPatrimonial();

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

  // Alerta
  var alertaVal = cli[FIELDS.alerta] || '';
  var alertaCard = document.getElementById('alertaCard');
  var alertaReadonly = document.getElementById('alertaReadonly');
  var alertaEditavel = document.getElementById('alertaEditavel');
  var alertaTextarea = document.getElementById('alertaTextarea');
  var podeEditarAlerta = window.CURRENT_USER &&
    (window.CURRENT_USER.perfil === 'master' || window.CURRENT_USER.perfil === 'administrador');

  if (podeEditarAlerta) {
    alertaCard.style.display = '';
    alertaEditavel.style.display = '';
    alertaReadonly.style.display = 'none';
    alertaTextarea.value = alertaVal;
  } else if (alertaVal.trim()) {
    alertaCard.style.display = '';
    alertaReadonly.style.display = '';
    alertaEditavel.style.display = 'none';
    alertaReadonly.textContent = alertaVal;
  } else {
    alertaCard.style.display = 'none';
  }

  if (alertaVal.trim()) {
    alertaCard.classList.add('alerta-ativo');
  } else {
    alertaCard.classList.remove('alerta-ativo');
  }

  // Capturar snapshot para detecção de alterações
  snapshotCliente = capturarSnapshot(cli);

  // Exibir logs
  exibirLogs(cli);

  // Protocolos vinculados (async)
  carregarProtocolos(cli[FIELDS.protocolos] || []);

  // Documentos Digitalizados (Paperless) — mostrar seção se tem CPF
  atualizarVisibilidadeDocumentos();
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
  document.getElementById('regraPatrimonialSelect').value = '';
  atualizarVisibilidadeRegraPatrimonial();
  document.getElementById('conjugeInput').value      = '';
  document.getElementById('protocolosList').innerHTML =
    '<div class="protocols-empty">Nenhum protocolo vinculado.</div>';
  conjugeId = null;
  document.getElementById('alertaTextarea').value = '';
  document.getElementById('alertaReadonly').textContent = '';
  document.getElementById('alertaCard').style.display = 'none';
  document.getElementById('alertaCard').classList.remove('alerta-ativo');
  snapshotCliente = null;
  document.getElementById('logContent').textContent = '';
  document.getElementById('logCard').style.display = 'none';
}

function limparFormulario() {
  clienteAtual = null;
  modoNovo = false;
  clienteCarregadoPorBusca = false;
  conjugeId = null;
  limparCamposFormulario();
  esconderMsg('formMsg');
  esconderFormulario();
  fecharDrawer();
  cacheDocsPaperless = {};
  atualizarVisibilidadeDocumentos();
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

  var rpVal = document.getElementById('regraPatrimonialSelect').value;
  payload[FIELDS.regraPatrimonial] = rpVal ? parseInt(rpVal, 10) : null;

  payload[FIELDS.conjuge] = conjugeId ? [conjugeId] : [];

  if (incluirDocumentos) {
    var cpfFormatado  = document.getElementById('cpfInput').value.trim();
    var cnpjFormatado = document.getElementById('cnpjInput').value.trim();
    if (cpfFormatado)  payload[FIELDS.cpf]  = cpfFormatado;
    if (cnpjFormatado) payload[FIELDS.cnpj] = cnpjFormatado;
  }

  var podeEditarAlerta = window.CURRENT_USER &&
    (window.CURRENT_USER.perfil === 'master' || window.CURRENT_USER.perfil === 'administrador');
  if (podeEditarAlerta) {
    payload[FIELDS.alerta] = document.getElementById('alertaTextarea').value;
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
      clienteCarregadoPorBusca = false;
      atualizarVisibilidadeDocumentos();
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
  // Gerar logs de alteração antes do PATCH
  var estadoAtual = capturarEstadoAtualFormulario();
  var linhasLog = gerarLinhasLog(snapshotCliente, estadoAtual);

  var payload = construirPayload(false);

  // Se houve alterações, adicionar logs ao payload
  if (linhasLog.length > 0) {
    var logsExistentes = (clienteAtual && clienteAtual[FIELDS.logs]) ? clienteAtual[FIELDS.logs] : '';
    var novasLinhas = linhasLog.join('\n');
    payload[FIELDS.logs] = logsExistentes ? (novasLinhas + '\n' + logsExistentes) : novasLinhas;
  }

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
      snapshotCliente = capturarSnapshot(data);
      exibirLogs(data);
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
// PAPERLESS-NGX — Documentos Digitalizados
// ═══════════════════════════════════════════════════════
function atualizarVisibilidadeDocumentos() {
  var secao = document.getElementById('secaoDocumentos');
  if (!secao) return;
  var cpf = document.getElementById('cpfInput').value.trim();
  var resumo = document.getElementById('docsResumo');
  var deveExibir = !!(clienteAtual && !modoNovo && clienteCarregadoPorBusca && cpf);

  if (deveExibir) {
    secao.style.display = '';

    // Se já consultou esse CPF na sessão, reaproveita o resumo do cache.
    if (resumo) {
      if (cacheDocsPaperless[cpf]) {
        atualizarResumoInline(cacheDocsPaperless[cpf]);
      } else {
        resumo.innerHTML = 'Clique em "Consultar" para verificar documentos no Paperless.';
        resumo.classList.remove('clickable');
        resumo.onclick = null;
      }
    }
  } else {
    secao.style.display = 'none';
    fecharDrawer();
    if (resumo) {
      resumo.innerHTML = 'Clique em "Consultar" para verificar documentos no Paperless.';
      resumo.classList.remove('clickable');
      resumo.onclick = null;
    }
  }
}

function carregarTagsPaperless(callback) {
  if (paperlessTagsLoaded) { callback(); return; }
  fetch(PAPERLESS_API + '/api/tags/?page_size=100')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var results = data.results || [];
      for (var i = 0; i < results.length; i++) {
        paperlessTags[results[i].id] = results[i].name;
      }
      paperlessTagsLoaded = true;
      callback();
    })
    .catch(function(e) {
      console.error('Erro ao carregar tags Paperless:', e);
      callback();
    });
}

function abrirDrawer() {
  document.getElementById('paperlessDrawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('active');
}

function fecharDrawer() {
  document.getElementById('paperlessDrawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('active');
}

function buscarDocumentosPaperless(cpf) {
  if (!cpf) return;

  // Cache hit
  if (cacheDocsPaperless[cpf]) {
    abrirDrawer();
    renderizarDocumentos(cacheDocsPaperless[cpf]);
    atualizarResumoInline(cacheDocsPaperless[cpf]);
    return;
  }

  // Mostrar loading e abrir drawer
  var body = document.getElementById('drawerBody');
  body.innerHTML =
    '<div class="doc-loading">' +
    '<div class="spinner"></div>' +
    'Consultando Paperless...' +
    '</div>';
  abrirDrawer();

  carregarTagsPaperless(function() {
    var query = encodeURIComponent('["CPF","exact","' + cpf + '"]');
    var url = PAPERLESS_API + '/api/documents/?custom_field_query=' + query + '&page_size=50';
    fetch(url)
      .then(function(r) {
        if (!r.ok) throw new Error('Erro HTTP ' + r.status);
        return r.json();
      })
      .then(function(data) {
        var docs = data.results || [];
        cacheDocsPaperless[cpf] = docs;
        renderizarDocumentos(docs);
        atualizarResumoInline(docs);
      })
      .catch(function(e) {
        console.error('Erro ao buscar documentos Paperless:', e);
        body.innerHTML =
          '<div class="doc-empty">' +
          '<i class="ph ph-warning"></i>' +
          '<strong>Erro:</strong> ' + (e.message || e) +
          '</div>';
      });
  });
}

function renderizarDocumentos(docs) {
  var body = document.getElementById('drawerBody');
  body.innerHTML = '';

  if (docs.length === 0) {
    body.innerHTML =
      '<div class="doc-empty">' +
      '<i class="ph ph-file-dashed"></i>' +
      'Nenhum documento encontrado para este CPF.' +
      '</div>';
    return;
  }

  for (var i = 0; i < docs.length; i++) {
    var doc = docs[i];
    var card = document.createElement('div');
    card.className = 'doc-card';

    // Thumbnail
    var thumb = document.createElement('img');
    thumb.className = 'doc-thumb';
    thumb.src = PAPERLESS_API + '/api/documents/' + doc.id + '/thumb/';
    thumb.alt = doc.title || 'Documento';
    thumb.title = 'Clique para abrir o PDF';
    (function(docId) {
      thumb.addEventListener('click', function() {
        window.open(PAPERLESS_API + '/api/documents/' + docId + '/preview/', '_blank');
      });
    })(doc.id);
    card.appendChild(thumb);

    // Info
    var info = document.createElement('div');
    info.className = 'doc-info';

    var title = document.createElement('div');
    title.className = 'doc-title';
    title.textContent = doc.title || 'Sem t\u00edtulo';
    info.appendChild(title);

    // Tags
    var tagsContainer = document.createElement('div');
    tagsContainer.className = 'doc-tags';
    var tagIds = doc.tags || [];
    for (var t = 0; t < tagIds.length; t++) {
      var tagName = paperlessTags[tagIds[t]] || ('Tag ' + tagIds[t]);
      var badge = document.createElement('span');
      badge.className = 'doc-tag';
      badge.textContent = tagName;
      tagsContainer.appendChild(badge);
    }
    info.appendChild(tagsContainer);

    card.appendChild(info);
    body.appendChild(card);
  }
}

function normalizarNomeTag(nome) {
  return String(nome || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '');
}

function atualizarResumoInline(docs) {
  var resumo = document.getElementById('docsResumo');
  if (!resumo) return;

  // Montar set de tags encontradas
  var tagsEncontradas = {};
  for (var i = 0; i < docs.length; i++) {
    var tagIds = docs[i].tags || [];
    for (var t = 0; t < tagIds.length; t++) {
      var nome = paperlessTags[tagIds[t]];
      if (nome) tagsEncontradas[normalizarNomeTag(nome)] = true;
    }
  }

  // Montar checklist
  var partes = [];
  for (var j = 0; j < PAPERLESS_TAGS_DOCS.length; j++) {
    var tag = PAPERLESS_TAGS_DOCS[j];
    if (tagsEncontradas[normalizarNomeTag(tag)]) {
      partes.push('<span class="doc-ok">' + tag + ' \u2713</span>');
    } else {
      partes.push('<span class="doc-miss">' + tag + ' \u2717</span>');
    }
  }
  resumo.innerHTML = partes.join(' \u00b7 ');
  resumo.classList.add('clickable');
  resumo.onclick = function() {
    var cpf = document.getElementById('cpfInput').value.trim();
    if (cpf) buscarDocumentosPaperless(cpf);
  };
}

function configurarDrawer() {
  document.getElementById('btnCloseDrawer').addEventListener('click', fecharDrawer);
  document.getElementById('drawerOverlay').addEventListener('click', fecharDrawer);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
      var drawer = document.getElementById('paperlessDrawer');
      if (drawer && drawer.classList.contains('open')) {
        fecharDrawer();
      }
    }
  });

  document.getElementById('btnConsultarDocs').addEventListener('click', function() {
    var cpf = document.getElementById('cpfInput').value.trim();
    if (cpf) buscarDocumentosPaperless(cpf);
  });
}

// ═══════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  popularEstadoCivil();
  popularRegraPatrimonial();
  document.getElementById('estadoCivilSelect').addEventListener('change', atualizarVisibilidadeRegraPatrimonial);
  configurarBusca();
  configurarConjuge();
  configurarMascaras();
  configurarMarkdownOutros();

  document.getElementById('btnNovoCliente').addEventListener('click', novoCliente);
  document.getElementById('btnSalvar').addEventListener('click', salvarCliente);
  document.getElementById('btnLimpar').addEventListener('click', limparFormulario);
  configurarDrawer();

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
