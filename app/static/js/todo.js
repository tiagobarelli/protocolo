/* todo.js — Página To Do (ES5) */

var API_BASE = '/api/baserow';

var CONFIG_TODO = {
  tableAndamentos: 778,
  tableProtocolo: 755,
  fields: {
    andTexto:        'field_7458',
    andProtocolo:    'field_7457',
    andIsTarefa:     'field_7460',
    andConcluido:    'field_7461',
    andDataCriacao:  'field_7462',
    andCriadoPor:    'field_7464',
    protoNumero:      'field_7240',
    protoInteressado: 'field_7241',
    protoServico:     'field_7242',
    protoAdvogado:    'field_7254'
  }
};

function apiHeaders() {
  return { 'Content-Type': 'application/json' };
}

function mostrarOverlay(show) {
  var el = document.getElementById('loadingOverlay');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function escapeHtml(text) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

function formatarDataHora(isoStr) {
  if (!isoStr) return '';

  if (isoStr.indexOf('T') === -1) {
    var p = isoStr.split('-');
    if (p.length < 3) return isoStr;
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  var d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;

  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) {
    var dp = isoStr.split('T')[0].split('-');
    return dp[2] + '/' + dp[1] + '/' + dp[0];
  }

  var dd  = ('0' + d.getDate()).slice(-2);
  var mm  = ('0' + (d.getMonth() + 1)).slice(-2);
  var yyyy = d.getFullYear();
  var hh  = ('0' + d.getHours()).slice(-2);
  var min = ('0' + d.getMinutes()).slice(-2);
  return dd + '/' + mm + '/' + yyyy + ' às ' + hh + ':' + min;
}

function gerarDataHoraIso() {
  var agora = new Date();
  var ano = agora.getFullYear();
  var mes = ('0' + (agora.getMonth() + 1)).slice(-2);
  var dia = ('0' + agora.getDate()).slice(-2);
  var hora = ('0' + agora.getHours()).slice(-2);
  var min = ('0' + agora.getMinutes()).slice(-2);
  return ano + '-' + mes + '-' + dia + 'T' + hora + ':' + min + ':00';
}

function carregarTarefas() {
  var lista = document.getElementById('todoLista');
  if (!lista) return;

  var nome = (window.CURRENT_USER && window.CURRENT_USER.nome) ? window.CURRENT_USER.nome : '';
  var nomeEncoded = encodeURIComponent(nome);

  var url = API_BASE + '/database/rows/table/' + CONFIG_TODO.tableAndamentos +
            '/?user_field_names=false' +
            '&filter__field_7460__boolean=true' +
            '&filter__field_7461__boolean=false' +
            '&filter__field_7464__equal=' + nomeEncoded +
            '&order_by=field_7462';

  fetch(url, { headers: apiHeaders() })
    .then(function(resp) {
      if (!resp.ok) throw new Error('Erro ao carregar tarefas');
      return resp.json();
    })
    .then(function(data) {
      var tarefas = data.results || [];
      if (tarefas.length === 0) {
        renderizarGrupos([]);
        return;
      }
      return carregarDetalhesProtocolos(tarefas).then(function(detalhes) {
        renderizarGrupos(agruparTarefas(tarefas, detalhes));
      });
    })
    .catch(function(err) {
      console.error('Erro ao carregar tarefas:', err);
      lista.innerHTML = '<div class="todo-empty"><i class="ph ph-warning-circle"></i>Erro ao carregar tarefas.</div>';
    });
}

function carregarDetalhesProtocolos(tarefas) {
  // IDs de protocolo distintos
  var ids = [];
  for (var i = 0; i < tarefas.length; i++) {
    var protoArr = tarefas[i][CONFIG_TODO.fields.andProtocolo] || [];
    if (protoArr.length > 0) {
      var pid = protoArr[0].id;
      if (ids.indexOf(pid) === -1) ids.push(pid);
    }
  }

  var detalhes = {};
  var promessas = [];
  for (var j = 0; j < ids.length; j++) {
    (function(pid) {
      var url = API_BASE + '/database/rows/table/' + CONFIG_TODO.tableProtocolo + '/' + pid + '/?user_field_names=false';
      promessas.push(
        fetch(url, { headers: apiHeaders() })
          .then(function(resp) { return resp.ok ? resp.json() : null; })
          .then(function(proto) {
            if (!proto) return;
            var servicoArr = proto[CONFIG_TODO.fields.protoServico] || [];
            var interessadoArr = proto[CONFIG_TODO.fields.protoInteressado] || [];
            var advogadoArr = proto[CONFIG_TODO.fields.protoAdvogado] || [];
            detalhes[pid] = {
              numero: proto[CONFIG_TODO.fields.protoNumero] || '',
              tipo: servicoArr.length > 0 ? (servicoArr[0].value || '') : '',
              interessado: interessadoArr.length > 0 ? (interessadoArr[0].value || '') : '',
              advogado: advogadoArr.length > 0 ? (advogadoArr[0].value || '') : ''
            };
          })
          .catch(function() {})
      );
    })(ids[j]);
  }

  return Promise.all(promessas).then(function() { return detalhes; });
}

function agruparTarefas(tarefas, detalhes) {
  var grupos = {};      // protoId → { protoId, info, tarefas[] }
  var ordemSemProto = []; // tarefas sem protocolo vinculado

  for (var i = 0; i < tarefas.length; i++) {
    var a = tarefas[i];
    var protoArr = a[CONFIG_TODO.fields.andProtocolo] || [];
    if (protoArr.length === 0) {
      ordemSemProto.push(a);
      continue;
    }
    var pid = protoArr[0].id;
    if (!grupos[pid]) {
      var info = detalhes[pid] || { numero: protoArr[0].value || String(pid), tipo: '', interessado: '', advogado: '' };
      grupos[pid] = { protoId: pid, info: info, tarefas: [] };
    }
    grupos[pid].tarefas.push(a);
  }

  // Ordenar grupos por número de protocolo (crescente, numérico quando possível)
  var listaGrupos = [];
  for (var key in grupos) {
    if (grupos.hasOwnProperty(key)) listaGrupos.push(grupos[key]);
  }
  listaGrupos.sort(function(g1, g2) {
    var n1 = parseInt(g1.info.numero, 10);
    var n2 = parseInt(g2.info.numero, 10);
    if (!isNaN(n1) && !isNaN(n2)) return n1 - n2;
    return String(g1.info.numero).localeCompare(String(g2.info.numero));
  });

  // Grupo "sem protocolo" no fim
  if (ordemSemProto.length > 0) {
    listaGrupos.push({ protoId: null, info: null, tarefas: ordemSemProto });
  }

  return listaGrupos;
}

function renderizarGrupos(grupos) {
  var lista = document.getElementById('todoLista');
  if (!lista) return;

  if (!grupos || grupos.length === 0) {
    lista.innerHTML = '<div class="todo-empty"><i class="ph ph-check-circle"></i>Nenhuma tarefa pendente. Tudo em dia!</div>';
    return;
  }

  var html = '';
  for (var g = 0; g < grupos.length; g++) {
    var grupo = grupos[g];
    var info = grupo.info;

    html += '<div class="todo-group">';
    html += '<div class="todo-group-header">';
    if (grupo.protoId) {
      html += '<a href="/protocolo/' + grupo.protoId + '" class="todo-group-num">' +
              '<i class="ph ph-file-text"></i> Protocolo ' + escapeHtml(info.numero) + '</a>';
      html += '<div class="todo-group-info">';
      if (info.tipo) {
        html += '<span><i class="ph ph-scroll"></i> ' + escapeHtml(info.tipo) + '</span>';
      }
      if (info.interessado) {
        html += '<span><i class="ph ph-user"></i> ' + escapeHtml(info.interessado) + '</span>';
      }
      if (info.advogado) {
        html += '<span><i class="ph ph-gavel"></i> ' + escapeHtml(info.advogado) + '</span>';
      }
      html += '</div>';
    } else {
      html += '<span class="todo-group-num"><i class="ph ph-file-dashed"></i> Sem protocolo vinculado</span>';
    }
    html += '</div>';

    html += '<div class="todo-group-tasks">';
    for (var t = 0; t < grupo.tarefas.length; t++) {
      var a = grupo.tarefas[t];
      var texto = a[CONFIG_TODO.fields.andTexto] || '';
      var dataCriacao = a[CONFIG_TODO.fields.andDataCriacao] || '';
      var itemId = a.id;

      html += '<div class="todo-item" id="todo-item-' + itemId + '">';
      html += '<div class="todo-main">';
      html += '<div class="todo-texto">' + escapeHtml(texto) + '</div>';
      if (dataCriacao) {
        html += '<div class="todo-meta"><span class="todo-data"><i class="ph ph-clock"></i> ' +
                formatarDataHora(dataCriacao) + '</span></div>';
      }
      html += '</div>';
      html += '<button type="button" class="btn btn-success" onclick="concluirTarefa(' + itemId + ')">' +
              '<i class="ph ph-check"></i> Concluir</button>';
      html += '</div>';
    }
    html += '</div>';

    html += '</div>';
  }

  lista.innerHTML = html;
}

function concluirTarefa(andamentoId) {
  var url = API_BASE + '/database/rows/table/' + CONFIG_TODO.tableAndamentos + '/' + andamentoId + '/?user_field_names=false';
  var body = {};
  body[CONFIG_TODO.fields.andConcluido] = true;
  body['field_7463'] = gerarDataHoraIso();

  fetch(url, {
    method: 'PATCH',
    headers: apiHeaders(),
    body: JSON.stringify(body)
  })
    .then(function(resp) {
      if (!resp.ok) throw new Error('Erro ao concluir tarefa');
      return resp.json();
    })
    .then(function() {
      carregarTarefas();
    })
    .catch(function(err) {
      console.error('Erro ao concluir tarefa:', err);
      var msgBox = document.getElementById('todoMsg');
      if (msgBox) {
        msgBox.className = 'msg-box error';
        msgBox.innerHTML = '<i class="ph ph-x-circle"></i> Erro ao concluir tarefa.';
        msgBox.style.display = 'flex';
      }
    });
}

document.addEventListener('DOMContentLoaded', function() {
  carregarTarefas();
});
