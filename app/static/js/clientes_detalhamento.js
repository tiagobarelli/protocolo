// Detalhamento de Cliente — ES5, proxy Flask /api/baserow
'use strict';

var API_BASE = '/api/baserow';

var CONFIG = {
  tables: {
    clientes: 754,
    controle: 745,
    retificacoes: 753,
    substabelecimentos: 762,
    protocolo: 755,
    certidoes: 776,
    revogacao: 777
  },
  fields: {
    // Clientes (754)
    nome: 'field_7237',
    cpf: 'field_7238',
    cnpj: 'field_7239',
    telefone: 'field_7243',
    email: 'field_7244',
    outros: 'field_7246',
    oab: 'field_7256',
    rg: 'field_7342',
    estadoCivil: 'field_7343',
    conjuge: 'field_7344',
    nascimento: 'field_7345',
    profissao: 'field_7347',
    regraPatrimonial: 'field_7348',
    escrituras: 'field_7380',
    substabelecimentos: 'field_7412',
    certidoesRequerido: 'field_7422',
    empresarioTF: 'field_7429',
    advogadoTF: 'field_7430',
    corretorTF: 'field_7431',
    creci: 'field_7432',
    protocolos: 'field_7247',
    revogacoes: 'field_7449',
    uniaoEstavelTF: 'field_7450',
    regraPatrimonialUE: 'field_7451',
    companheiro: 'field_7452',
    falecidoTF: 'field_7453',
    dataFalecimento: 'field_7454',

    // Controle (745)
    ctrlLivro: 'field_7189',
    ctrlPagina: 'field_7190',
    ctrlTipo: 'field_7194',
    ctrlData: 'field_7226',
    ctrlRetificadaPor: 'field_7232',

    // Retificação (753)
    retifLivro: 'field_7228',
    retifPagina: 'field_7229',
    retifData: 'field_7234',

    // Substabelecimento (762)
    substLivro: 'field_7322',
    substPagina: 'field_7323',
    substProcuracao: 'field_7325',
    substData: 'field_7327',

    // Revogação (777)
    revogLivro: 'field_7436',
    revogPagina: 'field_7437',
    revogProcuracao: 'field_7435',
    revogData: 'field_7441',

    // Protocolo (755)
    protoNumero: 'field_7240',
    protoServico: 'field_7242',
    protoDataEntrada: 'field_7250',
    protoStatus: 'field_7252',

    // Certidão (776)
    certProtocolo: 'field_7415',
    certDataEmissao: 'field_7414',
    certSubtipo: 'field_7417',
    certRequerente: 'field_7419'
  }
};

// ── Estado global ──
var clienteAtual = null;
var buscaTimer = null;

// ═══════════════════════════════════════════════════════
// API HEADER
// ═══════════════════════════════════════════════════════
function apiHeaders() {
  return { 'Content-Type': 'application/json' };
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
// FORMATAÇÃO DE DATAS
// ═══════════════════════════════════════════════════════
function formatarData(isoStr) {
  if (!isoStr) return '\u2014';
  // Heurística: se hora UTC = 00:00, é campo date-only → extrair direto da string
  var d = new Date(isoStr);
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) {
    var partes = isoStr.split('T')[0].split('-');
    if (partes.length === 3) return partes[2] + '/' + partes[1] + '/' + partes[0];
  }
  // Caso contrário, usar conversão normal
  var dd = String(d.getDate()).length < 2 ? '0' + d.getDate() : String(d.getDate());
  var mm = String(d.getMonth() + 1).length < 2 ? '0' + (d.getMonth() + 1) : String(d.getMonth() + 1);
  var yyyy = d.getFullYear();
  return dd + '/' + mm + '/' + yyyy;
}

function calcularIdade(nascimentoISO, dataRefISO) {
  if (!nascimentoISO) return null;
  var partes = nascimentoISO.split('T')[0].split('-');
  var nascDate = new Date(parseInt(partes[0], 10), parseInt(partes[1], 10) - 1, parseInt(partes[2], 10));
  var ref;
  if (dataRefISO) {
    var partesRef = dataRefISO.split('T')[0].split('-');
    ref = new Date(parseInt(partesRef[0], 10), parseInt(partesRef[1], 10) - 1, parseInt(partesRef[2], 10));
  } else {
    ref = new Date();
  }
  var idade = ref.getFullYear() - nascDate.getFullYear();
  var m = ref.getMonth() - nascDate.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < nascDate.getDate())) idade--;
  return idade;
}

// ═══════════════════════════════════════════════════════
// ESCAPE HTML
// ═══════════════════════════════════════════════════════
function esc(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ═══════════════════════════════════════════════════════
// BUSCA COM AUTOCOMPLETE
// ═══════════════════════════════════════════════════════
function configurarAutocompleteBusca() {
  var input = document.getElementById('buscaInput');

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.keyCode === 13) {
      e.preventDefault();
      executarBusca();
    }
  });

  input.addEventListener('input', function() {
    var raw = input.value.trim();
    if (buscaTimer) clearTimeout(buscaTimer);
    if (raw.length < 3) { fecharAutocompleteBusca(); return; }
    buscaTimer = setTimeout(function() { buscarPorNome(raw); }, 400);
  });

  document.getElementById('btnBuscar').addEventListener('click', function() {
    executarBusca();
  });

  // Fechar autocomplete ao clicar fora
  document.addEventListener('click', function(e) {
    var wrapper = document.querySelector('#buscaCard .autocomplete-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
      fecharAutocompleteBusca();
    }
  });
}

function executarBusca() {
  var raw = document.getElementById('buscaInput').value.trim();
  if (!raw || raw.length < 3) return;
  fecharAutocompleteBusca();
  buscarPorNome(raw);
}

function buscarPorNome(termo) {
  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.clientes +
    '/?user_field_names=false&filter__' + CONFIG.fields.nome + '__contains=' +
    encodeURIComponent(termo) + '&size=10';
  fetch(url, { headers: apiHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) { mostrarAutocompleteBusca(data.results || []); })
    .catch(function(e) { console.error('Erro na busca por nome:', e); });
}

function mostrarAutocompleteBusca(resultados) {
  var lista = document.getElementById('buscaAutoList');
  lista.innerHTML = '';
  if (resultados.length === 0) {
    lista.classList.remove('open');
    mostrarMsg('buscaMsg', 'warning', 'Nenhum cliente encontrado com esse nome.');
    return;
  }
  esconderMsg('buscaMsg');
  for (var i = 0; i < resultados.length; i++) {
    (function(cli) {
      var nome    = cli[CONFIG.fields.nome] || '';
      var cpfVal  = cli[CONFIG.fields.cpf]  || '';
      var cnpjVal = cli[CONFIG.fields.cnpj] || '';
      var detalhe = cpfVal ? ('CPF: ' + cpfVal) : (cnpjVal ? ('CNPJ: ' + cnpjVal) : '');
      var item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.innerHTML =
        '<div class="ac-name">' + esc(nome) + '</div>' +
        (detalhe ? '<div class="ac-detail">' + esc(detalhe) + '</div>' : '');
      item.addEventListener('click', function() {
        fecharAutocompleteBusca();
        selecionarCliente(cli);
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
// SELECIONAR CLIENTE — buscar dados completos e renderizar
// ═══════════════════════════════════════════════════════
function selecionarCliente(cli) {
  mostrarOverlay();
  esconderMsg('buscaMsg');
  // Buscar registro completo do cliente
  var url = API_BASE + '/database/rows/table/' + CONFIG.tables.clientes +
    '/' + cli.id + '/?user_field_names=false';
  fetch(url, { headers: apiHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(row) {
      clienteAtual = row;
      document.getElementById('buscaInput').value = row[CONFIG.fields.nome] || '';
      mostrarMsg('buscaMsg', 'success', 'Cliente localizado. Relatório gerado abaixo.');
      renderizarRelatorio(row);
      esconderOverlay();
    })
    .catch(function(e) {
      esconderOverlay();
      console.error('Erro ao carregar cliente:', e);
      mostrarMsg('buscaMsg', 'error', 'Erro ao carregar dados do cliente.');
    });
}

// ═══════════════════════════════════════════════════════
// RENDERIZAR RELATÓRIO COMPLETO
// ═══════════════════════════════════════════════════════
function renderizarRelatorio(row) {
  var cpf = row[CONFIG.fields.cpf] || '';
  var cnpj = row[CONFIG.fields.cnpj] || '';
  var isPJ = (cnpj && !cpf);

  renderizarDadosCadastrais(row, isPJ);
  carregarEscrituras(row);
  carregarSubstabelecimentos(row);
  carregarRevogacoes(row);
  carregarProtocolos(row);
  carregarCertidoes(row);

  document.getElementById('relatorioContainer').style.display = '';
}

// ═══════════════════════════════════════════════════════
// DADOS CADASTRAIS
// ═══════════════════════════════════════════════════════
function renderizarDadosCadastrais(row, isPJ) {
  var f = CONFIG.fields;
  var nome = row[f.nome] || '—';
  var cnpj = row[f.cnpj] || '';
  var cpf = row[f.cpf] || '';

  // Mesma deteccao PF/PJ: havendo CNPJ rotula CNPJ; senao CPF.
  var docLabel = cnpj ? 'CNPJ' : 'CPF';
  var docValor = cnpj ? cnpj : cpf;

  var html = '<span class="ci-nome">' + esc(nome) + '</span>';
  if (docValor) {
    html += '<span class="ci-doc">' + docLabel + ' ' + esc(docValor) + '</span>';
  }

  var el = document.getElementById('clienteIdent');
  el.innerHTML = html;
  el.style.display = 'flex';
}

// ═══════════════════════════════════════════════════════
// HELPER: buscar registro individual de uma tabela
// ═══════════════════════════════════════════════════════
function buscarRegistro(tableId, rowId) {
  var url = API_BASE + '/database/rows/table/' + tableId +
    '/' + rowId + '/?user_field_names=false';
  return fetch(url, { headers: apiHeaders() })
    .then(function(r) { return r.json(); });
}

// ═══════════════════════════════════════════════════════
// SEÇÃO: ESCRITURAS (Table 745)
// ═══════════════════════════════════════════════════════
function carregarEscrituras(row) {
  var container = document.getElementById('secaoEscrituras');
  var linkArr = row[CONFIG.fields.escrituras] || [];
  if (linkArr.length === 0) {
    container.innerHTML = '<div class="secao-vazia">Nenhuma participação em escritura localizada.</div>';
    return;
  }

  container.innerHTML = '<div class="secao-vazia">Carregando...</div>';
  var promises = [];
  for (var i = 0; i < linkArr.length; i++) {
    promises.push(buscarRegistro(CONFIG.tables.controle, linkArr[i].id));
  }

  Promise.all(promises)
    .then(function(registros) {
      // Ordenar por data decrescente
      registros.sort(function(a, b) {
        var da = a[CONFIG.fields.ctrlData] || '';
        var db = b[CONFIG.fields.ctrlData] || '';
        return da < db ? 1 : (da > db ? -1 : 0);
      });

      var html = '<div class="table-wrapper"><table class="report-table"><thead><tr>' +
        '<th>Livro</th><th>Página</th><th>Tipo</th><th>Data</th><th>Retificada?</th>' +
        '</tr></thead><tbody>';
      for (var j = 0; j < registros.length; j++) {
        html += renderizarEscritura(registros[j]);
      }
      html += '</tbody></table></div>';
      container.innerHTML = html;

      // Resolver retificações
      for (var k = 0; k < registros.length; k++) {
        resolverRetificacoes(registros[k], k);
      }
    })
    .catch(function(e) {
      console.error('Erro ao carregar escrituras:', e);
      container.innerHTML = '<div class="secao-vazia">Erro ao carregar escrituras.</div>';
    });
}

function renderizarEscritura(reg) {
  var f = CONFIG.fields;
  var tipo = '';
  var tipoArr = reg[f.ctrlTipo];
  if (tipoArr && tipoArr.length > 0) tipo = tipoArr[0].value || '';

  var retifArr = reg[f.ctrlRetificadaPor] || [];
  var retificada = retifArr.length > 0;

  var html = '<tr>';
  html += '<td>' + esc(reg[f.ctrlLivro] || '—') + '</td>';
  html += '<td>' + esc(reg[f.ctrlPagina] || '—') + '</td>';
  html += '<td>' + esc(tipo || '—') + '</td>';
  html += '<td>' + esc(formatarData(reg[f.ctrlData])) + '</td>';
  html += '<td>' + esc(retificada ? 'Sim' : 'Não') +
    '<div id="retif-' + reg.id + '" class="retif-refs"></div></td>';
  html += '</tr>';
  return html;
}

function resolverRetificacoes(reg, index) {
  var retifArr = reg[CONFIG.fields.ctrlRetificadaPor] || [];
  if (retifArr.length === 0) return;

  var container = document.getElementById('retif-' + reg.id);
  if (!container) return;

  var promises = [];
  for (var i = 0; i < retifArr.length; i++) {
    promises.push(buscarRegistro(CONFIG.tables.retificacoes, retifArr[i].id));
  }

  Promise.all(promises)
    .then(function(retifs) {
      var html = '';
      for (var j = 0; j < retifs.length; j++) {
        var r = retifs[j];
        html += '<div class="retif-ref">L ' + esc(r[CONFIG.fields.retifLivro] || '—') +
          ' / P ' + esc(r[CONFIG.fields.retifPagina] || '—') +
          ' · ' + esc(formatarData(r[CONFIG.fields.retifData])) + '</div>';
      }
      container.innerHTML = html;
    })
    .catch(function(e) { console.error('Erro ao resolver retificações:', e); });
}

// ═══════════════════════════════════════════════════════
// SEÇÃO: SUBSTABELECIMENTOS (Table 762)
// ═══════════════════════════════════════════════════════
function carregarSubstabelecimentos(row) {
  var container = document.getElementById('secaoSubstabelecimentos');
  var linkArr = row[CONFIG.fields.substabelecimentos] || [];
  if (linkArr.length === 0) {
    container.innerHTML = '<div class="secao-vazia">Nenhuma participação em substabelecimento localizada.</div>';
    return;
  }

  container.innerHTML = '<div class="secao-vazia">Carregando...</div>';
  var promises = [];
  for (var i = 0; i < linkArr.length; i++) {
    promises.push(buscarRegistro(CONFIG.tables.substabelecimentos, linkArr[i].id));
  }

  Promise.all(promises)
    .then(function(registros) {
      registros.sort(function(a, b) {
        var da = a[CONFIG.fields.substData] || '';
        var db = b[CONFIG.fields.substData] || '';
        return da < db ? 1 : (da > db ? -1 : 0);
      });

      var html = '<div class="table-wrapper"><table class="report-table"><thead><tr>' +
        '<th>Livro</th><th>Página</th><th>Data</th><th>Procuração Substabelecida</th>' +
        '</tr></thead><tbody>';
      for (var j = 0; j < registros.length; j++) {
        html += renderizarSubstabelecimento(registros[j]);
      }
      html += '</tbody></table></div>';
      container.innerHTML = html;
    })
    .catch(function(e) {
      console.error('Erro ao carregar substabelecimentos:', e);
      container.innerHTML = '<div class="secao-vazia">Erro ao carregar substabelecimentos.</div>';
    });
}

function renderizarSubstabelecimento(reg) {
  var f = CONFIG.fields;
  var procArr = reg[f.substProcuracao] || [];
  var procTexto = '';
  for (var i = 0; i < procArr.length; i++) {
    if (i > 0) procTexto += '; ';
    procTexto += procArr[i].value || ('ID ' + procArr[i].id);
  }

  var html = '<tr>';
  html += '<td>' + esc(reg[f.substLivro] || '—') + '</td>';
  html += '<td>' + esc(reg[f.substPagina] || '—') + '</td>';
  html += '<td>' + esc(formatarData(reg[f.substData])) + '</td>';
  html += '<td>' + esc(procTexto || '—') + '</td>';
  html += '</tr>';
  return html;
}

// ═══════════════════════════════════════════════════════
// SEÇÃO: REVOGAÇÕES (Table 777)
// ═══════════════════════════════════════════════════════
function carregarRevogacoes(row) {
  var container = document.getElementById('secaoRevogacoes');
  var linkArr = row[CONFIG.fields.revogacoes] || [];
  if (linkArr.length === 0) {
    container.innerHTML = '<div class="secao-vazia">Nenhuma participação em revogação de procuração localizada.</div>';
    return;
  }

  container.innerHTML = '<div class="secao-vazia">Carregando...</div>';
  var promises = [];
  for (var i = 0; i < linkArr.length; i++) {
    promises.push(buscarRegistro(CONFIG.tables.revogacao, linkArr[i].id));
  }

  Promise.all(promises)
    .then(function(registros) {
      registros.sort(function(a, b) {
        var da = a[CONFIG.fields.revogData] || '';
        var db = b[CONFIG.fields.revogData] || '';
        return da < db ? 1 : (da > db ? -1 : 0);
      });

      var html = '<div class="table-wrapper"><table class="report-table"><thead><tr>' +
        '<th>Livro</th><th>Página</th><th>Data</th><th>Procuração Revogada</th>' +
        '</tr></thead><tbody>';
      for (var j = 0; j < registros.length; j++) {
        html += renderizarRevogacao(registros[j]);
      }
      html += '</tbody></table></div>';
      container.innerHTML = html;
    })
    .catch(function(e) {
      console.error('Erro ao carregar revogações:', e);
      container.innerHTML = '<div class="secao-vazia">Erro ao carregar revogações.</div>';
    });
}

function renderizarRevogacao(reg) {
  var f = CONFIG.fields;
  var procArr = reg[f.revogProcuracao] || [];
  var procTexto = '';
  for (var i = 0; i < procArr.length; i++) {
    if (i > 0) procTexto += '; ';
    procTexto += procArr[i].value || ('ID ' + procArr[i].id);
  }

  var html = '<tr>';
  html += '<td>' + esc(reg[f.revogLivro] || '—') + '</td>';
  html += '<td>' + esc(reg[f.revogPagina] || '—') + '</td>';
  html += '<td>' + esc(formatarData(reg[f.revogData])) + '</td>';
  html += '<td>' + esc(procTexto || '—') + '</td>';
  html += '</tr>';
  return html;
}

// ═══════════════════════════════════════════════════════
// SEÇÃO: PROTOCOLOS (Table 755)
// ═══════════════════════════════════════════════════════
function carregarProtocolos(row) {
  var container = document.getElementById('secaoProtocolos');
  var linkArr = row[CONFIG.fields.protocolos] || [];
  if (linkArr.length === 0) {
    container.innerHTML = '<div class="secao-vazia">Nenhum protocolo localizado.</div>';
    return;
  }

  container.innerHTML = '<div class="secao-vazia">Carregando...</div>';
  var promises = [];
  for (var i = 0; i < linkArr.length; i++) {
    promises.push(buscarRegistro(CONFIG.tables.protocolo, linkArr[i].id));
  }

  Promise.all(promises)
    .then(function(registros) {
      registros.sort(function(a, b) {
        var da = a[CONFIG.fields.protoDataEntrada] || '';
        var db = b[CONFIG.fields.protoDataEntrada] || '';
        return da < db ? 1 : (da > db ? -1 : 0);
      });

      var html = '<div class="table-wrapper"><table class="report-table"><thead><tr>' +
        '<th>Protocolo</th><th>Serviço</th><th>Data Entrada</th><th>Status</th>' +
        '</tr></thead><tbody>';
      for (var j = 0; j < registros.length; j++) {
        html += renderizarProtocolo(registros[j]);
      }
      html += '</tbody></table></div>';
      container.innerHTML = html;
    })
    .catch(function(e) {
      console.error('Erro ao carregar protocolos:', e);
      container.innerHTML = '<div class="secao-vazia">Erro ao carregar protocolos.</div>';
    });
}

function renderizarProtocolo(reg) {
  var f = CONFIG.fields;
  var servico = '';
  var servicoArr = reg[f.protoServico];
  if (servicoArr && servicoArr.length > 0) servico = servicoArr[0].value || '';

  var status = '';
  var statusObj = reg[f.protoStatus];
  if (statusObj && statusObj.value) status = statusObj.value;

  var statusTag = '';
  if (status) {
    var tagClass = 'ato-tag';
    if (status === 'Finalizado') tagClass += ' success';
    else if (status === 'Cancelado') tagClass += ' danger';
    else tagClass += ' warning';
    statusTag = '<span class="' + tagClass + '">' + esc(status) + '</span>';
  }

  var html = '<tr>';
  html += '<td>' + esc(reg[f.protoNumero] || '—') + '</td>';
  html += '<td>' + esc(servico || '—') + '</td>';
  html += '<td>' + esc(formatarData(reg[f.protoDataEntrada])) + '</td>';
  html += '<td>' + (statusTag || '—') + '</td>';
  html += '</tr>';
  return html;
}

// ═══════════════════════════════════════════════════════
// SEÇÃO: CERTIDÕES (Table 776)
// ═══════════════════════════════════════════════════════
function carregarCertidoes(row) {
  var container = document.getElementById('secaoCertidoes');
  var linkArr = row[CONFIG.fields.certidoesRequerido] || [];
  if (linkArr.length === 0) {
    container.innerHTML = '<div class="secao-vazia">Nenhuma certidão localizada.</div>';
    return;
  }

  container.innerHTML = '<div class="secao-vazia">Carregando...</div>';
  var promises = [];
  for (var i = 0; i < linkArr.length; i++) {
    promises.push(buscarRegistro(CONFIG.tables.certidoes, linkArr[i].id));
  }

  Promise.all(promises)
    .then(function(registros) {
      registros.sort(function(a, b) {
        var da = a[CONFIG.fields.certDataEmissao] || '';
        var db = b[CONFIG.fields.certDataEmissao] || '';
        return da < db ? 1 : (da > db ? -1 : 0);
      });

      var html = '<div class="table-wrapper"><table class="report-table"><thead><tr>' +
        '<th>Protocolo</th><th>Data Emissão</th><th>Subtipo</th><th>Requerente</th>' +
        '</tr></thead><tbody>';
      for (var j = 0; j < registros.length; j++) {
        html += renderizarCertidao(registros[j]);
      }
      html += '</tbody></table></div>';
      container.innerHTML = html;
    })
    .catch(function(e) {
      console.error('Erro ao carregar certidões:', e);
      container.innerHTML = '<div class="secao-vazia">Erro ao carregar certidões.</div>';
    });
}

function renderizarCertidao(reg) {
  var f = CONFIG.fields;
  var protocolo = '';
  var protoArr = reg[f.certProtocolo];
  if (protoArr && protoArr.length > 0) protocolo = protoArr[0].value || '';

  var subtipo = '';
  var subtipoObj = reg[f.certSubtipo];
  if (subtipoObj && subtipoObj.value) subtipo = subtipoObj.value;

  var requerente = '';
  var reqArr = reg[f.certRequerente];
  if (reqArr && reqArr.length > 0) requerente = reqArr[0].value || '';

  var html = '<tr>';
  html += '<td>' + esc(protocolo || '—') + '</td>';
  html += '<td>' + esc(formatarData(reg[f.certDataEmissao])) + '</td>';
  html += '<td>' + esc(subtipo || '—') + '</td>';
  html += '<td>' + esc(requerente || '—') + '</td>';
  html += '</tr>';
  return html;
}

// ═══════════════════════════════════════════════════════
// IMPRESSÃO
// ═══════════════════════════════════════════════════════
function configurarImpressao() {
  var btn = document.getElementById('btnImprimir');
  if (btn) {
    btn.addEventListener('click', function() {
      window.print();
    });
  }
}

// ═══════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  configurarAutocompleteBusca();
  configurarImpressao();
});
