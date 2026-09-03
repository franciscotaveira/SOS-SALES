import crypto from 'node:crypto';
import {
  ChannelWebhookAdapter,
  InboundMessageParseResult,
  NormalizedInboundMessage,
  VerificationResult,
  VerifiedWebhookEvent,
  VerifySignatureParams,
} from '../../../application/ports/channel-webhook-adapter.js';
import { InvalidWebhookPayloadError } from '../../../application/errors/invalid-webhook-payload-error.js';

/**
 * WAHA/WhatsApp serializes message identifiers in more than one shape. In
 * particular, WhatsApp Web commonly sends `{ _serialized, id, remote }` while
 * older payloads send the identifier as a plain string. Keep the extraction
 * deterministic and bounded: only the documented identifier fields are read;
 * arbitrary object stringification would create unstable deduplication keys.
 */
function providerIdentifier(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record._serialized === 'string' && record._serialized.trim()) return record._serialized.trim();
  if (typeof record.id === 'string' && record.id.trim()) return record.id.trim();
  if (record.id && typeof record.id === 'object') return providerIdentifier(record.id);
  return null;
}

export class WahaWebhookAdapter implements ChannelWebhookAdapter {
  public readonly providerName = 'waha';

  /**
   * Verifies HMAC-SHA512 signature, algorithm and mandatory timestamp freshness over the exact raw body.
   */
  public verifySignature(params: VerifySignatureParams): VerificationResult {
    const {
      rawBody,
      signatureHeader,
      algorithmHeader,
      timestampHeader,
      secret,
      now = new Date(),
      toleranceSeconds = 300,
    } = params;

    if (!secret || secret.trim() === '') {
      return { valid: false, error: 'Webhook secret is not configured' };
    }

    // 1. Mandatory Algorithm Verification (Strictly sha512)
    if (!algorithmHeader || algorithmHeader.trim() === '') {
      return { valid: false, error: 'Missing x-webhook-hmac-algorithm header' };
    }

    if (algorithmHeader.trim().toLowerCase() !== 'sha512') {
      return { valid: false, error: `Unsupported HMAC algorithm: ${algorithmHeader}. Expected sha512` };
    }

    // 2. Mandatory Timestamp Freshness Verification (Epoch Milliseconds)
    if (!timestampHeader || timestampHeader.trim() === '') {
      return { valid: false, error: 'Missing x-webhook-timestamp header' };
    }

    const tsNum = Number(timestampHeader.trim());
    if (isNaN(tsNum)) {
      return { valid: false, error: 'Invalid x-webhook-timestamp header format' };
    }

    // Reject timestamps in seconds instead of milliseconds
    if (tsNum <= 1e11) {
      return { valid: false, error: 'x-webhook-timestamp must be in epoch milliseconds' };
    }

    const diffSeconds = Math.abs((now.getTime() - tsNum) / 1000);
    if (diffSeconds > toleranceSeconds) {
      return {
        valid: false,
        error: `Timestamp out of tolerance window (${Math.round(diffSeconds)}s > ${toleranceSeconds}s)`,
      };
    }

    // 3. Mandatory Signature Format (Strictly 128 Hex Characters)
    if (!signatureHeader || signatureHeader.trim() === '') {
      return { valid: false, error: 'Missing x-webhook-hmac header' };
    }

    const cleanReceived = signatureHeader.trim().toLowerCase();
    if (!/^[0-9a-f]{128}$/.test(cleanReceived)) {
      return { valid: false, error: 'x-webhook-hmac must be a 128-character hexadecimal string' };
    }

    // 4. Compute Expected HMAC-SHA512 over Raw Body
    const bodyBuffer = Buffer.isBuffer(rawBody)
      ? rawBody
      : Buffer.from(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody), 'utf8');

    const hmac = crypto.createHmac('sha512', secret);
    hmac.update(bodyBuffer);
    const expectedHex = hmac.digest('hex');

    // 5. Decode 64-byte Hex Buffers and Compare with Constant-Time timingSafeEqual
    try {
      const expectedBuf = Buffer.from(expectedHex, 'hex');
      const receivedBuf = Buffer.from(cleanReceived, 'hex');

      if (expectedBuf.length !== 64 || receivedBuf.length !== 64) {
        return { valid: false, error: 'Decoded HMAC buffer length mismatch' };
      }

      const isValid = crypto.timingSafeEqual(expectedBuf, receivedBuf);
      if (!isValid) {
        return { valid: false, error: 'HMAC signature mismatch' };
      }

      return { valid: true };
    } catch (err) {
      return { valid: false, error: `Signature verification error: ${(err as Error).message}` };
    }
  }

  /**
   * Extracts a stable provider event ID, event type and timestamp from the raw payload.
   * Throws typed InvalidWebhookPayloadError for structural / payload format violations.
   * For message/message.any: providerEventId = `message:${providerMessageId}`.
   * For non-message/lifecycle events: providerEventId = `${eventType}:${topLevelEventId}` (strictly top-level payload.id).
   */
  public extractEvent(rawBody: Buffer | string | Record<string, unknown>): VerifiedWebhookEvent {
    let payload: Record<string, unknown>;

    try {
      if (Buffer.isBuffer(rawBody)) {
        payload = JSON.parse(rawBody.toString('utf8'));
      } else if (typeof rawBody === 'string') {
        payload = JSON.parse(rawBody);
      } else {
        payload = rawBody;
      }
    } catch (err) {
      throw new InvalidWebhookPayloadError(`Malformed JSON webhook payload: ${(err as Error).message}`);
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new InvalidWebhookPayloadError('Webhook payload must be a valid JSON object');
    }

    // Strict Fail-Closed Event Type Validation
    const rawEventType = payload.event !== undefined ? payload.event : payload.type;
    if (!rawEventType || typeof rawEventType !== 'string' || rawEventType.trim() === '') {
      throw new InvalidWebhookPayloadError('WAHA payload missing or invalid event type');
    }
    const eventType = rawEventType.trim();

    const nestedPayload = (payload.payload as Record<string, unknown>) || payload;
    let providerEventId: string;

    if (eventType === 'message' || eventType === 'message.any') {
      const msgId =
        providerIdentifier(nestedPayload.id) ||
        providerIdentifier((nestedPayload.key as Record<string, unknown>)?.id) ||
        providerIdentifier(payload.id) ||
        providerIdentifier(nestedPayload.messageId);

      if (!msgId) {
        throw new InvalidWebhookPayloadError('WAHA message payload missing provider message ID');
      }
      providerEventId = `message:${msgId}`;
    } else {
      // For non-message events (e.g. message.ack, message.reaction, session.status), strictly use top-level envelope ID (ULID)
      const topLevelEventId = providerIdentifier(payload.id);

      if (!topLevelEventId) {
        throw new InvalidWebhookPayloadError(`WAHA payload missing top-level event ID for event ${eventType}`);
      }
      providerEventId = `${eventType}:${topLevelEventId}`;
    }

    // Extract event timestamp
    let eventTimestamp = new Date();
    const rawTs = (nestedPayload.timestamp as number) || (payload.timestamp as number);
    if (rawTs) {
      eventTimestamp = new Date(rawTs > 1e11 ? rawTs : rawTs * 1000);
    }

    return {
      provider: this.providerName,
      providerEventId,
      eventType,
      timestamp: eventTimestamp,
      rawPayload: payload,
    };
  }

  /**
   * Normalizes an inbound message payload into a structured result.
   * Rejects payloads with missing/invalid event type as INVALID.
   * Commercial message events (strictly message, message.any) are parsed into PARSED messages.
   * Non-commercial events (message.ack, message.reaction, message.edited, message.revoked, message.upsert, session events)
   * and non-commercial messages (outbound, groups, status broadcasts) are explicitly IGNORED.
   * Malformed inbound customer messages are marked INVALID.
   */
  public parseInboundMessage(rawPayload: Record<string, unknown>): InboundMessageParseResult {
    // Strict Fail-Closed Event Type Validation
    const rawEventType = rawPayload.event !== undefined ? rawPayload.event : rawPayload.type;
    if (!rawEventType || typeof rawEventType !== 'string' || rawEventType.trim() === '') {
      return { kind: 'INVALID', error: 'Missing or invalid event type in payload' };
    }
    const eventType = rawEventType.trim();

    // 1. Strict Event Classification: Only message and message.any are commercial messages
    if (eventType !== 'message' && eventType !== 'message.any') {
      return { kind: 'IGNORED', reason: `non_commercial_event_${eventType}` };
    }

    const data = (rawPayload.payload as Record<string, unknown>) || rawPayload;

    // 2. Filter out outbound messages sent by the bot/business (fromMe: true)
    const isFromMe =
      Boolean(data.fromMe) ||
      Boolean((data.key as Record<string, unknown>)?.fromMe) ||
      Boolean(rawPayload.fromMe);

    if (isFromMe) {
      return { kind: 'IGNORED', reason: 'outbound_message' };
    }

    // 3. Extract Remote JID / Phone string
    const fromJid =
      (data.from as string) ||
      ((data.key as Record<string, unknown>)?.remoteJid as string) ||
      (data.author as string);

    if (!fromJid || typeof fromJid !== 'string' || fromJid.trim() === '') {
      return { kind: 'INVALID', error: 'Missing sender from JID in inbound message' };
    }

    // 4. Filter out group chats, newsletter feeds and status broadcasts.
    // These are not 1:1 commercial journeys and must never become contacts.
    if (fromJid.endsWith('@g.us') || data.isGroup) {
      return { kind: 'IGNORED', reason: 'group_message' };
    }

    if (fromJid.endsWith('@newsletter') || data.isNewsletter === true) {
      return { kind: 'IGNORED', reason: 'newsletter_message' };
    }

    if (fromJid === 'status@broadcast' || fromJid.endsWith('@broadcast')) {
      return { kind: 'IGNORED', reason: 'status_broadcast' };
    }

    // 5. A linked-device LID is not an E.164 identity. It may be resolved
    // through WAHA's explicit LID API; never derive a phone from its digits.
    if (fromJid.endsWith('@lid')) {
      return { kind: 'UNRESOLVED_IDENTITY', lid: fromJid };
    }

    // 6. Clean and validate E.164 phone
    const cleanDigits = fromJid.split('@')[0].replace(/\D/g, '');
    const contactPhone = `+${cleanDigits}`;
    if (!/^\+[1-9][0-9]{7,14}$/.test(contactPhone)) {
      return { kind: 'INVALID', error: `Sender JID digits (${contactPhone}) do not form a valid E.164 phone number` };
    }

    // 7. Extract stable provider message ID
    const rawMsgId =
      providerIdentifier(data.id) ||
      providerIdentifier((data.key as Record<string, unknown>)?.id);

    if (!rawMsgId) {
      return { kind: 'INVALID', error: 'Missing provider message ID in inbound message' };
    }
    const providerMessageId = rawMsgId;

    // 8. Extract WhatsApp ID (preserve original JID)
    const whatsappId = fromJid;

    // 9. Extract Contact Name
    const contactName =
      (data.pushName as string) ||
      (data.notifyName as string) ||
      ((data._data as Record<string, unknown>)?.notifyName as string) ||
      undefined;

    // 10. Extract Text Content
    let textContent: string | undefined = undefined;
    if (typeof data.body === 'string') {
      textContent = data.body;
    } else if (typeof data.text === 'string') {
      textContent = data.text;
    } else if (typeof (data.message as Record<string, unknown>)?.conversation === 'string') {
      textContent = (data.message as Record<string, unknown>).conversation as string;
    } else if (
      typeof ((data.message as Record<string, unknown>)?.extendedTextMessage as Record<string, unknown>)?.text === 'string'
    ) {
      textContent = (
        (data.message as Record<string, unknown>).extendedTextMessage as Record<string, unknown>
      ).text as string;
    }

    // 11. Extract Media Metadata (Without downloading binaries)
    let mediaPayload: Record<string, unknown> | undefined = undefined;
    const mediaType = typeof data.type === 'string' ? data.type : '';
    const hasMedia = Boolean(
      data.hasMedia
      || data.media
      || data.mimetype
      || (mediaType && mediaType !== 'chat'),
    );
    if (hasMedia) {
      const mediaData = (data.media as Record<string, unknown>) || data;
      mediaPayload = {
        ...(mediaType && mediaType !== 'chat' ? { mediaType } : {}),
        mimetype: mediaData.mimetype || mediaData.mimeType || 'application/octet-stream',
        filename: mediaData.filename || undefined,
        filesize: mediaData.filesize || mediaData.fileLength || undefined,
        url: typeof mediaData.url === 'string' ? mediaData.url : undefined,
        caption: mediaData.caption || undefined,
      };
    }

    // 12. Extract Sent Timestamp
    let sentAt = new Date();
    const rawTs = (data.timestamp as number) || (rawPayload.timestamp as number);
    if (rawTs) {
      sentAt = new Date(rawTs > 1e11 ? rawTs : rawTs * 1000);
    }

    return {
      kind: 'PARSED',
      message: {
        providerMessageId,
        contactPhone,
        whatsappId,
        contactName,
        textContent,
        mediaPayload,
        sentAt,
        isFromMe: false,
      },
    };
  }
}
