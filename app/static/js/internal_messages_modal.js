// internal_messages_modal.js — ES5 estrito
// Modal de avisos internos na home (Painel). Exibe mensagens pendentes
// uma de cada vez (fila). "Ok" sem checkbox apenas avança (reaparece depois);
// "Ok" com checkbox grava a leitura definitiva no backend.

(function() {
  if (window.marked) {
    marked.use({ gfm: true, breaks: true });
  }

  var pendentes = [];
  var indiceAtual = 0;

  function el(id) {
    return document.getElementById(id);
  }

  function renderMarkdown(target, md) {
    if (!target) return;
    md = md || '';
    if (window.marked) target.innerHTML = marked.parse(md);
    else target.textContent = md;
  }

  function esconderModal() {
    var overlay = el('imModalOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  function exibirMensagemAtual() {
    if (indiceAtual >= pendentes.length) {
      esconderModal();
      return;
    }
    var msg = pendentes[indiceAtual];
    var titulo = el('imModalTitulo');
    var body = el('imModalBody');
    var check = el('imNaoExibir');
    var overlay = el('imModalOverlay');

    if (titulo) titulo.textContent = msg.titulo || '';
    renderMarkdown(body, msg.corpo);
    if (check) check.checked = false;
    if (overlay) overlay.style.display = 'flex';
  }

  function avancarFila() {
    indiceAtual += 1;
    exibirMensagemAtual();
  }

  function aoClicarOk() {
    var btn = el('imBtnOk');
    var check = el('imNaoExibir');
    var msg = pendentes[indiceAtual];

    if (!msg) {
      esconderModal();
      return;
    }

    if (check && check.checked) {
      if (btn) btn.disabled = true;
      fetch('/api/internal-messages/' + msg.id + '/read', { method: 'POST' })
        .then(function(r) { return r.json(); })
        .then(function() {
          if (btn) btn.disabled = false;
          avancarFila();
        })
        .catch(function() {
          // Em caso de erro de rede, ainda avança para não travar o usuário;
          // como não foi gravado, a mensagem reaparecerá no próximo acesso.
          if (btn) btn.disabled = false;
          avancarFila();
        });
    } else {
      avancarFila();
    }
  }

  function carregarPendentes() {
    fetch('/api/internal-messages/pending')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        pendentes = (data && data.messages) || [];
        indiceAtual = 0;
        if (pendentes.length) {
          exibirMensagemAtual();
        }
      })
      .catch(function() {
        // Silencioso: o painel deve funcionar mesmo sem mensagens.
      });
  }

  document.addEventListener('DOMContentLoaded', function() {
    var btn = el('imBtnOk');
    if (btn) btn.addEventListener('click', aoClicarOk);
    carregarPendentes();
  });
})();
