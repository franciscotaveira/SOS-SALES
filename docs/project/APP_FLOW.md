# SOS SALES V3 — FLUXO DO APP, JORNADAS E MÁQUINAS DE ESTADO

> **MCT OS v2.0 | Francisco Rios | MCT LTDA | Chapecó, BR**  
> **Filosofia:** *Poder invisível, simplicidade visível. Truth in Data.*  
> **Stack:** React 19 + Vite, Fastify 5, PostgreSQL 16 (FORCE RLS), Redis 7 / BullMQ, WABA / WAHA.  
> **Status:** Referência Canônica de Navegação, Experiência e Transições de Estado.

---

## 1. Visão Geral da Arquitetura de Fluxos

O **SOS Sales V3 (CHAT-SALES)** opera em três camadas coordenadas de fluxo:

```text
┌────────────────────────────────────────────────────────────────────────┐
│  NÍVEL 1: MACRO-FLUXO DE NEGÓCIO (AQUISIÇÃO → CONVERSÃO → RETORNO)    │
│  Meta Ads (CTWA) → WhatsApp Ingress → Cockpit → Outcome → Meta CAPI    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│  NÍVEL 2: FLUXO DE NAVEGAÇÃO DO COCKPIT (HUMANO / OPERACIONAL)         │
│  AppShell → Inbox → Thread Ativa → Drawers (Pix, Catálogo, Radar)      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│  NÍVEL 3: MÁQUINAS DE ESTADO DETERMINÍSTICAS (BACKEND TRANSACIONAL)    │
│  Outbox (Lease/Fencing) │ Cobrança Pix │ Radar M01 │ Handoff IA/Humano │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Nível 1: Macro-Fluxo de Negócio de Ponta a Ponta

Este fluxo governa o ciclo completo com prova: nenhum lead é perdido, nenhuma venda é inventada e nenhuma conversão é disparada sem recibo.

```mermaid
flowchart TD
    subgraph AQUISICAO["1. Aquisição & Entrada"]
        A[Anúncio Meta CTWA / Lead Ads] -->|Clique do Cliente| B(WhatsApp Webhook Ingress)
        B -->|rawBody + Signature| C{Lookup Ingress<br/>Token Hash}
        C -->|Válido| D[(channel_webhook_inbox)]
        C -->|Inválido / Replay| E[Rejeição 401 / Drop]
    end

    subgraph INGESTAO["2. Normalização & Atribuição"]
        D --> F[Worker: InboxProcessor]
        F --> G[(contacts + commercial_threads)]
        F --> H[(attribution_touchpoints)]
        G --> I[Fila do Cockpit Atualizada]
    end

    subgraph OPERACAO["3. Atendimento no Cockpit"]
        I --> J[Operador Seleciona Thread]
        J --> K{Tipo de Atendimento}
        K -->|Humano Direto| L[Chat / Composer]
        K -->|IA Supervisionada| M[Sugestões / Handoff]
        L --> N[Ações Comerciais Rápidas]
    end

    subgraph CONVERSAO["4. Conversão & Cobrança"]
        N -->|Gerar Pix| O[Drawer Pix BR Code EMV]
        N -->|Consultar Serviços| P[Catálogo de Serviços]
        N -->|Análise Oportunidades| Q[Radar M01]
        O --> R[(pix_charges)]
        R -->|Envio ao Cliente| S[Card na Timeline + Composer]
        S -->|Pagamento Confirmado| T[Conferência no Caixa: Manual ou Webhook]
    end

    subgraph FEEDBACK["5. Outcome & Meta CAPI"]
        T --> U[Registro de Outcome Comercial: WON]
        U --> V{Elegibilidade CAPI?}
        V -->|CTWA Touchpoint Válido| W[Enfileirar CAPI PurchaseCompleted]
        V -->|Sem Atribuição / Inelegível| X[Registrar Sem Despacho CAPI]
        W --> Y[CAPI Worker Dispatcher]
        Y --> Z[(conversion_event_receipts na Meta)]
    end
```

---

## 3. Nível 2: Mapa de Navegação da Interface (Cockpit)

O Cockpit segue a diretriz **Bounded Containers** e navegação com sidebar escura estrutural (`#0B132B`) e área de trabalho limpa (`#F8FAFC`).

```mermaid
flowchart LR
    subgraph APPSHELL["AppShell & Navegação Global"]
        NAV[Sidebar Soberana]
        NAV --> R1["/inbox (Cockpit Principal)"]
        NAV --> R2["/contacts (Base de Contatos)"]
        NAV --> R3["/campaigns (Campanhas & Atribuição)"]
        NAV --> R4["/settings (Configurações do Canal)"]
    end

    subgraph COCKPIT["/inbox — Cockpit Tripartite"]
        R1 --> COL1["Coluna 1: Fila de Conversas<br/>• Filtros: Todas, Aguardando, Minhas<br/>• Badge SLA & Não Lidas<br/>• Badge Radar Sugestões"]
        R1 --> COL2["Coluna 2: Timeline Ativa<br/>• Balões Cliente / Operador<br/>• Cards de Cobrança Pix<br/>• Badges de Eventos Comerciais<br/>• Composer com Rascunho Isolado"]
        R1 --> COL3["Coluna 3: Dossiê do Lead<br/>• Identificação & Origem CTWA<br/>• Dados de Contato & Opt-out<br/>• Histórico de Compras & Jornadas"]
    end

    subgraph DRAWERS["Gavetas e Modais Operacionais"]
        COL2 -->|Botão Cobrança Pix| D_PIX["Drawer Pix<br/>• Título do Pedido<br/>• Valor BRL (sem mock)<br/>• Chave Pix & QR Local"]
        COL2 -->|Botão Catálogo| D_CAT["Drawer / Modal Catálogo<br/>• Tabela de Serviços & Preços<br/>• Injeção de Link/Texto"]
        COL1 -->|Badge Radar| D_RADAR["Drawer Radar M01<br/>• Lista de Sugestões Pendentes<br/>• Tese & Evidências<br/>• Aceitar (pre-fill) ou Rejeitar"]
    end

    subgraph SETTINGS["/settings — Gestão de Linhas"]
        R4 --> S_WABA["Configuração Meta WABA<br/>• Wizard Token & Phone ID<br/>• Teste de Conexão<br/>• Templates Oficiais"]
        R4 --> S_WAHA["Configuração WAHA<br/>• Sessão Local WebJS<br/>• QR Code de Pareamento"]
    end
```

---

## 4. Nível 3: Máquinas de Estado Transacionais

### 4.1 Máquina de Estados da Mensageria Outbox (`outbound_commands`)

Garante **zero duplicação de mensagens**, tratamento governado de timeouts ambíguos e isolamento de fila via `FOR UPDATE SKIP LOCKED`.

```mermaid
stateDiagram-v2
    [*] --> pending: Criação Transacional (Message + Command)
    
    pending --> processing: Worker Claim (SKIP LOCKED + Lease UUID)
    
    processing --> sent: Provedor confirma envio (HTTP 200/201 + externalMessageId)
    
    processing --> failed: Erro Transitório de Rede (retry_count < max)
    failed --> pending: Próxima tentativa (next_attempt_at)
    
    processing --> dead_letter: Erro Definitivo / Rejeição Canal / Esgotamento Retries
    
    processing --> reconciliation_required: Timeout Ambíguo / Queda Socket / Lease Expirado
    
    reconciliation_required --> sent: Webhook tardio confirma entrega com externalId
    reconciliation_required --> dead_letter: Webhook tardio confirma rejeição fatal
    reconciliation_required --> sent: Resolução Humana Auditada (adminReconcile + externalId real)
    
    sent --> [*]
    dead_letter --> [*]
```

---

### 4.2 Máquina de Estados da Cobrança Pix (`pix_charges`)

Isola estritamente a gestão financeira de efeitos colaterais de marketing, suportando múltiplas cobranças coexistentes e conferência no caixa.

```mermaid
stateDiagram-v2
    [*] --> draft: Operador Abre Drawer Pix
    
    draft --> pending: Submissão com Valor Real > 0
    note right of pending
        Gera Payload EMVCo (CRC-16 BACEN)
        Renderiza QR Code Local (Sem APIs externas)
        Insere Card Pix na Timeline
    end note
    
    pending --> settled: Webhook Bancário Automático (PIX Recebido)
    pending --> settled: Conferência no Caixa Manual (Operador Auditado)
    
    note right of settled
        Status vira "paid"
        Badge exibe "✓ Conferido no Caixa"
        Botão de conferência é removido
        Pre-fill no Composer: "Seu pagamento foi conferido pelo caixa..."
    end note
    
    pending --> cancelled: Cancelamento Manual / Nova Cobrança
    pending --> expired: Expiração de Prazo (BACEN TTL)
    
    settled --> [*]
    cancelled --> [*]
    expired --> [*]
```

---

### 4.3 Máquina de Estados do Radar de Oportunidades M01 (`integration_suggestions`)

Governa o ciclo de vida de recomendações da inteligência sem permitir automações cegas (zero outbound na aceitação).

```mermaid
stateDiagram-v2
    [*] --> candidate_evaluation: Polling de Candidatos (/candidates)
    
    candidate_evaluation --> pending: Criação com candidateRevision Válido
    candidate_evaluation --> [*]: Rejeição CANDIDATE_STALE (409) se houver nova mensagem
    
    state pending {
        [*] --> awaiting_decision
        awaiting_decision --> awaiting_decision: Replay Idempotente (mesmo hash canônico)
    }
    
    pending --> accepted: Operador Clica em "Aceitar"
    note right of accepted
        Carrega rascunho no Composer
        Dispara ZERO mensagens externas
        Estado final imutável (state_version + 1)
    end note
    
    pending --> dismissed: Operador Clica em "Dispensar"
    
    pending --> invalidated: Revalidação de Origem Falhou na Decisão
    note right of invalidated
        Motivos Estruturados:
        • ORIGIN_STALE_NEW_MESSAGE
        • ORIGIN_THREAD_CLOSED
        • ORIGIN_THREAD_HANDOFF
        • ORIGIN_CONTACT_OPT_OUT
        • MODULE_DISABLED (Kill-Switch)
        • RULE_VERSION_STALE
        • WORKSPACE_INACTIVE
    end note
    
    pending --> expired: Sugestão Venceu pelo Relógio do Banco (clock_timestamp)
    
    accepted --> [*]
    dismissed --> [*]
    invalidated --> [*]
    expired --> [*]
```

---

## 5. Matriz de Estados Honestos por Tela (Truth in Data)

Em conformidade com a filosofia **MCT OS**, nenhuma tela utiliza dados fictícios ou simulações:

| Rota / Componente | Papel Mínimo | Estado Normal | Estado Vazio (`empty`) | Estado Degradado / Erro |
| :--- | :--- | :--- | :--- | :--- |
| **`/inbox` (Fila)** | `operator` | Lista de conversas ordenadas por `last_message_at` | *"Nenhuma conversa pendente no momento"* | Alerta de desconexão do provedor (WAHA/WABA) sem mascarar como fila limpa |
| **`/inbox` (Timeline)** | `operator` | Mensagens reais com status (enviado, entregue, lido) | *"Selecione uma conversa para iniciar o atendimento"* | Balão vermelho com código de erro sanitizado e ação `Retry` |
| **Drawer Pix** | `operator` | Campos de Título e Valor BRL iniciam limpos (`""`) | Botão de envio desabilitado enquanto valor for nulo/vazio | Validação de chave Pix inválida ou falha de conexão |
| **Drawer Radar** | `operator` | Cards de recomendação com evidências reais | *"Nenhuma recomendação pendente para esta conversa"* | Aviso se o módulo Radar estiver desativado no workspace |
| **`/contacts`** | `operator` | Tabela paginada com telefone E.164 e opt-out | *"Nenhum contato cadastrado ainda"* | Falha de carregamento com botão de nova tentativa |
| **`/campaigns`** | `admin` | Tabela de Touchpoints CTWA com `ad_id` e métricas | *"Nenhuma campanha com tráfego registrado"* | Diagnóstico de permissão do token Meta Ads |
| **`/settings`** | `admin` | Formulários de configuração e saúde de canal | Linha não configurada exibe Wizard passo a passo | Indicador de erro HTTP / Token expirado |

---

## 6. Mapa de Evidências Visuais Auditadas

As telas e fluxos documentados acima foram verificados em testes reais reproduzíveis no repositório:

| Arquivo de Evidência | Tela / Fluxo Comprovado |
| :--- | :--- |
| [`docs/audits/haven-cockpit-inbox.png`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/docs/audits/haven-cockpit-inbox.png) | Fila de conversas, badges de não lidas e visual tripartite do Cockpit |
| [`docs/audits/haven-chat-active.png`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/docs/audits/haven-chat-active.png) | Conversa ativa com Mariana Souza, balões e timeline em tempo real |
| [`docs/audits/haven-chat-pix-drawer.png`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/docs/audits/haven-chat-pix-drawer.png) | Drawer Pix aberto em estado limpo (sem valores mockados) |
| [`docs/audits/e1-pix-two-charges-distinct-states.png`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/docs/audits/e1-pix-two-charges-distinct-states.png) | Coexistência de duas cobranças Pix com estados independentes |
| [`docs/audits/e1-cashier-draft-persisted.png`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/docs/audits/e1-cashier-draft-persisted.png) | Rascunho de conferência de caixa preenchido e persistido entre trocas de aba |
| [`docs/audits/radar-drawer-open.png`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/docs/audits/radar-drawer-open.png) | Drawer do Radar M01 exibindo sugestões pendentes |
| [`docs/audits/radar-draft-accepted.png`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/docs/audits/radar-draft-accepted.png) | Aceite de sugestão preenchendo o composer com zero outbound automático |
| [`docs/audits/haven-waba-settings-pix.png`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/docs/audits/haven-waba-settings-pix.png) | Tela de configurações WABA e chave Pix operacional |
| [`docs/audits/live-test/`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/docs/audits/live-test/) | Suite completa da jornada do operador (do login à venda ganha e auditoria) |
