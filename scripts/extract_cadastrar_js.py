# Extrai o script de cadastrar.html e gera cadastrar.js (proxy + ES5)
import os
import re

base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
html_path = os.path.join(base, "cadastrar.html")
out_path = os.path.join(base, "app", "static", "js", "cadastrar.js")

with open(html_path, "r", encoding="utf-8") as f:
    content = f.read()

# Encontrar o bloco do script que contém CONFIG
start_marker = "  // ── CONFIGURAÇÃO ──"
end_marker = "</script>"
i = content.find(start_marker)
j = content.find(end_marker, i)
script = content[i:j].strip()

# Remover baseUrl e token do CONFIG; adicionar API_BASE
script = script.replace(
    "  // ── CONFIGURAÇÃO ──\n  var CONFIG = {\n    baseUrl: 'http://192.168.0.31:8084',\n    token: 'uSLVod80ePappwybTjLQSPyJRxdUO02j',\n    tables:",
    "  var API_BASE = '/api/baserow';\n  var CONFIG = {\n    tables:",
)
script = script.replace(
    "return { 'Authorization': 'Token ' + CONFIG.token, 'Content-Type': 'application/json' };",
    "return { 'Content-Type': 'application/json' };",
)
script = script.replace("CONFIG.baseUrl + '/api/database", "API_BASE + '/database")
script = script.replace(
    "window.location.href = 'consultar.html?protocolo='",
    "window.location.href = (window.URL_CONSULTAR || '/consultar') + '?protocolo='",
)
script = script.replace(
    ".map(l => '- ' + l)",
    ".map(function(l){ return '- ' + l; })",
)

os.makedirs(os.path.dirname(out_path), exist_ok=True)
with open(out_path, "w", encoding="utf-8") as f:
    f.write(script)
print("Written:", out_path)
