# BLOCKERS.md — Registro de Bloqueadores e Riscos

> **Regra do Contrato:** Registro de bloqueios internos, externos e itens delimitados fora do escopo.
> **Truth in Data:** Nenhum bloqueador pode ser marcado como resolvido sem teste direcionado, evidência e verificação fail-closed.

---

## 1. Bloqueadores Críticos da Auditoria Independente

| ID | Descrição | Gravidade | Fase | Estado | Ação Resolutiva |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **B-01** | Material de credencial em arquivo local `scripts/seed-haven-waba.ts` e `.env.example` determinístico | `P0` | `Fase 4` | `SANITIZED_LOCAL` | **Sanitizado localmente:** Chaves literais substituídas por variáveis de ambiente obrigatórias e modo Lab sintético; `.env.example` limpo. Rotação externa pendente pelo proprietário. |
| **B-02** | A própria matriz rejeita o aceite (P1, P2, P3, P5 como `TODO`) | `P0` | `Fase R0` | `IN_PROGRESS` | Retratar certificação prematura e atualizar matriz com status real e honesto. |
| **B-03** | M9 não é E2E de sistema (usa Fastify in-memory e SQL direto; falta percurso Docker real) | `P0` | `Fase R5` | `TODO` | Construir stack de teste isolada com Web real, API container, Worker real e Provedor Sintético HTTP fiel ao contrato. |
| **B-04** | Prova visual não reproduzível (scripts fora do Git e não fail-closed) | `P1` | `Fase R1` | `TODO` | Versionar scripts de QA, tornar todos fail-closed com exit code != 0 em caso de falha. |
| **B-05** | Gate de lint falso (Turbo executa 0 tarefas e CI dá PASS) | `P1` | `Fase R1` | `TODO` | Configurar linter real nos pacotes aplicáveis e fazer o runner falhar se executar 0 tarefas. |

---

## 2. Bloqueadores de Segurança e Integridade (S-01 a S-07)

| ID | Descrição | Gravidade | Fase | Estado | Ação Resolutiva |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **S-01** | SSRF em rotas de onboarding e teste de conexão | `P0` | `Fase R2` | `TODO` | Substituir `fetch` comum por `safeFetchWithSsrfGuard` com DNS restrito, bloqueio de IP privado e verificação de redirects. |
| **S-02** | Estado de canal fabrica prontidão (`is_active` vira `connected` sem validação) | `P1` | `Fase R2` | `TODO` | Implementar máquina explícita: `unconfigured -> validating -> pairing -> connected \| error -> revoked`. |
| **S-03** | Rotação e revogação de credenciais (key_version estática, revogação afeta canais compartilhados) | `P1` | `Fase R2` | `TODO` | Gravar key_version real, suportar keyring v1/v2 e isolar revogação por canal/credencial com auditoria transacional. |
| **S-04** | RLS e privilégios excessivos do Worker (falta escopo de workspace; DELETE em tabelas financeiras) | `P0` | `Fase R2` | `TODO` | Restringir worker a contexto de tenant/claim específico; revogar DELETE operacional em `pix_charges` e tabelas de outcome. |
| **S-05** | CAPI usa configuração global antes do tenant (risco de vazamento de dados de conversão) | `P0` | `Fase R2` | `TODO` | Precedência estrita para credencial e dataset do workspace; fail-closed se ausente; lease fencing em I/O. |
| **S-06** | Concorrência de proposta e outcome (ausência de locks e risco de outcomes duplicados) | `P0` | `Fase R3` | `TODO` | Lock com versão esperada em propostas; serialização idempotente por jornada em outcomes com derive de telefone persistido. |
| **S-07** | Referências tenant-safe incompletas (assignee sem prova de membership; vínculo Pix↔proposta por SQL) | `P1` | `Fase R3` | `TODO` | Validação de membership de assignee; rota transacional oficial para vínculo Pix↔proposta. |

---

## 3. Bloqueios Externos Legítimos (`BLOCKED_EXTERNAL`)

1. **BLOCKED_EXTERNAL (Meta Credentials):** Rotação/revogação dos tokens Meta expostos originalmente no ambiente local antes da sanitização.
2. **BLOCKED_EXTERNAL (Aparelho Físico):** Pareamento WAHA/Evolution com chip GSM real requer aparelho físico em mãos.
3. **BLOCKED_EXTERNAL (Envio Real WhatsApp):** Disparo de mensagens tarifadas para números externos depende de conta ativa e templates homologados na Meta.
4. **BLOCKED_EXTERNAL (Migração Física Produção):** Conexão e cutover da base de dados V2 de produção dependem de janela operacional aprovada.
