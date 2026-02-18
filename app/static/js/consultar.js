var API_BASE = '/api/baserow';
  var CONFIG = {
    tables: { clientes: 754, protocolo: 755 },
    fields: {
      protocolo: 'field_7240',
      interessado: 'field_7241',
      servico: 'field_7242',
      responsavel: 'field_7249',
      dataEntrada: 'field_7250',
      status: 'field_7252',
      detalhamentos: 'field_7251',
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

  document.getElementById('termoBusca').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') buscarProtocolo();
  });

  window.addEventListener('DOMContentLoaded', function() {
    var urlParams = new URLSearchParams(window.location.search);
    var protocoloParam = urlParams.get('protocolo');
    if (protocoloParam) {
      document.getElementById('termoBusca').value = protocoloParam;
      buscarEExibirProtocolo(protocoloParam);
    }
  });

  async function buscarEExibirProtocolo(termo) {
    var overlay = document.getElementById('overlay');
    overlay.classList.add('active');
    try {
      var url = API_BASE + '/database/rows/table/' + CONFIG.tables.protocolo + '/?user_field_names=true&filter__field_7240__equal=' + encodeURIComponent(termo) + '&size=1';
      var resp = await fetch(url, { headers: apiHeaders() });
      var data = await resp.json();
      if (data.results && data.results.length > 0) {
        await verComprovante(data.results[0].id);
      } else {
        document.getElementById('termoBusca').value = termo;
        buscarProtocolo();
      }
    } catch (e) {
      console.error(e);
      mostrarMsg('searchMsg', 'error', 'Erro ao buscar protocolo.');
    } finally {
      overlay.classList.remove('active');
    }
  }

  function idsUnicos(arr) {
    var seen = {};
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      if (!seen[arr[i]]) { seen[arr[i]] = true; out.push(arr[i]); }
    }
    return out;
  }

  async function buscarProtocolo() {
    var termo = document.getElementById('termoBusca').value.trim();
    if (!termo) return mostrarMsg('searchMsg', 'error', 'Digite um termo para buscar.');
    var overlay = document.getElementById('overlay');
    overlay.classList.add('active');
    esconderMsg('searchMsg');
    var resultadosDiv = document.getElementById('resultados');
    resultadosDiv.className = 'results';
    resultadosDiv.innerHTML = '';
    try {
      var url = API_BASE + '/database/rows/table/' + CONFIG.tables.protocolo + '/?user_field_names=true&filter__field_7240__contains=' + encodeURIComponent(termo) + '&size=20';
      var resp = await fetch(url, { headers: apiHeaders() });
      var data = await resp.json();
      var resultados = data.results || [];
      if (resultados.length === 0) {
        var clienteIds = [];
        var termoLimpo = termo.replace(/\D/g, '');
        var urlCli = API_BASE + '/database/rows/table/' + CONFIG.tables.clientes + '/?user_field_names=true&filter__field_7237__contains=' + encodeURIComponent(termo) + '&size=20';
        var respCli = await fetch(urlCli, { headers: apiHeaders() });
        var dataCli = await respCli.json();
        if (dataCli.results) {
          for (var c = 0; c < dataCli.results.length; c++) clienteIds.push(dataCli.results[c].id);
        }
        if (termoLimpo.length >= 3) {
          urlCli = API_BASE + '/database/rows/table/' + CONFIG.tables.clientes + '/?user_field_names=true&filter__field_7238__contains=' + encodeURIComponent(termo) + '&size=10';
          respCli = await fetch(urlCli, { headers: apiHeaders() });
          dataCli = await respCli.json();
          if (dataCli.results) {
            for (c = 0; c < dataCli.results.length; c++) clienteIds.push(dataCli.results[c].id);
          }
          urlCli = API_BASE + '/database/rows/table/' + CONFIG.tables.clientes + '/?user_field_names=true&filter__field_7239__contains=' + encodeURIComponent(termo) + '&size=10';
          respCli = await fetch(urlCli, { headers: apiHeaders() });
          dataCli = await respCli.json();
          if (dataCli.results) {
            for (c = 0; c < dataCli.results.length; c++) clienteIds.push(dataCli.results[c].id);
          }
        }
        var idsUnicosArr = idsUnicos(clienteIds);
        for (var ui = 0; ui < idsUnicosArr.length; ui++) {
          var cid = idsUnicosArr[ui];
          url = API_BASE + '/database/rows/table/' + CONFIG.tables.protocolo + '/?user_field_names=true&filter__field_7241__link_row_has=' + cid + '&size=20';
          resp = await fetch(url, { headers: apiHeaders() });
          data = await resp.json();
          if (data.results) {
            for (var ri = 0; ri < data.results.length; ri++) resultados.push(data.results[ri]);
          }
        }
        var vistos = {};
        var filtrado = [];
        for (var fi = 0; fi < resultados.length; fi++) {
          var r = resultados[fi];
          if (!vistos[r.id]) { vistos[r.id] = true; filtrado.push(r); }
        }
        resultados = filtrado;
      }
      if (resultados.length === 0) {
        mostrarMsg('searchMsg', 'warning', 'Nenhum protocolo encontrado.');
        return;
      }
      resultadosDiv.innerHTML = '<h3 style="font-size:0.8rem; margin-bottom:12px; color:#64748b; font-weight:600">' + resultados.length + ' resultado(s) encontrado(s)</h3>';
      for (var p = 0; p < resultados.length; p++) {
        var proto = resultados[p];
        var numProto = proto['Protocolo'] || '—';
        var interessadoArr = proto['Interessado'] || [];
        var interessado = '';
        for (var ii = 0; ii < interessadoArr.length; ii++) interessado += (ii ? ', ' : '') + (interessadoArr[ii].value || '');
        if (!interessado) interessado = '—';
        var dataEnt = proto['Data entrada'] ? proto['Data entrada'].split('-').reverse().join('/') : '—';
        var statusObj = proto['Status Atual'] || proto['Status'];
        var statusTexto = statusObj ? (statusObj.value || statusObj) : 'Em andamento';
        var statusClass = 'andamento';
        var statusIcon = 'ph-clock';
        if (statusTexto.toLowerCase().indexOf('finalizado') !== -1) {
          statusClass = 'finalizado';
          statusIcon = 'ph-check-circle';
        } else if (statusTexto.toLowerCase().indexOf('cancelado') !== -1) {
          statusClass = 'cancelado';
          statusIcon = 'ph-x-circle';
        }
        var div = document.createElement('div');
        div.className = 'result-item';
        div.innerHTML = '<div class="result-info"><strong>' + numProto + '<span class="status-badge ' + statusClass + '"><i class="' + statusIcon + '"></i> ' + statusTexto + '</span></strong><div class="result-meta"><i class="ph ph-user"></i> ' + interessado + ' &bull; <i class="ph ph-calendar-blank"></i> ' + dataEnt + '</div></div><button class="btn btn-secondary" onclick="verComprovante(' + proto.id + ')"><i class="ph ph-eye"></i> Visualizar</button>';
        resultadosDiv.appendChild(div);
      }
      resultadosDiv.className = 'results active';
    } catch (e) {
      console.error(e);
      mostrarMsg('searchMsg', 'error', 'Erro de conexão com o servidor.');
    } finally {
      overlay.classList.remove('active');
    }
  }

  async function verComprovante(idProtocolo) {
    var overlay = document.getElementById('overlay');
    overlay.classList.add('active');
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
      document.getElementById('searchView').style.display = 'none';
      document.getElementById('receiptView').style.display = 'block';
    } catch (e) {
      console.error(e);
      alert('Não foi possível carregar os dados do protocolo.');
    } finally {
      overlay.classList.remove('active');
    }
  }

  function voltarBusca() {
    document.getElementById('receiptView').style.display = 'none';
    document.getElementById('searchView').style.display = 'block';
  }

  function mostrarMsg(id, tipo, txt) {
    var el = document.getElementById(id);
    el.className = 'msg-box ' + tipo;
    el.textContent = txt;
    el.style.display = 'block';
  }

  function esconderMsg(id) {
    document.getElementById(id).style.display = 'none';
  }
