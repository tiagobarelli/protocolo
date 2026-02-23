# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

## [0.9.0] - 2025-02-23

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