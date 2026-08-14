import { describe, expect, it, vi } from 'vitest';
import { WahaLidIdentityResolver } from '../../src/infrastructure/channels/waha/waha-lid-identity-resolver.js';

describe('WahaLidIdentityResolver', () => {
  it('accepts only an explicit WAHA @c.us mapping', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ pn: '5549999999999@c.us' }), { status: 200 }));
    const resolver = new WahaLidIdentityResolver({ baseUrl: 'http://waha:3000/', apiKey: 'test-key', fetchImpl });

    await expect(resolver.resolvePhone({ session: 'test-session', lid: 'opaque-value@lid' }))
      .resolves.toBe('5549999999999@c.us');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://waha:3000/api/test-session/lids/opaque-value',
      expect.objectContaining({ headers: { 'X-Api-Key': 'test-key' } }),
    );
  });

  it('returns null when WAHA has no mapping or returns an invalid phone JID', async () => {
    const noMapping = new WahaLidIdentityResolver({
      baseUrl: 'http://waha:3000', apiKey: 'test-key',
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ lid: 'opaque@lid', pn: null }), { status: 200 })),
    });
    const invalidMapping = new WahaLidIdentityResolver({
      baseUrl: 'http://waha:3000', apiKey: 'test-key',
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ pn: 'not-a-phone' }), { status: 200 })),
    });

    await expect(noMapping.resolvePhone({ session: 'test', lid: 'opaque@lid' })).resolves.toBeNull();
    await expect(invalidMapping.resolvePhone({ session: 'test', lid: 'opaque@lid' })).resolves.toBeNull();
  });

  it('fails closed when WAHA lookup fails', async () => {
    const resolver = new WahaLidIdentityResolver({
      baseUrl: 'http://waha:3000', apiKey: 'test-key',
      fetchImpl: vi.fn().mockResolvedValue(new Response('', { status: 503 })),
    });

    await expect(resolver.resolvePhone({ session: 'test', lid: 'opaque@lid' }))
      .rejects.toThrow(/HTTP 503/);
  });
});
