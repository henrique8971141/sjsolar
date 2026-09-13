# SJSolar

Sistema interno para gestão de projetos e processos relacionados a instalações de energia solar.

O SJSolar foi criado inicialmente para facilitar e centralizar atividades que hoje são realizadas em diferentes ferramentas, principalmente **projetos, orçamentos, propostas e documentos**.

O foco do sistema é ser simples, rápido e prático para o uso interno.

> Atualmente, o SJSolar é um sistema de uso interno. A possibilidade de disponibilização externa poderá ser avaliada futuramente.

---

## 🎯 Objetivo

Centralizar em um único sistema as principais informações de cada projeto de energia solar.

A estrutura principal do sistema é:

**PROJETOS**
→ **ORÇAMENTOS / PROPOSTAS**  
→ **DOCUMENTOS**  
→ **INFORMAÇÕES DO CLIENTE**

A ideia é que cada projeto funcione como um espaço próprio, reunindo tudo relacionado àquele cliente e àquela instalação.

---

## 🧩 Estrutura atual

### Projetos

A tela principal apresenta os projetos em formato de **cards**.

Cada card representa um projeto e é totalmente clicável.

Ao clicar no card, o usuário entra no projeto.

O card não possui botões de editar ou excluir.

Essas ações ficam dentro das informações do projeto/cliente.

---

### Área interna do projeto

Cada projeto possui três áreas principais:

#### 1. Orçamentos

Área destinada a:

- Orçamentos
- Propostas
- Valores
- Status
- Criação e edição de propostas

A criação e os cálculos serão desenvolvidos nas etapas seguintes.

#### 2. Documentos

Área destinada aos documentos relacionados ao projeto.

Quando não houver documentos, será exibido:

**NENHUM DOCUMENTO CRIADO**

**CLIQUE AQUI PARA CRIAR**

A criação dos documentos será implementada posteriormente.

#### 3. Informações do Cliente

Área destinada às informações gerais do cliente e do projeto.

Inclui:

- Resumo
- Dados gerais
- Telefone
- E-mail
- Endereço
- CEP
- Cidade
- UF
- Localização
- Demais informações cadastrais

Também será o local para gerenciamento do cliente e do projeto.

---

# 👤 Clientes

O cadastro de clientes é compartilhado por todo o sistema.

O cliente não deve ser cadastrado novamente em cada projeto.

As telas que precisarem selecionar um cliente utilizarão o mesmo cadastro.

## Busca de clientes

O campo de cliente utiliza busca por texto/autocomplete.

Ao começar a digitar, o sistema apresenta uma lista suspensa com os clientes encontrados.

Caso nenhum cliente seja encontrado, será apresentada a opção:

**+ CRIAR NOVO CLIENTE**

O novo cliente pode ser cadastrado sem abandonar o formulário atual.

Após o cadastro, o cliente é selecionado automaticamente.

---

## 📍 Endereço

O cadastro utiliza integração com serviços de consulta de CEP e municípios.

### CEP

Utilização prevista:

**ViaCEP**

Ao informar um CEP válido, o sistema pode preencher automaticamente:

- Logradouro
- Bairro
- Cidade
- UF

Os dados retornados podem ser corrigidos manualmente.

### Cidades

Utilização da:

**API do IBGE**

A cidade será pesquisada de acordo com a UF selecionada.

Exemplo:

UF: MG

Cidade: `São R`

O sistema apresenta municípios correspondentes em uma lista suspensa.

---

# ☀️ Projetos de energia solar

O projeto será posteriormente responsável por reunir os dados técnicos da instalação.

Entre os dados previstos:

- Localização
- Distribuidora
- Tipo de telhado
- Unidades consumidoras
- Consumo
- Módulos
- Inversores
- Microinversores
- Topologia
- Potência instalada
- Geração estimada
- Área necessária

Esses recursos serão implementados gradualmente.

---

# ⚡ Equipamentos

O sistema terá uma base de equipamentos para facilitar a criação dos projetos e orçamentos.

Categorias previstas:

- Módulos
- Inversores
- Microinversores
- Outros equipamentos

A ideia é utilizar uma base ampla de equipamentos, permitindo pesquisa e seleção em vez de digitação manual.

Existe a intenção de importar e organizar uma base de equipamentos proveniente de uma exportação existente.

---

## Regra dos inversores

Uma regra importante do sistema:

> **O Inversor 01 é sempre o inversor principal/gerador do sistema.**

Outros inversores podem ser adicionados livremente como inversores adicionais.

Exemplo:

- Inversor 01 → principal
- Inversor 02 → adicional
- Inversor 03 → adicional

Não deve existir uma limitação artificial de quantidade.

---

# 💰 Orçamentos e propostas

O módulo de orçamento será responsável pelos cálculos comerciais do projeto.

O fluxo planejado é:

**Localização**
→ **Unidades consumidoras**
→ **Kit gerador**
→ **Custos**
→ **Margem**
→ **Preço final**
→ **Proposta**

Entre os dados previstos:

- Consumo
- Tarifas
- Módulos
- Inversores
- Potência
- Geração
- Equipamentos
- Homologação
- Mão de obra
- Custos
- Impostos
- Margem
- Lucro
- Preço final

---

# 📄 Propostas e documentos

Propostas e documentos utilizarão uma estrutura baseada em **templates**.

O sistema não deve transformar cada documento em uma página completamente fixa.

A ideia é utilizar campos variáveis.

Exemplo:

```text
[cliente_nome]
[empresa_nome]
[potencia_sistema]
[geracao_mensal]
[preco]
```

Durante a geração do documento, os campos serão substituídos pelos dados reais.

Exemplo:

```text
[cliente_nome]
```

vira:

```text
Henrique
```

Isso permitirá utilizar o mesmo modelo para vários projetos.

---

# 🗂️ Arquitetura

O projeto utiliza uma estrutura modular.

Principais arquivos atualmente:

```text
catalogo.js
clientes.js
dashboard.js
equipamentos.js
exportDocx.js
exportPdf.js
index.html
main.js
orcamentos-list.js
orcamentos.js
pagamentos.js
projetos.js
state.js
supabase.js
ui.js
utils.js
```

A intenção é manter os módulos separados e evitar que toda a aplicação volte a ficar concentrada em um único `index.html`.

---

# 🛠️ Tecnologias

Atualmente o projeto utiliza:

- HTML
- CSS
- JavaScript
- Supabase
- APIs externas quando necessárias
- Geração de PDF
- Geração de DOCX

A preferência é manter a aplicação simples, utilizando **JavaScript vanilla** sempre que possível.

Não há intenção de adicionar frameworks ou ferramentas complexas sem necessidade.

---

# 🗄️ Backend

O backend utiliza **Supabase**.

O banco deve concentrar os dados necessários para:

- Clientes
- Projetos
- Equipamentos
- Orçamentos
- Propostas
- Documentos

A estrutura deve evitar duplicação de informações.

Por exemplo, um cliente deve possuir um cadastro centralizado e ser referenciado pelos projetos.

---

# 📌 Regras de desenvolvimento

Ao continuar o desenvolvimento do SJSolar:

- Não transformar o sistema em um ERP gigante.
- Não criar funcionalidades sem necessidade.
- Não duplicar tabelas ou cadastros.
- Não duplicar clientes.
- Não criar Router sem necessidade.
- Manter a arquitetura modular.
- Preferir HTML/CSS/JS vanilla.
- Reutilizar componentes e funções existentes.
- Conferir `import` e `export` ao alterar módulos.
- Não quebrar funcionalidades já existentes.
- Fazer alterações pequenas e testáveis.
- Implementar uma etapa por vez.

---

# 🚧 Desenvolvimento por etapas

O desenvolvimento será realizado gradualmente.

### Etapa 1 — Cadastro básico

Concluída.

Incluiu:

- Cadastro de projetos
- Listagem
- Cards
- Cliente
- Responsável
- Status
- Observações
- Cadastro/seleção de clientes
- Autocomplete de clientes
- Criação rápida de cliente
- Consulta de CEP
- Consulta de cidades pelo IBGE

### Etapa 2 — Área interna do projeto

Em desenvolvimento.

Estrutura:

```text
PROJETO
│
├── ORÇAMENTOS
│   └── Orçamentos + Propostas
│
├── DOCUMENTOS
│   └── Documentos do projeto
│
└── INFORMAÇÕES DO CLIENTE
    ├── Resumo
    ├── Dados gerais
    └── Localização
```

As telas e ações necessárias para a próxima etapa serão preparadas.

### Etapa 3 — Orçamentos e propostas

Próxima etapa.

Será desenvolvido o fluxo completo de criação de orçamento e proposta.

### Etapa 4 — Sistema fotovoltaico

Dados técnicos:

- UCs
- Consumo
- Módulos
- Inversores
- Topologia
- Potência
- Geração

### Etapa 5 — Documentos

Implementação do sistema de templates e geração dos documentos.

### Etapa 6 — Melhorias

Após o funcionamento do núcleo do sistema:

- melhorias visuais;
- otimizações;
- filtros;
- pesquisas;
- relatórios;
- outras necessidades identificadas durante o uso.

---

# 🔄 Fluxo principal

O fluxo esperado do SJSolar é:

```text
CLIENTE
   ↓
PROJETO
   ↓
┌───────────────────────┐
│                       │
├── ORÇAMENTOS           │
│      ↓                │
│   PROPOSTAS            │
│                       │
├── DOCUMENTOS           │
│                       │
└── INFORMAÇÕES CLIENTE │
```

O projeto é o ponto central.

Tudo que estiver relacionado àquele trabalho deve ficar vinculado ao projeto correto.

---

# 📍 Estado atual

O sistema está em desenvolvimento ativo.

A prioridade é construir primeiro uma estrutura funcional e estável e, depois, adicionar recursos gradualmente.

O objetivo não é criar um sistema enorme, mas uma ferramenta interna que realmente facilite o trabalho diário.

---

## 📝 Observação

O SJSolar é atualmente um projeto de uso interno.

Caso o sistema evolua para um nível adequado de estabilidade, segurança e generalização, poderá ser estudada no futuro a possibilidade de disponibilização para outras empresas.