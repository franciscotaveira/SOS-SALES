import { describe, it, expect } from 'vitest';
import { 
  DEFAULT_META_GRAPH_API_VERSION, 
  DEFAULT_META_GRAPH_BASE_URL, 
  getMetaGraphBaseUrl, 
  normalizeWhatsAppRecipient 
} from '../../src/infrastructure/channels/meta/meta-constants.js';
import { WabaClient } from '../../src/infrastructure/channels/meta/waba-client.js';

describe('Meta Graph API Governance & Identity Normalization (Radar 2026)', () => {
  it('should default to v21.0 or process.env configuration and avoid deprecated v20.0', () => {
    expect(DEFAULT_META_GRAPH_API_VERSION).toBe(process.env.META_GRAPH_API_VERSION || 'v21.0');
    expect(DEFAULT_META_GRAPH_BASE_URL).toContain(DEFAULT_META_GRAPH_API_VERSION);
    expect(DEFAULT_META_GRAPH_BASE_URL).not.toContain('v20.0');
  });

  it('should format baseUrl correctly with or without custom version', () => {
    expect(getMetaGraphBaseUrl()).toBe(`https://graph.facebook.com/${DEFAULT_META_GRAPH_API_VERSION}`);
    expect(getMetaGraphBaseUrl(undefined, 'v22.0')).toBe('https://graph.facebook.com/v22.0');
    expect(getMetaGraphBaseUrl(undefined, '22.0')).toBe('https://graph.facebook.com/v22.0');
    expect(getMetaGraphBaseUrl('https://custom.meta.proxy/v21.0/')).toBe('https://custom.meta.proxy/v21.0');
  });

  it('should normalize traditional Brazilian phone numbers with DDI 55', () => {
    const res = normalizeWhatsAppRecipient('11999998888');
    expect(res).toEqual({ type: 'PHONE', value: '11999998888' });

    const client = new WabaClient();
    const recipient = client.normalizeRecipient('11999998888');
    expect(recipient).toEqual({ recipient_type: 'individual', to: '5511999998888' });
  });

  it('should recognize and preserve BSUID / Usernames as first-class recipients without stripping letters', () => {
    const bsuid = 'BR_USR_948294829';
    const res = normalizeWhatsAppRecipient(bsuid);
    expect(res).toEqual({ type: 'BSUID', value: bsuid });

    const client = new WabaClient();
    const recipient = client.normalizeRecipient(bsuid);
    expect(recipient).toEqual({ recipient_type: 'individual', to: bsuid });
  });

  it('should accept object recipient directly', () => {
    const explicitBsuid = { type: 'BSUID' as const, value: 'meta_user_xyz' };
    const res = normalizeWhatsAppRecipient(explicitBsuid);
    expect(res).toEqual(explicitBsuid);

    const client = new WabaClient();
    const recipient = client.normalizeRecipient(explicitBsuid);
    expect(recipient).toEqual({ recipient_type: 'individual', to: 'meta_user_xyz' });
  });

  it('should correctly handle inbound messages where phone is absent but BSUID is present', () => {
    const rawInboundMessage = {
      id: 'wamid.HBgL...',
      from_user_id: 'BR_USER_CANONICAL_01',
      timestamp: '1725624000',
      type: 'text',
      text: { body: 'Olá via username Meta' },
    };

    const sender = normalizeWhatsAppRecipient(rawInboundMessage.from_user_id);
    expect(sender.type).toBe('BSUID');
    expect(sender.value).toBe('BR_USER_CANONICAL_01');
  });
});
