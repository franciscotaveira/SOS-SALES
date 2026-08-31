import { afterEach, describe, expect, it, vi } from 'vitest';
import { WabaClient } from '../../src/infrastructure/channels/meta/waba-client.js';

describe('WabaClient provider acceptance', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses a successful HTTP response without a Meta provider message ID', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ messaging_product: 'whatsapp', contacts: [{ input: '5549999999999' }], messages: [{}] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));

    const client = new WabaClient();

    await expect(client.sendText({
      phoneNumberId: '123456789',
      accessToken: 'test-token',
      recipientPhone: '5549999999999',
      text: 'Olá',
    })).rejects.toThrow(/did not return a message ID/i);
  });

  it('returns the provider message ID when Meta explicitly accepts a send', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.test-123' }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));

    const client = new WabaClient();

    await expect(client.sendText({
      phoneNumberId: '123456789',
      accessToken: 'test-token',
      recipientPhone: '5549999999999',
      text: 'Olá',
    })).resolves.toEqual({ messageId: 'wamid.test-123' });
  });
});
