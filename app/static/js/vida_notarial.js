// vida_notarial.js — Aba "Vida notarial" das páginas de cliente (PF/PJ)
// Porta as 5 seções de relatório do Detalhamento de Cliente (standalone) para
// dentro da página de cliente, com link de abertura do ato via deep link
// (Leva 1). Sem coluna "Retificada?" e sem impressão (decisões travadas).
// ES5 estrito (var/function). Lê o cliente atual de window.VIDA_NOTARIAL_CLIENTE_ID.
// Espelha o padrão de eventos_estado_civil.js (IIFE + funções globais expostas).
(function() {
  'use strict';

  var API_BASE = '/api/baserow';

  var TABLES = {
    clientes: 754,
    controle: 745,
    substabelecimentos: 762,
    protocolo: 755,
    certidoes: 776,
    revogacao: 777
  };

  var FIELDS = {
    // Clientes (754) — arrays de link para as seções
    escrituras: 'field_7380',
    substabelecimentos: 'field_7412',
    revogacoes: 'field_7449',
    protocolos: 'field_7247',
    certidoesRequerido: 'field_7422',
    // Controle (745)
    ctrlLivro: 'field_7189',
    ctrlPagina: 'field_7190',
    ctrlTipo: 'field_7194',
    ctrlData: 'field_7226',
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
    certSubtipo: 'field_7417'
  };

  // Gate por perfil: escrevente não acessa /controle, /substabelecimentos,
  // /revogacao-procuracao e /controle-certidoes — nessas seções o link é ocultado.
  // A seção de Protocolos (/consultar) é visível para todos os perfis.
  var podeAbrirAtos = window.CURRENT_USER && window.CURRENT_USER.perfil !== 'escrevente';

  // Mensagens de vazio por seção (mesmos textos do detalhamento)
  var SECOES = {
    escrituras: { container: 'vnSecaoEscrituras', vazio: 'Nenhuma participação em escritura localizada.' },
    substabelecimentos: { container: 'vnSecaoSubstabelecimentos', vazio: 'Nenhuma participação em substabelecimento localizada.' },
    revogacoes: { container: 'vnSecaoRevogacoes', vazio: 'Nenhuma participação em revogação de procuração localizada.' },
    protocolos: { container: 'vnSecaoProtocolos', vazio: 'Nenhum protocolo localizado.' },
    certidoes: { container: 'vnSecaoCertidoes', vazio: 'Nenhuma certidão localizada.' }
  };

  // Cache interno: último cliente carregado (lazy load — só refaz fetch se o id mudou)
  var clienteCarregadoId = null;

  // ── Helpers ───────────────────────────────────────────
  function apiHeaders() {
    return { 'Content-Type': 'application/json' };
  }

  function el(id) { return document.getElementById(id); }

  function esc(str) {
    str = (str == null) ? '' : ('' + str);
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;');
  }

  // 'YYYY-MM-DD' -> 'DD/MM/YYYY' por manipulação de string (evita offset UTC-3)
  function formatarData(iso) {
    if (!iso) return '—';
    var partes = ('' + iso).split('T')[0].split('-');
    if (partes.length !== 3) return esc('' + iso);
    return partes[2] + '/' + partes[1] + '/' + partes[0];
  }

  function setVazia(chave, texto) {
    var container = el(SECOES[chave].container);
    if (container) container.innerHTML = '<div class="vn-vazia">' + texto + '</div>';
  }

  // Comparador de data decrescente por string ISO (nunca new Date())
  function ordenarPorDataDesc(registros, campoData) {
    registros.sort(function(a, b) {
      var da = a[campoData] || '';
      var db = b[campoData] || '';
      return da < db ? 1 : (da > db ? -1 : 0);
    });
  }

  function buscarRegistro(tableId, rowId) {
    var url = API_BASE + '/database/rows/table/' + tableId +
      '/' + rowId + '/?user_field_names=false';
    return fetch(url, { headers: apiHeaders() })
      .then(function(r) {
        if (!r.ok) throw new Error('Erro ao buscar registro ' + rowId);
        return r.json();
      });
  }

  // Concatena os values de um array de link_row ("A; B")
  function textoLinkArr(arr) {
    arr = arr || [];
    var texto = '';
    for (var i = 0; i < arr.length; i++) {
      if (i > 0) texto += '; ';
      texto += arr[i].value || ('ID ' + arr[i].id);
    }
    return texto;
  }

  // Célula do link discreto (última coluna). Sem valores → '—' no lugar do link.
  function celulaLink(href, temValores) {
    if (!temValores) return '<td>—</td>';
    return '<td><a class="vn-link" href="' + href +
      '" title="Abrir registro"><i class="ph ph-arrow-square-out"></i></a></td>';
  }

  function celulaLinkLivroPagina(base, livro, pagina) {
    var href = base + '?livro=' + encodeURIComponent(livro) + '&pagina=' + encodeURIComponent(pagina);
    return celulaLink(href, !!(livro && pagina));
  }

  function celulaLinkProtocolo(base, numero) {
    var href = base + '?protocolo=' + encodeURIComponent(numero);
    return celulaLink(href, !!numero);
  }

  // Monta a tabela canônica de uma seção
  function montarTabela(headers, linhas, comColunaLink) {
    var html = '<div class="table-wrapper"><table class="report-table"><thead><tr>';
    for (var i = 0; i < headers.length; i++) {
      html += '<th>' + headers[i] + '</th>';
    }
    if (comColunaLink) html += '<th></th>';
    html += '</tr></thead><tbody>';
    for (var j = 0; j < linhas.length; j++) {
      html += linhas[j];
    }
    html += '</tbody></table></div>';
    return html;
  }

  // Carrega os registros vinculados de uma seção e renderiza a tabela
  function carregarSecao(chave, linkArr, tableId, campoData, renderizarLinha, headers, comColunaLink) {
    var container = el(SECOES[chave].container);
    if (!container) return;
    linkArr = linkArr || [];
    if (linkArr.length === 0) {
      setVazia(chave, SECOES[chave].vazio);
      return;
    }

    setVazia(chave, 'Carregando...');
    var promises = [];
    for (var i = 0; i < linkArr.length; i++) {
      promises.push(buscarRegistro(tableId, linkArr[i].id));
    }

    Promise.all(promises)
      .then(function(registros) {
        ordenarPorDataDesc(registros, campoData);
        var linhas = [];
        for (var j = 0; j < registros.length; j++) {
          linhas.push(renderizarLinha(registros[j]));
        }
        container.innerHTML = montarTabela(headers, linhas, comColunaLink);
      })
      .catch(function(e) {
        console.error('Erro ao carregar seção ' + chave + ':', e);
        setVazia(chave, 'Erro ao carregar registros.');
      });
  }

  // ── Renderização das linhas por seção ─────────────────
  function linhaEscritura(reg) {
    var tipo = '';
    var tipoArr = reg[FIELDS.ctrlTipo];
    if (tipoArr && tipoArr.length > 0) tipo = tipoArr[0].value || '';
    var livro = reg[FIELDS.ctrlLivro] || '';
    var pagina = reg[FIELDS.ctrlPagina] || '';

    var html = '<tr>';
    html += '<td>' + esc(livro || '—') + '</td>';
    html += '<td>' + esc(pagina || '—') + '</td>';
    html += '<td>' + esc(tipo || '—') + '</td>';
    html += '<td>' + formatarData(reg[FIELDS.ctrlData]) + '</td>';
    if (podeAbrirAtos) html += celulaLinkLivroPagina('/controle', livro, pagina);
    html += '</tr>';
    return html;
  }

  function linhaSubstabelecimento(reg) {
    var livro = reg[FIELDS.substLivro] || '';
    var pagina = reg[FIELDS.substPagina] || '';
    var procTexto = textoLinkArr(reg[FIELDS.substProcuracao]);

    var html = '<tr>';
    html += '<td>' + esc(livro || '—') + '</td>';
    html += '<td>' + esc(pagina || '—') + '</td>';
    html += '<td>' + esc(procTexto || '—') + '</td>';
    html += '<td>' + formatarData(reg[FIELDS.substData]) + '</td>';
    if (podeAbrirAtos) html += celulaLinkLivroPagina('/substabelecimentos', livro, pagina);
    html += '</tr>';
    return html;
  }

  function linhaRevogacao(reg) {
    var livro = reg[FIELDS.revogLivro] || '';
    var pagina = reg[FIELDS.revogPagina] || '';
    var procTexto = textoLinkArr(reg[FIELDS.revogProcuracao]);

    var html = '<tr>';
    html += '<td>' + esc(livro || '—') + '</td>';
    html += '<td>' + esc(pagina || '—') + '</td>';
    html += '<td>' + esc(procTexto || '—') + '</td>';
    html += '<td>' + formatarData(reg[FIELDS.revogData]) + '</td>';
    if (podeAbrirAtos) html += celulaLinkLivroPagina('/revogacao-procuracao', livro, pagina);
    html += '</tr>';
    return html;
  }

  function linhaProtocolo(reg) {
    var numero = reg[FIELDS.protoNumero] || '';
    var servico = '';
    var servicoArr = reg[FIELDS.protoServico];
    if (servicoArr && servicoArr.length > 0) servico = servicoArr[0].value || '';
    var status = '';
    var statusObj = reg[FIELDS.protoStatus];
    if (statusObj && statusObj.value) status = statusObj.value;

    var html = '<tr>';
    html += '<td>' + esc(numero || '—') + '</td>';
    html += '<td>' + esc(servico || '—') + '</td>';
    html += '<td>' + esc(status || '—') + '</td>';
    html += '<td>' + formatarData(reg[FIELDS.protoDataEntrada]) + '</td>';
    // Link visível para todos os perfis (/consultar é acessível a escrevente)
    html += celulaLinkProtocolo('/consultar', numero);
    html += '</tr>';
    return html;
  }

  function linhaCertidao(reg) {
    var numero = '';
    var protoArr = reg[FIELDS.certProtocolo];
    if (protoArr && protoArr.length > 0) numero = protoArr[0].value || '';
    var subtipo = '';
    var subtipoObj = reg[FIELDS.certSubtipo];
    if (subtipoObj && subtipoObj.value) subtipo = subtipoObj.value;

    var html = '<tr>';
    html += '<td>' + esc(numero || '—') + '</td>';
    html += '<td>' + esc(subtipo || '—') + '</td>';
    html += '<td>' + formatarData(reg[FIELDS.certDataEmissao]) + '</td>';
    if (podeAbrirAtos) html += celulaLinkProtocolo('/controle-certidoes', numero);
    html += '</tr>';
    return html;
  }

  // ── Fluxo principal ───────────────────────────────────
  function carregarVidaNotarial() {
    var clienteId = window.VIDA_NOTARIAL_CLIENTE_ID;
    if (!clienteId) {
      limparVidaNotarial();
      return;
    }
    if (clienteId === clienteCarregadoId) return; // cache: mesmo cliente, não refazer
    clienteCarregadoId = clienteId;

    setVazia('escrituras', 'Carregando...');
    setVazia('substabelecimentos', 'Carregando...');
    setVazia('revogacoes', 'Carregando...');
    setVazia('protocolos', 'Carregando...');
    setVazia('certidoes', 'Carregando...');

    var url = API_BASE + '/database/rows/table/' + TABLES.clientes +
      '/' + clienteId + '/?user_field_names=false';
    fetch(url, { headers: apiHeaders() })
      .then(function(r) {
        if (!r.ok) throw new Error('Erro ao buscar cliente');
        return r.json();
      })
      .then(function(row) {
        carregarSecao('escrituras', row[FIELDS.escrituras], TABLES.controle,
          FIELDS.ctrlData, linhaEscritura,
          ['Livro', 'Página', 'Tipo', 'Data'], podeAbrirAtos);
        carregarSecao('substabelecimentos', row[FIELDS.substabelecimentos], TABLES.substabelecimentos,
          FIELDS.substData, linhaSubstabelecimento,
          ['Livro', 'Página', 'Procuração', 'Data'], podeAbrirAtos);
        carregarSecao('revogacoes', row[FIELDS.revogacoes], TABLES.revogacao,
          FIELDS.revogData, linhaRevogacao,
          ['Livro', 'Página', 'Procuração', 'Data'], podeAbrirAtos);
        carregarSecao('protocolos', row[FIELDS.protocolos], TABLES.protocolo,
          FIELDS.protoDataEntrada, linhaProtocolo,
          ['Número', 'Serviço', 'Status', 'Data de entrada'], true);
        carregarSecao('certidoes', row[FIELDS.certidoesRequerido], TABLES.certidoes,
          FIELDS.certDataEmissao, linhaCertidao,
          ['Protocolo', 'Subtipo', 'Data de emissão'], podeAbrirAtos);
      })
      .catch(function(e) {
        console.error('Erro ao carregar vida notarial:', e);
        clienteCarregadoId = null; // permite nova tentativa ao reabrir a aba
        setVazia('escrituras', 'Erro ao carregar registros.');
        setVazia('substabelecimentos', 'Erro ao carregar registros.');
        setVazia('revogacoes', 'Erro ao carregar registros.');
        setVazia('protocolos', 'Erro ao carregar registros.');
        setVazia('certidoes', 'Erro ao carregar registros.');
      });
  }

  function limparVidaNotarial() {
    clienteCarregadoId = null;
    setVazia('escrituras', SECOES.escrituras.vazio);
    setVazia('substabelecimentos', SECOES.substabelecimentos.vazio);
    setVazia('revogacoes', SECOES.revogacoes.vazio);
    setVazia('protocolos', SECOES.protocolos.vazio);
    setVazia('certidoes', SECOES.certidoes.vazio);
  }

  // ── API pública ───────────────────────────────────────
  window.carregarVidaNotarial = carregarVidaNotarial;
  window.limparVidaNotarial = limparVidaNotarial;
})();
