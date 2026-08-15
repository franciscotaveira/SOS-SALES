import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/interfaces/http/app.js';
import { OperatorAuthenticator } from '../../src/application/ports/operator-authenticator.js';
import { WorkspaceDirectory } from '../../src/application/ports/workspace-directory.js';

function baseDependencies(overrides: {
  authenticator?: OperatorAuthenticator;
  workspaceDirectory?: WorkspaceDirectory;
} = {}) {
  return {
    secretProvider: { getWebhookSecret: async () => 'test-secret' },
    wahaAdapter: {
      providerName: 'waha',
      verifySignature: () => ({ valid: true }),
      extractEvent: () => ({ provider: 'waha', providerEventId: 'event', eventType: 'message', timestamp: new Date(), rawPayload: {} }),
      parseInboundMessage: () => ({ kind: 'IGNORED' as const, reason: 'not used' }),
    },
    ingestionGateway: {
      ingestChannelEvent: async () => ({ inboundEventId: 'event', workspaceId: 'workspace', isDuplicate: false }),
    },
    logger: false,
    rateLimit: false as const,
    ...overrides,
  };
}

describe('Operator API — Supabase JWT auth boundary', () => {
  const actor = { userId: '72d9da82-7d10-4c96-a6f5-07c838db5ad4', email: 'operator@example.test' };

  it('AUTH-01: rejects missing or malformed Authorization headers before any verifier call', async () => {
    let calls = 0;
    const app = buildApp(baseDependencies({
      authenticator: { verifyAccessToken: async () => { calls += 1; return actor; } },
    }));

    const missing = await app.inject({ method: 'GET', url: '/api/v1/me' });
    const malformed = await app.inject({
      method: 'GET', url: '/api/v1/me', headers: { authorization: 'Basic abc123' },
    });

    expect(missing.statusCode).toBe(401);
    expect(malformed.statusCode).toBe(401);
    expect(missing.json()).toEqual({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or missing bearer token' });
    expect(calls).toBe(0);
    await app.close();
  });

  it('AUTH-02: derives /me only from the injected verifier, never request headers', async () => {
    const app = buildApp(baseDependencies({
      authenticator: { verifyAccessToken: async (token) => token === 'verified.jwt.token' ? actor : null },
    }));

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: {
        authorization: 'Bearer verified.jwt.token',
        'x-user-id': 'attacker-controlled-user-id',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: actor.userId, email: actor.email });
    await app.close();
  });

  it('AUTH-03: returns the same sanitized 401 for verifier rejection or failure', async () => {
    const rejected = buildApp(baseDependencies({
      authenticator: { verifyAccessToken: async () => null },
    }));
    const unavailable = buildApp(baseDependencies({
      authenticator: { verifyAccessToken: async () => { throw new Error('JWKS host unavailable'); } },
    }));

    const rejectedResponse = await rejected.inject({ method: 'GET', url: '/api/v1/me', headers: { authorization: 'Bearer bad.jwt.token' } });
    const unavailableResponse = await unavailable.inject({ method: 'GET', url: '/api/v1/me', headers: { authorization: 'Bearer bad.jwt.token' } });

    expect(rejectedResponse.statusCode).toBe(401);
    expect(unavailableResponse.statusCode).toBe(401);
    expect(unavailableResponse.payload).not.toContain('JWKS');
    await rejected.close();
    await unavailable.close();
  });

  it('AUTH-04: lists only verifier-derived actor workspaces through the injected read port', async () => {
    const seenActors: string[] = [];
    const app = buildApp(baseDependencies({
      authenticator: { verifyAccessToken: async () => actor },
      workspaceDirectory: {
        listForActor: async (verifiedActor) => {
          seenActors.push(verifiedActor.userId);
          return [{ id: 'workspace-a', name: 'Haven', slug: 'haven', role: 'operator' }];
        },
      },
    }));

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces',
      headers: { authorization: 'Bearer verified.jwt.token', 'x-workspace-id': 'workspace-b' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [{ id: 'workspace-a', name: 'Haven', slug: 'haven', role: 'operator' }] });
    expect(seenActors).toEqual([actor.userId]);
    await app.close();
  });

  it('AUTH-05: fails closed when the authenticator is not configured', async () => {
    const app = buildApp(baseDependencies());
    const response = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { authorization: 'Bearer verified.jwt.token' } });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
