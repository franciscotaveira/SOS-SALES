# SOS Sales — Direcionamento pontual de realocação de funções

> Data: 25 ago 2026
> Escopo: arquitetura de informação sobre a UI existente
> Regra: reutilizar componentes; não redesenhar telas, não criar outro shell e não alterar lógica comercial.

## 1. Objetivo

Reduzir carga cognitiva removendo acessos duplicados e colocando configuração, operação e análise em seus contextos corretos.

Não faz parte deste trabalho:

- trocar o design system;
- reconstruir o cockpit;
- criar novas páginas;
- alterar integrações ou regras de negócio;
- validar mobile antes de PC e notebook.

## 2. Mudanças aprovadas

| Função atual | Destino | Ação |
|---|---|---|
| Agora | Operação | Manter sem realocação. |
| Conversas & Funil | Operação | Manter Lista, Funil Kanban, Anotações e Torre TV como modos existentes. |
| Anotações no menu principal | Conversas & Funil > Anotações | Remover somente o acesso duplicado da sidebar. |
| Kanban na busca global | Conversas & Funil > Funil Kanban | Manter pesquisável, mas abrir o modo interno existente. |
| Grupos | Operação | Manter como módulo próprio; não integrar nesta fase. |
| Agenda | Operação | Manter sem realocação. |
| Gestão de Clientes | Gestão | Manter, mas ocultar para operador comum. |
| Gestão de Campanhas | Gestão | Manter Analytics, CTWA, Broadcast, Links e Modelos WABA. |
| Traqueamento & Pixels | Configurações > Integrações | Remover de Resultados e reutilizar `TrackingSettings`. |
| Matriz LTV & Retenção | Configurações > Regras Comerciais | Remover de Resultados e reutilizar `LtvConfigManager`. |
| Dados da Empresa & WhatsApp | Configurações > Dados da Empresa | Retirar da navegação de Inteligência; reutilizar a seção existente. |
| Inteligência | Inteligência | Manter personalidade, diagnóstico, catálogo, conhecimento, aprendizado e agentes. |
| Modelos & Infra | Configurações | Manter nesta fase; apenas posicionar ao lado de Canais. |
| Controle do Receptionist | Dossiê | Manter onde já está no checkout e validar sua renderização no Lab. |
| Limpar histórico e outras ações destrutivas | Configurações > Canais > Avançado | Retirar do cabeçalho principal e preservar a função com confirmação reforçada. |

## 3. Sidebar resultante

### Operador

1. Agora
2. Conversas & Funil
3. Grupos, quando a flag estiver habilitada
4. Agenda

### Admin / gestor

Além da operação:

5. Gestão de Clientes
6. Gestão de Campanhas
7. Inteligência

### Owner

Além das áreas anteriores:

8. Configurações

O papel exibido deve corresponder à autorização efetiva. Modo suporte deve ser apresentado separadamente e nunca confundido com o papel do workspace.

## 4. Alterações por arquivo

### `src/components/layout/AppShell.tsx`

- Remover `anotacoes` de `navSections`.
- Manter `anotacoes` na busca global, mas direcionar para `conversas` com submodo `notes`.
- Direcionar o item `kanban` da busca para `conversas` com submodo `kanban`.
- Aplicar de fato `roleRequired`; atualmente a propriedade existe, mas o filtro considera apenas `visible`.
- Definir `clientes`, `resultados` e `playbook` como `admin`; `configuracoes` como `owner`.
- Manter Grupos em Operação e respeitar `agency_groups`.
- Remover `tracking` do submenu de Resultados.
- Acrescentar em Configurações os destinos realocados, sem criar novos módulos visuais.

### `src/components/conversations/LiveConversationsView.tsx`

- Preservar os quatro modos existentes: `list`, `kanban`, `notes` e `wallboard`.
- Aceitar navegação direta para `notes` e `kanban` vinda do AppShell/busca.
- Não alterar os componentes internos nesta fase.

### `src/components/results/ResultsHubView.tsx`

- Remover `tracking` e `ltv_matrix` de `SUB_TABS`.
- Remover apenas os renders correspondentes desta superfície.
- Preservar `TrackingSettings` e `LtvConfigManager` como componentes reutilizáveis até sua montagem em Configurações.

### `src/components/settings/SettingsShell.tsx`

- Reordenar as abas existentes para: Canais, Modelos & Infra, Equipe, API & Webhooks, Parâmetros.
- Adicionar `tracking` com o componente existente `TrackingSettings`.
- Adicionar `commercial_rules` com o componente existente `LtvConfigManager`.
- Adicionar `company` reutilizando a seção atual de Dados da Empresa.
- Evitar uma faixa com sete abas simultâneas: usar dois agrupamentos textuais dentro do mesmo shell — Conta e Integrações — sem criar nova página.

### `src/components/intelligence/ClientAgentHubView.tsx`

- Remover `company` do seletor principal após a montagem equivalente em Configurações.
- Preservar os demais componentes e conteúdos.
- Não unificar bases de conhecimento nesta fase; isso depende de correção de persistência, não de UI.

### `src/components/cockpit/LiveDossier.tsx`

- Não realocar o controle do bot: ele já está implementado no local correto.
- Validar os três estados existentes: desabilitado, humano no controle e bot ativo.
- Substituir emojis de estado por ícone + texto semântico durante o refinamento visual, sem mudar o fluxo.

### `src/components/channels/CanaisView.tsx`

- Mover visualmente ações destrutivas para uma seção recolhida `Avançado`.
- Manter status, diagnóstico e sincronização no primeiro nível.
- Não executar nem modificar endpoints durante esta fase de UI.

## 5. Ordem de aplicação

1. `AppShell`: remover duplicidade e aplicar visibilidade por papel.
2. Busca global: redirecionar Anotações e Kanban para modos de Conversas.
3. `ResultsHubView`: retirar Tracking e LTV.
4. `SettingsShell`: montar os componentes realocados.
5. Inteligência: retirar Dados da Empresa após o novo destino existir.
6. Canais: recolher ações destrutivas em Avançado.
7. Validar o dossiê já alterado no checkout, sem redesenhá-lo.

Cada passo deve ser independente e reversível. Não remover o destino antigo antes de o novo destino renderizar corretamente.

## 6. Critérios de aceite

- Nenhum componente de negócio novo.
- Nenhuma função perdida ou sem caminho de acesso.
- Operador não vê Gestão de Clientes, Inteligência administrativa ou Configurações.
- Busca global abre o destino realocado correto.
- Resultados contém leitura e execução de campanha, não credenciais ou regras estruturais.
- Configurações contém integrações, dados cadastrais e regras comerciais.
- Nenhuma alteração em endpoints, payloads, persistência ou envio externo.
- PC `1920 × 1080`: sem overflow e sem controles cortados.
- Notebook `1366 × 768`: ação primária e navegação totalmente visíveis.
- Notebook compacto `1280 × 720`: conteúdo interno pode rolar, mas cabeçalho e ações essenciais permanecem acessíveis.
- Mobile somente após aprovação dos três gates anteriores.

## 7. Gate de segurança

Implementar e validar primeiro no Docker Lab. Não fazer deploy no VPS durante esta fase sem build, evidência visual comparativa e autorização explícita.
