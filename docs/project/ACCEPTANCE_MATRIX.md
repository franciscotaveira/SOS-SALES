# Acceptance Matrix

## Schema obrigatório por pacote

| Campo | Descrição |
|---|---|
| AC-ID | identificador estável |
| Requisito | comportamento exigido |
| Risco protegido | falha evitada |
| Given/When/Then | cenário verificável |
| Camada | unit/db/contract/integration/e2e/external/manual |
| Ambiente | test/lab/homolog/pilot/prod |
| Evidence-ID | artefato vinculado |
| SHA/Digest | código testado |
| Owner | implementador responsável |
| Reviewer | revisor independente |
| Resultado | PASS/FAIL/BLOCKED/NOT_RUN |
| Limitação | fronteira da evidência |
| Validade | quando deve ser revalidado |

## Critérios globais

| AC-ID | Requisito | Resultado atual |
|---|---|---|
| AC-GOV-001 | toda mudança pertence a um work package | BLOCKED |
| AC-GOV-002 | árvore candidata limpa e ligada a SHA | BLOCKED |
| AC-SEC-001 | zero acesso cross-tenant | BLOCKED — Iteração 4 em revisão |
| AC-SEC-002 | nenhum segredo/token em logs | BLOCKED — cobertura incompleta |
| AC-CH-001 | webhook aceito é persistido uma vez | NOT_RUN E2E |
| AC-CH-002 | nenhuma duplicidade externa em recovery | BLOCKED |
| AC-CH-003 | nenhum item de fila fica sem estado terminal | BLOCKED |
| AC-CH-004 | WABA texto/mídia/template/status | NOT_RUN externo |
| AC-CH-005 | WAHA webhook/envio/mídia/status | NOT_RUN Docker |
| AC-CH-006 | troca de provider preserva histórico | NOT_RUN |
| AC-CRM-001 | contato → conversa → oportunidade → outcome | NOT_RUN |
| AC-UI-001 | operador atende uma conversa real | NOT_RUN |
| AC-AI-001 | IA respeita política e faz handoff | NOT_RUN |
| AC-META-001 | origem possui hierarquia de evidências | NOT_RUN |
| AC-CAPI-001 | outcome elegível recebe recibo | NOT_RUN |
| AC-ONB-001 | novo workspace ativa canal sem desenvolvedor | BLOCKED_EXTERNAL |
| AC-MIG-001 | Haven migra e reverte sem perda | NOT_RUN |

## Dimensões obrigatórias por work package

- funcional;
- tenancy e dados;
- autenticação/RBAC;
- segurança;
- concorrência/idempotência;
- resiliência/recovery;
- contrato externo;
- observabilidade;
- performance;
- UX/acessibilidade;
- migração/rollback;
- privacidade.

`BLOCKED` ou `NOT_RUN` impede `ACCEPTED`. P0 e P1 nunca recebem waiver. Apenas P2 ou requisito comprovadamente não aplicável pode receber waiver explícito, com owner, justificativa, aprovação de Francisco e expiração.
