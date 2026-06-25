'use strict';

/* oficio_detalhe.js — Tela de detalhe/edição de ofícios (recebido | enviado). ES5 estrito.
   Consome o proxy Baserow (/api/baserow) e o backend de arquivos da fase 1 (/api/oficios). */

var API_BASE = '/api/baserow';
var OFICIOS_API = '/api/oficios';
var TABLE_REMDEST = 780;
var TABLE_CLIENTES = 754;

/* Campos auxiliares de tabelas fixas */
var F_REMDEST_NOME = 'field_7483';
var F_REMDEST_TIPO = 'field_7484';
var F_CLIENTE_NOME = 'field_7237';

/* Configuração por tipo ('recebido' | 'enviado') */
var CONFIGS = {
  recebido: {
    table: 781,
    fNumero: 'field_7486',
    fLetra: 'field_7487',
    fData: 'field_7488',
    fContraparte: 'field_7489',      /* remetente (link 780, único) */
    fDescricao: 'field_7491',
    fCliente: 'field_7492',          /* link 754, múltiplo */
    fDataCumprimento: 'field_7494',  /* só recebido */
    fPar: 'field_7503',              /* respondido_pelo_oficio (link 782) */
    fOutras: 'field_7505',
    fTemAnexos: 'field_7506',
    fCriadoPor: 'field_7507',
    fLogs: 'field_7508',
    tabelaOposta: 782,
    fNumeroOposto: 'field_7495',
    fLetraOposto: 'field_7496',
    fContraparteOposto: 'field_7498',  /* destinatário do enviado */
    fParOposto: 'field_7504',          /* resposta_do_oficio: back-link no enviado */
    endpointTipo: 'recebidos',
    labelData: 'Data de entrada',
    labelContraparte: 'Remetente',
    labelPar: 'Respondido pelo ofício',
    hintPar: 'buscar por número',
    temStatus: true
  },
  enviado: {
    table: 782,
    fNumero: 'field_7495',
    fLetra: 'field_7496',
    fData: 'field_7497',
    fContraparte: 'field_7498',      /* destinatário (link 780, único) */
    fDescricao: 'field_7500',
    fCliente: 'field_7501',          /* link 754, múltiplo */
    fDataCumprimento: null,
    fPar: 'field_7504',              /* resposta_do_oficio (link 781) */
    fOutras: 'field_7509',
    fTemAnexos: 'field_7510',
    fCriadoPor: 'field_7511',
    fLogs: 'field_7512',
    tabelaOposta: 781,
    fNumeroOposto: 'field_7486',
    fLetraOposto: 'field_7487',
    fContraparteOposto: 'field_7489',  /* remetente do recebido */
    fParOposto: 'field_7503',          /* respondido_pelo_oficio: back-link no recebido */
    endpointTipo: 'enviados',
    labelData: 'Data de envio',
    labelContraparte: 'Destinatário',
    labelPar: 'Resposta ao ofício recebido',
    hintPar: 'buscar por número do ofício recebido (exige que esteja cadastrado)',
    temStatus: false
  }
};

var CONFIG = CONFIGS[window.OFICIO_TIPO];

/* Rótulos para o log de alterações */
var FIELD_LABELS = {
  numero: 'Número',
  letra: 'Letra',
  data: CONFIG.labelData,
  contraparte: CONFIG.labelContraparte,
  descricao: 'Descrição',
  dataCumprimento: 'Data de cumprimento',
  clientes: 'Cliente(s)',
  par: CONFIG.labelPar,
  outras: 'Outras anotações'
};

/* Estado */
var oficioAtual = null;
var modoNovo = (window.OFICIO_ID === null);
var snapshot = null;
var clientesSelecionados = [];     /* [{id, nome}] */
var parSelecionado = null;         /* {id, rotulo} | null */
var temAnexos = false;
var buscaClienteTimer = null;
var buscaParTimer = null;

/* ========================= HELPERS ========================= */

function apiHeaders() {
  return { 'Content-Type': 'application/json' };
}

function esc(str) {
  if (str === null || str === undefined) return '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

function mostrarOverlay() {
  var el = document.getElementById('overlay');
  if (el) el.classList.add('active');
}

function esconderOverlay() {
  var el = document.getElementById('overlay');
  if (el) el.classList.remove('active');
}

function mostrarMsg(id, tipo, texto) {
  var el = document.getElementById(id);
  if (!el) return;
  var icone = '';
  if (tipo === 'success') icone = '<i class="ph ph-check-circle"></i> ';
  else if (tipo === 'warning') icone = '<i class="ph ph-warning"></i> ';
  else if (tipo === 'error') icone = '<i class="ph ph-x-circle"></i> ';
  else if (tipo === 'info') icone = '<i class="ph ph-info"></i> ';
  el.className = 'msg-box ' + tipo;
  el.innerHTML = icone + texto;
  el.style.display = 'flex';
}

function esconderMsg(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.style.display = 'none';
  el.innerHTML = '';
}

/* Data ISO (YYYY-MM-DD...) → DD/MM/AAAA por fatiamento (sem new Date) */
function formatarData(dataStr) {
  if (!dataStr) return '—';
  var iso = String(dataStr).slice(0, 10);
  var partes = iso.split('-');
  if (partes.length !== 3) return esc(dataStr);
  return partes[2] + '/' + partes[1] + '/' + partes[0];
}

/* Parte YYYY-MM-DD de uma data ISO */
function isoData(dataStr) {
  if (!dataStr) return '';
  return String(dataStr).slice(0, 10);
}

function podeEditar() {
  return window.CURRENT_USER &&
    (window.CURRENT_USER.perfil === 'master' || window.CURRENT_USER.perfil === 'administrador');
}

function formatarTamanho(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/* ========================= MARKDOWN ========================= */

function renderMarkdownInto(el, mdTexto) {
  if (!el) return;
  mdTexto = mdTexto || '';
  if (!mdTexto.trim()) {
    el.innerHTML = '<div class="md-placeholder">Pré-visualização...</div>';
    return;
  }
  if (window.marked) {
    var html = marked.parse(mdTexto);
    el.innerHTML = (window.DOMPurify) ? DOMPurify.sanitize(html) : html;
  } else {
    el.textContent = mdTexto;
  }
}

function atualizarPreviewDescricao() {
  var ta = document.getElementById('descricaoInput');
  var prev = document.getElementById('descricaoPreview');
  if (!ta || !prev) return;
  renderMarkdownInto(prev, ta.value || '');
}

function addMarkdownDescricao(tipo) {
  var ta = document.getElementById('descricaoInput');
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
  atualizarPreviewDescricao();
}

/* ========================= REMETENTE/DESTINATÁRIO ========================= */

function carregarRemetentes(callback) {
  var url = API_BASE + '/database/rows/table/' + TABLE_REMDEST +
    '/?user_field_names=false&size=200&order_by=' + F_REMDEST_NOME;
  fetch(url, { headers: apiHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var rows = data.results || [];
      var sel = document.getElementById('remetenteSelect');
      sel.innerHTML = '<option value="">— selecione —</option>';
      var i;
      for (i = 0; i < rows.length; i++) {
        var nome = rows[i][F_REMDEST_NOME] || '';
        var tipoObj = rows[i][F_REMDEST_TIPO];
        var tipoTxt = (tipoObj && tipoObj.value) ? tipoObj.value : '';
        var opt = document.createElement('option');
        opt.value = String(rows[i].id);
        opt.textContent = tipoTxt ? (nome + ' (' + tipoTxt + ')') : nome;
        sel.appendChild(opt);
      }
      if (rows.length === 0) {
        var nota = document.getElementById('remetenteNota');
        nota.textContent = 'Nenhum remetente/destinatário cadastrado. Cadastre na tabela rem_dest_oficios do Baserow.';
        nota.style.display = 'block';
      }
      if (callback) callback();
    })
    .catch(function() {
      if (callback) callback();
    });
}

/* ========================= CLIENTES (autocomplete + chips) ========================= */

function buscarCliente(termo) {
  var url = API_BASE + '/database/rows/table/' + TABLE_CLIENTES +
    '/?user_field_names=false&filter__' + F_CLIENTE_NOME + '__contains=' +
    encodeURIComponent(termo) + '&size=10';
  fetch(url, { headers: apiHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) { mostrarAutoCliente(data.results || []); })
    .catch(function() {});
}

function mostrarAutoCliente(resultados) {
  var lista = document.getElementById('clienteAutoList');
  lista.innerHTML = '';
  if (resultados.length === 0) { lista.classList.remove('open'); return; }
  var i;
  for (i = 0; i < resultados.length; i++) {
    (function(cli) {
      var nome = cli[F_CLIENTE_NOME] || '';
      var item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.innerHTML = '<div class="ac-name">' + esc(nome) + '</div>';
      item.addEventListener('click', function() {
        adicionarChipCliente(cli.id, nome);
        document.getElementById('clienteBusca').value = '';
        lista.classList.remove('open');
      });
      lista.appendChild(item);
    })(resultados[i]);
  }
  lista.classList.add('open');
}

function adicionarChipCliente(id, nome) {
  var i;
  for (i = 0; i < clientesSelecionados.length; i++) {
    if (clientesSelecionados[i].id === id) return; /* sem duplicar */
  }
  clientesSelecionados.push({ id: id, nome: nome });
  renderChipsCliente();
}

function removerChipCliente(id) {
  var novos = [];
  var i;
  for (i = 0; i < clientesSelecionados.length; i++) {
    if (clientesSelecionados[i].id !== id) novos.push(clientesSelecionados[i]);
  }
  clientesSelecionados = novos;
  renderChipsCliente();
}

function renderChipsCliente() {
  var cont = document.getElementById('clienteChips');
  cont.innerHTML = '';
  var i;
  for (i = 0; i < clientesSelecionados.length; i++) {
    (function(cli) {
      var chip = document.createElement('span');
      chip.className = 'oficio-det-chip';
      chip.innerHTML = '<span>' + esc(cli.nome) + '</span>';
      if (podeEditar()) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'oficio-det-chip-remove';
        btn.innerHTML = '<i class="ph ph-x"></i>';
        btn.addEventListener('click', function() { removerChipCliente(cli.id); });
        chip.appendChild(btn);
      }
      cont.appendChild(chip);
    })(clientesSelecionados[i]);
  }
}

/* ========================= OFÍCIO-PAR (1:1) ========================= */

function buscarPar(termo) {
  var url = API_BASE + '/database/rows/table/' + CONFIG.tabelaOposta +
    '/?user_field_names=false&filter__' + CONFIG.fNumeroOposto + '__contains=' +
    encodeURIComponent(termo) + '&size=15';
  fetch(url, { headers: apiHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) { mostrarAutoPar(data.results || []); })
    .catch(function() {});
}

function mostrarAutoPar(resultados) {
  var lista = document.getElementById('parAutoList');
  lista.innerHTML = '';
  if (resultados.length === 0) { lista.classList.remove('open'); return; }
  var i;
  for (i = 0; i < resultados.length; i++) {
    (function(cand) {
      var numero = cand[CONFIG.fNumeroOposto] || '';
      var letra = cand[CONFIG.fLetraOposto] || '';
      var rotulo = letra ? (numero + '/' + letra) : numero;
      var contraArr = cand[CONFIG.fContraparteOposto];
      var contra = (contraArr && contraArr.length > 0 && contraArr[0].value) ? contraArr[0].value : '';

      /* 1:1 — só selecionável se o campo-par do candidato estiver vazio,
         exceto o par já vinculado a este registro */
      var parArr = cand[CONFIG.fParOposto];
      var jaVinculado = parArr && parArr.length > 0;
      var ehProprioPar = parSelecionado && parSelecionado.id === cand.id;

      var item = document.createElement('div');
      item.innerHTML = '<div class="ac-name">' + esc(rotulo) + '</div>' +
        (contra ? '<div class="ac-detail">' + esc(contra) + '</div>' :
          '<div class="ac-detail">—</div>');

      if (jaVinculado && !ehProprioPar) {
        item.className = 'autocomplete-item oficio-det-ac-disabled';
        item.innerHTML += '<div class="ac-detail">já vinculado a outro ofício</div>';
      } else {
        item.className = 'autocomplete-item';
        item.addEventListener('click', function() {
          selecionarPar(cand.id, rotulo);
          document.getElementById('parBusca').value = '';
          lista.classList.remove('open');
        });
      }
      lista.appendChild(item);
    })(resultados[i]);
  }
  lista.classList.add('open');
}

function selecionarPar(id, rotulo) {
  parSelecionado = { id: id, rotulo: rotulo };
  renderPar();
}

function removerPar() {
  parSelecionado = null;
  renderPar();
}

function renderPar() {
  var cont = document.getElementById('parSelecionado');
  if (!parSelecionado) {
    cont.style.display = 'none';
    cont.innerHTML = '';
    return;
  }
  cont.style.display = 'flex';
  cont.innerHTML = '<span class="oficio-det-par-info"><i class="ph ph-link"></i> ' +
    esc(parSelecionado.rotulo) + '</span>';
  if (podeEditar()) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'oficio-det-par-remove';
    btn.innerHTML = '<i class="ph ph-x"></i>';
    btn.addEventListener('click', removerPar);
    cont.appendChild(btn);
  }
}

/* ========================= CARGA / PREENCHIMENTO ========================= */

function aplicarRotulos() {
  document.getElementById('dataLabel').innerHTML =
    CONFIG.labelData + ' <span class="oficio-det-req">*</span>';
  document.getElementById('remetenteLabel').innerHTML =
    CONFIG.labelContraparte + ' <span class="oficio-det-req">*</span>';
  document.getElementById('parLabel').innerHTML =
    CONFIG.labelPar + ' <span class="hint">— ' + CONFIG.hintPar + '</span>';

  var titulo = document.getElementById('tituloPagina');
  var nomeTipo = (window.OFICIO_TIPO === 'recebido') ? 'recebido' : 'enviado';
  titulo.innerHTML = '<i class="ph ph-envelope-simple"></i> Ofício ' + nomeTipo +
    (modoNovo ? ' — novo' : '');

  if (!CONFIG.temStatus) {
    document.getElementById('statusGroup').style.display = 'none';
  }
}

function carregarOficio() {
  var url = API_BASE + '/database/rows/table/' + CONFIG.table + '/' +
    window.OFICIO_ID + '/?user_field_names=false';
  mostrarOverlay();
  fetch(url, { headers: apiHeaders() })
    .then(function(r) {
      if (!r.ok) throw new Error('Ofício não encontrado.');
      return r.json();
    })
    .then(function(data) {
      oficioAtual = data;
      preencherFormulario(data);
      snapshot = capturarSnapshot();
      temAnexos = !!data[CONFIG.fTemAnexos];
      aplicarLock();
      exibirLogs(data);
      listarAnexos();
      esconderOverlay();
      if (!podeEditar()) aplicarModoLeitura();
    })
    .catch(function(e) {
      esconderOverlay();
      mostrarMsg('formMsg', 'error', e.message || 'Erro ao carregar o ofício.');
    });
}

function preencherFormulario(row) {
  document.getElementById('numeroInput').value = row[CONFIG.fNumero] || '';
  document.getElementById('letraInput').value = row[CONFIG.fLetra] || 'A';
  document.getElementById('dataInput').value = isoData(row[CONFIG.fData]);

  var contraArr = row[CONFIG.fContraparte];
  if (contraArr && contraArr.length > 0) {
    document.getElementById('remetenteSelect').value = String(contraArr[0].id);
  }

  document.getElementById('descricaoInput').value = row[CONFIG.fDescricao] || '';
  atualizarPreviewDescricao();

  if (CONFIG.temStatus && CONFIG.fDataCumprimento) {
    document.getElementById('dataCumprimentoInput').value = isoData(row[CONFIG.fDataCumprimento]);
  }

  document.getElementById('outrasInput').value = row[CONFIG.fOutras] || '';

  /* Clientes (link múltiplo) */
  clientesSelecionados = [];
  var cliArr = row[CONFIG.fCliente];
  if (cliArr && cliArr.length > 0) {
    var i;
    for (i = 0; i < cliArr.length; i++) {
      clientesSelecionados.push({ id: cliArr[i].id, nome: cliArr[i].value || '' });
    }
  }
  renderChipsCliente();

  /* Ofício-par (link único) */
  parSelecionado = null;
  var parArr = row[CONFIG.fPar];
  if (parArr && parArr.length > 0) {
    parSelecionado = { id: parArr[0].id, rotulo: parArr[0].value || ('#' + parArr[0].id) };
  }
  renderPar();
}

/* ========================= SNAPSHOT / LOG ========================= */

function valorSelectTexto(selectId) {
  var sel = document.getElementById(selectId);
  if (!sel || sel.selectedIndex < 0) return '';
  return sel.options[sel.selectedIndex].text || '';
}

function nomesClientes() {
  var nomes = [];
  var i;
  for (i = 0; i < clientesSelecionados.length; i++) nomes.push(clientesSelecionados[i].nome);
  nomes.sort();
  return nomes.join(', ');
}

function capturarSnapshot() {
  /* Estado de referência (igual ao capturarEstadoAtual, mas tirado logo após preencher) */
  return capturarEstadoAtual();
}

function capturarEstadoAtual() {
  var estado = {};
  estado.numero = document.getElementById('numeroInput').value.trim();
  estado.letra = (document.getElementById('letraInput').value || '').trim().toUpperCase();
  estado.data = document.getElementById('dataInput').value || '';
  estado.contraparte = valorSelectTexto('remetenteSelect');
  estado.descricao = document.getElementById('descricaoInput').value || '';
  estado.dataCumprimento = (CONFIG.temStatus)
    ? (document.getElementById('dataCumprimentoInput').value || '') : '';
  estado.clientes = nomesClientes();
  estado.par = parSelecionado ? parSelecionado.rotulo : '';
  estado.outras = document.getElementById('outrasInput').value || '';
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
  var chaves = ['numero', 'letra', 'data', 'contraparte', 'descricao', 'dataCumprimento', 'clientes', 'par', 'outras'];
  var i;
  for (i = 0; i < chaves.length; i++) {
    var chave = chaves[i];
    if (chave === 'dataCumprimento' && !CONFIG.temStatus) continue;
    var anterior = (snapAnterior[chave] !== undefined && snapAnterior[chave] !== null) ? String(snapAnterior[chave]) : '';
    var atual = (estadoAtual[chave] !== undefined && estadoAtual[chave] !== null) ? String(estadoAtual[chave]) : '';
    if (anterior !== atual) {
      var valorAnterior = anterior || '(vazio)';
      linhas.push(nomeUsuario + '. ' + dataHora + ': O campo ' + FIELD_LABELS[chave] +
        ' foi alterado. Valor anterior: ' + valorAnterior + '.');
    }
  }
  return linhas;
}

function exibirLogs(row) {
  var logCard = document.getElementById('logCard');
  var logContent = document.getElementById('logContent');
  var logsVal = (row && row[CONFIG.fLogs]) ? row[CONFIG.fLogs] : '';
  if (logsVal && logsVal.trim()) {
    logContent.textContent = logsVal;
    logCard.style.display = '';
  } else {
    logContent.textContent = '';
    logCard.style.display = 'none';
  }
}

/* ========================= SALVAR ========================= */

function validarObrigatorios() {
  var numero = document.getElementById('numeroInput').value.trim();
  var letra = document.getElementById('letraInput').value.trim();
  var data = document.getElementById('dataInput').value;
  var remetente = document.getElementById('remetenteSelect').value;
  var descricao = document.getElementById('descricaoInput').value.trim();
  if (!numero) return 'Informe o número do ofício.';
  if (!letra) return 'Informe a letra do ofício.';
  if (!/^[A-Za-z]{1,3}$/.test(letra)) return 'A letra deve conter de 1 a 3 caracteres alfabéticos.';
  if (!data) return 'Informe a data.';
  if (!remetente) return 'Selecione o ' + CONFIG.labelContraparte.toLowerCase() + '.';
  if (!descricao) return 'Preencha a descrição do ofício.';
  return null;
}

function proximaLetraLivre(usadas) {
  var alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var i;
  for (i = 0; i < alfabeto.length; i++) {
    if (!usadas[alfabeto.charAt(i)]) return alfabeto.charAt(i);
  }
  return '';
}

function checarNumeroRepetido(numero, letra, anoStr, callback) {
  var url = API_BASE + '/database/rows/table/' + CONFIG.table +
    '/?user_field_names=false&filter__' + CONFIG.fNumero + '__equal=' +
    encodeURIComponent(numero) + '&size=200';
  fetch(url, { headers: apiHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var rows = data.results || [];
      var usadas = {};
      var conflito = false;
      var i;
      for (i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (oficioAtual && r.id === oficioAtual.id) continue; /* ignora o próprio */
        var anoR = isoData(r[CONFIG.fData]).slice(0, 4);
        if (anoR !== anoStr) continue;
        var letraR = (r[CONFIG.fLetra] || '').toUpperCase();
        usadas[letraR] = true;
        if (letraR === letra) conflito = true;
      }
      usadas[letra] = true;
      callback({ conflito: conflito, sugestao: proximaLetraLivre(usadas) });
    })
    .catch(function() {
      /* Em falha da checagem, não bloqueia o salvamento */
      callback({ conflito: false, sugestao: '' });
    });
}

function salvarOficio() {
  var erro = validarObrigatorios();
  if (erro) {
    mostrarMsg('formMsg', 'warning', erro);
    return;
  }

  var numero = document.getElementById('numeroInput').value.trim();
  var letra = document.getElementById('letraInput').value.trim().toUpperCase();
  var data = document.getElementById('dataInput').value;
  var anoStr = isoData(data).slice(0, 4);

  document.getElementById('letraInput').value = letra;

  var btn = document.getElementById('btnSalvar');
  btn.disabled = true;
  mostrarOverlay();
  esconderMsg('formMsg');

  checarNumeroRepetido(numero, letra, anoStr, function(res) {
    if (res.conflito) {
      esconderOverlay();
      btn.disabled = false;
      var msg = 'Ofício ' + numero + '/' + letra + ' já existe neste ano.';
      if (res.sugestao) {
        if (window.confirm(msg + ' Usar ' + numero + '/' + res.sugestao + '?')) {
          document.getElementById('letraInput').value = res.sugestao;
          salvarOficio();
          return;
        }
      } else {
        window.alert(msg);
      }
      mostrarMsg('formMsg', 'warning', msg + (res.sugestao ? ' Sugestão: ' + numero + '/' + res.sugestao + '.' : ''));
      return;
    }
    gravar(btn);
  });
}

function montarPayload() {
  var payload = {};
  payload[CONFIG.fNumero] = document.getElementById('numeroInput').value.trim();
  payload[CONFIG.fLetra] = document.getElementById('letraInput').value.trim().toUpperCase();
  payload[CONFIG.fData] = document.getElementById('dataInput').value || null;
  payload[CONFIG.fDescricao] = document.getElementById('descricaoInput').value;
  payload[CONFIG.fOutras] = document.getElementById('outrasInput').value;

  var remetente = document.getElementById('remetenteSelect').value;
  payload[CONFIG.fContraparte] = remetente ? [parseInt(remetente, 10)] : [];

  var ids = [];
  var i;
  for (i = 0; i < clientesSelecionados.length; i++) ids.push(clientesSelecionados[i].id);
  payload[CONFIG.fCliente] = ids;

  payload[CONFIG.fPar] = parSelecionado ? [parSelecionado.id] : [];

  if (CONFIG.temStatus && CONFIG.fDataCumprimento) {
    var dc = document.getElementById('dataCumprimentoInput').value;
    payload[CONFIG.fDataCumprimento] = dc || null;
  }
  return payload;
}

function gravar(btn) {
  if (modoNovo) {
    var payloadNovo = montarPayload();
    payloadNovo[CONFIG.fCriadoPor] = (window.CURRENT_USER && window.CURRENT_USER.nome) ? window.CURRENT_USER.nome : '';
    var urlPost = API_BASE + '/database/rows/table/' + CONFIG.table + '/?user_field_names=false';
    fetch(urlPost, { method: 'POST', headers: apiHeaders(), body: JSON.stringify(payloadNovo) })
      .then(function(r) {
        if (!r.ok) return r.json().then(function(e) { throw new Error(e.detail || 'Erro ao criar o ofício.'); });
        return r.json();
      })
      .then(function(data) {
        oficioAtual = data;
        modoNovo = false;
        window.OFICIO_ID = data.id;
        snapshot = capturarSnapshot();
        try {
          history.replaceState(null, '', '/oficios/' + window.OFICIO_TIPO + '/' + data.id);
        } catch (e) {}
        habilitarAnexos();
        esconderOverlay();
        btn.disabled = false;
        document.getElementById('tituloPagina').innerHTML =
          '<i class="ph ph-envelope-simple"></i> Ofício ' + window.OFICIO_TIPO;
        mostrarMsg('formMsg', 'success', 'Ofício criado com sucesso. Agora você pode anexar arquivos.');
      })
      .catch(function(e) {
        esconderOverlay();
        btn.disabled = false;
        mostrarMsg('formMsg', 'error', e.message || 'Erro ao criar o ofício.');
      });
  } else {
    var payload = montarPayload();
    var estadoAtual = capturarEstadoAtual();
    var linhasLog = gerarLinhasLog(snapshot, estadoAtual);
    if (linhasLog.length > 0) {
      var logsExistentes = (oficioAtual && oficioAtual[CONFIG.fLogs]) ? oficioAtual[CONFIG.fLogs] : '';
      var novas = linhasLog.join('\n');
      payload[CONFIG.fLogs] = logsExistentes ? (novas + '\n' + logsExistentes) : novas;
    }
    var urlPatch = API_BASE + '/database/rows/table/' + CONFIG.table + '/' + oficioAtual.id + '/?user_field_names=false';
    fetch(urlPatch, { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(payload) })
      .then(function(r) {
        if (!r.ok) return r.json().then(function(e) { throw new Error(e.detail || 'Erro ao salvar.'); });
        return r.json();
      })
      .then(function(data) {
        oficioAtual = data;
        snapshot = capturarSnapshot();
        exibirLogs(data);
        esconderOverlay();
        btn.disabled = false;
        mostrarMsg('formMsg', 'success', 'Alterações salvas com sucesso.');
      })
      .catch(function(e) {
        esconderOverlay();
        btn.disabled = false;
        mostrarMsg('formMsg', 'error', e.message || 'Erro ao salvar.');
      });
  }
}

/* ========================= ANEXOS (fase 1) ========================= */

function anexosBaseUrl() {
  var ano = isoData(document.getElementById('dataInput').value).slice(0, 4);
  var numero = document.getElementById('numeroInput').value.trim();
  var letra = document.getElementById('letraInput').value.trim().toUpperCase();
  if (!ano || !numero || !letra) return null;
  return OFICIOS_API + '/' + CONFIG.endpointTipo + '/' + ano + '/' + numero + '/' + letra + '/arquivos';
}

function listarAnexos() {
  if (modoNovo) return;
  var base = anexosBaseUrl();
  if (!base) return;
  fetch(base, { headers: apiHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      renderAnexos(data.arquivos || [], base);
      var nota = document.getElementById('anexosNota');
      if ((!data.arquivos || data.arquivos.length === 0) && temAnexos) {
        nota.textContent = 'Anexos registrados em outro ambiente.';
        nota.style.display = 'block';
      } else if (!modoNovo) {
        nota.style.display = 'none';
      }
    })
    .catch(function() {});
}

function renderAnexos(arquivos, base) {
  var cont = document.getElementById('anexosList');
  cont.innerHTML = '';
  var i;
  for (i = 0; i < arquivos.length; i++) {
    (function(arq) {
      var item = document.createElement('div');
      item.className = 'oficio-det-anexo-item';
      var dlUrl = base + '/' + encodeURIComponent(arq.nome);
      var html = '<i class="ph ph-file oficio-det-anexo-ico"></i>';
      html += '<span class="oficio-det-anexo-nome"><a href="' + dlUrl + '">' + esc(arq.nome) + '</a></span>';
      html += '<span class="oficio-det-anexo-tam">' + formatarTamanho(arq.tamanho) + '</span>';
      item.innerHTML = html;
      if (podeEditar()) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'oficio-det-anexo-del';
        btn.title = 'Excluir anexo';
        btn.innerHTML = '<i class="ph ph-trash"></i>';
        btn.addEventListener('click', function() { excluirAnexo(arq.nome); });
        item.appendChild(btn);
      }
      cont.appendChild(item);
    })(arquivos[i]);
  }
}

function enviarAnexo() {
  if (modoNovo) return;
  var input = document.getElementById('anexoInput');
  if (!input.files || input.files.length === 0) {
    mostrarMsg('formMsg', 'warning', 'Selecione um arquivo para enviar.');
    return;
  }
  var base = anexosBaseUrl();
  if (!base) return;
  var fd = new FormData();
  fd.append('arquivo', input.files[0]);
  mostrarOverlay();
  fetch(base, { method: 'POST', body: fd })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(e) { throw new Error(e.erro || 'Erro ao enviar anexo.'); });
      return r.json();
    })
    .then(function(data) {
      input.value = '';
      renderAnexos(data.arquivos || [], base);
      esconderOverlay();
      sincronizarTemAnexos(!!data.tem_anexos);
      mostrarMsg('formMsg', 'success', 'Anexo enviado.');
    })
    .catch(function(e) {
      esconderOverlay();
      mostrarMsg('formMsg', 'error', e.message || 'Erro ao enviar anexo.');
    });
}

function excluirAnexo(nome) {
  if (!window.confirm('Excluir o anexo "' + nome + '"?')) return;
  var base = anexosBaseUrl();
  if (!base) return;
  mostrarOverlay();
  fetch(base + '/' + encodeURIComponent(nome), { method: 'DELETE', headers: apiHeaders() })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(e) { throw new Error(e.erro || 'Erro ao excluir anexo.'); });
      return r.json();
    })
    .then(function(data) {
      renderAnexos(data.arquivos || [], base);
      esconderOverlay();
      sincronizarTemAnexos(!!data.tem_anexos);
    })
    .catch(function(e) {
      esconderOverlay();
      mostrarMsg('formMsg', 'error', e.message || 'Erro ao excluir anexo.');
    });
}

/* Sincroniza o boolean tem_anexos no Baserow + aplica/remove o lock */
function sincronizarTemAnexos(temAgora) {
  if (temAgora === temAnexos) {
    aplicarLock();
    return;
  }
  var payload = {};
  payload[CONFIG.fTemAnexos] = temAgora;
  var url = API_BASE + '/database/rows/table/' + CONFIG.table + '/' + oficioAtual.id + '/?user_field_names=false';
  fetch(url, { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(payload) })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      oficioAtual = data;
      temAnexos = temAgora;
      aplicarLock();
    })
    .catch(function() {});
}

function aplicarLock() {
  var ro = !!temAnexos;
  document.getElementById('numeroInput').readOnly = ro;
  document.getElementById('letraInput').readOnly = ro;
}

function habilitarAnexos() {
  document.getElementById('anexoInput').disabled = false;
  document.getElementById('btnEnviarAnexo').disabled = false;
  document.getElementById('anexosNota').style.display = 'none';
  listarAnexos();
}

function desabilitarAnexosNovo() {
  document.getElementById('anexoInput').disabled = true;
  document.getElementById('btnEnviarAnexo').disabled = true;
  var nota = document.getElementById('anexosNota');
  nota.textContent = 'Salve o ofício para habilitar os anexos.';
  nota.style.display = 'block';
}

/* ========================= MODO LEITURA ========================= */

function aplicarModoLeitura() {
  var ids = ['numeroInput', 'letraInput', 'dataInput', 'remetenteSelect', 'dataCumprimentoInput',
    'descricaoInput', 'outrasInput', 'clienteBusca', 'parBusca'];
  var i;
  for (i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (el) el.disabled = true;
  }
  var toolbar = document.querySelector('.md-toolbar');
  if (toolbar) toolbar.style.display = 'none';
  document.getElementById('acoesBar').style.display = 'none';
  document.getElementById('anexoControles').style.display = 'none';
}

/* ========================= LIMPAR ========================= */

function limparFormulario() {
  if (modoNovo) {
    document.getElementById('numeroInput').value = '';
    document.getElementById('letraInput').value = 'A';
    document.getElementById('dataInput').value = '';
    document.getElementById('remetenteSelect').value = '';
    document.getElementById('descricaoInput').value = '';
    atualizarPreviewDescricao();
    if (CONFIG.temStatus) document.getElementById('dataCumprimentoInput').value = '';
    document.getElementById('outrasInput').value = '';
    clientesSelecionados = [];
    renderChipsCliente();
    parSelecionado = null;
    renderPar();
    esconderMsg('formMsg');
  } else if (oficioAtual) {
    preencherFormulario(oficioAtual);
    esconderMsg('formMsg');
  }
}

/* ========================= INIT ========================= */

document.addEventListener('DOMContentLoaded', function() {
  aplicarRotulos();

  carregarRemetentes(function() {
    if (!modoNovo) {
      carregarOficio();
    } else {
      desabilitarAnexosNovo();
      if (!podeEditar()) aplicarModoLeitura();
    }
  });

  /* Editor markdown */
  var ta = document.getElementById('descricaoInput');
  if (ta) ta.addEventListener('input', atualizarPreviewDescricao);

  /* Autocomplete cliente */
  var cb = document.getElementById('clienteBusca');
  cb.addEventListener('input', function() {
    var raw = cb.value.trim();
    if (buscaClienteTimer) clearTimeout(buscaClienteTimer);
    if (raw.length < 3) { document.getElementById('clienteAutoList').classList.remove('open'); return; }
    buscaClienteTimer = setTimeout(function() { buscarCliente(raw); }, 300);
  });

  /* Autocomplete par */
  var pb = document.getElementById('parBusca');
  pb.addEventListener('input', function() {
    var raw = pb.value.trim();
    if (buscaParTimer) clearTimeout(buscaParTimer);
    if (raw.length < 1) { document.getElementById('parAutoList').classList.remove('open'); return; }
    buscaParTimer = setTimeout(function() { buscarPar(raw); }, 300);
  });

  /* Fechar autocompletes ao clicar fora */
  document.addEventListener('click', function(ev) {
    if (!ev.target.closest || !ev.target.closest('.autocomplete-wrapper')) {
      document.getElementById('clienteAutoList').classList.remove('open');
      document.getElementById('parAutoList').classList.remove('open');
    }
  });

  document.getElementById('btnSalvar').addEventListener('click', salvarOficio);
  document.getElementById('btnLimpar').addEventListener('click', limparFormulario);
  document.getElementById('btnEnviarAnexo').addEventListener('click', enviarAnexo);

  var overlayEl = document.querySelector('.sidebar-overlay');
  if (overlayEl) overlayEl.addEventListener('click', toggleSidebar);
});
