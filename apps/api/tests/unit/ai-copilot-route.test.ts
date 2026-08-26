import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { aiCopilotRoutes } from '../../src/interfaces/http/routes/ai-copilot-routes.js';
import type { OperatorAuthenticator } from '../../src/application/ports/operator-authenticator.js';
import type { OpenRouterEngine } from '../../src/infrastructure/ai/openrouter-engine.js';

describe('AI Copilot provider failure contract', () => {
  it('returns explicit 503 without a commercial fallback message', async () => {
    const authenticator: OperatorAuthenticator = {
      verifyAccessToken: vi.fn().mockResolvedValue({ userId: 'operator-1' }),
    };
    const openrouterEngine = {
      generateChatCompletion: vi.fn().mockRejectedValue(new Error('provider timeout')),
    } as unknown as OpenRouterEngine;
    const app = Fastify();

    await app.register(aiCopilotRoutes, { authenticator, openrouterEngine });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/copilot-suggestion',
      headers: { authorization: 'Bearer valid.token.signature' },
      payload: {
        journeyStage: 'LEAD',
        contactName: 'Cliente',
        lastCustomerMessage: 'Quanto custa?',
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      success: false,
      error: 'AI copilot is temporarily unavailable',
      code: 'AI_PROVIDER_UNAVAILABLE',
    });
    expect(response.payload).not.toContain('condições especiais');
    await app.close();
  });
});
