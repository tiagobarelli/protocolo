// Gestão de Pessoas Jurídicas — ES5, proxy Flask /api/baserow
'use strict';

var API_BASE = '/api/baserow';
var TABLE_CLIENTES = 754;
var TABLE_PROTOCOLO = 755;

var FIELDS = {
  nome:       'field_7237',
  cpf:        'field_7238',
  cnpj:       'field_7239',
  telefone:   'field_7243',
  email:      'field_7244',
  endereco:   'field_7245',
  outros:     'field_7246',
  protocolos: 'field_7247',
  alerta:     'field_7394',
  logs:       'field_7395'
};

var FIELD_LABELS = {
  nome:      'Denominação',
  cnpj:      'CNPJ',
  telefone:  'Telefone',
  email:     'E-mail',
  endereco:  'Endereço',
  alerta:    'Alerta'
};

// ── Estado global ──
var clienteAtual  = null;
var modoNovo      = false;
var clienteCarregadoPorBusca = false;
var buscaTimer    = null;
var snapshotCliente = null;

// ── API header ──
function apiHeaders() {
  return { 'Content-Type': 'application/json' };
}

// ═══════════════════════════════════════════════════════
// MÁSCARAS
// ═══════════════════════════════════════════════════════
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
// VALIDAÇÃO CNPJ
// ═══════════════════════════════════════════════════════
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
// UI HELPERS
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
// MARKDOWN EDITOR
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
// MÁSCARAS — configurar eventos
// ═══════════════════════════════════════════════════════
function configurarMascaras() {
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
    // Se parece com documento (só dígitos + separadores), não autocompleta
    if (soDigitos.length >= 1 && soDigitos === raw.replace(/[\.\-\/]/g, '')) {
      fecharAutocompleteBusca();
      // Busca automática ao completar CNPJ formatado (18 chars)
      if (raw.length === 18) {
        executarBusca();
      }
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
  if (soDigitos.length === 14) {
    buscarPorCnpj(soDigitos, raw);
  } else if (raw.length >= 3) {
    buscarPorNome(raw);
  }
}

function buscarPorCnpj(soDigitos, valorFormatado) {
  mostrarOverlay();
  var url = API_BASE + '/database/rows/table/' + TABLE_CLIENTES +
    '/?user_field_names=false&filter__' + FIELDS.cnpj + '__equal=' +
    encodeURIComponent(soDigitos) +
    '&filter__' + FIELDS.cpf + '__empty' +
    '&size=1';
  fetch(url, { headers: apiHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.results && data.results.length > 0) {
        selecionarDaBusca(data.results[0]);
      } else {
        // Fallback: tenta versão formatada
        var urlFmt = API_BASE + '/database/rows/table/' + TABLE_CLIENTES +
          '/?user_field_names=false&filter__' + FIELDS.cnpj + '__equal=' +
          encodeURIComponent(valorFormatado) +
          '&filter__' + FIELDS.cpf + '__empty' +
          '&size=1';
        return fetch(urlFmt, { headers: apiHeaders() })
          .then(function(r2) { return r2.json(); })
          .then(function(data2) {
            if (data2.results && data2.results.length > 0) {
              selecionarDaBusca(data2.results[0]);
            } else {
              esconderOverlay();
              clienteAtual = null;
              modoNovo = true;
              clienteCarregadoPorBusca = false;
              snapshotCliente = null;
              limparCamposFormulario();
              document.getElementById('cnpjInput').value = valorFormatado;
              document.getElementById('cnpjInput').readOnly = false;
              var podeEditarAlerta = window.CURRENT_USER &&
                (window.CURRENT_USER.perfil === 'master' || window.CURRENT_USER.perfil === 'administrador');
              if (podeEditarAlerta) {
                document.getElementById('alertaCard').style.display = '';
                document.getElementById('alertaEditavel').style.display = '';
                document.getElementById('alertaReadonly').style.display = 'none';
              }
              mostrarFormulario();
              mostrarMsg('buscaMsg', 'warning',
                'Nenhuma pessoa jurídica encontrada com este CNPJ. Preencha os dados para cadastrar.');
              document.getElementById('denominacaoInput').focus();
            }
          });
      }
    })
    .catch(function(e) {
      esconderOverlay();
      console.error('Erro na busca por CNPJ:', e);
      mostrarMsg('formMsg', 'error', 'Erro ao consultar o banco de dados.');
      mostrarFormulario();
    });
}

function buscarPorNome(termo) {
  var url = API_BASE + '/database/rows/table/' + TABLE_CLIENTES +
    '/?user_field_names=false' +
    '&filter__' + FIELDS.nome + '__contains=' + encodeURIComponent(termo) +
    '&filter__' + FIELDS.cnpj + '__not_empty' +
    '&filter__' + FIELDS.cpf + '__empty' +
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
      var cnpjVal = cli[FIELDS.cnpj] || '';
      var detalhe = cnpjVal ? ('CNPJ: ' + cnpjVal) : '';
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
  mostrarMsg('buscaMsg', 'success', 'Pessoa jurídica já cadastrada. Seguem os dados abaixo.');
  preencherFormulario(cli);
  mostrarFormulario();
  esconderOverlay();
}

// ═══════════════════════════════════════════════════════
// NOVA PESSOA JURÍDICA
// ═══════════════════════════════════════════════════════
function novaPessoaJuridica() {
  clienteAtual = null;
  modoNovo = true;
  clienteCarregadoPorBusca = false;
  snapshotCliente = null;
  limparCamposFormulario();
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
  document.getElementById('denominacaoInput').focus();
}

// ═══════════════════════════════════════════════════════
// FORMULÁRIO — visibilidade e preenchimento
// ═══════════════════════════════════════════════════════
function mostrarFormulario() {
  document.getElementById('formCard').style.display = 'block';
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
  snap.cnpj      = cli[FIELDS.cnpj] || '';
  snap.telefone  = cli[FIELDS.telefone] || '';
  snap.email     = cli[FIELDS.email] || '';
  snap.endereco  = cli[FIELDS.endereco] || '';
  snap.alerta    = cli[FIELDS.alerta] || '';
  return snap;
}

function capturarEstadoAtualFormulario() {
  var estado = {};
  estado.nome      = document.getElementById('denominacaoInput').value.trim();
  estado.cnpj      = document.getElementById('cnpjInput').value.trim();
  estado.telefone  = document.getElementById('telefoneInput').value.trim();
  estado.email     = document.getElementById('emailInput').value.trim();
  estado.endereco  = document.getElementById('enderecoTextarea').value.trim();

  var alertaEl = document.getElementById('alertaTextarea');
  var podeEditarAlerta = window.CURRENT_USER &&
    (window.CURRENT_USER.perfil === 'master' || window.CURRENT_USER.perfil === 'administrador');
  if (podeEditarAlerta && alertaEl) {
    estado.alerta = alertaEl.value;
  } else {
    estado.alerta = snapshotCliente ? snapshotCliente.alerta : '';
  }

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
  document.getElementById('denominacaoInput').value = cli[FIELDS.nome] || '';
  document.getElementById('cnpjInput').value      = cli[FIELDS.cnpj] || '';
  document.getElementById('telefoneInput').value  = cli[FIELDS.telefone] || '';
  document.getElementById('emailInput').value     = cli[FIELDS.email] || '';
  document.getElementById('enderecoTextarea').value = cli[FIELDS.endereco] || '';

  var outrosVal = cli[FIELDS.outros] || '';
  document.getElementById('outrosTextarea').value = outrosVal;
  atualizarPreviewOutros();

  // CNPJ readonly ao editar registro existente
  var editando = !!cli.id;
  document.getElementById('cnpjInput').readOnly = editando;

  // Alerta
  atualizarVisibilidadeAlerta(cli);

  // Capturar snapshot para detecção de alterações
  snapshotCliente = capturarSnapshot(cli);

  // Exibir logs
  exibirLogs(cli);

  // Protocolos vinculados
  carregarProtocolos(cli[FIELDS.protocolos] || []);
}

function atualizarVisibilidadeAlerta(cli) {
  var alertaVal = (cli && cli[FIELDS.alerta]) ? cli[FIELDS.alerta] : '';
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
}

function limparCamposFormulario() {
  document.getElementById('denominacaoInput').value = '';
  document.getElementById('cnpjInput').value        = '';
  document.getElementById('telefoneInput').value    = '';
  document.getElementById('emailInput').value       = '';
  document.getElementById('enderecoTextarea').value = '';
  document.getElementById('outrosTextarea').value   = '';
  atualizarPreviewOutros();
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
  limparCamposFormulario();
  esconderMsg('formMsg');
  esconderFormulario();
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
        var numProto  = proto['field_7240'] || (protArr[j] ? (protArr[j].value || '\u2014') : '\u2014');
        var servicoArr = proto['field_7242'] || [];
        var servico   = servicoArr.length > 0 ? (servicoArr[0].value || '\u2014') : '\u2014';
        var statusObj = proto['field_7252'];
        var status    = statusObj ? (statusObj.value || '\u2014') : '\u2014';
        var dataRaw   = proto['field_7250'] || '';
        var data      = dataRaw ? dataRaw.split('-').reverse().join('/') : '\u2014';
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
function verificarDuplicata(cnpjFormatado) {
  var url = API_BASE + '/database/rows/table/' + TABLE_CLIENTES +
    '/?user_field_names=false&filter__' + FIELDS.cnpj + '__equal=' +
    encodeURIComponent(cnpjFormatado) +
    '&filter__' + FIELDS.cpf + '__empty' +
    '&size=1';
  return fetch(url, { headers: apiHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(d) { return !!(d.results && d.results.length > 0); });
}

function validarDuplicataOnBlur() {
  if (!modoNovo) return;
  var valorFormatado = document.getElementById('cnpjInput').value.trim();
  var valorLimpo = valorFormatado.replace(/\D/g, '');
  if (valorLimpo.length !== 14) return;
  if (!validarCNPJ(valorLimpo)) return;

  var url = API_BASE + '/database/rows/table/' + TABLE_CLIENTES +
    '/?user_field_names=false&filter__' + FIELDS.cnpj + '__equal=' +
    encodeURIComponent(valorFormatado) +
    '&filter__' + FIELDS.cpf + '__empty' +
    '&size=1';

  fetch(url, { headers: apiHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.results && d.results.length > 0) {
        alert('Pessoa jurídica já consta na base de dados. Utilize a busca para localizar o cadastro.');
        window.location.href = '/clientes-pj';
      }
    })
    .catch(function(e) {
      console.error('Erro ao verificar duplicata:', e);
    });
}

function construirPayload(isNovo) {
  var payload = {};
  payload[FIELDS.nome]     = document.getElementById('denominacaoInput').value.trim();
  payload[FIELDS.telefone] = document.getElementById('telefoneInput').value.trim();
  payload[FIELDS.email]    = document.getElementById('emailInput').value.trim();
  payload[FIELDS.endereco] = document.getElementById('enderecoTextarea').value.trim();
  payload[FIELDS.outros]   = document.getElementById('outrosTextarea').value;

  if (isNovo) {
    var cnpjFormatado = document.getElementById('cnpjInput').value.trim();
    if (cnpjFormatado) payload[FIELDS.cnpj] = cnpjFormatado;
  }

  var podeEditarAlerta = window.CURRENT_USER &&
    (window.CURRENT_USER.perfil === 'master' || window.CURRENT_USER.perfil === 'administrador');
  if (podeEditarAlerta) {
    payload[FIELDS.alerta] = document.getElementById('alertaTextarea').value;
  }

  return payload;
}

function salvar() {
  var nome    = document.getElementById('denominacaoInput').value.trim();
  var cnpjRaw = document.getElementById('cnpjInput').value.trim();
  var cnpjLimpo = cnpjRaw.replace(/\D/g, '');

  if (!nome) {
    return mostrarMsg('formMsg', 'error', 'A denominação é obrigatória.');
  }
  if (modoNovo && !cnpjLimpo) {
    return mostrarMsg('formMsg', 'error', 'Informe o CNPJ para cadastrar uma nova pessoa jurídica.');
  }
  if (cnpjLimpo && !validarCNPJ(cnpjLimpo)) {
    return mostrarMsg('formMsg', 'error', 'CNPJ inválido. Verifique os dígitos verificadores.');
  }

  var btnSalvar = document.getElementById('btnSalvar');
  btnSalvar.disabled = true;
  mostrarOverlay();
  esconderMsg('formMsg');

  if (modoNovo) {
    verificarDuplicata(cnpjRaw)
      .then(function(existe) {
        if (existe) {
          esconderOverlay();
          btnSalvar.disabled = false;
          mostrarMsg('formMsg', 'warning',
            'Já existe uma pessoa jurídica cadastrada com este CNPJ.');
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
        throw new Error(e.detail || 'Erro ao cadastrar pessoa jurídica.');
      });
      return r.json();
    })
    .then(function(data) {
      clienteAtual = data;
      modoNovo = false;
      clienteCarregadoPorBusca = false;
      document.getElementById('cnpjInput').readOnly = true;
      esconderOverlay();
      btnSalvar.disabled = false;
      mostrarMsg('formMsg', 'success', 'Pessoa jurídica cadastrada com sucesso!');
    })
    .catch(function(e) {
      esconderOverlay();
      btnSalvar.disabled = false;
      mostrarMsg('formMsg', 'error', e.message || 'Erro ao cadastrar pessoa jurídica.');
      console.error(e);
    });
}

function executarPatch(btnSalvar) {
  var estadoAtual = capturarEstadoAtualFormulario();
  var linhasLog = gerarLinhasLog(snapshotCliente, estadoAtual);

  var payload = construirPayload(false);

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
      mostrarMsg('formMsg', 'error', e.message || 'Erro ao salvar alterações.');
      console.error(e);
    });
}

// ═══════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  configurarBusca();
  configurarMascaras();
  configurarMarkdownOutros();

  document.getElementById('btnNovoCliente').addEventListener('click', novaPessoaJuridica);
  document.getElementById('btnSalvar').addEventListener('click', salvar);
  document.getElementById('btnLimpar').addEventListener('click', limparFormulario);

  document.getElementById('cnpjInput').addEventListener('blur', function() {
    validarDuplicataOnBlur();
  });

  // Fechar dropdowns ao clicar fora
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#buscaCard')) {
      fecharAutocompleteBusca();
    }
  });
});
