import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { SupabaseJwksIdentityProvider } from "../supabase-jwks-provider";

describe("AC10 Matrix: Supabase JWKS Provider Deterministic Tests", () => {
  let server: http.Server;
  let serverPort: number;
  let jwksUri: string;
  const testIssuer = "https://mock-supabase.mct.br/auth/v1";
  const testAudience = "authenticated";

  let key1: any;
  let key2: any;
  let jwk1: any;
  let jwk2: any;

  let requestCount = 0;
  let activeKeys: any[] = [];

  beforeAll(async () => {
    // Generate two RSA keypairs
    const kp1 = await generateKeyPair("RS256");
    const kp2 = await generateKeyPair("RS256");

    key1 = kp1.privateKey;
    key2 = kp2.privateKey;

    jwk1 = await exportJWK(kp1.publicKey);
    jwk1.kid = "key-version-1";
    jwk1.alg = "RS256";
    jwk1.use = "sig";

    jwk2 = await exportJWK(kp2.publicKey);
    jwk2.kid = "key-version-2";
    jwk2.alg = "RS256";
    jwk2.use = "sig";

    activeKeys = [jwk1];

    // Local controlled HTTP server serving JWKS
    server = http.createServer((req, res) => {
      if (req.url === "/.well-known/jwks.json") {
        requestCount++;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ keys: activeKeys }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        jwksUri = `http://127.0.0.1:${serverPort}/.well-known/jwks.json`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("1. should detect keystore unavailability and return provider_unavailable without fallback (AC10)", async () => {
    const unreachableProvider = new SupabaseJwksIdentityProvider({
      type: "supabase-jwks",
      jwksUri: "http://127.0.0.1:59998/.well-known/jwks.json", // Unreachable port
      issuer: testIssuer,
      audience: testAudience,
    });

    const token = await new SignJWT({ sub: "00000000-0000-0000-0000-000000000001", email: "user@mct.br" })
      .setProtectedHeader({ alg: "RS256", kid: "key-version-1" })
      .setIssuedAt()
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("1h")
      .sign(key1);

    const result = await unreachableProvider.verifyTokenDetailed(token);
    expect(result.status).toBe("provider_unavailable");
    if (result.status === "provider_unavailable") {
      expect(result.reason).toMatch(/unreachable/i);
    }
  });

  it("2. should reject token signed with untrusted/unmatched key with invalid status (AC10)", async () => {
    const provider = new SupabaseJwksIdentityProvider({
      type: "supabase-jwks",
      jwksUri,
      issuer: testIssuer,
      audience: testAudience,
    });

    // Generate an unrelated attacker key not in JWKS
    const attackerKp = await generateKeyPair("RS256");
    const forgedToken = await new SignJWT({ sub: "00000000-0000-0000-0000-000000000001", email: "attacker@mct.br" })
      .setProtectedHeader({ alg: "RS256", kid: "key-version-1" }) // Claims kid 1, but signed with attacker key!
      .setIssuedAt()
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("1h")
      .sign(attackerKp.privateKey);

    const result = await provider.verifyTokenDetailed(forgedToken);
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.reason).toMatch(/signature verification failed/i);
    }
  });

  it("3. should cache remote JWKS and perform zero additional network requests for subsequent tokens (AC10)", async () => {
    const provider = new SupabaseJwksIdentityProvider({
      type: "supabase-jwks",
      jwksUri,
      issuer: testIssuer,
      audience: testAudience,
    });

    const initialRequests = requestCount;

    // Token A
    const tokenA = await new SignJWT({ sub: "00000000-0000-0000-0000-000000000001", email: "alice@mct.br" })
      .setProtectedHeader({ alg: "RS256", kid: "key-version-1" })
      .setIssuedAt()
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("1h")
      .sign(key1);

    const resA = await provider.verifyTokenDetailed(tokenA);
    expect(resA.status).toBe("valid");
    if (resA.status === "valid") {
      expect(resA.user.email).toBe("alice@mct.br");
    }
    const requestsAfterA = requestCount;
    expect(requestsAfterA).toBeGreaterThan(initialRequests); // Made initial network fetch

    // Token B (signed with the same key)
    const tokenB = await new SignJWT({ sub: "00000000-0000-0000-0000-000000000002", email: "bob@mct.br" })
      .setProtectedHeader({ alg: "RS256", kid: "key-version-1" })
      .setIssuedAt()
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("1h")
      .sign(key1);

    const resB = await provider.verifyTokenDetailed(tokenB);
    expect(resB.status).toBe("valid");
    if (resB.status === "valid") {
      expect(resB.user.email).toBe("bob@mct.br");
    }
    expect(requestCount).toBe(requestsAfterA); // ZERO additional requests! Served from cache!
  });

  it("4. should handle key rotation: cache miss on new kid triggers fresh JWKS fetch and verifies new key (AC10)", async () => {
    const provider = new SupabaseJwksIdentityProvider({
      type: "supabase-jwks",
      jwksUri,
      issuer: testIssuer,
      audience: testAudience,
    });

    // Rotate keys on the JWKS server
    activeKeys = [jwk1, jwk2];

    const beforeRotationRequests = requestCount;

    // Token signed with rotated key2 (kid: key-version-2)
    const tokenRotated = await new SignJWT({ sub: "00000000-0000-0000-0000-000000000003", email: "carol@mct.br" })
      .setProtectedHeader({ alg: "RS256", kid: "key-version-2" })
      .setIssuedAt()
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("1h")
      .sign(key2);

    const result = await provider.verifyTokenDetailed(tokenRotated);
    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(result.user.email).toBe("carol@mct.br");
    }

    // Must have refreshed JWKS from server to discover key-version-2
    expect(requestCount).toBeGreaterThan(beforeRotationRequests);
  });
});
