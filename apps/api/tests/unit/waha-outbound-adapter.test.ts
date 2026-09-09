import { describe, expect, it, vi } from 'vitest';
import { WahaOutboundAdapter } from '../../src/infrastructure/channels/waha/waha-outbound-adapter.js';

describe('WahaOutboundAdapter provider boundaries', () => {
  it('refuses an omitted session instead of routing to a default account', async () => {
    const fetchImpl = vi.fn();
    const adapter = new WahaOutboundAdapter({ endpoint: 'https://waha.example', fetchImpl });

    await expect(adapter.sendText({ chatId: '5511999998888@c.us', text: 'Olá' })).resolves.toEqual({
      success: false,
      kind: 'FATAL',
      failureCode: 'WAHA_SESSION_REQUIRED',
      message: expect.stringContaining('explicit WAHA session'),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('passes the explicit session and rejects a 2xx response without provider id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const adapter = new WahaOutboundAdapter({ endpoint: 'https://waha.example', fetchImpl });

    await expect(adapter.sendText({
      session: 'ws_haven',
      chatId: '5511999998888@c.us',
      text: 'Olá',
    })).resolves.toMatchObject({
      success: false,
      kind: 'AMBIGUOUS',
      failureCode: 'WAHA_PROVIDER_ID_MISSING',
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://waha.example/api/sendText', expect.any(Object));
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      session: 'ws_haven',
      chatId: '5511999998888@c.us',
      text: 'Olá',
    });
  });

  it('extracts serialized provider id when WAHA returns id as an object', async () => {
    const payload = {
      id: {
        fromMe: true,
        remote: '726034075728@lid',
        id: '3EB02FA3F6084C1B24F7B8',
        _serialized: 'true_726034075728@lid_3EB02FA3F6084C1B24F7B8',
      },
    };
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 201 }));
    const adapter = new WahaOutboundAdapter({ endpoint: 'https://waha.example', fetchImpl });

    const result = await adapter.sendText({
      session: 'ws_haven',
      chatId: '5511999998888@c.us',
      text: 'Olá',
    });

    expect(result).toMatchObject({
      success: true,
      providerMessageId: 'true_726034075728@lid_3EB02FA3F6084C1B24F7B8',
    });
  });

  it('requires the session for media methods as well', async () => {
    const fetchImpl = vi.fn();
    const adapter = new WahaOutboundAdapter({ endpoint: 'https://waha.example', fetchImpl });
    const file = { data: 'data:image/png;base64,AAAA', mimetype: 'image/png', filename: 'x.png' };

    await expect(adapter.sendImage({ chatId: '5511999998888@c.us', file })).resolves.toMatchObject({
      success: false,
      failureCode: 'WAHA_SESSION_REQUIRED',
    });
    await expect(adapter.sendFile({ chatId: '5511999998888@c.us', file })).resolves.toMatchObject({
      success: false,
      failureCode: 'WAHA_SESSION_REQUIRED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
