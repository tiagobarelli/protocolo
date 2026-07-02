// eventos_estado_civil.js — Linha do tempo de eventos de estado civil da PF (tabela 786)
// Fase 1 — registro histórico independente: registrar um evento NÃO altera os campos
// atuais do cliente (754) e NÃO dispara sincronizarParceiros. O formulário principal
// da aba Estado Civil permanece a fonte operacional.
// ES5 estrito (var/function). Lê o cliente atual de window.EVENTOS_EC_CLIENTE_ID.
// Espelha o padrão de enderecos.js / eventos_societarios.js.
(function() {
  'use strict';

  var API_BASE = '/api/baserow';
  var TABLE_EC = 786;
  var TABLE_CLIENTES = 754;

  // Campos da tabela 786 (eventos_estado_civil)
  var F_ROTULO     = 'field_7550';
  var F_CLIENTE    = 'field_7551';
  var F_TIPO       = 'field_7552';
  var F_DATA       = 'field_7553';
  var F_CONJUGE    = 'field_7554';
  var F_REGIME     = 'field_7555';
  var F_OBS        = 'field_7556';
  var F_CRIADO_POR = 'field_7557';
  var F_CRIADO_EM  = 'field_7558';
  var F_ATUALIZADO = 'field_7559';
  var F_EXCLUIDO   = 'field_7560';

  // Campos da tabela 754 (clientes)
  var C_NOME = 'field_7237';
  var C_CPF  = 'field_7238';
  var C_LOG  = 'field_7395'; // campo de log da 754 (mesmo field de FIELDS.logs em clientes.js)

  // Espelhamento (Fase 2)
  var E_ESPELHO = 'field_7561'; // link_row auto-referente 786→786 (sem campo reverso)
  var TIPOS_SIMETRICOS = [3171, 3172, 3173, 3174, 3175, 3177]; // Viuvez (3176) fica fora

  // exigeRegime: Casamento, União Estável e Alteração de Regime pedem regime de bens
  var TIPO_OPTS = [
    { id: 3171, label: 'Casamento', exigeRegime: true },
    { id: 3172, label: 'União Estável', exigeRegime: true },
    { id: 3173, label: 'Divórcio', exigeRegime: false },
    { id: 3174, label: 'Separação', exigeRegime: false },
    { id: 3175, label: 'Dissolução de União Estável', exigeRegime: false },
    { id: 3176, label: 'Viuvez', exigeRegime: false },
    { id: 3177, label: 'Alteração de Regime de Bens', exigeRegime: true }
  ];

  var REGIME_OPTS = [
    { id: 3178, label: 'Comunhão parcial' },
    { id: 3179, label: 'Comunhão universal' },
    { id: 3180, label: 'Separação convencional' },
    { id: 3181, label: 'Separação obrigatória' },
    { id: 3182, label: 'Participação final nos aquestos' }
  ];

  // Estado interno (independente do conjugeId/companheiroId do formulário principal)
  var eventoEditId = null;
  var ecConjugeId = null;      // ID resolvido pelo autocomplete do evento
  var ecConjugeTimer = null;
  var eventoEditRow = null;    // linha original em edição (regras de espelhamento)

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
  function idSelect(campo) {
    if (campo && typeof campo === 'object') return campo.id || '';
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

  // ISO com hora -> 'DD/MM/AAAA HH:MM' em hora local (campo TEM hora; ok usar Date)
  function formatarDataHora(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return formatarData(iso);
    var dia = ('0' + d.getDate()).slice(-2);
    var mes = ('0' + (d.getMonth() + 1)).slice(-2);
    var ano = d.getFullYear();
    var hora = ('0' + d.getHours()).slice(-2);
    var min = ('0' + d.getMinutes()).slice(-2);
    return dia + '/' + mes + '/' + ano + ' ' + hora + ':' + min;
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
    var box = el('ecFormMsg');
    if (!box) return;
    box.className = 'msg-box ' + tipo;
    box.innerHTML = texto;
    box.style.display = 'flex';
  }

  function esconderFormMsg() {
    var box = el('ecFormMsg');
    if (!box) return;
    box.style.display = 'none';
    box.innerHTML = '';
  }

  function overlayOn()  { if (window.mostrarOverlay) window.mostrarOverlay(); }
  function overlayOff() { if (window.esconderOverlay) window.esconderOverlay(); }

  function perfilPodeExcluir() {
    var p = window.CURRENT_USER && window.CURRENT_USER.perfil;
    return p === 'master';
  }

  function tipoInfo(id) {
    var idNum = Number(id);
    for (var i = 0; i < TIPO_OPTS.length; i++) {
      if (TIPO_OPTS[i].id === idNum) return TIPO_OPTS[i];
    }
    return null;
  }

  function tipoExigeRegime(id) {
    var t = tipoInfo(id);
    return !!(t && t.exigeRegime);
  }

  function tipoEhSimetrico(id) {
    return TIPOS_SIMETRICOS.indexOf(Number(id)) !== -1;
  }

  // Vinculado = field_7561 da própria linha preenchido (vínculo unilateral por
  // falha parcial conta como vinculado no lado que o possui — degradação aceita)
  function eventoEhVinculado(row) {
    return !!(row && row[E_ESPELHO] && row[E_ESPELHO].length > 0);
  }

  // Aviso de falha parcial: toast global do base.html, com fallback em alert
  function avisar(msg) {
    if (window.mostrarToast) { mostrarToast(msg, 'warning'); return; }
    alert(msg);
  }

  // ── Selects ───────────────────────────────────────────
  function popularSelect(selId, opts) {
    var sel = el(selId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione...</option>';
    for (var i = 0; i < opts.length; i++) {
      var o = document.createElement('option');
      o.value = opts[i].id;
      o.textContent = opts[i].label;
      sel.appendChild(o);
    }
  }

  // ── Listagem / timeline ───────────────────────────────
  function carregarEventos() {
    var lista = el('ecTimeline');
    if (!lista) return;
    var clienteId = window.EVENTOS_EC_CLIENTE_ID;
    var btnAdd = el('btnAddEventoEC');
    var wrap = el('ecFormWrap');

    if (!clienteId) {
      // Gate: cliente ainda não salvo (modo novo)
      lista.innerHTML = '<div class="ec-empty">Salve o cadastro para registrar eventos de estado civil.</div>';
      if (btnAdd) btnAdd.style.display = 'none';
      if (wrap) wrap.style.display = 'none';
      eventoEditId = null;
      return;
    }

    // Reexibe o botão de registrar (a menos que o formulário esteja aberto)
    if (btnAdd && (!wrap || wrap.style.display === 'none')) btnAdd.style.display = '';

    lista.innerHTML = '<div class="ec-empty">Carregando...</div>';
    var url = API_BASE + '/database/rows/table/' + TABLE_EC +
      '/?user_field_names=false&filter__' + F_CLIENTE + '__link_row_has=' +
      encodeURIComponent(clienteId) + '&size=200';
    fetch(url, { headers: apiHeaders() })
      .then(function(r) {
        if (!r.ok) throw new Error('Falha ao listar os eventos.');
        return r.json();
      })
      .then(function(data) {
        renderTimeline(data.results || []);
      })
      .catch(function(e) {
        console.error('Erro ao carregar eventos de estado civil:', e);
        carregarEventosFallback(clienteId, lista);
      });
  }

  function carregarEventosFallback(clienteId, lista) {
    var url = API_BASE + '/database/rows/table/' + TABLE_EC +
      '/?user_field_names=false&size=200';
    fetch(url, { headers: apiHeaders() })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var todos = data.results || [];
        var filtrados = [];
        for (var i = 0; i < todos.length; i++) {
          if (vinculoContem(todos[i][F_CLIENTE], clienteId)) filtrados.push(todos[i]);
        }
        renderTimeline(filtrados);
      })
      .catch(function(e) {
        console.error('Erro no fallback de eventos de estado civil:', e);
        lista.innerHTML = '<div class="ec-empty">Não foi possível carregar os eventos.</div>';
      });
  }

  // Empty-state sensível ao legado da 754: sem eventos, a mensagem depende de
  // window.EVENTOS_EC_LEGADO (setado por clientes.js). Solteiro (3107) = sem pendência.
  function htmlEmptyState() {
    var legado = window.EVENTOS_EC_LEGADO;
    if (legado && legado.id !== 3107) {
      return '<div class="ec-empty ec-empty-legado"><i class="ph ph-warning-circle"></i><span>' +
        'Nenhum evento registrado, mas este cliente possui estado civil legado ' +
        '(<strong>' + escapar(legado.value) + '</strong>) ainda não migrado para a linha do tempo. ' +
        'Registre aqui os eventos correspondentes antes de confiar nesta timeline.</span></div>';
    }
    return '<div class="ec-empty"><i class="ph ph-info"></i><span> ' +
      'Nenhum evento registrado. A ausência de cadastro de estado civil indica que o cliente ' +
      'é solteiro. Confirme no ODIN se não há informação de casamento.</span></div>';
  }

  function renderTimeline(rows) {
    var lista = el('ecTimeline');
    if (!lista) return;

    // Filtra os excluídos logicamente (robusto, no cliente)
    var visiveis = [];
    if (rows) {
      for (var v = 0; v < rows.length; v++) {
        if (rows[v][F_EXCLUIDO] === true) continue;
        visiveis.push(rows[v]);
      }
    }

    // Datados primeiro, desc por data_evento (string YYYY-MM-DD); sem data ao
    // final; empates (e os sem-data entre si): criado_em desc
    visiveis.sort(function(a, b) {
      var da = a[F_DATA] || '';
      var db = b[F_DATA] || '';
      if (!da && db) return 1;
      if (da && !db) return -1;
      if (da < db) return 1;
      if (da > db) return -1;
      var ca = a[F_CRIADO_EM] || '';
      var cb = b[F_CRIADO_EM] || '';
      if (ca < cb) return 1;
      if (ca > cb) return -1;
      return 0;
    });

    if (visiveis.length === 0) {
      lista.innerHTML = htmlEmptyState();
      return;
    }

    lista.innerHTML = '';
    for (var i = 0; i < visiveis.length; i++) {
      (function(row) {
        var data = formatarData(row[F_DATA]);
        var tipoNome = valorSelect(row[F_TIPO]);
        var conjuge = (row[F_CONJUGE] && row[F_CONJUGE][0]) ? (row[F_CONJUGE][0].value || '') : '';
        var regime = valorSelect(row[F_REGIME]);
        var obs = row[F_OBS] || '';
        var criadoPor = row[F_CRIADO_POR] || '';
        var criadoEm = formatarDataHora(row[F_CRIADO_EM]);

        var item = document.createElement('div');
        item.className = 'ec-item';

        var corpo = document.createElement('div');
        corpo.className = 'ec-item-corpo';

        var html = '<div class="ec-item-cab">';
        html += '<span class="ec-item-data">' + escapar(data || 'Data n\u00e3o informada') + '</span>';
        if (tipoNome) html += '<span class="ec-item-tipo">' + escapar(tipoNome) + '</span>';
        if (eventoEhVinculado(row)) {
          var rotuloEspelho = (row[E_ESPELHO][0] && row[E_ESPELHO][0].value) || '';
          html += '<span class="ec-badge-espelho" title="Vinculado a: ' + escapar(rotuloEspelho) +
                  '"><i class="ph ph-link"></i> Espelhado</span>';
        }
        if (!row[F_DATA]) {
          html += '<span class="ec-badge-pendente"><i class="ph ph-calendar-x"></i> ' +
                  'Confirmar data na certidão (ODIN)</span>';
        }
        html += '</div>';
        html += '<div class="ec-item-detalhes">';
        if (conjuge) {
          html += '<span><i class="ph ph-user"></i> Cônjuge/Companheiro(a): <strong>' +
                  escapar(conjuge) + '</strong></span>';
        }
        if (regime) {
          html += '<span><i class="ph ph-scales"></i> Regime de bens: ' + escapar(regime) + '</span>';
        }
        html += '</div>';
        if (obs && obs.trim() !== '') {
          html += '<div class="ec-item-desc">' + renderMarkdown(obs) + '</div>';
        }
        if (criadoPor || criadoEm) {
          html += '<div class="ec-item-meta">Registrado por ' + escapar(criadoPor || '?') +
                  (criadoEm ? ' em ' + escapar(criadoEm) : '') + '</div>';
        }
        corpo.innerHTML = html;

        var acoes = document.createElement('div');
        acoes.className = 'ec-item-acoes';

        var btnEditar = document.createElement('button');
        btnEditar.type = 'button';
        btnEditar.className = 'ec-acao-btn ec-btn-editar';
        btnEditar.title = 'Editar evento';
        btnEditar.innerHTML = '<i class="ph ph-pencil-simple"></i>';
        btnEditar.addEventListener('click', function() { abrirForm(row); });
        acoes.appendChild(btnEditar);

        if (perfilPodeExcluir()) {
          var btnExcluir = document.createElement('button');
          btnExcluir.type = 'button';
          btnExcluir.className = 'ec-acao-btn ec-btn-excluir';
          btnExcluir.title = 'Excluir evento';
          btnExcluir.innerHTML = '<i class="ph ph-trash"></i>';
          btnExcluir.addEventListener('click', function() { excluirEvento(row); });
          acoes.appendChild(btnExcluir);
        }

        corpo.appendChild(acoes);
        item.appendChild(corpo);
        lista.appendChild(item);
      })(visiveis[i]);
    }
  }

  // ── Formulário ────────────────────────────────────────
  function limparForm() {
    el('ecTipo').value = '';
    el('ecData').value = '';
    el('ecConjugeInput').value = '';
    el('ecRegime').value = '';
    el('ecObsTextarea').value = '';
    ecConjugeId = null;
    fecharAutoListConjuge();
    esconderFormMsg();
  }

  function abrirForm(row) {
    limparForm();
    if (row) {
      eventoEditId = row.id;
      eventoEditRow = row;
      el('ecTipo').value = idSelect(row[F_TIPO]) || '';
      el('ecData').value = row[F_DATA] || '';
      if (row[F_CONJUGE] && row[F_CONJUGE][0]) {
        ecConjugeId = row[F_CONJUGE][0].id;
        el('ecConjugeInput').value = row[F_CONJUGE][0].value || '';
      }
      el('ecRegime').value = idSelect(row[F_REGIME]) || '';
      el('ecObsTextarea').value = row[F_OBS] || '';
    } else {
      eventoEditId = null;
      eventoEditRow = null;
    }
    atualizarVisibilidadeRegime();
    var btnSalvar = el('btnSalvarEC');
    if (btnSalvar) {
      btnSalvar.innerHTML = eventoEditId
        ? '<i class="ph ph-floppy-disk"></i> Salvar alterações'
        : '<i class="ph ph-floppy-disk"></i> Salvar evento';
    }
    if (row && eventoEhVinculado(row)) {
      mostrarFormMsg('info', '<i class="ph ph-link"></i> Este evento está vinculado a um espelho no cadastro do cônjuge.');
    }
    el('ecFormWrap').style.display = 'block';
    var btnAdd = el('btnAddEventoEC');
    if (btnAdd) btnAdd.style.display = 'none';
  }

  function fecharForm() {
    el('ecFormWrap').style.display = 'none';
    eventoEditId = null;
    eventoEditRow = null;
    var btnAdd = el('btnAddEventoEC');
    if (btnAdd && window.EVENTOS_EC_CLIENTE_ID) btnAdd.style.display = '';
  }

  // Regime de bens visível só para os tipos que o exigem
  function atualizarVisibilidadeRegime() {
    var grupo = el('ecRegimeGroup');
    if (!grupo) return;
    if (tipoExigeRegime(el('ecTipo').value)) {
      grupo.style.display = '';
    } else {
      grupo.style.display = 'none';
      el('ecRegime').value = '';
    }
  }

  // ── Autocomplete de cônjuge (independente do formulário principal) ──
  function configurarAutocompleteConjuge() {
    var input = el('ecConjugeInput');
    if (!input) return;
    input.addEventListener('input', function() {
      var termo = input.value.trim();
      if (!termo) {
        ecConjugeId = null;
        fecharAutoListConjuge();
        return;
      }
      if (ecConjugeId) { ecConjugeId = null; }
      if (ecConjugeTimer) clearTimeout(ecConjugeTimer);
      if (termo.length < 3) { fecharAutoListConjuge(); return; }
      ecConjugeTimer = setTimeout(function() { buscarConjugeEC(termo); }, 300);
    });
  }

  function buscarConjugeEC(termo) {
    var url = API_BASE + '/database/rows/table/' + TABLE_CLIENTES +
      '/?user_field_names=false&filter__' + C_NOME + '__contains=' +
      encodeURIComponent(termo) + '&size=8';
    fetch(url, { headers: apiHeaders() })
      .then(function(r) { return r.json(); })
      .then(function(data) { mostrarAutoListConjuge(data.results || []); })
      .catch(function(e) { console.error('Erro na busca de cônjuge (evento):', e); });
  }

  function mostrarAutoListConjuge(resultados) {
    var lista = el('ecConjugeAutoList');
    if (!lista) return;
    lista.innerHTML = '';
    var titularId = window.EVENTOS_EC_CLIENTE_ID;
    var exibidos = 0;
    for (var i = 0; i < resultados.length; i++) {
      (function(cli) {
        if (titularId && cli.id === Number(titularId)) return; // exclui o próprio titular
        var nome = cli[C_NOME] || '';
        var cpf = cli[C_CPF] || '';
        var item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.innerHTML =
          '<div class="ac-name">' + escapar(nome) + '</div>' +
          (cpf ? '<div class="ac-detail">CPF: ' + escapar(cpf) + '</div>' : '');
        item.addEventListener('click', function() {
          ecConjugeId = cli.id;
          el('ecConjugeInput').value = nome;
          fecharAutoListConjuge();
        });
        lista.appendChild(item);
        exibidos++;
      })(resultados[i]);
    }
    if (exibidos === 0) { lista.classList.remove('open'); return; }
    lista.classList.add('open');
  }

  function fecharAutoListConjuge() {
    var lista = el('ecConjugeAutoList');
    if (lista) lista.classList.remove('open');
  }

  // ── Espelhamento (Fase 2) ─────────────────────────────
  // Limitação conhecida (intencional): evento salvo SEM espelho não ganha
  // oportunidade posterior de vinculação — a pergunta ocorre apenas na criação e
  // na troca de cônjuge. Vincular a posteriori exige excluir e recriar o evento.
  //
  // Simetria de papéis: o código não distingue "original" de "espelho" — qualquer
  // evento com field_7561 preenchido é vinculado e propaga a partir do seu lado.

  function urlEvento(id) {
    return API_BASE + '/database/rows/table/' + TABLE_EC +
      (id ? '/' + id : '') + '/?user_field_names=false';
  }

  // Rótulo canônico do evento: único ponto de montagem (Leva 3: sem data =
  // pendência de completude; o rótulo marca "data não informada")
  function montarRotulo(nomeTipo, dataEvento) {
    if (dataEvento) return nomeTipo + ' \u2014 ' + formatarData(dataEvento);
    return nomeTipo + ' \u2014 data não informada';
  }

  // Payload comum aos dois lados (sem cliente/conjuge e sem campos de criação)
  function montarPayloadBase(dados, agora) {
    var payload = {};
    payload[F_ROTULO]     = montarRotulo(dados.nomeTipo, dados.dataEvento);
    payload[F_TIPO]       = Number(dados.tipoVal);
    payload[F_DATA]       = dados.dataEvento || null;
    payload[F_REGIME]     = dados.exigeRegime ? Number(dados.regimeVal) : null;
    payload[F_OBS]        = dados.obs;
    payload[F_ATUALIZADO] = agora;
    return payload;
  }

  // ── Log de auditoria no Histórico do cliente (Leva 4) ──
  // Toda operação de evento grava linha(s) no campo de log da 754 do(s)
  // cliente(s) afetado(s), sempre APÓS o sucesso da operação na 786. Falha de
  // log nunca bloqueia nem reverte a operação principal (toast + console.error).

  // Linha no formato da casa: "{usuário}. {dd/mm/aaaa hh:mm}: {texto}"
  function gerarLinhaLog(texto) {
    var agora = new Date();
    var dia = ('0' + agora.getDate()).slice(-2);
    var mes = ('0' + (agora.getMonth() + 1)).slice(-2);
    var ano = agora.getFullYear();
    var hora = ('0' + agora.getHours()).slice(-2);
    var min = ('0' + agora.getMinutes()).slice(-2);
    var nomeUsuario = (window.CURRENT_USER && window.CURRENT_USER.nome)
      ? window.CURRENT_USER.nome : 'Usuário';
    return nomeUsuario + '. ' + dia + '/' + mes + '/' + ano + ' ' + hora + ':' + min + ': ' + texto;
  }

  // Prepend de linha(s) no log do cliente. O PATCH contém SOMENTE C_LOG —
  // nenhum outro campo da 754 vai junto. Sempre resolve; falha vira toast.
  function appendLogCliente(clienteRowId, linhas) {
    if (!clienteRowId || !linhas || !linhas.length) return Promise.resolve();
    var texto = (typeof linhas === 'string') ? linhas : linhas.join('\n');
    var url = API_BASE + '/database/rows/table/' + TABLE_CLIENTES + '/' + clienteRowId + '/?user_field_names=false';
    return fetch(url, { headers: apiHeaders() })
      .then(function(r) {
        if (!r.ok) throw new Error('get-cliente-log');
        return r.json();
      })
      .then(function(cli) {
        var existente = cli[C_LOG] || '';
        var body = {};
        body[C_LOG] = existente ? (texto + '\n' + existente) : texto;
        return fetch(url, { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(body) });
      })
      .then(function(r2) { if (!r2.ok) throw new Error('patch-cliente-log'); })
      .catch(function(e) {
        console.error('Falha ao gravar o histórico do cliente:', e);
        avisar('Evento salvo, mas não foi possível gravar o histórico do cliente.');
      });
  }

  // Valor bruto do Baserow → legível para o diff do log
  function valorLegivelLog(raw) {
    if (raw === null || raw === undefined || raw === '') return '(vazio)';
    if (typeof raw === 'boolean') return raw ? 'Sim' : 'Não';
    if (Object.prototype.toString.call(raw) === '[object Array]') {
      if (!raw.length) return '(vazio)';
      return (raw[0] && raw[0].value) ? raw[0].value : '(vazio)';
    }
    if (typeof raw === 'object') return raw.value || '(vazio)';
    return String(raw);
  }

  function labelRegime(id) {
    var idNum = Number(id);
    for (var i = 0; i < REGIME_OPTS.length; i++) {
      if (REGIME_OPTS[i].id === idNum) return REGIME_OPTS[i].label;
    }
    return '';
  }

  // Nome do cliente dono da linha (o link_row para a 754 traz o Nome como value)
  function nomeDoCliente(row) {
    if (row && row[F_CLIENTE] && row[F_CLIENTE][0] && row[F_CLIENTE][0].value) {
      return row[F_CLIENTE][0].value;
    }
    return '(não identificado)';
  }

  // Diff legível de uma edição (Tipo/Data/Cônjuge/Regime com valores; das
  // observações NUNCA se loga o conteúdo — apenas que mudaram)
  function gerarDiffEdicao(rowAntes, dados) {
    if (!rowAntes) return '(nenhuma)';
    var partes = [];

    var tipoAntes = valorLegivelLog(rowAntes[F_TIPO]);
    var tipoDepois = dados.nomeTipo || '(vazio)';
    if (tipoAntes !== tipoDepois) partes.push('Tipo: ' + tipoAntes + ' -> ' + tipoDepois);

    var dataAntes = formatarData(rowAntes[F_DATA]) || '(vazio)';
    var dataDepois = formatarData(dados.dataEvento) || '(vazio)';
    if (dataAntes !== dataDepois) partes.push('Data: ' + dataAntes + ' -> ' + dataDepois);

    var conjAntes = valorLegivelLog(rowAntes[F_CONJUGE]);
    var conjDepois = dados.nomeConjuge || '(vazio)';
    if (conjAntes !== conjDepois) partes.push('Cônjuge: ' + conjAntes + ' -> ' + conjDepois);

    var regimeAntes = valorLegivelLog(rowAntes[F_REGIME]);
    var regimeDepois = (dados.exigeRegime && dados.regimeVal) ? (labelRegime(dados.regimeVal) || '(vazio)') : '(vazio)';
    if (regimeAntes !== regimeDepois) partes.push('Regime de bens: ' + regimeAntes + ' -> ' + regimeDepois);

    if ((rowAntes[F_OBS] || '') !== (dados.obs || '')) partes.push('Observações alteradas');

    return partes.length ? partes.join('; ') : '(nenhuma)';
  }

  // Cria o espelho no cadastro do cônjuge (cliente/conjuge invertidos) e amarra os
  // dois lados pelo field_7561. Falhas parciais avisam por toast e resolvem mesmo
  // assim — o evento do titular já está salvo. Log de auditoria no cadastro do
  // cônjuge somente após o POST do espelho ter sucesso.
  function criarEspelho(originalId, titularId, dados) {
    var agora = new Date().toISOString();
    var payload = montarPayloadBase(dados, agora);
    payload[F_CLIENTE]    = [Number(dados.conjugeId)];
    payload[F_CONJUGE]    = [Number(titularId)];
    payload[F_CRIADO_POR] = (window.CURRENT_USER && window.CURRENT_USER.nome) || '';
    payload[F_CRIADO_EM]  = agora;
    payload[E_ESPELHO]    = [Number(originalId)];

    return fetch(urlEvento(null), { method: 'POST', headers: apiHeaders(), body: JSON.stringify(payload) })
      .then(function(r) {
        if (!r.ok) throw new Error('post-espelho');
        return r.json();
      })
      .then(function(espelho) {
        var linhaEspelho = gerarLinhaLog('Evento espelho de estado civil registrado a partir do cadastro de ' +
          (dados.nomeTitular || '(não identificado)') + ': ' + montarRotulo(dados.nomeTipo, dados.dataEvento) + '.');
        return appendLogCliente(Number(dados.conjugeId), linhaEspelho).then(function() { return espelho; });
      })
      .then(function(espelho) {
        var body = {};
        body[E_ESPELHO] = [Number(espelho.id)];
        return fetch(urlEvento(originalId), { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(body) })
          .then(function(r2) { if (!r2.ok) throw new Error('patch-vinculo'); })
          .catch(function(e2) {
            console.error('Falha ao amarrar o vínculo no evento original:', e2);
            avisar('O espelho foi criado, mas o vínculo ficou incompleto neste lado.');
          });
      })
      .catch(function(e) {
        console.error('Falha ao criar o espelho:', e);
        avisar('O evento do titular foi salvo, mas o espelho não pôde ser criado.');
      });
  }

  // Propaga a edição para o espelho — NUNCA envia cliente/conjuge do outro lado.
  // Sempre resolve com { ok } (o log do cônjuge só é gravado quando ok); falha
  // (inclusive 404 de linha removida direto no Baserow) vira toast.
  function propagarEdicaoEspelho(espelhoId, dados) {
    var body = montarPayloadBase(dados, new Date().toISOString());
    return fetch(urlEvento(espelhoId), { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(body) })
      .then(function(r) {
        if (!r.ok) throw new Error('patch-espelho');
        return { ok: true };
      })
      .catch(function(e) {
        console.error('Falha ao propagar a edição para o espelho:', e);
        avisar('O evento local foi salvo, mas o espelho não foi atualizado.');
        return { ok: false };
      });
  }

  // Remove o vínculo do espelho antigo (vira evento órfão — intencional).
  // Sempre resolve com { ok }; falha deixa vínculo unilateral (degradação
  // aceita) com aviso — e sem log no cônjuge antigo.
  function desvincularEspelho(espelhoId) {
    var body = {};
    body[E_ESPELHO] = [];
    body[F_ATUALIZADO] = new Date().toISOString();
    return fetch(urlEvento(espelhoId), { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(body) })
      .then(function(r) {
        if (!r.ok) throw new Error('patch-desvinculo');
        return { ok: true };
      })
      .catch(function(e) {
        console.error('Falha ao desvincular o espelho antigo:', e);
        avisar('Não foi possível desvincular o espelho antigo; o vínculo pode ter ficado unilateral.');
        return { ok: false };
      });
  }

  // ── Salvar (POST/PATCH) ───────────────────────────────
  function salvarEvento() {
    var clienteId = window.EVENTOS_EC_CLIENTE_ID;
    if (!clienteId) {
      mostrarFormMsg('error', 'Nenhum cliente carregado.');
      return;
    }

    var tipoVal = el('ecTipo').value;
    var dataEvento = el('ecData').value;
    var regimeVal = el('ecRegime').value;

    if (!tipoVal) {
      mostrarFormMsg('error', 'Selecione o tipo do evento.');
      return;
    }
    if (!ecConjugeId) {
      mostrarFormMsg('error', 'Selecione o cônjuge/companheiro(a) pela busca (não basta digitar o nome).');
      return;
    }
    var exigeRegime = tipoExigeRegime(tipoVal);
    if (exigeRegime && !regimeVal) {
      mostrarFormMsg('error', 'Selecione o regime de bens.');
      return;
    }

    var t = tipoInfo(tipoVal);
    var dados = {
      tipoVal: tipoVal,
      dataEvento: dataEvento,
      regimeVal: regimeVal,
      exigeRegime: exigeRegime,
      obs: el('ecObsTextarea').value,
      nomeTipo: t ? t.label : 'Evento',
      conjugeId: ecConjugeId,
      nomeConjuge: el('ecConjugeInput').value.trim()
    };

    if (eventoEditId) {
      salvarEdicaoEvento(clienteId, dados);
    } else {
      salvarNovoEvento(clienteId, dados);
    }
  }

  function travarForm(travar) {
    var btn = el('btnSalvarEC');
    if (btn) btn.disabled = !!travar;
    if (travar) { overlayOn(); } else { overlayOff(); }
  }

  function finalizarSalvamento() {
    travarForm(false);
    fecharForm();
    carregarEventos();
  }

  function salvarNovoEvento(clienteId, dados) {
    var agora = new Date().toISOString();
    var payload = montarPayloadBase(dados, agora);
    payload[F_CONJUGE]    = [Number(dados.conjugeId)];
    payload[F_CLIENTE]    = [Number(clienteId)];
    payload[F_CRIADO_POR] = (window.CURRENT_USER && window.CURRENT_USER.nome) || '';
    payload[F_CRIADO_EM]  = agora;

    travarForm(true);
    esconderFormMsg();

    fetch(urlEvento(null), { method: 'POST', headers: apiHeaders(), body: JSON.stringify(payload) })
      .then(function(r) {
        if (!r.ok) return r.json().then(function(e) {
          throw new Error(e.detail || 'Erro ao salvar o evento.');
        });
        return r.json();
      })
      .then(function(criado) {
        dados.nomeTitular = nomeDoCliente(criado);
        var linha = gerarLinhaLog('Evento de estado civil registrado: ' +
          montarRotulo(dados.nomeTipo, dados.dataEvento) +
          ' (cônjuge: ' + (dados.nomeConjuge || '(não identificado)') + ').');
        return appendLogCliente(Number(clienteId), linha).then(function() { return criado; });
      })
      .then(function(criado) {
        if (!tipoEhSimetrico(dados.tipoVal) || !dados.conjugeId) return null;
        if (!confirm('Registrar também o evento espelho no cadastro de ' + dados.nomeConjuge + '?')) return null;
        return criarEspelho(criado.id, clienteId, dados);
      })
      .then(function() {
        finalizarSalvamento();
      })
      .catch(function(e) {
        travarForm(false);
        mostrarFormMsg('error', e.message || 'Erro ao salvar o evento.');
        console.error(e);
      });
  }

  function salvarEdicaoEvento(clienteId, dados) {
    var row = eventoEditRow;
    var vinculado = eventoEhVinculado(row);
    var conjugeOriginalId = (row && row[F_CONJUGE] && row[F_CONJUGE][0]) ? row[F_CONJUGE][0].id : null;
    var conjugeMudou = String(conjugeOriginalId || '') !== String(dados.conjugeId || '');

    if (vinculado && conjugeMudou) {
      salvarEdicaoComTrocaDeConjuge(clienteId, dados, row);
      return;
    }

    var diff = gerarDiffEdicao(row, dados);
    var rotuloNovo = montarRotulo(dados.nomeTipo, dados.dataEvento);
    dados.nomeTitular = nomeDoCliente(row);

    var payload = montarPayloadBase(dados, new Date().toISOString());
    payload[F_CONJUGE] = [Number(dados.conjugeId)];

    travarForm(true);
    esconderFormMsg();

    fetch(urlEvento(eventoEditId), { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(payload) })
      .then(function(r) {
        if (!r.ok) return r.json().then(function(e) {
          throw new Error(e.detail || 'Erro ao salvar o evento.');
        });
        return r.json();
      })
      .then(function() {
        var linha = gerarLinhaLog('Evento de estado civil editado: ' + rotuloNovo +
          '. Alterações: ' + diff + '.');
        return appendLogCliente(Number(clienteId), linha);
      })
      .then(function() {
        if (!vinculado) return null;
        if (!confirm('Atualizar também o evento espelho no cadastro de ' + dados.nomeConjuge + '?')) return null;
        return propagarEdicaoEspelho(row[E_ESPELHO][0].id, dados)
          .then(function(res) {
            if (!res || !res.ok) return null;
            var linhaEspelho = gerarLinhaLog('Evento espelho de estado civil atualizado por propagação do cadastro de ' +
              dados.nomeTitular + ': ' + rotuloNovo + '. Alterações: ' + diff + '.');
            return appendLogCliente(Number(dados.conjugeId), linhaEspelho);
          });
      })
      .then(function() {
        finalizarSalvamento();
      })
      .catch(function(e) {
        travarForm(false);
        mostrarFormMsg('error', e.message || 'Erro ao salvar o evento.');
        console.error(e);
      });
  }

  // Troca de cônjuge em evento vinculado: desvincula os dois lados e, se o tipo
  // continua simétrico, oferece espelho novo no cadastro do novo cônjuge.
  // Logs: edição + desvinculação no titular (um só append); desvinculação no
  // cônjuge antigo (só se o espelho antigo foi de fato desvinculado); criação de
  // espelho no novo cônjuge (dentro de criarEspelho, se aceito).
  function salvarEdicaoComTrocaDeConjuge(clienteId, dados, row) {
    var nomeAntigo = (row[F_CONJUGE] && row[F_CONJUGE][0] && row[F_CONJUGE][0].value) || 'cônjuge anterior';
    if (!confirm('Este evento está vinculado a um espelho no cadastro de ' + nomeAntigo +
        '. Trocar o cônjuge desvinculará os dois eventos. Continuar?')) {
      return; // aborta o salvamento; o formulário permanece aberto
    }

    var espelhoAntigoId = row[E_ESPELHO][0].id;
    var rotuloEspelhoAntigo = (row[E_ESPELHO][0] && row[E_ESPELHO][0].value) || (row[F_ROTULO] || '');
    var conjugeAntigoId = (row[F_CONJUGE] && row[F_CONJUGE][0]) ? row[F_CONJUGE][0].id : null;
    var eventoLocalId = eventoEditId; // preserva: fecharForm zera o estado de edição
    var diff = gerarDiffEdicao(row, dados);
    var rotuloNovo = montarRotulo(dados.nomeTipo, dados.dataEvento);
    var desvinculou = false;
    dados.nomeTitular = nomeDoCliente(row);

    travarForm(true);
    esconderFormMsg();

    desvincularEspelho(espelhoAntigoId)
      .then(function(res) {
        desvinculou = !!(res && res.ok);
        var payload = montarPayloadBase(dados, new Date().toISOString());
        payload[F_CONJUGE] = [Number(dados.conjugeId)];
        payload[E_ESPELHO] = [];
        return fetch(urlEvento(eventoLocalId), { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(payload) })
          .then(function(r) {
            if (!r.ok) return r.json().then(function(e) {
              throw new Error(e.detail || 'Erro ao salvar o evento.');
            });
            return r.json();
          });
      })
      .then(function() {
        var linhasTitular = [
          gerarLinhaLog('Evento de estado civil editado: ' + rotuloNovo + '. Alterações: ' + diff + '.'),
          gerarLinhaLog('Evento desvinculado do espelho no cadastro de ' + nomeAntigo + '.')
        ];
        var p = appendLogCliente(Number(clienteId), linhasTitular);
        if (desvinculou && conjugeAntigoId) {
          p = p.then(function() {
            var linhaAntigo = gerarLinhaLog('Evento espelho desvinculado por troca de cônjuge no cadastro de ' +
              dados.nomeTitular + ': ' + rotuloEspelhoAntigo + '.');
            return appendLogCliente(Number(conjugeAntigoId), linhaAntigo);
          });
        }
        return p;
      })
      .then(function() {
        if (!tipoEhSimetrico(dados.tipoVal)) return null;
        if (!confirm('Registrar evento espelho no cadastro de ' + dados.nomeConjuge + '?')) return null;
        return criarEspelho(eventoLocalId, clienteId, dados);
      })
      .then(function() {
        finalizarSalvamento();
      })
      .catch(function(e) {
        travarForm(false);
        mostrarFormMsg('error', e.message || 'Erro ao salvar o evento.');
        console.error(e);
      });
  }

  // ── Exclusão lógica (só master) ───────────────────────
  function excluirEvento(row) {
    if (!row || !perfilPodeExcluir()) return;
    var vinculado = eventoEhVinculado(row);
    var msg = vinculado
      ? 'Excluir este evento e o espelho no cadastro do cônjuge? (exclusão lógica)'
      : 'Excluir este evento? Ele deixará de aparecer na linha do tempo. O registro é mantido e pode ser recuperado.';
    if (!confirm(msg)) return;

    var rotulo = row[F_ROTULO] || '';
    var nomeTitular = nomeDoCliente(row);
    var titularId = (row[F_CLIENTE] && row[F_CLIENTE][0]) ? row[F_CLIENTE][0].id : window.EVENTOS_EC_CLIENTE_ID;
    var conjugeId = (row[F_CONJUGE] && row[F_CONJUGE][0]) ? row[F_CONJUGE][0].id : null;
    var rotuloEspelho = vinculado ? ((row[E_ESPELHO][0] && row[E_ESPELHO][0].value) || rotulo) : '';

    var body = {};
    body[F_EXCLUIDO] = true;
    body[F_ATUALIZADO] = new Date().toISOString();

    overlayOn();
    fetch(urlEvento(row.id), { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(body) })
      .then(function(r) {
        if (!r.ok) return r.json().then(function(e) {
          throw new Error(e.detail || 'Erro ao excluir o evento.');
        });
        return r.json();
      })
      .then(function() {
        var linha = gerarLinhaLog('Evento de estado civil excluído: ' + rotulo + '.');
        return appendLogCliente(Number(titularId), linha);
      })
      .then(function() {
        if (!vinculado) return null;
        return fetch(urlEvento(row[E_ESPELHO][0].id), { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(body) })
          .then(function(r2) {
            if (!r2.ok) throw new Error('patch-espelho');
            if (!conjugeId) return null;
            var linhaEspelho = gerarLinhaLog('Evento espelho de estado civil excluído a partir do cadastro de ' +
              nomeTitular + ': ' + rotuloEspelho + '.');
            return appendLogCliente(Number(conjugeId), linhaEspelho);
          })
          .catch(function(e2) {
            console.error('Falha ao excluir o espelho:', e2);
            avisar('Exclusão parcial: o evento local foi excluído, mas o espelho não.');
          });
      })
      .then(function() {
        overlayOff();
        carregarEventos();
      })
      .catch(function(e) {
        overlayOff();
        console.error(e);
        alert(e.message || 'Não foi possível excluir o evento.');
      });
  }

  // ── Inicialização ─────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    if (!el('ecTimeline')) return; // página sem o módulo

    popularSelect('ecTipo', TIPO_OPTS);
    popularSelect('ecRegime', REGIME_OPTS);

    var btnAdd = el('btnAddEventoEC');
    if (btnAdd) btnAdd.addEventListener('click', function() { abrirForm(null); });

    var btnCancelar = el('btnCancelarEC');
    if (btnCancelar) btnCancelar.addEventListener('click', fecharForm);

    var btnSalvar = el('btnSalvarEC');
    if (btnSalvar) btnSalvar.addEventListener('click', salvarEvento);

    var selTipo = el('ecTipo');
    if (selTipo) selTipo.addEventListener('change', atualizarVisibilidadeRegime);

    configurarAutocompleteConjuge();

    // Fecha o autocomplete ao clicar fora
    document.addEventListener('click', function(e) {
      if (!e.target.closest('#ecConjugeInput') && !e.target.closest('#ecConjugeAutoList')) {
        fecharAutoListConjuge();
      }
    });

    // Estado inicial (gate: placeholder enquanto o cliente não estiver salvo)
    carregarEventos();
  });

  // Exposição global usada por clientes.js (abas / habilitar dependentes)
  window.carregarEventosEstadoCivil = carregarEventos;
})();
