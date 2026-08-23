/**
 * Messenger & Instagram DM Webhook Handler
 *
 * Processes webhook events from Meta for:
 * - Messenger Platform (object: 'page')
 * - Instagram Messaging (object: 'instagram')
 *
 * Event types handled:
 * - messaging (text, attachments, postbacks, quick_replies)
 * - messaging_postbacks (Get Started, persistent menu)
 * - messaging_referrals (m.me links, ads, QR codes)
 * - messaging_handovers (HOP transitions)
 * - feed (comment webhooks for Private Replies)
 * - NLP entity extraction (wit.ai)
 *
 * Normalizes all events into the SOS-SALES conversation_messages schema
 * with cross-channel identity merge via PSID/IGSID → contact.
 */

import { dbPool } from '../../../../infrastructure/database/pool.js';
import { AttributionService } from '../../../../application/services/attribution-service.js';
import { IdempotencyGate } from '../../../../infrastructure/cache/idempotency-gate.js';
import type { FastifyBaseLogger } from 'fastify';

const idempotencyGate = IdempotencyGate.getInstance();

export interface MessengerWebhookEntry {
  id: string; // Page ID or IG User ID
  time: number;
  messaging?: MessengerWebhookEvent[];
  changes?: Array<{ field: string; value: any }>;
}

export interface MessengerWebhookEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    attachments?: Array<{
      type: 'image' | 'audio' | 'video' | 'file' | 'fallback' | 'template' | 'story_mention';
      payload?: { url?: string; sticker_id?: number; title?: string };
    }>;
    quick_reply?: { payload: string };
    reply_to?: { mid: string };
    nlp?: {
      entities?: Record<string, Array<{ value: any; confidence: number }>>;
      traits?: Record<string, Array<{ value: any; confidence: number }>>;
    };
    is_echo?: boolean;
    referral?: MessengerReferral;
  };
  postback?: {
    title: string;
    payload: string;
    referral?: MessengerReferral;
  };
  referral?: MessengerReferral;
  pass_thread_control?: {
    new_owner_app_id: string;
    metadata?: string;
  };
  take_thread_control?: {
    previous_owner_app_id: string;
    metadata?: string;
  };
  read?: { watermark: number };
  delivery?: { watermark: number; mids?: string[] };
}

export interface MessengerReferral {
  ref?: string;
  source?: 'MESSENGER_CODE' | 'DISCOVER_TAB' | 'ADS' | 'SHORTLINK' | 'CUSTOMER_CHAT_PLUGIN';
  type?: 'OPEN_THREAD';
  ad_id?: string;
  ads_context_data?: {
    ad_title?: string;
    photo_url?: string;
    video_url?: string;
  };
}

export type Platform = 'messenger' | 'instagram';

/**
 * Process a single Messenger/IG webhook entry.
 * Called from waba-webhook.ts when payload.object === 'page' or 'instagram'.
 */
export async function handleMessengerEntry(
  entry: MessengerWebhookEntry,
  platform: Platform,
  log: FastifyBaseLogger
): Promise<void> {
  const pageOrIgId = entry.id;
  const events = entry.messaging || [];

  for (const event of events) {
    // Skip delivery receipts and read receipts (not actionable messages)
    if (event.delivery || event.read) continue;

    // Skip echo messages (sent by us)
    if (event.message?.is_echo) continue;

    const senderId = event.sender.id;
    const recipientId = event.recipient.id;
    const timestamp = new Date(event.timestamp).toISOString();

    // Idempotency: deduplicate by mid or postback
    const dedupeKey = event.message?.mid
      || `postback:${senderId}:${event.postback?.payload}:${event.timestamp}`
      || `referral:${senderId}:${event.timestamp}`;

    const isDup = await idempotencyGate.isDuplicate(`${platform}:msg:${dedupeKey}`, 180);
    if (isDup) {
      log.info({ dedupeKey, platform }, 'Duplicate Messenger/IG webhook event ignored');
      continue;
    }

    try {
      // Resolve workspace from channel connection by pageId/igUserId
      const { workspaceId, channelConnectionId } = await resolveWorkspace(pageOrIgId, platform);
      if (!workspaceId) {
        log.warn({ pageOrIgId, platform }, 'No workspace found for Messenger/IG webhook entry');
        continue;
      }

      // Upsert contact by PSID/IGSID
      const contactId = await upsertContact(workspaceId, senderId, platform, timestamp);

      // Find or create journey
      const journeyId = await findOrCreateJourney(workspaceId, contactId, channelConnectionId, timestamp);

      // Process referral attribution (from ads, m.me links, etc.)
      await processReferral(workspaceId, journeyId, channelConnectionId, event, platform, log);

      // Extract and save message content
      const { textContent, mediaType, mediaPayload } = extractMessageContent(event, platform);

      // Process NLP entities if present
      if (event.message?.nlp) {
        await processNlpEntities(workspaceId, journeyId, event.message.mid, event.message.nlp, log);
      }

      // Save conversation message
      if (textContent || mediaType) {
        await dbPool.query(
          `INSERT INTO public.conversation_messages (
             id, workspace_id, channel_connection_id, journey_id, contact_id,
             direction, sender_type, provider_message_id, text_content, media_payload, sent_at
           )
           VALUES (
             gen_random_uuid(), $1, $2, $3, $4, 'inbound', 'customer', $5, $6, $7, $8
           )
           ON CONFLICT (channel_connection_id, provider_message_id) DO NOTHING`,
          [
            workspaceId,
            channelConnectionId,
            journeyId,
            contactId,
            event.message?.mid || `${platform}_${senderId}_${event.timestamp}`,
            textContent,
            JSON.stringify({
              platform,
              senderId,
              recipientId,
              mediaType,
              ...mediaPayload,
              nlp: event.message?.nlp ? true : undefined,
              postback: event.postback ? { title: event.postback.title, payload: event.postback.payload } : undefined,
              engine: platform === 'messenger' ? 'META_MESSENGER' : 'META_INSTAGRAM_DM',
            }),
            timestamp,
          ]
        );
      }

      // Process Handover Protocol events
      if (event.pass_thread_control) {
        log.info({
          platform,
          senderId,
          newOwner: event.pass_thread_control.new_owner_app_id,
          metadata: event.pass_thread_control.metadata,
        }, 'Handover Protocol: pass_thread_control');
      }

      if (event.take_thread_control) {
        log.info({
          platform,
          senderId,
          previousOwner: event.take_thread_control.previous_owner_app_id,
          metadata: event.take_thread_control.metadata,
        }, 'Handover Protocol: take_thread_control');
      }
    } catch (err) {
      log.error({ err, senderId, platform, pageOrIgId }, 'Error processing Messenger/IG webhook event');
    }
  }

  // Process feed changes (comments for Private Replies)
  const changes = entry.changes || [];
  for (const change of changes) {
    if (change.field === 'feed' && change.value?.item === 'comment') {
      await processCommentForPrivateReply(pageOrIgId, change.value, log);
    }
  }
}

// ─── Workspace Resolution ────────────────────────────────────────

export async function resolveWorkspace(
  pageOrIgId: string,
  platform: Platform,
  query: typeof dbPool.query = dbPool.query,
): Promise<{ workspaceId: string | null; channelConnectionId: string | null }> {
  // Look up by pageId/igUserId stored in public_config
  const configKey = platform === 'messenger' ? 'pageId' : 'igUserId';
  const providerType = platform === 'messenger' ? 'messenger' : 'instagram_dm';

  const res = await query(
    `SELECT
       workspace_id,
       (array_agg(id ORDER BY (status = 'CONNECTED') DESC, created_at DESC))[1] AS id
     FROM public.channel_connections
     WHERE (
       (public_config->>'${configKey}') = $1
       OR (public_config->>'pageId') = $1
     )
     AND provider IN ($2, 'meta_cloud')
     GROUP BY workspace_id
     LIMIT 2`,
    [pageOrIgId, providerType]
  );

  if (res.rows.length === 1) {
    return {
      workspaceId: res.rows[0].workspace_id,
      channelConnectionId: res.rows[0].id,
    };
  }

  // Tenant isolation: no global fallback. An unmapped pageId/igUserId must be
  // rejected, never routed into an arbitrary workspace.
  return { workspaceId: null, channelConnectionId: null };
}

// ─── Contact Upsert ──────────────────────────────────────────────

async function upsertContact(
  workspaceId: string,
  senderId: string,
  platform: Platform,
  timestamp: string
): Promise<string> {
  const idColumn = platform === 'messenger' ? 'messenger_psid' : 'instagram_igsid';
  const phonePlaceholder = `${platform}:${senderId}`; // Non-phone identifier

  // Try to find existing contact by PSID/IGSID
  const existing = await dbPool.query(
    `SELECT id FROM public.contacts WHERE workspace_id = $1 AND ${idColumn} = $2 LIMIT 1`,
    [workspaceId, senderId]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  // Check if contact exists by pseudo-phone (messenger:xxx or instagram:xxx)
  const byPhone = await dbPool.query(
    `SELECT id FROM public.contacts WHERE workspace_id = $1 AND phone = $2 LIMIT 1`,
    [workspaceId, phonePlaceholder]
  );

  if (byPhone.rows.length > 0) {
    // Update with PSID/IGSID
    await dbPool.query(
      `UPDATE public.contacts SET ${idColumn} = $1, updated_at = $2 WHERE id = $3`,
      [senderId, timestamp, byPhone.rows[0].id]
    );
    return byPhone.rows[0].id;
  }

  // Create new contact
  const newContact = await dbPool.query(
    `INSERT INTO public.contacts (id, workspace_id, phone, ${idColumn}, name, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $5)
     ON CONFLICT (workspace_id, phone) DO UPDATE SET ${idColumn} = EXCLUDED.${idColumn}, updated_at = $5
     RETURNING id`,
    [workspaceId, phonePlaceholder, senderId, `${platform === 'messenger' ? 'Messenger' : 'Instagram'} User`, timestamp]
  );

  return newContact.rows[0].id;
}

// ─── Journey Management ──────────────────────────────────────────

async function findOrCreateJourney(
  workspaceId: string,
  contactId: string,
  channelConnectionId: string | null,
  timestamp: string
): Promise<string> {
  const existing = await dbPool.query(
    `SELECT id FROM public.commercial_journeys
     WHERE workspace_id = $1 AND contact_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [workspaceId, contactId]
  );

  if (existing.rows.length > 0) {
    await dbPool.query(
      `UPDATE public.commercial_journeys SET updated_at = $1 WHERE id = $2`,
      [timestamp, existing.rows[0].id]
    );
    return existing.rows[0].id;
  }

  const newJourney = await dbPool.query(
    `INSERT INTO public.commercial_journeys (
       id, workspace_id, contact_id, channel_connection_id, status, pipeline_stage,
       total_revenue_minor, currency, started_at, created_at, updated_at
     )
     VALUES (
       gen_random_uuid(), $1, $2, $3, 'OPEN', 'NEW', 0, 'BRL', $4, $4, $4
     )
     RETURNING id`,
    [workspaceId, contactId, channelConnectionId, timestamp]
  );

  return newJourney.rows[0].id;
}

// ─── Referral & Attribution ──────────────────────────────────────

async function processReferral(
  workspaceId: string,
  journeyId: string,
  channelConnectionId: string | null,
  event: MessengerWebhookEvent,
  platform: Platform,
  log: FastifyBaseLogger
): Promise<void> {
  const referral = event.referral || event.postback?.referral || event.message?.referral;
  if (!referral) return;

  try {
    const client = await dbPool.connect();
    try {
      // Check if attribution already exists
      const existingAcq = await client.query(
        `SELECT id FROM public.acquisition_contexts WHERE workspace_id = $1 AND journey_id = $2 LIMIT 1`,
        [workspaceId, journeyId]
      );

      if (existingAcq.rowCount === 0) {
        const chCfgRes = channelConnectionId
          ? await client.query('SELECT public_config FROM public.channel_connections WHERE id = $1', [channelConnectionId])
          : { rows: [] };
        const campaigns = chCfgRes.rows[0]?.public_config?.trackingConfig?.campaigns || [];

        // Transform Messenger referral to the format AttributionService expects
        const adaptedReferral = {
          referral: {
            source_id: referral.ad_id,
            headline: referral.ads_context_data?.ad_title || referral.ref,
            source_url: undefined,
            ctwa_clid: undefined,
            source_type: referral.source || 'MESSENGER',
          },
          adId: referral.ad_id,
          headline: referral.ads_context_data?.ad_title || referral.ref,
          sourceId: referral.ad_id,
        };

        const attr = AttributionService.extractAttribution(
          referral.ref || '',
          adaptedReferral,
          campaigns
        );

        if (attr) {
          await AttributionService.persistAttribution(client, workspaceId, journeyId, attr, new Date());
        }
      }

      // Save referral as known_fact
      if (referral.ref || referral.ad_id) {
        await client.query(
          `INSERT INTO public.known_facts (id, workspace_id, journey_id, key, value, confidence, confirmed_by_customer, source, observed_at)
           VALUES (gen_random_uuid(), $1, $2, 'ad.referral', $3, 1.0, true, $4, NOW())
           ON CONFLICT DO NOTHING`,
          [
            workspaceId,
            journeyId,
            JSON.stringify({
              ref: referral.ref,
              source: referral.source,
              adId: referral.ad_id,
              adTitle: referral.ads_context_data?.ad_title,
              platform,
            }),
            `${platform}_referral`,
          ]
        );
      }
    } finally {
      client.release();
    }
  } catch (err) {
    log.warn({ err, platform }, 'Error processing Messenger/IG referral attribution');
  }
}

// ─── Message Content Extraction ──────────────────────────────────

function extractMessageContent(event: MessengerWebhookEvent, platform: Platform): {
  textContent: string;
  mediaType: string | null;
  mediaPayload: Record<string, unknown>;
} {
  let textContent = '';
  let mediaType: string | null = null;
  const mediaPayload: Record<string, unknown> = {};

  // Text message
  if (event.message?.text) {
    textContent = event.message.text;
  }

  // Quick reply
  if (event.message?.quick_reply) {
    textContent = textContent || `[Quick Reply] ${event.message.quick_reply.payload}`;
    mediaPayload.quickReplyPayload = event.message.quick_reply.payload;
  }

  // Postback (Get Started, persistent menu, etc.)
  if (event.postback) {
    textContent = `[${event.postback.title}] ${event.postback.payload}`;
    mediaPayload.postbackPayload = event.postback.payload;
    mediaPayload.postbackTitle = event.postback.title;
  }

  // Attachments
  if (event.message?.attachments && event.message.attachments.length > 0) {
    const attachment = event.message.attachments[0];
    mediaType = attachment.type;

    switch (attachment.type) {
      case 'image':
        textContent = textContent || '📷 [Imagem]';
        mediaPayload.mediaUrl = attachment.payload?.url;
        break;
      case 'audio':
        textContent = textContent || '🎤 [Áudio]';
        mediaPayload.mediaUrl = attachment.payload?.url;
        break;
      case 'video':
        textContent = textContent || '🎥 [Vídeo]';
        mediaPayload.mediaUrl = attachment.payload?.url;
        break;
      case 'file':
        textContent = textContent || '📄 [Arquivo]';
        mediaPayload.mediaUrl = attachment.payload?.url;
        break;
      case 'story_mention':
        textContent = textContent || '📖 [Story Mention]';
        mediaPayload.mediaUrl = attachment.payload?.url;
        mediaType = 'story_mention';
        break;
      case 'fallback':
        textContent = textContent || `[${attachment.payload?.title || 'Conteúdo compartilhado'}]`;
        mediaPayload.fallbackTitle = attachment.payload?.title;
        break;
    }
  }

  // Referral without message
  if (!textContent && event.referral) {
    textContent = event.referral.ref
      ? `[Referral: ${event.referral.ref}]`
      : `[Entrada via ${event.referral.source || platform}]`;
  }

  return { textContent, mediaType, mediaPayload };
}

// ─── NLP Entity Processing ───────────────────────────────────────

async function processNlpEntities(
  workspaceId: string,
  journeyId: string,
  messageId: string | undefined,
  nlp: NonNullable<MessengerWebhookEvent['message']>['nlp'],
  log: FastifyBaseLogger
): Promise<void> {
  if (!nlp) return;

  const entities = nlp.entities || {};
  const traits = nlp.traits || {};

  const allEntities: Array<{ type: string; value: any; confidence: number }> = [];

  // Process entities (datetime, money, phone, email, location)
  for (const [entityType, values] of Object.entries(entities)) {
    for (const item of values) {
      if (item.confidence >= 0.7) {
        allEntities.push({
          type: entityType,
          value: item.value,
          confidence: item.confidence,
        });
      }
    }
  }

  // Process traits (sentiment, greetings, bye, thanks)
  for (const [traitType, values] of Object.entries(traits)) {
    for (const item of values) {
      if (item.confidence >= 0.7) {
        allEntities.push({
          type: traitType,
          value: item.value,
          confidence: item.confidence,
        });
      }
    }
  }

  if (allEntities.length === 0) return;

  try {
    // Batch insert NLP entities
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIdx = 1;

    for (const entity of allEntities) {
      placeholders.push(
        `(gen_random_uuid(), $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`
      );
      values.push(workspaceId, journeyId, messageId || null, entity.type, JSON.stringify(entity.value), entity.confidence);
    }

    await dbPool.query(
      `INSERT INTO public.nlp_extracted_entities (id, workspace_id, journey_id, message_id, entity_type, entity_value, confidence)
       VALUES ${placeholders.join(', ')}`,
      values
    );

    // Persist key entities as known_facts for immediate use
    for (const entity of allEntities) {
      let factKey: string | null = null;
      let factValue: string | null = null;

      if (entity.type === 'wit$datetime' || entity.type.includes('datetime')) {
        factKey = 'customer.next_available';
        factValue = typeof entity.value === 'string' ? entity.value : JSON.stringify(entity.value);
      } else if (entity.type === 'wit$amount_of_money' || entity.type.includes('amount')) {
        factKey = 'customer.budget_declared';
        factValue = typeof entity.value === 'object' ? `${entity.value.value} ${entity.value.unit || 'BRL'}` : String(entity.value);
      } else if (entity.type === 'wit$sentiment' || entity.type.includes('sentiment')) {
        factKey = 'customer.sentiment_latest';
        factValue = String(entity.value);
      } else if (entity.type === 'wit$phone_number' || entity.type.includes('phone')) {
        factKey = 'customer.phone_declared';
        factValue = String(entity.value);
      } else if (entity.type === 'wit$email' || entity.type.includes('email')) {
        factKey = 'customer.email_declared';
        factValue = String(entity.value);
      }

      if (factKey && factValue) {
        await dbPool.query(
          `INSERT INTO public.known_facts (id, workspace_id, journey_id, key, value, confidence, confirmed_by_customer, source, observed_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, false, 'nlp_wit_ai', NOW())
           ON CONFLICT (workspace_id, journey_id, key) DO UPDATE SET value = EXCLUDED.value, confidence = EXCLUDED.confidence, observed_at = NOW()`,
          [workspaceId, journeyId, factKey, factValue, entity.confidence]
        );
      }
    }
  } catch (err) {
    log.warn({ err, workspaceId, journeyId }, 'Error persisting NLP entities');
  }
}

// ─── Comment Processing for Private Replies ──────────────────────

async function processCommentForPrivateReply(
  pageId: string,
  commentValue: any,
  log: FastifyBaseLogger
): Promise<void> {
  const commentId = commentValue?.comment_id;
  const message = commentValue?.message;
  const from = commentValue?.from;
  const postId = commentValue?.post_id;

  if (!commentId || !message || !from) return;

  log.info({
    pageId,
    commentId,
    postId,
    fromId: from.id,
    fromName: from.name,
    message: message.substring(0, 100),
  }, 'Facebook comment received for potential Private Reply');

  try {
    // Find workspace by pageId
    const { workspaceId, channelConnectionId } = await resolveWorkspace(pageId, 'messenger');
    if (!workspaceId || !channelConnectionId) return;

    // Check if Private Reply keywords are configured
    const configRes = await dbPool.query(
      `SELECT public_config FROM public.channel_connections WHERE id = $1`,
      [channelConnectionId]
    );
    const config = configRes.rows[0]?.public_config || {};
    const privateReplyConfig = config.privateReplyConfig;

    if (!privateReplyConfig?.enabled) return;

    const keywords: string[] = privateReplyConfig.keywords || [];
    const lowerMessage = message.toLowerCase();

    const matchesKeyword = keywords.some((kw: string) => lowerMessage.includes(kw.toLowerCase()));
    if (!matchesKeyword) return;

    // Save comment as known_fact for context
    const senderId = from.id;
    const contactId = await upsertContact(workspaceId, senderId, 'messenger', new Date().toISOString());
    const journeyId = await findOrCreateJourney(workspaceId, contactId, channelConnectionId, new Date().toISOString());

    await dbPool.query(
      `INSERT INTO public.known_facts (id, workspace_id, journey_id, key, value, confidence, confirmed_by_customer, source, observed_at)
       VALUES (gen_random_uuid(), $1, $2, 'comment.trigger', $3, 1.0, true, 'facebook_comment', NOW())
       ON CONFLICT DO NOTHING`,
      [workspaceId, journeyId, JSON.stringify({ commentId, postId, message: message.substring(0, 500), fromName: from.name })]
    );

    // Queue Private Reply dispatch (actual sending happens via the outbound system)
    log.info({
      workspaceId,
      journeyId,
      commentId,
      matchedKeywords: keywords.filter((kw: string) => lowerMessage.includes(kw.toLowerCase())),
    }, 'Comment matched Private Reply keywords — queued for dispatch');
  } catch (err) {
    log.warn({ err, pageId, commentId }, 'Error processing comment for Private Reply');
  }
}
