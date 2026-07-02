// enderecos.js — Módulo de gestão de endereços (tabela 779) com ViaCEP
// Reutilizado por clientes.html (PF) e clientes_pj.html (PJ).
// ES5 estrito (var/function). Lê o cliente atual de window.ENDERECO_CLIENTE_ID.
(function() {
  'use strict';

  var API_BASE = '/api/baserow';
  var TABLE_END = 779;
  var TABLE_CLIENTES = 754;
  var F_LOG_CLIENTE = 'field_7395'; // FIELDS.logs da 754 (mesmo campo em PF e PJ)

  // Campos da tabela 779 (Endereco_CPF_CNPJ)
  var F_NAME        = 'field_7467';
  var F_CLIENTE     = 'field_7468';
  var F_TIPO        = 'field_7469';
  var F_CEP         = 'field_7471';
  var F_LOGRADOURO  = 'field_7472';
  var F_NUMERO      = 'field_7473';
  var F_COMPLEMENTO = 'field_7474';
  var F_BAIRRO      = 'field_7475';
  var F_MUNICIPIO   = 'field_7476';
  var F_UF          = 'field_7477';
  var F_PAIS        = 'field_7478';
  var F_ANOTACOES   = 'field_7482';
  var F_CRIADO_POR  = 'field_7479';
  var F_CRIADO_EM   = 'field_7480';
  var F_ATUALIZADO  = 'field_7481';

  var TIPO_OPTS = [
    { id: 3126, label: 'Residencial' },
    { id: 3127, label: 'Profissional' }
  ];

  var UF_OPTS = {
    AC: 3128, AL: 3129, AP: 3130, AM: 3131, BA: 3132, CE: 3133, DF: 3134,
    ES: 3135, GO: 3136, MA: 3137, MT: 3138, MS: 3139, MG: 3140, PA: 3141,
    PB: 3142, PR: 3143, PE: 3144, PI: 3145, RJ: 3146, RN: 3147, RS: 3148,
    RO: 3149, RR: 3150, SC: 3151, SP: 3152, SE: 3153, TO: 3154
  };

  // Estado interno
  var enderecoEditId = null;
  var enderecoEditRow = null;  // linha completa no momento em que a edição abre (diff do log)

  // ── Helpers ───────────────────────────────────────────
  function apiHeaders() {
    return { 'Content-Type': 'application/json' };
  }

  function el(id) { return document.getElementById(id); }

  function soDigitos(v) {
    return (v || '').replace(/\D/g, '');
  }

  function mascararCep(v) {
    v = soDigitos(v).substring(0, 8);
    if (v.length > 5) v = v.replace(/(\d{5})(\d{1,3})/, '$1-$2');
    return v;
  }

  function mostrarFormMsg(tipo, texto) {
    var box = el('enderecoFormMsg');
    if (!box) return;
    box.className = 'msg-box ' + tipo;
    box.innerHTML = texto;
    box.style.display = 'flex';
  }

  function esconderFormMsg() {
    var box = el('enderecoFormMsg');
    if (!box) return;
    box.style.display = 'none';
    box.innerHTML = '';
  }

  function overlayOn()  { if (window.mostrarOverlay) window.mostrarOverlay(); }
  function overlayOff() { if (window.esconderOverlay) window.esconderOverlay(); }

  // tipo/uf vêm como objeto { id, value, color } na leitura, ou null
  function valorSelect(campo) {
    if (campo && typeof campo === 'object') return campo.value || '';
    return campo || '';
  }
  function idSelect(campo) {
    if (campo && typeof campo === 'object') return campo.id || '';
    return '';
  }

  function ufSiglaParaId(sigla) {
    if (!sigla) return '';
    var s = ('' + sigla).toUpperCase();
    return UF_OPTS[s] || '';
  }

  function escapar(s) {
    s = (s == null) ? '' : ('' + s);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
  }

  // ── Log de auditoria no Histórico do cliente (Leva 5) ──
  // Inserção/edição/exclusão de endereço gravam linha no campo de log da 754
  // (mesmo Histórico dos eventos e do cadastro), sempre APÓS o sucesso na 779.
  // A exclusão é DELETE físico: o resumo é capturado ANTES (o log é o único
  // rastro que sobra). Falha de log nunca bloqueia a operação principal.
  // Helpers duplicados de eventos_estado_civil.js por decisão consciente
  // (módulos IIFE independentes; consolidação adiada de propósito).

  // Linha no formato da casa: "{usuário}. {dd/mm/aaaa hh:mm}: {texto}"
  function gerarLinhaLog(texto) {
    var agora = new Date();
    var dia = ('0' + agora.getDate()).slice(-2);
    var mes = ('0' + (agora.getMonth() + 1)).slice(-2);
    var ano = agora.getFullYear();
    var hora = ('0' + agora.getHours()).slice(-2);
    var min = ('0' + agora.getMinutes()).slice(-2);
    var nomeUsuario = (window.CURRENT_USER && window.CURRENT_USER.nome)
      ? window.CURRENT_USER.nome : 'Usuário';
    return nomeUsuario + '. ' + dia + '/' + mes + '/' + ano + ' ' + hora + ':' + min + ': ' + texto;
  }

  // Prepend de linha(s) no log do cliente. O PATCH contém SOMENTE F_LOG_CLIENTE —
  // nenhum outro campo da 754 vai junto. Sempre resolve; falha vira aviso.
  function appendLogCliente(clienteRowId, linhas) {
    if (!clienteRowId || !linhas || !linhas.length) return Promise.resolve();
    var texto = (typeof linhas === 'string') ? linhas : linhas.join('\n');
    var url = API_BASE + '/database/rows/table/' + TABLE_CLIENTES + '/' + clienteRowId + '/?user_field_names=false';
    return fetch(url, { headers: apiHeaders() })
      .then(function(r) {
        if (!r.ok) throw new Error('get-cliente-log');
        return r.json();
      })
      .then(function(cli) {
        var existente = cli[F_LOG_CLIENTE] || '';
        var body = {};
        body[F_LOG_CLIENTE] = existente ? (texto + '\n' + existente) : texto;
        return fetch(url, { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(body) });
      })
      .then(function(r2) { if (!r2.ok) throw new Error('patch-cliente-log'); })
      .catch(function(e) {
        console.error('Falha ao gravar o histórico do cliente:', e);
        var aviso = 'Endereço salvo, mas não foi possível gravar o histórico do cliente.';
        if (window.mostrarToast) { mostrarToast(aviso, 'warning'); } else { alert(aviso); }
      });
  }

  function labelTipo(id) {
    var idNum = Number(id);
    for (var i = 0; i < TIPO_OPTS.length; i++) {
      if (TIPO_OPTS[i].id === idNum) return TIPO_OPTS[i].label;
    }
    return '';
  }

  // Id da opção de UF -> sigla (reverso de UF_OPTS)
  function ufIdParaSigla(id) {
    if (!id) return '';
    var idNum = Number(id);
    for (var k in UF_OPTS) {
      if (UF_OPTS.hasOwnProperty(k) && UF_OPTS[k] === idNum) return k;
    }
    return '';
  }

  // Resumo curto em texto puro p/ o log: "{Tipo}: {logradouro, nº} — {município}/{UF}"
  // (partes vazias omitidas; sem CEP para não poluir o texto)
  function resumoEnderecoLog(tipoLabel, logradouro, numero, municipio, uf) {
    var linha = ('' + (logradouro || '')).trim();
    var num = ('' + (numero || '')).trim();
    if (num) linha += (linha ? ', ' : '') + num;
    if (!linha) linha = '(sem logradouro)';
    var local = ('' + (municipio || '')).trim();
    if (uf) local += (local ? '/' : '') + uf;
    var texto = linha;
    if (local) texto += ' \u2014 ' + local;
    return (tipoLabel ? tipoLabel + ': ' : '') + texto;
  }

  // Diff legível de uma edição (das anotações NUNCA se loga o conteúdo — apenas
  // que mudaram). Retorna '' quando nada mudou (edição sem mudança não gera log).
  function gerarDiffEndereco(rowAntes, payloadDepois) {
    if (!rowAntes) return '';
    var partes = [];

    function comparar(rotulo, antes, depois) {
      antes = (antes === null || antes === undefined || ('' + antes).trim() === '') ? '(vazio)' : ('' + antes).trim();
      depois = (depois === null || depois === undefined || ('' + depois).trim() === '') ? '(vazio)' : ('' + depois).trim();
      if (antes !== depois) partes.push(rotulo + ': ' + antes + ' -> ' + depois);
    }

    comparar('Tipo', valorSelect(rowAntes[F_TIPO]), labelTipo(payloadDepois[F_TIPO]));
    comparar('CEP', mascararCep(rowAntes[F_CEP] || ''), mascararCep(payloadDepois[F_CEP] || ''));
    comparar('Logradouro', rowAntes[F_LOGRADOURO], payloadDepois[F_LOGRADOURO]);
    comparar('Número', rowAntes[F_NUMERO], payloadDepois[F_NUMERO]);
    comparar('Complemento', rowAntes[F_COMPLEMENTO], payloadDepois[F_COMPLEMENTO]);
    comparar('Bairro', rowAntes[F_BAIRRO], payloadDepois[F_BAIRRO]);
    comparar('Município', rowAntes[F_MUNICIPIO], payloadDepois[F_MUNICIPIO]);
    comparar('UF', valorSelect(rowAntes[F_UF]), ufIdParaSigla(payloadDepois[F_UF]));
    comparar('País', rowAntes[F_PAIS], payloadDepois[F_PAIS]);

    if ((rowAntes[F_ANOTACOES] || '') !== (payloadDepois[F_ANOTACOES] || '')) {
      partes.push('Anotações alteradas');
    }

    return partes.join('; ');
  }

  // ── Selects ───────────────────────────────────────────
  function popularSelectTipo() {
    var sel = el('endTipo');
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione...</option>';
    for (var i = 0; i < TIPO_OPTS.length; i++) {
      var o = document.createElement('option');
      o.value = TIPO_OPTS[i].id;
      o.textContent = TIPO_OPTS[i].label;
      sel.appendChild(o);
    }
  }

  function popularSelectUf() {
    var sel = el('endUf');
    if (!sel) return;
    sel.innerHTML = '<option value="">--</option>';
    var siglas = [];
    for (var k in UF_OPTS) { if (UF_OPTS.hasOwnProperty(k)) siglas.push(k); }
    siglas.sort();
    for (var i = 0; i < siglas.length; i++) {
      var o = document.createElement('option');
      o.value = UF_OPTS[siglas[i]]; // grava o id da opção
      o.textContent = siglas[i];
      sel.appendChild(o);
    }
  }

  // ── Listagem ──────────────────────────────────────────
  function carregarEnderecos() {
    var lista = el('enderecosLista');
    if (!lista) return;
    var clienteId = window.ENDERECO_CLIENTE_ID;
    if (!clienteId) {
      lista.innerHTML = '';
      return;
    }
    lista.innerHTML = '<div class="enderecos-empty">Carregando endereços...</div>';
    var url = API_BASE + '/database/rows/table/' + TABLE_END +
      '/?user_field_names=false&filter__' + F_CLIENTE + '__link_row_has=' +
      encodeURIComponent(clienteId) + '&size=200';
    fetch(url, { headers: apiHeaders() })
      .then(function(r) {
        if (!r.ok) throw new Error('Falha ao listar endereços.');
        return r.json();
      })
      .then(function(data) {
        renderLista(data.results || []);
      })
      .catch(function(e) {
        console.error('Erro ao carregar endereços:', e);
        // Fallback: listar tudo e filtrar no cliente por F_CLIENTE
        carregarEnderecosFallback(clienteId, lista);
      });
  }

  function carregarEnderecosFallback(clienteId, lista) {
    var url = API_BASE + '/database/rows/table/' + TABLE_END +
      '/?user_field_names=false&size=200';
    fetch(url, { headers: apiHeaders() })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var todos = data.results || [];
        var filtrados = [];
        for (var i = 0; i < todos.length; i++) {
          var vinculo = todos[i][F_CLIENTE] || [];
          for (var j = 0; j < vinculo.length; j++) {
            if (vinculo[j] && vinculo[j].id === clienteId) {
              filtrados.push(todos[i]);
              break;
            }
          }
        }
        renderLista(filtrados);
      })
      .catch(function(e) {
        console.error('Erro no fallback de endereços:', e);
        lista.innerHTML = '<div class="enderecos-empty">Não foi possível carregar os endereços.</div>';
      });
  }

  function resumoEndereco(row) {
    var tipo = valorSelect(row[F_TIPO]);
    var logr = row[F_LOGRADOURO] || '';
    var num  = row[F_NUMERO] || '';
    var compl = row[F_COMPLEMENTO] || '';
    var bairro = row[F_BAIRRO] || '';
    var mun  = row[F_MUNICIPIO] || '';
    var uf   = valorSelect(row[F_UF]);
    var cep  = row[F_CEP] || '';

    var linha1 = logr + (num ? ', ' + num : '');
    if (compl && compl.trim() !== '') {
      linha1 += ' — ' + compl.trim();
    }
    var partes = [];
    if (bairro) partes.push(bairro);
    if (mun || uf) partes.push(mun + (uf ? '/' + uf : ''));
    if (cep) partes.push('CEP ' + mascararCep(cep));

    var html = '';
    if (tipo) html += '<span class="endereco-tag">' + escapar(tipo) + '</span>';
    html += '<span class="endereco-linha">' + escapar(linha1 || '(sem logradouro)') + '</span>';
    if (partes.length) {
      html += '<span class="endereco-sub">' + escapar(partes.join(' — ')) + '</span>';
    }
    var anotacoes = row[F_ANOTACOES] || '';
    if (anotacoes && anotacoes.trim() !== '') {
      html += '<div class="endereco-anotacao">' +
              '<i class="ph ph-note"></i>' +
              '<span class="endereco-anotacao-texto">' + escapar(anotacoes) + '</span>' +
              '</div>';
    }
    return html;
  }

  // ── Google Maps ───────────────────────────────────────
  function urlGoogleMaps(row) {
    var partes = [];
    if (row[F_LOGRADOURO]) partes.push(row[F_LOGRADOURO]);
    if (row[F_NUMERO])     partes.push(row[F_NUMERO]);
    if (row[F_BAIRRO])     partes.push(row[F_BAIRRO]);
    if (row[F_MUNICIPIO])  partes.push(row[F_MUNICIPIO]);
    var uf = valorSelect(row[F_UF]); // sigla (value), nunca o id
    if (uf)                partes.push(uf);
    if (row[F_CEP])        partes.push(mascararCep(row[F_CEP]));
    return 'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(partes.join(', '));
  }

  function renderLista(rows) {
    var lista = el('enderecosLista');
    if (!lista) return;
    if (!rows || rows.length === 0) {
      lista.innerHTML = '<div class="enderecos-empty">Nenhum endereço cadastrado para este cliente.</div>';
      return;
    }
    lista.innerHTML = '';
    for (var i = 0; i < rows.length; i++) {
      (function(row) {
        var item = document.createElement('div');
        item.className = 'endereco-item';

        var info = document.createElement('div');
        info.className = 'endereco-info';
        info.innerHTML = resumoEndereco(row);

        var acoes = document.createElement('div');
        acoes.className = 'endereco-acoes';

        var btnMapa = document.createElement('button');
        btnMapa.type = 'button';
        btnMapa.className = 'endereco-btn-acao';
        btnMapa.title = 'Ver no Google Maps';
        btnMapa.innerHTML = '<i class="ph ph-map-pin"></i>';
        btnMapa.addEventListener('click', function() {
          window.open(urlGoogleMaps(row), '_blank');
        });

        var btnEditar = document.createElement('button');
        btnEditar.type = 'button';
        btnEditar.className = 'endereco-btn-acao';
        btnEditar.title = 'Editar';
        btnEditar.innerHTML = '<i class="ph ph-pencil-simple"></i>';
        btnEditar.addEventListener('click', function() { abrirForm(row); });

        var btnExcluir = document.createElement('button');
        btnExcluir.type = 'button';
        btnExcluir.className = 'endereco-btn-acao endereco-btn-excluir';
        btnExcluir.title = 'Excluir';
        btnExcluir.innerHTML = '<i class="ph ph-trash"></i>';
        btnExcluir.addEventListener('click', function() { excluirEndereco(row); });

        acoes.appendChild(btnMapa);
        acoes.appendChild(btnEditar);
        acoes.appendChild(btnExcluir);
        item.appendChild(info);
        item.appendChild(acoes);
        lista.appendChild(item);
      })(rows[i]);
    }
  }

  // ── Formulário ────────────────────────────────────────
  function limparForm() {
    el('endTipo').value = '';
    el('endCep').value = '';
    el('endLogradouro').value = '';
    el('endNumero').value = '';
    el('endComplemento').value = '';
    el('endBairro').value = '';
    el('endMunicipio').value = '';
    el('endUf').value = '';
    el('endPais').value = 'Brasil';
    el('endAnotacoes').value = '';
    el('endCepStatus').innerHTML = '';
    esconderFormMsg();
  }

  function abrirForm(row) {
    limparForm();
    if (row) {
      enderecoEditId = row.id;
      enderecoEditRow = row;
      el('endTipo').value = idSelect(row[F_TIPO]) || '';
      el('endCep').value = mascararCep(row[F_CEP] || '');
      el('endLogradouro').value = row[F_LOGRADOURO] || '';
      el('endNumero').value = row[F_NUMERO] || '';
      el('endComplemento').value = row[F_COMPLEMENTO] || '';
      el('endBairro').value = row[F_BAIRRO] || '';
      el('endMunicipio').value = row[F_MUNICIPIO] || '';
      el('endUf').value = idSelect(row[F_UF]) || '';
      el('endPais').value = row[F_PAIS] || 'Brasil';
      el('endAnotacoes').value = row[F_ANOTACOES] || '';
    } else {
      enderecoEditId = null;
      enderecoEditRow = null;
    }
    el('enderecoFormWrap').style.display = 'block';
    var btnAdd = el('btnAddEndereco');
    if (btnAdd) btnAdd.style.display = 'none';
  }

  function fecharForm() {
    el('enderecoFormWrap').style.display = 'none';
    enderecoEditId = null;
    enderecoEditRow = null;
    var btnAdd = el('btnAddEndereco');
    if (btnAdd) btnAdd.style.display = '';
  }

  // ── ViaCEP ────────────────────────────────────────────
  function consultarCep() {
    var cep = soDigitos(el('endCep').value);
    var status = el('endCepStatus');
    if (cep.length !== 8) return;
    status.innerHTML = '<i class="ph ph-spinner endereco-spinner"></i> Consultando...';
    fetch('/api/cep/' + cep, { headers: apiHeaders() })
      .then(function(r) {
        return r.json().then(function(body) {
          return { ok: r.ok, body: body };
        });
      })
      .then(function(res) {
        if (res.ok && res.body && res.body.ok && res.body.endereco) {
          var e = res.body.endereco;
          el('endLogradouro').value = e.logradouro || '';
          el('endBairro').value = e.bairro || '';
          el('endMunicipio').value = e.municipio || '';
          var ufId = ufSiglaParaId(e.uf);
          if (ufId) el('endUf').value = ufId;
          status.innerHTML = '<span class="endereco-cep-ok"><i class="ph ph-check"></i> CEP encontrado</span>';
        } else {
          status.innerHTML = '<span class="endereco-cep-warn">Não foi possível consultar o CEP. Preencha manualmente.</span>';
        }
      })
      .catch(function(e) {
        console.error('Erro ViaCEP:', e);
        status.innerHTML = '<span class="endereco-cep-warn">Não foi possível consultar o CEP. Preencha manualmente.</span>';
      });
  }

  // ── Salvar (POST/PATCH) ───────────────────────────────
  function salvarEndereco() {
    var clienteId = window.ENDERECO_CLIENTE_ID;
    if (!clienteId) {
      mostrarFormMsg('error', 'Nenhum cliente carregado.');
      return;
    }

    var logradouro = el('endLogradouro').value.trim();
    var numero     = el('endNumero').value.trim();
    var tipoVal    = el('endTipo').value;
    var ufVal      = el('endUf').value;
    var cepDig     = soDigitos(el('endCep').value);

    if (!logradouro && !cepDig) {
      mostrarFormMsg('error', 'Informe ao menos o logradouro ou o CEP.');
      return;
    }

    var agora = new Date().toISOString();
    var payload = {};
    payload[F_TIPO]        = tipoVal ? parseInt(tipoVal, 10) : null;
    payload[F_CEP]         = cepDig;
    payload[F_LOGRADOURO]  = logradouro;
    payload[F_NUMERO]      = numero;
    payload[F_COMPLEMENTO] = el('endComplemento').value.trim();
    payload[F_BAIRRO]      = el('endBairro').value.trim();
    payload[F_MUNICIPIO]   = el('endMunicipio').value.trim();
    payload[F_UF]          = ufVal ? parseInt(ufVal, 10) : null;
    payload[F_PAIS]        = el('endPais').value.trim() || 'Brasil';
    payload[F_ANOTACOES]   = el('endAnotacoes').value.trim();
    payload[F_NAME]        = logradouro + (numero ? ', ' + numero : '');
    payload[F_ATUALIZADO]  = agora;

    // Auditoria: diff e resumo calculados antes do save (fecharForm limpa o estado)
    var ehEdicao = !!enderecoEditId;
    var diff = ehEdicao ? gerarDiffEndereco(enderecoEditRow, payload) : '';
    var resumoLog = resumoEnderecoLog(labelTipo(payload[F_TIPO]), payload[F_LOGRADOURO],
      payload[F_NUMERO], payload[F_MUNICIPIO], ufIdParaSigla(payload[F_UF]));

    var btn = el('btnSalvarEndereco');
    btn.disabled = true;
    overlayOn();
    esconderFormMsg();

    var url, metodo;
    if (enderecoEditId) {
      url = API_BASE + '/database/rows/table/' + TABLE_END + '/' + enderecoEditId +
        '/?user_field_names=false';
      metodo = 'PATCH';
    } else {
      url = API_BASE + '/database/rows/table/' + TABLE_END + '/?user_field_names=false';
      metodo = 'POST';
      payload[F_CLIENTE]    = [clienteId];
      payload[F_CRIADO_POR] = (window.CURRENT_USER && window.CURRENT_USER.nome) || '';
      payload[F_CRIADO_EM]  = agora;
    }

    fetch(url, { method: metodo, headers: apiHeaders(), body: JSON.stringify(payload) })
      .then(function(r) {
        if (!r.ok) return r.json().then(function(e) {
          throw new Error(e.detail || 'Erro ao salvar endereço.');
        });
        return r.json();
      })
      .then(function() {
        // Log APÓS o sucesso na 779; edição sem mudança não gera linha
        if (!ehEdicao) {
          return appendLogCliente(clienteId, gerarLinhaLog('Endereço adicionado: ' + resumoLog + '.'));
        }
        if (diff) {
          return appendLogCliente(clienteId, gerarLinhaLog('Endereço editado: ' + resumoLog + '. Alterações: ' + diff + '.'));
        }
        return null;
      })
      .then(function() {
        overlayOff();
        btn.disabled = false;
        fecharForm();
        carregarEnderecos();
      })
      .catch(function(e) {
        overlayOff();
        btn.disabled = false;
        mostrarFormMsg('error', e.message || 'Erro ao salvar endereço.');
        console.error(e);
      });
  }

  // ── Excluir (DELETE) ──────────────────────────────────
  function excluirEndereco(row) {
    if (!row || !row.id) return;
    if (!confirm('Excluir este endereço? Esta ação não pode ser desfeita.')) return;
    // DELETE físico: o resumo é capturado ANTES — o log será o único rastro
    var clienteId = window.ENDERECO_CLIENTE_ID;
    var resumoLog = resumoEnderecoLog(valorSelect(row[F_TIPO]), row[F_LOGRADOURO],
      row[F_NUMERO], row[F_MUNICIPIO], valorSelect(row[F_UF]));
    overlayOn();
    var url = API_BASE + '/database/rows/table/' + TABLE_END + '/' + row.id + '/';
    fetch(url, { method: 'DELETE', headers: apiHeaders() })
      .then(function(r) {
        if (!r.ok && r.status !== 204) throw new Error('Erro ao excluir endereço.');
        return appendLogCliente(clienteId, gerarLinhaLog('Endereço excluído: ' + resumoLog + '.'));
      })
      .then(function() {
        overlayOff();
        carregarEnderecos();
      })
      .catch(function(e) {
        overlayOff();
        console.error('Erro ao excluir endereço:', e);
        alert('Não foi possível excluir o endereço.');
      });
  }

  // ── Inicialização ─────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    if (!el('enderecosLista')) return; // página sem o módulo

    popularSelectTipo();
    popularSelectUf();

    var btnAdd = el('btnAddEndereco');
    if (btnAdd) btnAdd.addEventListener('click', function() { abrirForm(null); });

    var btnCancelar = el('btnCancelarEndereco');
    if (btnCancelar) btnCancelar.addEventListener('click', fecharForm);

    var btnSalvar = el('btnSalvarEndereco');
    if (btnSalvar) btnSalvar.addEventListener('click', salvarEndereco);

    var cepInput = el('endCep');
    if (cepInput) {
      cepInput.addEventListener('input', function() {
        cepInput.value = mascararCep(cepInput.value);
        if (soDigitos(cepInput.value).length === 8) consultarCep();
      });
      cepInput.addEventListener('blur', consultarCep);
    }
  });

  // Exposição global usada pela mecânica de abas (FASE 2)
  window.carregarEnderecos = carregarEnderecos;
})();
