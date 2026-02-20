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
        window.location.href = '/protocolo/' + data.results[0].id + '?origem=consulta';
        return;
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
        div.innerHTML = '<div class="result-info"><strong>' + numProto + '<span class="status-badge ' + statusClass + '"><i class="' + statusIcon + '"></i> ' + statusTexto + '</span></strong><div class="result-meta"><i class="ph ph-user"></i> ' + interessado + ' &bull; <i class="ph ph-calendar-blank"></i> ' + dataEnt + '</div></div><a href="/protocolo/' + proto.id + '?origem=consulta" class="btn btn-secondary"><i class="ph ph-eye"></i> Visualizar</a>';
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

  function mostrarMsg(id, tipo, txt) {
    var el = document.getElementById(id);
    el.className = 'msg-box ' + tipo;
    el.textContent = txt;
    el.style.display = 'block';
  }

  function esconderMsg(id) {
    document.getElementById(id).style.display = 'none';
  }
