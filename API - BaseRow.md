# Table 'Clientes' (ID: 754)

| **Field ID** | **Nome (Label)**         | **Tipo (API)**     | **Propriedades Técnicas / Constraints** | **Descrição (Tooltip/Placeholder)**                               |
| ------------ | ------------------------ | ------------------ | --------------------------------------- | ----------------------------------------------------------------- |
| **7237**     | Nome                     | `text`             | **Primary Key**                         | Nome do cliente                                                   |
| **7238**     | CPF                      | `text`             | `unique_with_empty`                     | CPF para pessoa física                                            |
| **7239**     | CNPJ                     | `text`             | `unique_with_empty`                     | CNPJ, se pessoa jurídica                                          |
| **7243**     | Telefone                 | `text`             | -                                       | Telefone para contato                                             |
| **7244**     | Email                    | `email`            | -                                       | -                                                                 |
| **7245**     | Endereço                 | `long_text`        | `enable_rich_text: true`                | -                                                                 |
| **7246**     | Outros                   | `long_text`        | `enable_rich_text: true`                | -                                                                 |
| **7247**     | 🪢 Protocolos            | `link_row`         | Table ID: 755; Multiple                 | -                                                                 |
| **7255**     | 🪢 Protocolos - Advogado | `link_row`         | Table ID: 755; Multiple                 | -                                                                 |
| **7256**     | OAB                      | `text`             | -                                       | Número e Estado da OAB, se advogado                               |
| **7310**     | Criado por               | `created_by`       | `read_only: true`                       | -                                                                 |
| **7311**     | Alterado por             | `last_modified_by` | `read_only: true`                       | -                                                                 |
| **7318**     | Concat                   | `formula`          | `formula_type: text`                    | `concat(field('Nome'), ' - ', field('CPF'))`                      |
| **7320**     | NFSe - Notas             | `link_row`         | Table ID: 759; Multiple                 | -                                                                 |
| **7342**     | RG                       | `text`             | -                                       | Descreva o RG do cliente junto com o órgão expedidor              |
| **7343**     | Estado Civil             | `single_select`    | -                                       | Estado civil do cliente                                           |
| **7344**     | Cônjuge                  | `link_row`         | Table ID: 754; Single                   | Indicar o cônjuge. Apenas quando casado.                          |
| **7345**     | Nascimento               | `date`             | `date_format: EU`                       | Insira a data de nascimento                                       |
| **7347**     | Profissão                | `text`             | -                                       | -                                                                 |
| **7348**     | Regra patrimonial        | `single_select`    | -                                       | Regras patrimoniais exclusivas para o estado civil de casado      |
| **7380**     | 📍Controle               | `link_row`         | Table ID: 745; Multiple                 | -                                                                 |
| **7394**     | Alerta                   | `long_text`        | `enable_rich_text: true`                | Alertas e outros elementos de atenção envolvendo o cliente        |
| **7395**     | Logs                     | `long_text`        | `enable_rich_text: true`                | -                                                                 |
| **7412**     | 📍Substabelecimentos     | `link_row`         | Table ID: 762; Multiple                 | -                                                                 |
| **7420**     | Requerente_Certidao      | `link_row`         | Table ID: 776; Multiple                 | -                                                                 |
| **7422**     | Controle_Certidao        | `link_row`         | Table ID: 776; Multiple                 | -                                                                 |
| **7429**     | Empresario_T_F           | `boolean`          | `default: false`                        | Indica se o cliente com CPF tem também CNPJ                       |
| **7430**     | Advogado_T_F             | `boolean`          | `default: false`                        | Indica se o cliente PF é também advogado                          |
| **7431**     | Corretor_T_F             | `boolean`          | `default: false`                        | Indica se o cliente PF é corretor de imóveis                      |
| **7432**     | CRECI                    | `text`             | -                                       | Campo de inserção do cadastro profissional                        |
| **7434**     | Protocolos               | `link_row`         | Table ID: 755; Multiple                 | -                                                                 |
| **7449**     | Revogacao_procuracao     | `link_row`         | Table ID: 777; Multiple                 | -                                                                 |
| **7450**     | Uniao_Estavel_T_F        | `boolean`          | `default: false`                        | Indica se o cliente convive em união estável                      |
| **7451**     | Regra_patrimonial_UE     | `single_select`    | -                                       | Regras exclusivas quando Uniao_Estavel_T_F for true               |
| **7452**     | Companheiro              | `link_row`         | Table ID: 754; Single                   | Auto-relacionamento para o companheiro(a)                         |
| **7453**     | **Falecido_T_F**         | `boolean`          | `default: false`                        | _(Novo)_ Indica se o cliente faleceu                              |
| **7454**     | **Data_Falecimento**     | `date`             | `date_format: EU` (DD/MM/YYYY)          | _(Novo)_ Data de falecimento (condicionado a Falecido_T_F = true) |

### Mapeamento de Enums Atualizados

#### **Estado Civil (Field ID: 7343)**

| **Option ID** | **Valor (Label)** | **Cor**       |
| ------------- | ----------------- | ------------- |
| **3092**      | Casado            | `purple`      |
| **3097**      | Separado          | `dark-brown`  |
| **3107**      | Solteiro          | `darker-blue` |
| **3098**      | Divorciado        | `darker-red`  |
| **3099**      | Viúvo             | `darker-cyan` |
#### **Regra Patrimonial (Casados) (Field ID: 7348)**

| **Option ID** | **Valor (Label)**               | **Cor**        |
| ------------- | ------------------------------- | -------------- |
| **3102**      | Comunhão parcial                | `dark-gray`    |
| **3103**      | Comunhão universal              | `light-purple` |
| **3104**      | Separação convencional          | `orange`       |
| **3105**      | Separação obrigatória           | `dark-yellow`  |
| **3106**      | Participação final nos aquestos | `dark-brown`   |

#### **Regra Patrimonial UE (União Estável) (Field ID: 7451) - _(Novo)_**

| **Option ID** | **Valor (Label)**               | **Cor**            |
| ------------- | ------------------------------- | ------------------ |
| **3121**      | Comunhão parcial                | `purple`           |
| **3122**      | Comunhão universal              | `deep-dark-orange` |
| **3123**      | Separação convencional          | `light-gray`       |
| **3124**      | Separação obrigatória           | `darker-gray`      |
| **3125**      | Participação final nos aquestos | `dark-brown`       |

# Table 'Controle' (ID: 745)

| **Field ID** | **Nome (Label)**     | **Tipo (API)**  | **Propriedades Técnicas / Constraints** | **Descrição (Tooltip/Placeholder)**                                |
| ------------ | -------------------- | --------------- | --------------------------------------- | ------------------------------------------------------------------ |
| **7216**     | _                    | `formula`       | **Primary Key**; `formula_type: text`   | Gerado via: `concat('L_', field('Livro'), '_P_', field('Página'))` |
| **7189**     | Livro                | `text`          | -                                       | Número do livro em análise                                         |
| **7190**     | Página               | `text`          | -                                       | A página inicial da escritura                                      |
| **7194**     | Tipo Escritura       | `link_row`      | Table ID: 746; Single                   | Tipo de escritura em análise                                       |
| **7198**     | Escreventes          | `link_row`      | Table ID: 747; Single                   | Escrevente responsável                                             |
| **7200**     | Digitalização        | `single_select` | Default ID: 3054                        | Indica se a digitalização está concluída na pasta                  |
| **7201**     | DOI                  | `single_select` | Default ID: 3058                        | Indicar se a DOI já está salva na pasta do servidor                |
| **7202**     | ODIN                 | `single_select` | Default ID: 3061                        | Indicar se as digitalizações e DOI já foram carregadas no ODIN     |
| **7203**     | Pendências           | `long_text`     | `enable_rich_text: true`                | Anotar pendências para a completa regularização da escritura       |
| **7226**     | Data                 | `date`          | `date_format: EU` (DD/MM/YYYY)          | Data da escritura                                                  |
| **7232**     | Retificada por       | `link_row`      | Table ID: 753; Multiple                 | Preenchimento automático                                           |
| **7260**     | COAF                 | `link_row`      | Table ID: 756; Multiple                 | Preenchimento automático                                           |
| **7331**     | Substabelecimento    | `link_row`      | Table ID: 762; Multiple                 | -                                                                  |
| **7339**     | Teor Escritura       | `long_text`     | `enable_rich_text: true`                | O texto completo da escritura                                      |
| **7377**     | Protocolo            | `link_row`      | Table ID: 755; Single                   | -                                                                  |
| **7379**     | Clientes             | `link_row`      | Table ID: 754; Multiple                 | -                                                                  |
| **7384**     | Imoveis              | `link_row`      | Table ID: 773; Multiple                 | -                                                                  |
| **7425**     | Controle_Certidao    | `link_row`      | Table ID: 776; Multiple                 | -                                                                  |
| **7439**     | Revogacao_procuracao | `link_row`      | Table ID: 777; Multiple                 | -                                                                  |

## Mapeamento de Enums (Select Options)

Estes são os IDs de opção para os campos de `single_select`. Úteis para componentes de dropdown ou filtros:

**Digitalização (Field ID: 7200):**

- `3054`: Ausente (Default)
    
- `3055`: Concluída
    
- `3056`: NA
    

**DOI (Field ID: 7201):**

- `3057`: Salva
    
- `3058`: Ausente (Default)
    
- `3059`: NA
    

**ODIN (Field ID: 7202):**

- `3060`: Finalizado
    
- `3061`: Pendente (Default)

## Notas para Implementação Frontend

- **Identificador Visual**: O campo primário (`7216`) é gerado automaticamente a partir dos campos **Livro** (`7189`) e **Página** (`7190`). No frontend, ele funciona apenas como label de referência e não deve ser editável.
    
- **Formatos de Data**: O campo `7226` segue o padrão europeu (DD/MM/YYYY) para exibição, mas verifique se o payload para a API exige o formato ISO (YYYY-MM-DD).
    
- **Defaults**: Ao abrir um novo formulário de "Controle", os campos de seleção já possuem valores padrão definidos (conforme IDs listados acima).

# Table 'Controle Certidão' (ID: 776)

| **Field ID** | **Nome (Label)**    | **Tipo (API)**  | **Propriedades Técnicas / Constraints** | **Descrição (Tooltip/Placeholder)**             |
| ------------ | ------------------- | --------------- | --------------------------------------- | ----------------------------------------------- |
| **7413**     | ID                  | `number`        | **Primary Field**; `decimal_places: 0`  | Identificador numérico da certidão              |
| **7414**     | Data Emissão        | `date`          | `date_format: EU` (DD/MM/YYYY)          | Data de emissão da certidão notarial            |
| **7415**     | Protocolo           | `link_row`      | `table_id: 755`; Relacionamento único   | Vínculo com o número gerado pela Siplan         |
| **7417**     | Subtipo             | `single_select` | Ver opções de ID abaixo                 | Categoria do documento/ato                      |
| **7418**     | Entregue em         | `date`          | `date_format: EU` (DD/MM/YYYY)          | Data da entrega efetiva                         |
| **7419**     | Requerente_Certidao | `link_row`      | `table_id: 754`; Relacionamento único   | Pessoa interessada constante no protocolo       |
| **7421**     | Requerido_Certidao  | `link_row`      | `table_id: 754`; Multiple relationships | Pessoas que constam no ato notarial             |
| **7423**     | Observação          | `long_text`     | `enable_rich_text: true`                | Campo para observações gerais                   |
| **7424**     | Link_Controle       | `link_row`      | `table_id: 745`; Multiple relationships | Vínculo com a tabela de Controle (Livro/Página) |
| **7426**     | Forma de entrega    | `single_select` | Ver opções de ID abaixo                 | Canal pelo qual a certidão foi entregue         |
## Mapeamento de Enums (Select Options)

Utilize estes IDs para gerenciar o estado dos componentes de seleção:

**Subtipo (Field ID: 7417):**

- `3110`: Ato notarial
    
- `3111`: Termo de comparecimento
    
- `3116`: Documento do acervo
    

**Forma de entrega (Field ID: 7426):**

- `3112`: e-mail
    
- `3113`: eNotariado
    
- `3114`: Presencial
    
- `3115`: Correio
    

---

## Notas para Implementação Frontend

- **Validação de ID**: O campo primário `7413` é do tipo `number` e deve ser tratado como um inteiro (`number_decimal_places: 0`).
    
- **Datas**: Assim como nas tabelas anteriores, os campos `7414` e `7418` utilizam o formato europeu para exibição (`EU`).
    
- **Relacionamentos Distintos**:
    
    - **Requerente** (`7419`) permite apenas um vínculo por certidão.
        
    - **Requerido** (`7421`) permite múltiplos vínculos, pois um ato notarial pode envolver várias partes.
        
- **Rastreabilidade**: O campo `7424` (`Link_Controle`) é a chave para conectar a certidão aos dados físicos de arquivamento (Livro e Página) da tabela de Controle.
    
- **Rich Text**: O campo `7423` (`Observação`) suporta formatação rica, ideal para destacar informações críticas sobre a emissão.

# Table 'Escrevente' (ID: 747)

| **Field ID** | **Nome (Label)**     | **Tipo (API)** | **Propriedades Técnicas / Constraints**       | **Descrição (Tooltip/Placeholder)** |
| ------------ | -------------------- | -------------- | --------------------------------------------- | ----------------------------------- |
| **7195**     | Nome                 | `text`         | **Primary Key**                               | Nome do Escrevente                  |
| **7196**     | Notes                | `long_text`    | `enable_rich_text: false`                     | -                                   |
| **7197**     | Active               | `boolean`      | `default: false`                              | -                                   |
| **7199**     | Livros de Notas      | `link_row`     | Table ID: 745; `multiple_relationships: true` | -                                   |
| **7236**     | Retificações         | `link_row`     | Table ID: 753; `multiple_relationships: true` | -                                   |
| **7332**     | 📍Retificações 2     | `link_row`     | Table ID: 762; `multiple_relationships: true` | -                                   |
| **7443**     | Revogacao_procuracao | `link_row`     | Table ID: 777; `multiple_relationships: true` | -                                   |

## Notas para Implementação Frontend

- **Identificação**: O campo **Nome** (`7195`) é o identificador primário desta tabela e será o valor exibido em componentes de busca ou labels de relacionamento em outras tabelas.
    
- **Status de Atividade**: O campo **Active** (`7197`) deve ser mapeado preferencialmente para um componente de `Switch` ou `Checkbox`. Note que o padrão inicial é `false` (desativado).
    
- **Editor de Texto**: Diferente das tabelas anteriores, o campo **Notes** (`7196`) **não** possui suporte para Rich Text (`enable_rich_text: false`), portanto, um componente `textarea` padrão é o suficiente.
    
- **Múltiplas Conexões**: Todos os campos de relacionamento (`link_row`) desta tabela permitem múltiplas associações (`multiple_relationships: true`), o que exige componentes de seleção múltipla (ex: `Multi-Select` ou `Tags`) no frontend.

# Table 'Protocolo' (ID: 755)

| **Field ID** | **Nome (Label)**           | **Tipo (API)**           | **Propriedades Técnicas / Constraints**        | **Descrição (Tooltip/Placeholder)**                                                 |
| ------------ | -------------------------- | ------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| **7240**     | Protocolo                  | `text`                   | **Primary Key**; `unique_with_empty`           | Inserir o número gerado pela Siplan                                                 |
| **7241**     | Interessado                | `link_row`               | Table ID: 754; `multiple_relationships: true`  | -                                                                                   |
| **7242**     | Serviço                    | `link_row`               | Table ID: 746; `multiple_relationships: false` | -                                                                                   |
| **7248**     | Criado por                 | `created_by`             | `read_only: true`                              | Escrevente que inseriu o protocolo                                                  |
| **7249**     | Responsável                | `multiple_collaborators` | -                                              | Escrevente responsável pelo protocolo                                               |
| **7250**     | Data entrada               | `date`                   | `date_format: EU` (DD/MM/YYYY)                 | Data de entrada do protocolo                                                        |
| **7251**     | Detalhamentos              | `long_text`              | `enable_rich_text: true`                       | Descreva o andamento do protocolo. Insira as informações e não delete as anteriores |
| **7252**     | Status                     | `single_select`          | Default ID: 3064                               | -                                                                                   |
| **7253**     | Dias em aberto             | `formula`                | `formula_type: number`; date_diff              | -                                                                                   |
| **7254**     | Advogado                   | `link_row`               | Table ID: 754; `multiple_relationships: false` | -                                                                                   |
| **7268**     | Agendado para              | `date`                   | `include_time: true`; TZ: America/Sao_Paulo    | Data para acompanhamento ou assinatura                                              |
| **7340**     | Depósito prévio            | `number`                 | `decimal_places: 2`; `number_negative: false`  | -                                                                                   |
| **7346**     | Andamento                  | `long_text`              | `enable_rich_text: true`                       | Descrições posteriores à criação do protocolo                                       |
| **7378**     | 📍Controle                 | `link_row`               | Table ID: 745; `multiple_relationships: true`  | -                                                                                   |
| **7396**     | Justificativa_cancelamento | `long_text`              | `enable_rich_text: false`                      | Apenas preencher quando o status for "Cancelado"                                    |
| **7397**     | Log                        | `long_text`              | `enable_rich_text: false`                      | -                                                                                   |
| **7398**     | Criado por (Sistema)       | `text`                   | -                                              | -                                                                                   |
| **7408**     | 📍Retificações             | `link_row`               | Table ID: 753; `multiple_relationships: true`  | -                                                                                   |
| **7410**     | 📍Substabelecimentos       | `link_row`               | Table ID: 762; `multiple_relationships: true`  | -                                                                                   |
| **7416**     | Controle_Certidao          | `link_row`               | Table ID: 776; `multiple_relationships: true`  | -                                                                                   |
| **7433**     | Corretor                   | `link_row`               | Table ID: 754; `multiple_relationships: true`  | Vincular a um ou mais corretores interessados no protocolo                          |
| **7447**     | **Revogacao_procuracao**   | `link_row`               | Table ID: 777; `multiple_relationships: true`  | _(Novo)_ Vincula ao ato de revogação                                                |

## Mapeamento de Enums (Select Options)

**Status (Field ID: 7252):**

- `3064`: Em andamento (Default)
    
- `3065`: Finalizado
    
- `3066`: Cancelado
    

---
## Notas para Implementação Frontend

- **Chave Primária e Unicidade**: O campo **Protocolo** (`7240`) é a chave primária e possui restrição de unicidade. O frontend deve validar se o valor inserido já existe para evitar erros de submissão.
    
- **Complexidade de Datas**:
    
    - O campo **Data entrada** (`7250`) é apenas data.
        
    - O campo **Agendado para** (`7268`) exige um seletor de **Data e Hora** e deve respeitar o fuso horário `America/Sao_Paulo`.
        
- **Campos Calculados**: O campo **Dias em aberto** (`7253`) é gerado pelo banco de dados.
    
- **Lógica de Condicional**: O campo **Justificativa_cancelamento** (`7396`) deve, idealmente, tornar-se obrigatório ou visível apenas quando o **Status** (`7252`) for alterado para "Cancelado" (`ID: 3066`).
    
- **Rich Text**: Use editores formatados para os campos `7251` e `7346` para garantir que as quebras de linha e destaques sejam preservados.

# Table 'Imóveis' (ID: 773)

|**Field ID**|**Nome (Label)**|**Tipo (API)**|**Propriedades Técnicas / Constraints**|**Descrição (Tooltip/Placeholder)**|
|---|---|---|---|---|
|**7393**|ID|`number`|**Primary Field**; `decimal_places: 0`|Identificador único do registro|
|**7381**|CBI|`text`|`read_only: false`|-|
|**7382**|Controle|`link_row`|`table_id: 745`; Multiple relationships|Vínculo com atos notariais (Livro/Página)|
|**7385**|Endereço do Imóvel|`text`|`read_only: false`|Localização física do imóvel|
|**7386**|Matrícula|`text`|`read_only: false`|Número da matrícula no registro de imóveis|
|**7387**|CRI|`text`|`read_only: false`|Cartório de Registro de Imóveis competente|
|**7388**|Valor do negócio|`number`|`decimal_places: 2`; Não negativo|Valor declarado da transação|
|**7389**|Venal|`number`|`decimal_places: 2`; Não negativo|Valor venal atribuído pela prefeitura|
|**7390**|Fração|`number`|`decimal_places: 2`; Não negativo|Proporção da propriedade (ex: 0.50 para 50%)|
|**7391**|Município|`text`|`read_only: false`|Cidade onde o imóvel está localizado|
|**7392**|Estado|`text`|`read_only: false`|Unidade Federativa (ex: SP)|

# Table 'Retificação' (ID: 753)

| **Field ID** | **Nome (Label)**     | **Tipo (API)**  | **Propriedades Técnicas / Constraints** | **Descrição (Tooltip/Placeholder)**                                              |
| ------------ | -------------------- | --------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| **7227**     | `_`                  | `formula`       | **Primary Field**; `read_only: true`    | `concat('L_', field('Livro Retificadora'), '_P_', field('Página Retificadora'))` |
| **7228**     | Livro Retificadora   | `text`          | `read_only: false`                      | Livro em que foi impressa a Retificação                                          |
| **7229**     | Página Retificadora  | `text`          | `read_only: false`                      | Página em que foi impressa a Retificação                                         |
| **7230**     | Observação           | `long_text`     | `enable_rich_text: true`                | Campo para observações gerais                                                    |
| **7231**     | Escritura Retificada | `link_row`      | `table_id: 745`; Multiple relationships | Busca pela escritura que sofreu a correção                                       |
| **7233**     | ODIN                 | `single_select` | Default: `3063` (Não finalizado)        | Status do arquivo no servidor e no ODIN                                          |
| **7234**     | Data                 | `date`          | `date_format: EU` (DD/MM/YYYY)          | Data da escritura de retificação                                                 |
| **7235**     | Escreventes          | `link_row`      | `table_id: 747`; Relacionamento único   | Escrevente que lavrou a retificação                                              |
| **7321**     | Anotado?             | `single_select` | Default: `3082` (Anotação Pendente)     | Indica se a retificação já foi anotada                                           |
| **7407**     | Protocolos           | `link_row`      | `table_id: 755`; Relacionamento único   | Vínculo com o protocolo Siplan                                                   |
## Mapeamento de Enums (Select Options)

Estes IDs devem ser usados para popular os campos de seleção e gerenciar os estados de conclusão:

**ODIN (Field ID: 7233):**

- `3062`: Finalizado
    
- `3063`: Não finalizado (Default)
    

**Anotado? (Field ID: 7321):**

- `3081`: Anotado
    
- `3082`: Anotação Pendente (Default)
    

---
## Notas para Implementação Frontend

- **Chave Visual**: Assim como na tabela de Controle, o identificador primário (`7227`) é uma fórmula baseada no **Livro** e **Página** da retificação. Ele não deve ser editável na interface.
    
- **Rich Text**: O campo **Observação** (`7230`) exige um editor de texto formatado.
    
- **Integridade de Dados**: Ao criar uma retificação, o frontend deve facilitar a busca da **Escritura Retificada** (`7231`), que aponta para a tabela principal de Controle (ID 745).
    
- **Data**: O campo **Data** (`7234`) segue o padrão europeu (DD/MM/YYYY) configurado nas outras tabelas do sistema.

# Table 'Substabelecimento' (ID: 762)

|**Field ID**|**Nome (Label)**|**Tipo (API)**|**Propriedades Técnicas / Constraints**|**Descrição (Tooltip/Placeholder)**|
|---|---|---|---|---|
|**7330**|`_`|`formula`|**Primary Field**; `read_only: true`|`concat('L_', field('Livro Substabelecimento'), '_P_', field('Página Substabelecimento'))`|
|**7322**|Livro Substabelecimento|`text`|`read_only: false`|Livro em que foi impresso o substabelecimento|
|**7323**|Página Substabelecimento|`text`|`read_only: false`|Página em que foi impresso o substabelecimento|
|**7324**|Observação|`long_text`|`enable_rich_text: true`|Espaço para observações detalhadas|
|**7325**|Procuração Substabelecida|`link_row`|`table_id: 745`; Relacionamento múltiplo|Vínculo com a escritura original (Procuração)|
|**7326**|ODIN|`single_select`|Default: `3084` (Não finalizado)|Status do arquivo no servidor e no sistema ODIN|
|**7327**|Data|`date`|`date_format: EU` (DD/MM/YYYY)|Data da escritura de substabelecimento|
|**7328**|Escreventes|`link_row`|`table_id: 747`; Relacionamento único|Escrevente que lavrou o ato|
|**7329**|Anotado?|`single_select`|Default: `3086` (Anotação Pendente)|Indica se o ato já foi anotado na procuração|
|**7409**|Protocolos|`link_row`|`table_id: 755`; Relacionamento único|Vínculo com o protocolo da Siplan|
|**7411**|Clientes|`link_row`|`table_id: 754`; Relacionamento múltiplo|Clientes (partes) vinculados ao substabelecimento|

## Mapeamento de Enums (Select Options)

Estes IDs são essenciais para popular componentes de interface e gerenciar o fluxo de trabalho:

**ODIN (Field ID: 7326):**

- `3083`: Finalizado
    
- `3084`: Não finalizado (Default)
    

**Anotado? (Field ID: 7329):**

- `3085`: Anotado
    
- `3086`: Anotação Pendente (Default)
    

---
## Notas para Implementação Frontend

- **Identificador de Registro**: Assim como nas tabelas de "Controle" e "Retificação", o campo primário (`7330`) é gerado automaticamente via fórmula concatenando Livro e Página. Não deve ser editado pelo usuário final.
    
- **Editor de Texto Rico**: O campo **Observação** (`7324`) suporta formatação rica (`enable_rich_text: true`).
    
- **Validação de Data**: O seletor de data (`7327`) deve respeitar o formato europeu (`EU`) utilizado em todo o sistema.
    
- **Gestão de Relacionamentos**:
    
    - **Procuração Substabelecida** (`7325`) e **Clientes** (`7411`) permitem múltiplas seleções.
        
    - **Escreventes** (`7328`) e **Protocolos** (`7409`) permitem apenas um vínculo por registro.


# Table 'Tipagem Notas' (ID: 746)

| **Field ID** | **Nome (Label)** | **Tipo (API)** | **Propriedades Técnicas / Constraints** | **Descrição (Tooltip/Placeholder)**                                             |
| ------------ | ---------------- | -------------- | --------------------------------------- | ------------------------------------------------------------------------------- |
| **7191**     | Tipo             | `text`         | **Primary Field**; `read_only: false`   | Coloque os tipos de escrituras existentes                                       |
| **7192**     | Notes            | `long_text`    | `enable_rich_text: false`               | -                                                                               |
| **7217**     | Livros de Notas  | `link_row`     | `table_id: 745`; Multiple relationships | -                                                                               |
| **7427**     | Sujeito_COAF     | `boolean`      | `boolean_default: false`                | Indica se o tipo de escritura deve ser objeto de análise de lavagem de dinheiro |

# Table 'COAF' (ID: 756)

| **Field ID** | **Nome (Label)**      | **Tipo (API)**  | **Propriedades Técnicas / Constraints**       | **Descrição (Tooltip/Placeholder)**              |
| ------------ | --------------------- | --------------- | --------------------------------------------- | ------------------------------------------------ |
| **7259**     | `_`                   | `lookup`        | **Primary Field**; `read_only: true`          | Indexador automático via tabela Controle         |
| **7258**     | Objeto análise        | `link_row`      | `table_id: 745`; Multiple relationships       | Escritura da tabela "Controle" objeto da análise |
| **7261**     | Data                  | `lookup`        | `read_only: true`; `array_formula_type: date` | Data da escritura (automático)                   |
| **7262**     | Tipo de Escritura     | `lookup`        | `read_only: true`; `array_formula_type: text` | Tipo de escritura (automático)                   |
| **7264**     | Análise               | `single_select` | Opções de 3068 a 3072                         | Parecer sobre lavagem de dinheiro                |
| **7265**     | Detalhamento          | `long_text`     | `enable_rich_text: true`                      | Texto detalhado da análise                       |
| **7266**     | Número da comunicação | `text`          | `read_only: false`                            | ID da comunicação ao SISCOAF                     |
| **7267**     | Data comunicação      | `date`          | `date_format: EU` (DD/MM/YYYY)                | Data da comunicação realizada                    |
| **7333**     | Aux_Filtro            | `lookup`        | `read_only: true`; `array_formula_type: text` | Auxiliar de busca pelo Livro (automático)        |
| **7428**     | **Recibo_PDF**        | `file`          | `read_only: false`                            | Upload do recibo em PDF da comunicação           |
## Mapeamento de Enums (Select Options)

Estes IDs são vitais para a lógica de conformidade (Compliance) no seu frontend:

**Análise (Field ID: 7264):**

- `3068`: Negócio ordinário: ausência de indícios de lavagem de dinheiro
    
- `3069`: Loteamento: Transmissão ordinária de lote...
    
- `3070`: Procuração ordinária: Sem hipoteses de suspeita
    
- `3071`: Comunicação objetiva (art. 171, CNN-CNJ)
    
- `3072`: Ato suspeito: Comunicação subjetiva


## Notas para Implementação Frontend

- **Upload de Arquivos**: O campo **Recibo_PDF** (`7428`) é do tipo `file`. O frontend deve implementar um componente de upload (drag-and-drop ou seletor) para gerenciar o envio desses documentos quando houver comunicação ao SISCOAF.
    
- **Lookups Automáticos**: Os campos `7259`, `7261`, `7262` e `7333` são alimentados automaticamente através do relacionamento em **Objeto análise** (`7258`). Não é necessária a entrada manual do usuário para esses dados.
    
- **Rich Text**: O campo **Detalhamento** (`7265`) suporta Rich Text, permitindo formatações para destacar pontos sensíveis na análise de compliance.
    
- **Visibilidade Condicional**: Recomenda-se que os campos **Número da comunicação** (`7266`), **Data comunicação** (`7267`) e **Recibo_PDF** (`7428`) fiquem em evidência ou tornem-se obrigatórios apenas quando a **Análise** (`7264`) for um dos tipos de comunicação (`3071` ou `3072`).
# Table Revogacao_procuracao (ID:777)

|**Field ID**|**Nome (Label)**|**Tipo (API)**|**Propriedades Técnicas / Constraints**|**Descrição (Tooltip/Placeholder)**|
|---|---|---|---|---|
|**7438**|_|`formula`|**Primary Key**; `formula_type: text`|Gerado via: `concat('L_', field('Livro_procuracao'), '_P_', field('Pagina_procuracao'))`|
|**7435**|Link_procuracao_revogada|`link_row`|Table ID: 745; `multiple_relationships: true`|Relação com a procuração revogada|
|**7436**|Livro_procuracao|`text`|-|O livro em que a revogação da procuração foi lavrada|
|**7437**|Pagina_procuracao|`text`|-|A página em que a revogação da procuração foi impressa|
|**7440**|Observacao|`long_text`|`enable_rich_text: true`|-|
|**7441**|Data|`date`|`date_format: EU` (DD/MM/YYYY)|Data da escritura de revogação|
|**7442**|Escrevente_revogacao|`link_row`|Table ID: 747; `multiple_relationships: true`|Escrevente que fez a escritura de revogacao da procuração|
|**7444**|ODIN|`single_select`|Default ID: 3118|Indica se os arquivos estão no GED ODIN|
|**7445**|Anotado|`single_select`|Default ID: 3120|Indica se a revogação foi anotada na procuração original|
|**7446**|Protocolo|`link_row`|Table ID: 755; `multiple_relationships: false`|O protocolo que originou a escritura de revogação da procuração|
|**7448**|Clientes_revogacao_procuracao|`link_row`|Table ID: 754; `multiple_relationships: true`|Os clientes que participaram da escritura de revogação da procuração|

## Mapeamento de Enums (Select Options)

### **ODIN (Field ID: 7444)**

Indica o status da digitalização no Gerenciamento Eletrônico de Documentos.

|**Option ID**|**Valor (Label)**|**Cor (Hex/Alias)**|
|---|---|---|
|**3117**|Finalizado|`dark-purple`|
|**3118**|**Não finalizado**|`green` (Padrão)|

### **Anotado (Field ID: 7445)**

Controle de averbação/anotação marginal no documento original.

|**Option ID**|**Valor (Label)**|**Cor (Hex/Alias)**|
|---|---|---|
|**3119**|Anotado|`yellow`|
|**3120**|**Anotação pendente**|`dark-blue` (Padrão)|

---

## Observações de Implementação

- **Chave Primária Dinâmica:** Diferente da tabela de Protocolo, aqui a PK (ID 7438) é uma fórmula que concatena Livro e Página. Isso evita a necessidade de preenchimento manual de um identificador único, garantindo o padrão `L_XXX_P_XXX`.
    
- **Vínculo de Protocolo:** Note que o campo **Protocolo (ID: 7446)** aponta para a tabela **755** (a que mapeamos anteriormente), estabelecendo a rastreabilidade entre o balcão e o ato lavrado.