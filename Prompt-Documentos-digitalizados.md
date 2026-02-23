## Tarefa: Card "Documentos Digitalizados" na página de Controle de Escrituras

### Contexto

Na página de **Gestão de Clientes** (`clientes.html` / `clientes.js`) já existe uma integração com o Paperless-ngx que busca documentos pessoais por CPF usando `custom_field_query`, exibe os resultados em um drawer lateral deslizante e permite abrir o PDF ao clicar na thumbnail. O CSS do drawer e dos cards de documento está em `clientes.css`.

Agora precisamos de funcionalidade similar na página de **Controle de Livros de Notas** (`controle.html` / `controle.js` / `controle.css`). A diferença é que aqui a busca será pelo **título do documento** no Paperless, não por custom field. As escrituras são digitalizadas e salvas no Paperless seguindo o padrão de nome `L_XXX_P_YYY` (ex.: `L_500_P_050`, `L_500_P_050_Valor_Venal`, `L_500_P_050_Matrícula`). Portanto, buscando por `L_500_P_050` no título, trazemos a escritura e todos os seus documentos complementares.

### O que fazer

#### 1. HTML — Nova seção + Drawer (`controle.html`)

**Nova seção "Documentos Digitalizados"** dentro do `#formCard`, posicionada **entre a seção "Status e Controle" (seção 3) e a seção "Pendências" (seção 4)**. Estrutura:

```
<!-- Seção 3.5: Documentos Digitalizados (Paperless) -->
<div class="form-section" id="secaoPaperless">
  <div class="section-title">
    <i class="ph ph-files"></i> Documentos Digitalizados
    <button type="button" class="btn-docs" id="btnConsultarPaperless">
      <i class="ph ph-file-search"></i> Consultar
    </button>
  </div>
  <div id="docsResumoControle" class="docs-resumo">
    Clique em "Consultar" para verificar documentos no Paperless.
  </div>
</div>
```
**Drawer lateral** — adicionar no final do `.container`, antes de `</div><!-- /.container -->`, a mesma estrutura do drawer de `clientes.html`:

```
<!-- Drawer lateral — Documentos Paperless -->
<div id="paperlessDrawer" class="paperless-drawer">
  <div class="drawer-header">
    <h3><i class="ph ph-files"></i> Documentos Digitalizados</h3>
    <button type="button" class="drawer-close" id="btnCloseDrawerControle">
      <i class="ph ph-x"></i>
    </button>
  </div>
  <div class="drawer-body" id="drawerBodyControle"></div>
</div>
<div class="drawer-overlay" id="drawerOverlayControle"></div>
```

#### 2. CSS — Estilos do drawer e cards de documento (`controle.css`)

Copiar de `clientes.css` os blocos de estilo referentes a:
- `.paperless-drawer`, `.drawer-header`, `.drawer-close`, `.drawer-body`, `.drawer-overlay` (drawer lateral)
- `.doc-card`, `.doc-thumb`, `.doc-info`, `.doc-title`, `.doc-tags`, `.doc-tag` (cards de documento)
- `.doc-loading`, `.doc-empty` (estados de loading e vazio)
- `.docs-resumo`, `.btn-docs` (resumo inline e botão consultar)
- `.docs-resumo.clickable` (estado clicável do resumo)

Manter os mesmos nomes de classe para consistência visual entre as páginas. Não alterar `clientes.css`.

#### 3. JavaScript — Lógica de busca e exibição (`controle.js`)

**3.1. Variáveis globais** — adicionar no bloco de estado global:
```
var PAPERLESS_API = '/api/paperless';
var cacheDocsPaperlessControle = {};  // chave: identificador "L_X_P_Y", valor: array de docs
```

**3.2. Função `buscarDocumentosPaperless(identificador)`** — nova função que:

- Recebe o identificador no formato `L_XXX_P_YYY` (montar a partir de `livroInput` e `paginaInput`, com os valores numéricos sem zeros à esquerda: usar os valores como estão no formulário).
- Verifica cache (`cacheDocsPaperlessControle[identificador]`); se existe, abre o drawer com os resultados cacheados.
- Caso contrário, exibe spinner de loading no drawer e abre o drawer.
- **Estratégia de busca**: usar o endpoint de full-text search do Paperless:
```
  /api/documents/?query=<identificador>&page_size=50
```
A API de full-text search do Paperless busca no título e conteúdo. Para garantir precisão, após receber os resultados, **filtrar no lado do cliente** mantendo apenas documentos cujo `doc.title` contenha o identificador (verificação case-insensitive com `indexOf` após `toLowerCase()`). Isso evita falsos positivos de documentos que mencionem o identificador apenas no conteúdo OCR.

- Armazena no cache, renderiza documentos, atualiza resumo inline.

**3.3. Função `renderizarDocumentosControle(docs)`** — análoga à `renderizarDocumentos` de `clientes.js`:

- Limpa o `drawerBodyControle`.
- Se `docs.length === 0`, exibe mensagem "Nenhum documento encontrado para este identificador."
- Para cada documento, cria um card com:
    - **Thumbnail** clicável: `src` = `PAPERLESS_API + '/api/documents/' + doc.id + '/thumb/'` — ao clicar, abre `PAPERLESS_API + '/api/documents/' + doc.id + '/preview/'` em nova aba.
    - **Título** do documento (`doc.title`).
    - **Não** é necessário exibir tags nesta página (diferente de clientes, aqui o contexto são escrituras, não tipos de documento pessoal). Porém, se achar que melhora a UX, pode manter. Fica a critério — o importante é que funcione.

**3.4. Função `atualizarResumoInlineControle(docs)`** — atualiza o `#docsResumoControle`:

- Se `docs.length > 0`: exibir texto como "X documento(s) encontrado(s)" com a classe `clickable` e, ao clicar, reabrir o drawer.
- Se `docs.length === 0`: exibir "Nenhum documento encontrado."

**3.5. Funções auxiliares do drawer**: `abrirDrawerControle()` e `fecharDrawerControle()` — mesma lógica do drawer de clientes, operando sobre `#paperlessDrawer` e `#drawerOverlayControle`.

**3.6. Event listeners** — no `DOMContentLoaded` (ou onde os outros listeners são configurados):

- Botão `#btnConsultarPaperless`: ao clicar, montar o identificador a partir dos inputs `livroInput` e `paginaInput` no formato `L_<livro>_P_<pagina>`, e chamar `buscarDocumentosPaperless(identificador)`.
- Botão `#btnCloseDrawerControle`: chamar `fecharDrawerControle()`.
- Overlay `#drawerOverlayControle`: ao clicar, chamar `fecharDrawerControle()`.

**3.7. Limpar estado** — quando o formulário é ocultado ou limpo (ex.: nova busca), limpar o resumo e fechar o drawer se estiver aberto.

### Restrições técnicas obrigatórias

- **ES5 estrito** — sem arrow functions, sem `let`/`const`, sem template literals, sem destructuring, sem `Promise.all`.
- Manter o padrão de código existente em `controle.js` (variáveis com `var`, concatenação com `+`, funções nomeadas).
- **Phosphor Icons** exclusivamente (já em uso: `ph ph-files`, `ph ph-file-search`, etc.).
- O proxy `paperless_proxy.py` **não precisa de alteração** — já repassa qualquer GET.
- Não criar novos arquivos — editar apenas `controle.html`, `controle.js` e `controle.css`.

### Referência direta

Usar como referência concreta a implementação em `clientes.js` (funções `buscarDocumentosPaperless`, `renderizarDocumentos`, `atualizarResumoInline`, `abrirDrawer`, `fecharDrawer`, `configurarDrawer`) e `clientes.html` (drawer HTML) e `clientes.css` (estilos do drawer e cards). Adaptar, não copiar cegamente — aqui a busca é por título (full-text search), não por custom field.

### Teste manual sugerido

1. Ir ao Controle, buscar um registro existente (ex.: L 500, P 50).
2. O card "Documentos Digitalizados" deve aparecer com o botão "Consultar".
3. Clicar em "Consultar" — o drawer deve abrir com spinner, depois exibir os documentos cujo título contenha `L_500_P_050`.
4. Clicar na thumbnail de qualquer documento — deve abrir o PDF em nova aba.
5. Fechar e reabrir — deve usar cache (sem nova chamada).
6. Clicar no resumo inline (ex.: "3 documento(s) encontrado(s)") — deve reabrir o drawer.
7. Buscar outro registro — cache do anterior não interfere; resumo é resetado.
