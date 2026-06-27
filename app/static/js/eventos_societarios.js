// eventos_societarios.js — Eventos Societários da PJ
// Fase 1: leitura (quadro atual + linha do tempo). Fase 2: registro de eventos
// documentais (tipos que NÃO alteram o quadro societário; os que alteram ficam
// bloqueados até a Fase 3).
// Tabelas 783 (tipos), 784 (eventos), 785 (participacao_societaria).
// ES5 estrito (var/function). Lê a PJ atual de window.EVENTOS_PJ_ID.
// Espelha o padrão de enderecos.js.
(function() {
  'use strict';

  var API_BASE = '/api/baserow';
  var TABLE_EVENTOS = 784;
  var TABLE_PART = 785;
  var TABLE_TIPOS = 783;

  // Campos da tabela 784 (eventos_societarios)
  var E_ROTULO       = 'field_7522';
  var E_PJ           = 'field_7523';
  var E_TIPO         = 'field_7524';
  var E_DATA_ATO     = 'field_7526';
  var E_DESCRICAO    = 'field_7527';
  var E_CRIADO_POR   = 'field_7528';
  var E_CRIADO_EM    = 'field_7529';
  var E_ATUALIZADO   = 'field_7530';
  var E_REV_ENTRADAS = 'field_7538';
  var E_REV_SAIDAS   = 'field_7540';
  var E_TEM_ANEXO    = 'field_7548';
  var E_EXCLUIDO     = 'field_7549';
  var EVENTOS_API    = '/api/eventos-arquivos';

  // Campos da tabela 785 (participacao_societaria)
  var P_PJ           = 'field_7533';
  var P_SOCIO        = 'field_7534';
  var P_STATUS       = 'field_7541';
  var P_PERCENTUAL   = 'field_7542';
  var P_QUALIFICACAO = 'field_7543';
  // 785 (participacao) — adicionais Fase 3
  var P_ROTULO     = 'field_7532';
  var P_EV_ENTRADA = 'field_7537';
  var P_EV_SAIDA   = 'field_7539';
  var P_MOTIVO     = 'field_7544';
  var P_CRIADO_POR = 'field_7545';
  var P_CRIADO_EM  = 'field_7546';
  var P_ATUALIZADO = 'field_7547';

  // Opções single_select
  var OPT_STATUS_ATIVO     = 3164;
  var OPT_STATUS_INATIVO   = 3165;
  var OPT_MOTIVO_SAIDA     = 3169;
  var OPT_MOTIVO_ALTERACAO = 3170;
  var QUALIF_OPTS = [
    { id: 3166, label: 'Sócio' },
    { id: 3167, label: 'Sócio-administrador' },
    { id: 3168, label: 'Administrador não sócio' }
  ];

  // Tabela de clientes (sócios PF/PJ)
  var TABLE_CLIENTES = 754;
  var C_NOME = 'field_7237';
  var C_CPF  = 'field_7238';
  var C_CNPJ = 'field_7239';

  // Campos da tabela 783 (tipos_eventos_societarios)
  var T_NOME   = 'field_7519';
  var T_ALTERA = 'field_7520';

  // ── Estado interno ────────────────────────────────────
  var tiposMap = {};
  var tiposCarregados = false;

  // Estado do editor de quadro (Fase 3)
  var editorOriginais = {}; // socioId -> { participacaoId, percentual, qualifId }
  var buscaSocioTimer = null;

  // Estado dos anexos de evento (Fase C)
  var anexoInput = null;   // <input type=file> reutilizável
  var anexoAlvo  = null;   // { eventoId, tipo, data } do upload em curso

  // Estado da edição de evento (Edição Fase 1 — só master)
  var editandoEventoId = null;
  var eventosPorId = {};   // id -> row (preenchido em renderTimeline)

  // Edição do efeito no quadro (Edição Fase 2 — só o ato mais recente que altera o quadro)
  var editandoEfeitoQuadro = false;   // true só ao editar o efeito do ato mais recente
  var editAbertasPorEvento = [];      // participacaoIds abertas pelo ato (apagar no desfazer)
  var editFechadasPorEvento = [];     // participacaoIds fechadas pelo ato (reabrir no desfazer)

  // ── Helpers ───────────────────────────────────────────
  function apiHeaders() {
    return { 'Content-Type': 'application/json' };
  }

  function el(id) { return document.getElementById(id); }

  function escapar(s) {
    s = (s == null) ? '' : ('' + s);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
  }

  // single_select vem como { id, value, color } ou null
  function valorSelect(campo) {
    if (campo && typeof campo === 'object') return campo.value || '';
    return campo || '';
  }

  // link_row vem como array [{ id, value }] — value é o campo primário
  function primeiroVinculo(campo) {
    if (campo && campo.length > 0 && campo[0]) return campo[0].value || '';
    return '';
  }

  // Verdadeiro se o array de link_row contém o id informado
  function vinculoContem(campo, id) {
    if (!campo || !campo.length) return false;
    for (var i = 0; i < campo.length; i++) {
      if (campo[i] && campo[i].id === id) return true;
    }
    return false;
  }

  // 'YYYY-MM-DD' -> 'DD/MM/YYYY' por manipulação de string (evita offset UTC-3)
  function formatarData(iso) {
    if (!iso) return '';
    var d = ('' + iso).split('T')[0].split('-');
    if (d.length !== 3) return '' + iso;
    return d[2] + '/' + d[1] + '/' + d[0];
  }

  // Percentual numérico -> 'XX,XX%' (padrão brasileiro)
  function formatarPercentual(valor) {
    return (valor || 0).toFixed(2).replace('.', ',') + '%';
  }

  function renderMarkdown(md) {
    md = md || '';
    if (window.marked) {
      var html = marked.parse(md);
      return (window.DOMPurify) ? DOMPurify.sanitize(html) : html;
    }
    return escapar(md);
  }

  function mostrarFormMsg(tipo, texto) {
    var box = el('eventoFormMsg');
    if (!box) return;
    box.className = 'msg-box ' + tipo;
    box.innerHTML = texto;
    box.style.display = 'flex';
  }

  function esconderFormMsg() {
    var box = el('eventoFormMsg');
    if (!box) return;
    box.style.display = 'none';
    box.innerHTML = '';
  }

  function overlayOn()  { if (window.mostrarOverlay) window.mostrarOverlay(); }
  function overlayOff() { if (window.esconderOverlay) window.esconderOverlay(); }

  // ── Anexos: helpers de perfil/CNPJ/DOM ────────────────
  function cnpjPj() { return (window.EVENTOS_PJ_CNPJ || '').replace(/\D/g, ''); }
  function perfilPodeAnexar() {
    var p = window.CURRENT_USER && window.CURRENT_USER.perfil;
    return p === 'master' || p === 'administrador';
  }
  function perfilPodeExcluir() {
    var p = window.CURRENT_USER && window.CURRENT_USER.perfil;
    return p === 'master';
  }
  function perfilPodeEditarEvento() {
    var p = window.CURRENT_USER && window.CURRENT_USER.perfil;
    return p === 'master';
  }
  function acharAncestral(elem, classe) {
    while (elem && elem !== document) {
      if (elem.classList && elem.classList.contains(classe)) return elem;
      elem = elem.parentNode;
    }
    return null;
  }

  // ── Quadro Societário Atual ───────────────────────────
  function carregarQuadro(pjId) {
    var lista = el('qsLista');
    var total = el('qsTotal');
    if (!lista) return;
    lista.innerHTML = '<div class="qs-empty">Carregando...</div>';
    if (total) total.innerHTML = '';

    var url = API_BASE + '/database/rows/table/' + TABLE_PART +
      '/?user_field_names=false&filter__' + P_PJ + '__link_row_has=' +
      encodeURIComponent(pjId) + '&size=200';
    fetch(url, { headers: apiHeaders() })
      .then(function(r) {
        if (!r.ok) throw new Error('Falha ao listar o quadro societário.');
        return r.json();
      })
      .then(function(data) {
        renderQuadro(data.results || []);
      })
      .catch(function(e) {
        console.error('Erro ao carregar o quadro societário:', e);
        carregarQuadroFallback(pjId);
      });
  }

  function carregarQuadroFallback(pjId) {
    var url = API_BASE + '/database/rows/table/' + TABLE_PART +
      '/?user_field_names=false&size=200';
    fetch(url, { headers: apiHeaders() })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var todos = data.results || [];
        var filtrados = [];
        for (var i = 0; i < todos.length; i++) {
          if (vinculoContem(todos[i][P_PJ], pjId)) filtrados.push(todos[i]);
        }
        renderQuadro(filtrados);
      })
      .catch(function(e) {
        console.error('Erro no fallback do quadro societário:', e);
        var lista = el('qsLista');
        if (lista) lista.innerHTML =
          '<div class="qs-empty">Não foi possível carregar o quadro societário.</div>';
      });
  }

  // Ordena: percentual desc; empate → sócio-administrador primeiro; depois alfabética
  function compararSocios(a, b) {
    if (a.perc !== b.perc) return b.perc - a.perc;
    var ra = (a.qualif === 'Sócio-administrador') ? 0 : 1;
    var rb = (b.qualif === 'Sócio-administrador') ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
  }

  // Busca CPF/CNPJ do sócio na 754 (degrada para '' em qualquer falha)
  function buscarDocumentoSocio(socioId) {
    return fetch(API_BASE + '/database/rows/table/' + TABLE_CLIENTES + '/' + socioId + '/?user_field_names=false',
      { headers: apiHeaders() })
      .then(function(r) { if (!r.ok) throw new Error('x'); return r.json(); })
      .then(function(row) {
        var cpf = (row[C_CPF] || '').toString().trim();
        var cnpj = (row[C_CNPJ] || '').toString().trim();
        if (cpf) return 'CPF ' + cpf;
        if (cnpj) return 'CNPJ ' + cnpj;
        return '';
      })
      .catch(function() { return ''; });
  }

  function renderQuadro(rows) {
    var lista = el('qsLista');
    var total = el('qsTotal');
    if (!lista) return;

    var ativos = [];
    for (var i = 0; i < rows.length; i++) {
      if (valorSelect(rows[i][P_STATUS]) === 'Ativo') ativos.push(rows[i]);
    }
    if (ativos.length === 0) {
      lista.innerHTML = '<div class="qs-empty">Nenhum sócio ativo registrado.</div>';
      if (total) total.innerHTML = '';
      return;
    }

    var socios = [];
    var soma = 0;
    for (var j = 0; j < ativos.length; j++) {
      var row = ativos[j];
      var socio = (row[P_SOCIO] && row[P_SOCIO][0]) ? row[P_SOCIO][0] : null;
      var perc = parseFloat(row[P_PERCENTUAL]) || 0;
      soma += perc;
      socios.push({
        socioId: socio ? socio.id : null,
        nome: (socio && socio.value) ? socio.value : '(sócio sem nome)',
        qualif: valorSelect(row[P_QUALIFICACAO]) || '',
        perc: perc
      });
    }
    socios.sort(compararSocios);

    // documentos (CPF/CNPJ) por sócio, em paralelo
    var ids = [], vistos = {};
    for (j = 0; j < socios.length; j++) {
      var sid = socios[j].socioId;
      if (sid != null && !vistos[sid]) { vistos[sid] = true; ids.push(sid); }
    }
    var promessas = [];
    for (j = 0; j < ids.length; j++) promessas.push(buscarDocumentoSocio(ids[j]));

    Promise.all(promessas).then(function(docs) {
      var docMap = {};
      for (var k = 0; k < ids.length; k++) docMap[ids[k]] = docs[k];
      desenharQuadro(socios, docMap, soma);
    });
  }

  function desenharQuadro(socios, docMap, soma) {
    var lista = el('qsLista');
    var total = el('qsTotal');
    if (!lista) return;
    lista.innerHTML = '';
    for (var j = 0; j < socios.length; j++) {
      var s = socios[j];
      var doc = (s.socioId != null && docMap[s.socioId]) ? docMap[s.socioId] : '';

      var item = document.createElement('div');
      item.className = 'qs-item';

      var info = document.createElement('div');
      info.className = 'qs-item-info';
      var htmlInfo = '<span class="qs-item-nome">' + escapar(s.nome) + '</span>';
      var meta = [];
      if (s.qualif) meta.push(escapar(s.qualif));
      if (doc) meta.push(escapar(doc));
      if (meta.length) htmlInfo += '<span class="qs-item-qualif">' + meta.join(' · ') + '</span>';
      info.innerHTML = htmlInfo;

      var pct = document.createElement('div');
      pct.className = 'qs-item-perc';
      pct.textContent = formatarPercentual(s.perc);

      item.appendChild(info);
      item.appendChild(pct);
      lista.appendChild(item);
    }
    if (total) total.innerHTML = 'Total: <strong>' + formatarPercentual(soma) + '</strong>';
  }

  // ── Linha do Tempo ────────────────────────────────────
  function carregarTimeline(pjId) {
    var timeline = el('evtTimeline');
    if (!timeline) return;
    timeline.innerHTML = '<div class="evt-empty">Carregando...</div>';

    var url = API_BASE + '/database/rows/table/' + TABLE_EVENTOS +
      '/?user_field_names=false&filter__' + E_PJ + '__link_row_has=' +
      encodeURIComponent(pjId) + '&order_by=-' + E_DATA_ATO + '&size=200';
    fetch(url, { headers: apiHeaders() })
      .then(function(r) {
        if (!r.ok) throw new Error('Falha ao listar os eventos.');
        return r.json();
      })
      .then(function(data) {
        renderTimeline(data.results || []);
      })
      .catch(function(e) {
        console.error('Erro ao carregar a linha do tempo:', e);
        carregarTimelineFallback(pjId);
      });
  }

  function carregarTimelineFallback(pjId) {
    var url = API_BASE + '/database/rows/table/' + TABLE_EVENTOS +
      '/?user_field_names=false&size=200';
    fetch(url, { headers: apiHeaders() })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var todos = data.results || [];
        var filtrados = [];
        for (var i = 0; i < todos.length; i++) {
          if (vinculoContem(todos[i][E_PJ], pjId)) filtrados.push(todos[i]);
        }
        // Ordena por data_ato desc (string YYYY-MM-DD ordena lexicograficamente)
        filtrados.sort(function(a, b) {
          var da = a[E_DATA_ATO] || '';
          var db = b[E_DATA_ATO] || '';
          if (da < db) return 1;
          if (da > db) return -1;
          return 0;
        });
        renderTimeline(filtrados);
      })
      .catch(function(e) {
        console.error('Erro no fallback da linha do tempo:', e);
        var timeline = el('evtTimeline');
        if (timeline) timeline.innerHTML =
          '<div class="evt-empty">Não foi possível carregar a linha do tempo.</div>';
      });
  }

  // Classifica os movimentos de um evento a partir dos reversos das participações.
  // Um rótulo presente em entradas e saídas = Alteração; só entradas = Entrada;
  // só saídas = Saída.
  function classificarMovimentos(entradas, saidas) {
    entradas = entradas || [];
    saidas = saidas || [];

    var emSaida = {};
    var k;
    for (k = 0; k < saidas.length; k++) {
      if (saidas[k]) emSaida[saidas[k].value] = true;
    }
    var emEntrada = {};
    for (k = 0; k < entradas.length; k++) {
      if (entradas[k]) emEntrada[entradas[k].value] = true;
    }

    var movs = [];
    var vistos = {};
    var rotulo;
    for (k = 0; k < entradas.length; k++) {
      rotulo = entradas[k] ? entradas[k].value : '';
      if (vistos[rotulo]) continue;
      vistos[rotulo] = true;
      movs.push({ rotulo: rotulo, tipo: emSaida[rotulo] ? 'alteracao' : 'entrada' });
    }
    for (k = 0; k < saidas.length; k++) {
      rotulo = saidas[k] ? saidas[k].value : '';
      if (vistos[rotulo]) continue;
      vistos[rotulo] = true;
      movs.push({ rotulo: rotulo, tipo: 'saida' });
    }
    return movs;
  }

  function htmlMovimentos(movs) {
    if (!movs.length) return '';
    var rotulos = { entrada: 'Entrada', saida: 'Saída', alteracao: 'Alteração' };
    var icones = {
      entrada: 'ph-plus-circle',
      saida: 'ph-minus-circle',
      alteracao: 'ph-arrows-clockwise'
    };
    var html = '<div class="evt-item-mov">';
    for (var i = 0; i < movs.length; i++) {
      var m = movs[i];
      html += '<span class="evt-mov-' + m.tipo + '">' +
              '<i class="ph ' + icones[m.tipo] + '"></i> ' +
              rotulos[m.tipo] + ': ' + escapar(m.rotulo) +
              '</span>';
    }
    html += '</div>';
    return html;
  }

  function renderTimeline(rows) {
    var timeline = el('evtTimeline');
    if (!timeline) return;
    eventosPorId = {};

    // Filtra os eventos logicamente excluídos (robusto, no cliente)
    var visiveis = [];
    if (rows) {
      for (var v = 0; v < rows.length; v++) {
        if (rows[v][E_EXCLUIDO] === true) continue;
        visiveis.push(rows[v]);
      }
    }
    if (visiveis.length === 0) {
      timeline.innerHTML = '<div class="evt-empty">Nenhum evento registrado.</div>';
      return;
    }

    timeline.innerHTML = '';
    for (var i = 0; i < visiveis.length; i++) {
      var row = visiveis[i];
      eventosPorId[row.id] = row;
      var data = formatarData(row[E_DATA_ATO]);
      var tipo = primeiroVinculo(row[E_TIPO]);
      var descricao = row[E_DESCRICAO] || '';
      var movs = classificarMovimentos(row[E_REV_ENTRADAS], row[E_REV_SAIDAS]);

      var item = document.createElement('div');
      item.className = 'evt-item';
      item.setAttribute('data-evento-id', row.id);
      item.setAttribute('data-tipo', tipo || '');
      item.setAttribute('data-data', row[E_DATA_ATO] || '');

      var corpo = '<div class="evt-item-cab">';
      corpo += '<span class="evt-item-data">' + escapar(data || '—') + '</span>';
      if (tipo) corpo += '<span class="evt-item-tipo">' + escapar(tipo) + '</span>';
      corpo += '</div>';
      if (descricao && descricao.trim() !== '') {
        corpo += '<div class="evt-item-desc">' + renderMarkdown(descricao) + '</div>';
      }
      corpo += htmlMovimentos(movs);
      corpo += htmlAcoes(row);

      item.innerHTML = '<div class="evt-item-corpo">' + corpo + '</div>' + htmlVerAnexo(row);
      timeline.appendChild(item);
    }
  }

  // ── Anexos de evento (Fase C) ─────────────────────────
  // Linha de ações (ícone só + tooltip): editar, substituir, excluir
  function htmlAcoes(row) {
    var temAnexo = !!row[E_TEM_ANEXO];
    var temCnpj = cnpjPj().length === 14;
    var tipoId = (row[E_TIPO] && row[E_TIPO][0]) ? row[E_TIPO][0].id : null;
    // Documental = tipo conhecido E que NÃO altera o quadro. Tipo desconhecido → fail-closed (não exclui).
    var ehDocumental = !!(tipoId && tiposMap[tipoId] && tiposMap[tipoId].alteraQuadro === false);
    var partes = [];

    if (perfilPodeEditarEvento()) {
      partes.push('<button type="button" class="evt-acao-btn evt-evento-editar" title="Editar evento"><i class="ph ph-pencil-simple"></i></button>');
    }
    if (perfilPodeAnexar() && temCnpj) {
      partes.push('<button type="button" class="evt-acao-btn evt-anexo-enviar" title="' +
                  (temAnexo ? 'Substituir anexo' : 'Anexar arquivo') + '"><i class="ph ph-paperclip"></i></button>');
    }
    if (temAnexo && perfilPodeExcluir() && temCnpj) {
      partes.push('<button type="button" class="evt-acao-btn evt-anexo-excluir" title="Excluir anexo"><i class="ph ph-trash"></i></button>');
    }
    if (perfilPodeExcluir() && ehDocumental) {
      partes.push('<button type="button" class="evt-acao-btn evt-evento-excluir" title="Excluir evento"><i class="ph ph-x-circle"></i></button>');
    }
    if (!temCnpj && perfilPodeAnexar()) {
      partes.push('<span class="evt-anexo-aviso">Cadastre o CNPJ da PJ para anexar.</span>');
    }
    if (!partes.length) return '';
    return '<div class="evt-item-acoes">' + partes.join('') + '</div>';
  }

  // Botão "Ver anexo" (ícone só) na extremidade direita do ato
  function htmlVerAnexo(row) {
    if (!row[E_TEM_ANEXO]) return '';
    return '<button type="button" class="evt-ver-lateral evt-anexo-ver" title="Ver anexo"><i class="ph ph-eye"></i></button>';
  }

  function garantirInputAnexo() {
    if (anexoInput) return;
    anexoInput = document.createElement('input');
    anexoInput.type = 'file';
    anexoInput.accept = '.pdf,.jpg,.jpeg,.png,.tif,.tiff';
    anexoInput.style.display = 'none';
    anexoInput.addEventListener('change', onAnexoFileChange);
    document.body.appendChild(anexoInput);
  }

  function onTimelineClick(e) {
    var alvo = e.target;
    var item = acharAncestral(alvo, 'evt-item');
    if (!item) return;
    var eventoId = item.getAttribute('data-evento-id');
    var tipo = item.getAttribute('data-tipo');
    var data = item.getAttribute('data-data');
    if (acharAncestral(alvo, 'evt-evento-editar'))  { abrirFormEventoEdicao(eventoId); return; }
    if (acharAncestral(alvo, 'evt-anexo-ver'))      { verAnexo(eventoId); return; }
    if (acharAncestral(alvo, 'evt-anexo-enviar'))   { enviarAnexo(eventoId, tipo, data); return; }
    if (acharAncestral(alvo, 'evt-anexo-excluir'))  { excluirAnexo(eventoId); return; }
    if (acharAncestral(alvo, 'evt-evento-excluir')) { excluirEvento(eventoId); return; }
  }

  function verAnexo(eventoId) {
    var cnpj = cnpjPj();
    fetch(EVENTOS_API + '/' + cnpj + '/' + eventoId + '/arquivo', { headers: apiHeaders() })
      .then(function(r) { return r.json(); })
      .then(function(resp) {
        if (resp && resp.arquivo && resp.arquivo.nome) {
          window.open(EVENTOS_API + '/' + cnpj + '/' + eventoId + '/arquivo/' +
                      encodeURIComponent(resp.arquivo.nome), '_blank');
        } else if (window.mostrarToast) {
          mostrarToast('Anexo não disponível neste ambiente.', 'info');
        }
      })
      .catch(function(e) {
        console.error(e);
        if (window.mostrarToast) mostrarToast('Não foi possível abrir o anexo.', 'error');
      });
  }

  function enviarAnexo(eventoId, tipo, data) {
    if (cnpjPj().length !== 14) {
      if (window.mostrarToast) mostrarToast('PJ sem CNPJ válido.', 'error');
      return;
    }
    garantirInputAnexo();
    anexoAlvo = { eventoId: eventoId, tipo: tipo, data: data };
    anexoInput.value = '';
    anexoInput.click();
  }

  function onAnexoFileChange() {
    if (!anexoInput.files || !anexoInput.files[0] || !anexoAlvo) return;
    var file = anexoInput.files[0];
    var cnpj = cnpjPj();
    var fd = new FormData();
    fd.append('arquivo', file);
    fd.append('denominacao', window.EVENTOS_PJ_NOME || '');
    fd.append('tipo', anexoAlvo.tipo || '');
    fd.append('data', anexoAlvo.data || '');

    overlayOn();
    fetch(EVENTOS_API + '/' + cnpj + '/' + anexoAlvo.eventoId + '/arquivo',
      { method: 'POST', body: fd })   // SEM Content-Type manual (boundary do navegador)
      .then(function(r) {
        if (!r.ok) return r.json().then(function(e){ throw new Error(e.erro || 'Erro ao anexar.'); });
        return r.json();
      })
      .then(function(resp) { return patchTemAnexo(anexoAlvo.eventoId, !!resp.tem_anexo); })
      .then(function() {
        overlayOff();
        carregarEventos();
        if (window.mostrarToast) mostrarToast('Anexo enviado.', 'success');
      })
      .catch(function(e) {
        overlayOff();
        console.error(e);
        if (window.mostrarToast) mostrarToast(e.message || 'Erro ao anexar.', 'error');
      });
  }

  function excluirAnexo(eventoId) {
    var cnpj = cnpjPj();
    fetch(EVENTOS_API + '/' + cnpj + '/' + eventoId + '/arquivo', { headers: apiHeaders() })
      .then(function(r) { return r.json(); })
      .then(function(resp) {
        if (!resp || !resp.arquivo || !resp.arquivo.nome) {
          if (window.mostrarToast) mostrarToast('Anexo não disponível neste ambiente para exclusão.', 'info');
          return null;
        }
        if (!confirm('Excluir o anexo deste evento?')) return null;
        overlayOn();
        return fetch(EVENTOS_API + '/' + cnpj + '/' + eventoId + '/arquivo/' + encodeURIComponent(resp.arquivo.nome),
          { method: 'DELETE', headers: apiHeaders() })
          .then(function(r) {
            if (!r.ok) return r.json().then(function(e){ throw new Error(e.erro || 'Erro ao excluir.'); });
            return r.json();
          })
          .then(function(del) { return patchTemAnexo(eventoId, !!del.tem_anexo); })
          .then(function() {
            overlayOff();
            carregarEventos();
            if (window.mostrarToast) mostrarToast('Anexo excluído.', 'success');
          });
      })
      .catch(function(e) {
        overlayOff();
        console.error(e);
        if (window.mostrarToast) mostrarToast(e.message || 'Erro ao excluir.', 'error');
      });
  }

  // Exclusão lógica de evento documental (só master): marca o booleano excluido.
  function excluirEvento(eventoId) {
    if (!confirm('Excluir este evento? Ele deixará de aparecer na linha do tempo. O registro e o eventual anexo são mantidos e podem ser recuperados.')) return;

    var body = {};
    body[E_EXCLUIDO] = true;
    body[E_ATUALIZADO] = new Date().toISOString();

    overlayOn();
    fetch(API_BASE + '/database/rows/table/' + TABLE_EVENTOS + '/' + eventoId + '/?user_field_names=false',
      { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(body) })
      .then(function(r) { if (!r.ok) return r.json().then(function(e){ throw new Error(e.detail || 'Erro ao excluir o evento.'); }); return r.json(); })
      .then(function() {
        overlayOff();
        carregarEventos();
        if (window.mostrarToast) mostrarToast('Evento excluído.', 'success');
      })
      .catch(function(e) {
        overlayOff();
        console.error(e);
        if (window.mostrarToast) mostrarToast(e.message || 'Erro ao excluir o evento.', 'error');
      });
  }

  function patchTemAnexo(eventoId, valor) {
    var body = {};
    body[E_TEM_ANEXO] = !!valor;
    return fetch(API_BASE + '/database/rows/table/' + TABLE_EVENTOS + '/' + eventoId + '/?user_field_names=false',
      { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(body) })
      .then(function(r) {
        if (!r.ok) throw new Error('Falha ao sincronizar o indicador de anexo.');
        return r.json();
      });
  }

  // ── Registro de evento ────────────────────────────────
  function carregarTipos() {
    var sel = el('evtTipo');
    var url = API_BASE + '/database/rows/table/' + TABLE_TIPOS +
      '/?user_field_names=false&size=200';
    return fetch(url, { headers: apiHeaders() })
      .then(function(r) {
        if (!r.ok) throw new Error('Falha ao listar os tipos de evento.');
        return r.json();
      })
      .then(function(data) {
        var rows = data.results || [];
        rows.sort(function(a, b) {
          var na = (a[T_NOME] || '').toLowerCase();
          var nb = (b[T_NOME] || '').toLowerCase();
          if (na < nb) return -1;
          if (na > nb) return 1;
          return 0;
        });
        tiposMap = {};
        if (sel) sel.innerHTML = '<option value="">Selecione...</option>';
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          var nome = row[T_NOME] || '';
          tiposMap[row.id] = { nome: nome, alteraQuadro: !!row[T_ALTERA] };
          if (sel) {
            var o = document.createElement('option');
            o.value = row.id;
            o.textContent = nome;
            sel.appendChild(o);
          }
        }
        tiposCarregados = true;
      })
      .catch(function(e) {
        console.error('Erro ao carregar os tipos de evento:', e);
      });
  }

  // Popula o #evtTipo a partir do tiposMap; filtroAlteraQuadro (boolean) restringe
  // à mesma natureza (usado na edição). Sem argumento → lista completa.
  function popularSelectTipos(filtroAlteraQuadro) {
    var sel = el('evtTipo');
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione...</option>';
    var ids = [];
    for (var id in tiposMap) { if (tiposMap.hasOwnProperty(id)) ids.push(id); }
    ids.sort(function(a, b) {
      var na = tiposMap[a].nome.toLowerCase(), nb = tiposMap[b].nome.toLowerCase();
      return na < nb ? -1 : (na > nb ? 1 : 0);
    });
    for (var i = 0; i < ids.length; i++) {
      var t = tiposMap[ids[i]];
      if (typeof filtroAlteraQuadro === 'boolean' && t.alteraQuadro !== filtroAlteraQuadro) continue;
      var opt = document.createElement('option');
      opt.value = ids[i];
      opt.textContent = t.nome;
      sel.appendChild(opt);
    }
  }

  function abrirFormEvento() {
    editandoEventoId = null;
    editandoEfeitoQuadro = false;
    editAbertasPorEvento = [];
    editFechadasPorEvento = [];
    if (!tiposCarregados) {
      carregarTipos();
    } else {
      popularSelectTipos();   // restaura a lista completa (uma edição pode tê-la filtrado)
    }
    var sel = el('evtTipo');
    if (sel) sel.value = '';
    el('evtData').value = '';
    el('evtDescTextarea').value = '';
    atualizarPreviewEvento();
    var notice = el('evtNotice');
    if (notice) { notice.style.display = 'none'; notice.textContent = ''; }
    esconderFormMsg();
    // Reset do editor de quadro (Fase 3)
    var editor = el('qsEditorWrap');
    if (editor) editor.style.display = 'none';
    var edLista = el('qsEditorLista');
    if (edLista) edLista.innerHTML = '';
    var edTotal = el('qsEditorTotal');
    if (edTotal) { edTotal.textContent = ''; edTotal.className = 'qs-editor-total'; }
    var addSocio = el('qsAddSocioInput');
    if (addSocio) addSocio.value = '';
    editorOriginais = {};
    var btn = el('btnSalvarEvento');
    if (btn) btn.disabled = false;
    el('eventoFormWrap').style.display = 'block';
    var btnReg = el('btnRegistrarEvento');
    if (btnReg) btnReg.style.display = 'none';
  }

  function fecharFormEvento() {
    el('eventoFormWrap').style.display = 'none';
    var btnReg = el('btnRegistrarEvento');
    if (btnReg) btnReg.style.display = '';
    editandoEventoId = null;
    editandoEfeitoQuadro = false;
    editAbertasPorEvento = [];
    editFechadasPorEvento = [];
    var btnSalvar = el('btnSalvarEvento');
    if (btnSalvar) btnSalvar.innerHTML = '<i class="ph ph-floppy-disk"></i> Salvar evento';
  }

  // ── Edição de evento (Edição Fase 1: campos documentais; só master) ──
  // Id do ato mais recente que altera o quadro (maior data; desempate pelo maior id)
  function eventoQuadroMaisRecenteId() {
    var melhorId = null, melhorData = '';
    for (var id in eventosPorId) {
      if (!eventosPorId.hasOwnProperty(id)) continue;
      var row = eventosPorId[id];
      var tId = (row[E_TIPO] && row[E_TIPO][0]) ? row[E_TIPO][0].id : null;
      if (!tId || !tiposMap[tId] || tiposMap[tId].alteraQuadro !== true) continue;
      var d = row[E_DATA_ATO] || '';
      if (d > melhorData || (d === melhorData && Number(row.id) > Number(melhorId))) {
        melhorData = d; melhorId = row.id;
      }
    }
    return melhorId;
  }

  function abrirFormEventoEdicao(eventoId) {
    var row = eventosPorId[eventoId];
    if (!row) return;
    var prosseguir = function() { preencherEdicao(eventoId, row); };
    if (!tiposCarregados) { carregarTipos().then(prosseguir); } else { prosseguir(); }
  }

  function preencherEdicao(eventoId, row) {
    editandoEventoId = eventoId;
    editandoEfeitoQuadro = false;
    editAbertasPorEvento = [];
    editFechadasPorEvento = [];

    var tipoId = (row[E_TIPO] && row[E_TIPO][0]) ? row[E_TIPO][0].id : null;
    var natureza = (tipoId && tiposMap[tipoId]) ? tiposMap[tipoId].alteraQuadro : false;

    popularSelectTipos(natureza);
    el('evtTipo').value = tipoId ? String(tipoId) : '';
    el('evtData').value = row[E_DATA_ATO] || '';
    el('evtDescTextarea').value = row[E_DESCRICAO] || '';
    atualizarPreviewEvento();

    var editor = el('qsEditorWrap');
    var notice = el('evtNotice');
    if (notice) { notice.style.display = 'none'; notice.textContent = ''; }
    esconderFormMsg();

    if (natureza === true && String(eventoId) === String(eventoQuadroMaisRecenteId())) {
      // Ato mais recente que altera o quadro → editar o efeito
      editandoEfeitoQuadro = true;
      if (editor) editor.style.display = 'block';
      carregarEditorQuadroEdicao(eventoId);
    } else if (natureza === true) {
      // Ato que altera o quadro, mas não é o mais recente → efeito travado
      if (editor) editor.style.display = 'none';
      if (notice) {
        notice.style.display = 'block';
        notice.textContent = 'O efeito no quadro só pode ser editado no ato societário mais recente. Aqui você altera apenas tipo, data e descrição.';
      }
    } else {
      // Documental
      if (editor) editor.style.display = 'none';
    }

    var btn = el('btnSalvarEvento');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph ph-floppy-disk"></i> Salvar alterações'; }

    el('eventoFormWrap').style.display = 'block';
    var btnReg = el('btnRegistrarEvento'); if (btnReg) btnReg.style.display = 'none';
  }

  function salvarEdicaoEvento(idTipo, dataAto) {
    var nomeTipo = (tiposMap[idTipo] && tiposMap[idTipo].nome) ? tiposMap[idTipo].nome : 'Evento';

    var body = {};
    body[E_ROTULO]     = nomeTipo + ' — ' + formatarData(dataAto);
    body[E_TIPO]       = [Number(idTipo)];
    body[E_DATA_ATO]   = dataAto;
    body[E_DESCRICAO]  = el('evtDescTextarea').value;
    body[E_ATUALIZADO] = new Date().toISOString();

    var btn = el('btnSalvarEvento'); if (btn) btn.disabled = true;
    overlayOn();
    fetch(API_BASE + '/database/rows/table/' + TABLE_EVENTOS + '/' + editandoEventoId + '/?user_field_names=false',
      { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(body) })
      .then(function(r) { if (!r.ok) return r.json().then(function(e){ throw new Error(e.detail || 'Erro ao salvar.'); }); return r.json(); })
      .then(function() {
        overlayOff(); if (btn) btn.disabled = false;
        fecharFormEvento();
        carregarEventos();
        if (window.mostrarToast) mostrarToast('Evento atualizado.', 'success');
      })
      .catch(function(e) {
        overlayOff(); if (btn) btn.disabled = false;
        mostrarFormMsg('error', e.message || 'Erro ao salvar.');
        console.error(e);
      });
  }

  // ── Edição do efeito no quadro (Edição Fase 2: só o ato mais recente) ──
  // Carrega o editor pré-preenchido com o quadro atual e particiona o pré-evento.
  function carregarEditorQuadroEdicao(eventoId) {
    var pjId = window.EVENTOS_PJ_ID;
    editorOriginais = {};
    editAbertasPorEvento = [];
    editFechadasPorEvento = [];
    var listaEl = el('qsEditorLista'); if (listaEl) listaEl.innerHTML = '';
    var totalEl = el('qsEditorTotal'); if (totalEl) { totalEl.textContent = ''; totalEl.className = 'qs-editor-total'; }
    if (!pjId) { recalcularTotalEditor(); return; }

    var url = API_BASE + '/database/rows/table/' + TABLE_PART +
      '/?user_field_names=false&filter__' + P_PJ + '__link_row_has=' +
      encodeURIComponent(pjId) + '&size=200';
    fetch(url, { headers: apiHeaders() })
      .then(function(r) { if (!r.ok) throw new Error('Falha ao listar participações.'); return r.json(); })
      .then(function(data) { popularEditorEdicao(data.results || [], eventoId); })
      .catch(function(e) {
        console.error('Erro ao carregar o editor de edição:', e);
        fetch(API_BASE + '/database/rows/table/' + TABLE_PART + '/?user_field_names=false&size=200', { headers: apiHeaders() })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            var todos = data.results || [], filtrados = [], i;
            for (i = 0; i < todos.length; i++) { if (vinculoContem(todos[i][P_PJ], pjId)) filtrados.push(todos[i]); }
            popularEditorEdicao(filtrados, eventoId);
          })
          .catch(function(e2) { console.error(e2); mostrarFormMsg('error', 'Não foi possível carregar o quadro para edição.'); });
      });
  }

  // Particiona as participações:
  //  - editor (linhas) = ativas (resultado atual do ato)
  //  - editorOriginais = estado PRÉ-evento (ativas não abertas por este ato + as fechadas por ele)
  //  - editAbertasPorEvento = ativas abertas por este ato (apagar no desfazer)
  //  - editFechadasPorEvento = inativas fechadas por este ato (reabrir no desfazer)
  function popularEditorEdicao(rows, eventoId) {
    editorOriginais = {};
    editAbertasPorEvento = [];
    editFechadasPorEvento = [];
    var listaEl = el('qsEditorLista'); if (listaEl) listaEl.innerHTML = '';
    var evId = String(eventoId);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var socio = (row[P_SOCIO] && row[P_SOCIO][0]) ? row[P_SOCIO][0] : null;
      if (!socio) continue;
      var socioId = socio.id;
      var socioNome = socio.value || '';
      var perc = parseFloat(row[P_PERCENTUAL]) || 0;
      var qualifId = (row[P_QUALIFICACAO] && row[P_QUALIFICACAO].id) || '';
      var status = valorSelect(row[P_STATUS]);
      var entradaId = (row[P_EV_ENTRADA] && row[P_EV_ENTRADA][0]) ? String(row[P_EV_ENTRADA][0].id) : '';
      var saidaId = (row[P_EV_SAIDA] && row[P_EV_SAIDA][0]) ? String(row[P_EV_SAIDA][0].id) : '';

      if (status === 'Ativo') {
        addEditorRow({ socioId: socioId, socioNome: socioNome, participacaoId: row.id, percentual: perc, qualifId: qualifId });
        if (entradaId === evId) {
          editAbertasPorEvento.push(row.id);            // aberta por este ato → apagar no desfazer
        } else {
          editorOriginais[socioId] = { participacaoId: row.id, percentual: perc, qualifId: qualifId }; // pré-evento
        }
      } else {
        if (saidaId === evId) {
          editFechadasPorEvento.push(row.id);           // fechada por este ato → reabrir no desfazer
          editorOriginais[socioId] = { participacaoId: row.id, percentual: perc, qualifId: qualifId }; // pré-evento
        }
      }
    }
    recalcularTotalEditor();
  }

  // Salva a edição que refaz o efeito no quadro (desfazer → refazer → PATCH do evento).
  function salvarEdicaoEventoComQuadro(idTipo, dataAto) {
    // 1) Ler o quadro alvo + validar (igual ao salvarEventoComQuadro)
    var linhas = el('qsEditorLista').querySelectorAll('.qs-editor-row');
    var alvo = [], soma = 0, i;
    for (i = 0; i < linhas.length; i++) {
      var lin = linhas[i];
      var perc = parseFloat(lin.querySelector('.qs-editor-perc').value) || 0;
      var qualifId = lin.querySelector('.qs-editor-qualif').value;
      var socioId = lin.getAttribute('data-socio-id');
      if (perc <= 0) { return mostrarFormMsg('error', 'Há sócio com quota inválida (deve ser > 0).'); }
      if (!qualifId) { return mostrarFormMsg('error', 'Selecione a qualificação de todos os sócios.'); }
      alvo.push({
        socioId: socioId, socioNome: lin.getAttribute('data-socio-nome'),
        participacaoId: lin.getAttribute('data-participacao-id') || '', percentual: perc, qualifId: qualifId
      });
      soma += perc;
    }
    if (alvo.length === 0) { return mostrarFormMsg('error', 'Inclua ao menos um sócio.'); }
    if (Math.abs(soma - 100) > 0.005) {
      return mostrarFormMsg('error', 'A soma das quotas deve ser 100% (atual: ' + formatarPercentual(soma) + ').');
    }

    // 2) Diff: alvo vs editorOriginais (estado pré-evento)
    var alvoPorSocio = {};
    for (i = 0; i < alvo.length; i++) alvoPorSocio[alvo[i].socioId] = alvo[i];
    var saidas = [], alteracoes = [], entradas = [], sid;
    for (sid in editorOriginais) {
      if (editorOriginais.hasOwnProperty(sid) && !alvoPorSocio[sid]) saidas.push(editorOriginais[sid].participacaoId);
    }
    for (i = 0; i < alvo.length; i++) {
      var item = alvo[i];
      var orig = editorOriginais[item.socioId];
      if (!orig) { entradas.push(item); continue; }
      var mudouPerc = (Math.round(orig.percentual * 100) !== Math.round(item.percentual * 100));
      var mudouQualif = (Number(orig.qualifId) !== Number(item.qualifId));
      if (mudouPerc || mudouQualif) alteracoes.push({ antiga: orig.participacaoId, nova: item });
    }

    if (!confirm('Editar este ato vai refazer o quadro societário que ele produziu. Deseja continuar?')) { return; }

    // 3) Payloads e helpers (eventoId = o próprio evento editado)
    var pjId = window.EVENTOS_PJ_ID;
    var agora = new Date().toISOString();
    var nomeUser = (window.CURRENT_USER && window.CURRENT_USER.nome) || '';
    var nomeTipo = (tiposMap[idTipo] && tiposMap[idTipo].nome) ? tiposMap[idTipo].nome : 'Evento';
    var eventoId = editandoEventoId;

    function montarNovaParticipacao(item) {
      var p = {};
      p[P_ROTULO] = item.socioNome;
      p[P_PJ] = [Number(pjId)];
      p[P_SOCIO] = [Number(item.socioId)];
      p[P_EV_ENTRADA] = [Number(eventoId)];
      p[P_STATUS] = OPT_STATUS_ATIVO;
      p[P_PERCENTUAL] = Number(item.percentual);
      p[P_QUALIFICACAO] = Number(item.qualifId);
      p[P_CRIADO_POR] = nomeUser;
      p[P_CRIADO_EM] = agora;
      return p;
    }
    function fecharParticipacao(motivoId) {
      var p = {};
      p[P_EV_SAIDA] = [Number(eventoId)];
      p[P_STATUS] = OPT_STATUS_INATIVO;
      p[P_MOTIVO] = motivoId;
      p[P_ATUALIZADO] = agora;
      return p;
    }
    function reabrirParticipacao() {
      var p = {};
      p[P_STATUS] = OPT_STATUS_ATIVO;
      p[P_EV_SAIDA] = [];     // limpa o vínculo de saída
      p[P_MOTIVO] = null;     // limpa o motivo
      p[P_ATUALIZADO] = agora;
      return p;
    }
    function postPart(payload) {
      return fetch(API_BASE + '/database/rows/table/' + TABLE_PART + '/?user_field_names=false',
        { method: 'POST', headers: apiHeaders(), body: JSON.stringify(payload) });
    }
    function patchPart(idLinha, payload) {
      return fetch(API_BASE + '/database/rows/table/' + TABLE_PART + '/' + idLinha + '/?user_field_names=false',
        { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(payload) });
    }
    function deletePart(idLinha) {
      return fetch(API_BASE + '/database/rows/table/' + TABLE_PART + '/' + idLinha + '/?user_field_names=false',
        { method: 'DELETE', headers: apiHeaders() });
    }

    var btn = el('btnSalvarEvento');
    if (btn) btn.disabled = true;
    overlayOn();
    esconderFormMsg();

    // 4) DESFAZER (apaga abertas, reabre fechadas) → precisa terminar antes do refazer
    var undoOps = [], k;
    for (k = 0; k < editAbertasPorEvento.length; k++) undoOps.push(deletePart(editAbertasPorEvento[k]));
    for (k = 0; k < editFechadasPorEvento.length; k++) undoOps.push(patchPart(editFechadasPorEvento[k], reabrirParticipacao()));

    Promise.all(undoOps)
      .then(function() {
        // 5) REFAZER (amarrado ao mesmo evento)
        var applyOps = [], j;
        for (j = 0; j < saidas.length; j++) applyOps.push(patchPart(saidas[j], fecharParticipacao(OPT_MOTIVO_SAIDA)));
        for (j = 0; j < alteracoes.length; j++) {
          applyOps.push(patchPart(alteracoes[j].antiga, fecharParticipacao(OPT_MOTIVO_ALTERACAO)));
          applyOps.push(postPart(montarNovaParticipacao(alteracoes[j].nova)));
        }
        for (j = 0; j < entradas.length; j++) applyOps.push(postPart(montarNovaParticipacao(entradas[j])));
        return Promise.all(applyOps);
      })
      .then(function() {
        // 6) PATCH do evento (rótulo/tipo/data/descrição/atualizado_em)
        var body = {};
        body[E_ROTULO] = nomeTipo + ' — ' + formatarData(dataAto);
        body[E_TIPO] = [Number(idTipo)];
        body[E_DATA_ATO] = dataAto;
        body[E_DESCRICAO] = el('evtDescTextarea').value;
        body[E_ATUALIZADO] = agora;
        return fetch(API_BASE + '/database/rows/table/' + TABLE_EVENTOS + '/' + eventoId + '/?user_field_names=false',
          { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(body) });
      })
      .then(function() {
        overlayOff(); if (btn) btn.disabled = false;
        fecharFormEvento();
        carregarEventos();
        if (window.mostrarToast) window.mostrarToast('Evento e quadro atualizados.', 'success');
      })
      .catch(function(e) {
        overlayOff(); if (btn) btn.disabled = false;
        mostrarFormMsg('error', (e.message || 'Erro ao salvar.') + ' Algumas alterações podem ter sido aplicadas; confira o quadro.');
        carregarEventos();
        console.error(e);
      });
  }

  function onEvtTipoChange() {
    if (editandoEventoId) {
      if (!editandoEfeitoQuadro) {
        var ed = el('qsEditorWrap'); if (ed) ed.style.display = 'none';
      }
      var b = el('btnSalvarEvento'); if (b) b.disabled = false;
      return;
    }
    var id = el('evtTipo').value;
    var editor = el('qsEditorWrap');
    var notice = el('evtNotice');
    if (notice) { notice.style.display = 'none'; notice.textContent = ''; }
    if (id && tiposMap[id] && tiposMap[id].alteraQuadro === true) {
      if (editor) editor.style.display = 'block';
      carregarEditorQuadro();
    } else {
      if (editor) editor.style.display = 'none';
    }
    var btn = el('btnSalvarEvento');
    if (btn) btn.disabled = false;
  }

  function atualizarPreviewEvento() {
    var ta = el('evtDescTextarea');
    var prev = el('evtDescPreview');
    if (!ta || !prev) return;
    var md = ta.value || '';
    if (!md.trim()) {
      prev.innerHTML = '<div class="md-placeholder">Pré-visualização...</div>';
      return;
    }
    prev.innerHTML = renderMarkdown(md);
  }

  // Insere marcação Markdown em #evtDescTextarea (negrito/itálico/lista)
  function addMarkdownEvento(tipo) {
    var ta = el('evtDescTextarea');
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
    }
    ta.value = antes + prefixo + textoNovo + sufixo + depois;
    ta.focus();
    if ((tipo === 'bold' || tipo === 'italic') && !selecionado) {
      ta.setSelectionRange(start + prefixo.length, start + prefixo.length + textoNovo.length);
    } else {
      var novaPos = start + prefixo.length + textoNovo.length + sufixo.length;
      ta.setSelectionRange(novaPos, novaPos);
    }
    atualizarPreviewEvento();
  }

  function salvarEvento() {
    var pjId = window.EVENTOS_PJ_ID;
    if (!pjId) {
      mostrarFormMsg('error', 'Nenhuma pessoa jurídica carregada.');
      return;
    }
    var id = el('evtTipo').value;
    var dataAto = el('evtData').value;
    if (!id) {
      mostrarFormMsg('error', 'Selecione o tipo do evento.');
      return;
    }
    if (!dataAto) {
      mostrarFormMsg('error', 'Informe a data do ato.');
      return;
    }
    // Modo edição: efeito no quadro (ato mais recente) ou só documental
    if (editandoEventoId) {
      if (editandoEfeitoQuadro) { salvarEdicaoEventoComQuadro(id, dataAto); return; }
      salvarEdicaoEvento(id, dataAto); return;
    }
    // Tipo que altera o quadro → fluxo declarativo do quadro societário
    if (tiposMap[id] && tiposMap[id].alteraQuadro === true) {
      salvarEventoComQuadro(id, dataAto);
      return;
    }

    var nomeTipo = (tiposMap[id] && tiposMap[id].nome) ? tiposMap[id].nome : 'Evento';
    var rotulo = nomeTipo + ' — ' + formatarData(dataAto);

    var payload = {};
    payload[E_ROTULO]     = rotulo;
    payload[E_PJ]         = [Number(pjId)];
    payload[E_TIPO]       = [Number(id)];
    payload[E_DATA_ATO]   = dataAto;
    payload[E_DESCRICAO]  = el('evtDescTextarea').value;
    payload[E_CRIADO_POR] = (window.CURRENT_USER && window.CURRENT_USER.nome) || '';
    payload[E_CRIADO_EM]  = new Date().toISOString();

    var btn = el('btnSalvarEvento');
    if (btn) btn.disabled = true;
    overlayOn();
    esconderFormMsg();

    var url = API_BASE + '/database/rows/table/' + TABLE_EVENTOS + '/?user_field_names=false';
    fetch(url, { method: 'POST', headers: apiHeaders(), body: JSON.stringify(payload) })
      .then(function(r) {
        if (!r.ok) return r.json().then(function(e) {
          throw new Error(e.detail || 'Erro ao registrar o evento.');
        });
        return r.json();
      })
      .then(function() {
        overlayOff();
        if (btn) btn.disabled = false;
        fecharFormEvento();
        carregarEventos();
        if (window.mostrarToast) window.mostrarToast('Evento registrado.', 'success');
      })
      .catch(function(e) {
        overlayOff();
        if (btn) btn.disabled = false;
        mostrarFormMsg('error', e.message || 'Erro ao registrar o evento.');
        console.error(e);
      });
  }

  // ── Editor de quadro societário (Fase 3) ──────────────
  // Carrega os sócios ativos no editor (mesma URL/fallback de carregarQuadro)
  function carregarEditorQuadro() {
    var pjId = window.EVENTOS_PJ_ID;
    var listaEl = el('qsEditorLista');
    editorOriginais = {};
    if (listaEl) listaEl.innerHTML = '';
    var totalEl = el('qsEditorTotal');
    if (totalEl) { totalEl.textContent = ''; totalEl.className = 'qs-editor-total'; }
    if (!pjId) { recalcularTotalEditor(); return; }

    var url = API_BASE + '/database/rows/table/' + TABLE_PART +
      '/?user_field_names=false&filter__' + P_PJ + '__link_row_has=' +
      encodeURIComponent(pjId) + '&size=200';
    fetch(url, { headers: apiHeaders() })
      .then(function(r) {
        if (!r.ok) throw new Error('Falha ao listar o quadro societário.');
        return r.json();
      })
      .then(function(data) { popularEditor(data.results || []); })
      .catch(function(e) {
        console.error('Erro ao carregar o editor de quadro:', e);
        // Fallback: lista tudo e filtra no cliente por P_PJ
        fetch(API_BASE + '/database/rows/table/' + TABLE_PART + '/?user_field_names=false&size=200',
          { headers: apiHeaders() })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            var todos = data.results || [];
            var filtrados = [];
            for (var i = 0; i < todos.length; i++) {
              if (vinculoContem(todos[i][P_PJ], pjId)) filtrados.push(todos[i]);
            }
            popularEditor(filtrados);
          })
          .catch(function(e2) {
            console.error('Erro no fallback do editor de quadro:', e2);
            mostrarFormMsg('error', 'Não foi possível carregar o quadro atual para edição.');
          });
      });
  }

  function popularEditor(rows) {
    editorOriginais = {};
    var listaEl = el('qsEditorLista');
    if (listaEl) listaEl.innerHTML = '';
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (valorSelect(row[P_STATUS]) !== 'Ativo') continue;
      var socio = (row[P_SOCIO] && row[P_SOCIO][0]) ? row[P_SOCIO][0] : null;
      if (!socio) continue;
      var socioId = socio.id;
      var socioNome = socio.value || '';
      var perc = parseFloat(row[P_PERCENTUAL]) || 0;
      var qualifId = (row[P_QUALIFICACAO] && row[P_QUALIFICACAO].id) || '';
      editorOriginais[socioId] = { participacaoId: row.id, percentual: perc, qualifId: qualifId };
      addEditorRow({
        socioId: socioId, socioNome: socioNome, participacaoId: row.id,
        percentual: perc, qualifId: qualifId
      });
    }
    recalcularTotalEditor();
  }

  // Cria uma linha do editor (evita duplicar o mesmo sócio)
  function addEditorRow(d) {
    var listaEl = el('qsEditorLista');
    if (!listaEl) return;
    var socioIdStr = '' + d.socioId;
    var existentes = listaEl.querySelectorAll('.qs-editor-row');
    for (var x = 0; x < existentes.length; x++) {
      if (existentes[x].getAttribute('data-socio-id') === socioIdStr) return;
    }

    var row = document.createElement('div');
    row.className = 'qs-editor-row';
    row.setAttribute('data-socio-id', socioIdStr);
    row.setAttribute('data-participacao-id', d.participacaoId ? ('' + d.participacaoId) : '');
    row.setAttribute('data-socio-nome', d.socioNome || '');

    var nome = document.createElement('div');
    nome.className = 'qs-editor-nome';
    nome.textContent = d.socioNome || '(sócio)';

    var perc = document.createElement('input');
    perc.className = 'qs-editor-perc';
    perc.type = 'number';
    perc.step = '0.01';
    perc.min = '0';
    perc.value = (d.percentual != null) ? d.percentual : 0;
    perc.addEventListener('input', recalcularTotalEditor);

    var sel = document.createElement('select');
    sel.className = 'qs-editor-qualif';
    var optVazio = document.createElement('option');
    optVazio.value = '';
    optVazio.textContent = 'Qualificação...';
    sel.appendChild(optVazio);
    for (var q = 0; q < QUALIF_OPTS.length; q++) {
      var o = document.createElement('option');
      o.value = QUALIF_OPTS[q].id;
      o.textContent = QUALIF_OPTS[q].label;
      if (('' + QUALIF_OPTS[q].id) === ('' + d.qualifId)) o.selected = true;
      sel.appendChild(o);
    }

    var btnRem = document.createElement('button');
    btnRem.type = 'button';
    btnRem.className = 'qs-editor-remove';
    btnRem.title = 'Remover sócio';
    btnRem.innerHTML = '<i class="ph ph-x"></i>';
    btnRem.addEventListener('click', function() {
      if (row.parentNode) row.parentNode.removeChild(row);
      recalcularTotalEditor();
    });

    row.appendChild(nome);
    row.appendChild(perc);
    row.appendChild(sel);
    row.appendChild(btnRem);
    listaEl.appendChild(row);
  }

  function recalcularTotalEditor() {
    var totalEl = el('qsEditorTotal');
    if (!totalEl) return;
    var listaEl = el('qsEditorLista');
    var soma = 0;
    if (listaEl) {
      var inputs = listaEl.querySelectorAll('.qs-editor-perc');
      for (var i = 0; i < inputs.length; i++) {
        soma += parseFloat(inputs[i].value) || 0;
      }
    }
    totalEl.textContent = 'Soma: ' + formatarPercentual(soma) + ' / 100%';
    totalEl.className = 'qs-editor-total ' + ((Math.abs(soma - 100) < 0.005) ? 'ok' : 'erro');
  }

  // ── Busca de sócio (autocomplete na 754) ──────────────
  function onBuscaSocioInput() {
    var input = el('qsAddSocioInput');
    if (!input) return;
    var termo = input.value.trim();
    if (buscaSocioTimer) clearTimeout(buscaSocioTimer);
    if (termo.length < 2) { fecharSocioLista(); return; }
    buscaSocioTimer = setTimeout(function() { buscarSocio(termo); }, 250);
  }

  function buscarSocio(termo) {
    var url = API_BASE + '/database/rows/table/' + TABLE_CLIENTES +
      '/?user_field_names=false&filter__' + C_NOME + '__contains=' +
      encodeURIComponent(termo) + '&size=10';
    fetch(url, { headers: apiHeaders() })
      .then(function(r) { return r.json(); })
      .then(function(data) { renderSocioResultados(data.results || []); })
      .catch(function(e) { console.error('Erro na busca de sócio:', e); });
  }

  function renderSocioResultados(rows) {
    var lista = el('qsAddSocioList');
    if (!lista) return;
    lista.innerHTML = '';
    if (!rows.length) { lista.classList.remove('open'); return; }
    for (var i = 0; i < rows.length; i++) {
      (function(row) {
        var item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.innerHTML = '<div class="ac-name">' + escapar(row[C_NOME] || '') + '</div>';
        item.addEventListener('click', function() {
          addEditorRow({
            socioId: row.id, socioNome: row[C_NOME] || '',
            participacaoId: '', percentual: 0, qualifId: ''
          });
          el('qsAddSocioInput').value = '';
          fecharSocioLista();
          recalcularTotalEditor();
        });
        lista.appendChild(item);
      })(rows[i]);
    }
    lista.classList.add('open');
  }

  function fecharSocioLista() {
    var lista = el('qsAddSocioList');
    if (lista) { lista.classList.remove('open'); lista.innerHTML = ''; }
  }

  // ── Salvar evento que altera o quadro (núcleo) ────────
  function salvarEventoComQuadro(idTipo, dataAto) {
    // 1) Ler o quadro alvo das linhas do editor
    var linhas = el('qsEditorLista').querySelectorAll('.qs-editor-row');
    var alvo = [];
    var soma = 0, i;
    for (i = 0; i < linhas.length; i++) {
      var lin = linhas[i];
      var perc = parseFloat(lin.querySelector('.qs-editor-perc').value) || 0;
      var qualifId = lin.querySelector('.qs-editor-qualif').value;
      var socioId = lin.getAttribute('data-socio-id');
      if (perc <= 0) { return mostrarFormMsg('error', 'Há sócio com quota inválida (deve ser > 0).'); }
      if (!qualifId) { return mostrarFormMsg('error', 'Selecione a qualificação de todos os sócios.'); }
      alvo.push({
        socioId: socioId,
        socioNome: lin.getAttribute('data-socio-nome'),
        participacaoId: lin.getAttribute('data-participacao-id') || '',
        percentual: perc,
        qualifId: qualifId
      });
      soma += perc;
    }
    if (alvo.length === 0) { return mostrarFormMsg('error', 'Inclua ao menos um sócio.'); }
    if (Math.abs(soma - 100) > 0.005) {
      return mostrarFormMsg('error', 'A soma das quotas deve ser 100% (atual: ' + formatarPercentual(soma) + ').');
    }

    // 2) Calcular o diff (casando por socioId)
    var alvoPorSocio = {};
    for (i = 0; i < alvo.length; i++) alvoPorSocio[alvo[i].socioId] = alvo[i];

    var saidas = [], alteracoes = [], entradas = [], sid;
    for (sid in editorOriginais) {
      if (editorOriginais.hasOwnProperty(sid) && !alvoPorSocio[sid]) {
        saidas.push(editorOriginais[sid].participacaoId);
      }
    }
    for (i = 0; i < alvo.length; i++) {
      var item = alvo[i];
      var orig = editorOriginais[item.socioId];
      if (!orig) { entradas.push(item); continue; }
      var mudouPerc = (Math.round(orig.percentual * 100) !== Math.round(item.percentual * 100));
      var mudouQualif = (Number(orig.qualifId) !== Number(item.qualifId));
      if (mudouPerc || mudouQualif) alteracoes.push({ antiga: orig.participacaoId, nova: item });
      // iguais => inalterado (nada)
    }

    // 3) Criar o evento e aplicar as escritas
    var pjId = window.EVENTOS_PJ_ID;
    var agora = new Date().toISOString();
    var nomeUser = (window.CURRENT_USER && window.CURRENT_USER.nome) || '';
    var nomeTipo = (tiposMap[idTipo] && tiposMap[idTipo].nome) ? tiposMap[idTipo].nome : 'Evento';

    var payloadEvento = {};
    payloadEvento[E_ROTULO]     = nomeTipo + ' — ' + formatarData(dataAto);
    payloadEvento[E_PJ]         = [Number(pjId)];
    payloadEvento[E_TIPO]       = [Number(idTipo)];
    payloadEvento[E_DATA_ATO]   = dataAto;
    payloadEvento[E_DESCRICAO]  = el('evtDescTextarea').value;
    payloadEvento[E_CRIADO_POR] = nomeUser;
    payloadEvento[E_CRIADO_EM]  = agora;

    function montarNovaParticipacao(item, eventoId) {
      var p = {};
      p[P_ROTULO]       = item.socioNome;
      p[P_PJ]           = [Number(pjId)];
      p[P_SOCIO]        = [Number(item.socioId)];
      p[P_EV_ENTRADA]   = [Number(eventoId)];
      p[P_STATUS]       = OPT_STATUS_ATIVO;
      p[P_PERCENTUAL]   = Number(item.percentual);
      p[P_QUALIFICACAO] = Number(item.qualifId);
      p[P_CRIADO_POR]   = nomeUser;
      p[P_CRIADO_EM]    = agora;
      return p;
    }
    function fecharParticipacao(eventoId, motivoId) {
      var p = {};
      p[P_EV_SAIDA]   = [Number(eventoId)];
      p[P_STATUS]     = OPT_STATUS_INATIVO;
      p[P_MOTIVO]     = motivoId;
      p[P_ATUALIZADO] = agora;
      return p;
    }
    function postPart(payload) {
      return fetch(API_BASE + '/database/rows/table/' + TABLE_PART + '/?user_field_names=false',
        { method: 'POST', headers: apiHeaders(), body: JSON.stringify(payload) });
    }
    function patchPart(idLinha, payload) {
      return fetch(API_BASE + '/database/rows/table/' + TABLE_PART + '/' + idLinha + '/?user_field_names=false',
        { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(payload) });
    }

    var btn = el('btnSalvarEvento');
    if (btn) btn.disabled = true;
    overlayOn();
    esconderFormMsg();

    fetch(API_BASE + '/database/rows/table/' + TABLE_EVENTOS + '/?user_field_names=false',
      { method: 'POST', headers: apiHeaders(), body: JSON.stringify(payloadEvento) })
      .then(function(r) {
        if (!r.ok) return r.json().then(function(e){ throw new Error(e.detail || 'Erro ao criar o evento.'); });
        return r.json();
      })
      .then(function(evento) {
        var eventoId = evento.id;
        var ops = [];
        var k;
        for (k = 0; k < saidas.length; k++) ops.push(patchPart(saidas[k], fecharParticipacao(eventoId, OPT_MOTIVO_SAIDA)));
        for (k = 0; k < alteracoes.length; k++) {
          ops.push(patchPart(alteracoes[k].antiga, fecharParticipacao(eventoId, OPT_MOTIVO_ALTERACAO)));
          ops.push(postPart(montarNovaParticipacao(alteracoes[k].nova, eventoId)));
        }
        for (k = 0; k < entradas.length; k++) ops.push(postPart(montarNovaParticipacao(entradas[k], eventoId)));
        return Promise.all(ops);
      })
      .then(function() {
        overlayOff();
        if (btn) btn.disabled = false;
        fecharFormEvento();
        carregarEventos();
        if (window.mostrarToast) window.mostrarToast('Evento registrado e quadro atualizado.', 'success');
      })
      .catch(function(e) {
        overlayOff();
        if (btn) btn.disabled = false;
        mostrarFormMsg('error', (e.message || 'Erro ao registrar.') + ' Algumas alterações podem ter sido aplicadas; confira o quadro.');
        carregarEventos();
        console.error(e);
      });
  }

  // ── Entrada principal ─────────────────────────────────
  function carregarEventos() {
    var pjId = window.EVENTOS_PJ_ID;
    var lista = el('qsLista');
    var total = el('qsTotal');
    var timeline = el('evtTimeline');

    if (!pjId) {
      if (lista) lista.innerHTML = '';
      if (total) total.innerHTML = '';
      if (timeline) timeline.innerHTML = '';
      return;
    }

    carregarQuadro(pjId);
    if (!tiposCarregados) {
      carregarTipos().then(function() { carregarTimeline(pjId); })
                     .catch(function() { carregarTimeline(pjId); });
    } else {
      carregarTimeline(pjId);
    }
  }

  // ── Inicialização ─────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    if (!el('eventoFormWrap')) return; // página sem o módulo

    var btnReg = el('btnRegistrarEvento');
    if (btnReg) btnReg.addEventListener('click', abrirFormEvento);

    var btnCancel = el('btnCancelarEvento');
    if (btnCancel) btnCancel.addEventListener('click', fecharFormEvento);

    var btnSalvar = el('btnSalvarEvento');
    if (btnSalvar) btnSalvar.addEventListener('click', salvarEvento);

    var selTipo = el('evtTipo');
    if (selTipo) selTipo.addEventListener('change', onEvtTipoChange);

    var ta = el('evtDescTextarea');
    if (ta) ta.addEventListener('input', atualizarPreviewEvento);

    var addSocio = el('qsAddSocioInput');
    if (addSocio) addSocio.addEventListener('input', onBuscaSocioInput);

    var tl = el('evtTimeline');
    if (tl) tl.addEventListener('click', onTimelineClick);
  });

  // Exposição global usada pela mecânica de abas / toolbar de Markdown
  window.carregarEventos = carregarEventos;
  window.addMarkdownEvento = addMarkdownEvento;
})();
