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
  outros:      'field_7246',
  oab:         'field_7256',
  rg:          'field_7342',
  estadoCivil: 'field_7343', // legado — somente leitura (aviso da timeline)
  nascimento:  'field_7345',
  profissao:        'field_7347',
  protocolos:       'field_7247',
  alerta:           'field_7394',
  logs:             'field_7395',
  empresarioTF:     'field_7429',
  advogadoTF:       'field_7430',
  corretorTF:       'field_7431',
  creci:            'field_7432',
  falecidoTF:         'field_7453',
  dataFalecimento:    'field_7454'
};

var FIELD_LABELS = {
  nome:             'Nome',
  cpf:              'CPF',
  cnpj:             'CNPJ',
  telefone:         'Telefone',
  email:            'E-mail',
  oab:              'OAB',
  rg:               'RG',
  nascimento:       'Data de Nascimento',
  profissao:        'Profissão',
  alerta:           'Alerta',
  empresarioTF:     'Empresário Individual',
  advogadoTF:       'Advogado',
  corretorTF:       'Corretor',
  creci:            'CRECI',
  falecidoTF:         'Falecido',
  dataFalecimento:    'Data de Falecimento'
};

// ── Estado global ──
var clienteAtual  = null;   // linha do Baserow carregada no formulário
var modoNovo      = false;  // true = criando novo cliente
var clienteCarregadoPorBusca = false; // true quando veio de busca positiva
var buscaTimer    = null;   // debounce da busca por nome
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
  if (window.marked) {
    var html = marked.parse(md);
    el.innerHTML = (window.DOMPurify) ? DOMPurify.sanitize(html) : html;
  } else {
    el.textContent = md;
  }
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
    // Se parece com documento (só dígitos + separadores), aplica máscara e não autocompleta
    if (soDigitos.length >= 1 && soDigitos === raw.replace(/[\.\-\/]/g, '')) {
      if (soDigitos.length <= 11) {
        input.value = formatarCPF(input.value);
      }
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
              habilitarAbaEnderecos(false);
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

// ═══════════════════════════════════════════════════════
// ABAS (Dados | Endereços)
// ═══════════════════════════════════════════════════════
function ativarAbaCliente(nome) {
  // Não permitir ativar "endereços" se estiver desabilitada
  var btn = document.querySelector('.tab-btn[data-tab="' + nome + '"]');
  if (btn && btn.disabled) return;

  var btns = document.querySelectorAll('.tab-btn');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].getAttribute('data-tab') === nome) {
      btns[i].classList.add('active');
    } else {
      btns[i].classList.remove('active');
    }
  }
  var conteudos = document.querySelectorAll('.tab-content');
  for (var j = 0; j < conteudos.length; j++) {
    if (conteudos[j].id === 'tab-' + nome) {
      conteudos[j].classList.add('active');
    } else {
      conteudos[j].classList.remove('active');
    }
  }
  if (nome === 'enderecos' && window.carregarEnderecos) window.carregarEnderecos();
  if (nome === 'estadocivil' && window.carregarEventosEstadoCivil) window.carregarEventosEstadoCivil();
  if (nome === 'vidanotarial' && window.carregarVidaNotarial) window.carregarVidaNotarial();
  atualizarVisibilidadeBarraAcoes(nome);
}

function atualizarVisibilidadeBarraAcoes(nomeAba) {
  var barra = document.querySelector('.form-actions-sticky');
  if (!barra) return;
  barra.style.display = (nomeAba === 'enderecos' || nomeAba === 'estadocivil' || nomeAba === 'vidanotarial') ? 'none' : '';
}

function habilitarAbasDependentes(habilitar) {
  window.ENDERECO_CLIENTE_ID = (habilitar && clienteAtual) ? clienteAtual.id : null;
  window.EVENTOS_EC_CLIENTE_ID = (habilitar && clienteAtual) ? clienteAtual.id : null;
  window.VIDA_NOTARIAL_CLIENTE_ID = (habilitar && clienteAtual) ? clienteAtual.id : null;
  var ecLegado = (habilitar && clienteAtual) ? clienteAtual[FIELDS.estadoCivil] : null;
  window.EVENTOS_EC_LEGADO = (ecLegado && ecLegado.id) ? { id: ecLegado.id, value: ecLegado.value || '' } : null;
  if (habilitar && window.carregarEnderecos) window.carregarEnderecos();
  if (habilitar && window.carregarEventosEstadoCivil) window.carregarEventosEstadoCivil();

  var ids = ['tabBtnEstadoCivil', 'tabBtnEnderecos', 'tabBtnVidaNotarial', 'tabBtnHistorico'];
  for (var i = 0; i < ids.length; i++) {
    var btn = document.getElementById(ids[i]);
    if (btn) btn.disabled = !habilitar;
  }

  // Se desabilitar enquanto uma aba dependente está ativa, voltar para "Cliente"
  if (!habilitar) {
    var dependentes = ['estadocivil', 'enderecos', 'vidanotarial', 'historico'];
    for (var j = 0; j < dependentes.length; j++) {
      var ativo = document.querySelector('.tab-btn[data-tab="' + dependentes[j] + '"].active');
      if (ativo) { ativarAbaCliente('cliente'); break; }
    }
  }
}

// Alias de compatibilidade (chamadas antigas continuam funcionando)
function habilitarAbaEnderecos(habilitar) {
  habilitarAbasDependentes(habilitar);
}

function selecionarDaBusca(cli) {
  clienteAtual = cli;
  modoNovo = false;
  clienteCarregadoPorBusca = true;
  esconderMsg('buscaMsg');
  mostrarToast('Cliente já cadastrado. Seguem os dados abaixo.', 'success');
  preencherFormulario(cli);
  mostrarFormulario();
  fecharDrawer();
  esconderOverlay();
  habilitarAbaEnderecos(true);
}

// ═══════════════════════════════════════════════════════
// NOVO CLIENTE
// ═══════════════════════════════════════════════════════
function novoCliente() {
  clienteAtual = null;
  modoNovo = true;
  clienteCarregadoPorBusca = false;
  snapshotCliente = null;
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
  habilitarAbaEnderecos(false);
  document.getElementById('nomeInput').focus();
}

// ═══════════════════════════════════════════════════════
// FORMULÁRIO — visibilidade e preenchimento
// ═══════════════════════════════════════════════════════
function mostrarFormulario() {
  document.getElementById('buscaCard').style.display = 'none';
  document.getElementById('cadastroWrap').style.display = 'block';
  var ativo = document.querySelector('.tab-btn.active');
  atualizarVisibilidadeBarraAcoes(ativo ? ativo.getAttribute('data-tab') : 'cliente');
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
  snap.oab       = cli[FIELDS.oab] || '';
  snap.rg        = cli[FIELDS.rg] || '';
  snap.profissao = cli[FIELDS.profissao] || '';
  snap.alerta    = cli[FIELDS.alerta] || '';
  snap.nascimento = cli[FIELDS.nascimento] || '';
  snap.empresarioTF = cli[FIELDS.empresarioTF] ? true : false;
  snap.advogadoTF   = cli[FIELDS.advogadoTF]   ? true : false;
  snap.corretorTF   = cli[FIELDS.corretorTF]   ? true : false;
  snap.creci        = cli[FIELDS.creci] || '';
  snap.falecidoTF = cli[FIELDS.falecidoTF] ? true : false;
  snap.dataFalecimento = cli[FIELDS.dataFalecimento] || '';

  return snap;
}

function capturarEstadoAtualFormulario() {
  var estado = {};
  estado.nome      = document.getElementById('nomeInput').value.trim();
  estado.cpf       = document.getElementById('cpfInput').value.trim();
  estado.cnpj      = document.getElementById('cnpjInput').value.trim();
  estado.telefone  = document.getElementById('telefoneInput').value.trim();
  estado.email     = document.getElementById('emailInput').value.trim();
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

function atualizarResumoCliente() {
  var box = document.getElementById('resumoCliente');
  if (!box) return;

  var nome = document.getElementById('nomeInput').value.trim();
  var cpf  = document.getElementById('cpfInput').value.trim();

  if (!nome) {
    box.style.display = 'none';
    return;
  }

  document.getElementById('resumoNome').textContent = nome;

  var cpfEl = document.getElementById('resumoCpf');
  if (cpf) {
    cpfEl.textContent = 'CPF ' + cpf;
    cpfEl.style.display = '';
  } else {
    cpfEl.textContent = '';
    cpfEl.style.display = 'none';
  }

  box.style.display = 'flex';
}

function aplicarDestaqueAlerta(temAlerta) {
  var box = document.getElementById('resumoCliente');
  var aviso = document.getElementById('resumoAlerta');
  if (box) {
    if (temAlerta) {
      box.classList.add('tem-alerta');
    } else {
      box.classList.remove('tem-alerta');
    }
  }
  if (aviso) {
    aviso.style.display = temAlerta ? '' : 'none';
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

  aplicarDestaqueAlerta(!!alertaVal.trim());

  // Capturar snapshot para detecção de alterações
  snapshotCliente = capturarSnapshot(cli);

  // Exibir logs
  exibirLogs(cli);

  // Documentos Digitalizados (Paperless) — mostrar seção se tem CPF
  atualizarVisibilidadeDocumentos();

  // Resumo de leitura (Nome/CPF no topo da aba Cliente)
  atualizarResumoCliente();
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
  if (window.limparVidaNotarial) window.limparVidaNotarial();
  document.getElementById('alertaTextarea').value = '';
  document.getElementById('alertaReadonly').textContent = '';
  document.getElementById('alertaCard').style.display = 'none';
  aplicarDestaqueAlerta(false);
  snapshotCliente = null;
  document.getElementById('logContent').textContent = '';
  document.getElementById('logCard').style.display = 'none';
  esconderMsg('buscaMsg');
  atualizarResumoCliente();
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
  payload[FIELDS.oab]      = document.getElementById('oabInput').value.trim();
  payload[FIELDS.outros]   = document.getElementById('outrosTextarea').value;

  var nasc = document.getElementById('nascimentoInput').value;
  payload[FIELDS.nascimento] = nasc || null;

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
    ativarAbaCliente('cliente');
    document.getElementById('nomeInput').focus();
    return mostrarMsg('formMsg', 'error', 'O nome do cliente é obrigatório.');
  }
  if (modoNovo && !cpfLimpo) {
    ativarAbaCliente('cliente');
    document.getElementById('cpfInput').focus();
    return mostrarMsg('formMsg', 'error', 'Informe o CPF para cadastrar um novo cliente.');
  }
  if (cpfLimpo && !validarCPF(cpfLimpo)) {
    ativarAbaCliente('cliente');
    document.getElementById('cpfInput').focus();
    return mostrarMsg('formMsg', 'error', 'CPF inválido. Verifique os dígitos verificadores.');
  }
  if (cnpjLimpo && !validarCNPJ(cnpjLimpo)) {
    ativarAbaCliente('qualificacoes');
    document.getElementById('cnpjInput').focus();
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
      habilitarAbaEnderecos(true);
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
  configurarBusca();
  configurarMascaras();
  configurarMarkdownOutros();

  // Resumo de leitura (Nome/CPF) — atualizar em tempo real durante o cadastro
  document.getElementById('nomeInput').addEventListener('input', atualizarResumoCliente);
  document.getElementById('cpfInput').addEventListener('input', atualizarResumoCliente);

  // Destaque de alerta na faixa de resumo — acende/apaga ao vivo enquanto edita
  var alertaTextareaEl = document.getElementById('alertaTextarea');
  if (alertaTextareaEl) {
    alertaTextareaEl.addEventListener('input', function() {
      aplicarDestaqueAlerta(!!alertaTextareaEl.value.trim());
    });
  }

  document.getElementById('btnNovoCliente').addEventListener('click', novoCliente);
  document.getElementById('btnSalvar').addEventListener('click', salvarCliente);
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
    if (ativo) {
      document.getElementById('cnpjInput').readOnly = false;
    } else {
      document.getElementById('cnpjInput').value = '';
      document.getElementById('cnpjInput').readOnly = !modoNovo;
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

  configurarDrawer();

  // Fechar dropdowns ao clicar fora
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#buscaCard')) {
      fecharAutocompleteBusca();
    }
  });
});
