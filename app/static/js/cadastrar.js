// Base URL do proxy (token no servidor)
  var API_BASE = '/api/baserow';
  var CONFIG = {
    tables: { clientes: 754, protocolo: 755, servicos: 746 },
    fields: {
      clienteNome: 'field_7237',
      clienteCpf: 'field_7238',
      clienteCnpj: 'field_7239',
      clienteTelefone: 'field_7243',
      clienteEmail: 'field_7244',
      clienteOab: 'field_7256',
      protocolo: 'field_7240',
      interessado: 'field_7241',
      servico: 'field_7242',
      responsavel: 'field_7249',
      dataEntrada: 'field_7250',
      detalhamentos: 'field_7251',
      status: 'field_7252',
      advogado: 'field_7254',
      agendadoPara: 'field_7268',
      depositoPrevio: 'field_7340',
      clienteAlerta: 'field_7394',
      clienteLogs: 'field_7395'
    },
    statusDefault: 3064,
    collaborators: [
      { id: 2, name: 'Fernanda R. T. Palhari' },
      { id: 3, name: 'Natália M. Rodrigues' },
      { id: 1, name: 'Tiago Barelli' }
    ]
  };

  var clienteEncontrado = null;
  var advogadoEncontrado = null;
  var servicosCache = [];

  function apiHeaders() {
    return { 'Content-Type': 'application/json' };
  }

  // ── FUNÇÕES AUXILIARES DE MÁSCARA ──
  function formatarCPF(v) {
    v = v.replace(/\D/g, '').substring(0, 11);
    if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
    else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
    else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
    return v;
  }

  function formatarCNPJ(v) {
    v = v.replace(/\D/g, '').substring(0, 14);
    if (v.length > 12) v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, '$1.$2.$3/$4-$5');
    else if (v.length > 8) v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, '$1.$2.$3/$4');
    else if (v.length > 5) v = v.replace(/(\d{2})(\d{3})(\d{1,3})/, '$1.$2.$3');
    else if (v.length > 2) v = v.replace(/(\d{2})(\d{1,3})/, '$1.$2');
    return v;
  }

  function formatarTelefone(v) {
    v = v.replace(/\D/g, '').substring(0, 11);
    if (v.length > 6) v = v.replace(/(\d{2})(\d{4,5})(\d{1,4})/, '($1) $2-$3');
    else if (v.length > 2) v = v.replace(/(\d{2})(\d{1,5})/, '($1) $2');
    return v;
  }

  function formatarMoeda(v) {
    v = String(v || '').replace(/[^\d.,]/g, '');
    if (!v) return '';

    var partes = v.split(',');
    var inteiros = (partes[0] || '').replace(/\D/g, '').substring(0, 13);
    var centavos = (partes.length > 1 ? partes.slice(1).join('') : '').replace(/\D/g, '').substring(0, 2);

    if (inteiros.length === 0) inteiros = '0';
    var intFmt = inteiros.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return partes.length > 1 ? (intFmt + ',' + centavos) : intFmt;
  }

  function completarCentavosMoeda(v) {
    v = String(v || '').trim();
    if (!v) return '';
    var fmt = formatarMoeda(v);
    if (!fmt) return '';
    if (fmt.indexOf(',') === -1) return fmt + ',00';
    var p = fmt.split(',');
    var cent = p[1] || '';
    if (cent.length === 0) cent = '00';
    else if (cent.length === 1) cent = cent + '0';
    return p[0] + ',' + cent;
  }

  function moedaParaAPI(v) {
    v = String(v || '').trim();
    if (!v) return null;
    var limpo = v.replace(/[^\d.,]/g, '');
    if (!limpo) return null;

    var intPart = '';
    var decPart = '';
    if (limpo.indexOf(',') >= 0) {
      var partes = limpo.split(',');
      intPart = (partes[0] || '').replace(/\D/g, '');
      decPart = (partes.slice(1).join('') || '').replace(/\D/g, '').substring(0, 2);
    } else {
      intPart = limpo.replace(/\D/g, '');
    }

    if (!intPart && !decPart) return null;
    if (!intPart) intPart = '0';
    if (decPart.length === 0) decPart = '00';
    else if (decPart.length === 1) decPart = decPart + '0';

    var num = parseFloat(intPart + '.' + decPart);
    if (isNaN(num) || num < 0) return null;
    return num.toFixed(2);
  }

  function moedaParaExibicao(v) {
    if (v === null || v === undefined || v === '') return '';
    var num = parseFloat(String(v).replace(',', '.'));
    if (isNaN(num)) return '';
    var partes = num.toFixed(2).split('.');
    var intPart = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return 'R$ ' + intPart + ',' + partes[1];
  }

  // ── MARKDOWN (Detalhamentos) ──
  if (window.marked) {
    marked.use({ gfm: true, breaks: true });
  }

  function renderMarkdownInto(el, md) {
    if (!el) return;
    md = md || '';
    if (window.marked) el.innerHTML = marked.parse(md);
    else el.textContent = md;
  }

  function atualizarPreviewDetalhamentos() {
    var ta = document.getElementById('detalhamentos');
    var prev = document.getElementById('detalhamentosPreview');
    if (!ta || !prev) return;

    var md = ta.value || '';
    if (!md.trim()) {
      prev.innerHTML = '<div class="md-placeholder">Pré-visualização da formatação</div>';
      return;
    }
    renderMarkdownInto(prev, md);
  }

  function configurarMarkdownPreview() {
    var ta = document.getElementById('detalhamentos');
    if (!ta) return;
    ta.addEventListener('input', atualizarPreviewDetalhamentos);
    atualizarPreviewDetalhamentos();
  }

  // ── INICIALIZAÇÃO ──
  document.addEventListener('DOMContentLoaded', function() {
    carregarServicos();
    carregarResponsaveis();
    definirDataHoje();
    configurarBuscaDocumento();
    configurarMascaras();
    configurarAdvogado();
    configurarMarkdownPreview();
    configurarTemplateServico();
  });

  function definirDataHoje() {
    document.getElementById('dataEntrada').value = new Date().toISOString().split('T')[0];
  }

  function configurarTemplateServico() {
    var select = document.getElementById('servico');
    if (!select) return;
    select.addEventListener('change', function() {
      var textoOpcao = select.options[select.selectedIndex].text;
      if (!window.TEMPLATES_SERVICO) return;
      var template = null;
      var chaves = Object.keys(window.TEMPLATES_SERVICO);
      for (var i = 0; i < chaves.length; i++) {
        if (chaves[i].toLowerCase() === textoOpcao.toLowerCase()) {
          template = window.TEMPLATES_SERVICO[chaves[i]];
          break;
        }
      }
      if (template) {
        document.getElementById('detalhamentos').value = template;
        atualizarPreviewDetalhamentos();
      }
    });
  }

  async function carregarServicos() {
    var select = document.getElementById('servico');
    try {
      var resp = await fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.servicos + '/?user_field_names=true&size=200', { headers: apiHeaders() });
      var data = await resp.json();
      select.innerHTML = '<option value="">Selecione o serviço</option>';
      servicosCache = data.results || [];
      servicosCache.sort(function(a, b) {
        var tipoA = a['Tipo'] || '';
        var tipoB = b['Tipo'] || '';
        return tipoA.localeCompare(tipoB, 'pt-BR');
      });
      servicosCache.forEach(function(row) {
        var opt = document.createElement('option');
        opt.value = row.id;
        opt.textContent = row['Tipo'] || ('Serviço #' + row.id);
        select.appendChild(opt);
      });
    } catch (e) {
      select.innerHTML = '<option value="">Erro ao carregar serviços</option>';
    }
  }

  async function carregarResponsaveis() {
    var select = document.getElementById('responsavel');
    select.innerHTML = '<option value="">Carregando...</option>';
    var lista = [];
    try {
      var resp = await fetch(API_BASE + '/database/fields/table/' + CONFIG.tables.protocolo + '/', { headers: apiHeaders() });
      if (resp.ok) {
        var fields = await resp.json();
        var fieldResponsavel = null;
        for (var i = 0; i < fields.length; i++) {
          if (fields[i].id === 7249 || (fields[i].name && fields[i].name === 'Responsável')) {
            fieldResponsavel = fields[i];
            break;
          }
        }
        if (fieldResponsavel && fieldResponsavel.available_collaborators && fieldResponsavel.available_collaborators.length > 0) {
          lista = fieldResponsavel.available_collaborators;
        }
      }
    } catch (e) {
      console.error('Erro ao carregar responsáveis da API:', e);
    }
    if (lista.length === 0) {
      lista = CONFIG.collaborators;
    }
    select.innerHTML = '<option value="">Selecione o responsável</option>';
    lista.forEach(function(c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      select.appendChild(opt);
    });
  }

  // ── MÁSCARAS ──
  function configurarMascaras() {
    var tipoSelect = document.getElementById('tipoPessoa');
    var docInput = document.getElementById('documento');
    var docLabel = document.getElementById('docLabel');

    tipoSelect.addEventListener('change', function() {
      clienteEncontrado = null;
      docInput.value = '';
      document.getElementById('nomeInteressado').value = '';
      document.getElementById('nomeInteressado').readOnly = false;
      document.getElementById('telefone').value = '';
      document.getElementById('telefone').readOnly = false;
      document.getElementById('email').value = '';
      document.getElementById('email').readOnly = false;
      document.getElementById('searchStatus').className = 'search-status';
      document.getElementById('alertaCliente').style.display = 'none';
      document.getElementById('alertaCliente').textContent = '';
      esconderMsg('clienteInfo');
      if (tipoSelect.value === 'cpf') {
        docLabel.textContent = 'CPF';
        docInput.placeholder = '000.000.000-00';
        docInput.maxLength = 14;
      } else {
        docLabel.textContent = 'CNPJ';
        docInput.placeholder = '00.000.000/0000-00';
        docInput.maxLength = 18;
      }
    });

    docInput.addEventListener('input', function() {
      if (tipoSelect.value === 'cpf') {
        docInput.value = formatarCPF(docInput.value);
      } else {
        docInput.value = formatarCNPJ(docInput.value);
      }
    });

    var telInput = document.getElementById('telefone');
    telInput.addEventListener('input', function() {
      telInput.value = formatarTelefone(telInput.value);
    });

    var depositoInput = document.getElementById('depositoPrevio');
    if (depositoInput) {
      depositoInput.addEventListener('input', function() {
        depositoInput.value = formatarMoeda(depositoInput.value);
      });
      depositoInput.addEventListener('blur', function() {
        depositoInput.value = completarCentavosMoeda(depositoInput.value);
      });
    }
  }

  // ── BUSCA INTERESSADO ──
  function configurarBuscaDocumento() {
    document.getElementById('documento').addEventListener('blur', function() {
      var raw = this.value.replace(/\D/g, '');
      var tipo = document.getElementById('tipoPessoa').value;
      if (raw.length === (tipo === 'cpf' ? 11 : 14)) {
        buscarCliente(raw, tipo);
      }
    });
  }

  async function buscarCliente(docLimpo, tipo) {
    var status = document.getElementById('searchStatus');
    var nomeInput = document.getElementById('nomeInteressado');
    status.className = 'search-status loading';
    clienteEncontrado = null;

    var campo = tipo === 'cpf' ? CONFIG.fields.clienteCpf : CONFIG.fields.clienteCnpj;
    var docFormatado = document.getElementById('documento').value;

    try {
      var url = API_BASE + '/database/rows/table/' + CONFIG.tables.clientes + '/?user_field_names=false&filter__' + campo + '__equal=' + encodeURIComponent(docLimpo) + '&size=1';
      var resp = await fetch(url, { headers: apiHeaders() });
      var data = await resp.json();

      if (!data.results || data.results.length === 0) {
        url = API_BASE + '/database/rows/table/' + CONFIG.tables.clientes + '/?user_field_names=false&filter__' + campo + '__equal=' + encodeURIComponent(docFormatado) + '&size=1';
        resp = await fetch(url, { headers: apiHeaders() });
        data = await resp.json();
      }

      if (data.results && data.results.length > 0) {
        clienteEncontrado = data.results[0];
        nomeInput.value = clienteEncontrado[CONFIG.fields.clienteNome] || '';
        nomeInput.readOnly = true;
        var telVal = clienteEncontrado[CONFIG.fields.clienteTelefone] || '';
        document.getElementById('telefone').value = telVal;
        document.getElementById('telefone').readOnly = false;
        var emailVal = clienteEncontrado[CONFIG.fields.clienteEmail] || '';
        document.getElementById('email').value = emailVal;
        document.getElementById('email').readOnly = false;
        // Exibir alerta do cliente, se existir
        var alertaCliente = clienteEncontrado[CONFIG.fields.clienteAlerta] || '';
        var alertaEl = document.getElementById('alertaCliente');
        if (alertaCliente.trim()) {
          alertaEl.textContent = 'Alerta cadastrado nos dados do cliente: ' + alertaCliente.trim();
          alertaEl.style.display = '';
        } else {
          alertaEl.textContent = '';
          alertaEl.style.display = 'none';
        }
        status.className = 'search-status found';
        status.innerHTML = '<i class="ph ph-check-circle" style="color: var(--success);"></i>';
        mostrarMsg('clienteInfo', 'success', 'Cliente encontrado: ' + nomeInput.value);
      } else {
        nomeInput.value = '';
        nomeInput.readOnly = false;
        document.getElementById('telefone').value = '';
        document.getElementById('telefone').readOnly = false;
        document.getElementById('email').value = '';
        document.getElementById('email').readOnly = false;
        document.getElementById('alertaCliente').style.display = 'none';
        document.getElementById('alertaCliente').textContent = '';
        nomeInput.focus();
        status.className = 'search-status not-found';
        status.innerHTML = '<i class="ph ph-x-circle" style="color: var(--text-muted);"></i>';
        mostrarMsg('clienteInfo', 'warning', 'Cliente não cadastrado. Preencha o nome para cadastrá-lo automaticamente.');
      }
    } catch (e) {
      status.className = 'search-status not-found';
      document.getElementById('alertaCliente').style.display = 'none';
      document.getElementById('alertaCliente').textContent = '';
      mostrarMsg('clienteInfo', 'error', 'Erro ao consultar o banco de dados.');
      console.error(e);
    }
  }

  // ── ADVOGADO ──
  var advBuscaTimer = null;

  function configurarAdvogado() {
    var toggle = document.getElementById('toggleAdvogado');
    var section = document.getElementById('advogadoSection');

    toggle.addEventListener('change', function() {
      if (toggle.checked) {
        section.classList.add('open');
        document.getElementById('nomeAdvogado').focus();
      } else {
        section.classList.remove('open');
        limparAdvogado();
      }
    });

    var nomeAdv = document.getElementById('nomeAdvogado');
    nomeAdv.addEventListener('input', function() {
      var termo = nomeAdv.value.trim();
      if (advBuscaTimer) clearTimeout(advBuscaTimer);
      if (advogadoEncontrado) {
        desvinculaAdvogado();
      }
      if (termo.length < 3) {
        fecharAutoList();
        return;
      }
      advBuscaTimer = setTimeout(function() {
        buscarAdvogadoPorNome(termo);
      }, 300);
    });

    document.addEventListener('click', function(e) {
      if (!e.target.closest('.autocomplete-wrapper')) {
        fecharAutoList();
      }
    });

    var cpfAdv = document.getElementById('cpfAdvogado');
    cpfAdv.addEventListener('input', function() {
      cpfAdv.value = formatarCPF(cpfAdv.value);
    });

    var telAdv = document.getElementById('telefoneAdvogado');
    telAdv.addEventListener('input', function() {
      telAdv.value = formatarTelefone(telAdv.value);
    });
  }

  async function buscarAdvogadoPorNome(termo) {
    var lista = document.getElementById('advAutoList');
    try {
      var url = API_BASE + '/database/rows/table/' + CONFIG.tables.clientes + '/?user_field_names=false&filter__' + CONFIG.fields.clienteNome + '__contains=' + encodeURIComponent(termo) + '&size=10';
      var resp = await fetch(url, { headers: apiHeaders() });
      var data = await resp.json();
      var resultados = data.results || [];

      lista.innerHTML = '';

      resultados.forEach(function(cli) {
        var nome = cli[CONFIG.fields.clienteNome] || '';
        var cpf = cli[CONFIG.fields.clienteCpf] || '';
        var oab = cli[CONFIG.fields.clienteOab] || '';
        var detalhe = cpf ? ('CPF: ' + cpf) : '';
        if (oab) detalhe += (detalhe ? ' | ' : '') + 'OAB: ' + oab;

        var item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.innerHTML = '<div class="ac-name">' + nome + '</div>' + (detalhe ? '<div class="ac-detail">' + detalhe + '</div>' : '');
        item.addEventListener('click', function() {
          selecionarAdvogado(cli);
        });
        lista.appendChild(item);
      });

      var novo = document.createElement('div');
      novo.className = 'autocomplete-novo';
      novo.textContent = '+ Cadastrar novo advogado';
      novo.addEventListener('click', function() {
        fecharAutoList();
        advogadoEncontrado = null;
        document.getElementById('cpfAdvogado').readOnly = false;
        document.getElementById('cpfAdvogado').value = '';
        document.getElementById('cpfAdvogado').focus();
        document.getElementById('oabAdvogado').readOnly = false;
        document.getElementById('oabAdvogado').value = '';
        document.getElementById('telefoneAdvogado').readOnly = false;
        document.getElementById('telefoneAdvogado').value = '';
        document.getElementById('emailAdvogado').readOnly = false;
        document.getElementById('emailAdvogado').value = '';
        mostrarMsg('advogadoInfo', 'warning', 'Preencha os dados do novo advogado. CPF é obrigatório.');
      });
      lista.appendChild(novo);

      lista.classList.add('open');
    } catch (e) {
      console.error('Erro na busca de advogado:', e);
      fecharAutoList();
    }
  }

  function selecionarAdvogado(cli) {
    advogadoEncontrado = cli;
    document.getElementById('nomeAdvogado').value = cli[CONFIG.fields.clienteNome] || '';

    var cpfVal = cli[CONFIG.fields.clienteCpf] || '';
    document.getElementById('cpfAdvogado').value = cpfVal;
    document.getElementById('cpfAdvogado').readOnly = !!cpfVal;

    var oabVal = cli[CONFIG.fields.clienteOab] || '';
    document.getElementById('oabAdvogado').value = oabVal;
    document.getElementById('oabAdvogado').readOnly = !!oabVal;

    var telVal = cli[CONFIG.fields.clienteTelefone] || '';
    document.getElementById('telefoneAdvogado').value = telVal;
    document.getElementById('telefoneAdvogado').readOnly = !!telVal;

    var emailVal = cli[CONFIG.fields.clienteEmail] || '';
    document.getElementById('emailAdvogado').value = emailVal;
    document.getElementById('emailAdvogado').readOnly = !!emailVal;

    fecharAutoList();
    mostrarMsg('advogadoInfo', 'success', 'Advogado selecionado: ' + (cli[CONFIG.fields.clienteNome] || ''));
  }

  function desvinculaAdvogado() {
    advogadoEncontrado = null;
    document.getElementById('cpfAdvogado').value = '';
    document.getElementById('cpfAdvogado').readOnly = false;
    document.getElementById('oabAdvogado').value = '';
    document.getElementById('oabAdvogado').readOnly = false;
    document.getElementById('telefoneAdvogado').value = '';
    document.getElementById('telefoneAdvogado').readOnly = false;
    document.getElementById('emailAdvogado').value = '';
    document.getElementById('emailAdvogado').readOnly = false;
    esconderMsg('advogadoInfo');
  }

  function fecharAutoList() {
    document.getElementById('advAutoList').classList.remove('open');
  }

  function limparAdvogado() {
    advogadoEncontrado = null;
    document.getElementById('nomeAdvogado').value = '';
    document.getElementById('cpfAdvogado').value = '';
    document.getElementById('cpfAdvogado').readOnly = false;
    document.getElementById('oabAdvogado').value = '';
    document.getElementById('oabAdvogado').readOnly = false;
    document.getElementById('telefoneAdvogado').value = '';
    document.getElementById('telefoneAdvogado').readOnly = false;
    document.getElementById('emailAdvogado').value = '';
    document.getElementById('emailAdvogado').readOnly = false;
    fecharAutoList();
    esconderMsg('advogadoInfo');
  }

  // ── CADASTRAR PROTOCOLO ──
  async function cadastrarProtocolo() {
    var btn = document.getElementById('btnCadastrar');
    var overlay = document.getElementById('overlay');

    var numProtocolo = document.getElementById('numProtocolo').value.trim();
    var dataEntrada = document.getElementById('dataEntrada').value;
    var agendadoPara = document.getElementById('agendadoPara').value;
    var depositoPrevioRaw = document.getElementById('depositoPrevio').value.trim();
    var servicoId = document.getElementById('servico').value;
    var responsavelId = document.getElementById('responsavel').value;
    var nomeInteressado = document.getElementById('nomeInteressado').value.trim();
    var documento = document.getElementById('documento').value.trim();
    var detalhamentos = document.getElementById('detalhamentos').value;
    var detalhamentosTemConteudo = detalhamentos.trim().length > 0;
    var telefone = document.getElementById('telefone').value.trim();
    var email = document.getElementById('email').value.trim();
    var temAdvogado = document.getElementById('toggleAdvogado').checked;
    var nomeAdvogado = document.getElementById('nomeAdvogado').value.trim();
    var cpfAdvogado = document.getElementById('cpfAdvogado').value.trim();
    var oabAdvogado = document.getElementById('oabAdvogado').value.trim();
    var telefoneAdvogado = document.getElementById('telefoneAdvogado').value.trim();
    var emailAdvogado = document.getElementById('emailAdvogado').value.trim();

    if (!numProtocolo) return mostrarMsg('formMsg', 'error', 'Informe o número do protocolo.');
    if (!documento) return mostrarMsg('formMsg', 'error', 'Informe o CPF ou CNPJ.');
    if (!nomeInteressado) return mostrarMsg('formMsg', 'error', 'Informe o nome do interessado.');
    if (!servicoId) return mostrarMsg('formMsg', 'error', 'Selecione o serviço.');
    if (!responsavelId) return mostrarMsg('formMsg', 'error', 'Selecione o responsável.');
    if (!dataEntrada) return mostrarMsg('formMsg', 'error', 'Informe a data de entrada.');
    if (temAdvogado && !cpfAdvogado) return mostrarMsg('formMsg', 'error', 'Informe o CPF do advogado.');
    if (temAdvogado && !nomeAdvogado) return mostrarMsg('formMsg', 'error', 'Informe o nome do advogado.');

    btn.disabled = true;
    overlay.classList.add('active');
    esconderMsg('formMsg');

    try {
      // 1. Cliente
      var clienteId;
      if (clienteEncontrado) {
        clienteId = clienteEncontrado.id;
        var atualiza = {};
        var linhasLogCad = [];
        var telOriginal = clienteEncontrado[CONFIG.fields.clienteTelefone] || '';
        var emailOriginal = clienteEncontrado[CONFIG.fields.clienteEmail] || '';
        var nomeUsuario = (window.CURRENT_USER && window.CURRENT_USER.nome) ? window.CURRENT_USER.nome : 'Usuário';
        var agora = new Date();
        var dia = ('0' + agora.getDate()).slice(-2);
        var mes = ('0' + (agora.getMonth() + 1)).slice(-2);
        var ano = agora.getFullYear();
        var hora = ('0' + agora.getHours()).slice(-2);
        var minuto = ('0' + agora.getMinutes()).slice(-2);
        var dataHora = dia + '/' + mes + '/' + ano + ' ' + hora + ':' + minuto;

        if (telefone !== telOriginal) {
          atualiza[CONFIG.fields.clienteTelefone] = telefone;
          linhasLogCad.push(nomeUsuario + '. ' + dataHora + ': O campo Telefone foi alterado. Valor anterior: ' + (telOriginal || '(vazio)') + '.');
        }
        if (email !== emailOriginal) {
          atualiza[CONFIG.fields.clienteEmail] = email;
          linhasLogCad.push(nomeUsuario + '. ' + dataHora + ': O campo E-mail foi alterado. Valor anterior: ' + (emailOriginal || '(vazio)') + '.');
        }

        if (linhasLogCad.length > 0) {
          var logsExistentes = clienteEncontrado[CONFIG.fields.clienteLogs] || '';
          var novasLinhas = linhasLogCad.join('\n');
          atualiza[CONFIG.fields.clienteLogs] = logsExistentes ? (novasLinhas + '\n' + logsExistentes) : novasLinhas;
        }

        if (Object.keys(atualiza).length > 0) {
          await fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.clientes + '/' + clienteId + '/?user_field_names=false',
            { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(atualiza) });
        }
      } else {
        var tipo = document.getElementById('tipoPessoa').value;
        var novo = {};
        novo[CONFIG.fields.clienteNome] = nomeInteressado;
        novo[tipo === 'cpf' ? CONFIG.fields.clienteCpf : CONFIG.fields.clienteCnpj] = documento;
        if (telefone) novo[CONFIG.fields.clienteTelefone] = telefone;
        if (email) novo[CONFIG.fields.clienteEmail] = email;
        var rc = await fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.clientes + '/?user_field_names=false',
          { method: 'POST', headers: apiHeaders(), body: JSON.stringify(novo) });
        if (!rc.ok) throw new Error((await rc.json()).detail || 'Erro ao cadastrar cliente.');
        clienteId = (await rc.json()).id;
      }

      // 2. Advogado
      var advogadoId = null;
      if (temAdvogado) {
        if (advogadoEncontrado) {
          advogadoId = advogadoEncontrado.id;
          var atAdv = {};
          if (oabAdvogado && !advogadoEncontrado[CONFIG.fields.clienteOab]) atAdv[CONFIG.fields.clienteOab] = oabAdvogado;
          if (telefoneAdvogado && !advogadoEncontrado[CONFIG.fields.clienteTelefone]) atAdv[CONFIG.fields.clienteTelefone] = telefoneAdvogado;
          if (emailAdvogado && !advogadoEncontrado[CONFIG.fields.clienteEmail]) atAdv[CONFIG.fields.clienteEmail] = emailAdvogado;
          if (Object.keys(atAdv).length > 0) {
            await fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.clientes + '/' + advogadoId + '/?user_field_names=false',
              { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(atAdv) });
          }
        } else {
          var novoAdv = {};
          novoAdv[CONFIG.fields.clienteNome] = nomeAdvogado;
          novoAdv[CONFIG.fields.clienteCpf] = cpfAdvogado;
          if (oabAdvogado) novoAdv[CONFIG.fields.clienteOab] = oabAdvogado;
          if (telefoneAdvogado) novoAdv[CONFIG.fields.clienteTelefone] = telefoneAdvogado;
          if (emailAdvogado) novoAdv[CONFIG.fields.clienteEmail] = emailAdvogado;
          var ra = await fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.clientes + '/?user_field_names=false',
            { method: 'POST', headers: apiHeaders(), body: JSON.stringify(novoAdv) });
          if (!ra.ok) throw new Error((await ra.json()).detail || 'Erro ao cadastrar advogado.');
          advogadoId = (await ra.json()).id;
        }
      }

      // 3. Protocolo
      var payload = {};
      payload[CONFIG.fields.protocolo] = numProtocolo;
      payload[CONFIG.fields.interessado] = [clienteId];
      payload[CONFIG.fields.servico] = [parseInt(servicoId)];
      payload[CONFIG.fields.responsavel] = [{ id: parseInt(responsavelId) }];
      payload[CONFIG.fields.dataEntrada] = dataEntrada;
      payload[CONFIG.fields.status] = CONFIG.statusDefault;
      if (advogadoId) payload[CONFIG.fields.advogado] = [advogadoId];
      if (agendadoPara) payload[CONFIG.fields.agendadoPara] = agendadoPara;
      var depositoValorAPI = moedaParaAPI(depositoPrevioRaw);
      if (depositoValorAPI !== null) payload[CONFIG.fields.depositoPrevio] = depositoValorAPI;
      if (detalhamentosTemConteudo) payload[CONFIG.fields.detalhamentos] = detalhamentos;

      var rp = await fetch(API_BASE + '/database/rows/table/' + CONFIG.tables.protocolo + '/?user_field_names=false',
        { method: 'POST', headers: apiHeaders(), body: JSON.stringify(payload) });
      if (!rp.ok) {
        var err = await rp.json();
        if (err.detail && err.detail.includes('unique')) throw new Error('O protocolo "' + numProtocolo + '" já existe.');
        throw new Error(err.detail || 'Erro ao cadastrar protocolo.');
      }
      var rpData = await rp.json();

      // 4. Redirecionar para pagina de impressao
      window.location.href = '/protocolo/' + rpData.id + '/imprimir';

    } catch (e) {
      mostrarMsg('formMsg', 'error', e.message);
      console.error(e);
    } finally {
      btn.disabled = false;
      overlay.classList.remove('active');
    }
  }


  function limparFormulario() {
    clienteEncontrado = null;
    document.getElementById('numProtocolo').value = '';
    document.getElementById('documento').value = '';
    document.getElementById('nomeInteressado').value = '';
    document.getElementById('nomeInteressado').readOnly = false;
    document.getElementById('telefone').value = '';
    document.getElementById('telefone').readOnly = false;
    document.getElementById('email').value = '';
    document.getElementById('email').readOnly = false;
    document.getElementById('servico').selectedIndex = 0;
    document.getElementById('responsavel').selectedIndex = 0;
    document.getElementById('agendadoPara').value = '';
    document.getElementById('depositoPrevio').value = '';
    document.getElementById('detalhamentos').value = '';
    atualizarPreviewDetalhamentos();
    
    var status = document.getElementById('searchStatus');
    status.className = 'search-status';
    status.innerHTML = '';
    
    definirDataHoje();
    esconderMsg('formMsg');
    esconderMsg('clienteInfo');
    document.getElementById('toggleAdvogado').checked = false;
    document.getElementById('advogadoSection').classList.remove('open');
    limparAdvogado();
    document.getElementById('alertaCliente').style.display = 'none';
    document.getElementById('alertaCliente').textContent = '';
  }

  function mostrarMsg(id, tipo, texto) {
    var el = document.getElementById(id);
    el.className = 'msg-box ' + tipo;
    // Adiciona ícone correspondente
    var icone = '';
    if(tipo === 'success') icone = '<i class="ph ph-check-circle" style="font-size:1.2rem"></i> ';
    else if(tipo === 'warning') icone = '<i class="ph ph-warning" style="font-size:1.2rem"></i> ';
    else if(tipo === 'error') icone = '<i class="ph ph-x-circle" style="font-size:1.2rem"></i> ';
    
    el.innerHTML = icone + texto;
    el.style.display = 'flex';
  }

  function esconderMsg(id) {
    var el = document.getElementById(id);
    el.style.display = 'none';
    el.innerHTML = '';
  }

  function addMarkdown(tipo) {
    var ta = document.getElementById('detalhamentos');
    if (!ta) return;

    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    var texto = ta.value;
    var selecionado = texto.substring(start, end);
    var antes = texto.substring(0, start);
    var depois = texto.substring(end);

    var prefixo = '';
    var sufixo = '';
    var textoNovo = '';

    switch (tipo) {
      case 'bold': prefixo = '**'; sufixo = '**'; textoNovo = selecionado || 'texto em negrito'; break;
      case 'italic': prefixo = '*'; sufixo = '*'; textoNovo = selecionado || 'texto itálico'; break;
      case 'list': 
        if (selecionado.includes('\n')) {
          prefixo = ''; sufixo = '';
          textoNovo = selecionado.split('\n').map(function(l){ return '- ' + l; }).join('\n');
        } else {
          prefixo = '\n- '; sufixo = ''; textoNovo = selecionado || 'item da lista';
        }
        break;
      case 'heading': prefixo = '\n## '; sufixo = '\n'; textoNovo = selecionado || 'Título'; break;
      case 'code': prefixo = '`'; sufixo = '`'; textoNovo = selecionado || 'código'; break;
      case 'checklist':
        if (selecionado.includes('\n')) {
          prefixo = ''; sufixo = '';
          textoNovo = selecionado.split('\n').map(function(l){ return '- [ ] ' + l; }).join('\n');
        } else {
          prefixo = '\n- [ ] '; sufixo = ''; textoNovo = selecionado || 'item';
        }
        break;
      case 'hr': prefixo = '\n\n---\n\n'; sufixo = ''; textoNovo = ''; break;
    }

    ta.value = antes + prefixo + textoNovo + sufixo + depois;
    ta.focus();
    var novaPos = start + prefixo.length + textoNovo.length + sufixo.length;
    if ((tipo === 'bold' || tipo === 'italic') && !selecionado) {
       ta.setSelectionRange(start + prefixo.length, start + prefixo.length + textoNovo.length);
    } else {
       ta.setSelectionRange(novaPos, novaPos);
    }
    ta.dispatchEvent(new Event('input'));
  }