// bloqueio_registro.js - Modulo compartilhado de bloqueio de edicao por registro.
// ES5 only: var e function(){}; sem const/let/arrow/template literals/async-await.
//
// Fabrica global (analoga estrutural de anexos_atos.js):
//   var widget = window.criarBloqueioRegistro({
//     tabelaId: 745,                       // ID da tabela Baserow
//     badgeContainerId: 'bloqueioBadge',   // container do badge (visivel a todos)
//     botaoContainerId: 'bloqueioBotao',   // container do botao Bloquear/Desbloquear (so master)
//     obterRowId: function() { ... },      // rowId atual da pagina, ou null (registro novo)
//     aoAplicarBloqueio: function(deveTravar) { ... }  // a pagina trava/destrava os campos dela
//   });
//
// Regra central: deveTravar = bloqueado && perfil !== 'master'. O badge aparece
// para todos quando bloqueado; o master bypassa o travamento e e o unico que ve
// o botao. O modulo nao conhece os campos da pagina (isso e do callback), nao
// intercepta submit e nao toca no proxy Baserow ("porta de vidro": a disciplina
// e da UI; nao ha enforcement no servidor).
(function() {
  'use strict';

  var API = '/api/bloqueios';

  // Copia interna (modulo compartilhado nao depende do escapeHtml das paginas)
  function escapeHtml(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ehMaster() {
    return !!(window.CURRENT_USER && window.CURRENT_USER.perfil === 'master');
  }

  function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  // ISO 8601 com sufixo Z (UTC, vindo do backend) -> "DD/MM/AAAA HH:MM" local.
  function formatarDataHora(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  window.criarBloqueioRegistro = function(config) {
    if (!config) {
      throw new Error('criarBloqueioRegistro: objeto de configuracao e obrigatorio.');
    }
    if (typeof config.tabelaId !== 'number') {
      throw new Error('criarBloqueioRegistro: opcao obrigatoria "tabelaId" (number) ausente.');
    }
    if (!config.badgeContainerId || typeof config.badgeContainerId !== 'string') {
      throw new Error('criarBloqueioRegistro: opcao obrigatoria "badgeContainerId" (string) ausente.');
    }
    if (!config.botaoContainerId || typeof config.botaoContainerId !== 'string') {
      throw new Error('criarBloqueioRegistro: opcao obrigatoria "botaoContainerId" (string) ausente.');
    }
    if (typeof config.obterRowId !== 'function') {
      throw new Error('criarBloqueioRegistro: opcao obrigatoria "obterRowId" (function) ausente.');
    }
    if (typeof config.aoAplicarBloqueio !== 'function') {
      throw new Error('criarBloqueioRegistro: opcao obrigatoria "aoAplicarBloqueio" (function) ausente.');
    }

    // Estado interno do closure
    var bloqueadoAtual = false;
    var infoBloqueio = null; // { nome: ..., em: ISO com Z } ou null

    function deveTravar() {
      return bloqueadoAtual && !ehMaster();
    }

    function badgeEl() { return document.getElementById(config.badgeContainerId); }
    function botaoEl() { return document.getElementById(config.botaoContainerId); }

    // Badge informativo (todos os perfis) + mensagem de erro opcional do botao.
    // O erro e limpo no proximo render bem-sucedido.
    function renderizarBadge(msgErro) {
      var el = badgeEl();
      if (!el) return;
      var html = '';
      if (bloqueadoAtual && infoBloqueio) {
        html += '<span class="badge badge-neutral"><i class="ph ph-lock"></i> Bloqueado por ' +
          escapeHtml(infoBloqueio.nome) + ' em ' + escapeHtml(formatarDataHora(infoBloqueio.em)) +
          '</span>';
      }
      if (msgErro) {
        html += '<span class="badge badge-danger">' + escapeHtml(msgErro) + '</span>';
      }
      el.innerHTML = html;
    }

    // Botao Bloquear/Desbloquear: so existe para master e com registro salvo.
    function renderizarBotao() {
      var el = botaoEl();
      if (!el) return;
      el.innerHTML = '';
      if (!ehMaster()) return;
      var rowId = config.obterRowId();
      if (rowId === null || rowId === undefined) return;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline';
      if (bloqueadoAtual) {
        btn.innerHTML = '<i class="ph ph-lock-open"></i> Desbloquear edição';
      } else {
        btn.innerHTML = '<i class="ph ph-lock"></i> Bloquear edição';
      }
      btn.addEventListener('click', aoClicarBotao);
      el.appendChild(btn);
    }

    // Aplica uma resposta do backend ao estado + UI e notifica a pagina.
    function aplicarEstado(data) {
      bloqueadoAtual = !!data.bloqueado;
      infoBloqueio = bloqueadoAtual
        ? { nome: data.bloqueado_por || '', em: data.bloqueado_em || '' }
        : null;
      renderizarBadge('');
      renderizarBotao();
      config.aoAplicarBloqueio(deveTravar());
    }

    function aoClicarBotao() {
      var rowId = config.obterRowId();
      if (rowId === null || rowId === undefined) return;
      var acao = bloqueadoAtual ? 'desbloquear' : 'bloquear';
      var el = botaoEl();
      var btn = el ? el.querySelector('button') : null;
      if (btn) btn.disabled = true;

      fetch(API + '/' + config.tabelaId + '/' + rowId + '/' + acao, { method: 'POST' })
        .then(function(resp) {
          return resp.json().then(function(data) {
            if (!resp.ok || !data.ok) {
              throw new Error(data.erro || 'Erro ao alterar o bloqueio.');
            }
            aplicarEstado(data);
          });
        })
        .catch(function(err) {
          if (btn) btn.disabled = false;
          renderizarBadge(err.message || 'Erro ao alterar o bloqueio.');
        });
    }

    // GET do estado atual; com rowId null (registro novo) equivale a limpar().
    function carregar() {
      var rowId = config.obterRowId();
      if (rowId === null || rowId === undefined) {
        limpar();
        return;
      }
      fetch(API + '/' + config.tabelaId + '/' + rowId)
        .then(function(resp) { return resp.json(); })
        .then(function(data) {
          if (!data || !data.ok) return; // estado da UI permanece como esta
          aplicarEstado(data);
        })
        .catch(function(err) {
          console.error('Erro ao consultar bloqueio:', err);
        });
    }

    function estaBloqueado() {
      return bloqueadoAtual;
    }

    // GET fresco (nunca usa cache) para o gate do Salvar: fecha a brecha da aba
    // antiga. Quem decide abortar e a pagina, com o resultado resolvido aqui.
    // Falha de rede resolve { bloqueado: false } (porta de vidro: a consulta de
    // bloqueio indisponivel nao deve impedir o salvamento).
    function verificarAntesDeSalvar() {
      var rowId = config.obterRowId();
      if (rowId === null || rowId === undefined) {
        return Promise.resolve({ bloqueado: false });
      }
      return fetch(API + '/' + config.tabelaId + '/' + rowId)
        .then(function(resp) { return resp.json(); })
        .then(function(data) {
          if (!data || !data.ok) return { bloqueado: false };
          return {
            bloqueado: !!data.bloqueado,
            bloqueadoPor: data.bloqueado_por || '',
            bloqueadoEm: data.bloqueado_em || ''
          };
        })
        .catch(function() {
          return { bloqueado: false };
        });
    }

    // Zera estado e UI (registro novo / formulario limpo).
    function limpar() {
      bloqueadoAtual = false;
      infoBloqueio = null;
      var b = badgeEl();
      if (b) b.innerHTML = '';
      var bo = botaoEl();
      if (bo) bo.innerHTML = '';
      config.aoAplicarBloqueio(false);
    }

    return {
      carregar: carregar,
      estaBloqueado: estaBloqueado,
      verificarAntesDeSalvar: verificarAntesDeSalvar,
      limpar: limpar
    };
  };
})();
