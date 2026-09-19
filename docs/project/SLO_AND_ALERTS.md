# SLOs, Métricas e Alertas

## SLOs técnicos iniciais

Valores são metas de validação e precisam ser calibrados no piloto antes de compromisso comercial.

| SLO | Meta inicial |
|---|---:|
| Violação cross-tenant | 0 |
| Evento aceito e perdido | 0 |
| Side effect externo duplicado confirmado | 0 |
| Reconciliação ambígua detectada e triada | 100% em até 15 min |
| Webhook persistido p95 | < 200 ms |
| Mensagem disponível no Cockpit p95 | < 5 s |
| Outbound aceito pelo endpoint do provider p95 | < 10 s, sem outage externo |
| Entrega ao destinatário | medida separadamente por webhook de status do provider |
| Outcome elegível despachado à CAPI p95 | < 5 min |
| Rollback Haven | < 15 min |
| API após beta | alvo 99,9% |

## Métricas obrigatórias

- webhook rate, assinatura inválida e deduplicação;
- inbox/outbox lag p50/p95/p99;
- retry, dead-letter e idade de reconciliação;
- lease loss e fencing violations;
- latência/erro por provider;
- accepted → sent → delivered → read;
- auth 401/403 e falhas RLS;
- redaction incidents;
- tempo para primeira resposta e handoff;
- outcomes registrados;
- cobertura e nível de evidência de atribuição;
- CAPI accepted/failed/not-applicable e recibos;
- custo/tokens e falhas de tools da IA;
- tempo de onboarding e intervenção de suporte.

## Alertas P0

- qualquer sinal de acesso cross-tenant;
- evento persistido sem possibilidade de processamento;
- duplicidade externa confirmada;
- segredo ou token identificado em log;
- crescimento de DLQ/reconciliação acima do SLA;
- dois writers ativos para o mesmo workspace;
- CAPI enviando outcome inelegível.

Todos os eventos devem correlacionar, quando aplicável: `correlation_id`, `workspace_id`, `channel_instance_id`, `message_id`, `provider_event_id`, `outbox_command_id` e `capi_event_id`, sem PII crua.
