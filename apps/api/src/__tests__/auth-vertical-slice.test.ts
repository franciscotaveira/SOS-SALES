import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "@sos-sales/database";
import crypto from "node:crypto";
import { JwtIdentityProvider, type AuthUser } from "@sos-sales/auth";
import { buildApp } from "../index";
import type { FastifyInstance } from "fastify";

describe("Iteração 2.5: Vertical Slice Autenticado e Tenant-First", () => {
  const jwtSecret = "test_jwt_secret_key_minimum_32_characters_long!";
  const jwtProvider = new JwtIdentityProvider(jwtSecret);

  const ownerPool = new Pool({
    connectionString:
      process.env.MIGRATION_DATABASE_URL ||
      "postgresql://sos_migration_owner:sos_migration_secret_2026@localhost:55440/sos_sales_v3?sslmode=disable",
  });

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
    // 1. Initialize Fastify API with the test JWT secret
    app = await buildApp({ jwtSecret });

    // 2. Setup Organizations, Workspaces, and Users in DB via migration owner pool
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

    // 2.5 Setup Users in DB
    await ownerPool.query(
      `
      INSERT INTO users (id, email, name)
      VALUES 
        ($1, 'alpha@mct.br', 'User Alpha'),
        ($2, 'beta@mct.br', 'User Beta'),
        ($3, 'gamma@mct.br', 'User Gamma')
      ON CONFLICT (id) DO NOTHING;
    `,
      [userAlphaId, userBetaId, userGammaId]
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
    try {
      if (workspaceAId && workspaceBId) {
        await ownerPool.query("DELETE FROM audit_events WHERE workspace_id IN ($1, $2)", [
          workspaceAId,
          workspaceBId,
        ]);
        await ownerPool.query("DELETE FROM workspace_memberships WHERE workspace_id IN ($1, $2)", [
          workspaceAId,
          workspaceBId,
        ]);
        await ownerPool.query("DELETE FROM workspaces WHERE id IN ($1, $2)", [
          workspaceAId,
          workspaceBId,
        ]);
      }
      await ownerPool.query("DELETE FROM users WHERE id IN ($1, $2, $3)", [
        userAlphaId,
        userBetaId,
        userGammaId,
      ]);
      if (orgId) {
        await ownerPool.query("DELETE FROM organizations WHERE id = $1", [orgId]);
      }
    } finally {
      await app.close();
      await ownerPool.end();
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

  it("2. should reject request with 401 Unauthorized for malformed or expired tokens", async () => {
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
    expect(bodyMalformed.detail).toMatch(/invalid or expired/i);

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
    expect(bodyExpired.detail).toMatch(/invalid or expired/i);
  });

  it("3. should discover user and memberships on GET /v1/me with valid token", async () => {
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

  it("4. should allow member to access their workspace on GET /v1/workspaces/:workspaceId", async () => {
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

  it("5. should return 403 Forbidden when user attempts cross-tenant route access", async () => {
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

  it("6. should return 403 Forbidden when user passes forged X-Workspace-Id header", async () => {
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

  it("7. should record security audit event in database for rejected cross-tenant attempts", async () => {
    // Check audit_events table for the security event generated by userBetaId on workspaceAId
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
    expect(event.metadata).toBeDefined();
  });

  it("8. should enforce RBAC permissions (Operator cannot view workspace, Owner can manage)", async () => {
    // 8a. User Gamma has role 'operator' in Workspace A.
    // Operator does NOT possess 'workspace:view' permission.
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

    // 8b. User Alpha has role 'owner' in Workspace A.
    // Owner possesses 'workspace:manage' permission.
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

    // 8c. Operator attempts to update workspace (requires workspace:manage) -> Forbidden
    const resOperatorUpdate = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceAId}`,
      headers: {
        authorization: `Bearer ${userGammaToken}`,
        "content-type": "application/json",
      },
      payload: {
        name: "Hacked by Operator",
      },
    });

    expect(resOperatorUpdate.statusCode).toBe(403);
    const bodyOpUpdate = JSON.parse(resOperatorUpdate.body);
    expect(bodyOpUpdate.detail).toBe(
      "Role 'operator' does not possess required permission 'workspace:manage'"
    );
  });
});
