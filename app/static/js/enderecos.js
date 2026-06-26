// enderecos.js — Módulo de gestão de endereços (tabela 779) com ViaCEP
// Reutilizado por clientes.html (PF) e clientes_pj.html (PJ).
// ES5 estrito (var/function). Lê o cliente atual de window.ENDERECO_CLIENTE_ID.
(function() {
  'use strict';

  var API_BASE = '/api/baserow';
  var TABLE_END = 779;

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
        btnExcluir.addEventListener('click', function() { excluirEndereco(row.id); });

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
    }
    el('enderecoFormWrap').style.display = 'block';
    var btnAdd = el('btnAddEndereco');
    if (btnAdd) btnAdd.style.display = 'none';
  }

  function fecharForm() {
    el('enderecoFormWrap').style.display = 'none';
    enderecoEditId = null;
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
  function excluirEndereco(rowId) {
    if (!rowId) return;
    if (!confirm('Excluir este endereço? Esta ação não pode ser desfeita.')) return;
    overlayOn();
    var url = API_BASE + '/database/rows/table/' + TABLE_END + '/' + rowId + '/';
    fetch(url, { method: 'DELETE', headers: apiHeaders() })
      .then(function(r) {
        if (!r.ok && r.status !== 204) throw new Error('Erro ao excluir endereço.');
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
