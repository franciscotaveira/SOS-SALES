# SOS Sales — Documentação de Arquitetura

## 1. Visão Geral
O **SOS Sales** é um sistema operacional de continuidade comercial e atribuição de tráfego projetado para negócios que recebem leads pelo WhatsApp (CTWA e direto) e demandam velocidade, governança de IA e comprovação de ROI.

## 2. Princípios de Arquitetura
1. **Poder Invisível, Simplicidade Visível**: A complexidade operacional (regras de negócio, políticas, deduplicação de webhooks, roteamento WAHA, inferência LLM) reside no backend. A interface do operador exibe exclusivamente:
   - **Contexto**: De onde o lead veio (campanha, criativo, oferta de anúncio).
   - **Prioridade**: Contagem regressiva de SLA e gravidade de urgência.
   - **Decisão**: Dossiê Vivo com fatos validados e score de confiança.
   - **Ação**: Compositor supervisionado com sugestão embasada em evidências.

2. **Supabase / PostgreSQL como Fonte de Verdade**:
   - Multi-tenancy estrito via `workspace_id`.
   - Row Level Security (RLS) protegendo todas as consultas.
   - Realtime via Postgres CDC para sincronização imediata de fila e mensagens.

3. **Fastify Backend como Autoridade de Negócio**:
   - Autoridade de políticas comerciais e kill-switches de canais.
   - Outbox de mensagens com idempotência e retry com backoff exponencial.
   - Handoff atômico com prevenção de condições de corrida (lock otimista / 409 Conflict).

4. **Frontend Neuroinclusivo e de Alta Densidade Operacional**:
   - Design livre de ruídos cognitivos, contêineres visualmente delimitados.
   - Máximo de 3 a 5 itens prioritários na visão primária da fila, com expansão sob demanda.
   - Preservação incondicional de rascunhos de mensagens no navegador.

## 3. Diagrama do Golden Path

```
Anúncio Meta CTWA
       │
       ▼ (Webhook WAHA / Meta Graph)
Fastify Webhook Gateway (Deduplicação & Ingestão)
       │
       ▼
Supabase PostgreSQL (Workspace, Contact, Journey, Acquisition, Known Facts)
       │
       ├─────────────────────────────────┐
       ▼                                 ▼
Fila de Prioridades (SLA < 5min)    Decisão IA / Playbook (Copilot / Autonomous Safe)
       │                                 │
       ▼                                 ▼
Cockpit do Operador (Handoff Claim) ──► Sugestão com Dupla Evidência
       │
       ▼
Compositor Supervisionado (Aprovação / Edição)
       │
       ▼ (Outbox & WAHA)
WhatsApp do Lead
       │
       ▼
Fechamento Comercial (Registro de Outcome)
       │
       ▼
Proof of Traffic (Atribuição de Receita & ROAS Real)
```
