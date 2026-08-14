import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { WahaWebhookAdapter } from '../../src/infrastructure/channels/waha/waha-webhook-adapter.js';

describe('WahaWebhookAdapter — Pure Unit Tests (P0.3A-R2E Contract)', () => {
  const adapter = new WahaWebhookAdapter();
  const secret = 'whsec_sample_secret_2026';

  // ==========================================================================
  // 1. SIGNATURE VERIFICATION TESTS
  // ==========================================================================
  it('should verify valid HMAC-SHA512 signature with official headers and epoch ms timestamp', () => {
    const rawBody = JSON.stringify({
      event: 'message',
      payload: { id: 'wamid_123', body: 'Olá Haven' },
    });

    const signature = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
    const timestampMs = Date.now().toString();

    const result = adapter.verifySignature({
      rawBody,
      signatureHeader: signature,
      algorithmHeader: 'sha512',
      timestampHeader: timestampMs,
      secret,
    });

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject when algorithm header is missing', () => {
    const rawBody = JSON.stringify({ event: 'message', id: 'wamid_001' });
    const signature = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');

    const result = adapter.verifySignature({
      rawBody,
      signatureHeader: signature,
      timestampHeader: Date.now().toString(),
      secret,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Missing x-webhook-hmac-algorithm/i);
  });

  it('should reject when algorithm is not sha512 (e.g. sha256 or md5)', () => {
    const rawBody = JSON.stringify({ event: 'message', id: 'wamid_001' });
    const signature = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');

    const result = adapter.verifySignature({
      rawBody,
      signatureHeader: signature,
      algorithmHeader: 'sha256',
      timestampHeader: Date.now().toString(),
      secret,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Unsupported HMAC algorithm/i);
  });

  it('should reject when timestamp header is missing', () => {
    const rawBody = JSON.stringify({ event: 'message', id: 'wamid_001' });
    const signature = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');

    const result = adapter.verifySignature({
      rawBody,
      signatureHeader: signature,
      algorithmHeader: 'sha512',
      secret,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Missing x-webhook-timestamp/i);
  });

  it('should reject timestamp in seconds instead of milliseconds (Anti-Seconds Rejection)', () => {
    const rawBody = JSON.stringify({ event: 'message', id: 'wamid_001' });
    const signature = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
    const timestampSeconds = Math.floor(Date.now() / 1000).toString(); // In seconds (< 1e11)

    const result = adapter.verifySignature({
      rawBody,
      signatureHeader: signature,
      algorithmHeader: 'sha512',
      timestampHeader: timestampSeconds,
      secret,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/epoch milliseconds/i);
  });

  it('should reject webhook with expired timestamp (Anti-Replay)', () => {
    const rawBody = JSON.stringify({ event: 'message', id: 'wamid_001' });
    const signature = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
    const expiredTimestampMs = (Date.now() - 400 * 1000).toString(); // 400s ago (> 300s window)

    const result = adapter.verifySignature({
      rawBody,
      signatureHeader: signature,
      algorithmHeader: 'sha512',
      timestampHeader: expiredTimestampMs,
      secret,
      toleranceSeconds: 300,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/tolerance window/i);
  });

  it('should reject mismatched or tampered signature', () => {
    const rawBody = JSON.stringify({ event: 'message', id: 'wamid_001' });
    const fakeSignature = 'a'.repeat(128); // 128 hex chars of wrong hash

    const result = adapter.verifySignature({
      rawBody,
      signatureHeader: fakeSignature,
      algorithmHeader: 'sha512',
      timestampHeader: Date.now().toString(),
      secret,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/HMAC signature mismatch/i);
  });

  it('should reject signature with invalid hex length (not 128 chars)', () => {
    const rawBody = JSON.stringify({ event: 'message', id: 'wamid_001' });

    const result = adapter.verifySignature({
      rawBody,
      signatureHeader: 'short_hex',
      algorithmHeader: 'sha512',
      timestampHeader: Date.now().toString(),
      secret,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/128-character hexadecimal string/i);
  });

  // ==========================================================================
  // 2. FAIL-CLOSED EVENT TYPE VALIDATION & NAMESPACING (R2E CONTRACT)
  // ==========================================================================
  it('should reject extracting event when event or type is missing completely (fail-closed, no implicit fallback)', () => {
    const rawBody = JSON.stringify({
      payload: { id: 'wamid_no_event_01', body: 'Mensagem sem tipo de evento' },
    });

    expect(() => adapter.extractEvent(rawBody)).toThrow(/missing or invalid event type/i);
  });

  it('should reject extracting event when event is empty string or whitespace', () => {
    const rawBody = JSON.stringify({
      event: '   ',
      payload: { id: 'wamid_empty_event_01', body: 'Mensagem com evento vazio' },
    });

    expect(() => adapter.extractEvent(rawBody)).toThrow(/missing or invalid event type/i);
  });

  it('should reject extracting event when event is non-string (e.g. number or object)', () => {
    const rawBody = JSON.stringify({
      event: 12345,
      payload: { id: 'wamid_num_event_01', body: 'Mensagem com evento numérico' },
    });

    expect(() => adapter.extractEvent(rawBody)).toThrow(/missing or invalid event type/i);
  });

  it('should extract message and message.any with message: namespaced provider event ID for cross-event dedup', () => {
    const rawBody1 = JSON.stringify({
      event: 'message',
      payload: { id: 'wamid_888999', timestamp: 1723600000000 },
    });
    const rawBody2 = JSON.stringify({
      event: 'message.any',
      payload: { id: 'wamid_888999', timestamp: 1723600000000 },
    });

    const event1 = adapter.extractEvent(rawBody1);
    const event2 = adapter.extractEvent(rawBody2);

    expect(event1.providerEventId).toBe('message:wamid_888999');
    expect(event2.providerEventId).toBe('message:wamid_888999');
    expect(event1.providerEventId).toBe(event2.providerEventId);
  });

  it('should generate distinct providerEventIds for two ACKs of the same internal message ID with different top-level IDs', () => {
    const internalMsgId = 'wamid_shared_123';
    const topLevelAck1 = '01J5K4M7N8P9Q0R1S2T3U4V5A1';
    const topLevelAck2 = '01J5K4M7N8P9Q0R1S2T3U4V5A2';

    const ack1 = adapter.extractEvent(
      JSON.stringify({
        event: 'message.ack',
        id: topLevelAck1,
        payload: { id: internalMsgId, ack: 2 },
      })
    );

    const ack2 = adapter.extractEvent(
      JSON.stringify({
        event: 'message.ack',
        id: topLevelAck2,
        payload: { id: internalMsgId, ack: 3 },
      })
    );

    expect(ack1.providerEventId).toBe(`message.ack:${topLevelAck1}`);
    expect(ack2.providerEventId).toBe(`message.ack:${topLevelAck2}`);
    expect(ack1.providerEventId).not.toBe(ack2.providerEventId);
  });

  it('should throw when non-message event (e.g. message.ack) lacks top-level id even if nested payload.id exists', () => {
    const rawBody = JSON.stringify({
      event: 'message.ack',
      // Notice: NO top-level "id" property!
      payload: { id: 'wamid_internal_msg_999', ack: 2 },
    });

    expect(() => adapter.extractEvent(rawBody)).toThrow(/missing top-level event ID for event message\.ack/i);
  });

  it('should extract non-message lifecycle event with type:topLevelId namespacing', () => {
    const rawBody = JSON.stringify({
      event: 'session.status',
      id: '01J5K4M7N8P9Q0R1S2T3U4V5WS',
      payload: { status: 'CONNECTED' },
    });

    const event = adapter.extractEvent(rawBody);

    expect(event.provider).toBe('waha');
    expect(event.eventType).toBe('session.status');
    expect(event.providerEventId).toBe('session.status:01J5K4M7N8P9Q0R1S2T3U4V5WS');
  });

  it('should throw when message payload lacks any message ID', () => {
    const payloadWithoutId = JSON.stringify({
      event: 'message',
      payload: { body: 'Sem ID de mensagem' },
    });

    expect(() => adapter.extractEvent(payloadWithoutId)).toThrow(/missing provider message ID/i);
  });

  // ==========================================================================
  // 3. INBOUND MESSAGE CLASSIFICATION (PARSED / IGNORED / INVALID)
  // ==========================================================================
  it('should return INVALID when parseInboundMessage receives payload missing event type (never PARSED)', () => {
    const payloadWithoutEvent = {
      payload: {
        id: 'wamid_no_event_99',
        from: '5549999112233@c.us',
        body: 'Mensagem sem evento',
      },
    };

    const res = adapter.parseInboundMessage(payloadWithoutEvent);
    expect(res.kind).toBe('INVALID');
    if (res.kind === 'INVALID') {
      expect(res.error).toMatch(/Missing or invalid event type/i);
    }
  });

  it('should parse valid inbound customer message (kind: PARSED) with E.164 and whatsappId', () => {
    const payload = {
      event: 'message',
      payload: {
        id: 'wamid_user_001',
        from: '5549999112233@c.us',
        pushName: 'Juliana Silva',
        body: 'Gostaria de agendar uma escova',
        timestamp: 1723600000000,
      },
    };

    const res = adapter.parseInboundMessage(payload);

    expect(res.kind).toBe('PARSED');
    if (res.kind === 'PARSED') {
      expect(res.message.providerMessageId).toBe('wamid_user_001');
      expect(res.message.contactPhone).toBe('+5549999112233');
      expect(res.message.whatsappId).toBe('5549999112233@c.us');
      expect(res.message.contactName).toBe('Juliana Silva');
      expect(res.message.textContent).toBe('Gostaria de agendar uma escova');
      expect(res.message.isFromMe).toBe(false);
    }
  });

  it('should parse inbound message with event: message.any as commercial message (kind: PARSED)', () => {
    const payload = {
      event: 'message.any',
      payload: {
        id: 'wamid_any_001',
        from: '5549999112233@c.us',
        pushName: 'Juliana Any',
        body: 'Mensagem via message.any',
        timestamp: 1723600000000,
      },
    };

    const res = adapter.parseInboundMessage(payload);

    expect(res.kind).toBe('PARSED');
    if (res.kind === 'PARSED') {
      expect(res.message.providerMessageId).toBe('wamid_any_001');
      expect(res.message.textContent).toBe('Mensagem via message.any');
    }
  });

  it('should mark message.upsert as IGNORED (not a commercial message in WAHA contract)', () => {
    const payload = {
      event: 'message.upsert',
      id: '01J5K4M7N8P9Q0R1S2T3U4V5WU',
      payload: {
        id: 'wamid_upsert_001',
        from: '5549999112233@c.us',
        body: 'Mensagem upsert',
      },
    };

    const res = adapter.parseInboundMessage(payload);
    expect(res.kind).toBe('IGNORED');
    if (res.kind === 'IGNORED') {
      expect(res.reason).toBe('non_commercial_event_message.upsert');
    }
  });

  it('should parse inbound media metadata without downloading binaries', () => {
    const payload = {
      event: 'message',
      payload: {
        id: 'wamid_media_002',
        from: '5549999112233@s.whatsapp.net',
        hasMedia: true,
        media: {
          mimetype: 'audio/ogg; codecs=opus',
          filename: 'audio.ogg',
          filesize: 45000,
          url: 'https://waha.internal/media/audio_002.ogg',
        },
      },
    };

    const res = adapter.parseInboundMessage(payload);

    expect(res.kind).toBe('PARSED');
    if (res.kind === 'PARSED') {
      expect(res.message.mediaPayload).toEqual({
        mimetype: 'audio/ogg; codecs=opus',
        filename: 'audio.ogg',
        filesize: 45000,
        url: 'https://waha.internal/media/audio_002.ogg',
        caption: undefined,
      });
    }
  });

  it('should mark message.ack as IGNORED (non-commercial event)', () => {
    const payload = {
      event: 'message.ack',
      id: '01J5K4M7N8P9Q0R1S2T3U4V5WA',
      payload: { id: 'wamid_001', ack: 2 },
    };

    const res = adapter.parseInboundMessage(payload);
    expect(res.kind).toBe('IGNORED');
    if (res.kind === 'IGNORED') {
      expect(res.reason).toBe('non_commercial_event_message.ack');
    }
  });

  it('should mark message.reaction as IGNORED (non-commercial event)', () => {
    const payload = {
      event: 'message.reaction',
      id: '01J5K4M7N8P9Q0R1S2T3U4V5WR',
      payload: { id: 'wamid_001', reaction: { text: '👍' } },
    };

    const res = adapter.parseInboundMessage(payload);
    expect(res.kind).toBe('IGNORED');
    if (res.kind === 'IGNORED') {
      expect(res.reason).toBe('non_commercial_event_message.reaction');
    }
  });

  it('should mark message.edited as IGNORED (non-commercial event)', () => {
    const payload = {
      event: 'message.edited',
      id: '01J5K4M7N8P9Q0R1S2T3U4V5WE',
      payload: { id: 'wamid_001', body: 'Nova versão' },
    };

    const res = adapter.parseInboundMessage(payload);
    expect(res.kind).toBe('IGNORED');
    if (res.kind === 'IGNORED') {
      expect(res.reason).toBe('non_commercial_event_message.edited');
    }
  });

  it('should mark message.revoked as IGNORED (non-commercial event)', () => {
    const payload = {
      event: 'message.revoked',
      id: '01J5K4M7N8P9Q0R1S2T3U4V5WV',
      payload: { id: 'wamid_001' },
    };

    const res = adapter.parseInboundMessage(payload);
    expect(res.kind).toBe('IGNORED');
    if (res.kind === 'IGNORED') {
      expect(res.reason).toBe('non_commercial_event_message.revoked');
    }
  });

  it('should mark outbound message (fromMe = true) as IGNORED', () => {
    const payload = {
      event: 'message',
      payload: {
        id: 'wamid_outbound_001',
        from: '5549999112233@c.us',
        fromMe: true,
        body: 'Mensagem do atendente',
      },
    };

    const res = adapter.parseInboundMessage(payload);
    expect(res.kind).toBe('IGNORED');
    if (res.kind === 'IGNORED') {
      expect(res.reason).toBe('outbound_message');
    }
  });

  it('should mark group message (@g.us) as IGNORED', () => {
    const payload = {
      event: 'message',
      payload: {
        id: 'wamid_group_001',
        from: '123456-7890@g.us',
        isGroup: true,
        body: 'Mensagem de grupo',
      },
    };

    const res = adapter.parseInboundMessage(payload);
    expect(res.kind).toBe('IGNORED');
    if (res.kind === 'IGNORED') {
      expect(res.reason).toBe('group_message');
    }
  });

  it('should mark status broadcast (@broadcast) as IGNORED', () => {
    const payload = {
      event: 'message',
      payload: {
        id: 'wamid_status_001',
        from: 'status@broadcast',
        body: 'Novo status',
      },
    };

    const res = adapter.parseInboundMessage(payload);
    expect(res.kind).toBe('IGNORED');
    if (res.kind === 'IGNORED') {
      expect(res.reason).toBe('status_broadcast');
    }
  });

  it('should expose linked device @lid sender for verified identity resolution without guessing an E.164 phone', () => {
    const payload = {
      event: 'message',
      payload: {
        id: 'wamid_lid_001',
        from: '123456789012345678@lid',
        body: 'Mensagem de dispositivo vinculado',
      },
    };

    const res = adapter.parseInboundMessage(payload);
    expect(res.kind).toBe('UNRESOLVED_IDENTITY');
    if (res.kind === 'UNRESOLVED_IDENTITY') {
      expect(res.lid).toBe('123456789012345678@lid');
    }
  });

  it('should mark missing message ID as INVALID (never silent success)', () => {
    const payload = {
      event: 'message',
      payload: {
        from: '5549999112233@c.us',
        body: 'Mensagem sem ID',
      },
    };

    const res = adapter.parseInboundMessage(payload);
    expect(res.kind).toBe('INVALID');
    if (res.kind === 'INVALID') {
      expect(res.error).toMatch(/Missing provider message ID/i);
    }
  });

  it('should mark invalid phone number as INVALID', () => {
    const payload = {
      event: 'message',
      payload: {
        id: 'wamid_short_phone',
        from: '123@c.us',
        body: 'Telefone curto',
      },
    };

    const res = adapter.parseInboundMessage(payload);
    expect(res.kind).toBe('INVALID');
    if (res.kind === 'INVALID') {
      expect(res.error).toMatch(/valid E\.164/i);
    }
  });
});
