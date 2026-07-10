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
    retificacoes: 753,
    substabelecimentos: 762,
    revogacao: 777
  },
  fields: {
    // Controle (745)
    livro: 'field_7189',
    pagina: 'field_7190',
    tipoEscritura: 'field_7194',
    escrevente: 'field_7198',
    digitalizacao: 'field_7200',
    doi: 'field_7201',
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
    protoServico: 'field_7242',       // link_row → Servicos (746)
    protoStatus: 'field_7252',
    // Retificacoes (campo reverso no Controle + campos da tabela 753)
    retificacaoReversa: 'field_7232',
    retifLivro: 'field_7228',
    retifPagina: 'field_7229',
    // Substabelecimentos (campo reverso no Controle + campos da tabela 762)
    substabelecimentoReverso: 'field_7331',
    substLivro: 'field_7322',
    substPagina: 'field_7323',
    // Revogação (campo reverso no Controle + campos da tabela 777)
    revogacaoReverso: 'field_7439',
    revogLivro: 'field_7436',
    revogPagina: 'field_7437'
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
  servicosBloqueados: [
    { id: 7,  label: 'Retificação (Ata)',               url: '/retificacoes' },
    { id: 8,  label: 'Retificação (Re-Ra)',              url: '/retificacoes' },
    { id: 11, label: 'Certidão notarial',                url: '/controle-certidoes' },
    { id: 30, label: 'Substabelecimento de procuração',  url: '/substabelecimentos' },
    { id: 57, label: 'Revogação de procuração',           url: '/revogacao-procuracao' }
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
// Anexos da escritura (aba Anexos — acervo /api/escrituras-anexos)
var ESC_ANEXOS_API = '/api/escrituras-anexos';
var ESC_ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'tif', 'tiff', 'doc', 'docx', 'odt', 'txt', 'md'];
var ESC_MAX_SIZE = 100 * 1024 * 1024; // 100 MB (o servidor é o backstop real)
var ESC_NOTA_MAX = 1000;
var escLivroAtual = null;
var escPaginaAtual = null;
var escNotaAberta = null; // nome do anexo com editor de nota aberto

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

function esconderCamposBusca() {
  var card = document.getElementById('searchCard');
  if (!card) return;
  var secoes = card.querySelectorAll('.form-section');
  for (var i = 0; i < secoes.length; i++) {
    secoes[i].style.display = 'none';
  }
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
  if (window.marked) {
    var html = marked.parse(md);
    el.innerHTML = (window.DOMPurify) ? DOMPurify.sanitize(html) : html;
  } else {
    el.textContent = md;
  }
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
// IDs de enum que indicam estado "concluído" (borda verde)
var CONCLUIDO = {
  digitalizacao: ['3055', '3056'],
  doi: ['3057', '3059']
};

function atualizarBordaConcluido(selectEl, idsConcluidos) {
  if (!selectEl) { return; }
  var val = selectEl.value;
  var concluido = false;
  for (var i = 0; i < idsConcluidos.length; i++) {
    if (idsConcluidos[i] === val) { concluido = true; break; }
  }
  if (concluido) {
    selectEl.classList.add('select-concluido');
  } else {
    selectEl.classList.remove('select-concluido');
  }
}

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
      rows.sort(function(a, b) {
        var tipoA = a['Tipo'] || '';
        var tipoB = b['Tipo'] || '';
        return tipoA.localeCompare(tipoB, 'pt-BR');
      });
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
function padPagina(valor) {
  while (valor.length < 3) {
    valor = '0' + valor;
  }
  return valor;
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

  pagina = padPagina(pagina);
  document.getElementById('buscaPagina').value = pagina;
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
      esconderCamposBusca();
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

  atualizarBordaConcluido(document.getElementById('digitalizacaoSelect'), CONCLUIDO.digitalizacao);
  atualizarBordaConcluido(document.getElementById('doiSelect'), CONCLUIDO.doi);

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

  // Verificar se procuração foi revogada
  verificarRevogacoes(row);

  // Verificar se escritura possui substabelecimentos
  verificarSubstabelecimentos(row);

  // Aba Anexos + card Documentos: registro existente — habilitar e carregar (eager)
  escLivroAtual = livro;
  escPaginaAtual = pagina;
  habilitarAbaAnexosEsc(true);
  carregarAnexosEscritura();
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
  atualizarBordaConcluido(document.getElementById('digitalizacaoSelect'), CONCLUIDO.digitalizacao);
  atualizarBordaConcluido(document.getElementById('doiSelect'), CONCLUIDO.doi);
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
  document.getElementById('substabelecimentoBannerContainer').innerHTML = '';

  // Aba Anexos + card Documentos: desabilitar, limpar as duas visões e voltar para Dados
  escLivroAtual = null;
  escPaginaAtual = null;
  renderizarAnexosEscritura([]);
  esconderMsg('escUploadMsg');
  habilitarAbaAnexosEsc(false);
  ativarAbaControle('dados');
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
  // ── Validação: serviço incompatível com o Controle ──
  var servicos = row[CONFIG.fields.protoServico] || [];
  for (var s = 0; s < servicos.length; s++) {
    var servicoId = servicos[s].id;
    for (var b = 0; b < CONFIG.servicosBloqueados.length; b++) {
      if (CONFIG.servicosBloqueados[b].id === servicoId) {
        var bloqueado = CONFIG.servicosBloqueados[b];
        document.getElementById('protocoloInput').value = '';
        fecharAutoList('protocoloAutoList');
        mostrarMsg('protocoloInfo', 'error',
          'Este protocolo é do serviço <strong>' + bloqueado.label + '</strong>, ' +
          'que deve ser cadastrado em sua página dedicada. ' +
          '<a href="' + bloqueado.url + '" style="color: inherit; text-decoration: underline; font-weight: 600;">' +
          'Clique aqui para acessar</a>.');
        return;
      }
    }
  }

  // ── Lógica existente (inalterada a partir daqui) ──
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
        var isAdvogado = !!cli['field_7430'];
        adicionarCliente(cli.id, nome, isAdvogado);
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
function adicionarCliente(id, nome, advogado) {
  // Verificar duplicata
  for (var i = 0; i < clientesSelecionados.length; i++) {
    if (clientesSelecionados[i].id === id) return;
  }
  clientesSelecionados.push({ id: id, nome: nome });
  renderizarChip(id, nome, !!advogado);
}

function renderizarChip(id, nome, advogado) {
  var container = document.getElementById('clientesChips');
  var chip = document.createElement('div');
  chip.className = 'chip';
  chip.id = 'chip-' + id;
  var icone = advogado ? '<i class="ph ph-scales" title="Advogado"></i> ' : '';
  chip.innerHTML = icone + '<span>' + nome + '</span>' +
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
// REVOGAÇÕES — Banner informativo (severo)
// ═══════════════════════════════════════════════════════
function verificarRevogacoes(row) {
  var container = document.getElementById('revogacaoBannerContainer');
  container.innerHTML = '';

  var revogArr = row[CONFIG.fields.revogacaoReverso];
  if (!revogArr || revogArr.length === 0) return;

  var promises = [];
  for (var i = 0; i < revogArr.length; i++) {
    (function(revogId) {
      promises.push(
        fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.revogacao + '/' + revogId + '/?user_field_names=false', {
          headers: apiHeaders()
        }).then(function(r) { return r.json(); })
      );
    })(revogArr[i].id);
  }

  Promise.all(promises)
    .then(function(rows) {
      for (var j = 0; j < rows.length; j++) {
        var livro = rows[j][CONFIG.fields.revogLivro] || '';
        var pagina = rows[j][CONFIG.fields.revogPagina] || '';
        var banner = document.createElement('div');
        banner.className = 'revogacao-banner';
        banner.innerHTML =
          '<i class="ph ph-warning-circle"></i>' +
          '<span>Esta procuração foi <strong>REVOGADA</strong> pela revogadora: <strong>Livro ' + livro + ', Página ' + pagina + '</strong></span>';
        container.appendChild(banner);
      }
    })
    .catch(function(e) {
      console.error('Erro ao verificar revogações:', e);
    });
}

// ═══════════════════════════════════════════════════════
// SUBSTABELECIMENTOS — Banner informativo
// ═══════════════════════════════════════════════════════
function verificarSubstabelecimentos(row) {
  var container = document.getElementById('substabelecimentoBannerContainer');
  container.innerHTML = '';

  var substArr = row[CONFIG.fields.substabelecimentoReverso];
  if (!substArr || substArr.length === 0) return;

  var promises = [];
  for (var i = 0; i < substArr.length; i++) {
    (function(substId) {
      promises.push(
        fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.substabelecimentos + '/' + substId + '/?user_field_names=false', {
          headers: apiHeaders()
        }).then(function(r) { return r.json(); })
      );
    })(substArr[i].id);
  }

  Promise.all(promises)
    .then(function(rows) {
      for (var j = 0; j < rows.length; j++) {
        var livro = rows[j][CONFIG.fields.substLivro] || '';
        var pagina = rows[j][CONFIG.fields.substPagina] || '';
        var banner = document.createElement('div');
        banner.className = 'substabelecimento-banner';
        banner.innerHTML =
          '<i class="ph ph-warning-circle"></i>' +
          '<span>Esta procuração possui substabelecimento: <strong>Livro ' + livro + ', Página ' + pagina + '</strong></span>';
        container.appendChild(banner);
      }
    })
    .catch(function(e) {
      console.error('Erro ao verificar substabelecimentos:', e);
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
  var pendVal = document.getElementById('pendenciasTextarea').value.trim();
  var temAlgo = tipoVal || escVal || dataVal || protocoloSelecionadoId ||
    pendVal || clientesSelecionados.length > 0 || imoveisBlocks.length > 0;

  // Verificar se selects de status mudaram dos defaults (para registro novo)
  if (controleRowId === null) {
    var digMudou = digVal && digVal !== '3054';
    var doiMudou = doiVal && doiVal !== '3058';
    if (digMudou || doiMudou) temAlgo = true;
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

      // Aba Anexos: registro agora salvo — habilitar (sem trocar de aba)
      escLivroAtual = document.getElementById('livroInput').value.trim();
      escPaginaAtual = document.getElementById('paginaInput').value.trim();
      habilitarAbaAnexosEsc(true);

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
      var formMsgEl = document.getElementById('formMsg');
      if (formMsgEl) { formMsgEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      document.getElementById('livroInput').readOnly = true;
      document.getElementById('paginaInput').readOnly = true;

      // Atualizar rowIds dos imoveis novos que foram criados
      // (proximo carregamento tera os IDs corretos)
    })
    .catch(function(e) {
      mostrarMsg('formMsg', 'error', e.message || 'Erro ao salvar.');
      var formMsgEl = document.getElementById('formMsg');
      if (formMsgEl) { formMsgEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
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

  // Imoveis (link_row multiplo) — DESATIVADO no front-end (decisão jun/2026).
  // A gravação do vínculo de imóveis foi suspensa: impede novas inserções e evita
  // sobrescrever o campo ao salvar. Reversível: descomentar a linha abaixo.
  // payload[CONFIG.fields.imoveis] = imoveisIds || [];

  return payload;
}

// ═══════════════════════════════════════════════════════
// ANEXOS DA ESCRITURA (aba Anexos — /api/escrituras-anexos)
// ═══════════════════════════════════════════════════════
function escapeHtml(texto) {
  return String(texto == null ? '' : texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Ícone por extensão e formatação de tamanho — espelhados de controle_certidoes.js
function iconeExtensao(ext) {
  var e = (ext || '').toLowerCase();
  if (e === 'pdf') return 'ph-file-pdf';
  if (e === 'doc' || e === 'docx' || e === 'odt') return 'ph-file-doc';
  if (e === 'jpg' || e === 'png') return 'ph-file-image';
  if (e === 'txt' || e === 'md') return 'ph-file-text';
  if (e === 'xls') return 'ph-file-xls';
  return 'ph-file';
}

function formatarTamanho(bytes) {
  if (!bytes || bytes === 0) return '0 KB';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1).replace('.', ',') + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
}

function escPodeAnexar() {
  var perfil = window.CURRENT_USER ? window.CURRENT_USER.perfil : '';
  return perfil === 'master' || perfil === 'administrador';
}

function escPodeExcluir() {
  return !!(window.CURRENT_USER && window.CURRENT_USER.perfil === 'master');
}

function ativarAbaControle(nome) {
  var alvo = document.querySelector('.tab-btn[data-tab="' + nome + '"]');
  if (alvo && alvo.disabled) return;
  var btns = document.querySelectorAll('.tab-btn');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].getAttribute('data-tab') === nome) btns[i].classList.add('active');
    else btns[i].classList.remove('active');
  }
  var paineis = document.querySelectorAll('.tab-content');
  for (var j = 0; j < paineis.length; j++) {
    if (paineis[j].id === 'tab-' + nome) paineis[j].classList.add('active');
    else paineis[j].classList.remove('active');
  }
}

function habilitarAbaAnexosEsc(habilitar) {
  var btn = document.getElementById('ctrlTabBtnAnexos');
  if (!btn) return;
  var podeAbrir = !!(habilitar && escLivroAtual && escPaginaAtual);
  btn.disabled = !podeAbrir;
  btn.title = podeAbrir ? '' : 'Salve o registro para anexar arquivos';
  // Card "Documentos Digitalizados": clicável somente quando a aba está habilitada
  var docsCard = document.getElementById('ctrlDocsCard');
  if (docsCard) {
    if (podeAbrir) docsCard.classList.add('ctrl-docs-clicavel');
    else docsCard.classList.remove('ctrl-docs-clicavel');
  }
  // Se desabilitar enquanto a aba Anexos está ativa, volta para Dados
  if (!podeAbrir && btn.classList.contains('active')) {
    ativarAbaControle('dados');
  }
}

function carregarAnexosEscritura() {
  var container = document.getElementById('escFilesList');
  if (!container || !escLivroAtual || !escPaginaAtual) return;
  fetch(ESC_ANEXOS_API + '/listar?livro=' + encodeURIComponent(escLivroAtual) +
        '&pagina=' + encodeURIComponent(escPaginaAtual), { headers: apiHeaders() })
    .then(function(resp) {
      if (!resp.ok) return resp.json().then(function(data) { throw new Error(data.erro || 'Erro ao carregar anexos.'); });
      return resp.json();
    })
    .then(function(data) {
      renderizarAnexosEscritura(data.arquivos || []);
    })
    .catch(function(err) {
      console.error('Erro ao carregar anexos:', err);
      container.innerHTML = '<div class="files-empty">Erro ao carregar anexos.</div>';
    });
}

function renderizarDocsCard(arquivos) {
  var lista = document.getElementById('ctrlDocsLista');
  if (!lista) return;
  lista.innerHTML = '';
  if (!arquivos || arquivos.length === 0) {
    var vazio = document.createElement('div');
    vazio.className = 'ctrl-docs-vazio';
    vazio.textContent = 'Nenhum anexo.';
    lista.appendChild(vazio);
    return;
  }
  for (var i = 0; i < arquivos.length; i++) {
    var item = document.createElement('div');
    item.className = 'ctrl-docs-item';
    var icone = document.createElement('i');
    icone.className = 'ph ' + iconeExtensao(arquivos[i].extensao);
    item.appendChild(icone);
    var nome = document.createElement('span');
    nome.textContent = arquivos[i].nome;
    item.appendChild(nome);
    lista.appendChild(item);
  }
}

function renderizarAnexosEscritura(arquivos) {
  // Atualiza as duas visões: card "Documentos Digitalizados" (aba Dados) + lista da aba Anexos
  renderizarDocsCard(arquivos);

  var container = document.getElementById('escFilesList');
  if (!container) return;
  escNotaAberta = null;
  container.innerHTML = '';
  if (!arquivos || arquivos.length === 0) {
    container.innerHTML = '<div class="files-empty">Nenhum anexo.</div>';
    return;
  }
  for (var i = 0; i < arquivos.length; i++) {
    container.appendChild(criarItemAnexoEscritura(arquivos[i]));
  }
}

function criarItemAnexoEscritura(f) {
  var item = document.createElement('div');
  item.className = 'file-item';

  var icone = document.createElement('i');
  icone.className = 'ph ' + iconeExtensao(f.extensao) + ' file-icon';
  item.appendChild(icone);

  var info = document.createElement('div');
  info.className = 'file-info';

  var link = document.createElement('a');
  link.className = 'file-name';
  link.href = ESC_ANEXOS_API + '/download?livro=' + encodeURIComponent(escLivroAtual) +
    '&pagina=' + encodeURIComponent(escPaginaAtual) + '&nome=' + encodeURIComponent(f.nome);
  link.textContent = f.nome;
  info.appendChild(link);

  var meta = document.createElement('span');
  meta.className = 'file-meta';
  meta.textContent = formatarTamanho(f.tamanho);
  info.appendChild(meta);

  if (f.nota) {
    var nota = document.createElement('div');
    nota.className = 'file-nota';
    nota.textContent = f.nota;
    info.appendChild(nota);
  }

  item.appendChild(info);

  if (escPodeAnexar()) {
    var btnNota = document.createElement('button');
    btnNota.type = 'button';
    btnNota.className = 'file-action';
    btnNota.title = f.nota ? 'Editar nota' : 'Adicionar nota';
    btnNota.innerHTML = '<i class="ph ph-note-pencil"></i>';
    btnNota.addEventListener('click', function() {
      abrirEditorNota(info, f);
    });
    item.appendChild(btnNota);
  }

  if (escPodeExcluir()) {
    var btnExcluir = document.createElement('button');
    btnExcluir.type = 'button';
    btnExcluir.className = 'file-delete';
    btnExcluir.title = 'Excluir anexo';
    btnExcluir.innerHTML = '<i class="ph ph-trash"></i>';
    btnExcluir.addEventListener('click', function() {
      excluirAnexoEscritura(f.nome);
    });
    item.appendChild(btnExcluir);
  }

  return item;
}

function fecharEditorNota() {
  var aberto = document.querySelector('#escFilesList .file-nota-editor');
  if (aberto && aberto.parentNode) aberto.parentNode.removeChild(aberto);
  escNotaAberta = null;
}

function abrirEditorNota(infoEl, f) {
  // Apenas um editor aberto por vez; clicar de novo no mesmo anexo fecha
  if (escNotaAberta === f.nome) { fecharEditorNota(); return; }
  fecharEditorNota();
  escNotaAberta = f.nome;

  var editor = document.createElement('div');
  editor.className = 'file-nota-editor';

  var ta = document.createElement('textarea');
  ta.maxLength = ESC_NOTA_MAX;
  ta.placeholder = 'Nota explicativa do anexo...';
  ta.value = f.nota || '';
  editor.appendChild(ta);

  var acoes = document.createElement('div');
  acoes.className = 'file-nota-acoes';

  var contador = document.createElement('span');
  contador.className = 'file-nota-contador';
  var atualizarContador = function() {
    contador.textContent = (ESC_NOTA_MAX - ta.value.length) + ' caracteres restantes';
  };
  ta.addEventListener('input', atualizarContador);
  atualizarContador();
  acoes.appendChild(contador);

  var btnCancelar = document.createElement('button');
  btnCancelar.type = 'button';
  btnCancelar.className = 'btn btn-outline';
  btnCancelar.innerHTML = '<i class="ph ph-x"></i> Cancelar';
  btnCancelar.addEventListener('click', fecharEditorNota);
  acoes.appendChild(btnCancelar);

  var btnSalvarNota = document.createElement('button');
  btnSalvarNota.type = 'button';
  btnSalvarNota.className = 'btn btn-primary';
  btnSalvarNota.innerHTML = '<i class="ph ph-check"></i> Salvar';
  btnSalvarNota.addEventListener('click', function() {
    salvarNotaEscritura(f.nome, ta.value, btnSalvarNota);
  });
  acoes.appendChild(btnSalvarNota);

  editor.appendChild(acoes);
  infoEl.appendChild(editor);
  ta.focus();
}

function salvarNotaEscritura(nome, texto, btnEl) {
  if (texto.length > ESC_NOTA_MAX) {
    alert('A nota excede o limite de ' + ESC_NOTA_MAX + ' caracteres.');
    return;
  }
  if (btnEl) btnEl.disabled = true;
  var formData = new FormData();
  formData.append('livro', escLivroAtual);
  formData.append('pagina', escPaginaAtual);
  formData.append('nome', nome);
  formData.append('texto', texto);
  fetch(ESC_ANEXOS_API + '/nota', { method: 'POST', body: formData })
    .then(function(resp) {
      if (!resp.ok) return resp.json().then(function(data) { throw new Error(data.erro || 'Erro ao salvar nota.'); });
      return resp.json();
    })
    .then(function(data) {
      // A resposta traz a lista completa atualizada; re-render fecha o editor
      renderizarAnexosEscritura(data.arquivos || []);
    })
    .catch(function(err) {
      if (btnEl) btnEl.disabled = false;
      alert(err.message || 'Erro ao salvar nota.');
    });
}

function excluirAnexoEscritura(nome) {
  if (!confirm('Deseja excluir o anexo "' + nome + '"?')) return;
  var url = ESC_ANEXOS_API + '/excluir?livro=' + encodeURIComponent(escLivroAtual) +
            '&pagina=' + encodeURIComponent(escPaginaAtual) +
            '&nome=' + encodeURIComponent(nome);
  fetch(url, { method: 'DELETE', headers: apiHeaders() })
    .then(function(resp) {
      if (!resp.ok) return resp.json().then(function(data) { throw new Error(data.erro || 'Erro ao excluir anexo.'); });
      return resp.json();
    })
    .then(function(data) { renderizarAnexosEscritura(data.arquivos || []); })
    .catch(function(err) { alert(err.message || 'Erro ao excluir anexo.'); });
}

function enviarAnexosEscritura(files) {
  if (!escLivroAtual || !escPaginaAtual) return;
  var total = files.length;
  var enviados = 0;
  var falhas = [];
  var ultimaLista = null;
  var cadeia = Promise.resolve();

  for (var i = 0; i < total; i++) {
    (function(file, idx) {
      cadeia = cadeia.then(function() {
        mostrarMsg('escUploadMsg', 'info', 'Enviando ' + (idx + 1) + ' de ' + total + '...');

        var ext = file.name.indexOf('.') !== -1 ? file.name.split('.').pop().toLowerCase() : '';
        if (ESC_ALLOWED_EXT.indexOf(ext) === -1) {
          falhas.push(escapeHtml(file.name) + ' — Extensão ".' + escapeHtml(ext) + '" não permitida.');
          return;
        }
        if (file.size > ESC_MAX_SIZE) {
          falhas.push(escapeHtml(file.name) + ' — Arquivo excede o tamanho máximo de 100 MB.');
          return;
        }

        var formData = new FormData();
        formData.append('livro', escLivroAtual);
        formData.append('pagina', escPaginaAtual);
        formData.append('arquivo', file);
        return fetch(ESC_ANEXOS_API + '/upload', { method: 'POST', body: formData })
          .then(function(resp) {
            if (!resp.ok) return resp.json().then(function(data) { throw new Error(data.erro || 'Erro ao enviar arquivo.'); });
            return resp.json();
          })
          .then(function(data) {
            enviados++;
            if (data && data.arquivos) ultimaLista = data.arquivos;
          })
          .catch(function(err) {
            falhas.push(escapeHtml(file.name) + ' — ' + escapeHtml(err.message || 'Erro ao enviar arquivo.'));
          });
      });
    })(files[i], i);
  }

  cadeia.then(function() {
    // Re-render único ao final do lote, com a lista da última resposta bem-sucedida
    if (ultimaLista) {
      renderizarAnexosEscritura(ultimaLista);
    }
    if (falhas.length === 0) {
      mostrarMsg('escUploadMsg', 'success', total === 1 ? 'Arquivo enviado com sucesso.' : total + ' arquivos enviados com sucesso.');
      setTimeout(function() { esconderMsg('escUploadMsg'); }, 4000);
    } else {
      var tipo = enviados === 0 ? 'error' : 'warning';
      mostrarMsg('escUploadMsg', tipo, enviados + ' de ' + total + ' anexados. Falhou: ' + falhas.join('; '));
    }
  });
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

  // Borda verde de "concluído" nos selects de Status e Controle
  var digSel = document.getElementById('digitalizacaoSelect');
  var doiSel = document.getElementById('doiSelect');
  digSel.addEventListener('change', function() {
    atualizarBordaConcluido(digSel, CONCLUIDO.digitalizacao);
  });
  doiSel.addEventListener('change', function() {
    atualizarBordaConcluido(doiSel, CONCLUIDO.doi);
  });

  // Configurar componentes
  configurarMarkdownPendencias();
  configurarToggleClientes();
  configurarToggleImoveis();
  configurarAutocompleteProtocolo();
  configurarAutocompleteClientes();

  // Busca por Enter
  document.getElementById('buscaLivro').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); buscarPorLivroPagina(); }
  });
  document.getElementById('buscaPagina').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); buscarPorLivroPagina(); }
  });

  // Botoes de busca
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

  // Card "Documentos Digitalizados" — clique ativa a aba Anexos (quando habilitada)
  var docsCardEl = document.getElementById('ctrlDocsCard');
  if (docsCardEl) {
    docsCardEl.addEventListener('click', function() {
      var btnAba = document.getElementById('ctrlTabBtnAnexos');
      if (btnAba && !btnAba.disabled) ativarAbaControle('anexos');
    });
  }

  // Sidebar overlay
  var overlayEl = document.querySelector('.sidebar-overlay');
  if (overlayEl) {
    overlayEl.addEventListener('click', toggleSidebar);
  }

  // Upload de anexos da escritura (seleção múltipla, envio sequencial)
  var btnEscSelectFiles = document.getElementById('btnEscSelectFiles');
  var escFileInput = document.getElementById('escFileInput');
  if (btnEscSelectFiles && escFileInput) {
    // Área de upload visível somente para quem pode anexar
    if (!escPodeAnexar()) {
      var escUploadArea = document.getElementById('escUploadArea');
      if (escUploadArea) escUploadArea.style.display = 'none';
    }
    btnEscSelectFiles.addEventListener('click', function() { escFileInput.click(); });
    escFileInput.addEventListener('change', function() {
      var lista = escFileInput.files;
      if (!lista || lista.length === 0) return;
      // Copia para array antes de limpar o input (limpar esvazia o FileList)
      var files = [];
      for (var fi = 0; fi < lista.length; fi++) { files.push(lista[fi]); }
      escFileInput.value = '';
      enviarAnexosEscritura(files);
    });
  }

  // Abertura via query params (ex: /controle?livro=150&pagina=025)
  var urlParams = new URLSearchParams(window.location.search);
  var livroParam = urlParams.get('livro');
  var paginaParam = urlParams.get('pagina');
  if (livroParam && paginaParam) {
    document.getElementById('buscaLivro').value = livroParam;
    document.getElementById('buscaPagina').value = paginaParam;
    executarBusca(livroParam, paginaParam);
  } else {
    // Foco inicial
    document.getElementById('buscaLivro').focus();
  }
});
