/* Controle de Livros de Notas — ES5 only */
'use strict';

var API_BASE = '/api/baserow';

var CONFIG = {
  tables: {
    controle: 745,
    servicos: 746,
    escreventes: 747,
    clientes: 754,
    protocolo: 755,
    imoveis: 773,
    retificacoes: 753
  },
  fields: {
    // Controle (745)
    livro: 'field_7189',
    pagina: 'field_7190',
    tipoEscritura: 'field_7194',
    escrevente: 'field_7198',
    digitalizacao: 'field_7200',
    doi: 'field_7201',
    odin: 'field_7202',
    pendencias: 'field_7203',
    data: 'field_7226',
    protocolo: 'field_7377',
    clientes: 'field_7379',
    imoveis: 'field_7384',
    // Imoveis (773)
    imvCbi: 'field_7381',
    imvControle: 'field_7382',
    imvEndereco: 'field_7385',
    imvMatricula: 'field_7386',
    imvCri: 'field_7387',
    imvValorNegocio: 'field_7388',
    imvVenal: 'field_7389',
    imvFracao: 'field_7390',
    imvMunicipio: 'field_7391',
    imvEstado: 'field_7392',
    // Protocolo (755)
    protoNumero: 'field_7240',
    protoInteressado: 'field_7241',
    protoStatus: 'field_7252',
    // Retificacoes (campo reverso no Controle + campos da tabela 753)
    retificacaoReversa: 'field_7232',
    retifLivro: 'field_7228',
    retifPagina: 'field_7229'
  },
  statusEmAndamento: 3064,
  statusFinalizado: 3065,
  digitalizacaoOpts: [
    { id: 3054, label: 'Ausente' },
    { id: 3055, label: 'Concluída' },
    { id: 3056, label: 'NA' }
  ],
  doiOpts: [
    { id: 3057, label: 'Salva' },
    { id: 3058, label: 'Ausente' },
    { id: 3059, label: 'NA' }
  ],
  odinOpts: [
    { id: 3060, label: 'Finalizado' },
    { id: 3061, label: 'Pendente' }
  ]
};

var UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

// ═══════════════════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════════════════
var controleRowId = null;
var protocoloSelecionadoId = null;
var protocoloStatusId = null;
var clientesSelecionados = [];
var imoveisBlocks = [];
var imoveisCounter = 0;
var protocoloTimer = null;
var clienteTimer = null;

// ═══════════════════════════════════════════════════════
// HELPERS (copiados de cadastrar.js / clientes.js)
// ═══════════════════════════════════════════════════════
function apiHeaders() {
  return { 'Content-Type': 'application/json' };
}

function formatarMoeda(v) {
  v = String(v || '').replace(/[^\d.,]/g, '');
  if (!v) return '';
  var partes = v.split(',');
  var inteiros = (partes[0] || '').replace(/\D/g, '').substring(0, 13);
  var centavos = (partes.length > 1 ? partes.slice(1).join('') : '').replace(/\D/g, '').substring(0, 2);
  if (inteiros.length === 0) inteiros = '0';
  var intFmt = inteiros.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return partes.length > 1 ? (intFmt + ',' + centavos) : intFmt;
}

function completarCentavosMoeda(v) {
  v = String(v || '').trim();
  if (!v) return '';
  var fmt = formatarMoeda(v);
  if (!fmt) return '';
  if (fmt.indexOf(',') === -1) return fmt + ',00';
  var p = fmt.split(',');
  var cent = p[1] || '';
  if (cent.length === 0) cent = '00';
  else if (cent.length === 1) cent = cent + '0';
  return p[0] + ',' + cent;
}

function moedaParaAPI(v) {
  v = String(v || '').trim();
  if (!v) return null;
  var limpo = v.replace(/[^\d.,]/g, '');
  if (!limpo) return null;
  var intPart = '';
  var decPart = '';
  if (limpo.indexOf(',') >= 0) {
    var partes = limpo.split(',');
    intPart = (partes[0] || '').replace(/\D/g, '');
    decPart = (partes.slice(1).join('') || '').replace(/\D/g, '').substring(0, 2);
  } else {
    intPart = limpo.replace(/\D/g, '');
  }
  if (!intPart && !decPart) return null;
  if (!intPart) intPart = '0';
  if (decPart.length === 0) decPart = '00';
  else if (decPart.length === 1) decPart = decPart + '0';
  var num = parseFloat(intPart + '.' + decPart);
  if (isNaN(num) || num < 0) return null;
  return num.toFixed(2);
}

function moedaParaExibicao(v) {
  if (v === null || v === undefined || v === '') return '';
  var num = parseFloat(String(v).replace(',', '.'));
  if (isNaN(num)) return '';
  var partes = num.toFixed(2).split('.');
  var intPart = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return intPart + ',' + partes[1];
}

function mostrarMsg(id, tipo, texto) {
  var el = document.getElementById(id);
  el.className = 'msg-box ' + tipo;
  var icone = '';
  if (tipo === 'success') icone = '<i class="ph ph-check-circle" style="font-size:1.2rem"></i> ';
  else if (tipo === 'warning') icone = '<i class="ph ph-warning" style="font-size:1.2rem"></i> ';
  else if (tipo === 'error') icone = '<i class="ph ph-x-circle" style="font-size:1.2rem"></i> ';
  else if (tipo === 'info') icone = '<i class="ph ph-info" style="font-size:1.2rem"></i> ';
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
// MARKDOWN (adaptado de clientes.js — ES5-safe)
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

function atualizarPreviewPendencias() {
  var ta = document.getElementById('pendenciasTextarea');
  var prev = document.getElementById('pendenciasPreview');
  if (!ta || !prev) return;
  var md = ta.value || '';
  if (!md.trim()) {
    prev.innerHTML = '<div class="md-placeholder">Pré-visualização do Markdown...</div>';
    return;
  }
  renderMarkdownInto(prev, md);
}

function configurarMarkdownPendencias() {
  var ta = document.getElementById('pendenciasTextarea');
  if (!ta) return;
  ta.addEventListener('input', atualizarPreviewPendencias);
  atualizarPreviewPendencias();
}

function addMarkdownPendencias(tipo) {
  var ta = document.getElementById('pendenciasTextarea');
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
// SIDEBAR
// ═══════════════════════════════════════════════════════
function toggleSidebar() {
  var sidebar = document.querySelector('.sidebar');
  var overlay = document.querySelector('.sidebar-overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
}

// ═══════════════════════════════════════════════════════
// SELECT HELPERS
// ═══════════════════════════════════════════════════════
function popularSelectOpcoes(selectId, opcoes) {
  var sel = document.getElementById(selectId);
  sel.innerHTML = '<option value="">Selecione...</option>';
  for (var i = 0; i < opcoes.length; i++) {
    var opt = document.createElement('option');
    opt.value = opcoes[i].id;
    opt.textContent = opcoes[i].label;
    sel.appendChild(opt);
  }
}

function carregarTiposEscritura() {
  var sel = document.getElementById('tipoEscrituraSelect');
  fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.servicos + '/?user_field_names=true&size=200', {
    headers: apiHeaders()
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var rows = data.results || [];
      sel.innerHTML = '<option value="">Selecione...</option>';
      for (var i = 0; i < rows.length; i++) {
        var opt = document.createElement('option');
        opt.value = rows[i].id;
        opt.textContent = rows[i]['Tipo'] || rows[i]['Nome'] || ('ID ' + rows[i].id);
        sel.appendChild(opt);
      }
    })
    .catch(function(e) {
      console.error('Erro ao carregar tipos de escritura:', e);
      sel.innerHTML = '<option value="">Erro ao carregar</option>';
    });
}

function carregarEscreventes() {
  var sel = document.getElementById('escreventeSelect');
  fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.escreventes + '/?user_field_names=false&filter__field_7197__boolean=true&size=200', {
    headers: apiHeaders()
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var rows = data.results || [];
      sel.innerHTML = '<option value="">Selecione...</option>';
      for (var i = 0; i < rows.length; i++) {
        var opt = document.createElement('option');
        opt.value = rows[i].id;
        opt.textContent = rows[i]['field_7195'] || ('ID ' + rows[i].id);
        sel.appendChild(opt);
      }
    })
    .catch(function(e) {
      console.error('Erro ao carregar escreventes:', e);
      sel.innerHTML = '<option value="">Erro ao carregar</option>';
    });
}

// ═══════════════════════════════════════════════════════
// BUSCA
// ═══════════════════════════════════════════════════════
function buscarPorMascara() {
  var input = document.getElementById('buscaMascara');
  var val = input.value.trim();
  esconderMsg('searchMsg');

  var regex = /^L_(\d+)_P_(\d{1,3})$/i;
  var match = val.match(regex);
  if (!match) {
    mostrarMsg('searchMsg', 'error', 'Formato inválido. Use L_XXX_P_YYY (ex: L_150_P_025).');
    return;
  }

  var livro = match[1];
  var pagina = match[2];

  if (parseInt(pagina, 10) > 400) {
    mostrarMsg('searchMsg', 'error', 'A página não pode exceder 400.');
    return;
  }

  executarBusca(livro, pagina);
}

function buscarPorLivroPagina() {
  var livro = document.getElementById('buscaLivro').value.trim();
  var pagina = document.getElementById('buscaPagina').value.trim();
  esconderMsg('searchMsg');

  if (!livro || !pagina) {
    mostrarMsg('searchMsg', 'error', 'Preencha o Livro e a Página.');
    return;
  }

  if (!/^\d+$/.test(livro) || !/^\d+$/.test(pagina)) {
    mostrarMsg('searchMsg', 'error', 'Livro e Página devem ser números.');
    return;
  }

  if (parseInt(pagina, 10) > 400) {
    mostrarMsg('searchMsg', 'error', 'A página não pode exceder 400.');
    return;
  }

  executarBusca(livro, pagina);
}

function executarBusca(livro, pagina) {
  mostrarOverlay();
  esconderMsg('searchMsg');
  esconderMsg('formMsg');

  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.controle +
    '/?user_field_names=false' +
    '&filter__' + CONFIG.fields.livro + '__equal=' + encodeURIComponent(livro) +
    '&filter__' + CONFIG.fields.pagina + '__equal=' + encodeURIComponent(pagina) +
    '&size=1';

  fetch(url, { headers: apiHeaders() })
    .then(function(r) {
      if (!r.ok) throw new Error('Erro na busca');
      return r.json();
    })
    .then(function(data) {
      var results = data.results || [];
      if (results.length > 0) {
        preencherFormularioExistente(results[0]);
        mostrarMsg('formMsg', 'info', 'Registro encontrado — L_' + livro + '_P_' + pagina);
      } else {
        prepararNovoRegistro(livro, pagina);
        mostrarMsg('formMsg', 'info', 'Novo registro — L_' + livro + '_P_' + pagina);
      }
      document.getElementById('formCard').style.display = 'block';
      document.getElementById('formCard').scrollIntoView({ behavior: 'smooth' });
    })
    .catch(function(e) {
      mostrarMsg('searchMsg', 'error', e.message || 'Erro ao buscar registro.');
      console.error(e);
    })
    .then(function() {
      esconderOverlay();
    });
}

// ═══════════════════════════════════════════════════════
// PREENCHER FORMULARIO (registro existente)
// ═══════════════════════════════════════════════════════
function preencherFormularioExistente(row) {
  resetarEstadoFormulario();
  controleRowId = row.id;

  var livro = row[CONFIG.fields.livro] || '';
  var pagina = row[CONFIG.fields.pagina] || '';

  document.getElementById('livroInput').value = livro;
  document.getElementById('livroInput').readOnly = true;
  document.getElementById('paginaInput').value = pagina;
  document.getElementById('paginaInput').readOnly = true;
  document.getElementById('identificadorDisplay').textContent = 'L_' + livro + '_P_' + pagina;

  // Tipo Escritura (link_row single)
  var tipoArr = row[CONFIG.fields.tipoEscritura];
  if (tipoArr && tipoArr.length > 0) {
    document.getElementById('tipoEscrituraSelect').value = tipoArr[0].id;
  }

  // Escrevente (link_row single)
  var escArr = row[CONFIG.fields.escrevente];
  if (escArr && escArr.length > 0) {
    document.getElementById('escreventeSelect').value = escArr[0].id;
  }

  // Data
  var dataVal = row[CONFIG.fields.data];
  if (dataVal) {
    document.getElementById('dataEscritura').value = dataVal;
  }

  // Protocolo (link_row single)
  var protoArr = row[CONFIG.fields.protocolo];
  if (protoArr && protoArr.length > 0) {
    protocoloSelecionadoId = protoArr[0].id;
    document.getElementById('protocoloInput').value = protoArr[0].value || '';
  }

  // Single selects
  var digVal = row[CONFIG.fields.digitalizacao];
  if (digVal && digVal.id) {
    document.getElementById('digitalizacaoSelect').value = digVal.id;
  }

  var doiVal = row[CONFIG.fields.doi];
  if (doiVal && doiVal.id) {
    document.getElementById('doiSelect').value = doiVal.id;
  }

  var odinVal = row[CONFIG.fields.odin];
  if (odinVal && odinVal.id) {
    document.getElementById('odinSelect').value = odinVal.id;
  }

  // Pendencias
  var pendencias = row[CONFIG.fields.pendencias] || '';
  document.getElementById('pendenciasTextarea').value = pendencias;
  atualizarPreviewPendencias();

  // Clientes (link_row multiplo)
  var clientesArr = row[CONFIG.fields.clientes];
  if (clientesArr && clientesArr.length > 0) {
    document.getElementById('toggleClientes').checked = true;
    document.getElementById('clientesSection').classList.add('open');
    for (var i = 0; i < clientesArr.length; i++) {
      adicionarCliente(clientesArr[i].id, clientesArr[i].value);
    }
  }

  // Imoveis (link_row multiplo) — carregar detalhes
  var imoveisArr = row[CONFIG.fields.imoveis];
  if (imoveisArr && imoveisArr.length > 0) {
    carregarImoveisExistentes(imoveisArr);
  }

  // Verificar se escritura foi retificada
  verificarRetificacoes(row);
}

function carregarImoveisExistentes(imoveisArr) {
  document.getElementById('toggleImoveis').checked = true;
  document.getElementById('imoveisSection').classList.add('open');

  var promises = [];
  for (var i = 0; i < imoveisArr.length; i++) {
    (function(imvId) {
      promises.push(
        fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.imoveis + '/' + imvId + '/?user_field_names=false', {
          headers: apiHeaders()
        }).then(function(r) { return r.json(); })
      );
    })(imoveisArr[i].id);
  }

  Promise.all(promises)
    .then(function(rows) {
      for (var j = 0; j < rows.length; j++) {
        adicionarImovelComDados(rows[j]);
      }
    })
    .catch(function(e) {
      console.error('Erro ao carregar imóveis:', e);
    });
}

// ═══════════════════════════════════════════════════════
// PREPARAR NOVO REGISTRO
// ═══════════════════════════════════════════════════════
function prepararNovoRegistro(livro, pagina) {
  resetarEstadoFormulario();
  controleRowId = null;

  document.getElementById('livroInput').value = livro;
  document.getElementById('livroInput').readOnly = true;
  document.getElementById('paginaInput').value = pagina;
  document.getElementById('paginaInput').readOnly = true;
  document.getElementById('identificadorDisplay').textContent = 'L_' + livro + '_P_' + pagina;

  // Defaults
  document.getElementById('digitalizacaoSelect').value = '3054';
  document.getElementById('doiSelect').value = '3058';
  document.getElementById('odinSelect').value = '3061';
}

function resetarEstadoFormulario() {
  controleRowId = null;
  protocoloSelecionadoId = null;
  protocoloStatusId = null;
  clientesSelecionados = [];
  imoveisBlocks = [];
  imoveisCounter = 0;

  document.getElementById('livroInput').value = '';
  document.getElementById('paginaInput').value = '';
  document.getElementById('identificadorDisplay').textContent = '-';
  document.getElementById('tipoEscrituraSelect').value = '';
  document.getElementById('escreventeSelect').value = '';
  document.getElementById('dataEscritura').value = '';
  document.getElementById('protocoloInput').value = '';
  document.getElementById('digitalizacaoSelect').value = '';
  document.getElementById('doiSelect').value = '';
  document.getElementById('odinSelect').value = '';
  document.getElementById('pendenciasTextarea').value = '';
  atualizarPreviewPendencias();

  document.getElementById('clientesChips').innerHTML = '';
  document.getElementById('clienteInput').value = '';
  document.getElementById('toggleClientes').checked = false;
  document.getElementById('clientesSection').classList.remove('open');

  document.getElementById('imoveisContainer').innerHTML = '';
  document.getElementById('toggleImoveis').checked = false;
  document.getElementById('imoveisSection').classList.remove('open');

  esconderMsg('formMsg');
  esconderMsg('protocoloInfo');
  document.getElementById('retificacaoBannerContainer').innerHTML = '';
}

// ═══════════════════════════════════════════════════════
// AUTOCOMPLETE — PROTOCOLO
// ═══════════════════════════════════════════════════════
function configurarAutocompleteProtocolo() {
  var input = document.getElementById('protocoloInput');
  input.addEventListener('input', function() {
    var termo = input.value.trim();

    // Se o usuario editar o campo apos selecionar, desvincular
    if (protocoloSelecionadoId) {
      protocoloSelecionadoId = null;
      protocoloStatusId = null;
      esconderMsg('protocoloInfo');
    }

    if (protocoloTimer) clearTimeout(protocoloTimer);
    if (termo.length < 2) {
      fecharAutoList('protocoloAutoList');
      return;
    }

    protocoloTimer = setTimeout(function() {
      buscarProtocolos(termo);
    }, 400);
  });
}

function buscarProtocolos(termo) {
  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.protocolo +
    '/?user_field_names=false' +
    '&filter__' + CONFIG.fields.protoNumero + '__contains=' + encodeURIComponent(termo) +
    '&size=10';

  fetch(url, { headers: apiHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var resultados = data.results || [];
      mostrarAutocompleteProtocolo(resultados);
    })
    .catch(function(e) {
      console.error('Erro na busca de protocolos:', e);
      fecharAutoList('protocoloAutoList');
    });
}

function mostrarAutocompleteProtocolo(resultados) {
  var lista = document.getElementById('protocoloAutoList');
  lista.innerHTML = '';

  if (resultados.length === 0) {
    var vazio = document.createElement('div');
    vazio.className = 'autocomplete-empty';
    vazio.textContent = 'Nenhum protocolo encontrado';
    lista.appendChild(vazio);
    lista.classList.add('open');
    return;
  }

  for (var i = 0; i < resultados.length; i++) {
    (function(row) {
      var numero = row[CONFIG.fields.protoNumero] || '';
      var statusObj = row[CONFIG.fields.protoStatus];
      var statusLabel = statusObj ? statusObj.value : '';

      var item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.innerHTML =
        '<div class="ac-name">Protocolo ' + numero + '</div>' +
        (statusLabel ? '<div class="ac-detail">Status: ' + statusLabel + '</div>' : '');

      item.addEventListener('click', function() {
        selecionarProtocolo(row);
      });
      lista.appendChild(item);
    })(resultados[i]);
  }

  lista.classList.add('open');
}

function selecionarProtocolo(row) {
  var numero = row[CONFIG.fields.protoNumero] || '';
  protocoloSelecionadoId = row.id;
  document.getElementById('protocoloInput').value = numero;
  fecharAutoList('protocoloAutoList');

  // Verificar status
  var statusObj = row[CONFIG.fields.protoStatus];
  protocoloStatusId = statusObj ? statusObj.id : null;

  if (protocoloStatusId === CONFIG.statusEmAndamento) {
    mostrarMsg('protocoloInfo', 'warning', 'Este protocolo será atualizado para "Finalizado" ao salvar.');
  } else {
    esconderMsg('protocoloInfo');
  }

  // Puxar clientes do protocolo (field_7241 — link_row multiplo)
  var interessados = row[CONFIG.fields.protoInteressado];
  if (interessados && interessados.length > 0) {
    var nomes = [];
    for (var i = 0; i < interessados.length; i++) {
      adicionarCliente(interessados[i].id, interessados[i].value);
      nomes.push(interessados[i].value);
    }

    // Expandir secao de clientes
    document.getElementById('toggleClientes').checked = true;
    document.getElementById('clientesSection').classList.add('open');

    // Mensagem informativa
    var msgTexto = 'Cliente(s) vinculado(s) ao protocolo: ' + nomes.join(', ');
    if (protocoloStatusId === CONFIG.statusEmAndamento) {
      // Ja tem warning, adicionar info abaixo
      var infoEl = document.getElementById('protocoloInfo');
      infoEl.innerHTML = infoEl.innerHTML + '<br>' + msgTexto;
    } else {
      mostrarMsg('protocoloInfo', 'info', msgTexto);
    }
  }
}

// ═══════════════════════════════════════════════════════
// AUTOCOMPLETE — CLIENTES
// ═══════════════════════════════════════════════════════
function configurarAutocompleteClientes() {
  var input = document.getElementById('clienteInput');
  input.addEventListener('input', function() {
    var termo = input.value.trim();
    if (clienteTimer) clearTimeout(clienteTimer);
    if (termo.length < 3) {
      fecharAutoList('clienteAutoList');
      return;
    }
    clienteTimer = setTimeout(function() {
      buscarClientes(termo);
    }, 400);
  });
}

function buscarClientes(termo) {
  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.clientes +
    '/?user_field_names=false' +
    '&filter__field_7237__contains=' + encodeURIComponent(termo) +
    '&size=10';

  fetch(url, { headers: apiHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var resultados = data.results || [];
      mostrarAutocompleteClientes(resultados);
    })
    .catch(function(e) {
      console.error('Erro na busca de clientes:', e);
      fecharAutoList('clienteAutoList');
    });
}

function mostrarAutocompleteClientes(resultados) {
  var lista = document.getElementById('clienteAutoList');
  lista.innerHTML = '';

  if (resultados.length === 0) {
    var vazio = document.createElement('div');
    vazio.className = 'autocomplete-empty';
    vazio.textContent = 'Nenhum cliente encontrado';
    lista.appendChild(vazio);
    lista.classList.add('open');
    return;
  }

  for (var i = 0; i < resultados.length; i++) {
    (function(cli) {
      var nome = cli['field_7237'] || '';
      var cpf = cli['field_7238'] || '';
      var cnpj = cli['field_7239'] || '';
      var detalhe = cpf ? ('CPF: ' + cpf) : (cnpj ? ('CNPJ: ' + cnpj) : '');

      var item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.innerHTML =
        '<div class="ac-name">' + nome + '</div>' +
        (detalhe ? '<div class="ac-detail">' + detalhe + '</div>' : '');

      item.addEventListener('click', function() {
        adicionarCliente(cli.id, nome);
        document.getElementById('clienteInput').value = '';
        fecharAutoList('clienteAutoList');
      });
      lista.appendChild(item);
    })(resultados[i]);
  }

  lista.classList.add('open');
}

// ═══════════════════════════════════════════════════════
// CHIPS DE CLIENTES
// ═══════════════════════════════════════════════════════
function adicionarCliente(id, nome) {
  // Verificar duplicata
  for (var i = 0; i < clientesSelecionados.length; i++) {
    if (clientesSelecionados[i].id === id) return;
  }
  clientesSelecionados.push({ id: id, nome: nome });
  renderizarChip(id, nome);
}

function renderizarChip(id, nome) {
  var container = document.getElementById('clientesChips');
  var chip = document.createElement('div');
  chip.className = 'chip';
  chip.id = 'chip-' + id;
  chip.innerHTML = '<span>' + nome + '</span>' +
    '<button type="button" class="chip-remove" title="Remover"><i class="ph ph-x"></i></button>';
  chip.querySelector('.chip-remove').addEventListener('click', function() {
    removerCliente(id);
  });
  container.appendChild(chip);
}

function removerCliente(id) {
  clientesSelecionados = clientesSelecionados.filter(function(c) { return c.id !== id; });
  var chip = document.getElementById('chip-' + id);
  if (chip) chip.parentNode.removeChild(chip);
}

// ═══════════════════════════════════════════════════════
// IMOVEIS — BLOCOS DINAMICOS
// ═══════════════════════════════════════════════════════
function adicionarImovel() {
  imoveisCounter++;
  var elementId = 'imovel-' + imoveisCounter;
  imoveisBlocks.push({ elementId: elementId, rowId: null });
  criarBlocoImovelDOM(elementId, imoveisBlocks.length, null);
}

function adicionarImovelComDados(rowData) {
  imoveisCounter++;
  var elementId = 'imovel-' + imoveisCounter;
  imoveisBlocks.push({ elementId: elementId, rowId: rowData.id });
  criarBlocoImovelDOM(elementId, imoveisBlocks.length, rowData);
}

function criarBlocoImovelDOM(elementId, numero, dados) {
  var container = document.getElementById('imoveisContainer');
  var block = document.createElement('div');
  block.className = 'imovel-block';
  block.id = elementId;

  var ufOptions = '<option value="">Selecione...</option>';
  for (var u = 0; u < UFS.length; u++) {
    var selected = (dados && dados[CONFIG.fields.imvEstado] === UFS[u]) ? ' selected' : '';
    ufOptions += '<option value="' + UFS[u] + '"' + selected + '>' + UFS[u] + '</option>';
  }

  var valorNeg = (dados && dados[CONFIG.fields.imvValorNegocio] != null) ? moedaParaExibicao(dados[CONFIG.fields.imvValorNegocio]) : '';
  var valorVenal = (dados && dados[CONFIG.fields.imvVenal] != null) ? moedaParaExibicao(dados[CONFIG.fields.imvVenal]) : '';
  var fracao = (dados && dados[CONFIG.fields.imvFracao] != null) ? dados[CONFIG.fields.imvFracao] : '';

  block.innerHTML =
    '<div class="imovel-header">' +
      '<span class="imovel-numero">Imóvel #' + numero + '</span>' +
      '<button type="button" class="btn-remove-imovel" onclick="removerImovel(\'' + elementId + '\')" title="Remover imóvel">' +
        '<i class="ph ph-trash"></i>' +
      '</button>' +
    '</div>' +
    '<div class="imovel-body">' +
      '<div class="imovel-grid">' +
        '<div class="form-group">' +
          '<label>CBI</label>' +
          '<input type="text" id="' + elementId + '-cbi" value="' + ((dados && dados[CONFIG.fields.imvCbi]) || '') + '" autocomplete="off">' +
        '</div>' +
        '<div class="form-group">' +
          '<label>Endereço do Imóvel</label>' +
          '<input type="text" id="' + elementId + '-endereco" value="' + ((dados && dados[CONFIG.fields.imvEndereco]) || '') + '" autocomplete="off">' +
        '</div>' +
        '<div class="form-group">' +
          '<label>Matrícula</label>' +
          '<input type="text" id="' + elementId + '-matricula" value="' + ((dados && dados[CONFIG.fields.imvMatricula]) || '') + '" autocomplete="off">' +
        '</div>' +
        '<div class="form-group">' +
          '<label>CRI</label>' +
          '<input type="text" id="' + elementId + '-cri" value="' + ((dados && dados[CONFIG.fields.imvCri]) || '') + '" autocomplete="off">' +
        '</div>' +
        '<div class="form-group">' +
          '<label>Valor do negócio</label>' +
          '<input type="text" id="' + elementId + '-valornegocio" value="' + valorNeg + '" autocomplete="off">' +
        '</div>' +
        '<div class="form-group">' +
          '<label>Venal</label>' +
          '<input type="text" id="' + elementId + '-venal" value="' + valorVenal + '" autocomplete="off">' +
        '</div>' +
        '<div class="form-group">' +
          '<label>Fração</label>' +
          '<input type="text" id="' + elementId + '-fracao" value="' + fracao + '" autocomplete="off">' +
        '</div>' +
        '<div class="form-group">' +
          '<label>Município</label>' +
          '<input type="text" id="' + elementId + '-municipio" value="' + ((dados && dados[CONFIG.fields.imvMunicipio]) || '') + '" autocomplete="off">' +
        '</div>' +
        '<div class="form-group">' +
          '<label>Estado</label>' +
          '<select id="' + elementId + '-estado">' + ufOptions + '</select>' +
        '</div>' +
      '</div>' +
    '</div>';

  container.appendChild(block);

  // Mascaras de moeda
  var valorInput = document.getElementById(elementId + '-valornegocio');
  var venalInput = document.getElementById(elementId + '-venal');

  valorInput.addEventListener('input', function() { valorInput.value = formatarMoeda(valorInput.value); });
  valorInput.addEventListener('blur', function() { valorInput.value = completarCentavosMoeda(valorInput.value); });
  venalInput.addEventListener('input', function() { venalInput.value = formatarMoeda(venalInput.value); });
  venalInput.addEventListener('blur', function() { venalInput.value = completarCentavosMoeda(venalInput.value); });
}

function removerImovel(elementId) {
  var idx = -1;
  for (var i = 0; i < imoveisBlocks.length; i++) {
    if (imoveisBlocks[i].elementId === elementId) { idx = i; break; }
  }
  if (idx === -1) return;

  var bloco = imoveisBlocks[idx];
  if (bloco.rowId) {
    if (!confirm('Deseja remover este imóvel do registro?')) return;
  }

  imoveisBlocks.splice(idx, 1);
  var el = document.getElementById(elementId);
  if (el) el.parentNode.removeChild(el);

  // Renumerar headers
  for (var j = 0; j < imoveisBlocks.length; j++) {
    var header = document.querySelector('#' + imoveisBlocks[j].elementId + ' .imovel-numero');
    if (header) header.textContent = 'Imóvel #' + (j + 1);
  }
}

function coletarImoveisDoFormulario() {
  var resultado = [];
  for (var i = 0; i < imoveisBlocks.length; i++) {
    var eid = imoveisBlocks[i].elementId;
    var payload = {};
    payload[CONFIG.fields.imvCbi] = document.getElementById(eid + '-cbi').value.trim();
    payload[CONFIG.fields.imvEndereco] = document.getElementById(eid + '-endereco').value.trim();
    payload[CONFIG.fields.imvMatricula] = document.getElementById(eid + '-matricula').value.trim();
    payload[CONFIG.fields.imvCri] = document.getElementById(eid + '-cri').value.trim();
    payload[CONFIG.fields.imvMunicipio] = document.getElementById(eid + '-municipio').value.trim();
    payload[CONFIG.fields.imvEstado] = document.getElementById(eid + '-estado').value;
    payload[CONFIG.fields.imvFracao] = document.getElementById(eid + '-fracao').value.trim() || null;

    var valorNeg = moedaParaAPI(document.getElementById(eid + '-valornegocio').value);
    if (valorNeg !== null) payload[CONFIG.fields.imvValorNegocio] = valorNeg;

    var venal = moedaParaAPI(document.getElementById(eid + '-venal').value);
    if (venal !== null) payload[CONFIG.fields.imvVenal] = venal;

    resultado.push({ rowId: imoveisBlocks[i].rowId, payload: payload });
  }
  return resultado;
}

// ═══════════════════════════════════════════════════════
// TOGGLE SECTIONS
// ═══════════════════════════════════════════════════════
function configurarToggleClientes() {
  var toggle = document.getElementById('toggleClientes');
  var section = document.getElementById('clientesSection');
  toggle.addEventListener('change', function() {
    if (toggle.checked) {
      section.classList.add('open');
      document.getElementById('clienteInput').focus();
    } else {
      section.classList.remove('open');
    }
  });
}

function configurarToggleImoveis() {
  var toggle = document.getElementById('toggleImoveis');
  var section = document.getElementById('imoveisSection');
  toggle.addEventListener('change', function() {
    if (toggle.checked) {
      section.classList.add('open');
    } else {
      section.classList.remove('open');
    }
  });
}

// ═══════════════════════════════════════════════════════
// AUTOCOMPLETE — FECHAR
// ═══════════════════════════════════════════════════════
function fecharAutoList(listId) {
  var el = document.getElementById(listId);
  if (el) el.classList.remove('open');
}

// ═══════════════════════════════════════════════════════
// VERIFICAR RETIFICACOES (banner)
// ═══════════════════════════════════════════════════════
function verificarRetificacoes(row) {
  var container = document.getElementById('retificacaoBannerContainer');
  container.innerHTML = '';

  var retifArr = row[CONFIG.fields.retificacaoReversa];
  if (!retifArr || retifArr.length === 0) return;

  var promises = [];
  for (var i = 0; i < retifArr.length; i++) {
    (function(retifId) {
      promises.push(
        fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.retificacoes + '/' + retifId + '/?user_field_names=false', {
          headers: apiHeaders()
        }).then(function(r) { return r.json(); })
      );
    })(retifArr[i].id);
  }

  Promise.all(promises)
    .then(function(rows) {
      for (var j = 0; j < rows.length; j++) {
        var livro = rows[j][CONFIG.fields.retifLivro] || '';
        var pagina = rows[j][CONFIG.fields.retifPagina] || '';
        var banner = document.createElement('div');
        banner.className = 'retificacao-banner';
        banner.innerHTML =
          '<i class="ph ph-warning-circle"></i>' +
          '<span>Escritura retificada pela escritura: <strong>Livro ' + livro + ', Página ' + pagina + '</strong></span>';
        container.appendChild(banner);
      }
    })
    .catch(function(e) {
      console.error('Erro ao verificar retificações:', e);
    });
}

// ═══════════════════════════════════════════════════════
// SALVAMENTO
// ═══════════════════════════════════════════════════════
function salvarControle() {
  var livro = document.getElementById('livroInput').value.trim();
  var pagina = document.getElementById('paginaInput').value.trim();

  if (!livro || !pagina) {
    mostrarMsg('formMsg', 'error', 'Livro e Página são obrigatórios.');
    return;
  }

  // Verificar se so tem livro e pagina preenchidos
  var tipoVal = document.getElementById('tipoEscrituraSelect').value;
  var escVal = document.getElementById('escreventeSelect').value;
  var dataVal = document.getElementById('dataEscritura').value;
  var digVal = document.getElementById('digitalizacaoSelect').value;
  var doiVal = document.getElementById('doiSelect').value;
  var odinVal = document.getElementById('odinSelect').value;
  var pendVal = document.getElementById('pendenciasTextarea').value.trim();
  var temAlgo = tipoVal || escVal || dataVal || protocoloSelecionadoId ||
    pendVal || clientesSelecionados.length > 0 || imoveisBlocks.length > 0;

  // Verificar se selects de status mudaram dos defaults (para registro novo)
  if (controleRowId === null) {
    var digMudou = digVal && digVal !== '3054';
    var doiMudou = doiVal && doiVal !== '3058';
    var odinMudou = odinVal && odinVal !== '3061';
    if (digMudou || doiMudou || odinMudou) temAlgo = true;
  } else {
    temAlgo = true; // Registro existente, sempre tem algo
  }

  if (!temAlgo) {
    if (!confirm('Deseja salvar um registro apenas com Livro e Página?')) return;
  }

  var btnSalvar = document.getElementById('btnSalvar');
  btnSalvar.disabled = true;
  mostrarOverlay();
  esconderMsg('formMsg');

  var imoveis = coletarImoveisDoFormulario();
  var novosImoveis = [];
  var imoveisExistentesIds = [];

  for (var i = 0; i < imoveis.length; i++) {
    if (imoveis[i].rowId) {
      imoveisExistentesIds.push(imoveis[i].rowId);
    } else {
      novosImoveis.push(imoveis[i].payload);
    }
  }

  // Criar novos imoveis em paralelo
  var criarPromises = [];
  for (var j = 0; j < novosImoveis.length; j++) {
    (function(payload) {
      criarPromises.push(
        fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.imoveis + '/?user_field_names=false', {
          method: 'POST',
          headers: apiHeaders(),
          body: JSON.stringify(payload)
        })
          .then(function(r) {
            if (!r.ok) return r.json().then(function(e) { throw new Error(e.detail || 'Erro ao criar imóvel'); });
            return r.json();
          })
          .then(function(data) { return data.id; })
      );
    })(novosImoveis[j]);
  }

  Promise.all(criarPromises)
    .then(function(novosIds) {
      var todosImoveisIds = imoveisExistentesIds.concat(novosIds);
      var payload = construirPayloadControle(todosImoveisIds);

      if (controleRowId === null) {
        return fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.controle + '/?user_field_names=false', {
          method: 'POST',
          headers: apiHeaders(),
          body: JSON.stringify(payload)
        });
      } else {
        return fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.controle + '/' + controleRowId + '/?user_field_names=false', {
          method: 'PATCH',
          headers: apiHeaders(),
          body: JSON.stringify(payload)
        });
      }
    })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(e) { throw new Error(e.detail || 'Erro ao salvar registro.'); });
      return r.json();
    })
    .then(function(data) {
      controleRowId = data.id;

      // Atualizar status do protocolo se necessario
      if (protocoloSelecionadoId && protocoloStatusId === CONFIG.statusEmAndamento) {
        var patchBody = {};
        patchBody[CONFIG.fields.protoStatus] = CONFIG.statusFinalizado;
        return fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.protocolo + '/' + protocoloSelecionadoId + '/?user_field_names=false', {
          method: 'PATCH',
          headers: apiHeaders(),
          body: JSON.stringify(patchBody)
        }).then(function(r2) {
          if (r2.ok) {
            protocoloStatusId = CONFIG.statusFinalizado;
            mostrarMsg('protocoloInfo', 'success', 'Protocolo atualizado para "Finalizado".');
          }
        });
      }
    })
    .then(function() {
      mostrarMsg('formMsg', 'success', 'Registro salvo com sucesso!');
      document.getElementById('livroInput').readOnly = true;
      document.getElementById('paginaInput').readOnly = true;

      // Atualizar rowIds dos imoveis novos que foram criados
      // (proximo carregamento tera os IDs corretos)
    })
    .catch(function(e) {
      mostrarMsg('formMsg', 'error', e.message || 'Erro ao salvar.');
      console.error(e);
    })
    .then(function() {
      btnSalvar.disabled = false;
      esconderOverlay();
    });
}

function construirPayloadControle(imoveisIds) {
  var payload = {};

  payload[CONFIG.fields.livro] = document.getElementById('livroInput').value.trim();
  payload[CONFIG.fields.pagina] = document.getElementById('paginaInput').value.trim();

  // Tipo Escritura (link_row single)
  var tipoVal = document.getElementById('tipoEscrituraSelect').value;
  payload[CONFIG.fields.tipoEscritura] = tipoVal ? [parseInt(tipoVal, 10)] : [];

  // Escrevente (link_row single)
  var escVal = document.getElementById('escreventeSelect').value;
  payload[CONFIG.fields.escrevente] = escVal ? [parseInt(escVal, 10)] : [];

  // Data
  var dataVal = document.getElementById('dataEscritura').value;
  if (dataVal) {
    payload[CONFIG.fields.data] = dataVal;
  }

  // Single selects
  var digVal = document.getElementById('digitalizacaoSelect').value;
  payload[CONFIG.fields.digitalizacao] = digVal ? parseInt(digVal, 10) : null;

  var doiVal = document.getElementById('doiSelect').value;
  payload[CONFIG.fields.doi] = doiVal ? parseInt(doiVal, 10) : null;

  var odinVal = document.getElementById('odinSelect').value;
  payload[CONFIG.fields.odin] = odinVal ? parseInt(odinVal, 10) : null;

  // Pendencias
  var pendVal = document.getElementById('pendenciasTextarea').value;
  payload[CONFIG.fields.pendencias] = pendVal;

  // Protocolo (link_row single)
  payload[CONFIG.fields.protocolo] = protocoloSelecionadoId ? [protocoloSelecionadoId] : [];

  // Clientes (link_row multiplo)
  var clienteIds = [];
  for (var i = 0; i < clientesSelecionados.length; i++) {
    clienteIds.push(clientesSelecionados[i].id);
  }
  payload[CONFIG.fields.clientes] = clienteIds;

  // Imoveis (link_row multiplo)
  payload[CONFIG.fields.imoveis] = imoveisIds || [];

  return payload;
}

// ═══════════════════════════════════════════════════════
// LIMPAR FORMULARIO
// ═══════════════════════════════════════════════════════
function limparFormulario() {
  resetarEstadoFormulario();
  document.getElementById('formCard').style.display = 'none';
  document.getElementById('buscaMascara').value = '';
  document.getElementById('buscaLivro').value = '';
  document.getElementById('buscaPagina').value = '';
  esconderMsg('searchMsg');
  document.getElementById('buscaMascara').focus();
}

// ═══════════════════════════════════════════════════════
// INICIALIZACAO
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  // Carregar dados dos selects
  carregarTiposEscritura();
  carregarEscreventes();
  popularSelectOpcoes('digitalizacaoSelect', CONFIG.digitalizacaoOpts);
  popularSelectOpcoes('doiSelect', CONFIG.doiOpts);
  popularSelectOpcoes('odinSelect', CONFIG.odinOpts);

  // Configurar componentes
  configurarMarkdownPendencias();
  configurarToggleClientes();
  configurarToggleImoveis();
  configurarAutocompleteProtocolo();
  configurarAutocompleteClientes();

  // Busca por Enter
  document.getElementById('buscaMascara').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); buscarPorMascara(); }
  });
  document.getElementById('buscaLivro').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); buscarPorLivroPagina(); }
  });
  document.getElementById('buscaPagina').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); buscarPorLivroPagina(); }
  });

  // Botoes de busca
  document.getElementById('btnBuscarMascara').addEventListener('click', buscarPorMascara);
  document.getElementById('btnBuscarLP').addEventListener('click', buscarPorLivroPagina);

  // Fechar autocompletes em click externo
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#protocoloInput') && !e.target.closest('#protocoloAutoList')) {
      fecharAutoList('protocoloAutoList');
    }
    if (!e.target.closest('#clienteInput') && !e.target.closest('#clienteAutoList')) {
      fecharAutoList('clienteAutoList');
    }
  });

  // Sidebar overlay
  var overlayEl = document.querySelector('.sidebar-overlay');
  if (overlayEl) {
    overlayEl.addEventListener('click', toggleSidebar);
  }

  // Foco inicial
  document.getElementById('buscaMascara').focus();
});
