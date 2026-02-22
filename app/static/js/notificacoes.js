/* notificacoes.js — Página de notificações (ES5) */

var protocoloCache = {};
var currentPage = 1;

function carregarNotificacoes(page) {
  var container = document.getElementById('notificationsContainer');
  var paginationEl = document.getElementById('paginationContainer');
  if (!container) return;

  container.innerHTML = '<div class="loading-state"><div class="spinner"></div> Carregando notificações...</div>';
  if (paginationEl) paginationEl.style.display = 'none';

  fetch('/api/notifications?page=' + page + '&per_page=20')
    .then(function(resp) {
      if (!resp.ok) throw new Error('Erro ao carregar notificações');
      return resp.json();
    })
    .then(function(data) {
      currentPage = data.page;

      if (!data.notifications || data.notifications.length === 0) {
        container.innerHTML = '<div class="notifications-empty">' +
          '<i class="ph ph-bell-slash" style="font-size:2rem; display:block; margin-bottom:8px;"></i>' +
          'Nenhuma notificação.' +
        '</div>';
        return;
      }

      // Coletar protocolo_ids únicos para resolver números
      var ids = [];
      for (var i = 0; i < data.notifications.length; i++) {
        var pid = data.notifications[i].protocolo_id;
        if (ids.indexOf(pid) === -1 && !protocoloCache[pid]) {
          ids.push(pid);
        }
      }

      // Buscar números dos protocolos em paralelo
      var promises = [];
      for (var j = 0; j < ids.length; j++) {
        promises.push(buscarNumeroProtocolo(ids[j]));
      }

      Promise.all(promises).then(function() {
        renderizarNotificacoes(data.notifications, container);
        if (data.pages > 1) {
          renderizarPaginacao(data.total, data.page, data.per_page, data.pages);
        }
      });
    })
    .catch(function() {
      container.innerHTML = '<div class="notifications-empty">Erro ao carregar notificações.</div>';
    });
}

function buscarNumeroProtocolo(protocoloId) {
  return fetch('/api/baserow/database/rows/table/755/' + protocoloId + '/?user_field_names=false')
    .then(function(resp) {
      if (!resp.ok) throw new Error('Erro');
      return resp.json();
    })
    .then(function(row) {
      protocoloCache[protocoloId] = row.field_7240 || ('ID ' + protocoloId);
    })
    .catch(function() {
      protocoloCache[protocoloId] = 'ID ' + protocoloId;
    });
}

function renderizarNotificacoes(notifications, container) {
  var html = '';
  for (var i = 0; i < notifications.length; i++) {
    var n = notifications[i];
    var statusClass = n.lida ? 'read' : 'unread';
    var numero = protocoloCache[n.protocolo_id] || ('ID ' + n.protocolo_id);
    var dataFormatada = formatarDataNotif(n.criado_em);

    html += '<div class="notification-item ' + statusClass + '" data-id="' + n.id + '" data-protocolo="' + n.protocolo_id + '" data-lida="' + (n.lida ? '1' : '0') + '">' +
      '<div class="notification-icon"><i class="ph ph-chat-dots"></i></div>' +
      '<div class="notification-body">' +
        '<div class="notification-meta">' +
          '<span class="notification-sender">' + escapeHtmlNotif(n.remetente_nome) + '</span>' +
          ' comentou no protocolo ' +
          '<span class="notification-protocol">' + escapeHtmlNotif(numero) + '</span>' +
          '<span class="notification-date">' + dataFormatada + '</span>' +
        '</div>' +
        '<div class="notification-preview">' + escapeHtmlNotif(n.previa) + '</div>' +
      '</div>' +
      (n.lida ? '' : '<div class="notification-dot"></div>') +
    '</div>';
  }
  container.innerHTML = html;

  // Registrar cliques
  var items = container.querySelectorAll('.notification-item');
  for (var j = 0; j < items.length; j++) {
    items[j].addEventListener('click', onNotificationClick);
  }
}

function onNotificationClick() {
  var id = parseInt(this.getAttribute('data-id'));
  var protocoloId = this.getAttribute('data-protocolo');
  var lida = this.getAttribute('data-lida') === '1';

  if (!lida) {
    fetch('/api/notifications/' + id + '/read', { method: 'PATCH', headers: { 'Content-Type': 'application/json' } })
      .then(function() {
        window.location.href = '/protocolo/' + protocoloId;
      })
      .catch(function() {
        window.location.href = '/protocolo/' + protocoloId;
      });
  } else {
    window.location.href = '/protocolo/' + protocoloId;
  }
}

function renderizarPaginacao(total, page, perPage, pages) {
  var container = document.getElementById('paginationContainer');
  if (!container) return;

  var html = '';

  // Botão anterior
  if (page > 1) {
    html += '<button type="button" class="pagination-btn" data-page="' + (page - 1) + '">&laquo; Anterior</button>';
  }

  // Números de páginas
  for (var i = 1; i <= pages; i++) {
    if (i === page) {
      html += '<button type="button" class="pagination-btn active">' + i + '</button>';
    } else {
      html += '<button type="button" class="pagination-btn" data-page="' + i + '">' + i + '</button>';
    }
  }

  // Botão próximo
  if (page < pages) {
    html += '<button type="button" class="pagination-btn" data-page="' + (page + 1) + '">Próximo &raquo;</button>';
  }

  container.innerHTML = html;
  container.style.display = 'flex';

  // Registrar cliques
  var btns = container.querySelectorAll('.pagination-btn[data-page]');
  for (var j = 0; j < btns.length; j++) {
    btns[j].addEventListener('click', function() {
      var p = parseInt(this.getAttribute('data-page'));
      carregarNotificacoes(p);
    });
  }
}

function marcarTodasComoLidas() {
  fetch('/api/notifications/read-all', { method: 'PATCH', headers: { 'Content-Type': 'application/json' } })
    .then(function(resp) {
      if (!resp.ok) throw new Error('Erro');
      return resp.json();
    })
    .then(function() {
      carregarNotificacoes(currentPage);
      if (typeof atualizarBadgeNotificacoes === 'function') {
        atualizarBadgeNotificacoes();
      }
    })
    .catch(function() {
      alert('Erro ao marcar notificações como lidas.');
    });
}

function formatarDataNotif(str) {
  if (!str) return '';
  var d = new Date(str.replace(' ', 'T'));
  if (isNaN(d.getTime())) return str;
  var dd = ('0' + d.getDate()).slice(-2);
  var mm = ('0' + (d.getMonth() + 1)).slice(-2);
  var yyyy = d.getFullYear();
  var hh = ('0' + d.getHours()).slice(-2);
  var min = ('0' + d.getMinutes()).slice(-2);
  return dd + '/' + mm + '/' + yyyy + ' ' + hh + ':' + min;
}

function escapeHtmlNotif(text) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', function() {
  carregarNotificacoes(1);

  var btnMarcar = document.getElementById('btnMarcarTodasLidas');
  if (btnMarcar) {
    btnMarcar.addEventListener('click', marcarTodasComoLidas);
  }
});
