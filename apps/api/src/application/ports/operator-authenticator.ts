/**
 * Server-side boundary for validating a Supabase access token.
 *
 * Implementations own JWT/JWKS verification. HTTP routes must never derive an
 * actor from request headers, decoded unverified payloads, or a service-role
 * credential.
 */
export interface AuthenticatedActor {
  userId: string;
  email?: string | null;
}

export interface OperatorAuthenticator {
  verifyAccessToken(accessToken: string): Promise<AuthenticatedActor | null>;
}
