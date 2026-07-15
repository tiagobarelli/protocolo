/* anexos_atos.js — Widget compartilhado de anexos de atos de Livro de Notas (ES5)
 *
 * Extraído do widget validado de controle.js (Levas 2-3 de anexos de escrituras).
 * Consumidores previstos: retificacoes.js, substabelecimentos.js,
 * revogacao_procuracao.js. (controle.js mantém a própria cópia — não migrar.)
 *
 * Os atos são lavrados nos mesmos Livros de Notas das escrituras (identificador
 * L_x_P_y, páginas disjuntas por construção), então o acervo e a API são únicos:
 * /api/escrituras-anexos (data/escrituras_anexos/L<livro>/P<pagina>/).
 *
 * Contrato — window.AnexosAtos.criar(config):
 *   config.ids: { fileInput, btnSelect, uploadMsg, filesList, docsCard, docsList }
 *     IDs dos elementos da página hospedeira. O widget espera a marcação padrão:
 *     input[multiple] + botão dentro de .upload-area (ocultada p/ quem não anexa),
 *     msg-box de feedback, lista .files-list e card .ctrl-docs-card com a lista
 *     de nomes (classes ctrl-docs-* / file-* — copiar o CSS de controle.css).
 *   config.getLivro() / config.getPagina(): retornam a chave corrente do registro
 *     (valores exatos dos inputs readOnly; página já com padding de 3 dígitos).
 *   config.aoClicarCard(): callback do clique no card (a página ativa sua aba).
 *   config.estaTravado() (OPCIONAL): callback sincrono; true = registro com a
 *     edicao bloqueada para o usuario atual (bloqueio_registro.js). Oculta
 *     upload/nota/exclusao; leitura e download seguem livres. Consumidores que
 *     nao a fornecem mantem o comportamento anterior (nunca travado).
 *
 * Retorno (API pública):
 *   carregar()            — GET /listar da chave corrente; renderiza as duas visões.
 *   renderizar(lista)     — renderização única: lista da aba + nomes no card.
 *   limpar()              — estado vazio nas duas visões ("Nenhum anexo.").
 *   setCardClicavel(bool) — toggle de cursor/click do card.
 *
 * Permissões (via window.CURRENT_USER.perfil): upload e notas = master +
 * administrador; exclusão = somente master. Demais perfis: ver e baixar.
 */
'use strict';

(function() {
  var API = '/api/escrituras-anexos';
  var ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'tif', 'tiff', 'doc', 'docx', 'odt', 'txt', 'md'];
  var MAX_SIZE = 100 * 1024 * 1024; // 100 MB (o servidor é o backstop real)
  var NOTA_MAX = 1000;

  function apiHeaders() {
    return { 'Content-Type': 'application/json' };
  }

  function escapeHtml(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function iconeExtensao(ext) {
    var e = (ext || '').toLowerCase();
    if (e === 'pdf') return 'ph-file-pdf';
    if (e === 'doc' || e === 'docx' || e === 'odt') return 'ph-file-doc';
    if (e === 'jpg' || e === 'png') return 'ph-file-image';
    if (e === 'txt' || e === 'md') return 'ph-file-text';
    if (e === 'xls') return 'ph-file-xls';
    return 'ph-file';
  }

  function formatarTamanho(bytes) {
    if (!bytes || bytes === 0) return '0 KB';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1).replace('.', ',') + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
  }

  function podeAnexar() {
    var perfil = window.CURRENT_USER ? window.CURRENT_USER.perfil : '';
    return perfil === 'master' || perfil === 'administrador';
  }

  function podeExcluir() {
    return !!(window.CURRENT_USER && window.CURRENT_USER.perfil === 'master');
  }

  function criar(config) {
    var OBRIGATORIOS = ['fileInput', 'btnSelect', 'uploadMsg', 'filesList', 'docsCard', 'docsList'];
    if (!config || !config.ids) {
      throw new Error('AnexosAtos.criar: config.ids é obrigatório');
    }
    for (var o = 0; o < OBRIGATORIOS.length; o++) {
      if (!config.ids[OBRIGATORIOS[o]]) {
        throw new Error('AnexosAtos.criar: ids.' + OBRIGATORIOS[o] + ' é obrigatório');
      }
    }
    if (typeof config.getLivro !== 'function' || typeof config.getPagina !== 'function') {
      throw new Error('AnexosAtos.criar: getLivro e getPagina são obrigatórios');
    }
    if (typeof config.aoClicarCard !== 'function') {
      throw new Error('AnexosAtos.criar: aoClicarCard é obrigatório');
    }

    var ids = config.ids;
    var notaAberta = null;   // nome do anexo com editor de nota aberto
    var cardClicavel = false;
    // Opcional, por instancia: travamento por bloqueio de edicao (flag local,
    // sem fetch; a verificacao fresca fica no gate do salvar da pagina)
    var estaTravado = (typeof config.estaTravado === 'function')
      ? config.estaTravado
      : function() { return false; };

    function el(id) {
      return document.getElementById(id);
    }

    function mostrarMsgUpload(tipo, texto) {
      var box = el(ids.uploadMsg);
      if (!box) return;
      var icone = '';
      if (tipo === 'success') icone = '<i class="ph ph-check-circle" style="font-size:1.2rem"></i> ';
      else if (tipo === 'warning') icone = '<i class="ph ph-warning" style="font-size:1.2rem"></i> ';
      else if (tipo === 'error') icone = '<i class="ph ph-x-circle" style="font-size:1.2rem"></i> ';
      else if (tipo === 'info') icone = '<i class="ph ph-info" style="font-size:1.2rem"></i> ';
      box.className = 'msg-box ' + tipo;
      box.innerHTML = icone + texto;
      box.style.display = 'flex';
    }

    function esconderMsgUpload() {
      var box = el(ids.uploadMsg);
      if (!box) return;
      box.style.display = 'none';
      box.innerHTML = '';
    }

    function renderizarDocsCard(arquivos) {
      var lista = el(ids.docsList);
      if (!lista) return;
      lista.innerHTML = '';
      if (!arquivos || arquivos.length === 0) {
        var vazio = document.createElement('div');
        vazio.className = 'ctrl-docs-vazio';
        vazio.textContent = 'Nenhum anexo.';
        lista.appendChild(vazio);
        return;
      }
      for (var i = 0; i < arquivos.length; i++) {
        var item = document.createElement('div');
        item.className = 'ctrl-docs-item';
        var icone = document.createElement('i');
        icone.className = 'ph ' + iconeExtensao(arquivos[i].extensao);
        item.appendChild(icone);
        var nome = document.createElement('span');
        nome.textContent = arquivos[i].nome;
        item.appendChild(nome);
        lista.appendChild(item);
      }
    }

    // Mostra/oculta a area de upload conforme permissao + travamento.
    // Reavaliada a cada render: o travamento pode mudar depois do wiring.
    function atualizarAreaUpload() {
      var btn = el(ids.btnSelect);
      if (!btn) return;
      var pode = podeAnexar() && !estaTravado();
      var area = btn.closest ? btn.closest('.upload-area') : null;
      if (area) area.style.display = pode ? '' : 'none';
      else btn.style.display = pode ? '' : 'none';
    }

    function renderizar(arquivos) {
      // Atualiza as duas visões: card de documentos + lista da aba Anexos
      atualizarAreaUpload();
      renderizarDocsCard(arquivos);

      var container = el(ids.filesList);
      if (!container) return;
      notaAberta = null;
      container.innerHTML = '';
      if (!arquivos || arquivos.length === 0) {
        container.innerHTML = '<div class="files-empty">Nenhum anexo.</div>';
        return;
      }
      for (var i = 0; i < arquivos.length; i++) {
        container.appendChild(criarItemAnexo(arquivos[i]));
      }
    }

    function criarItemAnexo(f) {
      var item = document.createElement('div');
      item.className = 'file-item';

      var icone = document.createElement('i');
      icone.className = 'ph ' + iconeExtensao(f.extensao) + ' file-icon';
      item.appendChild(icone);

      var info = document.createElement('div');
      info.className = 'file-info';

      var link = document.createElement('a');
      link.className = 'file-name';
      link.href = API + '/download?livro=' + encodeURIComponent(config.getLivro()) +
        '&pagina=' + encodeURIComponent(config.getPagina()) + '&nome=' + encodeURIComponent(f.nome);
      link.textContent = f.nome;
      info.appendChild(link);

      var meta = document.createElement('span');
      meta.className = 'file-meta';
      meta.textContent = formatarTamanho(f.tamanho);
      info.appendChild(meta);

      if (f.nota) {
        var nota = document.createElement('div');
        nota.className = 'file-nota';
        nota.textContent = f.nota;
        info.appendChild(nota);
      }

      item.appendChild(info);

      if (podeAnexar() && !estaTravado()) {
        var btnNota = document.createElement('button');
        btnNota.type = 'button';
        btnNota.className = 'file-action';
        btnNota.title = f.nota ? 'Editar nota' : 'Adicionar nota';
        btnNota.innerHTML = '<i class="ph ph-note-pencil"></i>';
        btnNota.addEventListener('click', function() {
          if (estaTravado()) return; // seguro extra: botao renderizado antes do travamento
          abrirEditorNota(info, f);
        });
        item.appendChild(btnNota);
      }

      if (podeExcluir() && !estaTravado()) {
        var btnExcluir = document.createElement('button');
        btnExcluir.type = 'button';
        btnExcluir.className = 'file-delete';
        btnExcluir.title = 'Excluir anexo';
        btnExcluir.innerHTML = '<i class="ph ph-trash"></i>';
        btnExcluir.addEventListener('click', function() {
          if (estaTravado()) return; // seguro extra: botao renderizado antes do travamento
          excluirAnexo(f.nome);
        });
        item.appendChild(btnExcluir);
      }

      return item;
    }

    function fecharEditorNota() {
      var aberto = document.querySelector('#' + ids.filesList + ' .file-nota-editor');
      if (aberto && aberto.parentNode) aberto.parentNode.removeChild(aberto);
      notaAberta = null;
    }

    function abrirEditorNota(infoEl, f) {
      // Apenas um editor aberto por vez; clicar de novo no mesmo anexo fecha
      if (notaAberta === f.nome) { fecharEditorNota(); return; }
      fecharEditorNota();
      notaAberta = f.nome;

      var editor = document.createElement('div');
      editor.className = 'file-nota-editor';

      var ta = document.createElement('textarea');
      ta.maxLength = NOTA_MAX;
      ta.placeholder = 'Nota explicativa do anexo...';
      ta.value = f.nota || '';
      editor.appendChild(ta);

      var acoes = document.createElement('div');
      acoes.className = 'file-nota-acoes';

      var contador = document.createElement('span');
      contador.className = 'file-nota-contador';
      var atualizarContador = function() {
        contador.textContent = (NOTA_MAX - ta.value.length) + ' caracteres restantes';
      };
      ta.addEventListener('input', atualizarContador);
      atualizarContador();
      acoes.appendChild(contador);

      var btnCancelar = document.createElement('button');
      btnCancelar.type = 'button';
      btnCancelar.className = 'btn btn-outline';
      btnCancelar.innerHTML = '<i class="ph ph-x"></i> Cancelar';
      btnCancelar.addEventListener('click', fecharEditorNota);
      acoes.appendChild(btnCancelar);

      var btnSalvarNota = document.createElement('button');
      btnSalvarNota.type = 'button';
      btnSalvarNota.className = 'btn btn-primary';
      btnSalvarNota.innerHTML = '<i class="ph ph-check"></i> Salvar';
      btnSalvarNota.addEventListener('click', function() {
        salvarNota(f.nome, ta.value, btnSalvarNota);
      });
      acoes.appendChild(btnSalvarNota);

      editor.appendChild(acoes);
      infoEl.appendChild(editor);
      ta.focus();
    }

    function salvarNota(nome, texto, btnEl) {
      if (texto.length > NOTA_MAX) {
        alert('A nota excede o limite de ' + NOTA_MAX + ' caracteres.');
        return;
      }
      if (btnEl) btnEl.disabled = true;
      var formData = new FormData();
      formData.append('livro', config.getLivro());
      formData.append('pagina', config.getPagina());
      formData.append('nome', nome);
      formData.append('texto', texto);
      fetch(API + '/nota', { method: 'POST', body: formData })
        .then(function(resp) {
          if (!resp.ok) return resp.json().then(function(data) { throw new Error(data.erro || 'Erro ao salvar nota.'); });
          return resp.json();
        })
        .then(function(data) {
          // A resposta traz a lista completa atualizada; re-render fecha o editor
          renderizar(data.arquivos || []);
        })
        .catch(function(err) {
          if (btnEl) btnEl.disabled = false;
          alert(err.message || 'Erro ao salvar nota.');
        });
    }

    function excluirAnexo(nome) {
      if (!confirm('Deseja excluir o anexo "' + nome + '"?')) return;
      var url = API + '/excluir?livro=' + encodeURIComponent(config.getLivro()) +
                '&pagina=' + encodeURIComponent(config.getPagina()) +
                '&nome=' + encodeURIComponent(nome);
      fetch(url, { method: 'DELETE', headers: apiHeaders() })
        .then(function(resp) {
          if (!resp.ok) return resp.json().then(function(data) { throw new Error(data.erro || 'Erro ao excluir anexo.'); });
          return resp.json();
        })
        .then(function(data) { renderizar(data.arquivos || []); })
        .catch(function(err) { alert(err.message || 'Erro ao excluir anexo.'); });
    }

    function enviarAnexos(files) {
      var livro = config.getLivro();
      var pagina = config.getPagina();
      if (!livro || !pagina) return;
      var total = files.length;
      var enviados = 0;
      var falhas = [];
      var ultimaLista = null;
      var cadeia = Promise.resolve();

      for (var i = 0; i < total; i++) {
        (function(file, idx) {
          cadeia = cadeia.then(function() {
            mostrarMsgUpload('info', 'Enviando ' + (idx + 1) + ' de ' + total + '...');

            var ext = file.name.indexOf('.') !== -1 ? file.name.split('.').pop().toLowerCase() : '';
            if (ALLOWED_EXT.indexOf(ext) === -1) {
              falhas.push(escapeHtml(file.name) + ' — Extensão ".' + escapeHtml(ext) + '" não permitida.');
              return;
            }
            if (file.size > MAX_SIZE) {
              falhas.push(escapeHtml(file.name) + ' — Arquivo excede o tamanho máximo de 100 MB.');
              return;
            }

            var formData = new FormData();
            formData.append('livro', livro);
            formData.append('pagina', pagina);
            formData.append('arquivo', file);
            return fetch(API + '/upload', { method: 'POST', body: formData })
              .then(function(resp) {
                if (!resp.ok) return resp.json().then(function(data) { throw new Error(data.erro || 'Erro ao enviar arquivo.'); });
                return resp.json();
              })
              .then(function(data) {
                enviados++;
                if (data && data.arquivos) ultimaLista = data.arquivos;
              })
              .catch(function(err) {
                falhas.push(escapeHtml(file.name) + ' — ' + escapeHtml(err.message || 'Erro ao enviar arquivo.'));
              });
          });
        })(files[i], i);
      }

      cadeia.then(function() {
        // Re-render único ao final do lote, com a lista da última resposta bem-sucedida
        if (ultimaLista) {
          renderizar(ultimaLista);
        }
        if (falhas.length === 0) {
          mostrarMsgUpload('success', total === 1 ? 'Arquivo enviado com sucesso.' : total + ' arquivos enviados com sucesso.');
          setTimeout(function() { esconderMsgUpload(); }, 4000);
        } else {
          var tipo = enviados === 0 ? 'error' : 'warning';
          mostrarMsgUpload(tipo, enviados + ' de ' + total + ' anexados. Falhou: ' + falhas.join('; '));
        }
      });
    }

    function carregar() {
      var livro = config.getLivro();
      var pagina = config.getPagina();
      var container = el(ids.filesList);
      if (!container || !livro || !pagina) return;
      fetch(API + '/listar?livro=' + encodeURIComponent(livro) +
            '&pagina=' + encodeURIComponent(pagina), { headers: apiHeaders() })
        .then(function(resp) {
          if (!resp.ok) return resp.json().then(function(data) { throw new Error(data.erro || 'Erro ao carregar anexos.'); });
          return resp.json();
        })
        .then(function(data) {
          renderizar(data.arquivos || []);
        })
        .catch(function(err) {
          console.error('Erro ao carregar anexos:', err);
          container.innerHTML = '<div class="files-empty">Erro ao carregar anexos.</div>';
        });
    }

    function limpar() {
      renderizar([]);
      esconderMsgUpload();
    }

    function setCardClicavel(clicavel) {
      cardClicavel = !!clicavel;
      var card = el(ids.docsCard);
      if (!card) return;
      if (cardClicavel) card.classList.add('ctrl-docs-clicavel');
      else card.classList.remove('ctrl-docs-clicavel');
    }

    // ── Wiring ──
    var btnSelect = el(ids.btnSelect);
    var fileInput = el(ids.fileInput);
    if (btnSelect && fileInput) {
      // Área de upload visível somente para quem pode anexar (e sem travamento)
      atualizarAreaUpload();
      btnSelect.addEventListener('click', function() { fileInput.click(); });
      fileInput.addEventListener('change', function() {
        if (estaTravado()) { fileInput.value = ''; return; } // seguro extra (flag local)
        var lista = fileInput.files;
        if (!lista || lista.length === 0) return;
        // Copia para array antes de limpar o input (limpar esvazia o FileList)
        var files = [];
        for (var fi = 0; fi < lista.length; fi++) { files.push(lista[fi]); }
        fileInput.value = '';
        enviarAnexos(files);
      });
    }

    var docsCard = el(ids.docsCard);
    if (docsCard) {
      docsCard.addEventListener('click', function() {
        if (cardClicavel) config.aoClicarCard();
      });
    }

    return {
      carregar: carregar,
      renderizar: renderizar,
      limpar: limpar,
      setCardClicavel: setCardClicavel
    };
  }

  window.AnexosAtos = { criar: criar };
})();
