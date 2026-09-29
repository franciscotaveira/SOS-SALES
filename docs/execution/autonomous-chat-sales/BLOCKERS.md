# BLOCKERS.md — Registro de Bloqueadores e Riscos

> **Regra do Contrato:** Registro de bloqueios internos, externos e itens delimitados fora do escopo.
> **Truth in Data:** Nenhum bloqueador pode ser marcado como resolvido sem teste direcionado, evidência e verificação fail-closed.

---

## 1. Bloqueadores Críticos da Auditoria Independente

| ID | Descrição | Gravidade | Fase | Estado | Ação Resolutiva |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **B-01** | Material de credencial em arquivo local `scripts/seed-haven-waba.ts` e `.env.example` determinístico | `P0` | `Fase 4` | `RESOLVED_LOCAL` | **Sanitizado localmente:** Chaves literais substituídas por variáveis de ambiente obrigatórias e modo Lab sintético; `.env.example` limpo. Rotação externa pendente pelo proprietário. |
| **B-02** | A própria matriz rejeita o aceite (P1, P2, P3, P5 como `TODO`) | `P0` | `Fase R0` | `RESOLVED` | Retratada certificação prematura e matriz atualizada com status real e honesto. |
| **B-03** | M9 não é E2E de sistema (usa Fastify in-memory e SQL direto; falta percurso Docker real) | `P0` | `Fase R5` | `IN_PROGRESS` | Construir stack de teste isolada com Web real, API container, Worker real e Provedor Sintético HTTP fiel ao contrato. |
| **B-04** | Prova visual não reproduzível (scripts fora do Git e não fail-closed) | `P1` | `Fase R1` | `RESOLVED` | Scripts de QA versionados no Git, tornando todos fail-closed com exit code != 0 em caso de falha. |
| **B-05** | Gate de lint falso (Turbo executa 0 tarefas e CI dá PASS) | `P1` | `Fase R1` | `RESOLVED` | Configuração ESLint 10 flat config em todos os 10 pacotes, executando 10/10 tarefas reais. |

---

## 2. Bloqueadores de Segurança e Integridade (S-01 a S-07)

| ID | Descrição | Gravidade | Fase | Estado | Ação Resolutiva |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **S-01** | SSRF em rotas de onboarding e teste de conexão | `P0` | `Fase R2` | `RESOLVED` | Substituído `fetch` comum por `safeFetchWithSsrfGuard` com DNS restrito, bloqueio de IP privado e verificação de redirects. |
| **S-02** | Estado de canal fabrica prontidão (`is_active` vira `connected` sem validação) | `P1` | `Fase R2` | `RESOLVED` | Máquina explícita de lifecycle implementada via Migration 022 e trigger `sync_channel_instance_status`. |
| **S-03** | Rotação e revogação de credenciais (key_version estática, revogação afeta canais compartilhados) | `P1` | `Fase R2` | `RESOLVED` | Keyring v1/v2 com `key_version` persistida e isolamento de revogação por canal/credencial com auditoria. |
| **S-04** | RLS e privilégios excessivos do Worker (falta escopo de workspace; DELETE em tabelas financeiras) | `P0` | `Fase R2` | `RESOLVED` | Worker restrito a contexto tenant-safe; DELETE revogado em `pix_charges`, `commercial_proposals` e `commercial_outcomes`. |
| **S-05** | CAPI usa configuração global antes do tenant (risco de vazamento de dados de conversão) | `P0` | `Fase R2` | `RESOLVED` | Precedência estrita para credencial e dataset do workspace; fail-closed se ausente; lease fencing em I/O. |
| **S-06** | Concorrência de proposta e outcome (ausência de locks e risco de outcomes duplicados) | `P0` | `Fase R3` | `RESOLVED` | Máquina de estados de propostas e índice único `uq_commercial_outcomes_journey_won` com deduplicação e lock em jornadas. |
| **S-07** | Referências tenant-safe incompletas (assignee sem prova de membership; vínculo Pix↔proposta por SQL) | `P1` | `Fase R3` | `RESOLVED` | Validação de membership de assignee (`ASSIGNEE_NOT_MEMBER`) e rotas oficiais atômicas para vínculo Pix↔proposta. |

---

## 3. Bloqueios Externos Legítimos (`BLOCKED_EXTERNAL`)

1. **BLOCKED_EXTERNAL (Meta Credentials):** Rotação/revogação dos tokens Meta expostos originalmente no ambiente local antes da sanitização.
2. **BLOCKED_EXTERNAL (Aparelho Físico):** Pareamento WAHA/Evolution com chip GSM real requer aparelho físico em mãos.
3. **BLOCKED_EXTERNAL (Envio Real WhatsApp):** Disparo de mensagens tarifadas para números externos depende de conta ativa e templates homologados na Meta.
4. **BLOCKED_EXTERNAL (Migração Física Produção):** Conexão e cutover da base de dados V2 de produção dependem de janela operacional aprovada.
