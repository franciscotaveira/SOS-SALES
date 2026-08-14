# TX COMMERCIAL CORE — BLUEPRINT & HANDOVER MASTER

> **Documento de Direcionamento e Especificação Arquitetural**  
> *Versão:* 1.0 — 14 de Agosto de 2026  
> *Autor:* Francisco Rios | MCT LTDA  
> *Localização do Projeto:* Pasta raiz isolada deste repositório  

---

## 🎯 1. A Tese Central do Produto

> **"Vendas conversacionais não morrem por falta de interesse. Morrem por perda de contexto, quebra de momentum e atrito cognitivo no atendimento."**

O **TX Commercial Core** é um **Sistema Operacional de Continuidade Comercial e Navegação de Vendas**. Ele conecta aquisição de tráfego pago (Meta Ads/CTWA) ao fechamento no WhatsApp, garantindo que o atendimento não reinicie a jornada do cliente com aberturas genéricas, mas continue exatamente da promessa do anúncio até o pagamento.

---

## 🏛️ 2. Os Três Motores do Sistema

```text
┌──────────────────────────────────────────────────────────────────┐
│                      TX COMMERCIAL CORE                          │
├──────────────────────────────────────────────────────────────────┤
│ 1. MOTOR DE EVIDÊNCIA & ATRIBUIÇÃO (Evidence-Based Attribution)  │
│    Anúncio → CTWA / UTM → Clique → Conversa → Receita → CAPI    │
├──────────────────────────────────────────────────────────────────┤
│ 2. MOTOR DE CONTEXTO & DECISÃO (State Machine & Read Projections)│
│    Fatos + Inferências + Fricção + Known Facts → Projeção Viva   │
├──────────────────────────────────────────────────────────────────┤
│ 3. MOTOR DE EXECUÇÃO & HANDOFF ESTRUTURADO (Operator Cockpit)    │
│    Ação Mínima Útil → Dossiê de Handoff → Guardrails de Política │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📊 3. Os 11 Objetos de Domínio e Governança

O sistema separa estruturalmente **Fatos (imutáveis)** de **Inferências (projeções com confiança)** e **Decisões Operacionais (com políticas de guarda-corpo)**.

| Objeto | Natureza | Mutabilidade | Descrição |
|---|---|---|---|
| **1. `Contact`** | Fato | Mutável | Identidade do cliente (telefone E.164, WhatsApp ID). |
| **2. `CommercialJourney`** | Entidade Raiz | Mutável | Ciclo de vida da tentativa comercial atual (um contato pode ter N jornadas). |
| **3. `AcquisitionContext`** | Fato | Imutável | Memória do gancho, anúncio, criativo, oferta e nível de confiança de atribuição (`HIGH_CTWA`, `HIGH_TRACKING_LINK`, etc.). |
| **4. `KnownFact`** | Fato com Proveniência | Imutável / Ativo | Fatos declarados ou inferidos com autoridade e evidência (Cadastro Progressivo: nunca perguntar o que já sabemos). |
| **5. `DecisionEvent`** | Fato + Inferência | Imutável | Histórico auditável de cada raciocínio, avanço ou regressão da conversa. |
| **6. `DecisionState`** | Inferência (Projeção) | Mutável | Estado cognitivo atual (`DESCONHECIMENTO`, `INTERESSE_INICIAL`, `BUSCA_OBJETIVA`, `COMPARACAO`, `DECISAO_PRONTA`, `POS_VENDA`). |
| **7. `Friction`** | Inferência com Evidência | Mutável | Barreiras ativas de compra (`price`, `trust`, `availability`, `choice`, `payment`, `deadline`, `approval`). |
| **8. `RecommendedAction`** | Hipótese / Proposta | Imutável | Menor próximo passo útil sugerido pela IA (`ANSWER_PRICE`, `OFFER_TIME_SLOTS`, `SHOW_PROOF`, `HANDLE_OBJECTION`, etc.). |
| **9. `ExecutedAction`** | Fato Operacional | Imutável | Ação efetivamente disparada pelo bot ou atendente humano após validação de política. |
| **10. `HandoffCase`** | Dossiê Estruturado | Mutável → Fechado | Briefing com 5 tópicos entregue ao atendente (evita ler histórico de 80 mensagens). |
| **11. `CommercialOutcome`** | Fato de Negócio | Imutável | Fechamento financeiro (`WON`/`LOST`), aprendizado do método e disparo ao Meta CAPI. |

---

## 🏗️ 4. Infraestrutura e Isolamento Técnico

O projeto foi configurado com **isolamento absoluto** de outros projetos existentes na máquina:

* **Runtime:** Node.js (ESM) + TypeScript + Fastify + Zod
* **Banco de Dados:** Supabase local (PostgreSQL 17) configurado no `supabase/config.toml`
  * **Porta do PostgreSQL:** `54332`
  * **Porta da API Kong:** `54331`
  * **Porta do Supabase Studio (Web UI):** `54333`
  * **Porta de Inbucket (Emails):** `54334`
* **Filas & Cache:** Redis 7 dedicado rodando na porta `6380` (`docker-compose.yml`)
* **Provedor de IA:** OpenRouter com abstração própria de timeouts e fallback
* **Porta da Aplicação Fastify:** `3334`

---

## 🗺️ 5. Plano de Execução (Roadmap das 4 Semanas)

* **Semana 1 — Fundação & Ingestão:**
  * Subir Supabase local isolado (`npx supabase start`).
  * Aplicar migrações das 11 tabelas no PostgreSQL com RLS.
  * Ingestão de Webhooks do WhatsApp com extração de CTWA / Links rastreáveis.
* **Semana 2 — Projeção de Contexto & Handoff:**
  * Motor de cálculo do `ConversationDecisionContext`.
  * Criação do `HandoffCase` com briefing mastigado para o operador.
* **Semana 3 — IA Supervisionada & Guardrails:**
  * Geração de `RecommendedAction` com revisão humana (taxa de aprovação ≥ 60%).
  * Cadastro progressivo estrito (bloqueio de repetições).
* **Semana 4 — Atribuição, CAPI & Relatório Compartilhável:**
  * `ReportShare` com expiração de 30 dias e sem vazamento de PII.
  * Piloto em produção com **Haven Escovaria** (7 dias contínuos).

---

## ⚡ 6. Ponto de Entrada para a Próxima Sessão

Ao abrir a nova conversa neste repositório, basta enviar o prompt:

```text
Olá! Estou na pasta do TX Commercial Core (New Sales OS). 
Leia o HANDOVER.md e vamos iniciar a Fase 1: subir o Supabase local isolado e criar as migrações SQL das 11 entidades de domínio.
```
