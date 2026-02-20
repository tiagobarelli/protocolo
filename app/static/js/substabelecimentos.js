/* Substabelecimentos — ES5 only */
'use strict';

var API_BASE = '/api/baserow';

var CONFIG = {
  tables: {
    substabelecimentos: 762,
    controle: 745,
    escreventes: 747
  },
  fields: {
    // Substabelecimentos (762)
    identificador: 'field_7330',           // formula read-only
    livroSubst: 'field_7322',              // text
    paginaSubst: 'field_7323',             // text
    observacao: 'field_7324',              // long_text
    procuracaoSubstabelecida: 'field_7325', // link_row → Controle (multiplo)
    odin: 'field_7326',                    // single_select
    data: 'field_7327',                    // date
    escrevente: 'field_7328',              // link_row → Escreventes (single)
    anotado: 'field_7329',                 // single_select
    // Controle (745) — para busca/filtro no autocomplete
    ctrlLivro: 'field_7189',
    ctrlPagina: 'field_7190',
    ctrlTipoEscritura: 'field_7194'        // link_row → Servicos (746)
  },
  // IDs dos tipos de ato permitidos na tabela Servicos (746)
  tiposPermitidos: [6, 30],  // 6 = Procuracao, 30 = Substabelecimento de procuracao
  odinOpts: [
    { id: 3083, label: 'Finalizado' },
    { id: 3084, label: 'Não finalizado' }
  ],
  anotadoOpts: [
    { id: 3085, label: 'Anotado' },
    { id: 3086, label: 'Anotação Pendente' }
  ]
};

// ═══════════════════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════════════════
var substabelecimentoRowId = null;
var procuracoesSelecionadas = [];   // [{id, label}]
var procuracaoTimer = null;

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

  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.substabelecimentos +
    '/?user_field_names=false' +
    '&filter__' + CONFIG.fields.livroSubst + '__equal=' + encodeURIComponent(livro) +
    '&filter__' + CONFIG.fields.paginaSubst + '__equal=' + encodeURIComponent(pagina) +
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
  substabelecimentoRowId = row.id;

  var livro = row[CONFIG.fields.livroSubst] || '';
  var pagina = row[CONFIG.fields.paginaSubst] || '';

  document.getElementById('livroInput').value = livro;
  document.getElementById('livroInput').readOnly = true;
  document.getElementById('paginaInput').value = pagina;
  document.getElementById('paginaInput').readOnly = true;
  document.getElementById('identificadorDisplay').textContent = 'L_' + livro + '_P_' + pagina;

  // Procuracoes Substabelecidas (link_row multiplo)
  var procArr = row[CONFIG.fields.procuracaoSubstabelecida];
  if (procArr && procArr.length > 0) {
    for (var i = 0; i < procArr.length; i++) {
      adicionarProcuracao(procArr[i].id, procArr[i].value);
    }
  }

  // Data
  var dataVal = row[CONFIG.fields.data];
  if (dataVal) {
    document.getElementById('dataSubstabelecimento').value = dataVal;
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
  substabelecimentoRowId = null;

  document.getElementById('livroInput').value = livro;
  document.getElementById('livroInput').readOnly = true;
  document.getElementById('paginaInput').value = pagina;
  document.getElementById('paginaInput').readOnly = true;
  document.getElementById('identificadorDisplay').textContent = 'L_' + livro + '_P_' + pagina;

  // Defaults
  document.getElementById('odinSelect').value = '3084';     // Nao finalizado
  document.getElementById('anotadoSelect').value = '3086';  // Anotacao Pendente
}

function resetarEstadoFormulario() {
  substabelecimentoRowId = null;
  procuracoesSelecionadas = [];

  document.getElementById('livroInput').value = '';
  document.getElementById('paginaInput').value = '';
  document.getElementById('identificadorDisplay').textContent = '-';
  document.getElementById('procuracaoInput').value = '';
  document.getElementById('procuracoesChips').innerHTML = '';
  document.getElementById('dataSubstabelecimento').value = '';
  document.getElementById('escreventeSelect').value = '';
  document.getElementById('odinSelect').value = '';
  document.getElementById('anotadoSelect').value = '';
  document.getElementById('observacaoTextarea').value = '';
  atualizarPreviewObservacao();

  esconderMsg('formMsg');
}

// ═══════════════════════════════════════════════════════
// AUTOCOMPLETE — PROCURACOES (tabela Controle, filtrado)
// ═══════════════════════════════════════════════════════
function configurarAutocompleteProcuracoes() {
  var input = document.getElementById('procuracaoInput');
  input.addEventListener('input', function() {
    var termo = input.value.trim();
    if (procuracaoTimer) clearTimeout(procuracaoTimer);
    if (termo.length < 2) {
      fecharAutoList('procuracaoAutoList');
      return;
    }
    procuracaoTimer = setTimeout(function() {
      buscarProcuracoes(termo);
    }, 400);
  });
}

function buscarProcuracoes(termo) {
  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.controle +
    '/?user_field_names=false' +
    '&search=' + encodeURIComponent(termo) +
    '&size=20';

  fetch(url, { headers: apiHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var resultados = data.results || [];
      // Filtro client-side: apenas Procuracao (6) ou Substabelecimento de procuracao (30)
      var filtrados = [];
      for (var i = 0; i < resultados.length; i++) {
        var tipoArr = resultados[i][CONFIG.fields.ctrlTipoEscritura] || [];
        for (var j = 0; j < tipoArr.length; j++) {
          if (CONFIG.tiposPermitidos.indexOf(tipoArr[j].id) !== -1) {
            filtrados.push(resultados[i]);
            break;
          }
        }
      }
      mostrarAutocompleteProcuracoes(filtrados);
    })
    .catch(function(e) {
      console.error('Erro na busca de procurações:', e);
      fecharAutoList('procuracaoAutoList');
    });
}

function mostrarAutocompleteProcuracoes(resultados) {
  var lista = document.getElementById('procuracaoAutoList');
  lista.innerHTML = '';

  if (resultados.length === 0) {
    var vazio = document.createElement('div');
    vazio.className = 'autocomplete-empty';
    vazio.textContent = 'Nenhuma procuração encontrada';
    lista.appendChild(vazio);
    lista.classList.add('open');
    return;
  }

  for (var i = 0; i < resultados.length; i++) {
    (function(row) {
      var livro = row[CONFIG.fields.ctrlLivro] || '';
      var pagina = row[CONFIG.fields.ctrlPagina] || '';
      var label = 'L_' + livro + '_P_' + pagina;

      // Obter nome do tipo de ato
      var tipoArr = row[CONFIG.fields.ctrlTipoEscritura] || [];
      var tipoNome = tipoArr.length > 0 ? tipoArr[0].value : '';

      var item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.innerHTML =
        '<div class="ac-name">' + label + '</div>' +
        '<div class="ac-detail">Livro ' + livro + ', Página ' + pagina + (tipoNome ? ' — ' + tipoNome : '') + '</div>';

      item.addEventListener('click', function() {
        adicionarProcuracao(row.id, label);
        document.getElementById('procuracaoInput').value = '';
        fecharAutoList('procuracaoAutoList');
      });
      lista.appendChild(item);
    })(resultados[i]);
  }

  lista.classList.add('open');
}

// ═══════════════════════════════════════════════════════
// CHIPS DE PROCURACOES
// ═══════════════════════════════════════════════════════
function adicionarProcuracao(id, label) {
  // Verificar duplicata
  for (var i = 0; i < procuracoesSelecionadas.length; i++) {
    if (procuracoesSelecionadas[i].id === id) return;
  }
  procuracoesSelecionadas.push({ id: id, label: label });
  renderizarChipProcuracao(id, label);
}

function renderizarChipProcuracao(id, label) {
  var container = document.getElementById('procuracoesChips');
  var chip = document.createElement('div');
  chip.className = 'chip';
  chip.id = 'chip-procuracao-' + id;
  chip.innerHTML = '<span>' + label + '</span>' +
    '<button type="button" class="chip-remove" title="Remover"><i class="ph ph-x"></i></button>';
  chip.querySelector('.chip-remove').addEventListener('click', function() {
    removerProcuracao(id);
  });
  container.appendChild(chip);
}

function removerProcuracao(id) {
  procuracoesSelecionadas = procuracoesSelecionadas.filter(function(p) { return p.id !== id; });
  var chip = document.getElementById('chip-procuracao-' + id);
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
function salvarSubstabelecimento() {
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

  var payload = construirPayloadSubstabelecimento();

  var promessa;
  if (substabelecimentoRowId === null) {
    promessa = fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.substabelecimentos + '/?user_field_names=false', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(payload)
    });
  } else {
    promessa = fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.substabelecimentos + '/' + substabelecimentoRowId + '/?user_field_names=false', {
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
      substabelecimentoRowId = data.id;
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

function construirPayloadSubstabelecimento() {
  var payload = {};

  // Livro e Pagina (text)
  payload[CONFIG.fields.livroSubst] = document.getElementById('livroInput').value.trim();
  payload[CONFIG.fields.paginaSubst] = document.getElementById('paginaInput').value.trim();

  // Procuracoes Substabelecidas (link_row multiplo)
  var procIds = [];
  for (var i = 0; i < procuracoesSelecionadas.length; i++) {
    procIds.push(procuracoesSelecionadas[i].id);
  }
  payload[CONFIG.fields.procuracaoSubstabelecida] = procIds;

  // Data
  var dataVal = document.getElementById('dataSubstabelecimento').value;
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
  configurarAutocompleteProcuracoes();

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
    if (!e.target.closest('#procuracaoInput') && !e.target.closest('#procuracaoAutoList')) {
      fecharAutoList('procuracaoAutoList');
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
