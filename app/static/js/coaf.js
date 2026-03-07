/* Controle COAF — ES5 only */
'use strict';

var API_BASE = '/api/baserow';

var CONFIG = {
  tables: {
    coaf: 756,
    controle: 745,
    tipagem: 746
  },
  fields: {
    // COAF (756)
    indexador:           'field_7259',
    objetoAnalise:       'field_7258',
    dataEscritura:       'field_7261',
    tipoEscritura:       'field_7262',
    analise:             'field_7264',
    detalhamento:        'field_7265',
    numeroComunicacao:   'field_7266',
    dataComunicacao:     'field_7267',
    auxFiltro:           'field_7333',
    reciboPdf:           'field_7428',
    // Controle (745)
    ctrlLivro:           'field_7189',
    ctrlPagina:          'field_7190',
    ctrlTipoEscritura:   'field_7194',
    ctrlData:            'field_7226',
    ctrlCoaf:            'field_7260',
    // Tipagem (746)
    tipNome:             'field_7191',
    tipSujeitoCoaf:      'field_7427'
  },
  analiseOpts: [
    { id: 3068, label: 'Negócio ordinário: ausência de indícios de lavagem de dinheiro' },
    { id: 3069, label: 'Loteamento: transmissão ordinária de lote (sem indícios)' },
    { id: 3070, label: 'Procuração ordinária: sem hipóteses de suspeita' },
    { id: 3071, label: 'Comunicação objetiva (art. 171, CNN-CNJ)' },
    { id: 3072, label: 'Ato suspeito: Comunicação subjetiva' }
  ],
  analiseComComunicacao: [3071, 3072]
};

// ═══════════════════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════════════════
var coafRowId = null;
var controleRowId = null;
var controleRow = null;
var arquivoPdfPendente = null;
var removerPdfPendente = false;
var reciboAtual = [];

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

function padPagina(valor) {
  while (valor.length < 3) {
    valor = '0' + valor;
  }
  return valor;
}

function formatarDataBR(isoDate) {
  if (!isoDate) return '-';
  var partes = isoDate.split('-');
  if (partes.length !== 3) return isoDate;
  return partes[2] + '/' + partes[1] + '/' + partes[0];
}

// ═══════════════════════════════════════════════════════
// MARKDOWN
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

function atualizarPreviewDetalhamento() {
  var ta = document.getElementById('detalhamentoTextarea');
  var prev = document.getElementById('detalhamentoPreview');
  if (!ta || !prev) return;
  var md = ta.value || '';
  if (!md.trim()) {
    prev.innerHTML = '<div class="md-placeholder">Pré-visualização do Markdown...</div>';
    return;
  }
  renderMarkdownInto(prev, md);
}

function inserirMarkdown(tipo, textareaId) {
  var ta = document.getElementById(textareaId);
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

function toggleNavGroup(btn) {
  var group = btn.parentElement;
  group.classList.toggle('open');
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

  pagina = padPagina(pagina);
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

  if (parseInt(pagina, 10) > 400) {
    mostrarMsg('searchMsg', 'error', 'A página não pode exceder 400.');
    return;
  }

  pagina = padPagina(pagina);
  executarBusca(livro, pagina);
}

function executarBusca(livro, pagina) {
  mostrarOverlay();
  esconderMsg('searchMsg');
  esconderMsg('elegibilidadeMsg');
  document.getElementById('infoCard').style.display = 'none';
  document.getElementById('formCard').style.display = 'none';

  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.controle + '/' +
    '?user_field_names=false' +
    '&filter__' + CONFIG.fields.ctrlLivro + '__equal=' + encodeURIComponent(livro) +
    '&filter__' + CONFIG.fields.ctrlPagina + '__equal=' + encodeURIComponent(pagina) +
    '&size=1';

  fetch(url, { headers: apiHeaders() })
    .then(function(r) {
      if (!r.ok) throw new Error('Erro ao buscar escritura.');
      return r.json();
    })
    .then(function(data) {
      if (!data.results || data.results.length === 0) {
        mostrarMsg('searchMsg', 'error', 'Nenhuma escritura encontrada com L_' + livro + '_P_' + pagina + '.');
        esconderOverlay();
        return;
      }

      var row = data.results[0];
      controleRowId = row.id;
      controleRow = row;
      verificarElegibilidade(row, livro, pagina);
    })
    .catch(function(e) {
      mostrarMsg('searchMsg', 'error', e.message || 'Erro ao buscar escritura.');
      esconderOverlay();
    });
}

// ═══════════════════════════════════════════════════════
// ELEGIBILIDADE
// ═══════════════════════════════════════════════════════
function verificarElegibilidade(row, livro, pagina) {
  var tipoArr = row[CONFIG.fields.ctrlTipoEscritura];
  if (!tipoArr || tipoArr.length === 0) {
    mostrarMsg('searchMsg', 'error', 'Esta escritura não possui tipo definido. Cadastre o tipo no Controle de Escrituras antes de prosseguir.');
    esconderOverlay();
    return;
  }

  var tipoId = tipoArr[0].id;
  var tipoNome = tipoArr[0].value || '';

  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.tipagem + '/' + tipoId + '/?user_field_names=false';

  fetch(url, { headers: apiHeaders() })
    .then(function(r) {
      if (!r.ok) throw new Error('Erro ao verificar tipo de escritura.');
      return r.json();
    })
    .then(function(tipoData) {
      var sujeitoCoaf = tipoData[CONFIG.fields.tipSujeitoCoaf];

      // Mostrar info card
      popularInfoCard(row, tipoNome, livro, pagina);
      document.getElementById('infoCard').style.display = '';

      if (!sujeitoCoaf) {
        mostrarMsg('elegibilidadeMsg', 'warning', 'Este tipo de escritura (' + tipoNome + ') não está sujeito à análise COAF.');
        document.getElementById('formCard').style.display = 'none';
        esconderOverlay();
        return;
      }

      verificarRegistroExistente(row);
    })
    .catch(function(e) {
      mostrarMsg('searchMsg', 'error', e.message || 'Erro ao verificar elegibilidade.');
      esconderOverlay();
    });
}

// ═══════════════════════════════════════════════════════
// INFO CARD
// ═══════════════════════════════════════════════════════
function popularInfoCard(row, tipoNome, livro, pagina) {
  var coafArr = row[CONFIG.fields.ctrlCoaf];
  var identificador;

  // Se já existe registro COAF, usar o lookup; senão montar manualmente
  if (coafArr && coafArr.length > 0) {
    // Será atualizado em preencherFormulario quando tiver os dados do COAF
    identificador = 'L_' + livro + '_P_' + pagina;
  } else {
    identificador = 'L_' + livro + '_P_' + pagina;
  }
  document.getElementById('infoIdentificador').textContent = identificador;

  // Data e tipo vêm dos lookups do COAF se existir, senão ficam como '-'
  var dataRaw = row[CONFIG.fields.ctrlData] || '';
  document.getElementById('infoData').textContent = formatarDataBR(dataRaw);
  document.getElementById('infoTipo').textContent = tipoNome || '-';
}

function atualizarInfoComCoaf(coafRow) {
  // Atualizar identificador do lookup
  var indexArr = coafRow[CONFIG.fields.indexador];
  if (indexArr && indexArr.length > 0) {
    document.getElementById('infoIdentificador').textContent = indexArr[0].value || document.getElementById('infoIdentificador').textContent;
  }

  // Atualizar data do lookup
  var dataArr = coafRow[CONFIG.fields.dataEscritura];
  if (dataArr && dataArr.length > 0) {
    document.getElementById('infoData').textContent = formatarDataBR(dataArr[0].value);
  }

  // Atualizar tipo do lookup
  var tipoArr = coafRow[CONFIG.fields.tipoEscritura];
  if (tipoArr && tipoArr.length > 0) {
    document.getElementById('infoTipo').textContent = tipoArr[0].value;
  }
}

// ═══════════════════════════════════════════════════════
// REGISTRO EXISTENTE
// ═══════════════════════════════════════════════════════
function verificarRegistroExistente(row) {
  var coafArr = row[CONFIG.fields.ctrlCoaf];

  if (!coafArr || coafArr.length === 0) {
    // Modo NOVO
    coafRowId = null;
    limparFormulario();
    document.getElementById('formCard').style.display = '';
    atualizarCamposCondicionais();
    esconderOverlay();
    return;
  }

  // Modo EDIÇÃO — buscar registro COAF
  var coafId = coafArr[0].id;
  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.coaf + '/' + coafId + '/?user_field_names=false';

  fetch(url, { headers: apiHeaders() })
    .then(function(r) {
      if (!r.ok) throw new Error('Erro ao carregar registro COAF.');
      return r.json();
    })
    .then(function(coafRow) {
      coafRowId = coafRow.id;
      preencherFormulario(coafRow);
      atualizarInfoComCoaf(coafRow);
      document.getElementById('formCard').style.display = '';
      esconderOverlay();
    })
    .catch(function(e) {
      mostrarMsg('searchMsg', 'error', e.message || 'Erro ao carregar registro COAF.');
      esconderOverlay();
    });
}

// ═══════════════════════════════════════════════════════
// FORMULARIO
// ═══════════════════════════════════════════════════════
function limparFormulario() {
  document.getElementById('analiseSelect').value = '';
  document.getElementById('detalhamentoTextarea').value = '';
  document.getElementById('numeroComunicacao').value = '';
  document.getElementById('dataComunicacao').value = '';
  document.getElementById('nomeArquivoSelecionado').textContent = '';
  arquivoPdfPendente = null;
  removerPdfPendente = false;
  reciboAtual = [];
  atualizarComponenteRecibo([]);
  atualizarPreviewDetalhamento();
  esconderMsg('formMsg');
  esconderMsg('uploadMsg');
}

function preencherFormulario(coafRow) {
  limparFormulario();

  // Análise (single_select)
  var analiseVal = coafRow[CONFIG.fields.analise];
  if (analiseVal && analiseVal.id) {
    document.getElementById('analiseSelect').value = analiseVal.id;
  }

  // Detalhamento
  var detalhamento = coafRow[CONFIG.fields.detalhamento] || '';
  document.getElementById('detalhamentoTextarea').value = detalhamento;
  atualizarPreviewDetalhamento();

  // Número da comunicação
  var numCom = coafRow[CONFIG.fields.numeroComunicacao] || '';
  document.getElementById('numeroComunicacao').value = numCom;

  // Data da comunicação
  var dataCom = coafRow[CONFIG.fields.dataComunicacao] || '';
  document.getElementById('dataComunicacao').value = dataCom;

  // Recibo PDF
  var reciboArr = coafRow[CONFIG.fields.reciboPdf] || [];
  reciboAtual = reciboArr;
  atualizarComponenteRecibo(reciboArr);

  atualizarCamposCondicionais();
}

// ═══════════════════════════════════════════════════════
// CAMPOS CONDICIONAIS
// ═══════════════════════════════════════════════════════
function atualizarCamposCondicionais() {
  var secao = document.getElementById('secaoComunicacao');
  var analiseVal = parseInt(document.getElementById('analiseSelect').value, 10);
  var habilitado = CONFIG.analiseComComunicacao.indexOf(analiseVal) !== -1;

  if (habilitado) {
    secao.classList.remove('disabled');
  } else {
    secao.classList.add('disabled');
  }
}

// ═══════════════════════════════════════════════════════
// COMPONENTE RECIBO PDF
// ═══════════════════════════════════════════════════════
function atualizarComponenteRecibo(fileArray) {
  var existente = document.getElementById('reciboExistente');
  var upload = document.getElementById('reciboUpload');
  var nomeEl = document.getElementById('reciboNome');

  if (fileArray && fileArray.length > 0) {
    var arquivo = fileArray[0];
    var nomeHtml = '<a href="' + arquivo.url + '" target="_blank" rel="noopener">' +
      (arquivo.visible_name || arquivo.name || 'arquivo.pdf') + '</a>';
    nomeEl.innerHTML = nomeHtml;
    existente.style.display = 'flex';
    upload.style.display = 'none';
  } else {
    existente.style.display = 'none';
    upload.style.display = '';
  }
}

function onFileSelected() {
  var input = document.getElementById('fileInputPdf');
  var nomeSpan = document.getElementById('nomeArquivoSelecionado');

  if (input.files && input.files.length > 0) {
    var file = input.files[0];
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().match(/\.pdf$/)) {
      mostrarMsg('uploadMsg', 'error', 'Somente arquivos PDF são aceitos.');
      input.value = '';
      arquivoPdfPendente = null;
      nomeSpan.textContent = '';
      return;
    }
    arquivoPdfPendente = file;
    nomeSpan.textContent = file.name;
    esconderMsg('uploadMsg');
  } else {
    arquivoPdfPendente = null;
    nomeSpan.textContent = '';
  }
}

// ═══════════════════════════════════════════════════════
// SALVAMENTO
// ═══════════════════════════════════════════════════════
function salvar() {
  var btnSalvar = document.getElementById('btnSalvar');
  esconderMsg('formMsg');

  // Validação
  var analiseVal = document.getElementById('analiseSelect').value;
  if (!analiseVal) {
    mostrarMsg('formMsg', 'error', 'Selecione o Parecer antes de salvar.');
    return;
  }

  btnSalvar.disabled = true;
  mostrarOverlay();

  var analiseId = parseInt(analiseVal, 10);
  var ehComunicacao = CONFIG.analiseComComunicacao.indexOf(analiseId) !== -1;

  // Se tem arquivo pendente e é comunicação, fazer upload primeiro
  if (ehComunicacao && arquivoPdfPendente) {
    uploadArquivo(arquivoPdfPendente)
      .then(function(uploadResult) {
        return salvarRegistro(analiseId, ehComunicacao, uploadResult);
      })
      .then(function() {
        finalizarSalvamento();
      })
      .catch(function(e) {
        mostrarMsg('formMsg', 'error', e.message || 'Erro ao salvar.');
        btnSalvar.disabled = false;
        esconderOverlay();
      });
  } else {
    salvarRegistro(analiseId, ehComunicacao, null)
      .then(function() {
        finalizarSalvamento();
      })
      .catch(function(e) {
        mostrarMsg('formMsg', 'error', e.message || 'Erro ao salvar.');
        btnSalvar.disabled = false;
        esconderOverlay();
      });
  }
}

function uploadArquivo(file) {
  var formData = new FormData();
  formData.append('file', file);

  return fetch(API_BASE + '/user-files/upload-file/', {
    method: 'POST',
    body: formData
  })
  .then(function(r) {
    if (!r.ok) throw new Error('Erro ao enviar arquivo PDF.');
    return r.json();
  });
}

function salvarRegistro(analiseId, ehComunicacao, uploadResult) {
  var payload = {};
  payload[CONFIG.fields.objetoAnalise] = [controleRowId];
  payload[CONFIG.fields.analise] = analiseId;
  payload[CONFIG.fields.detalhamento] = document.getElementById('detalhamentoTextarea').value;

  if (ehComunicacao) {
    payload[CONFIG.fields.numeroComunicacao] = document.getElementById('numeroComunicacao').value;
    var dataVal = document.getElementById('dataComunicacao').value;
    payload[CONFIG.fields.dataComunicacao] = dataVal || null;

    if (uploadResult) {
      payload[CONFIG.fields.reciboPdf] = [{ name: uploadResult.name }];
    } else if (removerPdfPendente) {
      payload[CONFIG.fields.reciboPdf] = [];
    }
  }

  var url, method;
  if (coafRowId === null) {
    url = API_BASE + '/database/rows/table/' + CONFIG.tables.coaf + '/?user_field_names=false';
    method = 'POST';
  } else {
    url = API_BASE + '/database/rows/table/' + CONFIG.tables.coaf + '/' + coafRowId + '/?user_field_names=false';
    method = 'PATCH';
  }

  return fetch(url, {
    method: method,
    headers: apiHeaders(),
    body: JSON.stringify(payload)
  })
  .then(function(r) {
    if (!r.ok) return r.json().then(function(e) {
      var msg = e.detail;
      if (typeof msg === 'object') msg = JSON.stringify(msg);
      throw new Error(msg || 'Erro ao salvar registro COAF.');
    });
    return r.json();
  })
  .then(function(data) {
    var novoId = data.id;

    if (coafRowId === null) {
      coafRowId = novoId;

      // PATCH de segurança no Controle — apenas se field_7260 estiver vazio
      var coafArr = controleRow[CONFIG.fields.ctrlCoaf];
      if (!coafArr || coafArr.length === 0) {
        var patchUrl = API_BASE + '/database/rows/table/' + CONFIG.tables.controle + '/' + controleRowId + '/?user_field_names=false';
        var patchPayload = {};
        patchPayload[CONFIG.fields.ctrlCoaf] = [coafRowId];
        return fetch(patchUrl, {
          method: 'PATCH',
          headers: apiHeaders(),
          body: JSON.stringify(patchPayload)
        }).then(function(r2) {
          if (!r2.ok) {
            console.warn('PATCH de segurança no Controle falhou, mas o registro COAF foi criado.');
          }
        });
      }
    }
  });
}

function finalizarSalvamento() {
  mostrarMsg('formMsg', 'success', 'Registro COAF salvo com sucesso!');

  // Lock campos de busca
  document.getElementById('buscaLivro').readOnly = true;
  document.getElementById('buscaPagina').readOnly = true;
  document.getElementById('buscaMascara').readOnly = true;

  // Zerar estado de arquivo
  arquivoPdfPendente = null;
  removerPdfPendente = false;
  document.getElementById('nomeArquivoSelecionado').textContent = '';
  document.getElementById('fileInputPdf').value = '';

  // Recarregar dados do registro COAF
  recarregarCoaf();
}

function recarregarCoaf() {
  if (!coafRowId) {
    document.getElementById('btnSalvar').disabled = false;
    esconderOverlay();
    return;
  }

  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.coaf + '/' + coafRowId + '/?user_field_names=false';

  fetch(url, { headers: apiHeaders() })
    .then(function(r) {
      if (!r.ok) throw new Error('Erro ao recarregar.');
      return r.json();
    })
    .then(function(coafRow) {
      // Atualizar recibo
      var reciboArr = coafRow[CONFIG.fields.reciboPdf] || [];
      reciboAtual = reciboArr;
      atualizarComponenteRecibo(reciboArr);
      atualizarInfoComCoaf(coafRow);
    })
    .catch(function(e) {
      console.error('Erro ao recarregar COAF:', e);
    })
    .then(function() {
      document.getElementById('btnSalvar').disabled = false;
      esconderOverlay();
    });
}

// ═══════════════════════════════════════════════════════
// POPULAR SELECT DE ANALISE
// ═══════════════════════════════════════════════════════
function popularAnaliseSelect() {
  var sel = document.getElementById('analiseSelect');
  for (var i = 0; i < CONFIG.analiseOpts.length; i++) {
    var opt = document.createElement('option');
    opt.value = CONFIG.analiseOpts[i].id;
    opt.textContent = CONFIG.analiseOpts[i].label;
    sel.appendChild(opt);
  }
}

// ═══════════════════════════════════════════════════════
// EVENTOS
// ═══════════════════════════════════════════════════════
function configurarEventos() {
  // Busca por máscara — Enter + botão
  document.getElementById('buscaMascara').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); buscarPorMascara(); }
  });
  document.getElementById('btnBuscarMascara').addEventListener('click', buscarPorMascara);

  // Busca por Livro + Página — Enter + botão
  document.getElementById('buscaLivro').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); buscarPorLivroPagina(); }
  });
  document.getElementById('buscaPagina').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); buscarPorLivroPagina(); }
  });
  document.getElementById('btnBuscarLP').addEventListener('click', buscarPorLivroPagina);

  // Análise — change
  document.getElementById('analiseSelect').addEventListener('change', atualizarCamposCondicionais);

  // Recibo PDF — selecionar
  document.getElementById('btnSelecionarPdf').addEventListener('click', function() {
    document.getElementById('fileInputPdf').click();
  });
  document.getElementById('fileInputPdf').addEventListener('change', onFileSelected);

  // Recibo PDF — substituir
  document.getElementById('btnSubstituirPdf').addEventListener('click', function() {
    document.getElementById('fileInputPdf').click();
  });

  // Recibo PDF — remover
  document.getElementById('btnRemoverPdf').addEventListener('click', function() {
    if (!confirm('Deseja remover o recibo PDF?')) return;
    removerPdfPendente = true;
    reciboAtual = [];
    atualizarComponenteRecibo([]);
    mostrarMsg('uploadMsg', 'info', 'O recibo será removido ao salvar.');
  });

  // Salvar
  document.getElementById('btnSalvar').addEventListener('click', salvar);

  // Markdown preview
  document.getElementById('detalhamentoTextarea').addEventListener('input', atualizarPreviewDetalhamento);

  // Sidebar overlay
  var overlayEl = document.querySelector('.sidebar-overlay');
  if (overlayEl) {
    overlayEl.addEventListener('click', toggleSidebar);
  }
}

// ═══════════════════════════════════════════════════════
// INICIALIZACAO
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  popularAnaliseSelect();
  configurarEventos();
  atualizarPreviewDetalhamento();

  var params = new URLSearchParams(window.location.search);
  var qLivro = params.get('livro');
  var qPagina = params.get('pagina');
  if (qLivro && qPagina) {
    document.getElementById('buscaLivro').value = qLivro;
    document.getElementById('buscaPagina').value = qPagina;
    buscarPorLivroPagina();
  }

  document.getElementById('buscaMascara').focus();
});
