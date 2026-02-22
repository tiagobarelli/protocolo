/* notifications-badge.js — Polling do badge de notificações (ES5) */

function atualizarBadgeNotificacoes() {
  var badge = document.getElementById('notificationBadge');
  if (!badge) return;

  fetch('/api/notifications/count')
    .then(function(resp) {
      if (!resp.ok) throw new Error('Erro');
      return resp.json();
    })
    .then(function(data) {
      var count = data.count || 0;
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    })
    .catch(function() {
      // Silenciar erros de polling
    });
}

document.addEventListener('DOMContentLoaded', function() {
  atualizarBadgeNotificacoes();
  setInterval(atualizarBadgeNotificacoes, 60000);
});
