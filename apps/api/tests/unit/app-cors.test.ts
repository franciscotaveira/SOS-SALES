import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/interfaces/http/app.js';

const originalAppEnv = process.env.APP_ENV;
const originalCorsOrigins = process.env.CORS_ALLOWED_ORIGINS;

function buildSecurityTestApp() {
  return buildApp({
    secretProvider: { getWebhookSecret: async () => null },
    wahaAdapter: {},
    ingestionGateway: {},
    logger: false,
  } as any);
}

afterEach(() => {
  if (originalAppEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = originalAppEnv;
  if (originalCorsOrigins === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
  else process.env.CORS_ALLOWED_ORIGINS = originalCorsOrigins;
});

describe('API CORS origin policy', () => {
  it('allows the production CRM origins without reflecting arbitrary origins', async () => {
    process.env.APP_ENV = 'production';
    delete process.env.CORS_ALLOWED_ORIGINS;
    const app = buildSecurityTestApp();
    await app.ready();

    const allowed = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://crm.iaparavendas.tech' },
    });
    const rejected = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.invalid' },
    });

    expect(allowed.statusCode).toBe(200);
    expect(allowed.headers['access-control-allow-origin']).toBe('https://crm.iaparavendas.tech');
    expect(rejected.statusCode).toBe(200);
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();

    await app.close();
  });

  it('uses an explicit configured allowlist in the Lab/local runtime', async () => {
    process.env.APP_ENV = 'lab';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3333, https://operator.example.test';
    const app = buildSecurityTestApp();
    await app.ready();

    const allowed = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://operator.example.test' },
    });
    const rejected = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:5173' },
    });

    expect(allowed.headers['access-control-allow-origin']).toBe('https://operator.example.test');
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();

    await app.close();
  });
});
