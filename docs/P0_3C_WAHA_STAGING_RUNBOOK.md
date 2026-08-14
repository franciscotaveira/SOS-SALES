# P0.3C — Homologação WAHA em Staging

**Status:** infraestrutura local recuperada em 2026-08-14; pareamento e Golden
Path real precisam ser homologados novamente após a limpeza de dados do Docker.
Staging HTTPS e cofre server-only continuam pendentes. Nenhuma credencial deve
ser registrada neste repositório.

## Evidência local observada — 2026-08-14

O sandbox chegou a ser conectado a uma conta exclusivamente de teste, com a
porta WAHA restrita ao loopback. Depois disso, uma corrupção no armazenamento do
Docker Desktop exigiu `Clean up data`, removendo o pareamento e o banco efêmero.
As migrations reconstruíram o banco; o pareamento e o Golden Path precisam ser
repetidos antes de qualquer declaração de homologação.

| Evidência | Resultado | Limite honesto |
|---|---|---|
| Sessão WAHA | sessão recriada em `SCAN_QR_CODE` | pareamento atual ainda pendente |
| Webhook assinado | não configurado na sessão recriada | validar o contrato real antes de ligar; nenhum placeholder é aceito |
| Readiness | banco, Redis e worker responderam `ok` em `/ready` após reconstrução | prova somente o runtime local |
| Inscrição de eventos | somente `message` | remove o ruído duplicado de `message.any` |
| LID | resolver oficial WAHA consultado | o evento exercitado não possuía mapeamento `@lid → @c.us`; portanto não criou contato falso |
| Regressão | suíte completa e build devem ser executados no checkpoint de publicação | não substitui STG-01..07 no ambiente server-only |

**Decisão operacional:** quando o WAHA não fornecer telefone verificável para um
`@lid`, o envelope imutável é preservado e o worker conclui o evento sem retentar
nem inventar identidade. Quando o provedor devolver um `@c.us`, o resolvedor
normaliza a mensagem e cria a jornada normalmente. Esta regra está coberta por
teste de integração.

## Objetivo

Provar o caminho real, com uma conta de teste isolada:

```text
WAHA staging -> webhook HMAC -> inbound_channel_events -> outbox -> worker
-> conversation_messages -> evidência de entrega/retry
```

P0.3C não autoriza mensagem comercial autônoma, IA ativa, Meta CAPI ou acesso de cliente final.

## Pré-requisitos que o owner deve fornecer fora do Git

- Uma instância WAHA de staging, sem conversas de produção.
- URL HTTPS pública para `POST /webhooks/waha/:channelConnectionId`.
- Escolha e configuração de um cofre de segredos que implemente `WebhookSecretResolver`.
- Adapter server-only que leia somente a referência `webhook_vault_secret_id` e componha `ReferencedWebhookSecretProvider`.
- Um `RuntimeDependencies` de produção com checks obrigatórios `database`, `redis` e `worker`.
- Permissão explícita antes de inserir qualquer segredo na infraestrutura de staging.

## Casos de homologação

| ID | Ação | Evidência de aceite | Rollback |
|---|---|---|---|
| STG-01 | Enviar mensagem de cliente para número WAHA de teste | webhook retorna `202`; envelope imutável e mensagem normalizada possuem o mesmo `provider_message_id` | desligar webhook do canal |
| STG-02 | Reenviar o mesmo webhook | segundo retorno é deduplicado; não cria nova mensagem/outcome | manter evento original |
| STG-03 | Assinatura HMAC inválida | resposta `401`; nenhum fato/outbox criado | nenhuma alteração necessária |
| STG-04 | Desligar Redis ou worker | `/ready` devolve `503` com `redis` ou `worker` degradado; `/health` continua `200` | restaurar serviço e confirmar `/ready` 200 |
| STG-05 | Induzir falha transitória de normalização | evento é retentado por lease; depois de exceder política vai para DLQ com trilha auditável | corrigir causa e reprocessar pela operação aprovada |
| STG-06 | Rotacionar segredo no cofre | nova assinatura válida funciona; segredo antigo falha; nenhum valor aparece em logs/respostas | reverter secret version no cofre |
| STG-07 | Tentar payload cross-workspace | operação é bloqueada por chave composta/RLS; não há leitura ou escrita fora do workspace | investigar somente com dados de staging |

## Comandos de evidência local

Executar no checkout isolado, antes e depois da sessão de staging:

```bash
npm run check
npm run build
git diff --check
curl -fsS "$STAGING_URL/health"
curl -fsS "$STAGING_URL/ready"
```

`STAGING_URL` é um valor de shell local, nunca um valor de `.env` versionado nem documentação com token.

## Go/No-Go P0.3C

**GO somente se** todos STG-01..07 possuem evidência com timestamp, o runtime de staging não usa adapters locais e o owner confirma que nenhum segredo entrou no Git.

**NO-GO se** o segredo estiver em env versionado, `/ready` responder 200 com qualquer dependência obrigatória ausente, houver duplicação de mensagem, ou a sessão usar conversa/número de produção.

## Próximo passo após GO

Abrir P0.4: handoff humano, política de ação e envio explicitamente supervisionado por workspace/canal.
