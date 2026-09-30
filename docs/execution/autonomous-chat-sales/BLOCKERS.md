# BLOCKERS.md — Registro de Bloqueadores e Riscos

> **Regra do Contrato:** Registro de bloqueios internos, externos e itens delimitados fora do escopo.
> **Truth in Data:** Nenhum bloqueador pode ser marcado como resolvido sem teste direcionado, evidência e verificação fail-closed.

---

## 1. Bloqueadores Críticos da Auditoria Independente

| ID | Descrição | Gravidade | Fase | Estado | Ação Resolutiva |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **B-01** | Material de credencial em arquivo local `scripts/seed-haven-waba.ts` e `.env.example` determinístico | `P0` | `Fase 4` | `RESOLVED_LOCAL` | **Sanitizado localmente:** Chaves literais substituídas por variáveis de ambiente obrigatórias e modo Lab sintético; `.env.example` limpo. Rotação externa pendente pelo proprietário. |
| **B-02** | A própria matriz rejeita o aceite (P1, P2, P3, P5 como `TODO`) | `P0` | `Fase R0` | `RESOLVED` | Retratada certificação prematura e matriz atualizada com status real e honesto. |
| **B-03** | M9 não é E2E de sistema (usa Fastify in-memory e SQL direto; falta percurso Docker real) | `P0` | `Fase R5` | `TODO` | Construir stack de teste isolada com Web real, API container, Worker real e Provedor Sintético HTTP fiel ao contrato. |
| **B-04** | Prova visual não reproduzível (scripts fora do Git e não fail-closed) | `P1` | `Fase R1` | `RESOLVED` | Scripts de QA versionados no Git, tornando todos fail-closed com exit code != 0 em caso de falha. |
| **B-05** | Gate de lint falso (Turbo executa 0 tarefas e CI dá PASS) | `P1` | `Fase R1` | `RESOLVED` | `scripts/ci-gate-runner.ts` agora falha estritamente (`fail-closed`) se `taskCount === 0` ou `successful === 0`, validado por suíte unitária em `scripts/__tests__/ci-gate-runner.test.ts`. |
| **B-06** | Janela TOCTOU no Radar de sugestões entre chegada de mensagem e aceite | `P1` | `Fase R3` | `RESOLVED` | Bloqueio pessimista `FOR UPDATE OF t` na busca do thread em `integration-suggestions.repository.ts`, eliminando concorrência entre chegada de mensagem e aceite. |
| **B-07** | R4 testou integridade no mesmo banco, mas não executou backup e restore hermético real | `P1` | `Fase R4` | `RESOLVED` | Backup físico via `pg_dump -F c` com bypass admin para bypassar RLS em tabelas com FORCE RLS, restore em banco efêmero isolado, reconciliação de checksums/centavos em 9 tabelas e teste de isolamento tenant RLS via `sos_app_user`. Validado em `scripts/__tests__/migration-v2-to-v3-dryrun.test.ts`. |
| **B-08** | Scanner de segredos tem escopo limitado e alega 100% clean | `P2` | `Fase R1` | `RESOLVED` | Patterns ampliados para Meta access tokens, JWTs, chaves privadas/RSA, GitHub PATs e AWS access keys; escopo com contagem explícita de arquivos auditados sem alegações absolutas infundadas. Validado em `scripts/__tests__/ci-gate-runner.test.ts`. |

---

## 2. Bloqueadores de Segurança e Integridade (S-01 a S-07)

| ID | Descrição | Gravidade | Fase | Estado | Ação Resolutiva |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **S-01** | SSRF em rotas de onboarding e teste de conexão | `P0` | `Fase R2` | `RESOLVED` | Substituído `fetch` comum por `safeFetchWithSsrfGuard` com DNS restrito, bloqueio de IP privado e verificação de redirects. |
| **S-02** | Estado de canal fabrica prontidão (`is_active` vira `connected` sem validação do adapter) | `P0` | `Fase R2` | `RESOLVED` | Canal inicia em `validating` (com credencial) ou `unconfigured` (sem). Transição para `connected` exige handshake real via adapter (`verify-session`). Bloqueada escrita direta de `connected` por cliente. Gatilho biunívoco com `is_active`. Validado em `apps/api/src/__tests__/security-hardening-r2.test.ts`. |
| **S-03** | Rotação e revogação de credenciais (key_version estática, revogação afeta canais compartilhados) | `P1` | `Fase R2` | `RESOLVED` | Keyring v1/v2 com `key_version` persistida e isolamento de revogação por canal/credencial com auditoria. |
| **S-04** | Policies do Worker com fallback global `ELSE true` permitem acesso a múltiplos tenants | `P0` | `Fase R2` | `RESOLVED` | Migração `024_worker_rls_fail_closed.sql` removeu permissões `DELETE` de `sos_app_user` e `sos_worker_user` sobre `pix_charges`, `commercial_proposals` e `commercial_outcomes`. Eliminado `ELSE true` permissivo de RLS em tabelas operacionais e comerciais. |
| **S-05** | CAPI aceita IDs WABA como dataset, payload incorreto, falta de isolamento WABA e vazamento de tokens/erros | `P1` | `Fase R2` | `RESOLVED_LOCAL` | **Fechamento Definitivo Local (Graph API v26.0):** Contrato atualizado para Meta Graph API `v26.0` configurável com allowlist `["v25.0", "v26.0"]` e erro canônico `CAPI_GRAPH_VERSION_INVALID`; remoção de `row.account_id` como fallback de WABA (exigência estrita de `waba_account_id` no payload criptografado); validação estrita de dataset ID numérico (`^\d{10,20}$`) com rejeição de `pixel_*` e `tenant_pixel*`; remoção de `access_token` da URL em favor de cabeçalho `Authorization: Bearer`; percurso completo de atribuição CTWA comprovado (`webhook.referral.ctwa_clid -> metadata.ctwaClid -> commercial_journeys.ctwa_clid -> conversion_events.user_data.ctwaClid -> CAPI.user_data.ctwa_clid`); projeção estrita de receipt `{ graph_api_version, events_received: 1, fbtrace_id }` sem `messages` arbitrário; guarda global de rede zero bloqueando qualquer chamada a `graph.facebook.com` em testes; allowlist canônica de 18 códigos sanitizados. Validado por 31 testes em `apps/worker/src/__tests__/capi-dispatcher.test.ts` e 54 em `packages/application/src/__tests__/channel-gateway.test.ts` (85/85 aprovados) e suíte completa do worker (94/94 aprovados). `RESOLVED_PRODUCTION` requer teste Meta real sob `BLOCKED_EXTERNAL`. |
| **S-06** | Concorrência e integridade de outcomes (regressão de won para lost, silêncio em divergência) | `P0` | `Fase R3` | `RESOLVED` | Terminalidade estrita won/lost (retorna 409 em alteração), retorno de 409 em divergência de payload financeiro em replay idêntico, e exigência estrita de `expectedVersion` em propostas. Validado em `apps/api/src/__tests__/commercial-concurrency-r3.test.ts`. |
| **S-07** | Referências tenant-safe incompletas (assignee sem prova de membership; vínculo Pix↔proposta por SQL) | `P1` | `Fase R3` | `RESOLVED` | Validação de membership de assignee (`ASSIGNEE_NOT_MEMBER`) e rotas oficiais atômicas para vínculo Pix↔proposta. |

---

## 3. Bloqueios Externos Legítimos (`BLOCKED_EXTERNAL`)

1. **BLOCKED_EXTERNAL (Meta Credentials):** Rotação/revogação dos tokens Meta expostos originalmente no ambiente local antes da sanitização.
2. **BLOCKED_EXTERNAL (Aparelho Físico):** Pareamento WAHA/Evolution com chip GSM real requer aparelho físico em mãos.
3. **BLOCKED_EXTERNAL (Envio Real WhatsApp):** Disparo de mensagens tarifadas para números externos depende de conta ativa e templates homologados na Meta.
4. **BLOCKED_EXTERNAL (Migração Física Produção):** Conexão e cutover da base de dados V2 de produção dependem de janela operacional aprovada.
5. **B-UI-BROADCAST (Disparo em Massa / Bulk Broadcast sem Template Homologado):** A Meta Cloud API (WhatsApp Business API) impõe fail-closed para conversas iniciadas pela empresa (business-initiated). Qualquer mensagem ativa ou campanha fora da janela de atendimento de 24 horas exige estritamente um Message Template pré-aprovado pela Meta (`UTILITY`, `MARKETING` ou `AUTHENTICATION`). O disparo em massa arbitrário de texto livre sem template é rejeitado pela política oficial da Meta (código de erro 470 / Cloud API Policy Violation) e acarreta rebaixamento de tier ou banimento da conta WABA. Por integridade arquitetural (Truth in Data), o SOS Sales V3 bloqueia nativamente disparos livres em lote, canalizando reaberturas de janela e comunicações proativas exclusivamente através de templates homologados gerenciados em `/modelos` e no `TemplateDrawer`.

