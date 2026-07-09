'use strict';

/* estatisticas.js - Estatísticas de escrituras (ES5)
   Levas 2-5: filtro de período, quebras por tipo e por escrevente, gráficos
   Chart.js (barras + evolução mensal com filtro por tipo). Tabela 745.

   Convenções desta página:
   - Datas date-only tratadas como string 'YYYY-MM-DD' em comparação, validação
     e agrupamento; nunca new Date() (bug de fuso UTC-3 documentado no projeto).
   - Proibido em-dash neste arquivo (nem o caractere, nem o escape unicode);
     separador em strings: hífen simples ou '·'.
*/

var API_BASE = '/api/baserow';

var CONFIG = {
  tables: {
    controle: 745,
    tipagem: 746   // catálogo de tipos de escritura (seletor da evolução mensal)
  },
  fields: {
    tipoEscritura: 'field_7194',  // link_row -> 746; valor chega como [{id, value}]
    escrevente: 'field_7198',     // link_row -> 747; valor chega como [{id, value}]
    data: 'field_7226'            // date-only, string 'YYYY-MM-DD'
  }
};

/* Estado de módulo - último período buscado e linhas cruas (reutilizados nas Levas 3/4) */
var periodoAtual = null;      // { dataInicio: 'YYYY-MM-DD', dataFim: 'YYYY-MM-DD' }
var escriturasAtuais = [];
var escreventesAgregados = null;  // mapa nome -> { total, tipos: { tipoNome: N } } (Leva 3)
var charts = { tipos: null, mensal: null, escreventes: null };  // instâncias Chart.js (Leva 4)

/* ---------- HELPERS ---------- */

function apiHeaders() {
  return { 'Content-Type': 'application/json' };
}

function mostrarMsg(tipo, texto) {
  var el = document.getElementById('msgBox');
  if (!el) return;
  el.className = 'msg-box ' + tipo;
  el.innerHTML = texto;
  el.style.display = 'flex';
}

function esconderMsg() {
  var el = document.getElementById('msgBox');
  if (!el) return;
  el.style.display = 'none';
  el.className = 'msg-box';
  el.innerHTML = '';
}

function mostrarOverlay() {
  var el = document.getElementById('overlay');
  if (el) el.classList.add('active');
}

function esconderOverlay() {
  var el = document.getElementById('overlay');
  if (el) el.classList.remove('active');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatarData(dataStr) {
  if (!dataStr) return '-';
  var partes = dataStr.split('-');
  if (partes.length !== 3) return dataStr;
  return partes[2] + '/' + partes[1] + '/' + partes[0];
}

function formatarDecimal(num) {
  return num.toFixed(1).replace('.', ',');
}

/* ---------- VALIDAÇÃO ---------- */

function validarPeriodo(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) {
    mostrarMsg('error', '<i class="ph ph-x-circle"></i> Informe a data de início e a data de fim.');
    return false;
  }
  // Comparação por string: 'YYYY-MM-DD' ordena lexicograficamente igual à cronologia.
  if (dataInicio > dataFim) {
    mostrarMsg('error', '<i class="ph ph-x-circle"></i> A data de fim deve ser igual ou posterior à data de início.');
    return false;
  }
  // Decisão registrada: SEM limite máximo de intervalo (difere do relatório de
  // certidões, que trava em 365 dias) - estatísticas plurianuais são caso de
  // uso legítimo desta página.
  return true;
}

/* ---------- PRESET ---------- */

function aplicarAnoCorrente() {
  var ano = new Date().getFullYear();
  document.getElementById('dataInicio').value = ano + '-01-01';
  document.getElementById('dataFim').value = ano + '-12-31';
  gerarEstatisticas();
}

/* ---------- BUSCA PAGINADA ---------- */

function buscarEscrituras(dataInicio, dataFim) {
  // Observação de domínio: linhas da 745 com field_7226 vazio não passam pelo
  // filtro de data e ficam naturalmente fora das estatísticas (comportamento aceito).
  var acumulado = [];

  function buscarPagina(pagina) {
    var url = API_BASE + '/database/rows/table/' + CONFIG.tables.controle + '/'
      + '?user_field_names=false'
      + '&filter__' + CONFIG.fields.data + '__date_after_or_equal=' + encodeURIComponent(dataInicio)
      + '&filter__' + CONFIG.fields.data + '__date_before_or_equal=' + encodeURIComponent(dataFim)
      + '&page_size=200'
      + '&page=' + pagina;

    return fetch(url, { headers: apiHeaders() })
      .then(function(r) {
        if (!r.ok) throw new Error('Erro ao buscar escrituras');
        return r.json();
      })
      .then(function(data) {
        var resultados = data.results || [];
        for (var i = 0; i < resultados.length; i++) {
          acumulado.push(resultados[i]);
        }
        if (data.next) {
          return buscarPagina(pagina + 1);
        }
        return acumulado;
      });
  }

  return buscarPagina(1);
}

/* ---------- AGREGAÇÃO ---------- */

function agregarPorTipo(escrituras) {
  var contagem = {};
  for (var i = 0; i < escrituras.length; i++) {
    var arr = escrituras[i][CONFIG.fields.tipoEscritura];
    var chave = (arr && arr.length > 0 && arr[0].value) ? arr[0].value : 'Sem tipo';
    contagem[chave] = (contagem[chave] || 0) + 1;
  }

  var lista = [];
  for (var tipo in contagem) {
    if (Object.prototype.hasOwnProperty.call(contagem, tipo)) {
      lista.push({ tipo: tipo, quantidade: contagem[tipo] });
    }
  }
  // Quantidade decrescente; empate resolve por ordem alfabética pt-BR.
  // Sem zero-fill da tabela 746: só aparecem tipos com contagem > 0 (decisão registrada).
  lista.sort(function(a, b) {
    if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade;
    return a.tipo.localeCompare(b.tipo, 'pt-BR');
  });

  return { total: escrituras.length, porTipo: lista };
}

/* ---------- RENDER ---------- */

function calcularMeses(dataInicio, dataFim) {
  // Aritmética por string ('YYYY-MM-DD' -> ano/mês via split), sem new Date().
  var pi = dataInicio.split('-');
  var pf = dataFim.split('-');
  var anoInicio = parseInt(pi[0], 10);
  var mesInicio = parseInt(pi[1], 10);
  var anoFim = parseInt(pf[0], 10);
  var mesFim = parseInt(pf[1], 10);
  return (anoFim - anoInicio) * 12 + (mesFim - mesInicio) + 1;
}

function renderizarCards(agregado, dataInicio, dataFim) {
  var container = document.getElementById('cardsResumo');
  if (!container) return;

  var meses = calcularMeses(dataInicio, dataFim);
  var media = meses > 0 ? (agregado.total / meses) : 0;
  var lider = agregado.porTipo.length > 0 ? agregado.porTipo[0] : null;
  var liderHtml = lider
    ? escapeHtml(lider.tipo) + ' (' + lider.quantidade + ')'
    : '-';

  var html = '';
  html += '<div class="stat-card">';
  html += '<div class="stat-label">Total de escrituras</div>';
  html += '<div class="stat-value">' + agregado.total + '</div>';
  html += '</div>';
  html += '<div class="stat-card">';
  html += '<div class="stat-label">Tipo mais frequente</div>';
  html += '<div class="stat-value stat-value-menor">' + liderHtml + '</div>';
  html += '</div>';
  html += '<div class="stat-card">';
  html += '<div class="stat-label">Média mensal</div>';
  html += '<div class="stat-value">' + formatarDecimal(media) + '</div>';
  html += '</div>';

  container.innerHTML = html;
  container.style.display = 'grid';
}

/* Monta uma .report-table genérica (células já devem chegar escapadas) */
function montarTabela(cabecalhos, linhas, rodape) {
  var html = '<div class="table-wrapper"><table class="report-table">';
  html += '<thead><tr>';
  for (var i = 0; i < cabecalhos.length; i++) {
    html += '<th>' + cabecalhos[i] + '</th>';
  }
  html += '</tr></thead>';
  html += '<tbody>';
  for (var j = 0; j < linhas.length; j++) {
    html += '<tr>';
    for (var k = 0; k < linhas[j].length; k++) {
      html += '<td>' + linhas[j][k] + '</td>';
    }
    html += '</tr>';
  }
  html += '</tbody>';
  if (rodape) {
    html += '<tfoot><tr>';
    for (var m = 0; m < rodape.length; m++) {
      html += '<td>' + rodape[m] + '</td>';
    }
    html += '</tr></tfoot>';
  }
  html += '</table></div>';
  return html;
}

function renderizarTabela(agregado, dataInicio, dataFim) {
  var card = document.getElementById('cardTipos');
  var titulo = document.getElementById('tituloTipos');
  var container = document.getElementById('tabelaTipos');
  if (!container) return;

  if (titulo) {
    titulo.innerHTML = '<i class="ph ph-list-numbers"></i> Escrituras por tipo · '
      + formatarData(dataInicio) + ' a ' + formatarData(dataFim);
  }

  var linhas = [];
  for (var i = 0; i < agregado.porTipo.length; i++) {
    var item = agregado.porTipo[i];
    var pct = agregado.total > 0 ? (item.quantidade * 100 / agregado.total) : 0;
    linhas.push([escapeHtml(item.tipo), item.quantidade, formatarDecimal(pct) + '%']);
  }

  container.innerHTML = montarTabela(
    ['Tipo de escritura', 'Quantidade', '% do total'],
    linhas,
    ['Total', agregado.total, '100,0%']
  );
  if (card) card.style.display = 'block';
}

/* ---------- POR ESCREVENTE (Estatística 1) ---------- */

var ROTULO_SEM_ATRIBUICAO = 'Sem atribuição';

function agregarPorEscrevente(escrituras) {
  // Credita a escritura a CADA escrevente presente no field_7198: a UI do
  // Controle grava um único escrevente, mas o campo é link_row e dados
  // legados podem ter múltiplos - nesse caso a soma das linhas do comparativo
  // pode exceder o total do período (comportamento aceito e documentado).
  var mapa = {};
  for (var i = 0; i < escrituras.length; i++) {
    var row = escrituras[i];
    var arrEsc = row[CONFIG.fields.escrevente];
    var nomes = [];
    if (arrEsc && arrEsc.length > 0) {
      for (var j = 0; j < arrEsc.length; j++) {
        if (arrEsc[j].value) nomes.push(arrEsc[j].value);
      }
    }
    if (nomes.length === 0) nomes.push(ROTULO_SEM_ATRIBUICAO);

    var arrTipo = row[CONFIG.fields.tipoEscritura];
    var tipo = (arrTipo && arrTipo.length > 0 && arrTipo[0].value) ? arrTipo[0].value : 'Sem tipo';

    for (var k = 0; k < nomes.length; k++) {
      var nome = nomes[k];
      if (!mapa[nome]) mapa[nome] = { total: 0, tipos: {} };
      mapa[nome].total += 1;
      mapa[nome].tipos[tipo] = (mapa[nome].tipos[tipo] || 0) + 1;
    }
  }
  return mapa;
}

function listarEscreventesOrdenados(mapa) {
  var lista = [];
  for (var nome in mapa) {
    if (Object.prototype.hasOwnProperty.call(mapa, nome)) {
      lista.push({ nome: nome, total: mapa[nome].total });
    }
  }
  lista.sort(function(a, b) {
    if (b.total !== a.total) return b.total - a.total;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
  return lista;
}

function renderEscreventes(mapa, totalPeriodo) {
  var container = document.getElementById('tabelaEscreventes');
  if (!container) return;

  var lista = listarEscreventesOrdenados(mapa);

  var linhas = [];
  for (var i = 0; i < lista.length; i++) {
    var pct = totalPeriodo > 0 ? (lista[i].total * 100 / totalPeriodo) : 0;
    linhas.push([escapeHtml(lista[i].nome), lista[i].total, formatarDecimal(pct) + '%']);
  }

  container.innerHTML = montarTabela(
    ['Escrevente', 'Quantidade', '% do total'],
    linhas,
    ['Total do período', totalPeriodo, '100,0%']
  );
}

function popularSelectEscreventes(mapa) {
  var sel = document.getElementById('selEscrevente');
  if (!sel) return;

  var nomes = [];
  for (var nome in mapa) {
    if (Object.prototype.hasOwnProperty.call(mapa, nome) && nome !== ROTULO_SEM_ATRIBUICAO) {
      nomes.push(nome);
    }
  }
  nomes.sort(function(a, b) { return a.localeCompare(b, 'pt-BR'); });
  // "Sem atribuição" sempre por último no select, se existir
  if (Object.prototype.hasOwnProperty.call(mapa, ROTULO_SEM_ATRIBUICAO)) {
    nomes.push(ROTULO_SEM_ATRIBUICAO);
  }

  sel.innerHTML = '<option value="">Selecione...</option>';
  for (var i = 0; i < nomes.length; i++) {
    var opt = document.createElement('option');
    opt.value = nomes[i];
    opt.textContent = nomes[i];
    sel.appendChild(opt);
  }
}

function renderDetalheEscrevente(nomeEscrevente) {
  var container = document.getElementById('tabelaTiposEscrevente');
  if (!container) return;
  if (!escreventesAgregados || !Object.prototype.hasOwnProperty.call(escreventesAgregados, nomeEscrevente)) {
    container.style.display = 'none';
    return;
  }

  var dados = escreventesAgregados[nomeEscrevente];
  var lista = [];
  for (var tipo in dados.tipos) {
    if (Object.prototype.hasOwnProperty.call(dados.tipos, tipo)) {
      lista.push({ tipo: tipo, quantidade: dados.tipos[tipo] });
    }
  }
  lista.sort(function(a, b) {
    if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade;
    return a.tipo.localeCompare(b.tipo, 'pt-BR');
  });

  var linhas = [];
  for (var i = 0; i < lista.length; i++) {
    var pct = dados.total > 0 ? (lista[i].quantidade * 100 / dados.total) : 0;
    linhas.push([escapeHtml(lista[i].tipo), lista[i].quantidade, formatarDecimal(pct) + '%']);
  }

  container.innerHTML = montarTabela(
    ['Tipo de escritura', 'Quantidade', '% do escrevente'],
    linhas,
    ['Total', dados.total, '100,0%']
  );
  container.style.display = 'block';
}

function resetarDetalheEscrevente() {
  var sel = document.getElementById('selEscrevente');
  if (sel) sel.value = '';
  var container = document.getElementById('tabelaTiposEscrevente');
  if (container) {
    container.style.display = 'none';
    container.innerHTML = '';
  }
}

/* ---------- GRÁFICOS (Leva 4 - Chart.js vendorado) ---------- */

/* O canvas não resolve var() do CSS - materializa o valor do token no momento
   da construção dos gráficos, refletindo o tema vigente */
function token(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

/* Dataset de barras padrão (paleta monocromática ink - decisão registrada:
   todas as barras em --accent, distinção pelos rótulos, estética shadcn) */
function datasetBase(valores) {
  return {
    data: valores,
    backgroundColor: token('--accent'),
    hoverBackgroundColor: token('--accent-hover'),
    borderRadius: 6,
    borderSkipped: false,
    maxBarThickness: 28
  };
}

/* Opções compartilhadas dos três gráficos (grid só no eixo de valores,
   tooltip no estilo do sistema, sem legenda) */
function opcoesBase(horizontal, labelCallback) {
  var corGrid = token('--border');
  var corTicks = token('--text-muted');
  var eixoValores = {
    beginAtZero: true,
    grid: { color: corGrid },
    border: { display: false },
    ticks: { color: corTicks, precision: 0 }
  };
  var eixoCategorias = {
    grid: { display: false },
    border: { display: false },
    ticks: { color: corTicks }
  };
  return {
    indexAxis: horizontal ? 'y' : 'x',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: token('--surface'),
        borderColor: corGrid,
        borderWidth: 1,
        titleColor: token('--text-dark'),
        bodyColor: token('--text-main'),
        cornerRadius: 8,
        displayColors: false,
        padding: 10,
        callbacks: { label: labelCallback }
      }
    },
    scales: horizontal
      ? { x: eixoValores, y: eixoCategorias }
      : { x: eixoCategorias, y: eixoValores }
  };
}

function destruirGraficos() {
  var chaves = ['tipos', 'mensal', 'escreventes'];
  for (var i = 0; i < chaves.length; i++) {
    if (charts[chaves[i]]) {
      charts[chaves[i]].destroy();
      charts[chaves[i]] = null;
    }
  }
}

function construirChartTipos(agregado) {
  var canvas = document.getElementById('chartTipos');
  if (!canvas) return;

  // Top 10 + "Outros": com mais de 10 tipos, as posições 11+ viram uma única
  // barra agregada "Outros (N tipos)"; com 10 ou menos, sem agregação
  var itens = agregado.porTipo;
  var rotulos = [];
  var valores = [];
  if (itens.length > 10) {
    var somaOutros = 0;
    for (var i = 0; i < itens.length; i++) {
      if (i < 10) {
        rotulos.push(itens[i].tipo);
        valores.push(itens[i].quantidade);
      } else {
        somaOutros += itens[i].quantidade;
      }
    }
    rotulos.push('Outros (' + (itens.length - 10) + ' tipos)');
    valores.push(somaOutros);
  } else {
    for (var j = 0; j < itens.length; j++) {
      rotulos.push(itens[j].tipo);
      valores.push(itens[j].quantidade);
    }
  }

  var total = agregado.total;
  charts.tipos = new window.Chart(canvas, {
    type: 'bar',
    data: { labels: rotulos, datasets: [datasetBase(valores)] },
    options: opcoesBase(true, function(context) {
      var qtd = context.parsed.x;
      var pct = total > 0 ? (qtd * 100 / total) : 0;
      return qtd + ' escritura(s) · ' + formatarDecimal(pct) + '%';
    })
  });
}

/* Contagem por mês via slice da string 'YYYY-MM-DD' (nunca new Date()).
   tipoId null = todas as linhas; com id, casa por row[tipo][0].id - o id é
   estável a renomeações do tipo (nunca casar pelo nome) */
function contarPorMes(escrituras, tipoId) {
  var porMes = {};
  for (var i = 0; i < escrituras.length; i++) {
    var row = escrituras[i];
    if (tipoId !== null) {
      var arrT = row[CONFIG.fields.tipoEscritura];
      if (!arrT || arrT.length === 0 || arrT[0].id !== tipoId) continue;
    }
    var dataStr = row[CONFIG.fields.data];
    if (!dataStr) continue;
    var mes = String(dataStr).slice(0, 7);
    porMes[mes] = (porMes[mes] || 0) + 1;
  }
  return porMes;
}

function construirChartMensal(escrituras, dataInicio, dataFim) {
  var canvas = document.getElementById('chartMensal');
  if (!canvas) return;

  // Seleção do tipo (Leva 5): '' = todos (barras); id da 746 = um tipo (linha)
  var sel = document.getElementById('selTipoEvolucao');
  var selValor = sel ? sel.value : '';
  var tipoId = selValor === '' ? null : parseInt(selValor, 10);
  var nomeTipo = '';
  if (sel && tipoId !== null && sel.selectedIndex >= 0) {
    nomeTipo = sel.options[sel.selectedIndex].textContent;
  }

  var porMes = contarPorMes(escrituras, tipoId);

  // Zero-fill: sequência completa de meses do período por aritmética de
  // inteiros; meses sem ocorrência entram com 0 (um tipo zerado no período
  // inteiro gera linha reta em 0 - informação válida)
  var pi = dataInicio.split('-');
  var pf = dataFim.split('-');
  var ano = parseInt(pi[0], 10);
  var mesNum = parseInt(pi[1], 10);
  var anoFim = parseInt(pf[0], 10);
  var mesFim = parseInt(pf[1], 10);

  var rotulos = [];
  var valores = [];
  while (ano < anoFim || (ano === anoFim && mesNum <= mesFim)) {
    var mesStr = (mesNum < 10 ? '0' : '') + mesNum;
    rotulos.push(mesStr + '/' + ano);
    valores.push(porMes[ano + '-' + mesStr] || 0);
    mesNum += 1;
    if (mesNum > 12) {
      mesNum = 1;
      ano += 1;
    }
  }

  // Troca barras<->linha é sempre destroy + instância nova (nunca mutar o
  // type de uma instância viva); necessário também no change do seletor
  if (charts.mensal) {
    charts.mensal.destroy();
    charts.mensal = null;
  }

  var config;
  if (tipoId === null) {
    config = {
      type: 'bar',
      data: { labels: rotulos, datasets: [datasetBase(valores)] },
      options: opcoesBase(false, function(context) {
        return context.parsed.y + ' escritura(s)';
      })
    };
  } else {
    config = {
      type: 'line',
      data: {
        labels: rotulos,
        datasets: [{
          data: valores,
          borderColor: token('--accent'),
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          backgroundColor: token('--accent-soft'),
          pointRadius: 3,
          pointBackgroundColor: token('--accent'),
          pointBorderColor: token('--surface')
        }]
      },
      options: opcoesBase(false, function(context) {
        return nomeTipo + ': ' + context.parsed.y + ' escritura(s)';
      })
    };
  }

  charts.mensal = new window.Chart(canvas, config);
}

function construirChartEscreventes(mapa, totalPeriodo) {
  var canvas = document.getElementById('chartEscreventes');
  if (!canvas) return;

  var lista = listarEscreventesOrdenados(mapa);
  var rotulos = [];
  var valores = [];
  for (var i = 0; i < lista.length; i++) {
    rotulos.push(lista[i].nome);
    valores.push(lista[i].total);
  }

  charts.escreventes = new window.Chart(canvas, {
    type: 'bar',
    data: { labels: rotulos, datasets: [datasetBase(valores)] },
    options: opcoesBase(true, function(context) {
      var qtd = context.parsed.x;
      var pct = totalPeriodo > 0 ? (qtd * 100 / totalPeriodo) : 0;
      return qtd + ' escritura(s) · ' + formatarDecimal(pct) + '%';
    })
  });
}

function construirGraficos(agregado, escrituras, dataInicio, dataFim) {
  // Guarda de disponibilidade: sem o vendor, a página segue só com as tabelas
  if (typeof window.Chart === 'undefined') {
    console.warn('Chart.js indisponivel - exibindo somente tabelas');
    return;
  }
  window.Chart.defaults.font.family = token('--font-family-base');
  destruirGraficos();
  construirChartTipos(agregado);
  construirChartMensal(escrituras, dataInicio, dataFim);
  construirChartEscreventes(escreventesAgregados, agregado.total);
}

/* Catálogo de tipos para o seletor da evolução mensal (Leva 5).
   Executa uma vez no DOMContentLoaded - o catálogo independe do período.
   Premissa: a 746 é catálogo pequeno (~57 linhas hoje), size=200 cobre com
   folga (mesma premissa do controle.js) */
function carregarTiposEvolucao() {
  var sel = document.getElementById('selTipoEvolucao');
  if (!sel) return;

  fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.tipagem + '/?user_field_names=true&size=200', {
    headers: apiHeaders()
  })
    .then(function(r) {
      if (!r.ok) throw new Error('Erro ao carregar tipos de escritura');
      return r.json();
    })
    .then(function(data) {
      var rows = data.results || [];
      rows.sort(function(a, b) {
        var tipoA = a['Tipo'] || '';
        var tipoB = b['Tipo'] || '';
        return tipoA.localeCompare(tipoB, 'pt-BR');
      });
      for (var i = 0; i < rows.length; i++) {
        var opt = document.createElement('option');
        opt.value = rows[i].id;
        opt.textContent = rows[i]['Tipo'] || ('ID ' + rows[i].id);
        sel.appendChild(opt);
      }
    })
    .catch(function(e) {
      // Sem catálogo: o seletor some e a evolução segue no modo "Todos" (barras)
      console.warn('Tipos da 746 indisponiveis - seletor de tipo oculto.', e);
      var grupo = document.getElementById('grupoTipoEvolucao');
      if (grupo) grupo.style.display = 'none';
    });
}

function esconderResultados() {
  var cards = document.getElementById('cardsResumo');
  var cardMensal = document.getElementById('cardMensal');
  var cardTipos = document.getElementById('cardTipos');
  var secaoEsc = document.getElementById('secaoEscreventes');
  if (cards) cards.style.display = 'none';
  if (cardMensal) cardMensal.style.display = 'none';
  if (cardTipos) cardTipos.style.display = 'none';
  if (secaoEsc) secaoEsc.style.display = 'none';
  resetarDetalheEscrevente();
  destruirGraficos();
}

function esconderEstadoInicial() {
  var el = document.getElementById('cardEstadoInicial');
  if (el) el.style.display = 'none';
}

/* ---------- FLUXO PRINCIPAL ---------- */

function gerarEstatisticas() {
  var dataInicio = document.getElementById('dataInicio').value;
  var dataFim = document.getElementById('dataFim').value;

  esconderMsg();
  if (!validarPeriodo(dataInicio, dataFim)) return;

  var btn = document.getElementById('btnBuscar');
  btn.disabled = true;
  mostrarOverlay();

  buscarEscrituras(dataInicio, dataFim)
    .then(function(escrituras) {
      periodoAtual = { dataInicio: dataInicio, dataFim: dataFim };
      escriturasAtuais = escrituras;
      esconderEstadoInicial();

      var agregado = agregarPorTipo(escrituras);
      if (agregado.total === 0) {
        esconderResultados();
        mostrarMsg('info', '<i class="ph ph-info"></i> Nenhuma escritura lavrada no período selecionado.');
        return;
      }
      renderizarCards(agregado, dataInicio, dataFim);
      renderizarTabela(agregado, dataInicio, dataFim);

      // Estatística 1 - por escrevente (sem fetch novo: agrega as linhas já baixadas)
      escreventesAgregados = agregarPorEscrevente(escrituras);
      renderEscreventes(escreventesAgregados, agregado.total);
      popularSelectEscreventes(escreventesAgregados);
      resetarDetalheEscrevente(); // nova busca nunca herda seleção/detalhe anterior
      var secaoEsc = document.getElementById('secaoEscreventes');
      if (secaoEsc) secaoEsc.style.display = 'block';

      // Leva 4 - gráficos por último, com os cards já visíveis (o Chart.js
      // precisa medir as dimensões reais dos containers)
      var cardMensal = document.getElementById('cardMensal');
      if (cardMensal) cardMensal.style.display = 'block';
      construirGraficos(agregado, escrituras, dataInicio, dataFim);
    })
    .catch(function(e) {
      console.error(e);
      esconderResultados();
      mostrarMsg('error', '<i class="ph ph-x-circle"></i> ' + (e.message || 'Erro ao consultar.'));
    })
    .then(function() {
      esconderOverlay();
      btn.disabled = false;
    });
}

/* ---------- INIT ---------- */

document.addEventListener('DOMContentLoaded', function() {
  var btnBuscar = document.getElementById('btnBuscar');
  if (btnBuscar) {
    btnBuscar.addEventListener('click', gerarEstatisticas);
  }

  var btnAno = document.getElementById('btnAnoCorrente');
  if (btnAno) {
    btnAno.addEventListener('click', aplicarAnoCorrente);
  }

  carregarTiposEvolucao();

  var selTipo = document.getElementById('selTipoEvolucao');
  if (selTipo) {
    selTipo.addEventListener('change', function() {
      // Reconstrói somente o gráfico mensal, sem refazer busca nem os demais.
      // Sem resultados na tela (nenhuma busca ainda, zero resultados ou erro),
      // o change não faz nada. Decisão registrada: nova busca PRESERVA o tipo
      // selecionado (o catálogo da 746 independe do período), diferente do
      // reset do detalhe de escrevente da Leva 3.
      if (!periodoAtual || typeof window.Chart === 'undefined') return;
      var card = document.getElementById('cardMensal');
      if (!card || card.style.display === 'none') return;
      construirChartMensal(escriturasAtuais, periodoAtual.dataInicio, periodoAtual.dataFim);
    });
  }

  var selEsc = document.getElementById('selEscrevente');
  if (selEsc) {
    selEsc.addEventListener('change', function() {
      if (!this.value) {
        var det = document.getElementById('tabelaTiposEscrevente');
        if (det) det.style.display = 'none';
      } else {
        renderDetalheEscrevente(this.value);
      }
    });
  }

  // Sidebar overlay (padrão das páginas de relatório)
  var overlayEl = document.querySelector('.sidebar-overlay');
  if (overlayEl) {
    overlayEl.addEventListener('click', toggleSidebar);
  }
});
