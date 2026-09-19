import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDatabasePools } from "@sos-sales/database";
import crypto from "node:crypto";
import {
  JwtIdentityProvider,
  SignJWT,
  generateKeyPair,
  type AuthUser,
} from "@sos-sales/auth";
import { buildApp } from "../index";
import type { FastifyInstance } from "fastify";

describe("Iteração 2.7: Vertical Slice Autenticado, Tenancy e Testes Isolados", () => {
  const jwtSecret = "test_jwt_secret_key_minimum_32_characters_long_2026!";
  const testIssuer = "sos-sales-test";
  const testAudience = "sos-sales-api-test";

  const jwtProvider = new JwtIdentityProvider({
    type: "local-jwt",
    secret: jwtSecret,
    issuer: testIssuer,
    audience: testAudience,
  });

  // Isolated test pools strictly pointing to sos_sales_v3_test
  const { appPool, ownerPool } = createTestDatabasePools();

  let app: FastifyInstance;

  let workspaceAId: string;
  let workspaceBId: string;
  let orgId: string;

  const userAlphaId = crypto.randomUUID();
  const userBetaId = crypto.randomUUID();
  const userGammaId = crypto.randomUUID();

  let userAlphaToken: string;
  let userBetaToken: string;
  let userGammaToken: string;
  let expiredAlphaToken: string;

  beforeAll(async () => {
    // 1. Initialize Fastify API with explicit local-jwt provider
    app = await buildApp({
      providerType: "local-jwt",
      jwtSecret,
      issuer: testIssuer,
      audience: testAudience,
    });

    // 2. Setup Organizations, Workspaces, and Users in test DB via migration owner pool
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('Auth Slice Test Org', 'auth-slice-test-org-${Date.now()}')
      RETURNING id;
    `);
    orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(
      `
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Alpha Workspace', 'alpha-ws-${Date.now()}')
      RETURNING id;
    `,
      [orgId]
    );
    workspaceAId = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(
      `
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Beta Workspace', 'beta-ws-${Date.now()}')
      RETURNING id;
    `,
      [orgId]
    );
    workspaceBId = wsBRes.rows[0].id;

    // 2.5 Setup Users in DB with unique emails per suite run
    const emailAlpha = `alpha-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@mct.br`;
    const emailBeta = `beta-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@mct.br`;
    const emailGamma = `gamma-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@mct.br`;

    await ownerPool.query(
      `
      INSERT INTO users (id, email, name)
      VALUES 
        ($1, $4, 'User Alpha'),
        ($2, $5, 'User Beta'),
        ($3, $6, 'User Gamma')
      ON CONFLICT (id) DO NOTHING;
    `,
      [userAlphaId, userBetaId, userGammaId, emailAlpha, emailBeta, emailGamma]
    );

    // 3. Setup Memberships:
    // Alpha: Owner in Workspace A
    await ownerPool.query(
      `
      INSERT INTO workspace_memberships (workspace_id, user_id, role)
      VALUES ($1, $2, 'owner');
    `,
      [workspaceAId, userAlphaId]
    );

    // Beta: Manager in Workspace B
    await ownerPool.query(
      `
      INSERT INTO workspace_memberships (workspace_id, user_id, role)
      VALUES ($1, $2, 'manager');
    `,
      [workspaceBId, userBetaId]
    );

    // Gamma: Operator in Workspace A (has cockpit:access, but NOT workspace:view or workspace:manage)
    await ownerPool.query(
      `
      INSERT INTO workspace_memberships (workspace_id, user_id, role)
      VALUES ($1, $2, 'operator');
    `,
      [workspaceAId, userGammaId]
    );

    // 4. Generate JWT Tokens
    const userAlpha: AuthUser = {
      id: userAlphaId,
      email: "alpha@mct.br",
      role: "owner",
      workspaceId: workspaceAId,
    };
    userAlphaToken = await jwtProvider.generateToken(userAlpha, 3600);
    expiredAlphaToken = await jwtProvider.generateToken(userAlpha, -3600); // Expired 1 hour ago

    const userBeta: AuthUser = {
      id: userBetaId,
      email: "beta@mct.br",
      role: "manager",
      workspaceId: workspaceBId,
    };
    userBetaToken = await jwtProvider.generateToken(userBeta, 3600);

    const userGamma: AuthUser = {
      id: userGammaId,
      email: "gamma@mct.br",
      role: "operator",
      workspaceId: workspaceAId,
    };
    userGammaToken = await jwtProvider.generateToken(userGamma, 3600);
  });

  afterAll(async () => {
    // Isolated test database: ZERO calls to DISABLE TRIGGER. Triggers remain active 100% of the time.
    try {
      await app.close();
    } finally {
      await ownerPool.end();
      await appPool.end();
    }
  });

  it("1. should reject request with 401 Unauthorized when no token is provided", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/me",
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.type).toBe("https://sos-sales.mct.br/errors/unauthorized");
    expect(body.title).toBe("Unauthorized");
    expect(body.detail).toMatch(/missing or invalid bearer/i);
    expect(body.correlationId).toBeDefined();
  });

  it("2. should reject request with 401 Unauthorized for malformed, tampered, or expired tokens", async () => {
    // Malformed token
    const resMalformed = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        authorization: "Bearer totally.invalid.jwt.token",
      },
    });
    expect(resMalformed.statusCode).toBe(401);
    const bodyMalformed = JSON.parse(resMalformed.body);
    expect(bodyMalformed.detail).toMatch(/invalid|expired/i);

    // Expired token
    const resExpired = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        authorization: `Bearer ${expiredAlphaToken}`,
      },
    });
    expect(resExpired.statusCode).toBe(401);
    const bodyExpired = JSON.parse(resExpired.body);
    expect(bodyExpired.detail).toMatch(/invalid|expired/i);
  });

  it("3. should reject correctly signed token with wrong issuer (AC05)", async () => {
    const secretBytes = new TextEncoder().encode(jwtSecret);
    const tokenWrongIssuer = await new SignJWT({
      email: "alpha@mct.br",
      role: "owner",
      workspace_id: workspaceAId,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userAlphaId)
      .setIssuedAt()
      .setExpirationTime("1h")
      .setIssuer("untrusted-wrong-issuer")
      .setAudience(testAudience)
      .sign(secretBytes);

    const res = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        authorization: `Bearer ${tokenWrongIssuer}`,
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.detail).toMatch(/invalid, untrusted or expired/i);
  });

  it("4. should reject correctly signed token with wrong audience (AC06)", async () => {
    const secretBytes = new TextEncoder().encode(jwtSecret);
    const tokenWrongAud = await new SignJWT({
      email: "alpha@mct.br",
      role: "owner",
      workspace_id: workspaceAId,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userAlphaId)
      .setIssuedAt()
      .setExpirationTime("1h")
      .setIssuer(testIssuer)
      .setAudience("untrusted-wrong-audience")
      .sign(secretBytes);

    const res = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        authorization: `Bearer ${tokenWrongAud}`,
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.detail).toMatch(/invalid, untrusted or expired/i);
  });

  it("5. should reject token lacking mandatory claims or with alg: none (AC07)", async () => {
    // 5a. Missing exp
    const secretBytes = new TextEncoder().encode(jwtSecret);
    const tokenNoExp = await new SignJWT({
      email: "alpha@mct.br",
      role: "owner",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userAlphaId)
      .setIssuedAt()
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .sign(secretBytes);

    const resNoExp = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${tokenNoExp}` },
    });
    expect(resNoExp.statusCode).toBe(401);

    // 5b. alg: none
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: userAlphaId,
        email: "alpha@mct.br",
        iss: testIssuer,
        aud: testAudience,
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString("base64url");
    const tokenAlgNone = `${header}.${payload}.`;

    const resAlgNone = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${tokenAlgNone}` },
    });
    expect(resAlgNone.statusCode).toBe(401);
  });

  it("6. should reject token with non-UUID subject with 401 before database query (AC07)", async () => {
    const secretBytes = new TextEncoder().encode(jwtSecret);
    const tokenNonUuid = await new SignJWT({
      email: "alpha@mct.br",
      role: "owner",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject("not-a-valid-uuid-format-attacker")
      .setIssuedAt()
      .setExpirationTime("1h")
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .sign(secretBytes);

    const res = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${tokenNonUuid}` },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.detail).toMatch(/subject claim is not a valid uuid/i);
  });

  it("7. should reject token signed with old default dev secret (AC08)", async () => {
    const oldDefaultSecret = "sos_v3_default_dev_secret_key_min32chars!";
    const attackerSecretBytes = new TextEncoder().encode(oldDefaultSecret);
    const attackerToken = await new SignJWT({
      email: "attacker@mct.br",
      role: "owner",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userAlphaId)
      .setIssuedAt()
      .setExpirationTime("1h")
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .sign(attackerSecretBytes);

    const res = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${attackerToken}` },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.detail).toMatch(/invalid, untrusted or expired/i);
  });

  it("8. should discover user and memberships on GET /v1/me with valid token (AC04 - positive control)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        authorization: `Bearer ${userAlphaToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.id).toBe(userAlphaId);
    expect(body.user.email).toBe("alpha@mct.br");
    expect(body.user.activeRole).toBe("owner");
    expect(body.user.activeWorkspaceId).toBe(workspaceAId);
    expect(body.workspaces).toHaveLength(1);
    expect(body.workspaces[0].id).toBe(workspaceAId);
    expect(body.workspaces[0].role).toBe("owner");
    expect(body.workspaces[0].name).toBe("Alpha Workspace");
  });

  it("9. should allow member to access their workspace on GET /v1/workspaces/:workspaceId (AC04)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}`,
      headers: {
        authorization: `Bearer ${userAlphaToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.workspace.id).toBe(workspaceAId);
    expect(body.workspace.name).toBe("Alpha Workspace");
    expect(body.workspace.status).toBe("active");
    expect(body.membership.role).toBe("owner");
  });

  it("10. should return 403 Forbidden when user attempts cross-tenant route access (AC09)", async () => {
    // Beta is member of Workspace B, attempting to access Workspace A route
    const res = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}`,
      headers: {
        authorization: `Bearer ${userBetaToken}`,
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.type).toBe("https://sos-sales.mct.br/errors/forbidden");
    expect(body.detail).toBe("Access denied to target workspace");
  });

  it("11. should return 403 Forbidden when user passes forged X-Workspace-Id header (AC09)", async () => {
    // Beta passes X-Workspace-Id header of Workspace A
    const res = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        authorization: `Bearer ${userBetaToken}`,
        "x-workspace-id": workspaceAId,
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.type).toBe("https://sos-sales.mct.br/errors/forbidden");
    expect(body.detail).toBe("User is not a member of the requested workspace");
  });

  it("12. should NOT elevate privileges from self-declared role in token (AC09)", async () => {
    // User Gamma is an 'operator' in DB. Even if token self-declares role: 'owner', DB role prevails!
    const secretBytes = new TextEncoder().encode(jwtSecret);
    const spoofedToken = await new SignJWT({
      email: "gamma@mct.br",
      role: "owner", // Self-declared spoofed role in token payload
      workspace_id: workspaceAId,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userGammaId) // Gamma is operator in DB
      .setIssuedAt()
      .setExpirationTime("1h")
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .sign(secretBytes);

    const res = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${spoofedToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Verified: activeRole comes from database membership ('operator'), NOT from token claims!
    expect(body.user.activeRole).toBe("operator");
    expect(body.workspaces[0].role).toBe("operator");
  });

  it("13. should record security audit event in database for rejected cross-tenant attempts (AC09)", async () => {
    const auditRes = await ownerPool.query(
      `
      SELECT id, workspace_id, actor_id, action, resource_type, resource_id, metadata
      FROM audit_events
      WHERE actor_id = $1 AND workspace_id = $2
      ORDER BY created_at DESC
      LIMIT 1;
    `,
      [userBetaId, workspaceAId]
    );

    expect(auditRes.rows.length).toBe(1);
    const event = auditRes.rows[0];
    expect(event.action).toBe("security.cross_tenant_access_denied");
    expect(event.actor_id).toBe(userBetaId);
    expect(event.workspace_id).toBe(workspaceAId);
    expect(event.resource_type).toBe("workspace");
  });

  it("14. should enforce RBAC permissions (Operator cannot view workspace, Owner can manage)", async () => {
    // 14a. Operator in Workspace A does NOT possess 'workspace:view'
    const resOperator = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}`,
      headers: {
        authorization: `Bearer ${userGammaToken}`,
      },
    });

    expect(resOperator.statusCode).toBe(403);
    const bodyOperator = JSON.parse(resOperator.body);
    expect(bodyOperator.detail).toBe(
      "Role 'operator' does not possess required permission 'workspace:view'"
    );

    // 14b. Owner in Workspace A possesses 'workspace:manage'
    const resOwnerUpdate = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceAId}`,
      headers: {
        authorization: `Bearer ${userAlphaToken}`,
        "content-type": "application/json",
      },
      payload: {
        name: "Alpha Workspace Renamed by Owner",
      },
    });

    expect(resOwnerUpdate.statusCode).toBe(200);
    const bodyUpdated = JSON.parse(resOwnerUpdate.body);
    expect(bodyUpdated.workspace.name).toBe("Alpha Workspace Renamed by Owner");
  });

  it("15. should strictly reject TRUNCATE, UPDATE or DELETE on audit_events by runtime role and owner trigger (AC11)", async () => {
    // 1. Runtime role (sos_app_user): TRUNCATE, DELETE, UPDATE must be rejected by table permissions
    await expect(
      appPool.query("TRUNCATE audit_events;")
    ).rejects.toThrow(/permission denied for table audit_events/i);

    await expect(
      appPool.query(
        "DELETE FROM audit_events WHERE workspace_id = $1",
        [workspaceAId]
      )
    ).rejects.toThrow(/permission denied for table audit_events/i);

    await expect(
      appPool.query(
        "UPDATE audit_events SET action = 'tampered' WHERE workspace_id = $1",
        [workspaceAId]
      )
    ).rejects.toThrow(/permission denied for table audit_events/i);

    // 2. Migration owner (sos_migration_owner): UPDATE and DELETE rejected by immutable trigger
    await expect(
      ownerPool.query(
        "UPDATE audit_events SET action = 'tampered' WHERE workspace_id = $1",
        [workspaceAId]
      )
    ).rejects.toThrow(/immutable append-only ledger/i);

    await expect(
      ownerPool.query(
        "DELETE FROM audit_events WHERE workspace_id = $1",
        [workspaceAId]
      )
    ).rejects.toThrow(/immutable append-only ledger/i);
  });

  it("16. should fail fast during API initialization if AUTH_PROVIDER is missing or invalid (AC01)", async () => {
    // Missing provider
    await expect(
      buildApp({
        providerType: "" as any,
      })
    ).rejects.toThrow(/AUTH_PROVIDER must be explicitly configured/i);

    // Invalid provider
    await expect(
      buildApp({
        providerType: "unsupported-provider" as any,
      })
    ).rejects.toThrow(/AUTH_PROVIDER must be explicitly configured/i);
  });

  it("17. should use declared provider even if residual variables from another mode exist (AC02)", async () => {
    // When local-jwt is declared, residual SUPABASE_URL does not override it
    const testApp = await buildApp({
      providerType: "local-jwt",
      jwtSecret: "a_valid_secret_for_this_test_that_is_long_enough_32",
      issuer: "local-issuer",
      audience: "local-audience",
      supabaseUrl: "https://residual-unused-project.supabase.co",
    });

    expect(testApp).toBeDefined();
    await testApp.close();
  });

  it("18. should fail fast during API initialization if local-jwt lacks secret, issuer, or audience (AC03)", async () => {
    // Short secret
    await expect(
      buildApp({
        providerType: "local-jwt",
        jwtSecret: "short",
        issuer: "test-iss",
        audience: "test-aud",
      })
    ).rejects.toThrow(/at least 32 characters/i);

    // Missing issuer
    await expect(
      buildApp({
        providerType: "local-jwt",
        jwtSecret: "a_valid_secret_for_this_test_that_is_long_enough_32",
        issuer: "",
        audience: "test-aud",
      })
    ).rejects.toThrow(/AUTH_ISSUER must be explicitly provided/i);

    // Missing audience
    await expect(
      buildApp({
        providerType: "local-jwt",
        jwtSecret: "a_valid_secret_for_this_test_that_is_long_enough_32",
        issuer: "test-iss",
        audience: "",
      })
    ).rejects.toThrow(/AUTH_AUDIENCE must be explicitly provided/i);
  });

  it("19. should return 503 Service Unavailable when supabase-jwks mode cannot reach remote keystore (AC10)", async () => {
    // Generate valid RS256 token matching issuer and audience to trigger remote JWKS fetch
    const { privateKey } = await generateKeyPair("RS256");
    const testJwksIssuer = "https://nonexistent-project-timeout-test.supabase.co/auth/v1";
    const rs256Token = await new SignJWT({
      sub: userAlphaId,
      email: "alpha@mct.br",
      role: "authenticated",
    })
      .setProtectedHeader({ alg: "RS256", kid: "remote-key-1" })
      .setIssuedAt()
      .setIssuer(testJwksIssuer)
      .setAudience("authenticated")
      .setExpirationTime("2h")
      .sign(privateKey);

    const mockApp = await buildApp({
      providerType: "supabase-jwks",
      supabaseUrl: "https://nonexistent-project-timeout-test.supabase.co",
      jwksUri: "http://127.0.0.1:59999/.well-known/jwks.json", // Unreachable port -> ECONNREFUSED
      issuer: testJwksIssuer,
      audience: "authenticated",
    });

    const res = await mockApp.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        authorization: `Bearer ${rs256Token}`,
      },
    });

    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.type).toBe("https://sos-sales.mct.br/errors/service-unavailable");
    expect(body.title).toBe("Service Unavailable");
    expect(body.detail).toMatch(/temporarily unreachable/i);

    await mockApp.close();
  });
});
