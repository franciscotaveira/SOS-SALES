# Especificação Detalhada — Módulo 2: Funil Comercial Kanban & Central de Conversas (`/kanban` & `/conversas`)
> **SOS Sales v2.0 | MCT OS**  
> **Arquivos de Referência:** `src/components/kanban/LiveCommercialKanbanView.tsx`, `CommercialKanbanView.tsx`, `LiveConversationsView.tsx`, `ConversationsHubView.tsx`

---

## 1. Visão Geral do Módulo

O módulo **Funil Comercial Kanban & Central de Conversas** gerencia a visão macro das oportunidades comerciais da empresa. Ele combina acompanhamento financeiro em tempo real (KPI Ribbon), movimentação ágil de etapas por arrasto (drag and drop) e uma central unificada com alternância entre Lista 1:1, Kanban e Torre TV (Wallboard NOC).

---

## 2. Especificação das Funções — Funil Comercial Kanban (`/kanban`)

### F2.1 — Ribbon de KPIs Financeiros em Tempo Real
* **Localização:** Barra superior fixa acima das colunas do Kanban.
* **Componentes Exibidos:**
  1. **Pipeline Ativo (R$):** Soma do valor dos serviços/produtos de todas as oportunidades ativas nas colunas `LEAD`, `QUALIFICADO`, `PROPOSTA` e `NEGOCIACAO`.
  2. **Fechados / Ganho (R$):** Soma dos valores das oportunidades na coluna `GANHO`.
  3. **Taxa de Conversão (%):** Cálculo automático: $\left(\frac{\text{Oportunidades em GANHO}}{\text{Total de Oportunidades no Funil}}\right) \times 100$.
  4. **Ticket Médio por Lead (R$):** Cálculo: $\frac{\text{Pipeline Ativo}}{\text{Total de Leads Ativos}}$.
* **Atualização:** Recalculado instantaneamente a cada movimentação de card ou atualização via Supabase Realtime.

### F2.2 — Seletor Multi-Funil Adaptável por Nicho
* **Gatilho:** Clique nos botões de modelo de pipeline (ex: *Funil Geral*, *Escovaria & Tratamentos*, *Unhas & Alongamento*, *Noivas & VIP*).
* **Comportamento Esperado:**
  - Carrega os títulos e subtítulos específicos das colunas para aquele nicho de negócio.
  - Permite alterar a visão operacional sem modificar o estágio armazenado no banco (`LEAD`, `QUALIFICADO`, `PROPOSTA`, `NEGOCIACAO`, `GANHO`).

### F2.3 — Editor In-App de Etapas do Funil
* **Gatilho:** Clique no botão `⚙️ Personalizar Etapas`.
* **Fluxo:**
  - Exibe prompt/modal para que o operador insira os nomes desejados para as 5 colunas (separados por barra vertical `|`).
  - Salva a personalização no `localStorage` por workspace (`sos_sales_custom_kanban_:workspaceId`).

### F2.4 — Colunas do Kanban & Drag and Drop de Oportunidades
* **Colunas Padrão:**
  1. `1. Novos Leads` (Estágio `LEAD`)
  2. `2. Qualificados` (Estágio `QUALIFICADO`)
  3. `3. Proposta` (Estágio `PROPOSTA`)
  4. `4. Negociação` (Estágio `NEGOCIACAO`)
  5. `5. Fechados (Ganho)` (Estágio `GANHO`)
* **Ação Drag and Drop:**
  - Operador clica e arrasta um card de uma coluna para outra.
  - O evento `onDrop` chama `updateStageDirectly(journeyId, targetStage)`.
  - Executa `PATCH /api/v1/workspaces/:id/journeys/:jId/stage` com rollback visual se a requisição falhar.

### F2.5 — Card da Oportunidade Commercial
* **Informações Exibidas:**
  - Nome do Contato e Avatar.
  - Número de Telefone E.164.
  - Badge do Serviço/Procedimento Detectado (ex: `💇‍♀️ Escova Modelada`, `💅 Unhas em Gel`).
  - Preço ou valor estimado do serviço (ex: `R$ 180`).
  - Tempo decorrido desde a última mensagem.
  - Botões contextuais de navegação rápida: `⬅️ Estágio Anterior` e `Próximo Estágio ➡️`.
* **Clique no Card:** Abre a conversa diretamente no Cockpit de Atendimento (`/agora`).

---

## 3. Especificação das Funções — Central de Conversas & Torre NOC (`/conversas`)

### F3.1 — Alternador de Modo de Visualização
* **Gatilho:** Clique nos botões da barra superior: `Lista`, `Kanban`, `Torre TV (Wallboard NOC)`.
* **Comportamento Esperado:**
  - `Lista`: Renderiza a visualização em tabela/lista completa de conversas com atalhos de filtro.
  - `Kanban`: Renderiza o funil comercial integrado.
  - `Torre TV (NOC)`: Renderiza dashboard em modo escuro para exibição em televisores de salas de vendas, mostrando contadores gigantes, SLA e velocidade de resposta dos operadores.

### F3.2 — Filtros Avançados de Conversas
* **Entradas:**
  - Campo de busca por texto (Nome, Telefone, Última Mensagem).
  - Filtro por Canal de Origem (WAHA WhatsApp Web vs Meta WABA Cloud API vs Messenger vs IG Direct).
  - Filtro por Atendente/Operador Responsável.
  - Filtro por Status da Conversa (`Aberta`, `Pendente Operador`, `Devolvida para IA`, `Resolvida`).

### F3.3 — Modal "+ Nova Conversa"
* **Comportamento Identico ao Cockpit:** Permite localizar qualquer lead armazenado no PostgreSQL ou digitar um novo número de WhatsApp para iniciar o atendimento comercial de imediato.
