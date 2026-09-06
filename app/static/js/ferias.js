/* ferias.js - Controle de Ferias (pagina /ferias). ES5 estrito; IIFE.
   Leva 1: aba Funcionarios via /api/ferias/funcionarios (GET, POST, PATCH).
   Leva 2: aba Periodos Aquisitivos via /api/ferias/periodos (GET, POST, PATCH,
   POST /excluir); saldo e avisos vem calculados do servidor.
   A aba Ferias segue como esqueleto nesta leva.
   Convencoes: datas sem hora sao strings 'YYYY-MM-DD' comparadas por string;
   a unica aritmetica de data e a sugestao de fim do periodo, construida a
   partir das partes (ano, mes, dia) e lida de volta com getFullYear/getMonth/
   getDate. Feedback pelo mostrarToast global de base.html; zero em-dash. */
(function() {
  'use strict';

  var API = '/api/ferias';
  var COR_RE = /^#[0-9A-Fa-f]{6}$/;
  var COR_PADRAO = '#2563EB';
  var DIAS_DIREITO_PADRAO = 30;

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
    }
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
    var sel = document.getElementById('perFuncionario');
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
      sincronizarFuncionarioSelecionado();
      if (perFuncionarioId) {
        carregarPeriodos();
      } else {
        if (editandoPeriodoId !== null) fecharFormPeriodo();
        periodos = [];
        renderizarPeriodos();
      }
    }, function(e) {
      mostrarToast(e.message, 'error');
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
      var avisoHtml = avisos.length
        ? '<span class="ferias-aviso" title="' + escapeHtml(avisos.join(' · ')) + '"><i class="ph ph-warning"></i> ' + avisos.length + '</span>'
        : '';
      var botaoExcluir = '<button type="button" class="btn-icon" data-acao="excluir" data-id="' + id + '"'
        + (temBlocos ? ' disabled title="Há blocos de férias registrados"' : ' title="Excluir"')
        + '><i class="ph ph-trash"></i></button>';

      html += '<tr' + (p.concluido ? ' class="ferias-linha-concluida"' : '') + '>'
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

    renderizarPeriodos();
    carregarFuncionarios();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
