/* Controle de Certidoes — ES5 only */
'use strict';

var API_BASE = '/api/baserow';

var CONFIG = {
  tables: {
    certidoes: 776,
    protocolo: 755,
    clientes: 754,
    controle: 745,
    servicos: 746
  },
  fields: {
    // Controle_Certidao (776)
    dataEmissao: 'field_7414',
    protocolo: 'field_7415',
    subtipo: 'field_7417',
    entregueEm: 'field_7418',
    requerenteCertidao: 'field_7419',
    requeridoCertidao: 'field_7421',
    observacao: 'field_7423',
    linkControle: 'field_7424',
    formaEntrega: 'field_7426',
    // Protocolo (755)
    protoNumero: 'field_7240',
    protoInteressado: 'field_7241',
    protoServico: 'field_7242',
    protoStatus: 'field_7252',
    // Clientes (754)
    clienteNome: 'field_7237',
    clienteCpf: 'field_7238',
    clienteCnpj: 'field_7239',
    // Controle (745)
    ctrlLivro: 'field_7189',
    ctrlPagina: 'field_7190',
    ctrlClientes: 'field_7379'
  },
  servicoCertidaoId: 11,
  statusEmAndamento: 3064,
  statusFinalizado: 3065,
  subtipoOpts: [
    { id: 3110, label: 'Ato notarial' },
    { id: 3111, label: 'Termo de comparecimento' },
    { id: 3116, label: 'Documento do acervo' }
  ],
  formaEntregaOpts: [
    { id: 3112, label: 'e-mail' },
    { id: 3113, label: 'eNotariado' },
    { id: 3114, label: 'Presencial' },
    { id: 3115, label: 'Correio' }
  ]
};

// ═══════════════════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════════════════
var certidaoRowId = null;
var protocoloSelecionadoId = null;
var protocoloStatusId = null;
var requerenteSelecionadoId = null;
var requeridosSelecionados = [];    // [{id, label}]
var escriturasSelecionadas = [];    // [{id, label}]
var protocoloTimer = null;
var clienteTimer = null;
var escrituraTimer = null;
// Bloqueio de edicao por registro (modulo compartilhado bloqueio_registro.js)
var bloqueioWidget = null;
var bloqueioTravadoUI = false; // ultimo estado de travamento aplicado na UI

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
  if (!el) return;
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

// ═══════════════════════════════════════════════════════
// BUSCA POR PROTOCOLO (Secao B)
// ═══════════════════════════════════════════════════════
function buscarPorProtocolo() {
  var numero = document.getElementById('buscaProtocolo').value.trim();
  esconderMsg('searchMsg');

  if (!numero) {
    mostrarMsg('searchMsg', 'error', 'Preencha o número do protocolo.');
    return;
  }

  mostrarOverlay();

  var url755 = API_BASE + '/database/rows/table/' + CONFIG.tables.protocolo +
    '/?user_field_names=false' +
    '&filter__' + CONFIG.fields.protoNumero + '__equal=' + encodeURIComponent(numero) +
    '&size=1';

  fetch(url755, { headers: apiHeaders() })
    .then(function(r) {
      if (!r.ok) throw new Error('Erro na busca');
      return r.json();
    })
    .then(function(data) {
      var results = data.results || [];
      if (results.length === 0) {
        throw new Error('Protocolo não encontrado.');
      }
      var protoRow = results[0];

      // Validar servico = Certidao notarial (id 11)
      var servicos = protoRow[CONFIG.fields.protoServico] || [];
      var ehCertidao = false;
      for (var i = 0; i < servicos.length; i++) {
        if (servicos[i].id === CONFIG.servicoCertidaoId) {
          ehCertidao = true;
          break;
        }
      }

      if (!ehCertidao) {
        mostrarMsg('searchMsg', 'warning',
          'Este protocolo não corresponde a uma certidão notarial. Use a página de controle de escrituras, se for o caso.');
        return;
      }

      // Verificar se ja existe certidao para este protocolo
      var url776 = API_BASE + '/database/rows/table/' + CONFIG.tables.certidoes +
        '/?user_field_names=false' +
        '&filter__' + CONFIG.fields.protocolo + '__link_row_has=' + protoRow.id +
        '&size=1';

      return fetch(url776, { headers: apiHeaders() })
        .then(function(r2) {
          if (!r2.ok) throw new Error('Erro na busca de certidões');
          return r2.json();
        })
        .then(function(data776) {
          var results776 = data776.results || [];
          var protoNumero = protoRow[CONFIG.fields.protoNumero] || '';

          if (results776.length > 0) {
            preencherFormularioExistente(results776[0]);
            mostrarToast('Registro encontrado — Protocolo ' + protoNumero, 'info');
          } else {
            prepararNovoRegistro(protoRow);
            mostrarToast('Novo registro — Protocolo ' + protoNumero, 'info');
          }

          document.getElementById('formCard').style.display = 'block';
          document.getElementById('formCard').scrollIntoView({ behavior: 'smooth' });
          esconderCamposBusca();
        });
    })
    .catch(function(e) {
      mostrarMsg('searchMsg', 'error', e.message || 'Erro ao buscar.');
    })
    .then(function() {
      esconderOverlay();
    });
}

// ═══════════════════════════════════════════════════════
// PREENCHER FORMULARIO EXISTENTE
// ═══════════════════════════════════════════════════════
function preencherFormularioExistente(row) {
  resetarEstadoFormulario();
  certidaoRowId = row.id;

  // Data Emissao
  if (row[CONFIG.fields.dataEmissao]) {
    document.getElementById('dataEmissao').value = row[CONFIG.fields.dataEmissao];
  }

  // Protocolo (link_row)
  var protoArr = row[CONFIG.fields.protocolo];
  if (protoArr && protoArr.length > 0) {
    protocoloSelecionadoId = protoArr[0].id;
    document.getElementById('protocoloInput').value = protoArr[0].value || '';
    protoNumeroAtual = protoArr[0].value || '';
    habilitarAbaAnexo(true);
    document.getElementById('protocoloInput').readOnly = true;

    // Buscar status do protocolo
    fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.protocolo + '/' + protoArr[0].id + '/?user_field_names=false', {
      headers: apiHeaders()
    })
      .then(function(r) { return r.json(); })
      .then(function(protoRow) {
        var statusObj = protoRow[CONFIG.fields.protoStatus];
        protocoloStatusId = statusObj ? statusObj.id : null;

        // Preencher requerente a partir do protocolo
        preencherRequerente(protoRow);
      })
      .catch(function(e) {
        console.error('Erro ao buscar protocolo:', e);
      });
  }

  // Subtipo (single_select)
  var subtipoObj = row[CONFIG.fields.subtipo];
  if (subtipoObj && subtipoObj.id) {
    document.getElementById('subtipoSelect').value = subtipoObj.id;
  }

  // Entregue em
  if (row[CONFIG.fields.entregueEm]) {
    document.getElementById('entregueEm').value = row[CONFIG.fields.entregueEm];
  }

  // Forma de Entrega (single_select)
  var formaObj = row[CONFIG.fields.formaEntrega];
  if (formaObj && formaObj.id) {
    document.getElementById('formaEntregaSelect').value = formaObj.id;
  }

  // Requerente (link_row) — exibir nome + doc
  var reqArr = row[CONFIG.fields.requerenteCertidao];
  if (reqArr && reqArr.length > 0) {
    requerenteSelecionadoId = reqArr[0].id;
    // Buscar dados completos do cliente
    fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.clientes + '/' + reqArr[0].id + '/?user_field_names=false', {
      headers: apiHeaders()
    })
      .then(function(r) { return r.json(); })
      .then(function(cli) {
        exibirRequerente(cli);
      })
      .catch(function(e) {
        console.error('Erro ao buscar requerente:', e);
      });
  }

  // Requeridos (link_row multiplo)
  var requeridosArr = row[CONFIG.fields.requeridoCertidao];
  if (requeridosArr && requeridosArr.length > 0) {
    for (var i = 0; i < requeridosArr.length; i++) {
      adicionarRequerido(requeridosArr[i].id, requeridosArr[i].value || ('Cliente ' + requeridosArr[i].id));
    }
  }

  // Observacao
  if (row[CONFIG.fields.observacao]) {
    document.getElementById('observacaoTextarea').value = row[CONFIG.fields.observacao];
  }

  // Link_Controle (link_row multiplo — escrituras)
  var escriturasArr = row[CONFIG.fields.linkControle];
  if (escriturasArr && escriturasArr.length > 0) {
    for (var j = 0; j < escriturasArr.length; j++) {
      adicionarEscritura(escriturasArr[j].id, escriturasArr[j].value || ('Escritura ' + escriturasArr[j].id));
    }
  }

  // Estado de bloqueio do registro (badge + travamento + botao do master)
  if (bloqueioWidget) bloqueioWidget.carregar();
}

// ═══════════════════════════════════════════════════════
// PREPARAR NOVO REGISTRO
// ═══════════════════════════════════════════════════════
function prepararNovoRegistro(protoRow) {
  resetarEstadoFormulario();
  certidaoRowId = null;

  var numero = protoRow[CONFIG.fields.protoNumero] || '';
  protocoloSelecionadoId = protoRow.id;
  document.getElementById('protocoloInput').value = numero;
  protoNumeroAtual = numero;
  document.getElementById('protocoloInput').readOnly = true;

  // Status do protocolo
  var statusObj = protoRow[CONFIG.fields.protoStatus];
  protocoloStatusId = statusObj ? statusObj.id : null;

  if (protocoloStatusId === CONFIG.statusEmAndamento) {
    mostrarMsg('protocoloInfo', 'warning', 'Este protocolo será atualizado para "Finalizado" ao salvar.');
  }

  // Preencher requerente
  preencherRequerente(protoRow);

  // Estado inicial das abas (registro novo: anexo só depois de salvar)
  habilitarAbaAnexo(false);
  ativarAbaCertidao('dados');
}

// ═══════════════════════════════════════════════════════
// RESETAR ESTADO DO FORMULARIO
// ═══════════════════════════════════════════════════════
function resetarEstadoFormulario() {
  certidaoRowId = null;
  protocoloSelecionadoId = null;
  protocoloStatusId = null;
  requerenteSelecionadoId = null;
  requeridosSelecionados = [];
  escriturasSelecionadas = [];

  document.getElementById('dataEmissao').value = '';
  document.getElementById('protocoloInput').value = '';
  document.getElementById('protocoloInput').readOnly = false;
  document.getElementById('subtipoSelect').value = '';
  document.getElementById('entregueEm').value = '';
  document.getElementById('formaEntregaSelect').value = '';
  document.getElementById('requerenteNome').textContent = '\u2014';
  document.getElementById('requerenteDoc').textContent = '';
  document.getElementById('clienteInput').value = '';
  document.getElementById('requeridosChips').innerHTML = '';
  document.getElementById('escrituraInput').value = '';
  document.getElementById('escriturasChips').innerHTML = '';
  document.getElementById('observacaoTextarea').value = '';

  esconderMsg('formMsg');
  esconderMsg('protocoloInfo');
  esconderMsg('escrituraInfoMsg');

  protoNumeroAtual = null;
  var certList = document.getElementById('certFilesList');
  if (certList) certList.innerHTML = '<div class="files-empty">Nenhum anexo.</div>';
  habilitarAbaAnexo(false);
  ativarAbaCertidao('dados');

  // Bloqueio: registro novo/limpo nunca esta bloqueado
  if (bloqueioWidget) bloqueioWidget.limpar();
}

// ═══════════════════════════════════════════════════════
// REQUERENTE (preenchimento automatico)
// ═══════════════════════════════════════════════════════
function preencherRequerente(protoRow) {
  var interessados = protoRow[CONFIG.fields.protoInteressado];
  if (!interessados || interessados.length === 0) {
    document.getElementById('requerenteNome').textContent = 'Nenhum interessado vinculado ao protocolo';
    document.getElementById('requerenteDoc').textContent = '';
    requerenteSelecionadoId = null;
    return;
  }

  var clienteId = interessados[0].id;
  requerenteSelecionadoId = clienteId;

  // Buscar dados completos do cliente
  fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.clientes + '/' + clienteId + '/?user_field_names=false', {
    headers: apiHeaders()
  })
    .then(function(r) { return r.json(); })
    .then(function(cli) {
      exibirRequerente(cli);
    })
    .catch(function(e) {
      console.error('Erro ao buscar requerente:', e);
      document.getElementById('requerenteNome').textContent = interessados[0].value || 'Cliente ID ' + clienteId;
      document.getElementById('requerenteDoc').textContent = '';
    });
}

function exibirRequerente(cli) {
  var nome = cli[CONFIG.fields.clienteNome] || '';
  var cpf = cli[CONFIG.fields.clienteCpf] || '';
  var cnpj = cli[CONFIG.fields.clienteCnpj] || '';
  var doc = cpf ? ('CPF: ' + cpf) : (cnpj ? ('CNPJ: ' + cnpj) : '');

  document.getElementById('requerenteNome').textContent = nome || '\u2014';
  document.getElementById('requerenteDoc').textContent = doc;
}

// ═══════════════════════════════════════════════════════
// AUTOCOMPLETE — PROTOCOLO (tabela 755)
// ═══════════════════════════════════════════════════════
function configurarAutocompleteProtocolo() {
  var input = document.getElementById('protocoloInput');
  input.addEventListener('input', function() {
    var termo = input.value.trim();

    // Se editar apos selecionar, desvincular
    if (protocoloSelecionadoId) {
      protocoloSelecionadoId = null;
      protocoloStatusId = null;
      requerenteSelecionadoId = null;
      document.getElementById('requerenteNome').textContent = '\u2014';
      document.getElementById('requerenteDoc').textContent = '';
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
      var interessados = row[CONFIG.fields.protoInteressado] || [];
      var interessadoNome = interessados.length > 0 ? interessados[0].value : '';

      var item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.innerHTML =
        '<div class="ac-name">Protocolo ' + numero + '</div>' +
        (interessadoNome ? '<div class="ac-detail">' + interessadoNome + '</div>' : '');

      item.addEventListener('click', function() {
        selecionarProtocolo(row);
      });
      lista.appendChild(item);
    })(resultados[i]);
  }

  lista.classList.add('open');
}

function selecionarProtocolo(row) {
  // Validar servico = Certidao notarial (id 11)
  var servicos = row[CONFIG.fields.protoServico] || [];
  var ehCertidao = false;
  for (var i = 0; i < servicos.length; i++) {
    if (servicos[i].id === CONFIG.servicoCertidaoId) {
      ehCertidao = true;
      break;
    }
  }

  if (!ehCertidao) {
    mostrarMsg('protocoloInfo', 'warning',
      'Este protocolo não corresponde a uma certidão notarial. Selecione outro protocolo.');
    document.getElementById('protocoloInput').value = '';
    fecharAutoList('protocoloAutoList');
    return;
  }

  var numero = row[CONFIG.fields.protoNumero] || '';
  protocoloSelecionadoId = row.id;
  document.getElementById('protocoloInput').value = numero;
  document.getElementById('protocoloInput').readOnly = true;
  fecharAutoList('protocoloAutoList');

  // Status
  var statusObj = row[CONFIG.fields.protoStatus];
  protocoloStatusId = statusObj ? statusObj.id : null;

  if (protocoloStatusId === CONFIG.statusEmAndamento) {
    mostrarMsg('protocoloInfo', 'warning', 'Este protocolo será atualizado para "Finalizado" ao salvar.');
  } else {
    esconderMsg('protocoloInfo');
  }

  // Preencher requerente automaticamente
  preencherRequerente(row);
}

// ═══════════════════════════════════════════════════════
// AUTOCOMPLETE — CLIENTES (Requeridos — tabela 754)
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
    '&search=' + encodeURIComponent(termo) +
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
      var nome = cli[CONFIG.fields.clienteNome] || '';
      var cpf = cli[CONFIG.fields.clienteCpf] || '';
      var cnpj = cli[CONFIG.fields.clienteCnpj] || '';
      var detalhe = cpf ? ('CPF: ' + cpf) : (cnpj ? ('CNPJ: ' + cnpj) : '');

      var item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.innerHTML =
        '<div class="ac-name">' + nome + '</div>' +
        (detalhe ? '<div class="ac-detail">' + detalhe + '</div>' : '');

      item.addEventListener('click', function() {
        var isAdvogado = !!cli['field_7430'];
        adicionarRequerido(cli.id, nome, isAdvogado);
        document.getElementById('clienteInput').value = '';
        fecharAutoList('clienteAutoList');
      });
      lista.appendChild(item);
    })(resultados[i]);
  }

  lista.classList.add('open');
}

// ═══════════════════════════════════════════════════════
// CHIPS — REQUERIDOS
// ═══════════════════════════════════════════════════════
function adicionarRequerido(id, label, advogado) {
  for (var i = 0; i < requeridosSelecionados.length; i++) {
    if (requeridosSelecionados[i].id === id) return;
  }
  requeridosSelecionados.push({ id: id, label: label, advogado: !!advogado });
  renderizarChipRequerido(id, label, !!advogado);
}

function renderizarChipRequerido(id, label, advogado) {
  var container = document.getElementById('requeridosChips');
  var chip = document.createElement('div');
  chip.className = 'chip';
  chip.id = 'chip-requerido-' + id;
  var icone = advogado ? '<i class="ph ph-scales" title="Advogado"></i> ' : '';
  // Registro bloqueado (perfil nao-master): chip sem botao de remover
  var podeRemover = !bloqueioTravado();
  chip.innerHTML = icone + '<span>' + label + '</span>' +
    (podeRemover ? '<button type="button" class="chip-remove" title="Remover"><i class="ph ph-x"></i></button>' : '');
  if (podeRemover) {
    chip.querySelector('.chip-remove').addEventListener('click', function() {
      removerRequerido(id);
    });
  }
  container.appendChild(chip);
}

function rerenderizarChipsRequeridos() {
  var container = document.getElementById('requeridosChips');
  if (!container) return;
  container.innerHTML = '';
  for (var i = 0; i < requeridosSelecionados.length; i++) {
    renderizarChipRequerido(requeridosSelecionados[i].id, requeridosSelecionados[i].label, !!requeridosSelecionados[i].advogado);
  }
}

function removerRequerido(id) {
  requeridosSelecionados = requeridosSelecionados.filter(function(e) { return e.id !== id; });
  var chip = document.getElementById('chip-requerido-' + id);
  if (chip) chip.parentNode.removeChild(chip);
}

// ═══════════════════════════════════════════════════════
// AUTOCOMPLETE — ESCRITURAS (tabela Controle 745)
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

        var clientes = row[CONFIG.fields.ctrlClientes] || [];
        if (clientes.length > 0) {
          esconderMsg('escrituraInfoMsg');
          for (var k = 0; k < clientes.length; k++) {
            adicionarRequerido(clientes[k].id, clientes[k].value || ('Cliente ' + clientes[k].id));
          }
        } else {
          mostrarMsg('escrituraInfoMsg', 'info', 'Nenhum cliente cadastrado para esta escritura — preencha manualmente.');
        }
      });
      lista.appendChild(item);
    })(resultados[i]);
  }

  lista.classList.add('open');
}

// ═══════════════════════════════════════════════════════
// CHIPS — ESCRITURAS
// ═══════════════════════════════════════════════════════
function adicionarEscritura(id, label) {
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
  // Registro bloqueado (perfil nao-master): chip sem botao de remover
  var podeRemover = !bloqueioTravado();
  chip.innerHTML = '<span>' + label + '</span>' +
    (podeRemover ? '<button type="button" class="chip-remove" title="Remover"><i class="ph ph-x"></i></button>' : '');
  if (podeRemover) {
    chip.querySelector('.chip-remove').addEventListener('click', function() {
      removerEscritura(id);
    });
  }
  container.appendChild(chip);
}

function rerenderizarChipsEscrituras() {
  var container = document.getElementById('escriturasChips');
  if (!container) return;
  container.innerHTML = '';
  for (var i = 0; i < escriturasSelecionadas.length; i++) {
    renderizarChipEscritura(escriturasSelecionadas[i].id, escriturasSelecionadas[i].label);
  }
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
// BLOQUEIO DE EDICAO (modulo bloqueio_registro.js)
// ═══════════════════════════════════════════════════════
function bloqueioTravado() {
  // Travado = registro bloqueado e perfil nao-master (master bypassa)
  if (!bloqueioWidget || !bloqueioWidget.estaBloqueado()) return false;
  return !(window.CURRENT_USER && window.CURRENT_USER.perfil === 'master');
}

// Callback do widget de bloqueio: trava/destrava os campos da aba Dados
// Emissao e reflete o estado nos anexos. Travamento EXCLUSIVAMENTE via
// disabled: a pagina gerencia readOnly por conta propria (ex.: protocoloInput
// readonly ao carregar registro) e o destravamento nao pode libertar um campo
// que ela mantem readonly.
function aplicarBloqueioCertidao(deveTravar) {
  var travar = !!deveTravar;
  var mudou = (travar !== bloqueioTravadoUI);
  bloqueioTravadoUI = travar;

  // Campos da aba Dados Emissao (somente disabled; nunca tocar em readOnly)
  document.getElementById('dataEmissao').disabled = travar;
  document.getElementById('protocoloInput').disabled = travar;
  document.getElementById('subtipoSelect').disabled = travar;
  document.getElementById('entregueEm').disabled = travar;
  document.getElementById('formaEntregaSelect').disabled = travar;
  document.getElementById('escrituraInput').disabled = travar;
  document.getElementById('clienteInput').disabled = travar;
  document.getElementById('observacaoTextarea').disabled = travar;

  // Chips (re-render remove/restaura os botoes de remover)
  rerenderizarChipsEscrituras();
  rerenderizarChipsRequeridos();

  // Botao Salvar: oculto quando travado (nao apenas desabilitado)
  var btnSalvar = document.getElementById('btnSalvar');
  if (btnSalvar) btnSalvar.style.display = travar ? 'none' : '';

  // Anexos: upload/exclusao seguem certPodeAnexar/certPodeExcluir, que
  // consultam bloqueioTravado(). Leitura e download permanecem livres
  // (aba acessivel, lista visivel, links de download ativos).
  var btnCertSelectFile = document.getElementById('btnCertSelectFile');
  if (btnCertSelectFile) btnCertSelectFile.style.display = certPodeAnexar() ? '' : 'none';
  if (mudou && protoNumeroAtual) {
    carregarAnexosCertidao();
  }
}

// ═══════════════════════════════════════════════════════
// VALIDACAO E SALVAMENTO
// ═══════════════════════════════════════════════════════
// Gate de bloqueio: re-verificacao fresca ANTES de qualquer gravacao
// (fecha a brecha da aba antiga).
function salvarCertidao() {
  if (certidaoRowId === null || !bloqueioWidget) {
    executarSalvarCertidao();
    return;
  }
  bloqueioWidget.verificarAntesDeSalvar().then(function(info) {
    var ehMaster = !!(window.CURRENT_USER && window.CURRENT_USER.perfil === 'master');
    if (info.bloqueado && !ehMaster) {
      var btnSalvar = document.getElementById('btnSalvar');
      if (btnSalvar) btnSalvar.disabled = false;
      esconderOverlay();
      mostrarMsg('formMsg', 'error', 'Este registro foi bloqueado para edição por ' +
        (info.bloqueadoPor || 'outro usuário') + '. Solicite o desbloqueio ao usuário master.');
      document.getElementById('formMsg').scrollIntoView({ behavior: 'smooth' });
      bloqueioWidget.carregar(); // sincroniza a UI da aba antiga (badge + travamento)
      return;
    }
    executarSalvarCertidao();
  });
}

function executarSalvarCertidao() {
  // Validar campos obrigatorios
  var dataEmissao = document.getElementById('dataEmissao').value;
  var subtipo = document.getElementById('subtipoSelect').value;
  var entregueEm = document.getElementById('entregueEm').value;
  var formaEntrega = document.getElementById('formaEntregaSelect').value;

  if (!dataEmissao || !protocoloSelecionadoId || !subtipo || !entregueEm || !formaEntrega) {
    mostrarMsg('formMsg', 'error', 'Preencha todos os campos obrigatórios.');
    document.getElementById('formMsg').scrollIntoView({ behavior: 'smooth' });
    return;
  }

  var btnSalvar = document.getElementById('btnSalvar');
  btnSalvar.disabled = true;
  mostrarOverlay();
  esconderMsg('formMsg');

  var payload = construirPayloadCertidao();

  var promessa;
  if (certidaoRowId === null) {
    promessa = fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.certidoes + '/?user_field_names=false', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(payload)
    });
  } else {
    promessa = fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.certidoes + '/' + certidaoRowId + '/?user_field_names=false', {
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
      certidaoRowId = data.id;
      habilitarAbaAnexo(true);

      // Bloqueio: no registro recem-criado o botao do master passa a aparecer
      if (bloqueioWidget) bloqueioWidget.carregar();

      mostrarToast('Registro salvo com sucesso!', 'success');

      // Finalizar protocolo se necessario
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
            mostrarToast('Protocolo atualizado para "Finalizado".', 'success');
          }
        });
      }
    })
    .catch(function(e) {
      mostrarMsg('formMsg', 'error', e.message || 'Erro ao salvar.');
      document.getElementById('formMsg').scrollIntoView({ behavior: 'smooth' });
      console.error(e);
    })
    .then(function() {
      btnSalvar.disabled = false;
      esconderOverlay();
    });
}

function construirPayloadCertidao() {
  var payload = {};

  // Data Emissao (date)
  var dataEmissao = document.getElementById('dataEmissao').value;
  if (dataEmissao) payload[CONFIG.fields.dataEmissao] = dataEmissao;

  // Protocolo (link_row single)
  payload[CONFIG.fields.protocolo] = protocoloSelecionadoId ? [protocoloSelecionadoId] : [];

  // Subtipo (single_select)
  var subtipoVal = document.getElementById('subtipoSelect').value;
  payload[CONFIG.fields.subtipo] = subtipoVal ? parseInt(subtipoVal, 10) : null;

  // Entregue em (date)
  var entregueEm = document.getElementById('entregueEm').value;
  if (entregueEm) payload[CONFIG.fields.entregueEm] = entregueEm;

  // Forma de Entrega (single_select)
  var formaEntregaVal = document.getElementById('formaEntregaSelect').value;
  payload[CONFIG.fields.formaEntrega] = formaEntregaVal ? parseInt(formaEntregaVal, 10) : null;

  // Requerente (link_row single)
  payload[CONFIG.fields.requerenteCertidao] = requerenteSelecionadoId ? [requerenteSelecionadoId] : [];

  // Requeridos (link_row multiple)
  var requeridosIds = [];
  for (var i = 0; i < requeridosSelecionados.length; i++) {
    requeridosIds.push(requeridosSelecionados[i].id);
  }
  payload[CONFIG.fields.requeridoCertidao] = requeridosIds;

  // Observacao (long_text)
  payload[CONFIG.fields.observacao] = document.getElementById('observacaoTextarea').value;

  // Link_Controle (link_row multiple)
  var escriturasIds = [];
  for (var j = 0; j < escriturasSelecionadas.length; j++) {
    escriturasIds.push(escriturasSelecionadas[j].id);
  }
  payload[CONFIG.fields.linkControle] = escriturasIds;

  return payload;
}

// ═══════════════════════════════════════════════════════
// ANEXOS DA CERTIDÃO (aba "Anexo")
// ═══════════════════════════════════════════════════════
var protoNumeroAtual = null;

var CERT_ALLOWED_EXT = ['pdf','jpg','jpeg','png','tif','tiff','doc','docx','odt','txt','md'];
var CERT_MAX_SIZE = 100 * 1024 * 1024; // 100 MB (o servidor é o backstop real)

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

function certPodeAnexar() {
  if (bloqueioTravado()) return false; // anexos travados junto com os dados
  var perfil = window.CURRENT_USER ? window.CURRENT_USER.perfil : '';
  return perfil === 'master' || perfil === 'administrador';
}

function certPodeExcluir() {
  if (bloqueioTravado()) return false; // anexos travados junto com os dados
  return !!(window.CURRENT_USER && window.CURRENT_USER.perfil === 'master');
}

function ativarAbaCertidao(nome) {
  var btn = document.querySelector('.tab-btn[data-tab="' + nome + '"]');
  if (btn && btn.disabled) return;
  var btns = document.querySelectorAll('.tab-btn');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].getAttribute('data-tab') === nome) btns[i].classList.add('active');
    else btns[i].classList.remove('active');
  }
  var conteudos = document.querySelectorAll('.tab-content');
  for (var j = 0; j < conteudos.length; j++) {
    if (conteudos[j].id === 'tab-' + nome) conteudos[j].classList.add('active');
    else conteudos[j].classList.remove('active');
  }
  if (nome === 'anexo') carregarAnexosCertidao();
}

function habilitarAbaAnexo(habilitar) {
  var btn = document.getElementById('tabBtnAnexo');
  if (!btn) return;
  var podeAbrir = !!(habilitar && protoNumeroAtual);
  btn.disabled = !podeAbrir;
  // Se desabilitar enquanto a aba "Anexo" está ativa, volta para "Dados Emissão"
  if (!podeAbrir && document.querySelector('.tab-btn[data-tab="anexo"].active')) {
    ativarAbaCertidao('dados');
  }
}

function carregarAnexosCertidao() {
  var container = document.getElementById('certFilesList');
  if (!container || !protoNumeroAtual) return;
  fetch('/api/certidoes-anexos/listar?proto=' + encodeURIComponent(protoNumeroAtual), { headers: apiHeaders() })
    .then(function(resp) { return resp.json(); })
    .then(function(data) { renderizarAnexosCertidao(data.arquivos || []); })
    .catch(function(err) {
      console.error('Erro ao carregar anexos:', err);
      container.innerHTML = '<div class="files-empty">Erro ao carregar anexos.</div>';
    });
}

function renderizarAnexosCertidao(arquivos) {
  var container = document.getElementById('certFilesList');
  if (!container) return;
  if (!arquivos || arquivos.length === 0) {
    container.innerHTML = '<div class="files-empty">Nenhum anexo.</div>';
    return;
  }
  var podeExcluir = certPodeExcluir();
  var html = '';
  for (var i = 0; i < arquivos.length; i++) {
    var f = arquivos[i];
    var iconClass = iconeExtensao(f.extensao);
    var url = '/api/certidoes-anexos/download?proto=' + encodeURIComponent(protoNumeroAtual) +
              '&nome=' + encodeURIComponent(f.nome);
    html += '<div class="file-item">';
    html += '  <i class="ph ' + iconClass + ' file-icon"></i>';
    html += '  <div class="file-info">';
    html += '    <a href="' + url + '" class="file-name">' + f.nome + '</a>';
    html += '    <span class="file-meta">' + formatarTamanho(f.tamanho) + '</span>';
    html += '  </div>';
    if (podeExcluir) {
      var nomeEsc = String(f.nome).replace(/'/g, "\\'");
      html += '  <button type="button" class="file-delete" onclick="excluirAnexoCertidao(\'' + nomeEsc + '\')" title="Excluir anexo">';
      html += '    <i class="ph ph-trash"></i>';
      html += '  </button>';
    }
    html += '</div>';
  }
  container.innerHTML = html;
}

function uploadAnexoCertidao(file) {
  var msgBox = document.getElementById('certUploadMsg');
  msgBox.className = 'msg-box success';
  msgBox.innerHTML = '<i class="ph ph-spinner"></i> Enviando arquivo...';
  msgBox.style.display = 'flex';
  var formData = new FormData();
  formData.append('proto', protoNumeroAtual);
  formData.append('arquivo', file);
  fetch('/api/certidoes-anexos/upload', { method: 'POST', body: formData })
    .then(function(resp) {
      if (!resp.ok) return resp.json().then(function(data) { throw new Error(data.erro || 'Erro ao enviar arquivo.'); });
      return resp.json();
    })
    .then(function() {
      msgBox.style.display = 'none';
      msgBox.innerHTML = '';
      carregarAnexosCertidao();
      mostrarToast('Arquivo enviado com sucesso.', 'success');
    })
    .catch(function(err) {
      msgBox.className = 'msg-box error';
      msgBox.innerHTML = '<i class="ph ph-x-circle"></i> ' + err.message;
      msgBox.style.display = 'flex';
    });
}

function excluirAnexoCertidao(nome) {
  if (!confirm('Deseja excluir o anexo "' + nome + '"?')) return;
  var url = '/api/certidoes-anexos/excluir?proto=' + encodeURIComponent(protoNumeroAtual) +
            '&nome=' + encodeURIComponent(nome);
  fetch(url, { method: 'DELETE', headers: apiHeaders() })
    .then(function(resp) {
      if (!resp.ok) return resp.json().then(function(data) { throw new Error(data.erro || 'Erro ao excluir anexo.'); });
      return resp.json();
    })
    .then(function() { carregarAnexosCertidao(); })
    .catch(function(err) { alert(err.message || 'Erro ao excluir anexo.'); });
}

// ═══════════════════════════════════════════════════════
// INICIALIZACAO
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  // Popular selects
  popularSelectOpcoes('subtipoSelect', CONFIG.subtipoOpts);
  popularSelectOpcoes('formaEntregaSelect', CONFIG.formaEntregaOpts);

  // Configurar autocompletes
  configurarAutocompleteProtocolo();
  configurarAutocompleteClientes();
  configurarAutocompleteEscrituras();

  // Widget de bloqueio de edicao (modulo compartilhado bloqueio_registro.js)
  if (window.criarBloqueioRegistro) {
    bloqueioWidget = window.criarBloqueioRegistro({
      tabelaId: CONFIG.tables.certidoes,
      badgeContainerId: 'bloqueioBadge',
      botaoContainerId: 'bloqueioBotao',
      obterRowId: function() { return certidaoRowId; },
      aoAplicarBloqueio: aplicarBloqueioCertidao
    });
  }

  // Botoes de busca
  document.getElementById('btnBuscarProtocolo').addEventListener('click', buscarPorProtocolo);

  // Enter nos campos de busca
  document.getElementById('buscaProtocolo').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); buscarPorProtocolo(); }
  });

  // Fechar autocompletes ao clicar fora
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#protocoloInput') && !e.target.closest('#protocoloAutoList')) {
      fecharAutoList('protocoloAutoList');
    }
    if (!e.target.closest('#clienteInput') && !e.target.closest('#clienteAutoList')) {
      fecharAutoList('clienteAutoList');
    }
    if (!e.target.closest('#escrituraInput') && !e.target.closest('#escrituraAutoList')) {
      fecharAutoList('escrituraAutoList');
    }
  });

  // Sidebar overlay
  var overlayEl = document.querySelector('.sidebar-overlay');
  if (overlayEl) {
    overlayEl.addEventListener('click', toggleSidebar);
  }

  // Upload de anexos da certidão
  var btnCertSelectFile = document.getElementById('btnCertSelectFile');
  var certFileInput = document.getElementById('certFileInput');
  if (btnCertSelectFile && certFileInput) {
    // Defensivo: esconder o envio para quem não pode anexar (a página já é master/admin)
    if (!certPodeAnexar()) {
      btnCertSelectFile.style.display = 'none';
    }
    btnCertSelectFile.addEventListener('click', function() { certFileInput.click(); });
    certFileInput.addEventListener('change', function() {
      var file = certFileInput.files[0];
      if (!file) return;
      var msgBox = document.getElementById('certUploadMsg');
      var ext = file.name.split('.').pop().toLowerCase();
      if (CERT_ALLOWED_EXT.indexOf(ext) === -1) {
        msgBox.className = 'msg-box error';
        msgBox.innerHTML = '<i class="ph ph-x-circle"></i> Extensão ".' + ext + '" não permitida.';
        msgBox.style.display = 'flex';
        certFileInput.value = '';
        return;
      }
      if (file.size > CERT_MAX_SIZE) {
        msgBox.className = 'msg-box error';
        msgBox.innerHTML = '<i class="ph ph-x-circle"></i> Arquivo excede o tamanho máximo de 100 MB.';
        msgBox.style.display = 'flex';
        certFileInput.value = '';
        return;
      }
      uploadAnexoCertidao(file);
      certFileInput.value = '';
    });
  }

  // Abertura via query params (ex: /controle-certidoes?protocolo=2025/123)
  var urlParams = new URLSearchParams(window.location.search);
  var protocoloParam = urlParams.get('protocolo');
  if (protocoloParam) {
    document.getElementById('buscaProtocolo').value = protocoloParam;
    buscarPorProtocolo();
  }

  // Foco inicial
  document.getElementById('buscaProtocolo').focus();
});
