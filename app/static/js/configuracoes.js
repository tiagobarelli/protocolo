// configuracoes.js — ES5 estrito
// Página de Configurações (master only)

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════
// ABAS
// ═══════════════════════════════════════════════════════

function ativarAba(nomeAba) {
  var botoes = document.querySelectorAll('.tab-btn');
  var paineis = document.querySelectorAll('.tab-content');
  var i;
  for (i = 0; i < botoes.length; i++) {
    botoes[i].classList.remove('active');
  }
  for (i = 0; i < paineis.length; i++) {
    paineis[i].classList.remove('active');
  }
  var botao = document.querySelector('[data-tab="' + nomeAba + '"]');
  var painel = document.getElementById('tab-' + nomeAba);
  if (botao) botao.classList.add('active');
  if (painel) painel.classList.add('active');

  if (nomeAba === 'mensagens') {
    carregarMensagensInternas();
  } else if (nomeAba === 'remdest') {
    carregarRemDest();
  }
}

// ═══════════════════════════════════════════════════════
// PREVIEW DE CORES
// ═══════════════════════════════════════════════════════

function derivarCores(hexCor) {
  var hex = hexCor.replace('#', '');
  var r = parseInt(hex.substring(0, 2), 16);
  var g = parseInt(hex.substring(2, 4), 16);
  var b = parseInt(hex.substring(4, 6), 16);

  var bgR = Math.round(r + (255 - r) * 0.93);
  var bgG = Math.round(g + (255 - g) * 0.93);
  var bgB = Math.round(b + (255 - b) * 0.93);

  var brR = Math.round(r + (255 - r) * 0.65);
  var brG = Math.round(g + (255 - g) * 0.65);
  var brB = Math.round(b + (255 - b) * 0.65);

  function toHex(n) {
    var h = n.toString(16);
    return h.length < 2 ? '0' + h : h;
  }

  return {
    bg: '#' + toHex(bgR) + toHex(bgG) + toHex(bgB),
    border: '#' + toHex(brR) + toHex(brG) + toHex(brB),
    accent: hexCor
  };
}

function atualizarPreview(num) {
  var input = document.getElementById('corAlerta' + num + 'Input');
  var preview = document.getElementById('previewAlerta' + num);
  if (!input || !preview) return;
  var cores = derivarCores(input.value);
  preview.style.background = cores.bg;
  preview.style.borderColor = cores.border;
  preview.style.borderLeftColor = cores.accent;
  preview.style.borderLeftWidth = '3px';
}

// ═══════════════════════════════════════════════════════
// SALVAR
// ═══════════════════════════════════════════════════════

function salvarConfiguracoes() {
  var dias1 = document.getElementById('diasAlerta1Input').value.trim();
  var dias2 = document.getElementById('diasAlerta2Input').value.trim();

  var d1 = parseInt(dias1, 10);
  var d2 = parseInt(dias2, 10);
  if (isNaN(d1) || isNaN(d2) || d1 <= 0 || d2 <= 0) {
    mostrarMsg('formMsg', 'error', 'Os dias devem ser números maiores que zero.');
    return;
  }
  if (d1 >= d2) {
    mostrarMsg('formMsg', 'error', 'O primeiro alerta deve ter menos dias que o segundo.');
    return;
  }

  var payload = {
    protocolo_dias_alerta1: dias1,
    protocolo_dias_alerta2: dias2,
    protocolo_cor_alerta1: document.getElementById('corAlerta1Input').value,
    protocolo_cor_alerta2: document.getElementById('corAlerta2Input').value,
    cartorio_denominacao: document.getElementById('denominacaoInput').value.trim(),
    cartorio_endereco: document.getElementById('enderecoInput').value.trim(),
    cartorio_email: document.getElementById('emailInput').value.trim(),
    cartorio_telefone: document.getElementById('telefoneInput').value.trim(),
    cartorio_site: document.getElementById('siteInput').value.trim()
  };

  var btnSalvar = document.getElementById('btnSalvar');
  btnSalvar.disabled = true;
  esconderMsg('formMsg');

  fetch('/admin/configuracoes/salvar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) {
        mostrarToast('Configurações salvas com sucesso!', 'success');
      } else {
        mostrarMsg('formMsg', 'error', data.erro || 'Erro ao salvar.');
      }
      btnSalvar.disabled = false;
    })
    .catch(function(e) {
      mostrarMsg('formMsg', 'error', 'Erro de comunicação: ' + e.message);
      btnSalvar.disabled = false;
    });
}

// ═══════════════════════════════════════════════════════
// MENSAGENS INTERNAS — HELPERS
// ═══════════════════════════════════════════════════════

if (window.marked) {
  marked.use({ gfm: true, breaks: true });
}

function escapeHtmlIM(text) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(text == null ? '' : text));
  return div.innerHTML;
}

function formatarDataIM(str) {
  if (!str) return '';
  var d = new Date(String(str).replace(' ', 'T'));
  if (isNaN(d.getTime())) return str;
  var dd = ('0' + d.getDate()).slice(-2);
  var mm = ('0' + (d.getMonth() + 1)).slice(-2);
  var yyyy = d.getFullYear();
  var hh = ('0' + d.getHours()).slice(-2);
  var min = ('0' + d.getMinutes()).slice(-2);
  return dd + '/' + mm + '/' + yyyy + ' ' + hh + ':' + min;
}

function renderMarkdownIM(el, md) {
  if (!el) return;
  md = md || '';
  if (window.marked) {
    var html = marked.parse(md);
    el.innerHTML = (window.DOMPurify) ? DOMPurify.sanitize(html) : html;
  } else {
    el.textContent = md;
  }
}

// ═══════════════════════════════════════════════════════
// MENSAGENS INTERNAS — EDITOR MARKDOWN
// ═══════════════════════════════════════════════════════

function atualizarPreviewMensagem() {
  var ta = document.getElementById('imCorpoTextarea');
  var prev = document.getElementById('imCorpoPreview');
  if (!ta || !prev) return;
  var md = ta.value || '';
  if (!md.trim()) {
    prev.innerHTML = '<div class="md-placeholder">Pré-visualização do Markdown...</div>';
    return;
  }
  renderMarkdownIM(prev, md);
}

function configurarMarkdownMensagem() {
  var ta = document.getElementById('imCorpoTextarea');
  if (!ta) return;
  ta.addEventListener('input', atualizarPreviewMensagem);
  atualizarPreviewMensagem();
}

function addMarkdownMensagem(tipo) {
  var ta = document.getElementById('imCorpoTextarea');
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
// MENSAGENS INTERNAS — CRUD
// ═══════════════════════════════════════════════════════

function publicarMensagemInterna() {
  var inputTitulo = document.getElementById('imTitulo');
  var ta = document.getElementById('imCorpoTextarea');
  if (!inputTitulo || !ta) return;
  var titulo = inputTitulo.value.trim();
  var corpo = ta.value.trim();

  if (!titulo) {
    mostrarMsg('imMsg', 'error', 'O título não pode ser vazio.');
    return;
  }
  if (!corpo) {
    mostrarMsg('imMsg', 'error', 'O corpo não pode ser vazio.');
    return;
  }

  var btn = document.getElementById('imBtnPublicar');
  if (btn) btn.disabled = true;
  esconderMsg('imMsg');

  fetch('/api/internal-messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titulo: titulo, corpo: corpo })
  })
    .then(function(r) {
      return r.json().then(function(data) { return { ok: r.ok, data: data }; });
    })
    .then(function(res) {
      if (res.ok) {
        mostrarToast('Mensagem publicada com sucesso!', 'success');
        inputTitulo.value = '';
        ta.value = '';
        atualizarPreviewMensagem();
        carregarMensagensInternas();
      } else {
        mostrarMsg('imMsg', 'error', (res.data && res.data.error) || 'Erro ao publicar.');
      }
      if (btn) btn.disabled = false;
    })
    .catch(function(e) {
      mostrarMsg('imMsg', 'error', 'Erro de comunicação: ' + e.message);
      if (btn) btn.disabled = false;
    });
}

function carregarMensagensInternas() {
  var lista = document.getElementById('imLista');
  if (!lista) return;
  lista.innerHTML = '<div class="md-placeholder">Carregando mensagens...</div>';

  fetch('/api/internal-messages')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var mensagens = (data && data.messages) || [];
      if (!mensagens.length) {
        lista.innerHTML = '<div class="md-placeholder">Nenhuma mensagem publicada ainda.</div>';
        return;
      }
      var html = '';
      for (var i = 0; i < mensagens.length; i++) {
        var m = mensagens[i];
        var statusBadge = m.ativa
          ? '<span class="im-badge ativa"><i class="ph ph-check-circle"></i> Ativa</span>'
          : '<span class="im-badge inativa"><i class="ph ph-prohibit"></i> Desativada</span>';
        var acoes = '<button type="button" class="im-btn-mini" onclick="verHistoricoLeitura(' + m.id + ')">' +
              '<i class="ph ph-users"></i> Ver histórico (' + (m.total_leituras || 0) + ')</button>';
        if (m.ativa) {
          acoes += '<button type="button" class="im-btn-mini danger" onclick="desativarMensagemInterna(' + m.id + ')">' +
              '<i class="ph ph-prohibit"></i> Desativar</button>';
        }
        var corpoHtml = window.marked ? marked.parse(m.corpo || '') : escapeHtmlIM(m.corpo);
        if (window.marked && window.DOMPurify) corpoHtml = DOMPurify.sanitize(corpoHtml);
        html += '<div class="im-item ' + (m.ativa ? '' : 'inativa') + '">' +
          '<div class="im-item-head">' +
            '<div>' +
              '<p class="im-item-titulo">' + escapeHtmlIM(m.titulo) + '</p>' +
              '<div class="im-item-meta">' +
                '<span><i class="ph ph-user"></i> ' + escapeHtmlIM(m.criado_por_nome) + '</span>' +
                '<span><i class="ph ph-calendar-blank"></i> ' + formatarDataIM(m.criado_em) + '</span>' +
                statusBadge +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="im-item-corpo">' + corpoHtml + '</div>' +
          '<div class="im-item-acoes">' + acoes + '</div>' +
          '<div class="im-historico" id="imHistorico-' + m.id + '" style="display:none;"></div>' +
        '</div>';
      }
      lista.innerHTML = html;
    })
    .catch(function(e) {
      lista.innerHTML = '<div class="md-placeholder">Erro ao carregar mensagens: ' + escapeHtmlIM(e.message) + '</div>';
    });
}

function desativarMensagemInterna(id) {
  if (!window.confirm('Desativar esta mensagem? Ela deixará de aparecer para os usuários, mas o histórico de leitura é preservado.')) {
    return;
  }
  fetch('/api/internal-messages/' + id + '/deactivate', { method: 'PATCH' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data && data.ok) {
        carregarMensagensInternas();
      } else {
        alert((data && data.error) || 'Erro ao desativar.');
      }
    })
    .catch(function(e) {
      alert('Erro de comunicação: ' + e.message);
    });
}

function verHistoricoLeitura(id) {
  var box = document.getElementById('imHistorico-' + id);
  if (!box) return;
  if (box.style.display !== 'none') {
    box.style.display = 'none';
    return;
  }
  box.style.display = 'block';
  box.innerHTML = '<div class="md-placeholder">Carregando histórico...</div>';

  fetch('/api/internal-messages/' + id + '/reads')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var reads = (data && data.reads) || [];
      if (!reads.length) {
        box.innerHTML = '<div class="md-placeholder">Ninguém confirmou a leitura ainda.</div>';
        return;
      }
      var html = '';
      for (var i = 0; i < reads.length; i++) {
        html += '<div class="im-historico-linha">' +
          '<span class="im-nome">' + escapeHtmlIM(reads[i].usuario_nome) + '</span>' +
          '<span>' + formatarDataIM(reads[i].lida_em) + '</span>' +
        '</div>';
      }
      box.innerHTML = html;
    })
    .catch(function(e) {
      box.innerHTML = '<div class="md-placeholder">Erro ao carregar histórico: ' + escapeHtmlIM(e.message) + '</div>';
    });
}

// ═══════════════════════════════════════════════════════
// REMETENTES / DESTINATÁRIOS (tabela rem_dest_oficios = 780)
// ═══════════════════════════════════════════════════════

var TABLE_REMDEST = 780;
var REMDEST_NOME = 'field_7483';
var REMDEST_TIPO = 'field_7484';
var REMDEST_CRIADO_POR = 'field_7485';
var REMDEST_REC_VINC = 'field_7490';   // ofícios recebidos vinculados (reverso)
var REMDEST_ENV_VINC = 'field_7499';   // ofícios enviados vinculados (reverso)

var REMDEST_TIPOS = [
  { id: 3155, label: 'Judiciário' }, { id: 3156, label: 'Executivo' },
  { id: 3157, label: 'Legislativo' }, { id: 3158, label: 'Ministério Público' },
  { id: 3159, label: 'Defensoria Pública' }, { id: 3160, label: 'Instituição Financeira' },
  { id: 3161, label: 'Tabelionato de Notas' }, { id: 3162, label: 'Ofício de Registro' },
  { id: 3163, label: 'Outros' }
];

var remdestLista = [];
var remdestEditId = null;

function remdestHeaders() {
  return { 'Content-Type': 'application/json' };
}

function popularRemdestTipo() {
  var sel = document.getElementById('remdestTipo');
  if (!sel) return;
  sel.innerHTML = '<option value="">— selecione —</option>';
  var i;
  for (i = 0; i < REMDEST_TIPOS.length; i++) {
    var opt = document.createElement('option');
    opt.value = String(REMDEST_TIPOS[i].id);
    opt.textContent = REMDEST_TIPOS[i].label;
    sel.appendChild(opt);
  }
}

function carregarRemDest() {
  var lista = document.getElementById('remdestLista');
  if (!lista) return;
  lista.innerHTML = '<div class="remdest-vazio">Carregando...</div>';
  var url = '/api/baserow/database/rows/table/' + TABLE_REMDEST +
    '/?user_field_names=false&size=200&order_by=' + REMDEST_NOME;
  fetch(url, { headers: remdestHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      remdestLista = (data && data.results) || [];
      renderRemDest();
    })
    .catch(function(e) {
      lista.innerHTML = '<div class="remdest-vazio">Erro ao carregar: ' + escapeHtmlIM(e.message) + '</div>';
    });
}

function renderRemDest() {
  var lista = document.getElementById('remdestLista');
  if (!lista) return;
  if (!remdestLista.length) {
    lista.innerHTML = '<div class="remdest-vazio">Nenhum remetente/destinatário cadastrado.</div>';
    return;
  }
  var html = '';
  var i;
  for (i = 0; i < remdestLista.length; i++) {
    var row = remdestLista[i];
    var nome = row[REMDEST_NOME] || '';
    var tipoObj = row[REMDEST_TIPO];
    var tipoTxt = (tipoObj && tipoObj.value) ? tipoObj.value : '—';
    var emUso = ((row[REMDEST_REC_VINC] || []).length) + ((row[REMDEST_ENV_VINC] || []).length);

    var delAttrs = 'onclick="excluirRemDest(' + row.id + ')"';
    if (emUso > 0) {
      delAttrs = 'disabled title="Em uso em ' + emUso + ' ofício(s) — não pode ser excluído"';
    }

    html += '<div class="remdest-item">' +
      '<span class="remdest-item-nome">' + escapeHtmlIM(nome) + '</span>' +
      '<span class="remdest-tipo">' + escapeHtmlIM(tipoTxt) + '</span>' +
      '<div class="remdest-acoes">' +
        '<button type="button" class="remdest-btn-mini" onclick="editarRemDest(' + row.id + ')">' +
          '<i class="ph ph-pencil-simple"></i> Editar</button>' +
        '<button type="button" class="remdest-btn-mini remdest-del" ' + delAttrs + '>' +
          '<i class="ph ph-trash"></i> Excluir</button>' +
      '</div>' +
    '</div>';
  }
  lista.innerHTML = html;
}

function salvarRemDest() {
  var inputNome = document.getElementById('remdestNome');
  var selTipo = document.getElementById('remdestTipo');
  if (!inputNome || !selTipo) return;
  var nome = inputNome.value.trim();
  var tipo = selTipo.value;

  if (!nome) {
    mostrarMsg('remdestMsg', 'error', 'Informe o nome.');
    return;
  }
  if (!tipo) {
    mostrarMsg('remdestMsg', 'error', 'Selecione o tipo.');
    return;
  }

  // Guarda contra duplicado (nome case-insensitive), exceto a entidade em edição
  var nomeLower = nome.toLowerCase();
  var i;
  for (i = 0; i < remdestLista.length; i++) {
    if (remdestEditId !== null && remdestLista[i].id === remdestEditId) continue;
    var existente = (remdestLista[i][REMDEST_NOME] || '').toLowerCase();
    if (existente === nomeLower) {
      mostrarMsg('remdestMsg', 'warning', 'Já existe um remetente/destinatário com esse nome.');
      return;
    }
  }

  var payload = {};
  payload[REMDEST_NOME] = nome;
  payload[REMDEST_TIPO] = parseInt(tipo, 10);

  var btn = document.getElementById('remdestBtnSalvar');
  if (btn) btn.disabled = true;
  esconderMsg('remdestMsg');

  var url, metodo;
  if (remdestEditId === null) {
    payload[REMDEST_CRIADO_POR] = (window.CURRENT_USER && window.CURRENT_USER.nome) ? window.CURRENT_USER.nome : '';
    url = '/api/baserow/database/rows/table/' + TABLE_REMDEST + '/?user_field_names=false';
    metodo = 'POST';
  } else {
    url = '/api/baserow/database/rows/table/' + TABLE_REMDEST + '/' + remdestEditId + '/?user_field_names=false';
    metodo = 'PATCH';
  }

  fetch(url, { method: metodo, headers: remdestHeaders(), body: JSON.stringify(payload) })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(e) { throw new Error(e.detail || 'Erro ao salvar.'); });
      return r.json();
    })
    .then(function() {
      cancelarEdicaoRemDest();
      if (btn) btn.disabled = false;
      mostrarToast('Remetente/destinatário salvo com sucesso.', 'success');
      carregarRemDest();
    })
    .catch(function(e) {
      if (btn) btn.disabled = false;
      mostrarMsg('remdestMsg', 'error', e.message || 'Erro ao salvar.');
    });
}

function editarRemDest(id) {
  var i;
  for (i = 0; i < remdestLista.length; i++) {
    if (remdestLista[i].id === id) {
      var row = remdestLista[i];
      document.getElementById('remdestNome').value = row[REMDEST_NOME] || '';
      var tipoObj = row[REMDEST_TIPO];
      document.getElementById('remdestTipo').value = (tipoObj && tipoObj.id) ? String(tipoObj.id) : '';
      remdestEditId = id;
      var btn = document.getElementById('remdestBtnSalvar');
      btn.innerHTML = '<i class="ph ph-floppy-disk"></i> Salvar alteração';
      document.getElementById('remdestBtnCancelar').style.display = '';
      esconderMsg('remdestMsg');
      document.getElementById('remdestNome').focus();
      return;
    }
  }
}

function cancelarEdicaoRemDest() {
  remdestEditId = null;
  var inputNome = document.getElementById('remdestNome');
  var selTipo = document.getElementById('remdestTipo');
  if (inputNome) inputNome.value = '';
  if (selTipo) selTipo.value = '';
  var btn = document.getElementById('remdestBtnSalvar');
  if (btn) btn.innerHTML = '<i class="ph ph-plus-circle"></i> Adicionar';
  var btnCancel = document.getElementById('remdestBtnCancelar');
  if (btnCancel) btnCancel.style.display = 'none';
}

function excluirRemDest(id) {
  if (!window.confirm('Excluir este remetente/destinatário?')) return;
  var url = '/api/baserow/database/rows/table/' + TABLE_REMDEST + '/' + id + '/';
  fetch(url, { method: 'DELETE', headers: remdestHeaders() })
    .then(function(r) {
      if (!r.ok && r.status !== 204) {
        return r.json().then(function(e) { throw new Error(e.detail || 'Erro ao excluir.'); });
      }
      cancelarEdicaoRemDest();
      mostrarToast('Remetente/destinatário excluído.', 'success');
      carregarRemDest();
    })
    .catch(function(e) {
      mostrarMsg('remdestMsg', 'error', e.message || 'Erro ao excluir.');
    });
}

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function() {
  // Color picker listeners
  var cor1 = document.getElementById('corAlerta1Input');
  var cor2 = document.getElementById('corAlerta2Input');
  if (cor1) cor1.addEventListener('input', function() { atualizarPreview(1); });
  if (cor2) cor2.addEventListener('input', function() { atualizarPreview(2); });

  // Botão salvar
  var btnSalvar = document.getElementById('btnSalvar');
  if (btnSalvar) btnSalvar.addEventListener('click', salvarConfiguracoes);

  // Preview inicial
  atualizarPreview(1);
  atualizarPreview(2);

  // Mensagens internas (só existe para master)
  if (document.getElementById('tab-mensagens')) {
    configurarMarkdownMensagem();
    carregarMensagensInternas();
  }

  // Remetentes / Destinatários (só existe para master)
  if (document.getElementById('tab-remdest')) {
    popularRemdestTipo();
    var btnSalvarRD = document.getElementById('remdestBtnSalvar');
    if (btnSalvarRD) btnSalvarRD.addEventListener('click', salvarRemDest);
    var btnCancelarRD = document.getElementById('remdestBtnCancelar');
    if (btnCancelarRD) btnCancelarRD.addEventListener('click', cancelarEdicaoRemDest);
  }
});
