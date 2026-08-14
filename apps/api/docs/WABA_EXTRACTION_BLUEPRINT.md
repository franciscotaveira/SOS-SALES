# Extração WABA do CRM TX para o Sales OS

**Status:** especificação de reaproveitamento; não autoriza integração Meta em
produção, nem envio automático.

## Decisão

O CRM TX é uma fonte de comportamento validado de borda, e não uma base de
código a ser migrada. O Sales OS preserva apenas contratos pequenos, com
portas explícitas e eventos imutáveis:

```text
Meta Cloud webhook
  -> raw inbound_channel_event (dedupe + assinatura)
  -> normalizador Meta
  -> conversation_message / message_event / acquisition_context
  -> handoff ou recomendação supervisionada

approved outbound dispatch
  -> MetaCloudOutboundProvider
  -> Meta Graph API
  -> provider message id + message lifecycle events
```

Nenhum controller, modelo Mongoose, seleção implícita de conta ou chamada de
serviço a partir de controller do TX deve ser copiado.

## O que reaproveitar

| Capacidade do TX | Evidência no TX | Destino no Sales OS | Regra de adaptação |
|---|---|---|---|
| Assinatura de webhook Meta | `backend/src/utils/metaWebhookSignature.js` | `MetaWebhookSignatureVerifier` | HMAC SHA-256 sobre **raw body**, comparação timing-safe e rotação explícita de segredo. |
| Descoberta Business → WABA → número | `backend/src/services/metaOnboardingDiscoveryService.js` | `MetaAssetDiscoveryPort` | Nunca selecionar o primeiro resultado: toda escolha múltipla exige confirmação humana e allowlist de IDs. |
| Normalização de status | `metaCloudService.mapMetaDeliveryStatus` | projeção em `conversation_message_events` | Preservar payload bruto e registrar `SENT`, `DELIVERED`, `READ`, `FAILED`, `REVOKED` como eventos append-only. |
| Referral CTWA | `metaCloudService.processMetaCloudWebhookValue` | normalizador de `acquisition_contexts` | Extrair ad/campaign/creative/UTM/referral com proveniência `META_CTWA`; ausência de dado reduz confiança, nunca inventa atribuição. |
| Resposta Meta Graph | `metaCloudService.sendTextMessage` | `MetaCloudOutboundProvider` | Somente recebe dispatch humano aprovado; retorna `providerMessageId`, nunca chama banco diretamente. |
| Mídia Meta | `buildMediaPayload`, `uploadMedia`, `sendMediaMessage` | provider de mídia posterior | Validar URL HTTPS permitida, tipo, tamanho e nome antes de upload; evitar base64 ilimitado em request. |
| Erros, retry e limite de concorrência | `metaProviderClient.js` | `MetaGraphClient` | Erros normalizados estáveis, `Retry-After`, backoff limitado e concorrência por provider/conta. Retry é do worker, não do endpoint HTTP. |
| Saúde/qualidade da conta | `phone_number_quality_update` e `account_update` | `channel_connection_health_events` futuro | Qualidade, limite e banimento devem pausar o canal automaticamente, mas nunca reativá-lo sem owner. |
| Template status | `message_template_status_update` | catálogo de templates futuro | Aprovação/rejeição da Meta é fato de provider; não é permissão suficiente para uma IA enviar. |

## O que não trazer

| Não migrar | Por quê |
|---|---|
| `WhatsAppAccount`, `Lead`, `Message` e controllers Mongoose | Misturam identidade, UI, sync e regra comercial; violam o contrato imutável e multi-tenant do Sales OS. |
| Descoberta Meta com fallback silencioso | O TX já tinha risco de selecionar Business/WABA/número errado; o novo fluxo precisa de escolha explícita. |
| Compatibilidade com assinatura legada | Um endpoint novo aceita apenas o contrato Meta atual; compatibilidade é superfície de ataque e deve ser isolada, se for inevitável. |
| Tokens em modelos/app env compartilhado | Referências de segredo ficam em `channel_connection_secrets`; resolução ocorre somente em runtime server-side. |
| Envio síncrono em controller | Impede idempotência, revalidação de kill switch e recuperação de falhas. Todo outbound vai por dispatch/outbox. |
| Flows Meta no P0/P1 | Flows são úteis para coleta estruturada, mas ampliam muito superfície de produto. Entram depois do golden path de handoff e resposta supervisionada. |
| Sincronização de chats como verdade do CRM | WAHA/Meta são canais; o histórico comercial canônico é o event store do Sales OS. |

## Contratos mínimos a criar

```ts
export interface MetaAssetDiscoveryPort {
  discover(input: { accessTokenReference: string }): Promise<{
    businesses: Array<{
      id: string;
      name: string;
      wabas: Array<{ id: string; name: string; phoneNumbers: Array<{ id: string; display: string }> }>;
    }>;
  }>;
}

export interface MetaCloudOutboundProvider {
  sendHumanApprovedReply(input: {
    channelConnectionId: string;
    recipientE164: string;
    text: string;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<{ providerMessageId: string; sentAt: Date }>;
}

export interface MetaWebhookVerifier {
  verify(input: { rawBody: Buffer; signatureHeader?: string; secretReferences: string[] }): Promise<boolean>;
}
```

`MetaCloudOutboundProvider` não recebe token em argumentos públicos e não deve
registrar telefone, texto ou credenciais nos logs.

## Ordem de entrega

1. **P0.4A:** controles de workspace/canal e handoff auditável. Nenhum outbound.
2. **P0.4B:** `PolicyEvaluator` determinístico, aprovação humana imutável e
   `OutboundDispatchWorker` genérico — ainda sem Meta real.
3. **P0.4C:** adapter WAHA de saída com conta de teste; provar kill switch antes
   e depois do claim.
4. **P0.5A:** adapter Meta somente para webhook assinado, CTWA e status de
   entrega, em sandbox/test WABA.
5. **P0.5B:** outbound Meta de texto humano aprovado; depois mídia e templates.
6. **P0.6+:** qualidade/limites da conta, catálogo de templates e Flows, se
   houver caso comercial real.

## Gates que não podem ser pulados

- A assinatura é validada no raw body antes de persistir qualquer evento.
- Um `provider_message_id` duplicado não cria nova mensagem nem nova jornada.
- A escolha de WABA e phone number é explícita e pertence ao workspace.
- `workspace.outbound_enabled` **e** `channel.outbound_enabled` são verdadeiros
  imediatamente antes de chamar o provider.
- Uma recomendação sem `action_approval` humana não cria dispatch.
- Falha de provider não expõe texto, telefone, token ou resposta bruta na API.
- Status de entrega é um evento imutável; não sobrescreve a mensagem original.

## Fontes auditadas no CRM TX

- `backend/src/services/metaCloudService.js`
- `backend/src/services/metaProviderClient.js`
- `backend/src/services/metaOnboardingDiscoveryService.js`
- `backend/src/utils/metaWebhookSignature.js`
- `backend/src/controllers/appControllers/whatsappController/governance.js`
- `backend/src/controllers/appControllers/whatsappController/messages.js`
