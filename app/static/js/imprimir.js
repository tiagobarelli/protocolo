/* imprimir.js — Pagina de impressao de protocolo (ES5) */

var API_BASE = '/api/baserow';
var CONFIG = {
  tables: { clientes: 754, protocolo: 755 },
  fields: {
    protocolo: 'field_7240',
    interessado: 'field_7241',
    servico: 'field_7242',
    responsavel: 'field_7249',
    dataEntrada: 'field_7250',
    detalhamentos: 'field_7251',
    status: 'field_7252',
    advogado: 'field_7254',
    depositoPrevio: 'field_7340',
    clienteNome: 'field_7237',
    clienteCpf: 'field_7238',
    clienteCnpj: 'field_7239',
    clienteTelefone: 'field_7243',
    clienteEmail: 'field_7244'
  }
};

function apiHeaders() {
  return { 'Content-Type': 'application/json' };
}

if (window.marked) {
  marked.use({ gfm: true, breaks: true });
}

function renderMarkdownInto(el, md) {
  if (!el) return;
  md = md || '';
  if (window.marked) el.innerHTML = marked.parse(md);
  else el.textContent = md;
}

function formatarDepositoExibicao(v) {
  if (v === null || v === undefined || v === '') return '';
  var num = parseFloat(String(v).replace(',', '.'));
  if (isNaN(num)) return '';
  var partes = num.toFixed(2).split('.');
  var intPart = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return 'R$ ' + intPart + ',' + partes[1];
}

function mostrarOverlay(show) {
  var overlay = document.getElementById('overlay');
  if (overlay) {
    if (show) overlay.classList.add('active');
    else overlay.classList.remove('active');
  }
}

async function carregarComprovante(idProtocolo) {
  mostrarOverlay(true);
  try {
    var url = API_BASE + '/database/rows/table/' + CONFIG.tables.protocolo + '/' + idProtocolo + '/?user_field_names=false';
    var resp = await fetch(url, { headers: apiHeaders() });
    if (!resp.ok) throw new Error('Erro ao buscar protocolo');
    var proto = await resp.json();

    var nomeCliente = '—';
    var docCliente = '—';
    var telCliente = '';
    var emailCliente = '';
    var interessados = proto[CONFIG.fields.interessado];
    if (interessados && interessados.length > 0) {
      var idCliente = interessados[0].id;
      var urlCli = API_BASE + '/database/rows/table/' + CONFIG.tables.clientes + '/' + idCliente + '/?user_field_names=false';
      var respCli = await fetch(urlCli, { headers: apiHeaders() });
      var cli = await respCli.json();
      nomeCliente = cli[CONFIG.fields.clienteNome] || '—';
      docCliente = cli[CONFIG.fields.clienteCpf] || cli[CONFIG.fields.clienteCnpj] || '—';
      telCliente = cli[CONFIG.fields.clienteTelefone] || '';
      emailCliente = cli[CONFIG.fields.clienteEmail] || '';
    }

    var nomeAdvogado = '';
    var advogados = proto[CONFIG.fields.advogado];
    if (advogados && advogados.length > 0) {
      var idAdv = (typeof advogados[0] === 'object' && advogados[0].id) ? advogados[0].id : advogados[0];
      var urlAdv = API_BASE + '/database/rows/table/' + CONFIG.tables.clientes + '/' + idAdv + '/?user_field_names=false';
      var respAdv = await fetch(urlAdv, { headers: apiHeaders() });
      var adv = await respAdv.json();
      nomeAdvogado = adv[CONFIG.fields.clienteNome] || '';
    }

    var numProto = proto[CONFIG.fields.protocolo] || '—';
    document.getElementById('recProtocoloTitulo').textContent = numProto;
    document.getElementById('recInteressado').textContent = nomeCliente;

    var boxAdv = document.getElementById('recAdvogadoBox');
    if (nomeAdvogado) {
      document.getElementById('recAdvogado').textContent = nomeAdvogado;
      boxAdv.style.display = 'block';
    } else {
      boxAdv.style.display = 'none';
    }

    document.getElementById('recDocumento').textContent = docCliente;
    var dataRaw = proto[CONFIG.fields.dataEntrada];
    var dataFormatada = dataRaw ? dataRaw.split('-').reverse().join('/') : '—';
    document.getElementById('recData').textContent = dataFormatada;

    var servicoList = proto[CONFIG.fields.servico] || [];
    var servico = '';
    for (var si = 0; si < servicoList.length; si++) servico += (si ? ', ' : '') + (servicoList[si].value || '');
    if (!servico) servico = '—';
    document.getElementById('recServico').textContent = servico;

    var respList = proto[CONFIG.fields.responsavel] || [];
    var respNome = '';
    for (var rn = 0; rn < respList.length; rn++) respNome += (rn ? ', ' : '') + (respList[rn].name || '');
    if (!respNome) respNome = '—';
    document.getElementById('recResponsavel').textContent = respNome;

    var statusObj = proto[CONFIG.fields.status];
    document.getElementById('recStatus').textContent = statusObj ? statusObj.value : '—';

    var depositoRaw = proto[CONFIG.fields.depositoPrevio];
    var boxDeposito = document.getElementById('recDepositoBox');
    if (depositoRaw !== null && depositoRaw !== undefined && depositoRaw !== '') {
      document.getElementById('recDeposito').textContent = formatarDepositoExibicao(depositoRaw);
      boxDeposito.style.display = 'block';
    } else {
      boxDeposito.style.display = 'none';
    }

    var detalhes = proto[CONFIG.fields.detalhamentos];
    var boxDetalhes = document.getElementById('recDetalhamentosBox');
    var detEl = document.getElementById('recDetalhamentos');
    if (detalhes && detalhes.trim()) {
      renderMarkdownInto(detEl, detalhes);
      boxDetalhes.style.display = 'block';
    } else {
      detEl.innerHTML = '';
      boxDetalhes.style.display = 'none';
    }

    var boxTel = document.getElementById('recTelefoneBox');
    if (telCliente) {
      document.getElementById('recTelefone').textContent = telCliente;
      boxTel.style.display = 'block';
    } else {
      boxTel.style.display = 'none';
    }

    var boxEmail = document.getElementById('recEmailBox');
    if (emailCliente) {
      document.getElementById('recEmail').textContent = emailCliente;
      boxEmail.style.display = 'block';
    } else {
      boxEmail.style.display = 'none';
    }
  } catch (e) {
    console.error(e);
    alert('Não foi possível carregar os dados do protocolo.');
  } finally {
    mostrarOverlay(false);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  if (typeof window.PROTOCOLO_ID !== 'undefined') {
    carregarComprovante(window.PROTOCOLO_ID);
  }
});
