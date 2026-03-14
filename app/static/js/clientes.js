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
  logs:             'field_7395',
  empresarioTF:     'field_7429',
  advogadoTF:       'field_7430',
  corretorTF:       'field_7431',
  creci:            'field_7432',
  uniaoEstavelTF:     'field_7450',
  regraPatrimonialUE: 'field_7451',
  companheiro:        'field_7452',
  falecidoTF:         'field_7453',
  dataFalecimento:    'field_7454'
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
  alerta:           'Alerta',
  empresarioTF:     'Empresário Individual',
  advogadoTF:       'Advogado',
  corretorTF:       'Corretor',
  creci:            'CRECI',
  uniaoEstavelTF:     'União Estável',
  regraPatrimonialUE: 'Regra Patrimonial (UE)',
  companheiro:        'Companheiro(a)',
  falecidoTF:         'Falecido',
  dataFalecimento:    'Data de Falecimento'
};

var ESTADO_CIVIL_OPTS = [
  { id: 3107, label: 'Solteiro' },
  { id: 3092, label: 'Casado' },
  { id: 3097, label: 'Separado' },
  { id: 3098, label: 'Divorciado' },
  { id: 3099, label: 'Viúvo' }
];

var REGRA_PATRIMONIAL_OPTS = [
  { id: 3102, label: 'Comunhão parcial' },
  { id: 3103, label: 'Comunhão universal' },
  { id: 3104, label: 'Separação convencional' },
  { id: 3105, label: 'Separação obrigatória' },
  { id: 3106, label: 'Participação final nos aquestos' }
];

var REGRA_PATRIMONIAL_UE_OPTS = [
  { id: 3121, label: 'Comunhão parcial' },
  { id: 3122, label: 'Comunhão universal' },
  { id: 3123, label: 'Separação convencional' },
  { id: 3124, label: 'Separação obrigatória' },
  { id: 3125, label: 'Participação final nos aquestos' }
];

// ── Estado global ──
var clienteAtual  = null;   // linha do Baserow carregada no formulário
var modoNovo      = false;  // true = criando novo cliente
var clienteCarregadoPorBusca = false; // true quando veio de busca positiva
var conjugeId     = null;   // ID do cônjuge selecionado no autocomplete
var companheiroId = null;   // ID do companheiro(a) selecionado no autocomplete
var buscaTimer    = null;   // debounce da busca por nome
var conjugeTimer  = null;   // debounce do autocomplete de cônjuge
var companheiroTimer = null; // debounce do autocomplete de companheiro
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

function popularRegraPatrimonialUE() {
  var select = document.getElementById('regraPatrimonialUESelect');
  for (var i = 0; i < REGRA_PATRIMONIAL_UE_OPTS.length; i++) {
    var opt = document.createElement('option');
    opt.value = REGRA_PATRIMONIAL_UE_OPTS[i].id;
    opt.textContent = REGRA_PATRIMONIAL_UE_OPTS[i].label;
    select.appendChild(opt);
  }
}

function atualizarVisibilidadeEstadoCivil() {
  var conjugeAviso = document.getElementById('conjugeAviso');
  if (conjugeAviso) { conjugeAviso.style.display = 'none'; }
  var companheiroAviso = document.getElementById('companheiroAviso');
  if (companheiroAviso) { companheiroAviso.style.display = 'none'; }

  var ecVal = document.getElementById('estadoCivilSelect').value;

  var regraPatrimonialGroup  = document.getElementById('regraPatrimonialGroup');
  var conjugeGroup           = document.getElementById('conjugeGroup');
  var uniaoEstavelGroup      = document.getElementById('uniaoEstavelGroup');
  var uniaoEstavelCampos     = document.getElementById('uniaoEstavelCampos');
  var switchUE               = document.getElementById('switchUniaoEstavel');

  if (ecVal === '3092') {
    // CASADO: mostrar regra patrimonial + cônjuge; ocultar UE
    regraPatrimonialGroup.style.display = '';
    conjugeGroup.style.display = '';
    uniaoEstavelGroup.style.display = 'none';
    // Limpar campos de UE
    switchUE.checked = false;
    uniaoEstavelCampos.style.display = 'none';
    document.getElementById('regraPatrimonialUESelect').value = '';
    document.getElementById('companheiroInput').value = '';
    companheiroId = null;

  } else if (ecVal === '3097' || ecVal === '3098' || ecVal === '3099' || ecVal === '3107') {
    // SEPARADO / DIVORCIADO / VIÚVO / SOLTEIRO:
    // ocultar regra patrimonial (casado) + cônjuge; mostrar switch UE
    regraPatrimonialGroup.style.display = 'none';
    document.getElementById('regraPatrimonialSelect').value = '';
    conjugeGroup.style.display = 'none';
    document.getElementById('conjugeInput').value = '';
    conjugeId = null;
    // Exibir bloco UE
    uniaoEstavelGroup.style.display = '';
    // Campos dependentes: seguem o estado do switch
    if (switchUE.checked) {
      uniaoEstavelCampos.style.display = '';
    } else {
      uniaoEstavelCampos.style.display = 'none';
      document.getElementById('regraPatrimonialUESelect').value = '';
      document.getElementById('companheiroInput').value = '';
      companheiroId = null;
    }

  } else {
    // NENHUM SELECIONADO (ou valor vazio): ocultar tudo e limpar
    regraPatrimonialGroup.style.display = 'none';
    document.getElementById('regraPatrimonialSelect').value = '';
    conjugeGroup.style.display = 'none';
    document.getElementById('conjugeInput').value = '';
    conjugeId = null;
    uniaoEstavelGroup.style.display = 'none';
    switchUE.checked = false;
    uniaoEstavelCampos.style.display = 'none';
    document.getElementById('regraPatrimonialUESelect').value = '';
    document.getElementById('companheiroInput').value = '';
    companheiroId = null;
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
              // Preparar estado para novo cadastro
              clienteAtual = null;
              modoNovo = true;
              clienteCarregadoPorBusca = false;
              snapshotCliente = null;
              conjugeId = null;
              limparCamposFormulario();
              // Preencher o documento buscado
              if (tipo === 'cpf') {
                document.getElementById('cpfInput').value = valorFormatado;
              } else {
                document.getElementById('cnpjInput').value = valorFormatado;
              }
              atualizarVisibilidadeDocumentos();
              document.getElementById('cpfInput').readOnly = false;
              document.getElementById('cnpjInput').readOnly = false;
              // Alerta: exibir para master/admin, ocultar para escrevente
              var podeEditarAlerta = window.CURRENT_USER &&
                (window.CURRENT_USER.perfil === 'master' || window.CURRENT_USER.perfil === 'administrador');
              if (podeEditarAlerta) {
                document.getElementById('alertaCard').style.display = '';
                document.getElementById('alertaEditavel').style.display = '';
                document.getElementById('alertaReadonly').style.display = 'none';
              }
              mostrarFormulario();
              mostrarMsg('buscaMsg', 'warning',
                'Nenhum cliente encontrado com este ' + (tipo === 'cpf' ? 'CPF' : 'CNPJ') + '. Preencha os dados para cadastrar.');
              document.getElementById('nomeInput').focus();
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
    encodeURIComponent(termo) +
    '&filter__' + FIELDS.cpf + '__not_empty' +
    '&size=10';
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
  mostrarMsg('buscaMsg', 'success', 'Cliente já cadastrado. Seguem os dados abaixo.');
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
  esconderMsg('buscaMsg');
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
  snap.empresarioTF = cli[FIELDS.empresarioTF] ? true : false;
  snap.advogadoTF   = cli[FIELDS.advogadoTF]   ? true : false;
  snap.corretorTF   = cli[FIELDS.corretorTF]   ? true : false;
  snap.creci        = cli[FIELDS.creci] || '';
  var ecObj = cli[FIELDS.estadoCivil];
  snap.estadoCivil = (ecObj && ecObj.value) ? ecObj.value : '';
  var rpObj = cli[FIELDS.regraPatrimonial];
  snap.regraPatrimonial = (rpObj && rpObj.value) ? rpObj.value : '';
  var conjArr = cli[FIELDS.conjuge];
  snap.conjuge = (conjArr && conjArr.length > 0 && conjArr[0].value) ? conjArr[0].value : '';
  snap.uniaoEstavelTF = cli[FIELDS.uniaoEstavelTF] ? true : false;
  var rpUEObj = cli[FIELDS.regraPatrimonialUE];
  snap.regraPatrimonialUE = (rpUEObj && rpUEObj.value) ? rpUEObj.value : '';
  var compArr = cli[FIELDS.companheiro];
  snap.companheiro = (compArr && compArr.length > 0 && compArr[0].value) ? compArr[0].value : '';
  snap.falecidoTF = cli[FIELDS.falecidoTF] ? true : false;
  snap.dataFalecimento = cli[FIELDS.dataFalecimento] || '';

  // IDs auxiliares para sincronização bidirecional (não auditados)
  snap._conjugeId = (conjArr && conjArr.length > 0) ? conjArr[0].id : null;
  snap._companheiroId = (compArr && compArr.length > 0) ? compArr[0].id : null;
  snap._estadoCivilId = (ecObj && ecObj.id) ? String(ecObj.id) : '';
  snap._uniaoEstavelTF = cli[FIELDS.uniaoEstavelTF] ? true : false;

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
  estado.empresarioTF = document.getElementById('switchEmpresario').checked;
  estado.advogadoTF   = document.getElementById('switchAdvogado').checked;
  estado.corretorTF   = document.getElementById('switchCorretor').checked;
  estado.creci        = document.getElementById('creciInput').value.trim();

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

  estado.uniaoEstavelTF = document.getElementById('switchUniaoEstavel').checked;

  var rpUEVal = document.getElementById('regraPatrimonialUESelect').value;
  estado.regraPatrimonialUE = '';
  if (rpUEVal) {
    for (var k = 0; k < REGRA_PATRIMONIAL_UE_OPTS.length; k++) {
      if (String(REGRA_PATRIMONIAL_UE_OPTS[k].id) === String(rpUEVal)) {
        estado.regraPatrimonialUE = REGRA_PATRIMONIAL_UE_OPTS[k].label;
        break;
      }
    }
  }

  estado.companheiro = companheiroId ? document.getElementById('companheiroInput').value.trim() : '';
  estado.falecidoTF = document.getElementById('switchFalecido').checked;
  estado.dataFalecimento = document.getElementById('dataFalecimentoInput').value || '';

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
  document.getElementById('rgInput').value        = cli[FIELDS.rg]        || '';
  document.getElementById('nascimentoInput').value = cli[FIELDS.nascimento] || '';
  document.getElementById('profissaoInput').value = cli[FIELDS.profissao] || '';
  document.getElementById('telefoneInput').value  = cli[FIELDS.telefone]  || '';
  document.getElementById('emailInput').value     = cli[FIELDS.email]     || '';
  document.getElementById('enderecoTextarea').value = cli[FIELDS.endereco] || '';

  // Qualificações Especiais — switches
  var empresario = cli[FIELDS.empresarioTF] ? true : false;
  document.getElementById('switchEmpresario').checked = empresario;
  document.getElementById('cnpjEmpresarioGroup').style.display = empresario ? '' : 'none';
  document.getElementById('cnpjInput').value = cli[FIELDS.cnpj] || '';

  var advogado = cli[FIELDS.advogadoTF] ? true : false;
  document.getElementById('switchAdvogado').checked = advogado;
  document.getElementById('oabGroup').style.display = advogado ? '' : 'none';
  document.getElementById('oabInput').value = cli[FIELDS.oab] || '';

  var corretor = cli[FIELDS.corretorTF] ? true : false;
  document.getElementById('switchCorretor').checked = corretor;
  document.getElementById('creciGroup').style.display = corretor ? '' : 'none';
  document.getElementById('creciInput').value = cli[FIELDS.creci] || '';

  var falecido = cli[FIELDS.falecidoTF] ? true : false;
  document.getElementById('switchFalecido').checked = falecido;
  document.getElementById('falecidoGroup').style.display = falecido ? '' : 'none';
  document.getElementById('dataFalecimentoInput').value = cli[FIELDS.dataFalecimento] || '';

  var outrosVal = cli[FIELDS.outros] || '';
  document.getElementById('outrosTextarea').value = outrosVal;
  atualizarPreviewOutros();

  // Estado civil — Baserow retorna { id: 3092, value: "Casado..." }
  var ecObj = cli[FIELDS.estadoCivil];
  document.getElementById('estadoCivilSelect').value = (ecObj && ecObj.id) ? String(ecObj.id) : '';

  // Regra patrimonial
  var rpObj = cli[FIELDS.regraPatrimonial];
  document.getElementById('regraPatrimonialSelect').value = (rpObj && rpObj.id) ? rpObj.id : '';

  // Cônjuge — link_row retorna [{ id: X, value: "Nome" }]
  var conjArr = cli[FIELDS.conjuge];
  if (conjArr && conjArr.length > 0) {
    conjugeId = conjArr[0].id;
    document.getElementById('conjugeInput').value = conjArr[0].value || '';
  } else {
    conjugeId = null;
    document.getElementById('conjugeInput').value = '';
  }

  // União Estável
  var ueVal = cli[FIELDS.uniaoEstavelTF] ? true : false;
  document.getElementById('switchUniaoEstavel').checked = ueVal;

  // Regra patrimonial UE
  var rpUEObj = cli[FIELDS.regraPatrimonialUE];
  document.getElementById('regraPatrimonialUESelect').value = (rpUEObj && rpUEObj.id) ? rpUEObj.id : '';

  // Companheiro — link_row retorna [{ id: X, value: "Nome" }]
  var compArr = cli[FIELDS.companheiro];
  if (compArr && compArr.length > 0) {
    companheiroId = compArr[0].id;
    document.getElementById('companheiroInput').value = compArr[0].value || '';
  } else {
    companheiroId = null;
    document.getElementById('companheiroInput').value = '';
  }

  atualizarVisibilidadeEstadoCivil();

  // CPF/CNPJ readonly ao editar cliente existente
  var editando = !!cli.id;
  document.getElementById('cpfInput').readOnly = editando;
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
  document.getElementById('switchEmpresario').checked = false;
  document.getElementById('cnpjEmpresarioGroup').style.display = 'none';
  document.getElementById('switchAdvogado').checked = false;
  document.getElementById('oabGroup').style.display = 'none';
  document.getElementById('switchCorretor').checked = false;
  document.getElementById('creciGroup').style.display = 'none';
  document.getElementById('creciInput').value = '';
  document.getElementById('switchFalecido').checked = false;
  document.getElementById('falecidoGroup').style.display = 'none';
  document.getElementById('dataFalecimentoInput').value = '';
  document.getElementById('outrosTextarea').value   = '';
  atualizarPreviewOutros();
  document.getElementById('estadoCivilSelect').value = '';
  document.getElementById('regraPatrimonialSelect').value = '';
  document.getElementById('conjugeInput').value      = '';
  conjugeId = null;
  document.getElementById('switchUniaoEstavel').checked = false;
  document.getElementById('uniaoEstavelGroup').style.display = 'none';
  document.getElementById('uniaoEstavelCampos').style.display = 'none';
  document.getElementById('regraPatrimonialUESelect').value = '';
  document.getElementById('companheiroInput').value = '';
  companheiroId = null;
  var conjugeAvisoEl = document.getElementById('conjugeAviso');
  if (conjugeAvisoEl) { conjugeAvisoEl.style.display = 'none'; conjugeAvisoEl.innerHTML = ''; }
  var companheiroAvisoEl = document.getElementById('companheiroAviso');
  if (companheiroAvisoEl) { companheiroAvisoEl.style.display = 'none'; companheiroAvisoEl.innerHTML = ''; }
  atualizarVisibilidadeEstadoCivil();
  document.getElementById('protocolosList').innerHTML =
    '<div class="protocols-empty">Nenhum protocolo vinculado.</div>';
  document.getElementById('alertaTextarea').value = '';
  document.getElementById('alertaReadonly').textContent = '';
  document.getElementById('alertaCard').style.display = 'none';
  document.getElementById('alertaCard').classList.remove('alerta-ativo');
  snapshotCliente = null;
  document.getElementById('logContent').textContent = '';
  document.getElementById('logCard').style.display = 'none';
  esconderMsg('buscaMsg');
}

function limparFormulario() {
  clienteAtual = null;
  modoNovo = false;
  clienteCarregadoPorBusca = false;
  conjugeId = null;
  limparCamposFormulario();
  document.getElementById('buscaInput').value = '';
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
  // Limpar aviso anterior
  var avisoEl = document.getElementById('conjugeAviso');
  avisoEl.style.display = 'none';
  avisoEl.innerHTML = '';
  avisoEl.className = 'msg-inline';

  // Verificar se a pessoa selecionada é o próprio cliente sendo editado
  if (clienteAtual && cli.id === clienteAtual.id) {
    avisoEl.className = 'msg-inline aviso-conflito';
    avisoEl.textContent = 'Não é possível vincular o cliente a si mesmo.';
    avisoEl.style.display = '';
    return;
  }

  // Verificar falecido
  if (cli[FIELDS.falecidoTF]) {
    avisoEl.className = 'msg-inline aviso-falecido';
    avisoEl.textContent = 'Atenção: ' + (cli[FIELDS.nome] || 'esta pessoa') + ' está indicado(a) como falecido(a).';
    avisoEl.style.display = '';
  }

  // Verificar conflito de cônjuge existente
  var conjExistente = cli[FIELDS.conjuge];
  if (conjExistente && conjExistente.length > 0) {
    var conjAtualId = conjExistente[0].id;
    var conjAtualNome = conjExistente[0].value || '';
    // Se o cônjuge existente NÃO é o cliente atual, há conflito
    if (!clienteAtual || conjAtualId !== clienteAtual.id) {
      var confirmar = window.confirm(
        (cli[FIELDS.nome] || 'Esta pessoa') + ' já possui cônjuge cadastrado: ' +
        conjAtualNome + '.\nDeseja sobrescrever o vínculo?'
      );
      if (!confirmar) {
        document.getElementById('conjugeInput').value = '';
        conjugeId = null;
        fecharAutocompleteConjuge();
        return;
      }
    }
  }

  // Seleção confirmada
  conjugeId = cli.id;
  document.getElementById('conjugeInput').value = cli[FIELDS.nome] || '';
  fecharAutocompleteConjuge();
}

// ═══════════════════════════════════════════════════════
// COMPANHEIRO(A) — autocomplete
// ═══════════════════════════════════════════════════════
function configurarCompanheiro() {
  var input = document.getElementById('companheiroInput');
  input.addEventListener('input', function() {
    var termo = input.value.trim();
    if (!termo) {
      companheiroId = null;
      fecharAutocompleteCompanheiro();
      return;
    }
    if (companheiroId) { companheiroId = null; }
    if (companheiroTimer) clearTimeout(companheiroTimer);
    if (termo.length < 3) { fecharAutocompleteCompanheiro(); return; }
    companheiroTimer = setTimeout(function() { buscarCompanheiro(termo); }, 300);
  });
}

function buscarCompanheiro(termo) {
  var url = API_BASE + '/database/rows/table/' + TABLE_CLIENTES +
    '/?user_field_names=false&filter__' + FIELDS.nome + '__contains=' +
    encodeURIComponent(termo) + '&size=8';
  fetch(url, { headers: apiHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) { mostrarAutocompleteCompanheiro(data.results || []); })
    .catch(function(e) { console.error('Erro na busca de companheiro:', e); });
}

function mostrarAutocompleteCompanheiro(resultados) {
  var lista = document.getElementById('companheiroAutoList');
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
      item.addEventListener('click', function() { selecionarCompanheiro(cli); });
      lista.appendChild(item);
    })(resultados[i]);
  }
  lista.classList.add('open');
}

function fecharAutocompleteCompanheiro() {
  document.getElementById('companheiroAutoList').classList.remove('open');
}

function selecionarCompanheiro(cli) {
  // Limpar aviso anterior
  var avisoEl = document.getElementById('companheiroAviso');
  avisoEl.style.display = 'none';
  avisoEl.innerHTML = '';
  avisoEl.className = 'msg-inline';

  // Verificar auto-referência
  if (clienteAtual && cli.id === clienteAtual.id) {
    avisoEl.className = 'msg-inline aviso-conflito';
    avisoEl.textContent = 'Não é possível vincular o cliente a si mesmo.';
    avisoEl.style.display = '';
    return;
  }

  // Verificar falecido
  if (cli[FIELDS.falecidoTF]) {
    avisoEl.className = 'msg-inline aviso-falecido';
    avisoEl.textContent = 'Atenção: ' + (cli[FIELDS.nome] || 'esta pessoa') + ' está indicado(a) como falecido(a).';
    avisoEl.style.display = '';
  }

  // Verificar conflito de companheiro existente
  var compExistente = cli[FIELDS.companheiro];
  if (compExistente && compExistente.length > 0) {
    var compAtualId = compExistente[0].id;
    var compAtualNome = compExistente[0].value || '';
    if (!clienteAtual || compAtualId !== clienteAtual.id) {
      var confirmar = window.confirm(
        (cli[FIELDS.nome] || 'Esta pessoa') + ' já possui companheiro(a) cadastrado(a): ' +
        compAtualNome + '.\nDeseja sobrescrever o vínculo?'
      );
      if (!confirmar) {
        document.getElementById('companheiroInput').value = '';
        companheiroId = null;
        fecharAutocompleteCompanheiro();
        return;
      }
    }
  }

  // Seleção confirmada
  companheiroId = cli.id;
  document.getElementById('companheiroInput').value = cli[FIELDS.nome] || '';
  fecharAutocompleteCompanheiro();
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

function validarDuplicataOnBlur(campo) {
  if (!modoNovo) return;
  var inputId = campo === 'cpf' ? 'cpfInput' : 'cnpjInput';
  var valorFormatado = document.getElementById(inputId).value.trim();
  var valorLimpo = valorFormatado.replace(/\D/g, '');
  if (!valorLimpo) return;
  if (campo === 'cpf' && valorLimpo.length !== 11) return;
  if (campo === 'cnpj' && valorLimpo.length !== 14) return;
  if (campo === 'cpf' && !validarCPF(valorLimpo)) return;
  if (campo === 'cnpj' && !validarCNPJ(valorLimpo)) return;

  var fieldId = campo === 'cpf' ? FIELDS.cpf : FIELDS.cnpj;
  var url = API_BASE + '/database/rows/table/' + TABLE_CLIENTES +
    '/?user_field_names=false&filter__' + fieldId + '__equal=' +
    encodeURIComponent(valorFormatado) + '&size=1';

  fetch(url, { headers: apiHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.results && d.results.length > 0) {
        alert('Cliente já consta na base de dados. Utilize a busca para localizar o cadastro.');
        window.location.href = '/clientes';
      }
    })
    .catch(function(e) {
      console.error('Erro ao verificar duplicata:', e);
    });
}

function verificarCnpjCruzado(cnpj, callback) {
  var url = API_BASE + '/database/rows/table/' + TABLE_CLIENTES +
    '/?user_field_names=false' +
    '&filter__' + FIELDS.cnpj + '__equal=' + encodeURIComponent(cnpj) +
    '&filter__' + FIELDS.cpf + '__empty' +
    '&size=1';
  fetch(url, { headers: apiHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var encontrado = data.results && data.results.length > 0 ? data.results[0] : null;
      callback(encontrado);
    })
    .catch(function() { callback(null); });
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

  // União Estável
  payload[FIELDS.uniaoEstavelTF] = document.getElementById('switchUniaoEstavel').checked;

  var rpUEVal = document.getElementById('regraPatrimonialUESelect').value;
  payload[FIELDS.regraPatrimonialUE] = rpUEVal ? parseInt(rpUEVal, 10) : null;

  payload[FIELDS.companheiro] = companheiroId ? [companheiroId] : [];

  // Qualificações Especiais
  var isEmpresario = document.getElementById('switchEmpresario').checked;
  payload[FIELDS.empresarioTF] = isEmpresario;
  payload[FIELDS.advogadoTF]   = document.getElementById('switchAdvogado').checked;
  payload[FIELDS.corretorTF]   = document.getElementById('switchCorretor').checked;
  payload[FIELDS.creci]        = document.getElementById('creciInput').value.trim() || null;

  payload[FIELDS.falecidoTF] = document.getElementById('switchFalecido').checked;
  var dataFal = document.getElementById('dataFalecimentoInput').value;
  payload[FIELDS.dataFalecimento] = dataFal || null;

  if (incluirDocumentos) {
    var cpfFormatado  = document.getElementById('cpfInput').value.trim();
    if (cpfFormatado)  payload[FIELDS.cpf]  = cpfFormatado;
    if (isEmpresario) {
      var cnpjFormatado = document.getElementById('cnpjInput').value.trim();
      if (cnpjFormatado) payload[FIELDS.cnpj] = cnpjFormatado;
    } else {
      payload[FIELDS.cnpj] = null;
    }
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
  var cpfLimpo  = cpfRaw.replace(/\D/g, '');
  var isEmpresario = document.getElementById('switchEmpresario').checked;
  var cnpjRaw   = isEmpresario ? document.getElementById('cnpjInput').value.trim() : '';
  var cnpjLimpo = cnpjRaw.replace(/\D/g, '');

  if (!nome) {
    return mostrarMsg('formMsg', 'error', 'O nome do cliente é obrigatório.');
  }
  if (modoNovo && !cpfLimpo) {
    return mostrarMsg('formMsg', 'error', 'Informe o CPF para cadastrar um novo cliente.');
  }
  if (cpfLimpo && !validarCPF(cpfLimpo)) {
    return mostrarMsg('formMsg', 'error', 'CPF inválido. Verifique os dígitos verificadores.');
  }
  if (cnpjLimpo && !validarCNPJ(cnpjLimpo)) {
    return mostrarMsg('formMsg', 'error', 'CNPJ inválido. Verifique os dígitos verificadores.');
  }

  // Validação de transição de estado civil: não é juridicamente possível voltar a Solteiro
  var ecAtual = document.getElementById('estadoCivilSelect').value;
  if (ecAtual === '3107' && snapshotCliente && snapshotCliente._estadoCivilId &&
      snapshotCliente._estadoCivilId !== '3107' && snapshotCliente._estadoCivilId !== '') {
    mostrarMsg('formMsg', 'warning',
      'Atenção: juridicamente não é possível retornar ao estado civil de Solteiro após outro estado civil ter sido registrado. O cadastro será salvo, mas verifique se a alteração está correta.');
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
      // Sincronização bidirecional (no POST, snapshot é null — usa estado atual)
      sincronizarParceiros(null, data.id, document.getElementById('nomeInput').value.trim());
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
  var snapshotParaSync = snapshotCliente; // Preservar referência antes de atualizar

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
      // Sincronização bidirecional
      sincronizarParceiros(snapshotParaSync, clienteAtual.id, document.getElementById('nomeInput').value.trim());
    })
    .catch(function(e) {
      esconderOverlay();
      btnSalvar.disabled = false;
      mostrarMsg('formMsg', 'error', e.message || 'Erro ao salvar cliente.');
      console.error(e);
    });
}

// ═══════════════════════════════════════════════════════
// SINCRONIZAÇÃO BIDIRECIONAL DE PARCEIROS
// ═══════════════════════════════════════════════════════

/**
 * Faz PATCH bidirecional no parceiro.
 * @param {number} parceiroId — row ID do parceiro na Table 754
 * @param {object} camposParaPatch — ex: { field_7343: 3098, field_7344: [], field_7348: null }
 * @param {object} labelsParaLog — ex: { 'field_7343': 'Estado Civil', 'field_7344': 'Cônjuge' }
 *   Mapa dos fields que estão sendo alterados para seus rótulos legíveis.
 *   Usado para gerar as linhas de log no registro do parceiro.
 * @returns {Promise} — resolve com { ok: true } ou { ok: false, erro: string }
 */
function patchParceiro(parceiroId, camposParaPatch, labelsParaLog) {
  var urlGet = API_BASE + '/database/rows/table/' + TABLE_CLIENTES + '/' +
    parceiroId + '/?user_field_names=false';

  return fetch(urlGet, { headers: apiHeaders() })
    .then(function(r) {
      if (!r.ok) throw new Error('Erro ao buscar parceiro.');
      return r.json();
    })
    .then(function(parceiro) {
      // Gerar linhas de log para o parceiro
      var agora = new Date();
      var dia = ('0' + agora.getDate()).slice(-2);
      var mes = ('0' + (agora.getMonth() + 1)).slice(-2);
      var ano = agora.getFullYear();
      var hora = ('0' + agora.getHours()).slice(-2);
      var min = ('0' + agora.getMinutes()).slice(-2);
      var dataHora = dia + '/' + mes + '/' + ano + ' ' + hora + ':' + min;
      var nomeUsuario = (window.CURRENT_USER && window.CURRENT_USER.nome)
        ? window.CURRENT_USER.nome : 'Usuário';

      var linhasLog = [];
      var chaves = Object.keys(camposParaPatch);
      for (var i = 0; i < chaves.length; i++) {
        var fieldKey = chaves[i];
        var labelCampo = labelsParaLog[fieldKey] || fieldKey;

        // Determinar valor anterior legível
        var valorAnteriorRaw = parceiro[fieldKey];
        var valorAnterior = '';
        if (valorAnteriorRaw === null || valorAnteriorRaw === undefined || valorAnteriorRaw === '') {
          valorAnterior = '(vazio)';
        } else if (typeof valorAnteriorRaw === 'object' && valorAnteriorRaw !== null) {
          // single_select → { id, value }
          if (valorAnteriorRaw.value) {
            valorAnterior = valorAnteriorRaw.value;
          }
          // link_row → [{ id, value }]
          else if (Array.isArray(valorAnteriorRaw) && valorAnteriorRaw.length > 0) {
            valorAnterior = valorAnteriorRaw[0].value || String(valorAnteriorRaw[0].id);
          } else if (Array.isArray(valorAnteriorRaw) && valorAnteriorRaw.length === 0) {
            valorAnterior = '(vazio)';
          } else {
            valorAnterior = JSON.stringify(valorAnteriorRaw);
          }
        } else if (typeof valorAnteriorRaw === 'boolean') {
          valorAnterior = valorAnteriorRaw ? 'Sim' : 'Não';
        } else {
          valorAnterior = String(valorAnteriorRaw);
        }

        linhasLog.push(nomeUsuario + '. ' + dataHora +
          ': O campo ' + labelCampo + ' foi alterado (sinc. automática). Valor anterior: ' + valorAnterior + '.');
      }

      // Montar payload
      var payload = {};
      for (var j = 0; j < chaves.length; j++) {
        payload[chaves[j]] = camposParaPatch[chaves[j]];
      }

      // Adicionar log
      if (linhasLog.length > 0) {
        var logsExistentes = parceiro[FIELDS.logs] || '';
        var novasLinhas = linhasLog.join('\n');
        payload[FIELDS.logs] = logsExistentes
          ? (novasLinhas + '\n' + logsExistentes)
          : novasLinhas;
      }

      // PATCH
      var urlPatch = API_BASE + '/database/rows/table/' + TABLE_CLIENTES + '/' +
        parceiroId + '/?user_field_names=false';
      return fetch(urlPatch, {
        method: 'PATCH',
        headers: apiHeaders(),
        body: JSON.stringify(payload)
      });
    })
    .then(function(r) {
      if (!r.ok) throw new Error('Erro no PATCH do parceiro.');
      return { ok: true };
    })
    .catch(function(e) {
      console.error('Falha na sincronização bidirecional:', e);
      return { ok: false, erro: e.message };
    });
}

/**
 * Após o save do cliente principal, verifica o que mudou e sincroniza
 * o cadastro do(a) cônjuge/companheiro(a) automaticamente.
 * @param {object|null} snapshot — snapshot capturado antes da edição
 * @param {number} clienteId — ID do cliente que acabou de ser salvo
 * @param {string} clienteNome — Nome do cliente salvo (para logs no parceiro)
 */
function sincronizarParceiros(snapshot, clienteId, clienteNome) {
  var ecAtual = document.getElementById('estadoCivilSelect').value;
  var ecAnterior = snapshot ? snapshot._estadoCivilId : '';

  var conjugeIdAtual = conjugeId;
  var conjugeIdAnterior = snapshot ? snapshot._conjugeId : null;

  var ueAtual = document.getElementById('switchUniaoEstavel').checked;
  var ueAnterior = snapshot ? snapshot._uniaoEstavelTF : false;

  var companheiroIdAtual = companheiroId;
  var companheiroIdAnterior = snapshot ? snapshot._companheiroId : null;

  var rpVal = document.getElementById('regraPatrimonialSelect').value;
  var rpUEVal = document.getElementById('regraPatrimonialUESelect').value;

  var promessas = [];

  // ────────────────────────────────────────
  // CASO 1: Novo vínculo de cônjuge (Casado)
  // ────────────────────────────────────────
  // Condição: há um conjugeId atual E (é novo OU mudou de parceiro)
  if (conjugeIdAtual && conjugeIdAtual !== conjugeIdAnterior && ecAtual === '3092') {
    var camposCasamento = {};
    camposCasamento[FIELDS.estadoCivil] = 3092; // Casado
    camposCasamento[FIELDS.conjuge] = [clienteId];
    camposCasamento[FIELDS.regraPatrimonial] = rpVal ? parseInt(rpVal, 10) : null;

    var labelsCasamento = {};
    labelsCasamento[FIELDS.estadoCivil] = 'Estado Civil';
    labelsCasamento[FIELDS.conjuge] = 'Cônjuge';
    labelsCasamento[FIELDS.regraPatrimonial] = 'Regra Patrimonial';

    promessas.push(patchParceiro(conjugeIdAtual, camposCasamento, labelsCasamento));
  }

  // ────────────────────────────────────────
  // CASO 2: Dissolução de casamento (Casado → Divorciado ou Separado)
  // ────────────────────────────────────────
  // Condição: havia cônjuge anterior, não há cônjuge atual, EC mudou para Divorciado ou Separado
  if (conjugeIdAnterior && !conjugeIdAtual &&
      (ecAtual === '3097' || ecAtual === '3098') && ecAnterior === '3092') {
    var camposDissol = {};
    camposDissol[FIELDS.estadoCivil] = parseInt(ecAtual, 10); // Mesmo estado que o principal
    camposDissol[FIELDS.conjuge] = [];
    camposDissol[FIELDS.regraPatrimonial] = null;

    var labelsDissol = {};
    labelsDissol[FIELDS.estadoCivil] = 'Estado Civil';
    labelsDissol[FIELDS.conjuge] = 'Cônjuge';
    labelsDissol[FIELDS.regraPatrimonial] = 'Regra Patrimonial';

    promessas.push(patchParceiro(conjugeIdAnterior, camposDissol, labelsDissol));
  }

  // ────────────────────────────────────────
  // CASO 3: Viuvez (proveniente de casamento)
  // ────────────────────────────────────────
  // Condição: havia cônjuge anterior, EC mudou para Viúvo, EC anterior era Casado
  // Ação: marcar cônjuge anterior como Falecido(a) APENAS — manter todos os demais dados intactos
  if (conjugeIdAnterior && ecAtual === '3099' && ecAnterior === '3092') {
    var camposViuvez = {};
    camposViuvez[FIELDS.falecidoTF] = true;

    var labelsViuvez = {};
    labelsViuvez[FIELDS.falecidoTF] = 'Falecido';

    promessas.push(patchParceiro(conjugeIdAnterior, camposViuvez, labelsViuvez));
  }

  // ────────────────────────────────────────
  // CASO 4: Novo vínculo de companheiro (União Estável)
  // ────────────────────────────────────────
  // Condição: há companheiroId atual E (é novo OU mudou) E UE está ativa
  if (companheiroIdAtual && companheiroIdAtual !== companheiroIdAnterior && ueAtual) {
    var camposUE = {};
    camposUE[FIELDS.uniaoEstavelTF] = true;
    camposUE[FIELDS.companheiro] = [clienteId];
    camposUE[FIELDS.regraPatrimonialUE] = rpUEVal ? parseInt(rpUEVal, 10) : null;

    var labelsUE = {};
    labelsUE[FIELDS.uniaoEstavelTF] = 'União Estável';
    labelsUE[FIELDS.companheiro] = 'Companheiro(a)';
    labelsUE[FIELDS.regraPatrimonialUE] = 'Regra Patrimonial (UE)';

    promessas.push(patchParceiro(companheiroIdAtual, camposUE, labelsUE));
  }

  // ────────────────────────────────────────
  // CASO 5: Dissolução de UE (sem viuvez)
  // ────────────────────────────────────────
  // Condição: havia companheiro anterior E (UE desmarcada OU companheiro removido) E NÃO é viuvez
  if (companheiroIdAnterior && ueAnterior &&
      (!ueAtual || !companheiroIdAtual) && ecAtual !== '3099') {
    var camposDissolUE = {};
    camposDissolUE[FIELDS.uniaoEstavelTF] = false;
    camposDissolUE[FIELDS.companheiro] = [];
    camposDissolUE[FIELDS.regraPatrimonialUE] = null;

    var labelsDissolUE = {};
    labelsDissolUE[FIELDS.uniaoEstavelTF] = 'União Estável';
    labelsDissolUE[FIELDS.companheiro] = 'Companheiro(a)';
    labelsDissolUE[FIELDS.regraPatrimonialUE] = 'Regra Patrimonial (UE)';

    promessas.push(patchParceiro(companheiroIdAnterior, camposDissolUE, labelsDissolUE));
  }

  // ────────────────────────────────────────
  // CASO 6: Viuvez com UE ativa
  // ────────────────────────────────────────
  // Condição: havia companheiro anterior com UE ativa E EC mudou para Viúvo
  // Ação: marcar companheiro como Falecido + limpar UE bidirecional + manter estado civil intocado
  if (companheiroIdAnterior && ueAnterior && ecAtual === '3099') {
    var camposViuvezUE = {};
    camposViuvezUE[FIELDS.falecidoTF] = true;
    camposViuvezUE[FIELDS.uniaoEstavelTF] = false;
    camposViuvezUE[FIELDS.companheiro] = [];
    camposViuvezUE[FIELDS.regraPatrimonialUE] = null;
    // NÃO alterar estadoCivil do parceiro

    var labelsViuvezUE = {};
    labelsViuvezUE[FIELDS.falecidoTF] = 'Falecido';
    labelsViuvezUE[FIELDS.uniaoEstavelTF] = 'União Estável';
    labelsViuvezUE[FIELDS.companheiro] = 'Companheiro(a)';
    labelsViuvezUE[FIELDS.regraPatrimonialUE] = 'Regra Patrimonial (UE)';

    promessas.push(patchParceiro(companheiroIdAnterior, camposViuvezUE, labelsViuvezUE));
  }

  // ────────────────────────────────────────
  // Executar todas as sincronizações
  // ────────────────────────────────────────
  if (promessas.length === 0) return;

  Promise.all(promessas).then(function(resultados) {
    var falhas = [];
    for (var i = 0; i < resultados.length; i++) {
      if (!resultados[i].ok) {
        falhas.push(resultados[i].erro || 'Erro desconhecido');
      }
    }
    if (falhas.length > 0) {
      mostrarMsg('formMsg', 'warning',
        'O cliente foi salvo, mas houve falha ao atualizar o cadastro do parceiro(a). Verifique manualmente.');
    }
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
        resumo.innerHTML = 'Clique em "Consultar" para verificar documentos no ODIN.';
        resumo.classList.remove('clickable');
        resumo.onclick = null;
      }
    }
  } else {
    secao.style.display = 'none';
    fecharDrawer();
    if (resumo) {
      resumo.innerHTML = 'Clique em "Consultar" para verificar documentos no ODIN.';
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
    var campos = ['CPF', 'CPF_2'];
    var promessas = [];
    for (var i = 0; i < campos.length; i++) {
      var query = encodeURIComponent('["' + campos[i] + '","exact","' + cpf + '"]');
      var url = PAPERLESS_API + '/api/documents/?custom_field_query=' + query + '&page_size=50';
      promessas.push(
        fetch(url)
          .then(function(r) {
            if (!r.ok) throw new Error('Erro HTTP ' + r.status);
            return r.json();
          })
          .then(function(data) { return data.results || []; })
          .catch(function(e) {
            console.error('Erro ao buscar documentos Paperless:', e);
            return [];
          })
      );
    }

    Promise.all(promessas).then(function(resultados) {
      var visto = {};
      var docs = [];
      for (var r = 0; r < resultados.length; r++) {
        for (var d = 0; d < resultados[r].length; d++) {
          var doc = resultados[r][d];
          if (!visto[doc.id]) {
            visto[doc.id] = true;
            docs.push(doc);
          }
        }
      }
      cacheDocsPaperless[cpf] = docs;
      renderizarDocumentos(docs);
      atualizarResumoInline(docs);
    }).catch(function(e) {
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
  popularRegraPatrimonialUE();
  document.getElementById('estadoCivilSelect').addEventListener('change', atualizarVisibilidadeEstadoCivil);
  configurarBusca();
  configurarConjuge();
  configurarCompanheiro();
  configurarMascaras();
  configurarMarkdownOutros();

  document.getElementById('btnNovoCliente').addEventListener('click', novoCliente);
  document.getElementById('btnSalvar').addEventListener('click', salvarCliente);
  document.getElementById('btnLimpar').addEventListener('click', limparFormulario);
  document.getElementById('cpfInput').addEventListener('blur', function() {
    validarDuplicataOnBlur('cpf');
  });
  document.getElementById('cnpjInput').addEventListener('blur', function() {
    var empresarioAtivo = document.getElementById('switchEmpresario').checked;
    if (empresarioAtivo) {
      var cnpjVal = document.getElementById('cnpjInput').value.trim();
      var cnpjLimpo = cnpjVal.replace(/\D/g, '');
      if (cnpjLimpo.length === 14 && validarCNPJ(cnpjLimpo)) {
        verificarCnpjCruzado(cnpjVal, function(encontrado) {
          if (encontrado) {
            var nomePJ = encontrado[FIELDS.nome] || '';
            mostrarMsg('formMsg', 'warning',
              'Atenção: este CNPJ já está cadastrado como Pessoa Jurídica (' + nomePJ + '). O cadastro continuará como Empresário Individual.');
          }
        });
      }
    }
  });

  // Switches de Qualificações Especiais
  document.getElementById('switchEmpresario').addEventListener('change', function() {
    var ativo = this.checked;
    document.getElementById('cnpjEmpresarioGroup').style.display = ativo ? '' : 'none';
    if (!ativo) {
      document.getElementById('cnpjInput').value = '';
    }
  });

  document.getElementById('switchAdvogado').addEventListener('change', function() {
    var ativo = this.checked;
    document.getElementById('oabGroup').style.display = ativo ? '' : 'none';
    if (!ativo) {
      document.getElementById('oabInput').value = '';
    }
  });

  document.getElementById('switchCorretor').addEventListener('change', function() {
    var ativo = this.checked;
    document.getElementById('creciGroup').style.display = ativo ? '' : 'none';
    if (!ativo) {
      document.getElementById('creciInput').value = '';
    }
  });

  document.getElementById('switchFalecido').addEventListener('change', function() {
    var grupo = document.getElementById('falecidoGroup');
    if (this.checked) {
      grupo.style.display = '';
    } else {
      grupo.style.display = 'none';
      document.getElementById('dataFalecimentoInput').value = '';
    }
  });

  // Switch de União Estável
  document.getElementById('switchUniaoEstavel').addEventListener('change', function() {
    var campos = document.getElementById('uniaoEstavelCampos');
    if (this.checked) {
      campos.style.display = '';
    } else {
      campos.style.display = 'none';
      document.getElementById('regraPatrimonialUESelect').value = '';
      document.getElementById('companheiroInput').value = '';
      companheiroId = null;
    }
  });

  configurarDrawer();

  // Fechar dropdowns ao clicar fora
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#buscaCard')) {
      fecharAutocompleteBusca();
    }
    var conjugeWrapper = document.getElementById('conjugeInput');
    if (conjugeWrapper && !e.target.closest('#conjugeInput') && !e.target.closest('#conjugeAutoList')) {
      fecharAutocompleteConjuge();
    }
    var companheiroWrapper = document.getElementById('companheiroInput');
    if (companheiroWrapper && !e.target.closest('#companheiroInput') && !e.target.closest('#companheiroAutoList')) {
      fecharAutocompleteCompanheiro();
    }
  });
});
