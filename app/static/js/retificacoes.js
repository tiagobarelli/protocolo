/* Retificações — ES5 only */
'use strict';

var API_BASE = '/api/baserow';

var CONFIG = {
  tables: {
    retificacoes: 753,
    controle: 745,
    escreventes: 747
  },
  fields: {
    // Retificacoes (753)
    identificador: 'field_7227',       // formula read-only
    livroRetif: 'field_7228',          // text
    paginaRetif: 'field_7229',         // text
    observacao: 'field_7230',          // long_text
    escrituraRetificada: 'field_7231', // link_row → Controle (multiplo)
    odin: 'field_7233',               // single_select
    data: 'field_7234',               // date
    escrevente: 'field_7235',          // link_row → Escreventes (single)
    anotado: 'field_7321',            // single_select
    // Controle (745) — para busca no autocomplete
    ctrlLivro: 'field_7189',
    ctrlPagina: 'field_7190'
  },
  odinOpts: [
    { id: 3062, label: 'Finalizado' },
    { id: 3063, label: 'Não finalizado' }
  ],
  anotadoOpts: [
    { id: 3081, label: 'Anotado' },
    { id: 3082, label: 'Anotação Pendente' }
  ]
};

// ═══════════════════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════════════════
var retificacaoRowId = null;
var escriturasSelecionadas = [];   // [{id, label}]
var escrituraTimer = null;

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
function apiHeaders() {
  return { 'Content-Type': 'application/json' };
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
// MARKDOWN (mesmo padrao de controle.js)
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

function atualizarPreviewObservacao() {
  var ta = document.getElementById('observacaoTextarea');
  var prev = document.getElementById('observacaoPreview');
  if (!ta || !prev) return;
  var md = ta.value || '';
  if (!md.trim()) {
    prev.innerHTML = '<div class="md-placeholder">Pré-visualização do Markdown...</div>';
    return;
  }
  renderMarkdownInto(prev, md);
}

function configurarMarkdownObservacao() {
  var ta = document.getElementById('observacaoTextarea');
  if (!ta) return;
  ta.addEventListener('input', atualizarPreviewObservacao);
  atualizarPreviewObservacao();
}

function addMarkdownObservacao(tipo) {
  var ta = document.getElementById('observacaoTextarea');
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

  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.retificacoes +
    '/?user_field_names=false' +
    '&filter__' + CONFIG.fields.livroRetif + '__equal=' + encodeURIComponent(livro) +
    '&filter__' + CONFIG.fields.paginaRetif + '__equal=' + encodeURIComponent(pagina) +
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
  retificacaoRowId = row.id;

  var livro = row[CONFIG.fields.livroRetif] || '';
  var pagina = row[CONFIG.fields.paginaRetif] || '';

  document.getElementById('livroInput').value = livro;
  document.getElementById('livroInput').readOnly = true;
  document.getElementById('paginaInput').value = pagina;
  document.getElementById('paginaInput').readOnly = true;
  document.getElementById('identificadorDisplay').textContent = 'L_' + livro + '_P_' + pagina;

  // Escrituras Retificadas (link_row multiplo)
  var escriturasArr = row[CONFIG.fields.escrituraRetificada];
  if (escriturasArr && escriturasArr.length > 0) {
    for (var i = 0; i < escriturasArr.length; i++) {
      adicionarEscritura(escriturasArr[i].id, escriturasArr[i].value);
    }
  }

  // Data
  var dataVal = row[CONFIG.fields.data];
  if (dataVal) {
    document.getElementById('dataRetificacao').value = dataVal;
  }

  // Escrevente (link_row single)
  var escArr = row[CONFIG.fields.escrevente];
  if (escArr && escArr.length > 0) {
    document.getElementById('escreventeSelect').value = escArr[0].id;
  }

  // ODIN (single_select)
  var odinVal = row[CONFIG.fields.odin];
  if (odinVal && odinVal.id) {
    document.getElementById('odinSelect').value = odinVal.id;
  }

  // Anotado (single_select)
  var anotadoVal = row[CONFIG.fields.anotado];
  if (anotadoVal && anotadoVal.id) {
    document.getElementById('anotadoSelect').value = anotadoVal.id;
  }

  // Observacao
  var obs = row[CONFIG.fields.observacao] || '';
  document.getElementById('observacaoTextarea').value = obs;
  atualizarPreviewObservacao();
}

// ═══════════════════════════════════════════════════════
// PREPARAR NOVO REGISTRO
// ═══════════════════════════════════════════════════════
function prepararNovoRegistro(livro, pagina) {
  resetarEstadoFormulario();
  retificacaoRowId = null;

  document.getElementById('livroInput').value = livro;
  document.getElementById('livroInput').readOnly = true;
  document.getElementById('paginaInput').value = pagina;
  document.getElementById('paginaInput').readOnly = true;
  document.getElementById('identificadorDisplay').textContent = 'L_' + livro + '_P_' + pagina;

  // Defaults
  document.getElementById('odinSelect').value = '3063';     // Nao finalizado
  document.getElementById('anotadoSelect').value = '3082';  // Anotacao Pendente
}

function resetarEstadoFormulario() {
  retificacaoRowId = null;
  escriturasSelecionadas = [];

  document.getElementById('livroInput').value = '';
  document.getElementById('paginaInput').value = '';
  document.getElementById('identificadorDisplay').textContent = '-';
  document.getElementById('escrituraInput').value = '';
  document.getElementById('escriturasChips').innerHTML = '';
  document.getElementById('dataRetificacao').value = '';
  document.getElementById('escreventeSelect').value = '';
  document.getElementById('odinSelect').value = '';
  document.getElementById('anotadoSelect').value = '';
  document.getElementById('observacaoTextarea').value = '';
  atualizarPreviewObservacao();

  esconderMsg('formMsg');
}

// ═══════════════════════════════════════════════════════
// AUTOCOMPLETE — ESCRITURAS (tabela Controle)
// ═══════════════════════════════════════════════════════
function configurarAutocompleteEscrituras() {
  var input = document.getElementById('escrituraInput');
  input.addEventListener('input', function() {
    var termo = input.value.trim();
    if (escrituraTimer) clearTimeout(escrituraTimer);
    if (termo.length < 2) {
      fecharAutoList('escrituraAutoList');
      return;
    }
    escrituraTimer = setTimeout(function() {
      buscarEscrituras(termo);
    }, 400);
  });
}

function buscarEscrituras(termo) {
  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.controle +
    '/?user_field_names=false' +
    '&search=' + encodeURIComponent(termo) +
    '&size=10';

  fetch(url, { headers: apiHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var resultados = data.results || [];
      mostrarAutocompleteEscrituras(resultados);
    })
    .catch(function(e) {
      console.error('Erro na busca de escrituras:', e);
      fecharAutoList('escrituraAutoList');
    });
}

function mostrarAutocompleteEscrituras(resultados) {
  var lista = document.getElementById('escrituraAutoList');
  lista.innerHTML = '';

  if (resultados.length === 0) {
    var vazio = document.createElement('div');
    vazio.className = 'autocomplete-empty';
    vazio.textContent = 'Nenhuma escritura encontrada';
    lista.appendChild(vazio);
    lista.classList.add('open');
    return;
  }

  for (var i = 0; i < resultados.length; i++) {
    (function(row) {
      var livro = row[CONFIG.fields.ctrlLivro] || '';
      var pagina = row[CONFIG.fields.ctrlPagina] || '';
      var label = 'L_' + livro + '_P_' + pagina;

      var item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.innerHTML =
        '<div class="ac-name">' + label + '</div>' +
        '<div class="ac-detail">Livro ' + livro + ', Página ' + pagina + '</div>';

      item.addEventListener('click', function() {
        adicionarEscritura(row.id, label);
        document.getElementById('escrituraInput').value = '';
        fecharAutoList('escrituraAutoList');
      });
      lista.appendChild(item);
    })(resultados[i]);
  }

  lista.classList.add('open');
}

// ═══════════════════════════════════════════════════════
// CHIPS DE ESCRITURAS
// ═══════════════════════════════════════════════════════
function adicionarEscritura(id, label) {
  // Verificar duplicata
  for (var i = 0; i < escriturasSelecionadas.length; i++) {
    if (escriturasSelecionadas[i].id === id) return;
  }
  escriturasSelecionadas.push({ id: id, label: label });
  renderizarChipEscritura(id, label);
}

function renderizarChipEscritura(id, label) {
  var container = document.getElementById('escriturasChips');
  var chip = document.createElement('div');
  chip.className = 'chip';
  chip.id = 'chip-escritura-' + id;
  chip.innerHTML = '<span>' + label + '</span>' +
    '<button type="button" class="chip-remove" title="Remover"><i class="ph ph-x"></i></button>';
  chip.querySelector('.chip-remove').addEventListener('click', function() {
    removerEscritura(id);
  });
  container.appendChild(chip);
}

function removerEscritura(id) {
  escriturasSelecionadas = escriturasSelecionadas.filter(function(e) { return e.id !== id; });
  var chip = document.getElementById('chip-escritura-' + id);
  if (chip) chip.parentNode.removeChild(chip);
}

// ═══════════════════════════════════════════════════════
// AUTOCOMPLETE — FECHAR
// ═══════════════════════════════════════════════════════
function fecharAutoList(listId) {
  var el = document.getElementById(listId);
  if (el) el.classList.remove('open');
}

// ═══════════════════════════════════════════════════════
// SALVAMENTO
// ═══════════════════════════════════════════════════════
function salvarRetificacao() {
  var livro = document.getElementById('livroInput').value.trim();
  var pagina = document.getElementById('paginaInput').value.trim();

  if (!livro || !pagina) {
    mostrarMsg('formMsg', 'error', 'Livro e Página são obrigatórios.');
    return;
  }

  var btnSalvar = document.getElementById('btnSalvar');
  btnSalvar.disabled = true;
  mostrarOverlay();
  esconderMsg('formMsg');

  var payload = construirPayloadRetificacao();

  var promessa;
  if (retificacaoRowId === null) {
    promessa = fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.retificacoes + '/?user_field_names=false', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(payload)
    });
  } else {
    promessa = fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.retificacoes + '/' + retificacaoRowId + '/?user_field_names=false', {
      method: 'PATCH',
      headers: apiHeaders(),
      body: JSON.stringify(payload)
    });
  }

  promessa
    .then(function(r) {
      if (!r.ok) return r.json().then(function(e) { throw new Error(e.detail || 'Erro ao salvar registro.'); });
      return r.json();
    })
    .then(function(data) {
      retificacaoRowId = data.id;
      mostrarMsg('formMsg', 'success', 'Registro salvo com sucesso!');
      document.getElementById('livroInput').readOnly = true;
      document.getElementById('paginaInput').readOnly = true;
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

function construirPayloadRetificacao() {
  var payload = {};

  // Livro e Pagina (text)
  payload[CONFIG.fields.livroRetif] = document.getElementById('livroInput').value.trim();
  payload[CONFIG.fields.paginaRetif] = document.getElementById('paginaInput').value.trim();

  // Escrituras Retificadas (link_row multiplo)
  var escrituraIds = [];
  for (var i = 0; i < escriturasSelecionadas.length; i++) {
    escrituraIds.push(escriturasSelecionadas[i].id);
  }
  payload[CONFIG.fields.escrituraRetificada] = escrituraIds;

  // Data
  var dataVal = document.getElementById('dataRetificacao').value;
  if (dataVal) {
    payload[CONFIG.fields.data] = dataVal;
  }

  // Escrevente (link_row single)
  var escVal = document.getElementById('escreventeSelect').value;
  payload[CONFIG.fields.escrevente] = escVal ? [parseInt(escVal, 10)] : [];

  // ODIN (single_select)
  var odinVal = document.getElementById('odinSelect').value;
  payload[CONFIG.fields.odin] = odinVal ? parseInt(odinVal, 10) : null;

  // Anotado (single_select)
  var anotadoVal = document.getElementById('anotadoSelect').value;
  payload[CONFIG.fields.anotado] = anotadoVal ? parseInt(anotadoVal, 10) : null;

  // Observacao (long_text)
  payload[CONFIG.fields.observacao] = document.getElementById('observacaoTextarea').value;

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
  carregarEscreventes();
  popularSelectOpcoes('odinSelect', CONFIG.odinOpts);
  popularSelectOpcoes('anotadoSelect', CONFIG.anotadoOpts);

  // Configurar componentes
  configurarMarkdownObservacao();
  configurarAutocompleteEscrituras();

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
    if (!e.target.closest('#escrituraInput') && !e.target.closest('#escrituraAutoList')) {
      fecharAutoList('escrituraAutoList');
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
