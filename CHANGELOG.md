# Changelog

Controle de correções e melhorias do sistema

## [0.9.5] - 2026-02-##

### Adicionado

- Controle de Certidões: adicionado o módulo de controle de certidões, com a finalidade de cadastrar a certidão expedida após a abertura do protocolo e emissão de certidão. Isso encerra o clico de fechamento dos protocolos, ao lado do controle de escritura, retificação e substabecimento. Este controle de certidão também permite saber o requerente e os integrantes da certidão solicitada, deixando de prontidão eventual obrigação deste desenho por interpretação da LPGD. Também aplica relacionamento entre tabelas: Cliente <=> Protocolo <=> Controle & Controle-Certidao. **OBS:** **A funcionalidade está implementada, mas não totalmente testada. Testar com o legado de pedidos**.



## [0.9.4] - 2026-02-28

### Corrigido

- Página de cadastro de protocolo: Ao escolher o tipo de serviço como "Certidão notarial", o sistema não carregava o prép preenchimneto do detalhamento, conforme modelo .md referenciado.
- Página de controle de ato: ao busca uma escritura que já foi cadastrada, o sistema não aplica mais o efeto de deslocar a tela. A mensagem de "Registro encontrado — L_X_P_YYY" agora é exibida antes da identificação do ato, e não no final da página, facilitando a visualização pelo usuário.
- Tela de edição de clientes: Na tela de clientes (clientes.html), ao fazer a busca e essa ser bem sucedida, podemos editar os elementos do cadastro e clicar em "Salvar Alterações". Feito isso, a mensagem "Alterações salvas com sucesso!" aparecia no topo superior do card "Dados Pessoais", forçando o usuário a rolar a tela até o início para saber se a alteração foi bem sucedida. Agora o sistema exibe essa mensagem abaixo do botão de "Salvar alterações";

### Adicionado

- Adicionada a função de vincular um protocolo na página de retificão. O objetivo primário é permitir dar por concluído de forma automática um protocolo de uma re-ratificação. Porém, não há impedimento de se proceder da mesma forma para eventual protocolo aberto para uma ata retificativa. Optou-se por não vincular cliente neste tipo de ato, pois já está vinculado à escritura retificada. **OBS:** **A funcionalidade está implementada, mas não totalmente testada. Pendentes vinculações de re-ra para confirmar a segurança do sistema**.

- Adicionada a função de vincular um protocolo na página de susbtabelecimento, igual ao modelo já operado pela página de controle de escrituras. Permite ao usuário vincular o protocolo para fechamento de status e vincular os CPFs e/ou CNPJs do substabelecimento. **OBS:** **A funcionalidade está implementada, mas não totalmente testada. Somente um teste efetuado até o momento**.


## [0.9.3] - 2026-02-26

### Corrigido

- Página de cadastro de retificação: aplicada melhoria na busca, via inserção automática de padPagina() para 00 ou 0, conforme a página, adequando ao padrão L_X_P_YYY; conforme já existente na página de busca de controle de ato.
- Página de cadastro de substabelecimento: aplicada melhoria na busca, via inserção automática de padPagina() para 00 ou 0, conforme a página, adequando ao padrão L_X_P_YYY; conforme já existente na página de busca de controle de ato.
- Página de cadastro de cliente: corrigido um bug onde, após não localizar o cliente e permitir o cadastro, o sistema quebrava ao clicar em salvar. Agora foi setado o modoNovo = true.
- Página de cadastro de cliente: a seção de alerta ficava ao final da página. Na existência de vários protocolo para o cliente, a visualização ficava difícil. Deslocado para o início da página, antes dos dados do cliente, facilitando a visualização. Para os usuários que não têm permissão de cadastro de alerta, este somente é exibido quando existente.

## [0.9.2] - 2026-02-25

### Corrigido

- Painel inicial: refatoramento do index.js para alterar a sistemática de chamada de protocolos. Agora só chama um valor acima de vinte quando altera a página, permitindo que o sistema leia mais do que os duzentos permitidos na documentação do Baserow.

## [0.9.1] - 2026-02-25

### Corrigido
- Protocolo: Por um erro de configuração do dockerignore, o modelo pré preenchido do detalhamento do pedido de certidão notarial não estava carregando.
- Painel inicial: Por um erro de configuração de permissões, nem todos os usuário conseguiam visualizar o menu "Consultar Protocolo" e acessar a página.
- Sistema de comentários/notificações: corrifigo um problema onde a inserção do nome do usuário via "@" acarretava uma junção inconveniente com a mensagem digitada. Agora: o sistema insere o nome do usuário e quebra a linha automaticamente para o usuário digitar a mensagem.

### Adicionado
- Cadastro de protocolo: ao inserir o CPF no campo do interessado, o sistema verifica junto ao ODIN a existência de documento digitalizado e fornece ao usuário a opção de vê-los.

## [0.9.0] - 2026-02-23

### Adicionado
- Painel inicial: os cards são exibidos em ordem numérica decrescente, facilitando a visualização das novas inserções.
- Painel inicial: limitação de vinte protocolos por vez. A navegação para os próximos fica ao final, com setas e indicão de páginas.
- Relatório de atos: se foi cadastrada pendência em algum ato, o relatório a exibe na linha seguinte do ato, em tom laranja para fácil distinção.
- Clientes: a API do ODIN não estava devidamente cadastrada para também ler o id da chave <CPF_2> quando solicitada a busca; o que ibnviabilizava encontrar certidão de casamento ou documento de união estável. Agora o sistema faz checagem dupla: primeiro o id da chave <CPF> e, depois, o id da chave <CPF_2>; retornando todos os resultados e capturando corretamente os documentos com dupla vinculação de CPF.
- Controle: a página controle de atos passa a contar com um chamado ao ODIN, semelhante ao contido na página Clientes. Ela retorna todos os documentos vinculados ao ato, respeitando o padrão <L_X_P_YYY>. Essa melhoria permitirá verificar se todas as digitalizações estão no ODIN sem trocar a tela.
- Protocolo: além da data de agendamento, é possível inserir a hora que foi combinada com o cliente. Essa inserção pavimenta a futura inserção de um calendário visual com os agendamentos no sistema.

### Corrigido
- Controle de atos: a lista de seleção de atos não estava carregando a tipagem em ordem alfabética, dificultando a leitura. Corrigido para ordem alfabética.
- Controle de atos: após finalizar o cadastro da escritura, a mensagem indicando o sucesso da operação era exibida no começo da página, forçando o usuário a retonar até o início para saber se a operação foi bem sucedida. Diante do cadastro de vários imóveis, a praticidade ficava ainda mais prejudicada. Agora o sistema exibe a mensagem de sucesso da operação abaixo do botão de salvar.
- Login: A página de login indicava um exemplo ruim no placeholder do e-mail. Corrigido para a exbição do exemplo correto ao usuário.
- Clientes: Ao cadastrar um cliente, o usuário inseria um CPF ou CNPJ, preenchia todos os campos e, ao salvar, o sistema apresentava erro de violação do DB por restrição de campo do tipo unique. Corrigido: agora ao digitar o CPF ou CNPJ e sair de qualquer desses campos, o sistema verifica a existência de cadastro. Se existir, informa ao usuário e o retorna para a página de busca de cliente, evitando que prossiga no cadastro.
- Impressão de relatório: a impressão não continha a data de agendamento e/ou horário de agendamento quando eses campos esravam corretamente preenchidos no cadastro.
- Menu lateral: melhora da redação para suprimir a confusão entre a consulta de protocolo e a consulta de clientes.
- Cadastro de protocolo: o sistema sempre imputava o tabelião como criador do protocolo, mesmo que fosse criado por outro usuário logado. Corrigo com iñserção própria no DB ("Criado por Sistema").