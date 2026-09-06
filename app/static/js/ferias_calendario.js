/* ferias_calendario.js - Barras de ferias no calendario (/calendario).
   IIFE ES5 estrito; expoe apenas window.FeriasCalendario.renderizarDia e nao
   redeclara nenhuma global de calendario.js (API_BASE, CONFIG, mesAtual,
   anoAtual, todosProtocolos, pad, renderizarCalendario).

   Carga unica de GET /api/ferias/calendario (aberto aos tres perfis) no
   DOMContentLoaded, em paralelo com a carga dos protocolos. As barras sao
   desenhadas por celula pelo gancho de renderizarCalendario, logo abaixo do
   numero do dia: ficam acima dos protocolos e fora do limite de 3 eventos.
   Blocos sobrepostos ganham pistas por semana (first-fit), com espacadores
   nas celulas em que a pista esta vazia, para as barras ficarem alinhadas
   entre as celulas da mesma semana. Tudo em memoria, sem fetch por mes.

   Convencoes: datas 'YYYY-MM-DD' comparadas por string; new Date so a partir
   de partes (deslocamento da semana e dias do mes, igual ao calendario.js);
   DOM por createElement/textContent; a cor so entra no style apos passar no
   regex #RRGGBB. Se a API falhar, so console.warn: o calendario de protocolos
   nunca quebra por causa das ferias. Zero em-dash neste arquivo.

   Gancho de teste: se window.__FERIAS_TESTE__ existir (array de blocos no
   formato da API), o modulo usa esses dados no lugar do fetch; usado por
   p/Ferias/leva4_pistas_check.html e pelo harness JScript da validacao. */
(function() {
  'use strict';

  var API_CALENDARIO = '/api/ferias/calendario';
  var COR_RE = /^#[0-9A-Fa-f]{6}$/;
  var COR_TEXTO_ESCURO = '#111827';
  var COR_TEXTO_CLARO = '#FFFFFF';
  var SUFIXO_ROTULO = ' - Férias';

  /* ---------- Estado ---------- */

  var blocos = [];
  var podeGerir = false;
  var carregado = false;
  var cacheMes = {};

  /* ---------- Helpers ---------- */

  function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  /* mes e 0-based (convencao do calendario.js: mesAtual). */
  function chaveDia(ano, mes, dia) {
    return ano + '-' + pad2(mes + 1) + '-' + pad2(dia);
  }

  function formatarBR(iso) {
    var partes = String(iso || '').split('-');
    if (partes.length < 3) return String(iso || '');
    return partes[2] + '/' + partes[1] + '/' + partes[0];
  }

  /* Cor do texto sobre o fundo da barra, por luminancia YIQ. */
  function corTexto(hex) {
    var r = parseInt(hex.substr(1, 2), 16);
    var g = parseInt(hex.substr(3, 2), 16);
    var b = parseInt(hex.substr(5, 2), 16);
    var yiq = (299 * r + 587 * g + 114 * b) / 1000;
    return yiq >= 150 ? COR_TEXTO_ESCURO : COR_TEXTO_CLARO;
  }

  function compararBlocos(a, b) {
    if (a.inicio < b.inicio) return -1;
    if (a.inicio > b.inicio) return 1;
    var na = String(a.nome || '').toLowerCase();
    var nb = String(b.nome || '').toLowerCase();
    if (na < nb) return -1;
    if (na > nb) return 1;
    return 0;
  }

  function blocoCobre(bloco, chave) {
    return bloco.inicio <= chave && chave <= bloco.fim;
  }

  /* Sobreposicao entre o bloco e algum bloco ja na pista, considerando so o
     trecho de cada um que cai dentro da semana [ini, fim]. */
  function conflitaNaSemana(pista, bloco, ini, fim) {
    var bIni = bloco.inicio > ini ? bloco.inicio : ini;
    var bFim = bloco.fim < fim ? bloco.fim : fim;
    for (var i = 0; i < pista.length; i++) {
      var o = pista[i];
      var oIni = o.inicio > ini ? o.inicio : ini;
      var oFim = o.fim < fim ? o.fim : fim;
      if (bIni <= oFim && bFim >= oIni) return true;
    }
    return false;
  }

  /* ---------- Pistas por semana (memoizado por mes) ---------- */

  function prepararMes(ano, mes) {
    var chaveMes = ano + '-' + pad2(mes + 1);
    if (cacheMes[chaveMes]) return cacheMes[chaveMes];

    var primeiroDia = new Date(ano, mes, 1).getDay();
    var deslocamento = primeiroDia === 0 ? 6 : primeiroDia - 1;
    var diasNoMes = new Date(ano, mes + 1, 0).getDate();
    var numSemanas = Math.ceil((deslocamento + diasNoMes) / 7);
    var semanas = [];

    for (var w = 0; w < numSemanas; w++) {
      var d1 = Math.max(1, w * 7 - deslocamento + 1);
      var d2 = Math.min(diasNoMes, (w + 1) * 7 - deslocamento);
      var ini = chaveDia(ano, mes, d1);
      var fim = chaveDia(ano, mes, d2);

      var daSemana = [];
      for (var i = 0; i < blocos.length; i++) {
        var b = blocos[i];
        if (b.inicio <= fim && b.fim >= ini) daSemana.push(b);
      }
      daSemana.sort(compararBlocos);

      var pistas = [];
      for (var j = 0; j < daSemana.length; j++) {
        var bloco = daSemana[j];
        var colocado = false;
        for (var k = 0; k < pistas.length && !colocado; k++) {
          if (!conflitaNaSemana(pistas[k], bloco, ini, fim)) {
            pistas[k].push(bloco);
            colocado = true;
          }
        }
        if (!colocado) pistas.push([bloco]);
      }
      semanas.push({ pistas: pistas });
    }

    var prep = { deslocamento: deslocamento, diasNoMes: diasNoMes, semanas: semanas };
    cacheMes[chaveMes] = prep;
    return prep;
  }

  function semanaDoDia(prep, dia) {
    return Math.floor((prep.deslocamento + dia - 1) / 7);
  }

  /* 0 = segunda ... 6 = domingo */
  function posicaoNaSemana(prep, dia) {
    return (prep.deslocamento + dia - 1) % 7;
  }

  /* ---------- Render por celula ---------- */

  function criarBarra(bloco, chave, pos) {
    var el = document.createElement(podeGerir ? 'a' : 'span');
    if (podeGerir) el.href = '/ferias?funcionario=' + parseInt(bloco.funcionario_id, 10);

    var classes = 'cal-ferias';
    if (chave === bloco.inicio) classes += ' cal-ferias-inicio';
    if (chave === bloco.fim) classes += ' cal-ferias-fim';
    if (pos === 0) classes += ' cal-ferias-seg-ini';
    if (pos === 6) classes += ' cal-ferias-seg-fim';
    el.className = classes;

    var nome = String(bloco.nome || '');
    el.title = nome + SUFIXO_ROTULO + ' · ' + formatarBR(bloco.inicio) + ' a ' + formatarBR(bloco.fim);

    var cor = String(bloco.cor || '');
    if (COR_RE.test(cor)) {
      el.style.backgroundColor = cor;
      el.style.color = corTexto(cor);
    }

    el.textContent = (chave === bloco.inicio || pos === 0) ? nome + SUFIXO_ROTULO : '';
    return el;
  }

  function renderizarDia(cell, ano, mes, dia) {
    if (!carregado || !cell) return;
    var prep = prepararMes(ano, mes);
    var semana = prep.semanas[semanaDoDia(prep, dia)];
    if (!semana || !semana.pistas.length) return;

    var pos = posicaoNaSemana(prep, dia);
    var chave = chaveDia(ano, mes, dia);

    for (var i = 0; i < semana.pistas.length; i++) {
      var pista = semana.pistas[i];
      var achado = null;
      for (var j = 0; j < pista.length; j++) {
        if (blocoCobre(pista[j], chave)) {
          achado = pista[j];
          break;
        }
      }
      if (achado) {
        cell.appendChild(criarBarra(achado, chave, pos));
      } else {
        var vazio = document.createElement('span');
        vazio.className = 'cal-ferias-vazio';
        cell.appendChild(vazio);
      }
    }
  }

  /* ---------- Carga ---------- */

  function aplicarDados(json) {
    blocos = (json && json.blocos) ? json.blocos : [];
    podeGerir = !!(json && json.pode_gerir);
    carregado = true;
    cacheMes = {};
    /* Se a grade ja foi desenhada (protocolos chegaram antes), redesenha com
       as barras; senao o render dos protocolos vai encontrar os dados prontos. */
    if (document.querySelector('#calGrid .cal-cell') && typeof window.renderizarCalendario === 'function') {
      window.renderizarCalendario();
    }
  }

  function carregar() {
    if (window.__FERIAS_TESTE__) {
      aplicarDados({ ok: true, blocos: window.__FERIAS_TESTE__, pode_gerir: false }); return;
    }
    fetch(API_CALENDARIO, { headers: { 'Content-Type': 'application/json' } })
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(json) {
        if (!json || !json.ok) throw new Error(json && json.erro ? json.erro : 'Resposta inválida.');
        aplicarDados(json);
      })
      .then(null, function(e) {
        if (window.console && window.console.warn) {
          window.console.warn('Férias no calendário indisponíveis: ' + (e && e.message ? e.message : e));
        }
      });
  }

  window.FeriasCalendario = { renderizarDia: renderizarDia };

  document.addEventListener('DOMContentLoaded', carregar);
})();
