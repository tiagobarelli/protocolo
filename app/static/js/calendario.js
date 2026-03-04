'use strict';

var API_BASE = '/api/baserow';
var CONFIG = {
  tables: { protocolo: 755 },
  fields: {
    protocolo: 'field_7240',
    interessado: 'field_7241',
    status: 'field_7252',
    agendadoPara: 'field_7268'
  },
  statusEmAndamento: 3064
};

var mesAtual = new Date().getMonth();
var anoAtual = new Date().getFullYear();
var todosProtocolos = [];

var MESES = [
  'Janeiro', 'Fevereiro', 'Mar\u00e7o', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

var DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'S\u00e1b', 'Dom'];

/* ── Helpers ── */

function mostrarOverlay() {
  var el = document.getElementById('overlay');
  if (el) el.classList.add('active');
}

function esconderOverlay() {
  var el = document.getElementById('overlay');
  if (el) el.classList.remove('active');
}

function parsearAgendamento(valor) {
  if (!valor) return null;

  // Formato sem hora: "2026-03-15"
  if (valor.indexOf('T') === -1) {
    var partesData = valor.split('-');
    if (partesData.length < 3) return null;
    return {
      ano: parseInt(partesData[0], 10),
      mes: parseInt(partesData[1], 10) - 1,
      dia: parseInt(partesData[2], 10),
      hora: 0,
      minuto: 0,
      temHora: false
    };
  }

  // Formato com hora — Baserow armazena em UTC
  var dt = new Date(valor);
  if (isNaN(dt.getTime())) return null;

  // Meia-noite UTC = Baserow preencheu T00:00:00Z para campo salvo sem hora.
  // Extrair data por string para evitar que UTC-3 desloque o dia para o anterior.
  if (dt.getUTCHours() === 0 && dt.getUTCMinutes() === 0) {
    var dataStr = valor.split('T')[0];
    var dp = dataStr.split('-');
    if (dp.length < 3) return null;
    return {
      ano: parseInt(dp[0], 10),
      mes: parseInt(dp[1], 10) - 1,
      dia: parseInt(dp[2], 10),
      hora: 0,
      minuto: 0,
      temHora: false
    };
  }

  // Hora real — converter UTC → hora local
  return {
    ano: dt.getFullYear(),
    mes: dt.getMonth(),
    dia: dt.getDate(),
    hora: dt.getHours(),
    minuto: dt.getMinutes(),
    temHora: true
  };
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function obterNomeInteressado(campo) {
  if (!campo || !campo.length) return '';
  return campo[0].value || '';
}

/* ── Carregar protocolos ── */

function carregarProtocolos() {
  mostrarOverlay();
  todosProtocolos = [];

  function buscarPagina(pagina) {
    var url = API_BASE + '/database/rows/table/' + CONFIG.tables.protocolo + '/'
      + '?user_field_names=false'
      + '&filter__' + CONFIG.fields.status + '__single_select_equal=' + CONFIG.statusEmAndamento
      + '&page_size=200'
      + '&page=' + pagina;

    return fetch(url, { headers: { 'Content-Type': 'application/json' } })
      .then(function(r) {
        if (!r.ok) throw new Error('Erro ao buscar protocolos');
        return r.json();
      })
      .then(function(data) {
        var resultados = data.results || [];
        for (var i = 0; i < resultados.length; i++) {
          var proto = resultados[i];
          var agendamento = proto[CONFIG.fields.agendadoPara];
          if (agendamento && String(agendamento).trim() !== '') {
            todosProtocolos.push(proto);
          }
        }
        if (data.next) {
          return buscarPagina(pagina + 1);
        }
      });
  }

  buscarPagina(1)
    .then(function() {
      esconderOverlay();
      renderizarCalendario();
    })
    .catch(function(e) {
      esconderOverlay();
      var grid = document.getElementById('calGrid');
      if (grid) {
        grid.innerHTML = '<div style="grid-column:1/-1;padding:32px;text-align:center;color:#ef4444;">'
          + '<i class="ph ph-warning" style="font-size:1.5rem;"></i> '
          + 'Erro ao carregar protocolos: ' + e.message
          + '</div>';
      }
    });
}

/* ── Renderizar calendário ── */

function renderizarCalendario() {
  var tituloEl = document.getElementById('calMesTitulo');
  var grid = document.getElementById('calGrid');
  if (!tituloEl || !grid) return;

  tituloEl.textContent = MESES[mesAtual] + ' ' + anoAtual;
  grid.innerHTML = '';

  // Cabeçalho dos dias da semana
  for (var h = 0; h < DIAS_SEMANA.length; h++) {
    var headerCell = document.createElement('div');
    headerCell.className = 'cal-header-cell';
    headerCell.textContent = DIAS_SEMANA[h];
    grid.appendChild(headerCell);
  }

  // Calcular primeiro dia do mês (0=dom, 1=seg, ...)
  var primeiroDia = new Date(anoAtual, mesAtual, 1).getDay();
  // Ajustar para semana começando na segunda: dom(0)->6, seg(1)->0, ter(2)->1, ...
  var deslocamento = primeiroDia === 0 ? 6 : primeiroDia - 1;

  // Células vazias iniciais
  for (var v = 0; v < deslocamento; v++) {
    var vazioCell = document.createElement('div');
    vazioCell.className = 'cal-cell cal-vazio';
    grid.appendChild(vazioCell);
  }

  // Dias do mês
  var diasNoMes = new Date(anoAtual, mesAtual + 1, 0).getDate();
  var hoje = new Date();
  var hojeAno = hoje.getFullYear();
  var hojeMes = hoje.getMonth();
  var hojeDia = hoje.getDate();

  for (var d = 1; d <= diasNoMes; d++) {
    var cell = document.createElement('div');
    cell.className = 'cal-cell';

    // Destacar dia atual
    if (anoAtual === hojeAno && mesAtual === hojeMes && d === hojeDia) {
      cell.className += ' cal-hoje';
    }

    // Número do dia
    var diaNum = document.createElement('div');
    diaNum.className = 'cal-dia-num';
    diaNum.textContent = d;
    cell.appendChild(diaNum);

    // Filtrar protocolos deste dia
    var eventosDoDia = [];
    for (var p = 0; p < todosProtocolos.length; p++) {
      var ag = parsearAgendamento(todosProtocolos[p][CONFIG.fields.agendadoPara]);
      if (ag && ag.ano === anoAtual && ag.mes === mesAtual && ag.dia === d) {
        eventosDoDia.push({ proto: todosProtocolos[p], agendamento: ag });
      }
    }

    // Ordenar: com hora primeiro (por horário), depois dia inteiro
    eventosDoDia.sort(function(a, b) {
      if (a.agendamento.temHora && !b.agendamento.temHora) return -1;
      if (!a.agendamento.temHora && b.agendamento.temHora) return 1;
      if (a.agendamento.temHora && b.agendamento.temHora) {
        var minA = a.agendamento.hora * 60 + a.agendamento.minuto;
        var minB = b.agendamento.hora * 60 + b.agendamento.minuto;
        return minA - minB;
      }
      return 0;
    });

    // Renderizar eventos (máximo 3 visíveis)
    var maxVisiveis = 3;
    var totalEventos = eventosDoDia.length;

    for (var e = 0; e < Math.min(totalEventos, maxVisiveis); e++) {
      var ev = eventosDoDia[e];
      cell.appendChild(criarElementoEvento(ev.proto, ev.agendamento));
    }

    // Badge "+N mais"
    if (totalEventos > maxVisiveis) {
      var mais = document.createElement('span');
      mais.className = 'cal-mais';
      mais.textContent = '+' + (totalEventos - maxVisiveis) + ' mais';
      cell.appendChild(mais);
    }

    grid.appendChild(cell);
  }
}

function criarElementoEvento(proto, ag) {
  var link = document.createElement('a');
  link.href = '/protocolo/' + proto.id;
  link.className = 'cal-event ' + (ag.temHora ? 'cal-event-hora' : 'cal-event-dia');

  var numProtocolo = proto[CONFIG.fields.protocolo] || '';
  var nomeInteressado = obterNomeInteressado(proto[CONFIG.fields.interessado]);

  var linha1 = '';
  if (ag.temHora) {
    linha1 = pad(ag.hora) + ':' + pad(ag.minuto) + ' \u2014 ' + numProtocolo;
  } else {
    linha1 = numProtocolo;
  }

  link.textContent = linha1;

  if (nomeInteressado) {
    var nomeSpan = document.createElement('span');
    nomeSpan.className = 'cal-event-nome';
    nomeSpan.textContent = nomeInteressado;
    link.appendChild(nomeSpan);
  }

  return link;
}

/* ── Navegação ── */

function mesAnterior() {
  mesAtual--;
  if (mesAtual < 0) {
    mesAtual = 11;
    anoAtual--;
  }
  renderizarCalendario();
}

function proximoMes() {
  mesAtual++;
  if (mesAtual > 11) {
    mesAtual = 0;
    anoAtual++;
  }
  renderizarCalendario();
}

function irParaHoje() {
  var hoje = new Date();
  mesAtual = hoje.getMonth();
  anoAtual = hoje.getFullYear();
  renderizarCalendario();
}

/* ── Inicialização ── */

document.addEventListener('DOMContentLoaded', function() {
  var btnAnterior = document.getElementById('btnMesAnterior');
  var btnProximo = document.getElementById('btnProximoMes');
  var btnHoje = document.getElementById('btnHoje');

  if (btnAnterior) btnAnterior.addEventListener('click', mesAnterior);
  if (btnProximo) btnProximo.addEventListener('click', proximoMes);
  if (btnHoje) btnHoje.addEventListener('click', irParaHoje);

  carregarProtocolos();
});
