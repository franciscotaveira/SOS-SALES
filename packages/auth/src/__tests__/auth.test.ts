import { describe, it, expect } from "vitest";
import { JwtIdentityProvider } from "../jwt-provider";
import { SupabaseJwksIdentityProvider } from "../supabase-jwks-provider";
import { createIdentityProvider } from "../provider-factory";
import { RbacAuthorizationPolicy } from "../rbac-policy";
import type { AuthUser } from "../types";
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from "jose";

describe("JwtIdentityProvider (Hardened Security)", () => {
  const validSecret = "test_super_secret_key_32_characters_minimum!";
  const provider = new JwtIdentityProvider({
    type: "jwt",
    secret: validSecret,
    issuer: "sos-sales-test",
    audience: "sos-sales-api",
  });

  const testUser: AuthUser = {
    id: "user-123",
    email: "operator@mct.br",
    role: "operator",
    workspaceId: "workspace-abc",
  };

  it("should reject initialization if secret is missing or shorter than 32 characters (no fallback allowed)", () => {
    expect(() => new JwtIdentityProvider("short-secret")).toThrow(/at least 32 characters/i);
    expect(() => new JwtIdentityProvider("")).toThrow(/at least 32 characters/i);
    expect(
      () =>
        new JwtIdentityProvider({
          type: "local-jwt",
          secret: "1234567890123456789012345678901",
          issuer: "sos-sales-v3",
          audience: "sos-sales-api",
        })
    ).toThrow(/at least 32 characters/i);
  });

  it("should generate a valid JWT token and verify it back to the original user", async () => {
    const token = await provider.generateToken(testUser, 3600);
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);

    const verified = await provider.verifyToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.id).toBe(testUser.id);
    expect(verified?.email).toBe(testUser.email);
    expect(verified?.role).toBe(testUser.role);
    expect(verified?.workspaceId).toBe(testUser.workspaceId);
  });

  it("should reject a tampered token signature", async () => {
    const token = await provider.generateToken(testUser, 3600);
    const parts = token.split(".");
    const header = parts[0]!;
    const payload = parts[1]!;
    const sig = parts[2]!;
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), role: "owner" })
    ).toString("base64url");

    const tamperedToken = `${header}.${tamperedPayload}.${sig}`;
    const verified = await provider.verifyToken(tamperedToken);
    expect(verified).toBeNull();
  });

  it("should reject an expired token", async () => {
    const token = await provider.generateToken(testUser, -10);
    const verified = await provider.verifyToken(token);
    expect(verified).toBeNull();
  });

  it("should reject a token that lacks an expiration claim (exp is mandatory)", async () => {
    const secretBytes = new TextEncoder().encode(validSecret);
    const tokenWithoutExp = await new SignJWT({
      email: testUser.email,
      role: testUser.role,
      workspace_id: testUser.workspaceId,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(testUser.id)
      .setIssuedAt()
      .setIssuer("sos-sales-test")
      .setAudience("sos-sales-api")
      .sign(secretBytes);

    const verified = await provider.verifyToken(tokenWithoutExp);
    expect(verified).toBeNull();
  });

  it("should reject token with alg: 'none' or algorithm confusion", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: testUser.id,
        email: testUser.email,
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString("base64url");
    const insecureToken = `${header}.${payload}.`;

    const verified = await provider.verifyToken(insecureToken);
    expect(verified).toBeNull();
  });

  it("should reject token with mismatched issuer or audience", async () => {
    const secretBytes = new TextEncoder().encode(validSecret);
    const mismatchedToken = await new SignJWT({
      email: testUser.email,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(testUser.id)
      .setIssuedAt()
      .setExpirationTime("1h")
      .setIssuer("untrusted-issuer")
      .setAudience("wrong-audience")
      .sign(secretBytes);

    const verified = await provider.verifyToken(mismatchedToken);
    expect(verified).toBeNull();
  });

  it("should reject malformed token strings", async () => {
    expect(await provider.verifyToken("not-a-token")).toBeNull();
    expect(await provider.verifyToken("")).toBeNull();
  });
});

describe("SupabaseJwksIdentityProvider (ADR-002 Compliance)", () => {
  it("should verify authentic Supabase token signed with asymmetric RS256 key via JWKS", async () => {
    // 1. Generate an RSA key pair to simulate Supabase Auth JWKS
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "supabase-test-key-1";
    publicJwk.alg = "RS256";

    // 2. Create local JWKSet resolver simulating cached JWKS
    const localJwks = createLocalJWKSet({ keys: [publicJwk] });

    const supabaseProvider = new SupabaseJwksIdentityProvider(
      {
        type: "supabase_jwks",
        jwksUri: "https://test.supabase.co/auth/v1/.well-known/jwks.json",
        issuer: "https://test.supabase.co/auth/v1",
        audience: "authenticated",
      },
      localJwks as any
    );

    // 3. Issue valid Supabase token
    const token = await new SignJWT({
      email: "supabase_user@mct.br",
      app_metadata: { role: "admin", workspace_id: "ws-supabase-999" },
      user_metadata: { full_name: "Supabase User" },
    })
      .setProtectedHeader({ alg: "RS256", kid: "supabase-test-key-1", typ: "JWT" })
      .setSubject("user-supabase-uuid-1234")
      .setIssuedAt()
      .setExpirationTime("1h")
      .setIssuer("https://test.supabase.co/auth/v1")
      .setAudience("authenticated")
      .sign(privateKey);

    const verified = await supabaseProvider.verifyToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.id).toBe("user-supabase-uuid-1234");
    expect(verified?.email).toBe("supabase_user@mct.br");
    expect(verified?.role).toBe("admin");
    expect(verified?.workspaceId).toBe("ws-supabase-999");
  });

  it("should reject Supabase token signed with unauthorized/unregistered key", async () => {
    const { publicKey } = await generateKeyPair("RS256");
    const { privateKey: attackerKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "legitimate-key";

    const localJwks = createLocalJWKSet({ keys: [publicJwk] });
    const supabaseProvider = new SupabaseJwksIdentityProvider(
      {
        type: "supabase_jwks",
        jwksUri: "https://test.supabase.co/auth/v1/.well-known/jwks.json",
        issuer: "https://test.supabase.co/auth/v1",
        audience: "authenticated",
      },
      localJwks as any
    );

    const forgedToken = await new SignJWT({
      email: "attacker@mct.br",
    })
      .setProtectedHeader({ alg: "RS256", kid: "legitimate-key" })
      .setSubject("attacker-123")
      .setIssuedAt()
      .setExpirationTime("1h")
      .setIssuer("https://test.supabase.co/auth/v1")
      .setAudience("authenticated")
      .sign(attackerKey);

    const verified = await supabaseProvider.verifyToken(forgedToken);
    expect(verified).toBeNull();
  });
});

describe("createIdentityProvider Factory", () => {
  it("should instantiate JwtIdentityProvider when type is 'jwt'", () => {
    const provider = createIdentityProvider({
      type: "jwt",
      secret: "012345678901234567890123456789012",
      issuer: "sos-sales-v3",
      audience: "sos-sales-api",
    });
    expect(provider).toBeInstanceOf(JwtIdentityProvider);
  });

  it("should instantiate SupabaseJwksIdentityProvider when type is 'supabase_jwks'", () => {
    const provider = createIdentityProvider({
      type: "supabase_jwks",
      jwksUri: "https://test.supabase.co/auth/v1/.well-known/jwks.json",
      issuer: "https://test.supabase.co/auth/v1",
      audience: "authenticated",
    });
    expect(provider).toBeInstanceOf(SupabaseJwksIdentityProvider);
  });
});

describe("RbacAuthorizationPolicy", () => {
  const policy = new RbacAuthorizationPolicy();

  const operatorUser: AuthUser = {
    id: "user-op",
    email: "op@mct.br",
    role: "operator",
    workspaceId: "workspace-1",
  };

  const ownerUser: AuthUser = {
    id: "user-owner",
    email: "owner@mct.br",
    role: "owner",
    workspaceId: "workspace-1",
  };

  it("should permit operators to access cockpit and send messages", () => {
    expect(policy.hasPermission(operatorUser, "cockpit:access")).toBe(true);
    expect(policy.hasPermission(operatorUser, "cockpit:send_message")).toBe(true);
  });

  it("should forbid operators from managing integrations or dispatching CAPI directly", () => {
    expect(policy.hasPermission(operatorUser, "integration:manage")).toBe(false);
    expect(policy.hasPermission(operatorUser, "capi:dispatch")).toBe(false);
  });

  it("should permit owner to manage integrations and dispatch CAPI", () => {
    expect(policy.hasPermission(ownerUser, "integration:manage")).toBe(true);
    expect(policy.hasPermission(ownerUser, "capi:dispatch")).toBe(true);
  });

  it("should enforce strict workspace boundary via canAccessWorkspace", () => {
    expect(policy.canAccessWorkspace(operatorUser, "workspace-1")).toBe(true);
    expect(policy.canAccessWorkspace(operatorUser, "workspace-2")).toBe(false);
  });
});
