# Changelog

Controle de correções e melhorias do sistema

## [2.0] 2026-06-29

### Refatoração visual

- **Shadow**. Alteração global do design do sistema para um visual mais claro, leve e profissional. Alteração do ícone para um mais leve e objetivo.

### Adicionado

- **Módulo de Eventos Societários (Pessoa Jurídica):** a aba **Eventos Societários** da tela de Pessoa Jurídica, antes reservada, passou a ser um módulo completo para acompanhar a vida societária da empresa — quem são os sócios, suas cotas e qualificações, e o histórico de atos (contrato social, alterações, certidões etc.). A aba fica disponível depois que a pessoa jurídica está salva.
- **Quadro Societário Atual:** painel que lista os sócios ativos da empresa, cada um com a sua participação (percentual), a qualificação (Sócio, Sócio-administrador ou Administrador não sócio) e o documento (CPF/CNPJ), além do **total das cotas**. Os sócios são exibidos da maior para a menor participação; em caso de empate, o sócio-administrador aparece primeiro e, persistindo o empate, segue a ordem alfabética. Funciona também quando o sócio é outra pessoa jurídica (aparece com o CNPJ).
- **Linha do Tempo de eventos:** histórico cronológico (do mais recente para o mais antigo) de todos os atos da empresa, com data, tipo, descrição formatada e, nos atos que mexem na composição societária, as **movimentações de sócios** classificadas em entradas, saídas e alterações.
- **Registro de eventos documentais:** é possível registrar atos que **não** alteram o quadro societário (comprovante de CNPJ, certidão, ficha da junta comercial, procuração outorgada etc.), informando tipo, data do ato e uma descrição com formatação (negrito, itálico e listas).
- **Registro de atos que alteram o quadro:** ao registrar um **Contrato Social Inicial** ou uma **Alteração de Contrato Social**, abre-se um editor do quadro societário onde se define o resultado — sócios, cotas e qualificações, com busca de sócios já cadastrados. Ao salvar, o sistema calcula automaticamente as entradas, saídas e alterações de cota e atualiza o Quadro Atual. O salvamento só é liberado quando a soma das cotas fecha **100%**.
- **Anexo por evento:** cada ato pode receber um arquivo (PDF ou imagem), guardado em pastas legíveis no servidor, organizadas pelo CNPJ da empresa e pelo evento. Ver e baixar o anexo é liberado a todos os usuários; **anexar** é restrito aos perfis master e administrador, e **excluir o anexo**, somente ao master. Cada evento mantém um único arquivo — um novo envio substitui o anterior.
- **Edição de eventos (perfil master):** o master pode corrigir o **tipo, a data e a descrição** de qualquer evento. No ato **mais recente** que altera o quadro, é possível também reeditar o **efeito no quadro societário**, refazendo as movimentações de sócios; nos atos anteriores que alteram o quadro, o efeito permanece travado para preservar o histórico.
- **Exclusão de eventos documentais (perfil master):** o master pode excluir um evento documental, que deixa de aparecer na linha do tempo. A exclusão é **reversível** — o registro e o eventual anexo são preservados e podem ser recuperados.

### Melhorias

- **Limite de anexos ampliado:** o tamanho máximo de cada arquivo enviado ao sistema (anexos de eventos societários, de ofícios e de protocolos) passou de 20 MB para **100 MB**, acomodando atos e documentos digitalizados maiores.

## [1.4.0] 2026-06-25

### Adicionado

- **Módulo de Ofícios:** novo módulo para registrar e acompanhar a correspondência oficial do cartório, dividido em **Ofícios recebidos** e **Ofícios enviados**. É acessível por todos os usuários pelo novo grupo **Gestão Administrativa** na barra lateral.
- **Listagem de ofícios com abas e filtros:** a tela de Ofícios apresenta duas abas (Recebidos e Enviados), cada uma com filtro por **ano**, **busca** por número ou por remetente/destinatário e, nos recebidos, filtro por **situação** (Pendente ou Cumprido). Cada linha mostra o número, a data, o remetente/destinatário, uma **prévia da descrição** (formatada, em até três linhas), os clientes vinculados, a situação e um indicador quando o ofício tem um par vinculado (resposta).
- **Cadastro e edição de ofício:** tela única para criar e editar ofícios, com número e letra, data, remetente/destinatário, descrição com formatação (negrito e itálico), clientes vinculados, anotações internas e, nos recebidos, data de cumprimento. As alterações ficam registradas em um **histórico** dentro do próprio ofício.
- **Anexos do ofício:** cada ofício pode receber arquivos (digitalizações e documentos-fonte), guardados em pastas legíveis no servidor, organizadas por tipo, ano e número. Os anexos podem ser baixados por qualquer usuário; enviar e excluir é restrito aos perfis master e administrador. Depois que um ofício tem anexos, seu número e letra ficam travados para preservar a correspondência com a pasta de arquivos.
- **Vínculo entre ofício recebido e enviado:** um ofício recebido pode ser associado ao ofício enviado que o respondeu (e vice-versa). O sistema só oferece para vincular ofícios que ainda não estão vinculados a nenhum outro, e o elo é mantido nos dois lados automaticamente.
- **Aviso de número repetido:** ao salvar um ofício com número e letra já usados no mesmo ano, o sistema bloqueia e sugere a próxima letra livre (por exemplo, "15/A já existe — usar 15/B?").
- **Cadastro de Remetentes / Destinatários:** nova aba em Configurações (perfil master) para cadastrar, editar e excluir as entidades que aparecem no seletor de remetente/destinatário dos ofícios (varas, órgãos, instituições financeiras, tabelionatos etc.), sem precisar mexer diretamente no banco. Entidades já vinculadas a algum ofício não podem ser excluídas.

### Melhorias

- **Barra lateral reorganizada:** o grupo "Gestão de Atos" passou a se chamar **Gestão Notarial** e "Relatórios" passou a **Consultas**. O novo grupo **Gestão Administrativa** (com os Ofícios) aparece logo acima da Gestão Notarial.
- **Cadastro de Pessoa Física reorganizado em abas:** a tela de Pessoa Física foi reformulada para ficar mais clara e fácil de usar. O campo de busca passou a ficar sempre visível no topo, e o restante do cadastro só aparece depois de buscar um cliente ou iniciar um novo. Os dados, antes empilhados em um formulário único e longo, foram divididos em **8 abas** — Cliente, Dados Auxiliares, Estado Civil, Endereços, Qualificações Especiais, Informações Complementares, Protocolos Vinculados e Histórico — facilitando localizar cada informação. As abas que dependem de um cliente já salvo (Endereços, Protocolos e Histórico) ficam desabilitadas até o cadastro existir.
- **Cadastro de Pessoa Jurídica reorganizado em abas:** a tela de Pessoa Jurídica recebeu o mesmo tratamento, dividida em **6 abas** — Denominação, Contato, Endereços, Protocolos Vinculados, Histórico e Eventos Societários (esta última reservada para uma funcionalidade futura). As abas que dependem de um registro salvo (Endereços, Protocolos, Histórico e Eventos) começam desabilitadas e são liberadas após salvar.
- **Resumo do cliente sempre à vista:** no topo da primeira aba, uma faixa de destaque mostra o nome (ou denominação) e o documento (CPF/CNPJ) do cliente em foco, para que a identificação fique visível sem precisar rolar a página.
- **Botão "Salvar" sempre acessível:** Salvar e Limpar passaram a ficar em uma barra fixa no rodapé do cadastro, sempre ao alcance independentemente da aba aberta. O cadastro continua sendo salvo de uma vez só, com todas as abas. Na aba Endereços, em que cada endereço é salvo individualmente, essa barra é ocultada para evitar confusão.
- **Validação leva direto ao campo com problema:** ao salvar com alguma pendência (nome/denominação em branco, CPF/CNPJ ausente ou inválido), o sistema agora abre automaticamente a aba do campo e posiciona o cursor nele, mostrando o aviso ao lado do botão Salvar.
- **Aviso de cliente já cadastrado mais discreto:** ao localizar um cliente existente pela busca, a confirmação passou a aparecer como um aviso flutuante (toast) no canto da tela, que some sozinho, em vez de uma faixa fixa no formulário.
- **Máscara automática de CNPJ na busca de Pessoa Jurídica:** ao digitar o CNPJ no campo de busca, a formatação `00.000.000/0000-00` é aplicada automaticamente, sem precisar digitar a pontuação, e a busca dispara ao completar os 14 dígitos.
- **Complemento no card de endereço:** quando preenchido, o complemento do endereço (ex.: "apartamento 51") passou a ser exibido na primeira linha do card, junto do logradouro e número.

### Correções

- **Relatório de Certidões respeitava a data de busca:** corrigido o filtro de data do relatório de Certidões Expedidas, que retornava sempre o mesmo conjunto de certidões independentemente do ano ou período informado. Agora, trocar o ano ou o período estreita corretamente o resultado, um intervalo sem certidões volta vazio e as certidões nas datas de início e fim do intervalo passam a ser incluídas.

## [1.3.1] 2026-06-23

### Adicionado

- **Botão "Ver no Google Maps" nos endereços:** cada endereço cadastrado na aba Endereços do cliente ganhou um botão de mapa que abre o Google Maps em uma nova aba, já buscando o endereço completo daquele registro (logradouro, número, bairro, município, UF e CEP).
- **Anotações no endereço:** o cadastro de endereço passou a ter um campo opcional de **Anotações**, para observações que não fazem parte do endereço em si. Quando preenchida, a anotação aparece em destaque no card do endereço, no estilo de um post-it amarelo, preservando as quebras de linha do texto.

## [1.3] 2026-06-22

### Adicionado

- **Endereços estruturados dos clientes:** as telas de Pessoa Física e Pessoa Jurídica foram reorganizadas em duas abas — **Dados** e **Endereços**. A aba Endereços permite cadastrar quantos endereços forem necessários para o mesmo cliente, cada um com tipo (Residencial ou Profissional), CEP, logradouro, número, complemento, bairro, município, UF e país. Cada endereço é gravado como um registro próprio, com autor e data de criação/atualização. A aba só fica disponível depois que o cliente está salvo (carregado por busca ou recém-cadastrado).
- **Preenchimento automático por CEP (ViaCEP):** ao digitar um CEP válido no cadastro de endereço, o sistema consulta a base dos Correios e preenche automaticamente logradouro, bairro, município e UF. O número e o complemento continuam sendo digitados manualmente. Se o CEP não for encontrado ou o serviço estiver indisponível, é exibido um aviso discreto e todos os campos permanecem editáveis para preenchimento manual — o cadastro funciona normalmente em qualquer caso.

### Melhorias

- **Endereço do cliente fora do formulário principal:** o antigo campo de endereço em texto livre saiu dos formulários de Pessoa Física e Pessoa Jurídica e do detalhamento do cliente, dando lugar ao novo módulo de endereços estruturados. Os endereços antigos já cadastrados continuam preservados na base e poderão ser migrados para o novo formato.

## [1.2.2] 2026-06-19

### Melhorias

- **Formatação nas notas de andamento:** o campo de criação de uma nova nota de andamento (tela do protocolo) ganhou uma barra de ferramentas com três botões — **negrito**, *itálico* e **lista numerada** — que aplicam a formatação ao texto selecionado (ou inserem um modelo, quando não há seleção). As notas salvas passam a ser exibidas já formatadas, tanto na tela do protocolo quanto na página To Do. Notas antigas, escritas em texto simples, continuam sendo exibidas normalmente. A edição do texto de uma nota já registrada permanece em texto simples (sem a barra de ferramentas); quem quiser formatar na edição pode digitar a marcação manualmente.

### Correções

- **Cadastro de protocolo com advogado já existente:** corrigido o erro que impedia salvar um protocolo quando o advogado informado tinha um CPF já cadastrado, mas não havia sido localizado pela busca por nome (por exemplo, quando o nome foi digitado sem acento). Agora, antes de criar um advogado novo, o sistema verifica o CPF na base: se já existir, reaproveita o cadastro, completa apenas os campos que estiverem vazios (telefone, e-mail e OAB) e avisa que os dados foram reaproveitados, sem nunca sobrescrever informações já preenchidas.

## [1.2.1] 2026-06-17

### Melhorias

- **Destaque de tarefas para hoje (To Do):** na página To Do, cada tarefa cuja data de conclusão é o dia de hoje ganha uma faixa lateral roxa e uma etiqueta "Hoje" ao lado do texto, facilitando identificar rapidamente o que precisa ser feito no dia.
- **Ordenação dos cards na página To Do:** novo seletor que permite ordenar os protocolos por "Protocolo mais antigo primeiro" (padrão), "Protocolos mais recentes primeiro" ou "Protocolos com tarefas para hoje" (que leva ao topo os protocolos com tarefa agendada para hoje). A ordem interna das tarefas dentro de cada protocolo não muda.
- **Edição do texto dos andamentos:** agora é possível corrigir o texto de uma nota de andamento já registrada, tanto na tela do protocolo quanto na página To Do, sem precisar criar uma nova nota. A edição é feita no próprio local (botão de lápis) e altera apenas o texto — nunca dispara e-mail. O botão de editar só aparece para o autor da nota ou para o perfil master; tarefas já concluídas não podem ser editadas.
- **Conclusão de tarefas por círculo (tela do protocolo):** os botões "Concluir" e "Reabrir" das tarefas no card do protocolo foram substituídos por um único círculo clicável à esquerda da nota, no mesmo padrão visual da página To Do. Clicar no círculo conclui (com animação) ou reabre a tarefa, que permanece visível na lista com o estado atualizado.

## [1.2.0] 2026-06-15

### Adicionado

- **Andamentos estruturados:** o antigo campo único de texto "Andamento" na tela do protocolo foi substituído por um sistema de andamentos individuais. Cada andamento é um registro próprio, exibido em ordem cronológica (do mais antigo ao mais novo), com autor e data/hora de criação.
- **Tarefas (To Do):** ao registrar um andamento, é possível marcá-lo como **Tarefa**. Tarefas podem ser concluídas ou reabertas tanto no card do protocolo quanto na nova página To Do.
- **Data da tarefa:** ao marcar um andamento como Tarefa, é possível indicar uma **data para conclusão** (opcional). A data pode ser definida na criação da tarefa e também editada depois, diretamente em cada tarefa já registrada no card do protocolo.
- **Página To Do:** nova página, acessível pela barra lateral, que lista as tarefas pendentes do usuário logado. As tarefas são **agrupadas por protocolo** e cada grupo exibe o número do protocolo (com link direto), o tipo de ato, o interessado e o advogado (quando houver). Os grupos são ordenados pelo número do protocolo e as tarefas, dentro de cada grupo, da mais antiga para a mais nova.
- **Quadro de situação na página To Do:** no topo da página, um painel de contadores resume as tarefas pendentes em quatro grupos — **Hoje**, **Futuro**, **Sem agendamento** e **Atrasadas** — conforme a data de conclusão indicada em cada tarefa.
- **Notificação por e-mail no andamento:** ao registrar um andamento, é possível marcar a opção de **notificar os interessados por e-mail**. O sistema envia o conteúdo do andamento para o interessado e para o advogado (quando ambos tiverem e-mail cadastrado). Caso nenhum e-mail esteja cadastrado, o andamento é salvo normalmente e o usuário é avisado de que o e-mail não foi enviado.
- **Indicador de tarefas pendentes:** a barra lateral exibe um contador (badge) com o número de tarefas pendentes do usuário ao lado do link To Do, atualizado automaticamente. O badge usa a cor verde para diferenciá-lo do badge de notificações (vermelho).

## [1.1.1] 2026-05-29

### Melhorias

- Páginas de Controle de Atos e Retificações: os selects de status (Digitalização, DOI e ODIN no controle; ODIN e Anotado nas retificações) agora exibem uma borda verde mais grossa quando o valor selecionado indica conclusão, facilitando a identificação visual rápida de itens concluídos. O destaque aparece tanto ao carregar um registro existente quanto ao alterar o valor manualmente.

## [1.1.0]

### Adicionado

- Aba Notificações Enviadas na página de notificações. Agora é possível visualizar o histórico de menções feitas pelo usuário em comentários de protocolos. Notificações enviadas para múltiplos destinatários no mesmo comentário são agrupadas em um único item.

### Melhorias

- Tela de finalização de protocolo de certidão: alteração na ordem dos campos. Se o usuário selecionar uma escritura para vincular ao pedido de certidão, o sistema já puxa os clientes cadastrados na escritura, desde que a escritura esteja cadastrada no controle de atos.

## [1.0.5] 2026-04-12

### Melhorias

- Quando o usuário insere um nome de advogado no controle se escritura, o sistema atribui um ícone de balança ao nome caso ele esteja habilitado como advogado no sistema.

### Adicionado

- Tela configurações. Nova tela com duas abas:
    - Dados do cartório: permite a edição rápida dos dados do cartório, refletindo nos cabeçalhos em que essas informações são impressas.
    - Protocolos: permite a imputação de tempo para os dois avisos de protocolo atrasados; e permite a alteração das cores de destaque.

## [1.0.4] 2026-04-11

### Melhorias

- Busca de cliente pessoa física: o sistema aplica a máscara de CPF automaticamente. Já não é necessário colocar manualmente os pontos e o traço.
- Relatório de livro: Agora a bag e o texto que indica que a escritura foi retificada recebeu uma cor amarela, permitindo a rápida distinção das outras colunas.

## [1.0.3] 2026-03-19

### Corrigido

- Criação de protocolo: corrigido o tamanho do campo de agendamento, que ficou espremido após a supressão do campo de número manual do protocolo.
- Cliente pessoa física: corrigido um erro que não permitia inserir um CNPJ para a pessoa física, após indicar que ela exercia a empresa como empresário individual.
- Página de controle de ato: inserida validação para não permitir ao usuário cadastrar uma escritura errada neste módulo (certidão, retificação e substabelecimento).
- Página de detalhamento de protoocolo: agora exibe corretamente o telefone e emal do interessado, quando estes elementos estão presentes. Mesmo mecanismo para o advogado assessor, quando este é inserido.

## [1.0.2] 2026-03-18

A numeração dos protocolos agora é automática. Sistema na versão inicial colocado em produção.

### Corrigido

- Envio de email - A alteração para numeração automática exigiu converter o campo *Protocolo* em inteiro, mas o script python para o e-mail exige str para a formação do html do e-mail.

## [0.9.11] 2026-03-17

### Adicionado
- Detalhamento de clientes: inaugurada uma seção destinada ao detalhamento de um cliente, onde o sistema exibe a participação dele em escrituras, protocolos e certidões.
- Criação de Protocolo: agora permite que o usuário cadastre alguma anotação referente ao interessando no protocolo, que não seja o telefone e email. Essa anotação ingressa no cadastro do cliente, mas não no relatório impresso.
- Criação de Protocolo: na oc

## [0.9.10] - 2026-03-14

### Reformulado
- Clientes: a tela de clientes foi reformulada para trabalhar a distinção possível entre casamento e união estável: o cliente pode ser divorciado e conviver em união estável. Agora o DB trabalha com campos distintos para isso, permitindo um detalahamento maior. **Pendente:** Melhorias bidirecionais de alterações de estado civil foram criadas, mas é necessário o uso mais intenso do sistema para a detectação de eventual bug nos relacionamentos.

### Corrigido
- Clientes: limpar elimita o resíduo dos campos de busca em PF e PJ.
- Retificações: mensagem de sucessão do cadastro realocada. 

## [0.9.9] - 2026-03-13

### Adicionado
- Clientes: a tela de gestão de clientes foi dividida em duas páginas dedicadas — Pessoa Física e Pessoa Jurídica — eliminando ambiguidade jurídica no cadastro. A tela de Pessoa Física exibe apenas registros com CPF; a de Pessoa Jurídica exibe apenas registros com CNPJ e sem CPF.
- Clientes (Pessoa Física): adicionados os campos booleanos Empresário Individual, Advogado e Corretor de Imóveis, com switches que revelam condicionalmente os campos CNPJ (empresário individual), OAB e CRECI. Ao informar CNPJ de empresário individual, o sistema verifica se o mesmo CNPJ já está cadastrado como Pessoa Jurídica e emite alerta informativo.
- Sidebar: a seção CLIENTES passa a exibir dois itens — "Pessoa Física" (ícone user-gear) e "Pessoa Jurídica" (ícone building-office).
- Cadastro de Protocolo: adicionada seção "Corretor(es)" com seleção múltipla via chips. Permite vincular um ou mais corretores ao protocolo, buscando qualquer cliente da base. Ao salvar, o sistema verifica e atualiza automaticamente os flags `Corretor_T_F` (field_7431) e `Advogado_T_F` (field_7430) na tabela de clientes, quando estes ainda não estiverem marcados como `true`.
- Detalhamento de Protocolo: exibe os corretores vinculados ao protocolo com nome, CPF e CRECI (quando preenchido). A informação não consta no relatório impresso.
- Revogação de Procuração: módulo dedicado ao cadastro de escrituras de revogação de procuração. Permite vincular a procuração revogada e o protocolo da revogadora.

## [0.9.8] - 2026-03-07

### Corrigido
- Clientes: redução da presença de placeholders, que poluiam a visualização.
- Cadastro protocolo: redução da presença de placeholders, que poluiam a visualização
- Clientes: melhoria no posicionamento das mensagens de cliente já cadastrado, cliente não cadastrado e elementos salvos na tela.

### Adicionado
- Sidebar: inseridas seções quebrando os temas Protocolo / Cliente; visando reduzir a confusão entre o botão pesquisar protocolo e pesquisar cliente. A alteração deixa a seção "Clientes" preparada para um futuro relatório discriminatório.
- COAF: inserida uma seção dedicada ao cadastro da análise de atos abarcados no risco de lavagem de dinheiro e financiamento ao terrorismo.
- COAF: inserida uma seção dedicada ao relatório de análise cadastradas ou pendentes. O filtro é por Livro notarial e o sistema apenas retorna aqueles atos cujo tipo estão indicados como true no campo 'Sujeito_COAF' da table específica.

## [0.9.7] - 2026-03-04

### Corrigido
- Usuários: a tela de usuários não permitia ao usuário master alterar a sua senha.
- Detalhamento protocolo: um erro distorcia a data ou hora de agendamento, quando esses campos eram editados.

### Adicionado
- Calendário: inserida a página de calendário ao menu. Esta página exibe graficamente um calendário mensal. Os protocolos que possuem agendamento são exibidos e permite ao usuário clicar e detalhar o protocolo.

## [0.9.6] - 2026-03-04

### Adicionado
- Iniciada a consilidação visual do sistema, com alterações profundas nas cores do layout, ícones, inserção do logo e indicação do nome oficial do sistema.

## [0.9.5] - 2026-03-01

### Adicionado
- Controle de Certidões: adicionado o módulo de controle de certidões, com a finalidade de cadastrar a certidão expedida após a abertura do protocolo e emissão de certidão. Isso encerra o clico de fechamento dos protocolos, ao lado do controle de escritura, retificação e substabecimento. Este controle de certidão também permite saber o requerente e os integrantes da certidão solicitada, deixando de prontidão eventual obrigação deste desenho por interpretação da LPGD. Também aplica relacionamento entre tabelas: Cliente <=> Protocolo <=> Controle & Controle-Certidao. **OBS:** **A funcionalidade está implementada, mas não totalmente testada. Testar com o legado de pedidos**.
- Relatório de controle de certidão: derivado da implementação anterior, permite visualizar quais protocolos de certidão notarial está em aberto e/ou foi concluído, fornecendo uma visão global dos pedidos, limitada, porém, a seleções anuais. **OBS:** **A funcionalidade está implementada, mas não totalmente testada. Testar com o legado de pedidos**.
- A tela de detalhamento de protocolo indica qual o ato que o protocolo originou, desde que já tenha ocorrido o cadastro pelo setor de controle.

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