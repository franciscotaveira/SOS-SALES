# PROMPT: Refinamento Visual Final — SOS Sales "Menos é Mais"
> Versão 1.0 | MCT OS v2.0 | 18 Ago 2026

---

## CONTEXTO DO PROJETO

Você está trabalhando no **SOS Sales**, um CRM operacional de alta performance para vendas via WhatsApp.
Stack: **React 19 + Vite + TypeScript + TailwindCSS v4 + Lucide Icons**.
O projeto tem **82 componentes TSX** organizados em 17 módulos (`cockpit`, `kanban`, `conversas`, `agenda`, `grupos`, `results`, `intelligence`, `settings`, `layout`, `monitoring`, etc.).

**Filosofia central:** `Poder invisível, simplicidade visível.`
**Diretiva desta sessão:** `MENOS É MAIS — Refinamento visual final sem quebrar funcionalidades.`

---

## CONTEXTO DO PROBLEMA

O sistema está **excelente em funcionalidade**, mas visualmente **sobrecarregado**. Acumulamos muitas features e a interface ficou densa demais. O objetivo desta sessão é percorrer **cada tela/módulo** e aplicar refinamento cirúrgico:

- **Reduzir ruído visual** (remover elementos decorativos desnecessários, badges excessivos, textos redundantes)
- **Corrigir erros visuais** (padding inconsistente, overflow, truncamento, alinhamento quebrado)
- **Hierarquia de informação** (o que o operador PRECISA ver fica visível; o resto colapsa ou some)
- **Zero quebra de funcionalidade** — apenas CSS, classes Tailwind e estrutura JSX mínima

---

## DESIGN SYSTEM (tokens ativos em `src/index.css`)

```
Cores semânticas:
--sos-canvas: #F5F7FA        (fundo geral)
--sos-surface: #FFFFFF        (cards/painéis)
--sos-ink: #101828            (texto primário)
--sos-muted: #667085          (texto secundário)
--sos-action: #059669         (verde primário - CTAs)
--sos-operational: #2563EB    (azul - ações operacionais)
--sos-ai: #7C3AED             (roxo - IA/Copilot)
--sos-warning: #D97706        (âmbar - alertas)
--sos-danger: #DC2626         (vermelho - crítico)
--sos-border: #E2E8F0         (bordas padrão)

Sidebar (escura):
  bg: #0B132B / #0F172A
  active item: #00A884
  text: slate-300/400

Fontes:
  heading: 'Sora'
  body: 'Source Sans 3'
  mono: 'IBM Plex Mono'
```

---

## REGRAS DE OURO DO REFINAMENTO

FAZER:
- Reduzir font-size de labels secundários (usar text-[10px] ou text-xs)
- Consolidar grupos de botões: ações raras → colapsar em menu "..."
- Remover títulos redundantes (se a seção já está em contexto, o h2 é ruído)
- Usar gap-2 em vez de gap-3/gap-4 onde o espaço não agrega hierarquia
- Substituir badges numéricos decorativos por estado vazio limpo
- Garantir que toda lista com estado vazio mostre mensagem honesta, nunca componente mock
- Normalizar border-radius: rounded-xl para cards, rounded-lg para botões inline
- Remover animações desnecessárias (manter só ping de status online e transições de hover)

NAO FAZER:
- Remover funcionalidades (apenas ajuste visual/CSS)
- Alterar lógica de negócio, hooks, chamadas de API, tipos
- Mudar nomes de props ou exports
- Adicionar novas features ou componentes não existentes
- Usar dados mock onde a tela já mostra dados reais
- Quebrar responsividade mobile

---

## ROTEIRO DE REVISÃO — PERCORRA NESTA ORDEM

Para cada módulo abaixo, você deve:
1. Ler o arquivo TSX principal
2. Identificar problemas visuais (listar brevemente)
3. Aplicar correções cirúrgicas diretamente no código
4. Registrar o que foi feito

---

### MÓDULO 1 — AppShell (Sidebar + Layout Global)
**Arquivo:** `src/components/layout/AppShell.tsx`

Verificar:
- [ ] Sidebar collapsed/expanded: proporção do ícone SOS no estado recolhido
- [ ] Seções de navegação (OPERAÇÃO / GESTÃO / INTELIGÊNCIA / SISTEMA): espaçamento entre sections correto?
- [ ] Footer da sidebar: WorkspaceSwitcher + WhatsApp Status + AI Autonomy + Profile — muito denso?
- [ ] Tags de role ("Leitura", "Marketing") no nav: necessárias ou ruído?
- [ ] Subcategorias accordion inline: texto de 11px legível? Padding correto?
- [ ] Header topbar mobile: overflow no nome do workspace?
- [ ] Botões busca (Cmd+K) e notificações: alinhamento com o conteúdo principal

---

### MÓDULO 2 — Cockpit Agora (Tela Principal)
**Arquivo:** `src/components/cockpit/LiveCockpitView.tsx`
**Sub:** `PriorityQueue.tsx`, `PriorityItem.tsx`, `MessageBubble.tsx`, `MessageTimeline.tsx`, `LiveDossier.tsx`, `SupervisedComposer.tsx`, `ConversationHeader.tsx`

Verificar:
- [ ] Layout 3 colunas: proporção (fila | chat | dossiê) — overflow horizontal < 1280px?
- [ ] PriorityItem: avatar + nome + preview + badges — remover badges duplicados
- [ ] MessageBubble: textos longos — quebra de linha correta? Timestamp visível?
- [ ] ConversationHeader: muitos botões? Colapsar ações raras em menu "..."
- [ ] SupervisedComposer: label "Supervisionado" e botões WABA não invasivos?
- [ ] LiveDossier: abas KnownFacts / ContinuityRibbon / MemoryNotes — hierarquia clara?
- [ ] ContinuityRibbon: info redundante com o dossiê?
- [ ] Estado vazio de fila: mensagem limpa sem componentes fake

---

### MÓDULO 3 — Kanban Comercial
**Arquivo:** `src/components/kanban/LiveCommercialKanbanView.tsx`

Verificar:
- [ ] KPI Ribbon financeiro: quantos KPIs? Cabe em 1 linha sem overflow?
- [ ] Cards: badge de preço + stage badge — redundância?
- [ ] Headers de coluna: totalizador financeiro visível e limpo
- [ ] Scroll horizontal: funciona sem UI quebrada no mobile?
- [ ] Estado vazio por coluna: mensagem honesta?

---

### MÓDULO 4 — Conversas e Funil
**Arquivo:** `src/components/conversations/LiveConversationsView.tsx`
**Sub:** `ConversationsHubView.tsx`, `AllConversationsView.tsx`

Verificar:
- [ ] Toggle Lista / Funil / Torre TV: botões visíveis e alinhados
- [ ] Lista de conversas: avatar + nome + preview + timestamp — truncamento correto?
- [ ] Filtros de status: ficam na mesma linha sem quebrar?
- [ ] Botão "+ Nova Conversa": posição consistente entre sub-views?
- [ ] StartConversationModal: modal limpo, sem campos desnecessários

---

### MÓDULO 5 — Agenda Comercial
**Arquivo:** `src/components/agenda/AgendaView.tsx`
**Sub:** `DailyCalendarView.tsx`, `WeeklyCalendarView.tsx`, `MonthlyCalendarView.tsx`

Verificar:
- [ ] Toggle Dia / Semana / Mês: estado ativo claro
- [ ] Visão Dia: slots com altura proporcional ao serviço
- [ ] Visão Semana: colunas por dia — overflow em telas menores?
- [ ] Visão Mês: dados de agendamento truncados corretamente?
- [ ] Linha vermelha de horário atual: visível mas não invasiva
- [ ] Botão "+ Novo Agendamento": posição e visibilidade

---

### MÓDULO 6 — Grupos (WhatsApp Groups)
**Arquivo:** `src/components/groups/GroupsHubView.tsx`
**Sub:** `GroupMonitor.tsx`

Verificar:
- [ ] Abas: Conversas / Monitor / Torre NOC / Disparo — tabs limpas
- [ ] Lista de grupos: nome + membros + status — denso demais?
- [ ] GroupMonitor: semáforo de status visível
- [ ] Torre NOC (LiveWallboardView): texto legível em escala?

---

### MÓDULO 7 — Resultados e Gestão de Campanhas
**Arquivo:** `src/components/results/ResultsHubView.tsx`
**Sub:** `LiveTrafficProofView.tsx`, `MassBroadcastView.tsx`, `CampaignLinksTab.tsx`, `WabaTemplatesTab.tsx`

Verificar:
- [ ] 6 abas (Analytics / CTWA / Broadcast / Links / Modelos / Rastreamento): avaliar agrupamento
- [ ] Analytics KPIs: fonte proporcional ao valor
- [ ] Gráficos: legenda limpa, sem clutter
- [ ] MassBroadcastView: campos necessários visíveis, opcionais colapsados
- [ ] WabaTemplatesTab: badge de status (APPROVED/PENDING/REJECTED) claro

---

### MÓDULO 8 — Inteligência (Sales AI Playbook)
**Arquivo:** `src/components/intelligence/SalesAiPlaybookView.tsx`
**Sub:** `CompanyProfileSection.tsx`, `ProductCatalogSection.tsx`, `AgentKnowledgeBaseSection.tsx`, `ContinuousLearningSection.tsx`, `AgentSettingsSection.tsx`, `ClientAgentHubView.tsx`, `MessengerInsightsPanel.tsx`

Verificar:
- [ ] 7 sub-seções internas: alguma pode ser colapsada?
- [ ] CompanyProfileSection: labels curtos e claros, helper texts longos removidos
- [ ] ProductCatalogSection: preço formatado (R$ XXX)
- [ ] AgentKnowledgeBaseSection: estado vazio limpo
- [ ] ClientAgentHubView: badges de especialidade sem excesso
- [ ] MessengerInsightsPanel: hierarquia de métricas correta

---

### MÓDULO 9 — Configurações
**Arquivo:** `src/components/settings/LiveSettingsView.tsx`
**Sub:** `SettingsShell.tsx`, `ConnectionManager.tsx`, `TeamManager.tsx`, `ApiWebhooksManager.tsx`, `FeatureFlagManager.tsx`, `TrackingSettings.tsx`

Verificar:
- [ ] ConnectionManager: separação visual clara entre WAHA / WABA / Meta Omnichannel
- [ ] EmbeddedSignupModal: steps numerados e progresso visível
- [ ] TeamManager: espaçamento de colunas adequado
- [ ] ApiWebhooksManager: API Key mascarada por padrão com toggle "mostrar"
- [ ] FeatureFlagManager: toggle switches alinhados, label à esquerda
- [ ] TrackingSettings: seções colapsáveis para reduzir scroll

---

### MÓDULO 10 — Anotações
**Arquivo:** `src/components/notes/NotesView.tsx`

Verificar:
- [ ] Lista de notas: truncamento correto
- [ ] Editor: área de texto com tamanho mínimo adequado
- [ ] Botão "+ Nova Nota": posição consistente
- [ ] Estado vazio: mensagem honesta ("Sem anotações ainda")

---

## CRITÉRIOS DE ACEITAÇÃO POR MÓDULO

Marque como PRONTO somente quando:

1. Zero overflow horizontal em viewport 1280px
2. Hierarquia de 3 níveis respeitada: título → dado primário → dado secundário
3. Estado vazio honesto em todas as listas (sem dados mock)
4. Máximo de 3 CTAs visíveis por tela — resto em menu "..." ou colapsado
5. Texto legível: mínimo text-xs (12px) funcional; text-[10px] apenas para metadados
6. Espaçamento consistente: gap-2 dentro de grupos, gap-4 entre grupos, gap-6 entre seções

---

## COMO REPORTAR O PROGRESSO

Após cada módulo, responda no formato:

MÓDULO X — [Nome]

Problemas encontrados:
- [problema 1]
- [problema 2]

Correções aplicadas:
- [arquivo] → [o que mudou]

Status: PRONTO | PENDENTE ([motivo])

---

## REGRAS FINAIS DE OPERAÇÃO

1. Leia o arquivo antes de editar — nunca edite às cegas
2. Uma sessão = um módulo por vez — não pule módulos
3. Se encontrar erro de TypeScript ao ajustar JSX, corrija no mesmo commit
4. Se a correção visual exigir mudança de lógica, PARE e pergunte antes
5. Não invente dados — se mostra dados reais via API, não substitua por mock
6. Registre decisões ambíguas: DECISÃO: [o que foi feito] porque [razão]

---

## PONTO DE ENTRADA SUGERIDO

Comece pelo MÓDULO 1 — AppShell, pois é o container de todos os outros.
Se o AppShell estiver limpo e sólido, todos os outros módulos herdam melhoria automática.

```bash
# Para rodar local e visualizar as mudanças:
npm run dev
# Acesso: http://localhost:5173
```

---
_MCT OS v2.0 | Prompt gerado por Antigravity (AGY) | 18 Ago 2026_
_Francisco Taveira Rios — MCT LTDA | Filosofia: Poder invisível, simplicidade visível._
