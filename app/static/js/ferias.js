/* ferias.js - Controle de Ferias (pagina /ferias). ES5 estrito; IIFE.
   Leva 1: aba Funcionarios via /api/ferias/funcionarios (GET, POST, PATCH).
   Leva 2: aba Periodos Aquisitivos via /api/ferias/periodos (GET, POST, PATCH,
   POST /excluir); saldo e avisos vem calculados do servidor.
   Leva 3: aba Ferias (painel do periodo: abono, observacoes, blocos de gozo)
   via GET /api/ferias/periodos/<id> e /api/ferias/blocos (POST, PATCH,
   POST /excluir); toda resposta traz o periodo recalculado. Deep link
   ?funcionario=<id> abre a aba Ferias com o funcionario selecionado.
   Leva 5: alerta de vencimento do periodo concessivo. O campo "vencimento"
   de cada periodo vem calculado do servidor (situacao ok/proximo/vencido +
   mensagem); o card #cardVencimentos no topo (GET /api/ferias/vencimentos,
   em segundo plano) lista os proximos/vencidos de funcionarios ativos e o
   clique num item abre o painel da aba Ferias via os ids pendentes do deep
   link; a aba Periodos ganha um badge extra e o painel uma linha de prazo.
   Convencoes: datas sem hora sao strings 'YYYY-MM-DD' comparadas por string;
   a aritmetica de data (sugestao de fim do periodo, duracao de um bloco) e
   sempre construida a partir das partes (ano, mes, dia), nunca da string ISO.
   Feedback pelo mostrarToast global de base.html; zero em-dash. */
(function() {
  'use strict';

  var API = '/api/ferias';
  var COR_RE = /^#[0-9A-Fa-f]{6}$/;
  var COR_PADRAO = '#2563EB';
  var DIAS_DIREITO_PADRAO = 30;
  var MS_POR_DIA = 86400000;

  /* ---------- Estado: funcionarios ---------- */

  var funcionarios = [];
  var mostrarInativos = false;
  var editandoId = null;

  /* ---------- Estado: periodos aquisitivos ---------- */

  var periodos = [];
  var mostrarConcluidos = false;
  var editandoPeriodoId = null;
  var perFuncionarioId = null;
  var perSugestaoFim = '';

  /* ---------- Estado: aba ferias ---------- */

  var ferFuncionarioId = null;
  var ferPeriodos = [];
  var ferPeriodoAtual = null;
  var ferMostrarConcluidos = false;
  var editandoBlocoId = null;
  var ferPreSelecionarId = null;
  var ferPreSelecionarPeriodoId = null;

  /* ---------- Estado: vencimentos do periodo concessivo ---------- */

  var vencimentos = [];
  var vencJanelaDias = 0;

  /* ---------- Helpers ---------- */

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatarDataBR(iso) {
    if (!iso) return '-';
    var partes = String(iso).split('-');
    if (partes.length < 3) return String(iso);
    return partes[2] + '/' + partes[1] + '/' + partes[0];
  }

  function mostrarOverlay(ativo) {
    var el = document.getElementById('overlay');
    if (!el) return;
    if (ativo) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  }

  function requisitar(metodo, url, body) {
    var opcoes = { method: metodo, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opcoes.body = JSON.stringify(body);
    return fetch(url, opcoes).then(function(r) {
      return r.json().then(function(json) {
        if (!r.ok || !json.ok) {
          throw new Error(json.erro || 'Erro na requisição.');
        }
        return json;
      }, function() {
        throw new Error('Resposta inválida do servidor.');
      });
    });
  }

  function encontrarFuncionario(id) {
    for (var i = 0; i < funcionarios.length; i++) {
      if (funcionarios[i].id === id) return funcionarios[i];
    }
    return null;
  }

  function encontrarPeriodo(id) {
    for (var i = 0; i < periodos.length; i++) {
      if (periodos[i].id === id) return periodos[i];
    }
    return null;
  }

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function inteiroOuZero(valor) {
    var n = parseInt(valor, 10);
    return isNaN(n) ? 0 : n;
  }

  function pluralDias(n) {
    return n === 1 ? '1 dia' : n + ' dias';
  }

  /* Partes numericas de 'YYYY-MM-DD' ([ano, mes, dia]) ou null. */
  function partesData(iso) {
    var partes = String(iso || '').split('-');
    if (partes.length < 3) return null;
    var ano = parseInt(partes[0], 10);
    var mes = parseInt(partes[1], 10);
    var dia = parseInt(partes[2], 10);
    if (isNaN(ano) || isNaN(mes) || isNaN(dia)) return null;
    return [ano, mes, dia];
  }

  /* Dias corridos entre duas datas ISO, inclusivas nas pontas (espelho do
     _dias_entre do servidor). Usa Date.UTC a partir das partes, que nao sofre
     de fuso nem de horario de verao; NaN se alguma data for invalida. */
  function diasEntreIso(inicio, fim) {
    var a = partesData(inicio);
    var b = partesData(fim);
    if (!a || !b) return NaN;
    var ms = Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2]);
    return Math.round(ms / MS_POR_DIA) + 1;
  }

  /* Leitura da query string (copia do padrao do Painel v2, index.js):
     parser manual, tolerante a par malformado. */
  function lerQueryString() {
    var out = {};
    var q = window.location.search || '';
    if (q.charAt(0) === '?') q = q.substring(1);
    if (!q) return out;
    var partes = q.split('&');
    for (var i = 0; i < partes.length; i++) {
      if (!partes[i]) continue;
      var par = partes[i].split('=');
      try {
        var chave = decodeURIComponent(par[0].replace(/\+/g, ' '));
        var valor = par.length > 1 ? decodeURIComponent(par.slice(1).join('=').replace(/\+/g, ' ')) : '';
        out[chave] = valor;
      } catch (e) {
        // par malformado (ex.: % solto): ignora sem derrubar o init
      }
    }
    return out;
  }

  /* Sugestao de fim do periodo aquisitivo: inicio + 1 ano - 1 dia.
     Constroi a data a partir das partes (nunca a partir da string ISO) e
     formata de volta com pad; devolve '' se o inicio for invalido. */
  function sugerirFimPeriodo(inicioIso) {
    var partes = String(inicioIso || '').split('-');
    if (partes.length < 3) return '';
    var ano = parseInt(partes[0], 10);
    var mes = parseInt(partes[1], 10);
    var dia = parseInt(partes[2], 10);
    if (isNaN(ano) || isNaN(mes) || isNaN(dia)) return '';
    var d = new Date(ano, mes - 1, dia);
    if (isNaN(d.getTime())) return '';
    d.setFullYear(d.getFullYear() + 1);
    d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* ---------- Abas ---------- */

  function ativarAba(nome) {
    var botoes = document.querySelectorAll('.tab-btn');
    var paineis = document.querySelectorAll('.tab-content');
    var i;
    for (i = 0; i < botoes.length; i++) {
      if (botoes[i].getAttribute('data-tab') === nome) {
        botoes[i].classList.add('active');
      } else {
        botoes[i].classList.remove('active');
      }
    }
    for (i = 0; i < paineis.length; i++) {
      if (paineis[i].id === 'tab-' + nome) {
        paineis[i].classList.add('active');
      } else {
        paineis[i].classList.remove('active');
      }
    }
    if (nome === 'periodos') {
      carregarSelectFuncionarios();
    } else if (nome === 'ferias') {
      carregarSelectFuncionariosFerias();
    }
  }

  /* Preenche um select com os funcionarios ativos, preservando a selecao
     atual se ela ainda existir; chama aoTerminar(lista) so em sucesso.
     Compartilhado pelas abas Periodos e Ferias. */
  function preencherSelectFuncionarios(selectId, aoTerminar) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    var selecionadoAntes = sel.value;

    requisitar('GET', API + '/funcionarios').then(function(json) {
      var lista = json.funcionarios || [];
      var html = '<option value="">Selecione...</option>';
      var aindaExiste = false;
      for (var i = 0; i < lista.length; i++) {
        var id = parseInt(lista[i].id, 10);
        html += '<option value="' + id + '">' + escapeHtml(lista[i].nome) + '</option>';
        if (String(id) === selecionadoAntes) aindaExiste = true;
      }
      sel.innerHTML = html;
      sel.value = aindaExiste ? selecionadoAntes : '';
      if (aoTerminar) aoTerminar(lista);
    }, function(e) {
      mostrarToast(e.message, 'error');
    });
  }

  /* ---------- Funcionarios: carga e tabela ---------- */

  function carregarFuncionarios() {
    mostrarOverlay(true);
    var url = API + '/funcionarios' + (mostrarInativos ? '?incluir_inativos=1' : '');
    requisitar('GET', url).then(function(json) {
      funcionarios = json.funcionarios || [];
      renderizarTabela();
      mostrarOverlay(false);
    }, function(e) {
      funcionarios = [];
      renderizarErro(e.message);
      mostrarOverlay(false);
      mostrarToast(e.message, 'error');
    });
  }

  function renderizarErro(mensagem) {
    var cont = document.getElementById('funcTabela');
    if (!cont) return;
    cont.innerHTML = '<p class="ferias-vazio">Não foi possível carregar os funcionários. ' + escapeHtml(mensagem || '') + '</p>';
  }

  function renderizarTabela() {
    var cont = document.getElementById('funcTabela');
    if (!cont) return;

    if (!funcionarios.length) {
      cont.innerHTML = '<p class="ferias-vazio">'
        + (mostrarInativos ? 'Nenhum funcionário cadastrado.' : 'Nenhum funcionário ativo.')
        + '</p>';
      return;
    }

    var html = '<div class="table-wrapper"><table class="report-table ferias-tabela"><thead><tr>'
      + '<th class="ferias-col-cor"></th>'
      + '<th>Nome</th>'
      + '<th>Admissão</th>'
      + '<th>Status</th>'
      + '<th class="ferias-col-acoes">Ações</th>'
      + '</tr></thead><tbody>';

    for (var i = 0; i < funcionarios.length; i++) {
      var f = funcionarios[i];
      var id = parseInt(f.id, 10);
      var cor = COR_RE.test(String(f.cor || '')) ? String(f.cor) : '';
      var swatch = cor
        ? '<span class="ferias-swatch" style="background:' + cor + '" title="' + escapeHtml(cor) + '"></span>'
        : '<span class="ferias-swatch"></span>';
      var badge = f.ativo
        ? '<span class="badge badge-success">Ativo</span>'
        : '<span class="badge badge-neutral">Inativo</span>';
      var botaoAtivo = f.ativo
        ? '<button type="button" class="btn-icon" data-acao="inativar" data-id="' + id + '" title="Inativar"><i class="ph ph-prohibit"></i></button>'
        : '<button type="button" class="btn-icon" data-acao="reativar" data-id="' + id + '" title="Reativar"><i class="ph ph-arrow-counter-clockwise"></i></button>';

      html += '<tr' + (f.ativo ? '' : ' class="ferias-linha-inativa"') + '>'
        + '<td class="ferias-col-cor">' + swatch + '</td>'
        + '<td>' + escapeHtml(f.nome) + '</td>'
        + '<td>' + escapeHtml(formatarDataBR(f.data_admissao)) + '</td>'
        + '<td>' + badge + '</td>'
        + '<td class="ferias-col-acoes">'
        + '<button type="button" class="btn-icon" data-acao="editar" data-id="' + id + '" title="Editar"><i class="ph ph-pencil-simple"></i></button>'
        + botaoAtivo
        + '</td>'
        + '</tr>';
    }

    html += '</tbody></table></div>';
    cont.innerHTML = html;
  }

  /* ---------- Funcionarios: formulario ---------- */

  function mostrarForm(visivel) {
    var form = document.getElementById('funcForm');
    if (form) form.style.display = visivel ? '' : 'none';
  }

  function limparForm() {
    document.getElementById('funcNome').value = '';
    document.getElementById('funcCor').value = COR_PADRAO;
    document.getElementById('funcAdmissao').value = '';
    document.getElementById('funcId').value = '';
  }

  function abrirFormNovo() {
    limparForm();
    editandoId = null;
    document.getElementById('funcFormTitulo').textContent = 'Novo funcionário';
    mostrarForm(true);
    document.getElementById('funcNome').focus();
  }

  function abrirFormEditar(id) {
    var f = encontrarFuncionario(id);
    if (!f) return;
    limparForm();
    editandoId = id;
    document.getElementById('funcNome').value = f.nome || '';
    if (COR_RE.test(String(f.cor || ''))) {
      document.getElementById('funcCor').value = String(f.cor);
    }
    document.getElementById('funcAdmissao').value = f.data_admissao || '';
    document.getElementById('funcId').value = String(id);
    document.getElementById('funcFormTitulo').textContent = 'Editar funcionário';
    mostrarForm(true);
    document.getElementById('funcNome').focus();
  }

  function fecharForm() {
    mostrarForm(false);
    limparForm();
    editandoId = null;
  }

  function salvarFuncionario() {
    var nomeInput = document.getElementById('funcNome');
    var nome = (nomeInput.value || '').replace(/\s+/g, ' ').trim();
    if (!nome) {
      mostrarToast('Informe o nome do funcionário.', 'error');
      nomeInput.focus();
      return;
    }

    var body = {
      nome: nome,
      cor: document.getElementById('funcCor').value,
      data_admissao: document.getElementById('funcAdmissao').value || null
    };
    var editando = editandoId !== null;
    var metodo = editando ? 'PATCH' : 'POST';
    var url = API + '/funcionarios' + (editando ? '/' + editandoId : '');
    var btn = document.getElementById('btnSalvarFuncionario');

    btn.disabled = true;
    requisitar(metodo, url, body).then(function() {
      btn.disabled = false;
      mostrarToast(editando ? 'Funcionário atualizado.' : 'Funcionário cadastrado.', 'success');
      fecharForm();
      carregarFuncionarios();
      if (editando) carregarVencimentos();
    }, function(e) {
      btn.disabled = false;
      mostrarToast(e.message, 'error');
      nomeInput.focus();
    });
  }

  function alternarAtivo(id) {
    var f = encontrarFuncionario(id);
    if (!f) return;
    var mensagem = f.ativo
      ? 'Inativar o funcionário ' + f.nome + '? Ele deixará de aparecer nas listas, mas o histórico é preservado.'
      : 'Reativar o funcionário ' + f.nome + '?';
    if (!window.confirm(mensagem)) return;

    var novoAtivo = !f.ativo;
    requisitar('PATCH', API + '/funcionarios/' + id, { ativo: novoAtivo }).then(function() {
      mostrarToast(novoAtivo ? 'Funcionário reativado.' : 'Funcionário inativado.', 'success');
      if (editandoId === id) fecharForm();
      carregarFuncionarios();
      carregarVencimentos();
    }, function(e) {
      mostrarToast(e.message, 'error');
    });
  }

  /* Delegacao de eventos na tabela: um unico listener, le data-acao/data-id */
  function aoClicarTabela(ev) {
    var alvo = ev.target;
    while (alvo && alvo !== this) {
      if (alvo.getAttribute && alvo.getAttribute('data-acao')) break;
      alvo = alvo.parentNode;
    }
    if (!alvo || alvo === this) return;

    var acao = alvo.getAttribute('data-acao');
    var id = parseInt(alvo.getAttribute('data-id'), 10);
    if (!id) return;

    if (acao === 'editar') {
      abrirFormEditar(id);
    } else if (acao === 'inativar' || acao === 'reativar') {
      alternarAtivo(id);
    }
  }

  /* ---------- Periodos: select de funcionarios ---------- */

  /* Sincroniza perFuncionarioId e o botao "Novo periodo" com o select. */
  function sincronizarFuncionarioSelecionado() {
    var sel = document.getElementById('perFuncionario');
    var valor = sel ? parseInt(sel.value, 10) : NaN;
    perFuncionarioId = valor > 0 ? valor : null;
    var btn = document.getElementById('btnNovoPeriodo');
    if (btn) btn.disabled = !perFuncionarioId;
  }

  /* Chamada a cada ativacao da aba: reflete cadastros feitos na aba
     Funcionarios sem recarregar a pagina. Lista so os ativos e preserva a
     selecao atual se ela ainda existir. */
  function carregarSelectFuncionarios() {
    preencherSelectFuncionarios('perFuncionario', function() {
      sincronizarFuncionarioSelecionado();
      if (perFuncionarioId) {
        carregarPeriodos();
      } else {
        if (editandoPeriodoId !== null) fecharFormPeriodo();
        periodos = [];
        renderizarPeriodos();
      }
    });
  }

  function aoTrocarFuncionario() {
    sincronizarFuncionarioSelecionado();
    fecharFormPeriodo();
    carregarPeriodos();
  }

  /* ---------- Periodos: carga e tabela ---------- */

  function carregarPeriodos() {
    if (!perFuncionarioId) {
      periodos = [];
      renderizarPeriodos();
      return;
    }
    mostrarOverlay(true);
    var url = API + '/periodos?funcionario_id=' + perFuncionarioId
      + (mostrarConcluidos ? '&incluir_concluidos=1' : '');
    requisitar('GET', url).then(function(json) {
      periodos = json.periodos || [];
      renderizarPeriodos();
      mostrarOverlay(false);
    }, function(e) {
      periodos = [];
      renderizarPeriodosErro(e.message);
      mostrarOverlay(false);
      mostrarToast(e.message, 'error');
    });
  }

  function renderizarPeriodosErro(mensagem) {
    var cont = document.getElementById('perTabela');
    if (!cont) return;
    cont.innerHTML = '<p class="ferias-vazio">Não foi possível carregar os períodos. ' + escapeHtml(mensagem || '') + '</p>';
  }

  function formatarPeriodo(p) {
    return formatarDataBR(p.inicio) + ' a ' + formatarDataBR(p.fim);
  }

  function renderizarPeriodos() {
    var cont = document.getElementById('perTabela');
    if (!cont) return;

    if (!perFuncionarioId) {
      cont.innerHTML = '<p class="ferias-vazio">Selecione um funcionário.</p>';
      return;
    }
    if (!periodos.length) {
      cont.innerHTML = '<p class="ferias-vazio">'
        + (mostrarConcluidos ? 'Nenhum período cadastrado.' : 'Nenhum período em aberto.')
        + '</p>';
      return;
    }

    var html = '<div class="table-wrapper"><table class="report-table ferias-tabela"><thead><tr>'
      + '<th>Período</th>'
      + '<th>Direito</th>'
      + '<th>Abono</th>'
      + '<th>Gozados</th>'
      + '<th>Saldo</th>'
      + '<th>Status</th>'
      + '<th>Avisos</th>'
      + '<th class="ferias-col-acoes">Ações</th>'
      + '</tr></thead><tbody>';

    for (var i = 0; i < periodos.length; i++) {
      var p = periodos[i];
      var id = parseInt(p.id, 10);
      var saldo = inteiroOuZero(p.saldo);
      var avisos = p.avisos || [];
      var temBlocos = inteiroOuZero(p.qtd_blocos) > 0;

      var saldoHtml = saldo < 0
        ? '<span class="ferias-saldo-negativo">' + saldo + '</span>'
        : String(saldo);
      var badge = p.concluido
        ? '<span class="badge badge-neutral">Concluído</span>'
        : '<span class="badge badge-success">Aberto</span>';
      var venc = p.vencimento || null;
      var vencido = !!(venc && venc.situacao === 'vencido');
      if (venc && venc.situacao !== 'ok') {
        badge += ' <span class="badge ' + classeBadgeVenc(venc.situacao) + '" title="' + escapeHtml(venc.mensagem || '') + '">'
          + escapeHtml(textoBadgeVenc(venc, true)) + '</span>';
      }
      var classesLinha = [];
      if (p.concluido) classesLinha.push('ferias-linha-concluida');
      if (vencido) classesLinha.push('ferias-linha-vencida');
      var avisoHtml = avisos.length
        ? '<span class="ferias-aviso" title="' + escapeHtml(avisos.join(' · ')) + '"><i class="ph ph-warning"></i> ' + avisos.length + '</span>'
        : '';
      var botaoExcluir = '<button type="button" class="btn-icon" data-acao="excluir" data-id="' + id + '"'
        + (temBlocos ? ' disabled title="Há blocos de férias registrados"' : ' title="Excluir"')
        + '><i class="ph ph-trash"></i></button>';

      html += '<tr' + (classesLinha.length ? ' class="' + classesLinha.join(' ') + '"' : '') + '>'
        + '<td>' + escapeHtml(formatarPeriodo(p)) + '</td>'
        + '<td>' + inteiroOuZero(p.dias_direito) + '</td>'
        + '<td>' + inteiroOuZero(p.abono_dias) + '</td>'
        + '<td>' + inteiroOuZero(p.dias_gozados) + '</td>'
        + '<td>' + saldoHtml + '</td>'
        + '<td>' + badge + '</td>'
        + '<td>' + avisoHtml + '</td>'
        + '<td class="ferias-col-acoes">'
        + '<button type="button" class="btn-icon" data-acao="editar" data-id="' + id + '" title="Editar"><i class="ph ph-pencil-simple"></i></button>'
        + botaoExcluir
        + '</td>'
        + '</tr>';
    }

    html += '</tbody></table></div>';
    cont.innerHTML = html;
  }

  /* ---------- Periodos: formulario ---------- */

  function mostrarFormPeriodo(visivel) {
    var form = document.getElementById('perForm');
    if (form) form.style.display = visivel ? '' : 'none';
  }

  function limparFormPeriodo() {
    document.getElementById('perInicio').value = '';
    document.getElementById('perFim').value = '';
    document.getElementById('perDiasDireito').value = String(DIAS_DIREITO_PADRAO);
    document.getElementById('perId').value = '';
    perSugestaoFim = '';
  }

  function abrirFormNovoPeriodo() {
    if (!perFuncionarioId) return;
    limparFormPeriodo();
    editandoPeriodoId = null;
    document.getElementById('perFormTitulo').textContent = 'Novo período';
    mostrarFormPeriodo(true);
    document.getElementById('perInicio').focus();
  }

  function abrirFormEditarPeriodo(id) {
    var p = encontrarPeriodo(id);
    if (!p) return;
    limparFormPeriodo();
    editandoPeriodoId = id;
    document.getElementById('perInicio').value = p.inicio || '';
    document.getElementById('perFim').value = p.fim || '';
    document.getElementById('perDiasDireito').value = String(inteiroOuZero(p.dias_direito));
    document.getElementById('perId').value = String(id);
    document.getElementById('perFormTitulo').textContent = 'Editar período';
    mostrarFormPeriodo(true);
    document.getElementById('perInicio').focus();
  }

  function fecharFormPeriodo() {
    mostrarFormPeriodo(false);
    limparFormPeriodo();
    editandoPeriodoId = null;
  }

  /* Preenche o fim sugerido so se estiver vazio ou igual a sugestao anterior,
     para nao sobrescrever uma edicao manual. */
  function aoMudarInicioPeriodo() {
    var inicio = document.getElementById('perInicio').value;
    var fimInput = document.getElementById('perFim');
    var sugestao = sugerirFimPeriodo(inicio);
    if (!sugestao) return;
    if (!fimInput.value || fimInput.value === perSugestaoFim) {
      fimInput.value = sugestao;
    }
    perSugestaoFim = sugestao;
  }

  function salvarPeriodo() {
    var inicioInput = document.getElementById('perInicio');
    var fimInput = document.getElementById('perFim');
    var diasInput = document.getElementById('perDiasDireito');
    var inicio = inicioInput.value;
    var fim = fimInput.value;

    if (!inicio) {
      mostrarToast('Informe a data inicial.', 'error');
      inicioInput.focus();
      return;
    }
    if (!fim) {
      mostrarToast('Informe a data final.', 'error');
      fimInput.focus();
      return;
    }
    if (fim < inicio) {
      mostrarToast('A data final deve ser igual ou posterior à inicial.', 'error');
      fimInput.focus();
      return;
    }
    var diasDireito = diasInput.value === '' ? DIAS_DIREITO_PADRAO : parseInt(diasInput.value, 10);
    if (isNaN(diasDireito) || diasDireito < 0 || diasDireito > 60) {
      mostrarToast('Dias de direito inválidos (0 a 60).', 'error');
      diasInput.focus();
      return;
    }

    var editando = editandoPeriodoId !== null;
    var body = { inicio: inicio, fim: fim, dias_direito: diasDireito };
    if (!editando) {
      if (!perFuncionarioId) {
        mostrarToast('Selecione um funcionário.', 'error');
        return;
      }
      body.funcionario_id = perFuncionarioId;
    }
    var metodo = editando ? 'PATCH' : 'POST';
    var url = API + '/periodos' + (editando ? '/' + editandoPeriodoId : '');
    var btn = document.getElementById('btnSalvarPeriodo');

    btn.disabled = true;
    requisitar(metodo, url, body).then(function() {
      btn.disabled = false;
      mostrarToast(editando ? 'Período atualizado.' : 'Período cadastrado.', 'success');
      fecharFormPeriodo();
      carregarPeriodos();
      carregarVencimentos();
    }, function(e) {
      btn.disabled = false;
      mostrarToast(e.message, 'error');
    });
  }

  function excluirPeriodo(id) {
    var p = encontrarPeriodo(id);
    if (!p) return;
    var mensagem = 'Excluir o período ' + formatarPeriodo(p) + '? A exclusão é lógica e pode ser revista no banco.';
    if (!window.confirm(mensagem)) return;

    requisitar('POST', API + '/periodos/' + id + '/excluir').then(function() {
      mostrarToast('Período excluído.', 'success');
      if (editandoPeriodoId === id) fecharFormPeriodo();
      carregarPeriodos();
      carregarVencimentos();
    }, function(e) {
      mostrarToast(e.message, 'error');
    });
  }

  function aoClicarTabelaPeriodos(ev) {
    var alvo = ev.target;
    while (alvo && alvo !== this) {
      if (alvo.getAttribute && alvo.getAttribute('data-acao')) break;
      alvo = alvo.parentNode;
    }
    if (!alvo || alvo === this) return;
    if (alvo.disabled) return;

    var acao = alvo.getAttribute('data-acao');
    var id = parseInt(alvo.getAttribute('data-id'), 10);
    if (!id) return;

    if (acao === 'editar') {
      abrirFormEditarPeriodo(id);
    } else if (acao === 'excluir') {
      excluirPeriodo(id);
    }
  }

  /* ---------- Ferias: selecao de funcionario e periodo ---------- */

  function limparSelectPeriodosFerias() {
    var sel = document.getElementById('ferPeriodo');
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione...</option>';
    sel.value = '';
    sel.disabled = true;
    ferPeriodos = [];
  }

  function lerFuncionarioFerias() {
    var sel = document.getElementById('ferFuncionario');
    var valor = sel ? parseInt(sel.value, 10) : NaN;
    return valor > 0 ? valor : null;
  }

  /* Chamada a cada ativacao da aba Ferias (e pelo deep link): recarrega o
     select de funcionarios ativos; se a selecao sobreviveu, recarrega os
     periodos; senao, reseta o painel. ferPreSelecionarId (deep link) e
     consumido aqui uma unica vez. */
  function carregarSelectFuncionariosFerias() {
    var pendente = ferPreSelecionarId;
    ferPreSelecionarId = null;

    preencherSelectFuncionarios('ferFuncionario', function(lista) {
      var sel = document.getElementById('ferFuncionario');
      if (pendente) {
        var existe = false;
        for (var i = 0; i < lista.length; i++) {
          if (parseInt(lista[i].id, 10) === pendente) existe = true;
        }
        if (existe) {
          sel.value = String(pendente);
        } else {
          sel.value = '';
          mostrarToast('Funcionário não encontrado ou inativo.', 'warning');
        }
      }
      var novoId = lerFuncionarioFerias();
      var mudou = novoId !== ferFuncionarioId;
      ferFuncionarioId = novoId;
      if (!ferFuncionarioId || mudou) {
        limparSelectPeriodosFerias();
        resetarPainel();
      }
      if (ferFuncionarioId) carregarPeriodosFerias(false);
    });
  }

  function aoTrocarFuncionarioFerias() {
    ferFuncionarioId = lerFuncionarioFerias();
    limparSelectPeriodosFerias();
    resetarPainel();
    if (ferFuncionarioId) carregarPeriodosFerias(false);
  }

  /* Recarrega o select de periodos do funcionario. silencioso = true nas
     atualizacoes em segundo plano (sem overlay). Mantem a selecao quando
     possivel; se o periodo atual acabou de sair da lista (concluiu com o
     toggle desligado), sua option e acrescentada ao final. Com um unico
     periodo e nenhuma selecao previa, seleciona-o e abre o painel. */
  function carregarPeriodosFerias(silencioso) {
    var sel = document.getElementById('ferPeriodo');
    if (!sel) return;
    if (!ferFuncionarioId) {
      limparSelectPeriodosFerias();
      resetarPainel();
      return;
    }
    var selecionadoAntes = ferPeriodoAtual ? String(ferPeriodoAtual.id) : (sel.value || '');
    /* Periodo pendente (clique no card de vencimentos): consumido aqui. */
    var periodoPendente = ferPreSelecionarPeriodoId;
    ferPreSelecionarPeriodoId = null;
    if (!silencioso) mostrarOverlay(true);

    var url = API + '/periodos?funcionario_id=' + ferFuncionarioId
      + (ferMostrarConcluidos ? '&incluir_concluidos=1' : '');
    requisitar('GET', url).then(function(json) {
      ferPeriodos = json.periodos || [];
      var html = '<option value="">Selecione...</option>';
      var aindaExiste = false;
      var pendenteExiste = false;
      for (var i = 0; i < ferPeriodos.length; i++) {
        var p = ferPeriodos[i];
        html += '<option value="' + parseInt(p.id, 10) + '">'
          + escapeHtml(formatarPeriodo(p)) + (p.concluido ? ' (concluído)' : '')
          + '</option>';
        if (String(p.id) === selecionadoAntes) aindaExiste = true;
        if (periodoPendente && parseInt(p.id, 10) === periodoPendente) pendenteExiste = true;
      }
      if (ferPeriodoAtual && !aindaExiste && ferPeriodoAtual.funcionario_id === ferFuncionarioId) {
        html += '<option value="' + parseInt(ferPeriodoAtual.id, 10) + '">'
          + escapeHtml(formatarPeriodo(ferPeriodoAtual)) + (ferPeriodoAtual.concluido ? ' (concluído)' : '')
          + '</option>';
        aindaExiste = true;
      }
      sel.innerHTML = html;
      sel.disabled = false;

      if (periodoPendente && !pendenteExiste) {
        mostrarToast('Período não encontrado.', 'warning');
      }
      if (pendenteExiste) {
        sel.value = String(periodoPendente);
        carregarPainel(periodoPendente);
      } else if (aindaExiste) {
        sel.value = selecionadoAntes;
      } else if (ferPeriodos.length === 1 && !selecionadoAntes) {
        sel.value = String(ferPeriodos[0].id);
        carregarPainel(parseInt(ferPeriodos[0].id, 10));
      } else {
        sel.value = '';
        resetarPainel();
      }
      if (!silencioso) mostrarOverlay(false);
    }, function(e) {
      if (!silencioso) mostrarOverlay(false);
      limparSelectPeriodosFerias();
      resetarPainel();
      mostrarToast(e.message, 'error');
    });
  }

  function aoTrocarPeriodoFerias() {
    var sel = document.getElementById('ferPeriodo');
    var id = sel ? parseInt(sel.value, 10) : NaN;
    if (id > 0) {
      carregarPainel(id);
    } else {
      resetarPainel();
    }
  }

  /* ---------- Ferias: painel do periodo ---------- */

  function carregarPainel(id) {
    mostrarOverlay(true);
    requisitar('GET', API + '/periodos/' + id).then(function(json) {
      ferPeriodoAtual = json.periodo || null;
      fecharFormBloco();
      renderizarPainel(false);
      mostrarOverlay(false);
    }, function(e) {
      mostrarOverlay(false);
      resetarPainel();
      mostrarToast(e.message, 'error');
    });
  }

  function nomeFuncionarioSelecionadoFerias() {
    var sel = document.getElementById('ferFuncionario');
    if (!sel || sel.selectedIndex < 0) return '';
    return sel.options[sel.selectedIndex].text || '';
  }

  /* manterCampos = true preserva o que estiver digitado em abono/observacoes
     (usado apos operacoes de bloco, para nao descartar uma edicao em curso). */
  function renderizarPainel(manterCampos) {
    var p = ferPeriodoAtual;
    if (!p) {
      resetarPainel();
      return;
    }
    document.getElementById('ferVazio').style.display = 'none';
    document.getElementById('ferPainel').style.display = '';

    document.getElementById('ferPainelTitulo').textContent =
      nomeFuncionarioSelecionadoFerias() + ' · ' + formatarPeriodo(p);

    var status = document.getElementById('ferStatus');
    status.textContent = p.concluido ? 'Concluído' : 'Aberto';
    status.className = 'badge ' + (p.concluido ? 'badge-neutral' : 'badge-success');

    var ul = document.getElementById('ferAvisos');
    var avisos = p.avisos || [];
    if (avisos.length) {
      var htmlAvisos = '';
      for (var i = 0; i < avisos.length; i++) {
        htmlAvisos += '<li><i class="ph ph-warning"></i> ' + escapeHtml(avisos[i]) + '</li>';
      }
      ul.innerHTML = htmlAvisos;
      ul.style.display = '';
    } else {
      ul.innerHTML = '';
      ul.style.display = 'none';
    }

    renderizarPrazo(p.vencimento || null);

    var saldo = inteiroOuZero(p.saldo);
    document.getElementById('ferDireito').textContent = String(inteiroOuZero(p.dias_direito));
    document.getElementById('ferAbonoValor').textContent = String(inteiroOuZero(p.abono_dias));
    document.getElementById('ferGozados').textContent = String(inteiroOuZero(p.dias_gozados));
    var saldoEl = document.getElementById('ferSaldo');
    saldoEl.textContent = String(saldo);
    if (saldo < 0) {
      saldoEl.classList.add('ferias-saldo-negativo');
    } else {
      saldoEl.classList.remove('ferias-saldo-negativo');
    }

    if (!manterCampos) {
      document.getElementById('ferAbono').value = String(inteiroOuZero(p.abono_dias));
      document.getElementById('ferObs').value = p.observacoes || '';
    }
    atualizarSaldoPreview();
    renderizarBlocos();
  }

  function resetarPainel() {
    ferPeriodoAtual = null;
    var painel = document.getElementById('ferPainel');
    var vazio = document.getElementById('ferVazio');
    if (painel) painel.style.display = 'none';
    if (vazio) vazio.style.display = '';
    fecharFormBloco();
  }

  /* Saldo projetado com o abono digitado (so aritmetica local; o valor
     oficial vem do servidor apos salvar). Vazio se igual ao abono atual ou
     se o campo estiver invalido. */
  function atualizarSaldoPreview() {
    var out = document.getElementById('ferSaldoPreview');
    var p = ferPeriodoAtual;
    if (!out) return;
    if (!p) {
      out.textContent = '';
      return;
    }
    var valor = document.getElementById('ferAbono').value;
    var abono = valor === '' ? NaN : parseInt(valor, 10);
    if (isNaN(abono) || abono < 0 || abono > 60 || abono === inteiroOuZero(p.abono_dias)) {
      out.textContent = '';
      return;
    }
    var saldo = inteiroOuZero(p.dias_direito) - abono - inteiroOuZero(p.dias_gozados);
    out.textContent = 'Saldo após salvar: ' + pluralDias(saldo);
  }

  function salvarDadosPeriodo() {
    var p = ferPeriodoAtual;
    if (!p) return;
    var abonoInput = document.getElementById('ferAbono');
    var abono = abonoInput.value === '' ? 0 : parseInt(abonoInput.value, 10);
    if (isNaN(abono) || abono < 0 || abono > 60) {
      mostrarToast('Dias de abono inválidos (0 a 60).', 'error');
      abonoInput.focus();
      return;
    }
    var observacoes = document.getElementById('ferObs').value;
    var btn = document.getElementById('btnSalvarPeriodoDados');

    btn.disabled = true;
    mostrarOverlay(true);
    requisitar('PATCH', API + '/periodos/' + p.id, { abono_dias: abono, observacoes: observacoes }).then(function(json) {
      btn.disabled = false;
      mostrarOverlay(false);
      ferPeriodoAtual = json.periodo || ferPeriodoAtual;
      renderizarPainel(false);
      mostrarToast('Abono e observações salvos.', 'success');
      carregarPeriodosFerias(true);
      carregarVencimentos();
    }, function(e) {
      btn.disabled = false;
      mostrarOverlay(false);
      mostrarToast(e.message, 'error');
    });
  }

  /* ---------- Ferias: blocos de gozo ---------- */

  function blocosAtuais() {
    return ferPeriodoAtual ? (ferPeriodoAtual.blocos || []) : [];
  }

  function encontrarBloco(id) {
    var blocos = blocosAtuais();
    for (var i = 0; i < blocos.length; i++) {
      if (blocos[i].id === id) return blocos[i];
    }
    return null;
  }

  function renderizarBlocos() {
    var cont = document.getElementById('blocoTabela');
    if (!cont) return;
    var blocos = blocosAtuais();
    if (!blocos.length) {
      cont.innerHTML = '<p class="ferias-vazio">Nenhum bloco registrado.</p>';
      return;
    }

    var html = '<div class="table-wrapper"><table class="report-table ferias-tabela"><thead><tr>'
      + '<th>Início</th>'
      + '<th>Fim</th>'
      + '<th>Dias</th>'
      + '<th class="ferias-col-acoes">Ações</th>'
      + '</tr></thead><tbody>';

    for (var i = 0; i < blocos.length; i++) {
      var b = blocos[i];
      var id = parseInt(b.id, 10);
      html += '<tr>'
        + '<td>' + escapeHtml(formatarDataBR(b.inicio)) + '</td>'
        + '<td>' + escapeHtml(formatarDataBR(b.fim)) + '</td>'
        + '<td>' + inteiroOuZero(b.dias) + '</td>'
        + '<td class="ferias-col-acoes">'
        + '<button type="button" class="btn-icon" data-acao="editar-bloco" data-id="' + id + '" title="Editar"><i class="ph ph-pencil-simple"></i></button>'
        + '<button type="button" class="btn-icon" data-acao="excluir-bloco" data-id="' + id + '" title="Excluir"><i class="ph ph-trash"></i></button>'
        + '</td>'
        + '</tr>';
    }

    html += '</tbody></table></div>';
    cont.innerHTML = html;
  }

  function mostrarFormBloco(visivel) {
    var form = document.getElementById('blocoForm');
    if (form) form.style.display = visivel ? '' : 'none';
  }

  function limparFormBloco() {
    var inicio = document.getElementById('blocoInicio');
    var fim = document.getElementById('blocoFim');
    var idEl = document.getElementById('blocoId');
    var dias = document.getElementById('blocoDias');
    if (inicio) inicio.value = '';
    if (fim) fim.value = '';
    if (idEl) idEl.value = '';
    if (dias) dias.textContent = '';
  }

  function abrirFormNovoBloco() {
    if (!ferPeriodoAtual) return;
    limparFormBloco();
    editandoBlocoId = null;
    document.getElementById('blocoFormTitulo').textContent = 'Novo bloco';
    mostrarFormBloco(true);
    document.getElementById('blocoInicio').focus();
  }

  function abrirFormEditarBloco(id) {
    var b = encontrarBloco(id);
    if (!b) return;
    limparFormBloco();
    editandoBlocoId = id;
    document.getElementById('blocoInicio').value = b.inicio || '';
    document.getElementById('blocoFim').value = b.fim || '';
    document.getElementById('blocoId').value = String(id);
    document.getElementById('blocoFormTitulo').textContent = 'Editar bloco';
    atualizarBlocoDias();
    mostrarFormBloco(true);
    document.getElementById('blocoInicio').focus();
  }

  function fecharFormBloco() {
    mostrarFormBloco(false);
    limparFormBloco();
    editandoBlocoId = null;
  }

  /* Duracao ao vivo do bloco ("1 dia" / "N dias"); vazio se incompleto ou
     com fim anterior ao inicio. */
  function atualizarBlocoDias() {
    var out = document.getElementById('blocoDias');
    if (!out) return;
    var inicio = document.getElementById('blocoInicio').value;
    var fim = document.getElementById('blocoFim').value;
    if (!inicio || !fim || fim < inicio) {
      out.textContent = '';
      return;
    }
    var n = diasEntreIso(inicio, fim);
    out.textContent = isNaN(n) ? '' : pluralDias(n);
  }

  function salvarBloco() {
    var p = ferPeriodoAtual;
    if (!p) return;
    var inicioInput = document.getElementById('blocoInicio');
    var fimInput = document.getElementById('blocoFim');
    var inicio = inicioInput.value;
    var fim = fimInput.value;

    if (!inicio) {
      mostrarToast('Informe a data inicial.', 'error');
      inicioInput.focus();
      return;
    }
    if (!fim) {
      mostrarToast('Informe a data final.', 'error');
      fimInput.focus();
      return;
    }
    if (fim < inicio) {
      mostrarToast('A data final deve ser igual ou posterior à inicial.', 'error');
      fimInput.focus();
      return;
    }

    var editando = editandoBlocoId !== null;
    var body = editando
      ? { inicio: inicio, fim: fim }
      : { periodo_id: p.id, inicio: inicio, fim: fim };
    var metodo = editando ? 'PATCH' : 'POST';
    var url = API + '/blocos' + (editando ? '/' + editandoBlocoId : '');
    var btn = document.getElementById('btnSalvarBloco');

    btn.disabled = true;
    mostrarOverlay(true);
    requisitar(metodo, url, body).then(function(json) {
      btn.disabled = false;
      mostrarOverlay(false);
      ferPeriodoAtual = json.periodo || ferPeriodoAtual;
      fecharFormBloco();
      renderizarPainel(true);
      mostrarToast(editando ? 'Bloco atualizado.' : 'Bloco registrado.', 'success');
      carregarPeriodosFerias(true);
      carregarVencimentos();
    }, function(e) {
      btn.disabled = false;
      mostrarOverlay(false);
      mostrarToast(e.message, 'error');
    });
  }

  function excluirBloco(id) {
    var b = encontrarBloco(id);
    if (!b) return;
    var mensagem = 'Excluir o bloco de ' + formatarDataBR(b.inicio) + ' a ' + formatarDataBR(b.fim) + '?';
    if (!window.confirm(mensagem)) return;

    mostrarOverlay(true);
    requisitar('POST', API + '/blocos/' + id + '/excluir').then(function(json) {
      mostrarOverlay(false);
      ferPeriodoAtual = json.periodo || ferPeriodoAtual;
      if (editandoBlocoId === id) fecharFormBloco();
      renderizarPainel(true);
      mostrarToast('Bloco excluído.', 'success');
      carregarPeriodosFerias(true);
      carregarVencimentos();
    }, function(e) {
      mostrarOverlay(false);
      mostrarToast(e.message, 'error');
    });
  }

  function aoClicarTabelaBlocos(ev) {
    var alvo = ev.target;
    while (alvo && alvo !== this) {
      if (alvo.getAttribute && alvo.getAttribute('data-acao')) break;
      alvo = alvo.parentNode;
    }
    if (!alvo || alvo === this) return;
    if (alvo.disabled) return;

    var acao = alvo.getAttribute('data-acao');
    var id = parseInt(alvo.getAttribute('data-id'), 10);
    if (!id) return;

    if (acao === 'editar-bloco') {
      abrirFormEditarBloco(id);
    } else if (acao === 'excluir-bloco') {
      excluirBloco(id);
    }
  }

  /* ---------- Vencimentos do periodo concessivo ---------- */

  function classeBadgeVenc(situacao) {
    return situacao === 'vencido' ? 'badge-danger' : 'badge-warning';
  }

  /* Texto do badge: curto na tabela de periodos, completo no card. */
  function textoBadgeVenc(venc, curto) {
    var dias = inteiroOuZero(venc.dias_para_limite);
    if (venc.situacao === 'vencido') {
      return curto ? 'Vencido' : 'Vencido há ' + pluralDias(-dias);
    }
    if (dias === 0) return 'Vence hoje';
    return curto ? 'Vence em ' + dias + ' d' : 'Vence em ' + pluralDias(dias);
  }

  /* Linha de prazo do painel da aba Ferias (sempre visivel para periodo
     aberto, com tom por situacao; oculta quando o vencimento e null). */
  function renderizarPrazo(venc) {
    var el = document.getElementById('ferPrazo');
    if (!el) return;
    el.innerHTML = '';
    if (!venc) {
      el.style.display = 'none';
      el.className = 'ferias-prazo';
      return;
    }
    var situacao = venc.situacao === 'vencido' ? 'vencido' : (venc.situacao === 'proximo' ? 'proximo' : 'ok');
    var icone = document.createElement('i');
    icone.className = 'ph ' + (situacao === 'vencido' ? 'ph-warning-circle' : (situacao === 'proximo' ? 'ph-alarm' : 'ph-clock'));
    var texto = document.createElement('span');
    texto.textContent = String(venc.mensagem || '');
    el.appendChild(icone);
    el.appendChild(texto);
    el.className = 'ferias-prazo ferias-prazo-' + situacao;
    el.style.display = '';
  }

  /* Carga em segundo plano (sem overlay); em erro so console.warn, para o
     card nunca derrubar a pagina. */
  function carregarVencimentos() {
    requisitar('GET', API + '/vencimentos').then(function(json) {
      vencimentos = json.vencimentos || [];
      vencJanelaDias = inteiroOuZero(json.antecedencia_dias);
      renderizarVencimentos();
    }, function(e) {
      if (window.console && window.console.warn) {
        window.console.warn('Vencimentos indisponíveis: ' + (e && e.message ? e.message : e));
      }
    });
  }

  function renderizarVencimentos() {
    var card = document.getElementById('cardVencimentos');
    var resumo = document.getElementById('vencResumo');
    var lista = document.getElementById('vencLista');
    if (!card || !resumo || !lista) return;

    if (!vencimentos.length) {
      card.style.display = 'none';
      lista.innerHTML = '';
      resumo.textContent = '';
      return;
    }

    var n = vencimentos.length;
    resumo.textContent = (n === 1 ? '1 período' : n + ' períodos')
      + ' com vencimento nos próximos ' + vencJanelaDias + ' dias ou já '
      + (n === 1 ? 'vencido' : 'vencidos') + '.';

    var html = '';
    for (var i = 0; i < n; i++) {
      var v = vencimentos[i];
      var funcionarioId = parseInt(v.funcionario_id, 10);
      var periodoId = parseInt(v.periodo_id, 10);
      var situacao = v.situacao === 'vencido' ? 'vencido' : 'proximo';
      var cor = COR_RE.test(String(v.funcionario_cor || '')) ? String(v.funcionario_cor) : '';
      var swatch = cor
        ? '<span class="ferias-swatch" style="background:' + cor + '"></span>'
        : '<span class="ferias-swatch"></span>';
      html += '<li class="ferias-venc-item ferias-venc-' + situacao + '" data-funcionario="' + funcionarioId + '" data-periodo="' + periodoId + '" title="Abrir na aba Férias">'
        + swatch
        + '<strong>' + escapeHtml(v.funcionario_nome || '') + '</strong>'
        + '<span>' + escapeHtml(formatarPeriodo(v)) + '</span>'
        + '<span class="badge ' + classeBadgeVenc(situacao) + '">' + escapeHtml(textoBadgeVenc(v, false)) + '</span>'
        + '<small class="ferias-hint">' + escapeHtml(v.mensagem || '') + '</small>'
        + '</li>';
    }
    lista.innerHTML = html;
    card.style.display = '';
  }

  /* Abre a aba Ferias com funcionario e periodo selecionados, reutilizando o
     mecanismo de ids pendentes do deep link (consumidos na carga dos selects). */
  function irParaPainel(funcionarioId, periodoId) {
    ferPreSelecionarId = funcionarioId;
    ferPreSelecionarPeriodoId = periodoId;
    ativarAba('ferias');
  }

  function aoClicarVencimentos(ev) {
    var alvo = ev.target;
    while (alvo && alvo !== this) {
      if (alvo.getAttribute && alvo.getAttribute('data-periodo')) break;
      alvo = alvo.parentNode;
    }
    if (!alvo || alvo === this) return;
    var funcionarioId = parseInt(alvo.getAttribute('data-funcionario'), 10);
    var periodoId = parseInt(alvo.getAttribute('data-periodo'), 10);
    if (!funcionarioId || !periodoId) return;
    irParaPainel(funcionarioId, periodoId);
  }

  /* ---------- Inicializacao ---------- */

  function init() {
    var i;
    var tabBtns = document.querySelectorAll('.tab-btn');
    for (i = 0; i < tabBtns.length; i++) {
      tabBtns[i].addEventListener('click', function() {
        ativarAba(this.getAttribute('data-tab'));
      });
    }

    var chk = document.getElementById('chkMostrarInativos');
    if (chk) {
      chk.addEventListener('change', function() {
        mostrarInativos = !!this.checked;
        carregarFuncionarios();
      });
    }

    var btnNovo = document.getElementById('btnNovoFuncionario');
    if (btnNovo) btnNovo.addEventListener('click', abrirFormNovo);

    var btnSalvar = document.getElementById('btnSalvarFuncionario');
    if (btnSalvar) btnSalvar.addEventListener('click', salvarFuncionario);

    var btnCancelar = document.getElementById('btnCancelarFuncionario');
    if (btnCancelar) btnCancelar.addEventListener('click', fecharForm);

    var nomeInput = document.getElementById('funcNome');
    if (nomeInput) {
      nomeInput.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter' || ev.keyCode === 13) {
          ev.preventDefault();
          salvarFuncionario();
        }
      });
    }

    var tabela = document.getElementById('funcTabela');
    if (tabela) tabela.addEventListener('click', aoClicarTabela);

    /* Aba Periodos */
    var selFunc = document.getElementById('perFuncionario');
    if (selFunc) selFunc.addEventListener('change', aoTrocarFuncionario);

    var chkConcluidos = document.getElementById('chkMostrarConcluidos');
    if (chkConcluidos) {
      chkConcluidos.addEventListener('change', function() {
        mostrarConcluidos = !!this.checked;
        carregarPeriodos();
      });
    }

    var btnNovoPer = document.getElementById('btnNovoPeriodo');
    if (btnNovoPer) btnNovoPer.addEventListener('click', abrirFormNovoPeriodo);

    var btnSalvarPer = document.getElementById('btnSalvarPeriodo');
    if (btnSalvarPer) btnSalvarPer.addEventListener('click', salvarPeriodo);

    var btnCancelarPer = document.getElementById('btnCancelarPeriodo');
    if (btnCancelarPer) btnCancelarPer.addEventListener('click', fecharFormPeriodo);

    var perInicio = document.getElementById('perInicio');
    if (perInicio) perInicio.addEventListener('change', aoMudarInicioPeriodo);

    var perDias = document.getElementById('perDiasDireito');
    if (perDias) {
      perDias.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter' || ev.keyCode === 13) {
          ev.preventDefault();
          salvarPeriodo();
        }
      });
    }

    var perTabela = document.getElementById('perTabela');
    if (perTabela) perTabela.addEventListener('click', aoClicarTabelaPeriodos);

    /* Aba Ferias */
    var ferSelFunc = document.getElementById('ferFuncionario');
    if (ferSelFunc) ferSelFunc.addEventListener('change', aoTrocarFuncionarioFerias);

    var ferSelPer = document.getElementById('ferPeriodo');
    if (ferSelPer) ferSelPer.addEventListener('change', aoTrocarPeriodoFerias);

    var chkFer = document.getElementById('chkFerMostrarConcluidos');
    if (chkFer) {
      chkFer.addEventListener('change', function() {
        ferMostrarConcluidos = !!this.checked;
        carregarPeriodosFerias(false);
      });
    }

    var ferAbono = document.getElementById('ferAbono');
    if (ferAbono) ferAbono.addEventListener('input', atualizarSaldoPreview);

    var btnSalvarDados = document.getElementById('btnSalvarPeriodoDados');
    if (btnSalvarDados) btnSalvarDados.addEventListener('click', salvarDadosPeriodo);

    var btnNovoBl = document.getElementById('btnNovoBloco');
    if (btnNovoBl) btnNovoBl.addEventListener('click', abrirFormNovoBloco);

    var btnSalvarBl = document.getElementById('btnSalvarBloco');
    if (btnSalvarBl) btnSalvarBl.addEventListener('click', salvarBloco);

    var btnCancelarBl = document.getElementById('btnCancelarBloco');
    if (btnCancelarBl) btnCancelarBl.addEventListener('click', fecharFormBloco);

    var blocoInicio = document.getElementById('blocoInicio');
    var blocoFim = document.getElementById('blocoFim');
    if (blocoInicio) {
      blocoInicio.addEventListener('change', atualizarBlocoDias);
      blocoInicio.addEventListener('input', atualizarBlocoDias);
    }
    if (blocoFim) {
      blocoFim.addEventListener('change', atualizarBlocoDias);
      blocoFim.addEventListener('input', atualizarBlocoDias);
      blocoFim.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter' || ev.keyCode === 13) {
          ev.preventDefault();
          salvarBloco();
        }
      });
    }

    var blocoTabela = document.getElementById('blocoTabela');
    if (blocoTabela) blocoTabela.addEventListener('click', aoClicarTabelaBlocos);

    /* Card de vencimentos */
    var vencLista = document.getElementById('vencLista');
    if (vencLista) vencLista.addEventListener('click', aoClicarVencimentos);

    renderizarPeriodos();
    carregarFuncionarios();
    carregarVencimentos();

    /* Deep link ?funcionario=<id>: abre a aba Ferias com ele selecionado.
       A URL fica como veio. */
    var params = lerQueryString();
    if (params.funcionario !== undefined) {
      var funcParam = parseInt(params.funcionario, 10);
      if (funcParam > 0 && String(funcParam) === String(params.funcionario).trim()) {
        ferPreSelecionarId = funcParam;
      } else {
        mostrarToast('Funcionário não encontrado ou inativo.', 'warning');
      }
      ativarAba('ferias');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
