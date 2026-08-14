# SOS Sales — Inventário das 13 Telas & Status de Implementação

> **Data de Atualização**: 2026-08-14
> **Referência**: Telas Oficiais do Product Owner (UX Blueprint)
> **Objetivo**: Classificação técnica rigorosa entre dados reais, dados computados, configurações e elementos de desenvolvimento/QA.

---

## Legenda de Classificação Técnica
- **`REAL_DATA`**: Dado persistido e consultado diretamente no banco (Supabase/PostgreSQL).
- **`COMPUTED_DATA`**: Dado derivado por motor de regras ou agregação em tempo de execução (ex: SLA restante, confiança da IA).
- **`CONFIGURATION`**: Parâmetro operacional de workspace/canal (ex: modo Copilot, horário de atendimento).
- **`QA_ONLY`**: Controles de simulação e teste que **NUNCA** devem ser exibidos em produção para usuários finais.
- **`MOCK_ONLY`**: Fixture temporária aguardando conexão externa.
- **`BLOCKED_EXTERNAL`**: Funcionalidade dependente de credencial/serviço externo (ex: Meta Cloud API, WAHA instance).

---

## 1. Cockpit “Agora” (Fila de Prioridades, Conversa Ativa & Dossiê Vivo)
- **Prioridade UX**: `P0 (Núcleo Essencial)`
- **Objetivo**: Fornecer ao operador foco imediato no lead mais urgente, contexto do anúncio CTWA e próxima ação recomendada.
- **Usuário**: Operador Comercial, Supervisor, Owner.
- **Componentes**: `PriorityQueue`, `PriorityItem`, `ContinuityLine`, `LiveDossier`, `ConversationHeader`, `MessageTimeline`, `SupervisedComposer`.
- **Dados Necessários**:
  - Lista de jornadas com SLA ordenado (`COMPUTED_DATA`).
  - Dossiê Vivo com fatos confirmados vs. inferidos (`REAL_DATA` + `COMPUTED_DATA`).
  - Contexto de aquisição CTWA (campanha, anúncio, oferta) (`REAL_DATA`).
  - Mensagens do chat com status de entrega (`REAL_DATA`).
- **Endpoints / RPCs**:
  - `GET /api/v1/workspaces/:workspaceId/priorities`
  - `GET /api/v1/journeys/:journeyId`
  - `GET /api/v1/journeys/:journeyId/messages`
- **Subscription Realtime**: `supabase.channel('messages:journey_id')`, `supabase.channel('handoffs:workspace_id')`.
- **Permissões**: `operator` (escrita/envio), `viewer` (somente leitura sem compositor).
- **Estados Suportados**: `loading`, `empty`, `active`, `sla_critical`, `channel_paused`, `offline`.
- **Ações**: Selecionar jornada, assumir handoff, abrir gaveta de notas, recolher dossiê.
- **Status Real**: `IMPLEMENTED_HTTP` (com persistência via Gateway e fallback seguro).
- **Testes**: Suíte de priorização e contagem regressiva de SLA.
- **Riscos**: Sobrecarga cognitiva em telas menores (mitigado com drawer/recolhimento de dossiê).

---

## 2. Recomendação Supervisionada & Compositor Comercial
- **Prioridade UX**: `P0 (Núcleo Essencial)`
- **Objetivo**: Apresentar sugestão de resposta da IA embasada em evidências, permitindo aprovação rápida com `Enter` ou ajuste no compositor.
- **Usuário**: Operador Comercial.
- **Componentes**: `RecommendationCard`, `SupervisedComposer`, `EvidenceModal`, `MacroShortcutMenu`.
- **Dados Necessários**:
  - Sugestão de texto com score de confiança (`COMPUTED_DATA`).
  - Dupla evidência documental (`REAL_DATA` / `CUSTOMER_MESSAGE`).
  - Status do canal (ativo vs. pausado) (`CONFIGURATION`).
  - Rascunho salvo no cache local (`REAL_DATA`).
- **Endpoints / RPCs**:
  - `GET /api/v1/journeys/:journeyId/recommendation`
  - `POST /api/v1/journeys/:journeyId/messages`
- **Permissões**: Exige role `operator` ou `owner`. Bloqueado para `viewer`.
- **Ações**: "Usar no Editor (Enter)", edição inline, envio, acionamento de macro (`/`).
- **Status Real**: `IMPLEMENTED_HTTP` (preservação incondicional de rascunhos em caso de erro).
- **Riscos**: Alucinação de preço (bloqueado por motor de guardrails que checa catálogo do playbook).

---

## 3. Modal de Follow-up (Snooze / Retomada Comercial)
- **Prioridade UX**: `P0 (Núcleo Essencial)`
- **Objetivo**: Agendar recontato com o lead em horário específico sem perder a prioridade na fila.
- **Usuário**: Operador Comercial.
- **Componentes**: `SnoozeFollowUpModal`.
- **Dados Necessários**:
  - Data/hora de agendamento e motivo (`REAL_DATA`).
- **Endpoints / RPCs**: `POST /api/v1/journeys/:journeyId/follow-up`.
- **Status Real**: `IMPLEMENTED_HTTP`.

---

## 4. Modal de Desfecho Comercial (Outcome)
- **Prioridade UX**: `P0 (Núcleo Essencial)`
- **Objetivo**: Registrar o encerramento do atendimento (`won`, `lost`, `scheduled`, `unqualified`) com valor faturado (`amount_minor`).
- **Usuário**: Operador Comercial, Supervisor.
- **Componentes**: `OutcomeModal`.
- **Dados Necessários**:
  - Status do desfecho (`REAL_DATA`).
  - Valor do serviço (`REAL_DATA` em centavos BRL).
  - Motivo de perda padronizado (`CONFIGURATION`).
- **Endpoints / RPCs**: `POST /api/v1/journeys/:journeyId/outcome`.
- **Status Real**: `IMPLEMENTED_HTTP`.

---

## 5. Estados Recolhidos do Dossiê Vivo (Layout Responsivo)
- **Prioridade UX**: `P0 (Núcleo Essencial)`
- **Objetivo**: Garantir legibilidade em notebooks e telas menores através de drawers e sanfonas de contexto.
- **Componentes**: `LiveDossier` (modo compacto e drawer deslizante).
- **Status Real**: `IMPLEMENTED_HTTP`.

---

## 6. Lista Completa de Conversas
- **Prioridade UX**: `P0 (Núcleo Essencial)`
- **Objetivo**: Histórico completo de leads com busca por nome, telefone e filtros por status/operador.
- **Usuário**: Operador Comercial, Supervisor, Owner.
- **Componentes**: `AllConversationsView`.
- **Endpoints / RPCs**: `GET /api/v1/workspaces/:workspaceId/conversations`.
- **Status Real**: `IMPLEMENTED_HTTP`.

---

## 7. Funil Kanban de Vendas
- **Prioridade UX**: `P1 (Evolução Operacional)`
- **Objetivo**: Visualização horizontal da esteira comercial com drag & drop auditável entre etapas.
- **Usuário**: Operador Comercial, Gestor de Vendas.
- **Componentes**: `CommercialKanbanView`.
- **Dados Necessários**:
  - Estágio da jornada (`new`, `contacted`, `qualified`, `proposal`, `negotiation`, `won`) (`REAL_DATA`).
  - Métricas agregadas de Pipeline Ativo e Faturamento (`COMPUTED_DATA`).
- **Regra Crítica**: Arrastar card dispara evento auditável `stage_changed` no backend.
- **Status Real**: `IMPLEMENTED_HTTP` (com persistência síncrona no Gateway).

---

## 8. Conversa de Grupo (WhatsApp Groups)
- **Prioridade UX**: `P2 (Módulo Agência — Feature Flag agency_groups)`
- **Objetivo**: Atendimento e suporte a múltiplos stakeholders em grupos de WhatsApp.
- **Usuário**: Gestor de Tráfego, Atendimento da Agência.
- **Componentes**: `GroupsHubView`, `GroupChatView`.
- **Flag de Proteção**: Oculto por padrão para contas de clientes finais (Haven, Películas).
- **Status Real**: `IMPLEMENTED_HTTP` (isolado sob feature flag).

---

## 9. Monitor de Grupos & SLA da Agência
- **Prioridade UX**: `P2 (Módulo Agência — Feature Flag agency_groups)`
- **Objetivo**: Acompanhar tempo de resposta da equipe nos grupos de suporte.
- **Componentes**: `GroupsHubView` (painel de métricas de SLA).
- **Status Real**: `IMPLEMENTED_HTTP`.

---

## 10. Proof of Traffic & Relatório de Resultados
- **Prioridade UX**: `P0 (Núcleo Essencial)`
- **Objetivo**: Comprovar faturamento gerado pelos anúncios Meta Ads CTWA.
- **Usuário**: Gestor de Tráfego, Owner, Anunciante.
- **Componentes**: `TrafficProofView`.
- **Regra Crítica de Verdade**:
  - Receita faturada = soma de `amount_minor` de outcomes `won` (`REAL_DATA`).
  - ROAS só é calculado se houver custo comprovado de mídia (`attributedCostBrl > 0`). Caso contrário, exibe "Gasto Indisponível" sem números falsos.
- **Endpoints / RPCs**: `GET /api/v1/workspaces/:workspaceId/traffic-proof`.
- **Status Real**: `IMPLEMENTED_HTTP`.

---

## 11. Infraestrutura WABA / WAHA (Canais de Mensageria)
- **Prioridade UX**: `P0 (Configuração Mínima) / P2 (Gestão Avançada)`
- **Objetivo**: Status de conexão, pausa e monitoramento de saúde do canal.
- **Componentes**: `ChannelStatus`, `SettingsShell`.
- **Regra Crítica de Verdade**:
  - Identificar explicitamente se o canal opera via **WAHA (WhatsApp Web Container)** ou **Meta Cloud API (WABA Oficial)**.
  - É **proibido** exibir "Criptografia Oficial Cloud API" em conexões WAHA.
  - Zero promessas de failover automático sem credenciais e testes comprovados.
- **Status Real**: `CONFIGURATION` / `BLOCKED_EXTERNAL` (para instâncias cloud reais).

---

## 12. Configuração da IA Vendedora & Playbook
- **Prioridade UX**: `P0 (Configuração Mínima) / P1 (Modo Autônomo)`
- **Objetivo**: Seleção de modo (`OFF`, `COPILOT`, `AUTONOMOUS_SAFE`) e catálogo de ofertas/regras.
- **Componentes**: `SettingsShell` (aba IA & Playbook).
- **Regra Crítica**:
  - O modo `AUTONOMOUS_SAFE` exige Playbook publicado, canal aprovado e limite de budget configurado.
- **Status Real**: `CONFIGURATION`.

---

## 14. Sistema de Governança de Feature Flags & Controle de Acesso Owner

- **Objetivo**: Garantir que recursos P1 (Kanban, Autônomo, Deep Analytics), P2 (Módulo Agência/Grupos), Ferramentas de Teste (QA Simulator) e Ferramentas Analíticas Executivas (Proof of Traffic, Métricas Financeiras, Deep ROAS e Trilha de Auditoria) sejam isolados com segurança em produção e restritos com base no papel do usuário (`role: 'owner' | 'supervisor' | 'operator' | 'viewer'`).
- **Flags de Controle Analítico & Executivo**:
  - `traffic_proof` (P0/Owner): Controle de visibilidade da aba Resultados e Painel de Prova de Tráfego Meta Ads CTWA ➔ WhatsApp.
  - `owner_only_analytics` (P1/Owner): Quando ativo, restringe a visualização de faturamento e ROAS exclusivamente a usuários com perfil `Owner`.
  - `financial_metrics` (P1/Owner): Controle de exibição de valores monetários absolutos (Receita Gerada BRL, Gasto Meta CTWA, CPL e Margens).
  - `roas_deep_analytics` (P1/Owner): Painel aprofundado com métricas de Custo Por Lead (CPL), Ticket Médio por Venda e Lucro Bruto Estimado por Campanha.
  - `audit_trail` (P1/Owner): Trilha de auditoria e governança de eventos de atribuição e conversão comercial.
- **Níveis de Isolamento**:
  - **P0 (Núcleo Essencial)**: Cockpit "Agora", Conversas, Linha de Continuidade, Dossiê Vivo, Follow-up, Outcome Comercial.
  - **P1 (Evolução Operacional & Analytics)**: `commercial_kanban`, `macro_shortcuts`, `autonomous_safe_ai`, `financial_metrics`, `roas_deep_analytics`, `audit_trail`.
  - **P2 (Módulo Agência)**: `agency_groups` (Grupos WhatsApp, relatórios de suporte), `advanced_routing` (WABA/WAHA hybrid).
  - **DEV_QA**: `qa_simulator` (Injeção de mensagens e falha de rede simulada).
- **Mecanismo de Resolução**:
  1. Sobrescrita manual (`localStorage` - painel de configurações).
  2. Validação hierárquica de papel do usuário (`role === 'owner'` ou `ROLE_HIERARCHY`).
  3. Configuração explícita do Workspace (`workspace.featureFlags`).
  4. Padrão do Tier da Conta (`standard` vs `agency` vs `enterprise`).
  5. Padrão do Registro do Sistema.
- **Painel de Controle**: Disponível na aba **"Feature Flags & Módulos"** dentro de Configurações (`/settings`).
