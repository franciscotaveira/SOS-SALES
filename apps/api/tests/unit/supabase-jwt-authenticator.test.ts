import { describe, expect, it } from 'vitest';
import { SupabaseJwtAuthenticator } from '../../src/infrastructure/security/supabase-jwt-authenticator.js';

const userId = '72d9da82-7d10-4c96-a6f5-07c838db5ad4';

describe('SupabaseJwtAuthenticator', () => {
  it('maps only verifier-approved Supabase claims into an actor', async () => {
    const authenticator = new SupabaseJwtAuthenticator({
      issuer: 'https://project.supabase.co/auth/v1',
      jwksUrl: 'https://project.supabase.co/auth/v1/.well-known/jwks.json',
      verifier: { verify: async () => ({ sub: userId, email: 'operator@example.test' }) },
    });

    await expect(authenticator.verifyAccessToken('header.payload.signature')).resolves.toEqual({
      userId,
      email: 'operator@example.test',
    });
  });

  it('fails closed when verified claims do not contain a Supabase UUID subject', async () => {
    const authenticator = new SupabaseJwtAuthenticator({
      issuer: 'https://project.supabase.co/auth/v1',
      jwksUrl: 'https://project.supabase.co/auth/v1/.well-known/jwks.json',
      verifier: { verify: async () => ({ sub: 'attacker-controlled-subject' }) },
    });

    await expect(authenticator.verifyAccessToken('header.payload.signature')).resolves.toBeNull();
  });

  it('rejects incomplete or malformed JWKS configuration before serving requests', () => {
    expect(() => new SupabaseJwtAuthenticator({ issuer: '', jwksUrl: '' })).toThrow(/required/);
    expect(() => new SupabaseJwtAuthenticator({ issuer: 'not-a-url', jwksUrl: 'https://project.test/jwks' })).toThrow(/absolute URL/);
  });
});
