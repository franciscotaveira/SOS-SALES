import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpSalesOsGateway } from './salesOsGateway';

const workspaceId = '11111111-1111-1111-1111-111111111111';
const journeyId = '22222222-2222-2222-2222-222222222222';
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('HttpSalesOsGateway', () => {
  it('queues a cockpit message without duplicating the /api/v1 prefix', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      dispatchId: '33333333-3333-3333-3333-333333333333',
      status: 'APPROVED',
      message: 'Mensagem enfileirada',
    }), { status: 202, headers: { 'content-type': 'application/json' } }));
    globalThis.fetch = fetchMock as typeof fetch;
    const gateway = new HttpSalesOsGateway({
      baseUrl: 'https://crm.iaparavendas.tech/api/v1',
      accessTokenProvider: async () => 'test-access-token',
    });

    await gateway.sendDirectMessage(workspaceId, journeyId, 'Olá');

    expect(fetchMock).toHaveBeenCalledWith(
      `https://crm.iaparavendas.tech/api/v1/workspaces/${workspaceId}/journeys/${journeyId}/send-message`,
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
