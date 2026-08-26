import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { AuthenticatedActor, OperatorAuthenticator } from '../../application/ports/operator-authenticator.js';

export interface SupabaseJwtVerifier {
  verify(accessToken: string): Promise<JWTPayload>;
}
export interface SupabaseJwtAuthenticatorOptions {
  issuer: string;
  jwksUrl: string;
  audience?: string;
  verifier?: SupabaseJwtVerifier;
}

function requireAbsoluteUrl(value: string, name: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
}

function isSupabaseUserId(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function createJoseVerifier(options: Required<Pick<SupabaseJwtAuthenticatorOptions, 'issuer' | 'jwksUrl' | 'audience'>>): SupabaseJwtVerifier {
  const jwks = createRemoteJWKSet(requireAbsoluteUrl(options.jwksUrl, 'SUPABASE_JWKS_URL'));
  return {
    async verify(accessToken: string): Promise<JWTPayload> {
      const result = await jwtVerify(accessToken, jwks, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: ['ES256', 'RS256'],
      });
      return result.payload;
    },
  };
}

/**
 * Verifies Supabase access JWTs against a configured JWKS endpoint. The raw
 * token never crosses this adapter boundary and is never logged.
 */
export class SupabaseJwtAuthenticator implements OperatorAuthenticator {
  private readonly verifier: SupabaseJwtVerifier;

  constructor(options: SupabaseJwtAuthenticatorOptions) {
    const issuer = options.issuer?.trim();
    const jwksUrl = options.jwksUrl?.trim();
    const audience = options.audience?.trim() || 'authenticated';
    if (!issuer || !jwksUrl) {
      throw new Error('SUPABASE_JWT_ISSUER and SUPABASE_JWKS_URL are required');
    }
    requireAbsoluteUrl(issuer, 'SUPABASE_JWT_ISSUER');
    this.verifier = options.verifier ?? createJoseVerifier({ issuer, jwksUrl, audience });
  }

  async verifyAccessToken(accessToken: string): Promise<AuthenticatedActor | null> {
    const payload = await this.verifier.verify(accessToken);
    if (!isSupabaseUserId(payload.sub)) return null;
    const email = typeof payload.email === 'string' && payload.email.length <= 320
      ? payload.email
      : null;
    return { userId: payload.sub, email };
  }
}
