/* todo.js — Página To Do (ES5) */

if (window.marked) {
  marked.use({ gfm: true, breaks: true });
}

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
    andDataTarefa:   'field_7466',
    protoNumero:      'field_7240',
    protoInteressado: 'field_7241',
    protoServico:     'field_7242',
    protoAdvogado:    'field_7254'
  }
};

var TAREFAS_CACHE = [];
var DETALHES_CACHE = {};

function apiHeaders() {
  return { 'Content-Type': 'application/json' };
}

function modoAtual() {
  var sel = document.getElementById('todoOrdenacao');
  return sel ? sel.value : 'antigos';
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

function dataHojeLocal() {
  var hoje = new Date();
  var ano = hoje.getFullYear();
  var mes = ('0' + (hoje.getMonth() + 1)).slice(-2);
  var dia = ('0' + hoje.getDate()).slice(-2);
  return ano + '-' + mes + '-' + dia; // 'YYYY-MM-DD'
}

function extrairDataParte(isoStr) {
  if (!isoStr) return '';
  return isoStr.split('T')[0]; // 'YYYY-MM-DD'
}

function atualizarContadores(tarefas) {
  var hoje = dataHojeLocal();
  var nHoje = 0, nFuturo = 0, nSemData = 0, nAtrasadas = 0;

  for (var i = 0; i < tarefas.length; i++) {
    var data = extrairDataParte(tarefas[i][CONFIG_TODO.fields.andDataTarefa]);
    if (!data) {
      nSemData++;
    } else if (data === hoje) {
      nHoje++;
    } else if (data > hoje) {
      nFuturo++;
    } else {
      nAtrasadas++;
    }
  }

  setContador('countHoje', nHoje);
  setContador('countFuturo', nFuturo);
  setContador('countSemData', nSemData);
  setContador('countAtrasadas', nAtrasadas);
}

function setContador(id, valor) {
  var el = document.getElementById(id);
  if (el) el.textContent = String(valor);
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
      atualizarContadores(tarefas);
      if (tarefas.length === 0) {
        TAREFAS_CACHE = [];
        DETALHES_CACHE = {};
        renderizarGrupos([]);
        return;
      }
      return carregarDetalhesProtocolos(tarefas).then(function(detalhes) {
        TAREFAS_CACHE = tarefas;
        DETALHES_CACHE = detalhes;
        renderizarGrupos(ordenarGrupos(agruparTarefas(tarefas, detalhes), modoAtual()));
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

  // Monta a lista de grupos (sem ordenar — a ordenação fica em ordenarGrupos)
  var listaGrupos = [];
  for (var key in grupos) {
    if (grupos.hasOwnProperty(key)) listaGrupos.push(grupos[key]);
  }

  // Grupo "sem protocolo" no fim
  if (ordemSemProto.length > 0) {
    listaGrupos.push({ protoId: null, info: null, tarefas: ordemSemProto });
  }

  return listaGrupos;
}

function ordenarGrupos(listaGrupos, modo) {
  var semProto = null, comProto = [];
  for (var i = 0; i < listaGrupos.length; i++) {
    if (listaGrupos[i].protoId === null) semProto = listaGrupos[i];
    else comProto.push(listaGrupos[i]);
  }

  function numProto(g) {
    var n = parseInt(g.info ? g.info.numero : '', 10);
    return isNaN(n) ? null : n;
  }
  function compararCrescente(g1, g2) {
    var n1 = numProto(g1), n2 = numProto(g2);
    if (n1 !== null && n2 !== null) return n1 - n2;
    return String(g1.info ? g1.info.numero : '')
           .localeCompare(String(g2.info ? g2.info.numero : ''));
  }

  if (modo === 'recentes') {
    comProto.sort(function(g1, g2) { return -compararCrescente(g1, g2); });
  } else if (modo === 'hoje') {
    var hoje = dataHojeLocal();
    function temTarefaHoje(g) {
      for (var i = 0; i < g.tarefas.length; i++) {
        if (extrairDataParte(g.tarefas[i][CONFIG_TODO.fields.andDataTarefa]) === hoje) return true;
      }
      return false;
    }
    comProto.sort(function(g1, g2) {
      var h1 = temTarefaHoje(g1) ? 1 : 0;
      var h2 = temTarefaHoje(g2) ? 1 : 0;
      if (h1 !== h2) return h2 - h1;           // hoje primeiro
      return compararCrescente(g1, g2);        // depois, crescente
    });
  } else {
    comProto.sort(compararCrescente);          // 'antigos' (padrão)
  }

  if (semProto) comProto.push(semProto);
  return comProto;
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

      var dataTarefaParte = extrairDataParte(a[CONFIG_TODO.fields.andDataTarefa]);
      var ehHoje = (dataTarefaParte && dataTarefaParte === dataHojeLocal());
      var ehAtrasada = (dataTarefaParte && dataTarefaParte < dataHojeLocal());

      var criadoPor = a[CONFIG_TODO.fields.andCriadoPor] || '';
      var nomeAtual = (window.CURRENT_USER && window.CURRENT_USER.nome) ? window.CURRENT_USER.nome : '';
      var ehMaster = (window.CURRENT_USER && window.CURRENT_USER.perfil === 'master');
      var podeEditar = (ehMaster || criadoPor === nomeAtual);

      var itemClasse = 'todo-item';
      if (ehHoje) itemClasse += ' todo-item-hoje';
      else if (ehAtrasada) itemClasse += ' todo-item-atrasada';
      html += '<div class="' + itemClasse + '" id="todo-item-' + itemId + '">';
      html += '<button type="button" class="todo-check" onclick="concluirTarefa(' + itemId + ')" aria-label="Concluir tarefa">' +
              '<i class="ph ph-check"></i></button>';
      html += '<div class="todo-main">';
      html += '<div class="todo-texto-wrap" id="todoTextoDisplay-' + itemId + '">';
      var textoHtml = window.marked ? marked.parse(texto) : escapeHtml(texto);
      if (window.DOMPurify) textoHtml = DOMPurify.sanitize(textoHtml);
      html += '<div class="todo-texto">' + textoHtml +
              (ehHoje ? '<span class="todo-pill-hoje">Hoje</span>'
                      : (ehAtrasada ? '<span class="todo-pill-atrasada">Atrasada</span>' : '')) + '</div>';
      if (podeEditar) {
        html += '<button type="button" class="btn-inline-edit btn-edit-texto" onclick="iniciarEdicaoTexto(' + itemId + ')" title="Editar texto"><i class="ph ph-pencil-simple"></i></button>';
      }
      html += '</div>';
      if (podeEditar) {
        var textoAttr = escapeHtml(texto).replace(/"/g, '&quot;');
        html += '<div class="inline-edit inline-edit-texto" id="todoTextoEdit-' + itemId + '" style="display:none;">';
        html += '<textarea class="inline-textarea" id="todoTextoInput-' + itemId + '" data-valor="' + textoAttr + '">' + escapeHtml(texto) + '</textarea>';
        html += '<button type="button" class="btn-inline-save" onclick="salvarEdicaoTexto(' + itemId + ')" title="Salvar"><i class="ph ph-check"></i></button>';
        html += '<button type="button" class="btn-inline-cancel" onclick="cancelarEdicaoTexto(' + itemId + ')" title="Cancelar"><i class="ph ph-x"></i></button>';
        html += '</div>';
      }
      if (ehAtrasada) {
        html += '<div class="todo-aviso-atraso"><i class="ph ph-info"></i> ' +
                'Tarefa atrasada — você pode remarcar a data na tela do protocolo.</div>';
      }
      if (dataCriacao) {
        html += '<div class="todo-meta"><span class="todo-data"><i class="ph ph-clock"></i> ' +
                formatarDataHora(dataCriacao) + '</span></div>';
      }
      html += '</div>';
      html += '</div>';
    }
    html += '</div>';

    html += '</div>';
  }

  lista.innerHTML = html;
}

function concluirTarefa(andamentoId) {
  var item = document.getElementById('todo-item-' + andamentoId);

  // Evitar duplo clique
  if (item && item.className.indexOf('concluindo') !== -1) return;

  // Feedback visual imediato: risca + preenche o círculo
  if (item) item.className += ' concluindo';

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
      // Mantém a tarefa riscada visível por ~2,5s, depois fade out e recarga
      setTimeout(function() {
        if (item) item.className += ' saindo';
        setTimeout(function() {
          carregarTarefas();
        }, 400);
      }, 2500);
    })
    .catch(function(err) {
      console.error('Erro ao concluir tarefa:', err);
      // Reverter o estado visual em caso de erro
      if (item) item.className = item.className.replace(' concluindo', '');
      var msgBox = document.getElementById('todoMsg');
      if (msgBox) {
        msgBox.className = 'msg-box error';
        msgBox.innerHTML = '<i class="ph ph-x-circle"></i> Erro ao concluir tarefa.';
        msgBox.style.display = 'flex';
      }
    });
}

function iniciarEdicaoTexto(itemId) {
  var display = document.getElementById('todoTextoDisplay-' + itemId);
  var editArea = document.getElementById('todoTextoEdit-' + itemId);
  var input = document.getElementById('todoTextoInput-' + itemId);
  if (display) display.style.display = 'none';
  if (editArea) editArea.style.display = 'flex';
  if (input) { input.value = input.getAttribute('data-valor') || ''; input.focus(); }
}

function cancelarEdicaoTexto(itemId) {
  var display = document.getElementById('todoTextoDisplay-' + itemId);
  var editArea = document.getElementById('todoTextoEdit-' + itemId);
  if (display) display.style.display = '';
  if (editArea) editArea.style.display = 'none';
}

function salvarEdicaoTexto(itemId) {
  var input = document.getElementById('todoTextoInput-' + itemId);
  var novoTexto = input ? input.value : '';

  var url = API_BASE + '/database/rows/table/' + CONFIG_TODO.tableAndamentos + '/' + itemId + '/?user_field_names=false';
  var body = {};
  body[CONFIG_TODO.fields.andTexto] = novoTexto;

  fetch(url, {
    method: 'PATCH',
    headers: apiHeaders(),
    body: JSON.stringify(body)
  })
    .then(function(resp) {
      if (!resp.ok) throw new Error('Erro ao salvar texto');
      return resp.json();
    })
    .then(function() {
      carregarTarefas();
    })
    .catch(function(err) {
      console.error('Erro ao salvar texto:', err);
      alert('Erro ao salvar texto: ' + err.message);
    });
}

document.addEventListener('DOMContentLoaded', function() {
  var selOrd = document.getElementById('todoOrdenacao');
  if (selOrd) {
    selOrd.value = 'antigos'; // garante padrão
    selOrd.addEventListener('change', function() {
      renderizarGrupos(ordenarGrupos(
        agruparTarefas(TAREFAS_CACHE, DETALHES_CACHE), selOrd.value));
    });
  }
  carregarTarefas();
});
