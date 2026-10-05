# Integrações, API, Webhooks e n8n

## 1. Papel das integrações

O CHAT-SALES é o sistema de registro de conversas, contatos, oportunidades, decisões e outcomes. Sistemas externos leem eventos ou solicitam operações permitidas; não escrevem diretamente no banco.

## 2. API pública proposta

Base versionada: `/v1/workspaces/{workspaceId}`.

| Recurso | Operações |
|---|---|
| contatos | listar, obter, criar e atualizar |
| threads | listar, obter e consultar mensagens permitidas |
| oportunidades | criar, mover estágio e registrar outcome |
| ações | criar, concluir, cancelar e adiar |
| produtos | listar e consultar |
| propostas | criar e consultar |
| sugestões | criar/listar/decidir com idempotência |
| webhooks | cadastrar, testar, rotacionar e revogar |

## 3. Credenciais

Cada token de integração deve conter:

- `workspace_id` fixo;
- nome e owner;
- escopos mínimos;
- expiração ou política de rotação;
- hash armazenado, nunca o valor original;
- data do último uso;
- revogação imediata;
- limites de taxa.

Escopos sugeridos:

```text
contacts:read
contacts:write
threads:read
opportunities:read
opportunities:write
actions:write
suggestions:write
webhooks:manage
```

Enviar WhatsApp diretamente exige um escopo separado e política explícita; não deve ser entregue ao n8n por padrão.

## 4. Webhooks de saída

Eventos iniciais:

```text
contact.created
thread.created
message.received
message.status_changed
opportunity.stage_changed
commercial_action.due
commercial_outcome.recorded
suggestion.decided
channel.health_changed
```

Envelope:

```json
{
  "id": "evt_uuid",
  "type": "message.received",
  "version": "1",
  "workspaceId": "uuid",
  "occurredAt": "2026-10-05T15:00:00Z",
  "data": {},
  "correlationId": "uuid"
}
```

Entrega:

- assinatura HMAC com timestamp;
- proteção contra replay;
- idempotency key pelo `event.id`;
- timeout curto;
- retry exponencial com jitter;
- DLQ e replay manual auditado;
- redaction de PII em logs.

## 5. n8n

### Responsabilidade

O n8n executa rotinas opcionais e específicas, como:

- sincronizar Drive, ERP e planilhas;
- criar alertas ou relatórios;
- enriquecer dados;
- propor sugestões ao Radar;
- processar documentos;
- disparar processos internos depois de outcomes.

### Limites

- não recebe credencial direta do banco;
- não se torna owner do webhook WhatsApp;
- não altera mensagens históricas;
- não envia ao cliente sem escopo e política explícitos;
- não substitui idempotência, auditoria ou tenancy do núcleo.

### Template replicável

```text
Trigger seguro
→ validar assinatura
→ normalizar evento
→ checar idempotência
→ buscar somente dados necessários
→ executar integração
→ registrar resultado
→ enviar sugestão/retorno ao CHAT-SALES
→ retry/DLQ
```

## 6. Estado atual

- endpoints internos de candidatos e sugestões existem `[IMPLEMENTADO]`;
- tela informativa de integrações existe `[IMPLEMENTADO]` e `[PUBLICADO]` no snapshot de 2026-10-05;
- emissão autônoma de tokens permanentes `[PLANEJADO]`;
- cadastro de webhooks e entrega assinada `[PLANEJADO]`;
- biblioteca oficial de templates n8n `[PLANEJADO]`.
