/* todo-badge.js — Polling do badge de tarefas To Do (ES5) */

function atualizarBadgeTodo() {
  var badge = document.getElementById('todoBadge');
  if (!badge) return;

  fetch('/api/todo/count')
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
  atualizarBadgeTodo();
  setInterval(atualizarBadgeTodo, 60000);
});
