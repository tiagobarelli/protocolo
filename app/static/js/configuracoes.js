// configuracoes.js — ES5 estrito
// Página de Configurações (master only)

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function mostrarMsg(id, tipo, texto) {
  var el = document.getElementById(id);
  el.className = 'msg-box ' + tipo;
  var icone = '';
  if (tipo === 'success') icone = '<i class="ph ph-check-circle" style="font-size:1.2rem"></i> ';
  else if (tipo === 'warning') icone = '<i class="ph ph-warning" style="font-size:1.2rem"></i> ';
  else if (tipo === 'error') icone = '<i class="ph ph-x-circle" style="font-size:1.2rem"></i> ';
  else if (tipo === 'info') icone = '<i class="ph ph-info" style="font-size:1.2rem"></i> ';
  el.innerHTML = icone + texto;
  el.style.display = 'flex';
}

function esconderMsg(id) {
  var el = document.getElementById(id);
  el.style.display = 'none';
  el.innerHTML = '';
}

// ═══════════════════════════════════════════════════════
// ABAS
// ═══════════════════════════════════════════════════════

function ativarAba(nomeAba) {
  var botoes = document.querySelectorAll('.tab-btn');
  var paineis = document.querySelectorAll('.tab-content');
  for (var i = 0; i < botoes.length; i++) {
    botoes[i].classList.remove('active');
    paineis[i].classList.remove('active');
  }
  var botao = document.querySelector('[data-tab="' + nomeAba + '"]');
  var painel = document.getElementById('tab-' + nomeAba);
  if (botao) botao.classList.add('active');
  if (painel) painel.classList.add('active');
}

// ═══════════════════════════════════════════════════════
// PREVIEW DE CORES
// ═══════════════════════════════════════════════════════

function derivarCores(hexCor) {
  var hex = hexCor.replace('#', '');
  var r = parseInt(hex.substring(0, 2), 16);
  var g = parseInt(hex.substring(2, 4), 16);
  var b = parseInt(hex.substring(4, 6), 16);

  var bgR = Math.round(r + (255 - r) * 0.93);
  var bgG = Math.round(g + (255 - g) * 0.93);
  var bgB = Math.round(b + (255 - b) * 0.93);

  var brR = Math.round(r + (255 - r) * 0.65);
  var brG = Math.round(g + (255 - g) * 0.65);
  var brB = Math.round(b + (255 - b) * 0.65);

  function toHex(n) {
    var h = n.toString(16);
    return h.length < 2 ? '0' + h : h;
  }

  return {
    bg: '#' + toHex(bgR) + toHex(bgG) + toHex(bgB),
    border: '#' + toHex(brR) + toHex(brG) + toHex(brB),
    accent: hexCor
  };
}

function atualizarPreview(num) {
  var input = document.getElementById('corAlerta' + num + 'Input');
  var preview = document.getElementById('previewAlerta' + num);
  if (!input || !preview) return;
  var cores = derivarCores(input.value);
  preview.style.background = cores.bg;
  preview.style.borderColor = cores.border;
  preview.style.borderLeftColor = cores.accent;
  preview.style.borderLeftWidth = '3px';
}

// ═══════════════════════════════════════════════════════
// SALVAR
// ═══════════════════════════════════════════════════════

function salvarConfiguracoes() {
  var dias1 = document.getElementById('diasAlerta1Input').value.trim();
  var dias2 = document.getElementById('diasAlerta2Input').value.trim();

  var d1 = parseInt(dias1, 10);
  var d2 = parseInt(dias2, 10);
  if (isNaN(d1) || isNaN(d2) || d1 <= 0 || d2 <= 0) {
    mostrarMsg('formMsg', 'error', 'Os dias devem ser números maiores que zero.');
    return;
  }
  if (d1 >= d2) {
    mostrarMsg('formMsg', 'error', 'O primeiro alerta deve ter menos dias que o segundo.');
    return;
  }

  var payload = {
    protocolo_dias_alerta1: dias1,
    protocolo_dias_alerta2: dias2,
    protocolo_cor_alerta1: document.getElementById('corAlerta1Input').value,
    protocolo_cor_alerta2: document.getElementById('corAlerta2Input').value,
    cartorio_denominacao: document.getElementById('denominacaoInput').value.trim(),
    cartorio_endereco: document.getElementById('enderecoInput').value.trim(),
    cartorio_email: document.getElementById('emailInput').value.trim(),
    cartorio_telefone: document.getElementById('telefoneInput').value.trim(),
    cartorio_site: document.getElementById('siteInput').value.trim()
  };

  var btnSalvar = document.getElementById('btnSalvar');
  btnSalvar.disabled = true;
  esconderMsg('formMsg');

  fetch('/admin/configuracoes/salvar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) {
        mostrarMsg('formMsg', 'success', 'Configurações salvas com sucesso!');
      } else {
        mostrarMsg('formMsg', 'error', data.erro || 'Erro ao salvar.');
      }
      btnSalvar.disabled = false;
    })
    .catch(function(e) {
      mostrarMsg('formMsg', 'error', 'Erro de comunicação: ' + e.message);
      btnSalvar.disabled = false;
    });
}

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function() {
  // Color picker listeners
  var cor1 = document.getElementById('corAlerta1Input');
  var cor2 = document.getElementById('corAlerta2Input');
  if (cor1) cor1.addEventListener('input', function() { atualizarPreview(1); });
  if (cor2) cor2.addEventListener('input', function() { atualizarPreview(2); });

  // Botão salvar
  var btnSalvar = document.getElementById('btnSalvar');
  if (btnSalvar) btnSalvar.addEventListener('click', salvarConfiguracoes);

  // Preview inicial
  atualizarPreview(1);
  atualizarPreview(2);
});
