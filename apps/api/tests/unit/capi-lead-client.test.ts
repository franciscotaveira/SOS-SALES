import {afterEach, expect, it, vi} from 'vitest';
import {CapiClient} from '../../src/infrastructure/channels/meta/capi-client.js';
const event = {eventId: 'lead-stable-id', workspaceId: 'workspace', journeyId: 'journey', pixelId: '1234', occurredAt: '2026-01-01T00:00:00Z', ctwaClid: 'original-click', whatsappBusinessAccountId: '9876'};
afterEach(() => vi.unstubAllGlobals());
it('sends Lead without revenue and preserves event ID on retry', async () => {
  const fetch = vi.fn().mockResolvedValue({ok: true, json: async () => ({events_received: 1})});
  vi.stubGlobal('fetch', fetch);
  const client = new CapiClient();
  await client.sendLeadEvent(event, 'workspace-token');
  await client.sendLeadEvent(event, 'workspace-token');
  for (const [, options] of fetch.mock.calls) {
    const data = JSON.parse(options.body).data[0];
    expect(data).toMatchObject({event_name: 'Lead', event_id: event.eventId, action_source: 'business_messaging', messaging_channel: 'whatsapp', user_data: {ctwa_clid: event.ctwaClid, whatsapp_business_account_id: event.whatsappBusinessAccountId}});
    expect(data).not.toHaveProperty('custom_data');
    expect(options.headers.Authorization).toBe('Bearer workspace-token');
  }
});
it('rejects missing attribution and disallows a global token fallback', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const client = new CapiClient({defaultAccessToken: 'global'});
  expect(await client.sendLeadEvent(event, '')).toMatchObject({success: false, errorCode: 'MISSING_ACCESS_TOKEN'});
  expect(await client.sendLeadEvent({...event, ctwaClid: ''}, 'workspace-token')).toMatchObject({success: false, errorCode: 'MISSING_WHATSAPP_ATTRIBUTION'});
  expect(fetch).not.toHaveBeenCalled();
});
