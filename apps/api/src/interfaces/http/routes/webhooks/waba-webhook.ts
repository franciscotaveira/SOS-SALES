import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import { dbPool } from '../../../../infrastructure/database/pool.js';
import { AttributionService } from '../../../../application/services/attribution-service.js';
import { PrivateReplyService } from '../../../../application/services/private-reply-service.js';
import {
  getReceptionistAgent,
  isMetaAgentReady,
  shouldSosSalesRespond,
  type ResponderMode,
  type ResponderOwner,
} from '../../../../application/agents/receptionist-agent.js';
import { handleMessengerEntry } from './messenger-webhook-handler.js';

/**
 * Tenta encontrar uma conexão de canal pelo phoneNumberId do webhook.
 * Retorna o objeto { id, workspace_id } se encontrado, ou null caso contrário.
 * Falha de banco é propagada para que a Meta possa repetir a entrega.
 */
export async function findChannelByPhoneNumberId(
  phoneNumberId: string | undefined,
  log: FastifyRequest['log'],
  query: typeof dbPool.query = dbPool.query,
): Promise<{ id: string | null; workspace_id: string | null } | null> {
  if (!phoneNumberId) {
    return null;
  }

  try {
    const chanRes = await query(
      `SELECT id, workspace_id
       FROM public.channel_connections
       WHERE provider = 'meta_cloud'
         AND status = 'CONNECTED'
         AND (
            (public_config->>'phoneNumberId') = $1 
         OR (public_config->>'phone_number_id') = $1
         OR (public_config->>'wabaPhoneNumberId') = $1
         OR phone_number = $1
         )
       ORDER BY created_at ASC
       LIMIT 2`,
      [phoneNumberId]
    );

    if (chanRes.rows.length === 1) {
      return {
        id: chanRes.rows[0].id,
        workspace_id: chanRes.rows[0].workspace_id
      };
    }

    if (chanRes.rows.length > 1) {
      log.warn({ ownerCount: chanRes.rows.length }, 'Ambiguous WABA channel ownership found. Rejecting to prevent cross-tenant leak.');
      return null;
    }
  } catch (err) {
    log.error({ err }, 'Error looking up channel connection for WABA webhook');
    throw err;
  }

  return null;
}

export interface WabaWebhookPluginOptions {
  verifyToken: string;
  appSecret: string;
  /** Deployment-owned pool; the global development pool is only a fallback. */
  databasePool?: Pick<Pool, 'query' | 'connect'>;
  /** Deployment-owned receptionist; avoids a browser/development singleton. */
  receptionistAgent?: { isEnabled(): boolean };
}

type WabaChannelInfo = { id: string | null; workspace_id: string | null };
type WabaStatusQuery = typeof dbPool.query;

export interface WabaResponderDefaults {
  responderMode: ResponderMode;
  responderOwner: ResponderOwner;
  metaAgentId: string | null;
  metaAgentChannelConnectionId: string | null;
  metaAgentEnabled: boolean;
  metaAgentEligibilityStatus: 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN';
  metaAgentCheckedAt: string | null;
  metaAgentActivationStatus: 'NOT_STARTED' | 'PENDING' | 'READY' | 'FAILED';
}

/**
 * Resolve the workspace responder policy on the server.  This is deliberately
 * independent from React state: inbound webhooks can arrive when no browser
 * is open, and a missing/failed lookup must never enable a second responder.
 */
export async function resolveWorkspaceResponderDefaults(
  workspaceId: string,
  channelConnectionIdOrQuery?: string | null | typeof dbPool.query,
  query: typeof dbPool.query = dbPool.query.bind(dbPool),
): Promise<WabaResponderDefaults> {
  // Preserve the original `(workspaceId, query)` helper contract used by
  // isolated tests and older callers while allowing the webhook to bind the
  // decision to the exact WABA connection that delivered the event.
  const channelConnectionId = typeof channelConnectionIdOrQuery === 'function'
    ? null
    : channelConnectionIdOrQuery ?? null;
  const queryFn = typeof channelConnectionIdOrQuery === 'function'
    ? channelConnectionIdOrQuery
    : query;
  const result = await queryFn(
    `SELECT responder_mode, meta_agent_id, meta_agent_enabled,
            meta_agent_eligibility_status, meta_agent_checked_at,
            meta_agent_activation_status, meta_agent_channel_connection_id
     FROM public.workspace_agent_config
     WHERE workspace_id = $1
     LIMIT 1`,
    [workspaceId],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  const responderMode: ResponderMode = row?.responder_mode === 'meta_business_agent'
    || row?.responder_mode === 'auto_fallback'
    || row?.responder_mode === 'manual'
    || row?.responder_mode === 'sos_sales'
    ? row.responder_mode
    : 'sos_sales';
  const metaAgentId = typeof row?.meta_agent_id === 'string' && row.meta_agent_id.trim()
    ? row.meta_agent_id.trim()
    : null;
  const metaAgentEnabled = row?.meta_agent_enabled === true;
  const metaAgentEligibilityStatus = row?.meta_agent_eligibility_status === 'ELIGIBLE'
    || row?.meta_agent_eligibility_status === 'INELIGIBLE'
    ? row.meta_agent_eligibility_status
    : 'UNKNOWN';
  const metaAgentCheckedAt = row?.meta_agent_checked_at instanceof Date
    ? row.meta_agent_checked_at.toISOString()
    : typeof row?.meta_agent_checked_at === 'string' && row.meta_agent_checked_at.trim()
      ? row.meta_agent_checked_at
      : null;
  const metaAgentActivationStatus = row?.meta_agent_activation_status === 'PENDING'
    || row?.meta_agent_activation_status === 'READY'
    || row?.meta_agent_activation_status === 'FAILED'
    ? row.meta_agent_activation_status
    : 'NOT_STARTED';
  const metaAgentChannelConnectionId = optionalString(row?.meta_agent_channel_connection_id);
  const metaChannelMatches = Boolean(channelConnectionId)
    && Boolean(metaAgentChannelConnectionId)
    && metaAgentChannelConnectionId === channelConnectionId;
  const metaReady = isMetaAgentReady({
    metaAgentEnabled: metaAgentEnabled && metaChannelMatches,
    metaAgentId,
    metaAgentChannelConnectionId: metaChannelMatches ? metaAgentChannelConnectionId : null,
    metaAgentEligibilityStatus,
    metaAgentCheckedAt,
    metaAgentActivationStatus,
  });
  const responderOwner: ResponderOwner = responderMode === 'manual'
    ? 'human'
    : (responderMode === 'meta_business_agent' || (responderMode === 'auto_fallback' && metaReady)) && metaReady
      ? 'meta_business_agent'
      : 'sos_sales';

  return {
    responderMode,
    responderOwner,
    metaAgentId,
    metaAgentChannelConnectionId,
    metaAgentEnabled: metaAgentEnabled && metaChannelMatches,
    metaAgentEligibilityStatus,
    metaAgentCheckedAt,
    metaAgentActivationStatus,
  };
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const WABA_HANDOVER_FIELDS = new Set([
  'messaging_handovers',
  'messaging_handover',
  'standby',
  'thread_control',
]);

export function isWabaHandoverField(field: unknown): boolean {
  return typeof field === 'string' && WABA_HANDOVER_FIELDS.has(field.trim().toLowerCase());
}

type HandoverOwner = ResponderOwner | null;

/**
 * Meta's handover payload has had more than one envelope shape.  We accept
 * only explicit owner/action values; unknown variants are still retained as a
 * receipt but never mutate a CRM journey.  This is safer than guessing which
 * app owns a thread from a free-form metadata string.
 */
export function inferWabaHandoverOwner(event: Record<string, unknown>): HandoverOwner {
  const explicitOwner = [event.owner, event.responder_owner, event.responderOwner]
    .map(optionalString)
    .find(Boolean)?.toLowerCase();
  if (explicitOwner === 'sos_sales' || explicitOwner === 'sos-sales') return 'sos_sales';
  if (explicitOwner === 'meta_business_agent' || explicitOwner === 'meta-business-agent' || explicitOwner === 'meta') return 'meta_business_agent';
  if (explicitOwner === 'human' || explicitOwner === 'operator') return 'human';

  const action = [event.action, event.handover_action, event.owner_action]
    .map(optionalString)
    .find(Boolean)?.toLowerCase();
  if (action === 'take') return 'sos_sales';
  if (action === 'release') return 'meta_business_agent';
  return null;
}

function handoverConsumerId(event: Record<string, unknown>): string | null {
  const candidate = [event.to, event.recipient, event.consumer, event.wa_id, event.phone_number]
    .map((value) => {
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object' && typeof (value as Record<string, unknown>).id === 'string') {
        return (value as Record<string, unknown>).id as string;
      }
      return null;
    })
    .find(Boolean);
  if (!candidate) return null;
  const digits = candidate.replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

function handoverEvents(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const nested = record.messaging_handovers ?? record.handover ?? record.handovers ?? record.standby;
  const candidates = Array.isArray(nested) ? nested : nested && typeof nested === 'object' ? [nested] : [record];
  return candidates.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
}

/**
 * Retain provider handover receipts and reconcile a journey only when Meta
 * tells us both (a) an explicit owner/action and (b) a concrete consumer.
 * Unrecognised payloads remain auditable in inbound_channel_events and do not
 * silently turn an unknown provider state into an active responder.
 */
export async function persistWabaHandover(
  params: {
    channelInfo: WabaChannelInfo;
    phoneNumberId: string;
    entryId: string | null;
    field: string;
    value: unknown;
  },
  log: FastifyRequest['log'],
  query: typeof dbPool.query = dbPool.query.bind(dbPool),
): Promise<{ receipts: number; journeysUpdated: number }> {
  if (!params.channelInfo.id || !params.channelInfo.workspace_id) {
    return { receipts: 0, journeysUpdated: 0 };
  }
  const events = handoverEvents(params.value);
  let receipts = 0;
  let journeysUpdated = 0;
  for (const [index, event] of events.entries()) {
    const eventKey = optionalString(event.id)
      || optionalString(event.event_id)
      || `${params.entryId || 'entry'}:${params.field}:${index}:${optionalString(event.timestamp) || 'na'}`;
    const providerEventId = `waba_handover_${eventKey}`;
    const rawPayload = JSON.stringify({
      entryId: params.entryId,
      phoneNumberId: params.phoneNumberId,
      field: params.field,
      event,
    });
    const inserted = await query(
      `INSERT INTO public.inbound_channel_events (
         id, workspace_id, channel_connection_id, provider, provider_event_id,
         event_type, raw_payload, received_at
       ) VALUES (
         gen_random_uuid(), $1, $2, 'meta_cloud', $3, $4, $5::jsonb, NOW()
       )
       ON CONFLICT (workspace_id, provider, provider_event_id) DO NOTHING
       RETURNING id`,
      [params.channelInfo.workspace_id, params.channelInfo.id, providerEventId, `waba.${params.field}`, rawPayload],
    );
    if ((inserted.rowCount ?? inserted.rows.length) === 0) continue;
    receipts += 1;

    const owner = inferWabaHandoverOwner(event);
    const consumerDigits = handoverConsumerId(event);
    if (!owner || !consumerDigits) continue;

    const updated = await query(
      `UPDATE public.commercial_journeys j
       SET responder_owner = $4,
           responder_changed_at = NOW(),
           responder_change_reason = $5,
           updated_at = NOW()
       FROM public.contacts c
       WHERE j.workspace_id = $1
         AND j.channel_connection_id = $2
         AND j.contact_id = c.id
         AND c.workspace_id = j.workspace_id
         AND j.status = 'OPEN'
         AND (
           regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g') = $3
           OR c.whatsapp_id IN ($3, $3 || '@c.us')
         )`,
      [params.channelInfo.workspace_id, params.channelInfo.id, consumerDigits, owner, `meta_webhook_${params.field}`],
    );
    journeysUpdated += updated.rowCount ?? 0;
  }
  if (receipts > 0) {
    log.info?.({
      channelConnectionId: params.channelInfo.id,
      field: params.field,
      receipts,
      journeysUpdated,
    }, 'WABA handover receipt persisted and ownership reconciled');
  }
  return { receipts, journeysUpdated };
}

/** Meta returns errors only for failed message statuses. Preserve them in the
 * immutable lifecycle event; never put the provider message id or error text in
 * an application log. */
export function extractWabaStatusError(statusObj: Record<string, unknown>): {
  code: string | null;
  message: string | null;
} {
  const errors = Array.isArray(statusObj.errors) ? statusObj.errors : [];
  const error = errors[0];
  if (!error || typeof error !== 'object') return { code: null, message: null };

  const candidate = error as Record<string, unknown>;
  const code = candidate.code === undefined || candidate.code === null
    ? null
    : String(candidate.code).trim() || null;
  const message = optionalString(candidate.message)
    || optionalString(candidate.title)
    || optionalString(candidate.error_user_msg);
  return { code, message };
}

function messageIdSuffix(messageId: string): string {
  return messageId.slice(-8);
}

/**
 * Persist a Meta lifecycle status. A status without a local message is not a
 * successful no-op: it is retained as an immutable unmatched webhook receipt
 * and logged with a redacted message-id suffix for operational reconciliation.
 */
export async function persistWabaStatus(
  params: {
    channelInfo: WabaChannelInfo;
    wabaMessageId: string;
    status: string;
    providerTimestamp: Date;
    statusObj: Record<string, unknown>;
  },
  log: FastifyRequest['log'],
  query: WabaStatusQuery = dbPool.query,
): Promise<{ correlated: boolean }> {
  const { channelInfo, wabaMessageId, status, providerTimestamp, statusObj } = params;
  if (!channelInfo.id || !channelInfo.workspace_id) {
    throw new Error('WABA status persistence requires a resolved channel and workspace');
  }

  const providerEventId = `waba_status_${wabaMessageId}_${status}_${String(statusObj.timestamp || 'unknown')}`;
  const providerError = extractWabaStatusError(statusObj);
  const persisted = await query(
    `INSERT INTO public.conversation_message_events (
       id, workspace_id, channel_connection_id, message_id,
       provider_event_id, status, provider_timestamp, error_code, error_message, raw_payload, created_at
     )
     SELECT gen_random_uuid(), m.workspace_id, m.channel_connection_id, m.id,
            $1, $2, $3, $4, $5, $6, NOW()
     FROM public.conversation_messages m
     WHERE m.provider_message_id = $7
       AND m.channel_connection_id = $8
     LIMIT 1
     ON CONFLICT (channel_connection_id, provider_event_id) DO NOTHING
     RETURNING id`,
    [
      providerEventId,
      status,
      providerTimestamp.toISOString(),
      providerError.code,
      providerError.message,
      JSON.stringify(statusObj),
      wabaMessageId,
      channelInfo.id,
    ],
  );

  if ((persisted.rowCount ?? persisted.rows.length) > 0) {
    return { correlated: true };
  }

  await query(
    `INSERT INTO public.inbound_channel_events (
       id, workspace_id, channel_connection_id, provider, provider_event_id, event_type, raw_payload, received_at
     ) VALUES (
       gen_random_uuid(), $1, $2, 'meta_cloud', $3, 'waba.status.unmatched', $4, NOW()
     ) ON CONFLICT (workspace_id, provider, provider_event_id) DO NOTHING`,
    [
      channelInfo.workspace_id,
      channelInfo.id,
      `waba_unmatched_status_${wabaMessageId}_${status}_${String(statusObj.timestamp || 'unknown')}`,
      JSON.stringify(statusObj),
    ],
  );
  log.warn(
    {
      channelConnectionId: channelInfo.id,
      status,
      providerMessageIdSuffix: messageIdSuffix(wabaMessageId),
      hasProviderError: Boolean(providerError.code || providerError.message),
      providerErrorCode: providerError.code,
    },
    'WABA status has no matching local outbound message; retained for reconciliation',
  );
  return { correlated: false };
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function verifyMetaSignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const providedSignature = signatureHeader.slice('sha256='.length);
  const computedSignature = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return safeCompare(providedSignature, computedSignature);
}

export const wabaWebhookPlugin: FastifyPluginAsync<WabaWebhookPluginOptions> = async (
  app: FastifyInstance,
  options: WabaWebhookPluginOptions
) => {
  const { verifyToken, appSecret } = options;
  const databasePool = options.databasePool ?? dbPool;
  const query = databasePool.query.bind(databasePool);
  const receptionistAgent = options.receptionistAgent ?? getReceptionistAgent();
  const privateReplyService = new PrivateReplyService(databasePool);
  const handleVerification = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token && safeCompare(token, verifyToken)) {
      return reply.status(200).send(challenge);
    }
    return reply.status(403).send('Forbidden');
  };

  /** 
   * 1. GET Webhook Verification (Meta Hub Challenge Handshake)
   */
  app.get('/api/v1/channels/waba/webhook', handleVerification);
  app.get('/webhooks/waba', handleVerification);

  /** 
   * 2. POST Webhook Events (Messages, Statuses, Referrals, Interactive Clicks)
   */
  const handleEvents = async (request: FastifyRequest, reply: FastifyReply) => {
    const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody;
    const signatureHeader = request.headers['x-hub-signature-256'] as string | undefined;

    request.log.info({
      hasRawBody: Boolean(rawBody),
      rawBodyLength: rawBody?.length,
      hasSignature: Boolean(signatureHeader),
    }, 'WABA webhook received');

    if (!rawBody || !verifyMetaSignature(rawBody, signatureHeader, appSecret)) {
      request.log.warn({ hasRawBody: Boolean(rawBody), hasSignature: Boolean(signatureHeader) }, 'WABA webhook signature verification failed');
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    const payload = request.body as any;

    // Messenger / Instagram DM share the same Meta webhook endpoint
    if (payload?.object === 'page' || payload?.object === 'instagram') {
      const platform = payload.object === 'page' ? 'messenger' : 'instagram';
      for (const entry of payload.entry || []) {
        try {
          await handleMessengerEntry(entry, platform, request.log, {
            databasePool,
            privateReplyService,
          });
        } catch (err) {
          request.log.error({ err, platform, entryId: entry?.id }, 'Messenger/Instagram entry processing failed');
          throw err;
        }
      }
      return reply.status(200).send({ status: 'ok', platform });
    }

    if (payload?.object !== 'whatsapp_business_account') {
      return reply.status(200).send({ status: 'ignored' });
    }

    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (isWabaHandoverField(change.field)) {
          const handoverValue = change.value;
          const phoneNumberId = handoverValue?.metadata?.phone_number_id
            || handoverValue?.metadata?.phoneNumberId
            || handoverValue?.phone_number_id
            || handoverValue?.phoneNumberId;
          const channelInfo = await findChannelByPhoneNumberId(phoneNumberId, request.log, query);
          if (!channelInfo) {
            request.log.warn({ field: change.field, phoneNumberId }, 'Unrecognized or ambiguous WABA handover ownership; receipt not persisted');
            continue;
          }
          await persistWabaHandover({
            channelInfo,
            phoneNumberId: String(phoneNumberId),
            entryId: typeof entry.id === 'string' ? entry.id : null,
            field: String(change.field),
            value: handoverValue,
          }, request.log, query);
          continue;
        }
        if (change.field !== 'messages') continue;
        const value = change.value;
        const metadata = value?.metadata;
        const phoneNumberId = metadata?.phone_number_id;
        const statuses = value?.statuses || [];
        const messages = value?.messages || [];
        const contacts = value?.contacts || [];
        const channelInfo = await findChannelByPhoneNumberId(phoneNumberId, request.log, query);

        if ((statuses.length > 0 || messages.length > 0) && !channelInfo) {
          request.log.warn(
            { phoneNumberId },
            'Unrecognized or ambiguous WABA phone number ownership - event ignored to prevent cross-tenant leakage'
          );
          continue;
        }
        if (!channelInfo) continue;
        const resolvedChannelInfo = channelInfo;

        // 1. Process Status Updates (sent, delivered, read, failed)
        for (const statusObj of statuses) {
          const wabaMessageId = statusObj.id;
          const statusStr = String(statusObj.status || '').toUpperCase();
          const validStatuses = ['SENT', 'DELIVERED', 'READ', 'FAILED', 'REVOKED'];
          if (!wabaMessageId || !validStatuses.includes(statusStr)) {
            request.log.warn({ status: statusStr }, 'Invalid WABA status event ignored');
            continue;
          }
          const status = statusStr;
          const providerTimestamp = statusObj.timestamp
            ? new Date(Number(statusObj.timestamp) * 1000)
            : new Date();
          try {
              await persistWabaStatus({
                channelInfo: resolvedChannelInfo,
                wabaMessageId,
                status,
                providerTimestamp,
                statusObj,
              }, request.log, query);
          } catch (err) {
            request.log.error({ err, status }, 'Failed to persist WABA message status');
            throw err;
          }
        }

        // 2. Process Inbound Messages
        for (const message of messages) {
          const messageId = message.id;
          if (!messageId || typeof message.from !== 'string') {
            request.log.warn({ hasMessageId: Boolean(messageId) }, 'Malformed WABA message ignored');
            continue;
          }

          const fromPhone = `+${message.from.replace(/\D/g, '')}`;
          const contactObj = contacts.find((c: any) => c.wa_id === message.from);
          const pushName = contactObj?.profile?.name || fromPhone;
          const timestamp = new Date(Number(message.timestamp) * 1000).toISOString();

          // Extract text and interaction
          let textContent = '';
          let mediaType: string | null = null;
          let mediaUrl: string | null = null;

          if (message.type === 'text') {
            textContent = message.text?.body || '';
          } else if (message.type === 'interactive') {
            if (message.interactive?.type === 'button_reply') {
              textContent = `[Botão] ${message.interactive.button_reply?.title || ''}`;
            } else if (message.interactive?.type === 'list_reply') {
              textContent = `[Menu] ${message.interactive.list_reply?.title || ''}`;
            }
          } else if (message.type === 'image') {
            mediaType = 'image';
            textContent = message.image?.caption ? `📷 [Imagem] ${message.image.caption}` : '📷 [Imagem]';
          } else if (message.type === 'audio') {
            mediaType = 'audio';
            textContent = message.audio?.voice ? '🎤 [Áudio / Mensagem de Voz]' : '🎵 [Arquivo de Áudio]';
          } else if (message.type === 'document') {
            mediaType = 'document';
            textContent = `📄 [Documento] ${message.document?.filename || 'Arquivo'}`;
          } else if (message.type === 'video') {
            mediaType = 'video';
            textContent = message.video?.caption ? `🎥 [Vídeo] ${message.video.caption}` : '🎥 [Vídeo]';
          }

          // CTWA Referral extraction (Click to WhatsApp Ads)
          const referral = message.referral;
          const adId = referral?.ad_id;
          const sourceId = referral?.source_id;
          const headline = referral?.headline;

          const rawWorkspaceId: string | null = resolvedChannelInfo.workspace_id ?? null;
          if (!rawWorkspaceId) {
            request.log.warn({ phoneNumberId }, 'Channel without workspace_id in WABA webhook - ignored');
            continue;
          }
          const targetWorkspaceId: string = rawWorkspaceId;
          const channelConnectionId = resolvedChannelInfo.id;
          let journeyId: string | null = null;
          let contactId: string | null = null;

          // Resolve once for this inbound event. If the config read fails we
          // still persist the customer message, but do not enqueue any
          // autonomous responder; the worker also re-checks this policy.
          let responderDefaults: WabaResponderDefaults | null = null;
          try {
            responderDefaults = await resolveWorkspaceResponderDefaults(targetWorkspaceId, channelConnectionId, query);
          } catch (responderErr) {
            request.log.error(
              { err: responderErr, workspaceId: targetWorkspaceId },
              'Could not resolve WABA responder ownership; automatic reply suppressed',
            );
          }

          if (!channelConnectionId) {
            request.log.warn({ phoneNumberId }, 'WABA owner has no channel connection id - event ignored');
            continue;
          }

          // Ingest contact and journey
          try {
            // Upsert contact
            const contactRes = await query(
              `INSERT INTO public.contacts (id, workspace_id, phone, whatsapp_id, name, created_at, updated_at)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $5)
               ON CONFLICT (workspace_id, phone)
               DO UPDATE SET name = COALESCE(EXCLUDED.name, contacts.name), updated_at = $5
               RETURNING id`,
              [targetWorkspaceId, fromPhone, `${fromPhone.replace(/\D/g, '')}@c.us`, pushName, timestamp]
            );
            contactId = contactRes.rows[0].id as string;

            // Find or create commercial journey
            const existingJourney = await query(
              `SELECT id, responder_owner, responder_changed_at, responder_change_reason, channel_connection_id
               FROM public.commercial_journeys
               WHERE workspace_id = $1
                 AND contact_id = $2
                 AND status = 'OPEN'
                 AND (channel_connection_id = $3 OR channel_connection_id IS NULL)
               ORDER BY (channel_connection_id = $3) DESC, updated_at DESC
               LIMIT 1`,
              [targetWorkspaceId, contactId, channelConnectionId]
            );

            let journeyResponderOwner: ResponderOwner;
            let journeyResponderChangedAt: string | Date | null = null;
            let journeyResponderChangeReason: string | null = null;
            if (existingJourney.rowCount && existingJourney.rowCount > 0) {
              journeyId = existingJourney.rows[0].id;
              journeyResponderOwner = existingJourney.rows[0].responder_owner === 'meta_business_agent'
                || existingJourney.rows[0].responder_owner === 'human'
                ? existingJourney.rows[0].responder_owner
                : 'sos_sales';
              journeyResponderChangedAt = existingJourney.rows[0].responder_changed_at || null;
              journeyResponderChangeReason = optionalString(existingJourney.rows[0].responder_change_reason);
              await query(
                `UPDATE public.commercial_journeys
                 SET channel_connection_id = COALESCE(channel_connection_id, $1), updated_at = $2
                 WHERE id = $3`,
                [channelConnectionId, timestamp, journeyId]
              );
            } else {
              journeyResponderOwner = responderDefaults?.responderOwner || 'sos_sales';
              const newJourney = await query(
                `INSERT INTO public.commercial_journeys (
                   id, workspace_id, contact_id, channel_connection_id, status, pipeline_stage,
                   total_revenue_minor, currency, responder_owner, started_at, created_at, updated_at
                 )
                 VALUES (
                   gen_random_uuid(), $1, $2, $3, 'OPEN', 'NEW', 0, 'BRL', $4, $5, $5, $5
                 )
                 ON CONFLICT DO NOTHING
                 RETURNING id`,
                [targetWorkspaceId, contactId, channelConnectionId, journeyResponderOwner, timestamp]
              );
              if (newJourney.rows[0]?.id) {
                journeyId = newJourney.rows[0].id;
              } else {
                const racedJourney = await query(
                  `SELECT id, responder_owner, responder_changed_at, responder_change_reason
                   FROM public.commercial_journeys
                   WHERE workspace_id = $1
                     AND contact_id = $2
                     AND channel_connection_id = $3
                     AND status = 'OPEN'
                   LIMIT 1`,
                  [targetWorkspaceId, contactId, channelConnectionId],
                );
                if (!racedJourney.rows[0]?.id) {
                  throw new Error('Could not create or resolve the Meta journey for the selected channel');
                }
                journeyId = racedJourney.rows[0].id;
                journeyResponderOwner = racedJourney.rows[0].responder_owner === 'meta_business_agent'
                  || racedJourney.rows[0].responder_owner === 'human'
                  ? racedJourney.rows[0].responder_owner
                  : 'sos_sales';
                journeyResponderChangedAt = racedJourney.rows[0].responder_changed_at || null;
                journeyResponderChangeReason = optionalString(racedJourney.rows[0].responder_change_reason);
              }
            }

            // Extract and persist Meta Ads CTWA & UTM attribution
            try {
              const client = await databasePool.connect();
              try {
                const chCfgRes = await client.query('SELECT public_config FROM public.channel_connections WHERE id = $1', [channelConnectionId]);
                const pubCfg = chCfgRes.rows[0]?.public_config || {};
                const campaigns = Array.isArray(pubCfg?.campaignMappings)
                  ? pubCfg.campaignMappings
                  : Array.isArray(pubCfg?.trackingConfig?.campaigns)
                    ? pubCfg.trackingConfig.campaigns
                    : [];

                const existingAcq = await client.query('SELECT id FROM public.acquisition_contexts WHERE workspace_id = $1 AND journey_id = $2 LIMIT 1', [targetWorkspaceId, journeyId]);
                if (existingAcq.rowCount === 0) {
                  const attr = AttributionService.extractAttribution(textContent, { referral, adId, headline, sourceId }, campaigns);
                  if (attr && journeyId) {
                    await AttributionService.persistAttribution(client, targetWorkspaceId, journeyId, attr, new Date(timestamp));
                  }
                }
              } finally {
                client.release();
              }
            } catch (acqErr) {
              console.warn('Erro ao processar atribuição WABA:', acqErr);
            }

            // Save referral facts if present
            if (adId || headline) {
              await query(
                `INSERT INTO public.known_facts (id, workspace_id, journey_id, key, value, confidence, confirmed_by_customer, source, observed_at)
                 VALUES (gen_random_uuid(), $1, $2, 'ad.referral', $3, 1.0, true, 'ad_payload', NOW())
                 ON CONFLICT DO NOTHING`,
                [targetWorkspaceId, journeyId, JSON.stringify({ adId, sourceId, headline })]
              );
            }

            // Insert conversation message + durable AI Receptionist enqueue in a
            // single service-role transaction (QA-P0 §4.1). Replaces the
            // non-recoverable setImmediate() fire-and-forget trigger: the message
            // id is captured with RETURNING and, only when the row is freshly
            // inserted and the receptionist is eligible, a durable
            // 'receptionist.inbound_received' outbox row is enqueued in the SAME tx
            // so a leased/fenced worker can drive the agent recoverably.
            const receptionistEligible =
              receptionistAgent.isEnabled() &&
              !!textContent &&
              message.type === 'text' &&
              !!journeyId &&
              !!contactId &&
              !!channelConnectionId &&
              !!responderDefaults &&
              shouldSosSalesRespond({
                responderMode: responderDefaults?.responderMode || 'sos_sales',
                responderOwner: journeyResponderOwner,
                responderChangedAt: journeyResponderChangedAt,
                responderChangeReason: journeyResponderChangeReason,
                metaAgentEnabled: responderDefaults?.metaAgentEnabled === true,
                metaAgentId: responderDefaults?.metaAgentId,
                metaAgentChannelConnectionId: responderDefaults?.metaAgentChannelConnectionId,
                metaAgentEligibilityStatus: responderDefaults?.metaAgentEligibilityStatus || 'UNKNOWN',
                metaAgentCheckedAt: responderDefaults?.metaAgentCheckedAt,
                metaAgentActivationStatus: responderDefaults?.metaAgentActivationStatus || undefined,
              });

            const ingestClient = await databasePool.connect();
            try {
              await ingestClient.query('BEGIN');
              await ingestClient.query('SET LOCAL ROLE service_role');
              await ingestClient.query(
                "SELECT set_config('request.jwt.claim.role', 'service_role', true)"
              );

              const insertedMessage = await ingestClient.query<{ id: string }>(
                `INSERT INTO public.conversation_messages (
                   id, workspace_id, channel_connection_id, journey_id, contact_id,
                   direction, sender_type, provider_message_id, text_content, media_payload, sent_at
                 )
                 VALUES (
                   gen_random_uuid(), $1, $2, $3, $4, 'inbound', 'customer', $5, $6, $7, $8
                 )
                 ON CONFLICT (channel_connection_id, provider_message_id) DO NOTHING
                 RETURNING id`,
                [
                  targetWorkspaceId,
                  channelConnectionId,
                  journeyId,
                  contactId,
                  messageId,
                  textContent,
                  JSON.stringify({
                    wabaMessageId: messageId,
                    mediaType,
                    mediaUrl,
                    referral,
                    wabaEngine: 'meta_cloud_api_v20',
                  }),
                  timestamp,
                ]
              );

              const conversationMessageId = insertedMessage.rows[0]?.id;

              // ON CONFLICT DO NOTHING → empty RETURNING on duplicate delivery,
              // so we only enqueue the receptionist trigger for a fresh message.
              if (conversationMessageId && receptionistEligible) {
                await ingestClient.query(
                  `SELECT public.enqueue_receptionist_inbound(
                     $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
                   )`,
                  [
                    conversationMessageId,
                    targetWorkspaceId,
                    journeyId,
                    contactId,
                    channelConnectionId,
                    fromPhone,
                    pushName,
                    textContent,
                    message.type,
                    phoneNumberId,
                  ]
                );
              }

              await ingestClient.query('COMMIT');
            } catch (txErr) {
              await ingestClient.query('ROLLBACK').catch(() => {});
              throw txErr;
            } finally {
              await ingestClient.query('RESET ROLE').catch(() => {});
              await ingestClient
                .query("SELECT set_config('request.jwt.claim.role', '', true)")
                .catch(() => {});
              ingestClient.release();
            }
          } catch (err) {
            request.log.error({ err, messageId }, 'Failed to persist WABA inbound message');
            throw err;
          }
        }
      }
    }

    return reply.status(200).send({ status: 'ok' });
  };

  app.post('/api/v1/channels/waba/webhook', handleEvents);
  app.post('/webhooks/waba', handleEvents);
};
