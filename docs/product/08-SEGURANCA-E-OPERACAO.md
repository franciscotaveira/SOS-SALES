# Segurança, SLO e Operação

## 1. Modelo de ameaça resumido

| Ameaça | Controle principal |
|---|---|
| acesso entre clientes | JWT/RBAC + `workspace_id` + FORCE RLS |
| webhook falso/replay | assinatura, timestamp e idempotência |
| duplicidade externa | inbox/outbox, lease, fencing e reconciliação |
| vazamento de segredo | criptografia, resolução tardia e redaction |
| SSRF por mídia/URL | allowlist, validação DNS/IP e limites |
| abuso de API | escopos, rate limit e auditoria |
| ação indevida de IA | schema, policy, tool allowlist e aprovação |
| perda de dados | backup, restore testado e retenção |

## 2. SLOs iniciais

| Indicador | Objetivo |
|---|---:|
| violação cross-tenant | 0 |
| webhook aceito perdido | 0 |
| efeito externo duplicado confirmado | 0 |
| mensagem visível no Cockpit p95 | < 5 s |
| reconciliação crítica triada | até 15 min |
| API própria no beta | 99,9% |

Metas dependentes de Meta, WAHA, internet ou IA devem ser medidas separadamente da disponibilidade própria.

## 3. Observabilidade

Cada fluxo usa:

- `correlation_id`;
- `workspace_id`;
- `channel_instance_id`;
- `provider_event_id`;
- `message_id` ou `outbox_command_id`;
- estado, tentativa, latência e erro normalizado.

Dashboards mínimos:

- saúde da plataforma e providers;
- ingress/outbox/DLQ;
- atraso de mensagens;
- erros por workspace sem expor conteúdo;
- CAPI por estado;
- custo e falha de IA;
- jobs n8n quando administrados pelo serviço.

## 4. Backup e recuperação

- backup diário criptografado;
- retenção definida;
- restauração periódica em ambiente isolado;
- RPO/RTO contratualmente definidos;
- exportação por workspace;
- rollback de deploy e migration documentado;
- mídia possui política própria de backup e expiração.

## 5. Incidentes

Classificação:

- **P0:** vazamento cross-tenant, perda confirmada, segredo exposto ou duplicidade grave;
- **P1:** canal/worker indisponível ou backlog acima do limite;
- **P2:** função degradada com alternativa;
- **P3:** defeito de UX sem perda operacional.

P0 interrompe efeitos externos, preserva evidências e inicia rotação/rollback. Nenhuma reconciliação crítica pode depender de memória informal.

## 6. LGPD

- finalidade e base legal por tratamento;
- minimização;
- consentimento/opt-out quando aplicável;
- exportação e eliminação por tenant;
- acesso de suporte temporário;
- registro de operadores e suboperadores;
- prazo de retenção configurável;
- conteúdo de conversa não entra em analytics sem necessidade.

## 7. Gate de release

1. diff e migrations revisados;
2. typecheck, build e testes pertinentes;
3. RLS e RBAC negativos;
4. scan de segredos/dependências;
5. backup/rollback confirmado;
6. smoke test em staging/lab;
7. deploy;
8. leitura de saúde e métricas;
9. prova E2E controlada antes de declarar produção funcional.
