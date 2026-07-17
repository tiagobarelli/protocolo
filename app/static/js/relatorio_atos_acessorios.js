'use strict';

/* relatorio_atos_acessorios.js - Card "Atos acessorios" do Relatorio de Controle de Atos (ES5).
   IIFE que expoe apenas window.AtosAcessorios; consumido pelo hook de consultarLivro em
   relatorio_controle_atos.js (carregado antes), de onde reutiliza os helpers globais:
   apiHeaders, formatarData, obterValorLinkRow, obterValorSelect, badgeContagemAnexos,
   celulaBloqueio e consultarBloqueios. Nunca rejeita nem lanca: qualquer falha degrada
   graciosamente (console.warn) para nao contaminar o catch da busca principal. */

(function() {

  var FONTES = [
    {
      tipo: 'Retificação',
      url: '/retificacoes',
      tabela: 753,
      livro: 'field_7228',
      pagina: 'field_7229',
      data: 'field_7234',
      vinculado: 'field_7231',
      escrevente: 'field_7235',
      anotado: 'field_7321'
    },
    {
      tipo: 'Substabelecimento',
      url: '/substabelecimentos',
      tabela: 762,
      livro: 'field_7322',
      pagina: 'field_7323',
      data: 'field_7327',
      vinculado: 'field_7325',
      escrevente: 'field_7328',
      anotado: 'field_7329'
    },
    {
      tipo: 'Revogação',
      url: '/revogacao-procuracao',
      tabela: 777,
      livro: 'field_7436',
      pagina: 'field_7437',
      data: 'field_7441',
      vinculado: 'field_7435',
      escrevente: 'field_7442',
      anotado: 'field_7445'
    }
  ];

  /* ---------- HELPERS LOCAIS ---------- */

  function escapeHtml(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function obterValoresLinkRow(arr) {
    // Junta todos os valores do link_row com ", " (padrao do relatorio de certidoes).
    // Caso vazio delega ao helper global, que devolve o travessao padrao do relatorio
    // (este arquivo nao pode conter o caractere nem o escape do travessao).
    if (!arr || arr.length === 0) return obterValorLinkRow(arr);
    var vals = [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].value) vals.push(arr[i].value);
    }
    return vals.length > 0 ? vals.join(', ') : obterValorLinkRow([]);
  }

  /* ---------- BUSCA ---------- */

  function buscarFonte(fonte, livro) {
    // Mesma consulta do consultarLivro principal; falha resolve [] (nunca rejeita).
    var url = '/api/baserow/database/rows/table/' + fonte.tabela + '/' +
      '?user_field_names=false' +
      '&filter__' + fonte.livro + '__equal=' + encodeURIComponent(livro) +
      '&order_by=' + fonte.pagina +
      '&size=200';
    return fetch(url, { headers: apiHeaders() })
      .then(function(r) {
        if (!r.ok) { throw new Error('HTTP ' + r.status); }
        return r.json();
      })
      .then(function(data) { return data.results || []; })
      .catch(function(e) {
        console.warn('Atos acessorios: consulta da tabela ' + fonte.tabela + ' indisponivel:', e);
        return [];
      });
  }

  function consultarBloqueiosPorTabela(itens) {
    // Uma consulta em lote por tabela; consultarBloqueios (global) ja resolve {} em falha.
    var idsPorTabela = {};
    for (var i = 0; i < itens.length; i++) {
      var t = itens[i].fonte.tabela;
      if (!idsPorTabela[t]) { idsPorTabela[t] = []; }
      idsPorTabela[t].push(itens[i].row.id);
    }
    var promessas = [];
    for (var f = 0; f < FONTES.length; f++) {
      promessas.push(consultarBloqueios(FONTES[f].tabela, idsPorTabela[FONTES[f].tabela] || []));
    }
    return Promise.all(promessas).then(function(mapas) {
      var porTabela = {};
      for (var m = 0; m < FONTES.length; m++) {
        porTabela[FONTES[m].tabela] = mapas[m] || {};
      }
      return porTabela;
    });
  }

  /* ---------- RENDERIZACAO ---------- */

  function renderizar(livro, itens, contagens, bloqueios) {
    var card = document.getElementById('acessoriosCard');
    var header = document.getElementById('acessoriosHeader');
    var body = document.getElementById('acessoriosBody');
    if (!card || !header || !body) { return; }

    header.innerHTML = '<i class="ph ph-stack"></i> Atos acessórios do Livro ' + livro +
      ' - ' + itens.length + ' registro(s)';

    if (itens.length === 0) {
      body.innerHTML = '<div class="no-results">Nenhum ato acessório (retificação, ' +
        'substabelecimento ou revogação) registrado para o Livro ' + livro + '.</div>';
      card.style.display = 'block';
      return;
    }

    var html = '<div class="table-wrapper"><table class="report-table">';
    html += '<thead><tr>';
    html += '<th class="lock-cell"></th>';
    html += '<th>Página</th>';
    html += '<th>Tipo de ato</th>';
    html += '<th>Data</th>';
    html += '<th>Ato vinculado</th>';
    html += '<th>Escrevente</th>';
    html += '<th>Anotado</th>';
    html += '<th>Anexos</th>';
    html += '<th>Ações</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    for (var i = 0; i < itens.length; i++) {
      var item = itens[i];
      var row = item.row;
      var fonte = item.fonte;
      var pagina = item.pagina;
      var mapaBloqueio = bloqueios[fonte.tabela] || {};
      var href = fonte.url + '?livro=' + encodeURIComponent(livro) +
        '&pagina=' + encodeURIComponent(pagina);

      html += '<tr>';
      html += celulaBloqueio(!!mapaBloqueio[row.id]);
      html += '<td>' + (pagina ? escapeHtml(pagina) : '-') + '</td>';
      html += '<td><span class="badge badge-neutral">' + fonte.tipo + '</span></td>';
      html += '<td>' + formatarData(row[fonte.data]) + '</td>';
      html += '<td>' + escapeHtml(obterValoresLinkRow(row[fonte.vinculado])) + '</td>';
      html += '<td>' + escapeHtml(obterValorLinkRow(row[fonte.escrevente])) + '</td>';
      html += '<td>' + obterValorSelect(row[fonte.anotado], 'Anotação Pendente') + '</td>';
      html += '<td>' + badgeContagemAnexos(pagina, contagens) + '</td>';
      html += '<td><a class="btn-action" href="' + href + '" target="_blank" rel="noopener" title="Abrir registro"><i class="ph ph-arrow-square-out"></i></a></td>';
      html += '</tr>';
    }

    html += '</tbody></table></div>';
    body.innerHTML = html;
    card.style.display = 'block';
  }

  /* ---------- API PUBLICA ---------- */

  function consultar(livro, contagens) {
    // Chamado pelo hook dentro do then de consultarLivro: NUNCA rejeita nem lanca
    // (o catch externo da busca principal mostraria "Erro ao consultar").
    try {
      var card = document.getElementById('acessoriosCard');
      var header = document.getElementById('acessoriosHeader');
      var body = document.getElementById('acessoriosBody');
      if (!card || !header || !body) { return; }

      // Cada consulta parte do zero
      card.style.display = 'none';
      header.innerHTML = '';
      body.innerHTML = '';

      var promessas = [];
      for (var i = 0; i < FONTES.length; i++) {
        promessas.push(buscarFonte(FONTES[i], livro));
      }

      Promise.all(promessas)
        .then(function(listas) {
          var itens = [];
          for (var f = 0; f < FONTES.length; f++) {
            var rows = listas[f] || [];
            for (var r = 0; r < rows.length; r++) {
              itens.push({
                fonte: FONTES[f],
                row: rows[r],
                pagina: rows[r][FONTES[f].pagina] || ''
              });
            }
          }
          // Ordenacao por string da pagina (padding ja garantido; nunca parseInt/new Date)
          itens.sort(function(a, b) {
            if (a.pagina < b.pagina) return -1;
            if (a.pagina > b.pagina) return 1;
            return 0;
          });
          return consultarBloqueiosPorTabela(itens).then(function(bloqueios) {
            renderizar(livro, itens, contagens || {}, bloqueios);
          });
        })
        .catch(function(e) {
          console.warn('Atos acessorios: falha ao montar o card:', e);
        });
    } catch (e) {
      console.warn('Atos acessorios: erro inesperado:', e);
    }
  }

  window.AtosAcessorios = {
    consultar: consultar
  };

})();
