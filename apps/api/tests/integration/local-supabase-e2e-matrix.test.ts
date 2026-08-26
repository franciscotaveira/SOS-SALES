import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { SignJWT, generateKeyPair } from 'jose';
import { randomUUID } from 'crypto';
import { buildApp } from '../../src/interfaces/http/app.js';
import { SupabaseJwtAuthenticator } from '../../src/infrastructure/security/supabase-jwt-authenticator.js';
import { PostgresWorkspaceDirectory } from '../../src/infrastructure/database/postgres-workspace-directory.js';
import { PostgresCockpitReadGateway } from '../../src/infrastructure/database/postgres-cockpit-read-gateway.js';
import { PostgresNotesGateway } from '../../src/infrastructure/database/postgres-notes-gateway.js';
import { PostgresAppointmentGateway } from '../../src/infrastructure/database/postgres-appointment-gateway.js';
import { PostgresHandoffOperationsGateway } from '../../src/infrastructure/database/postgres-handoff-operations-gateway.js';
import { PostgresJourneyOperationsGateway } from '../../src/infrastructure/database/postgres-journey-operations-gateway.js';
import { PostgresCommercialOutcomeGateway } from '../../src/infrastructure/database/postgres-commercial-outcome-gateway.js';
import { PostgresOutboundDispatchGateway } from '../../src/infrastructure/database/postgres-outbound-dispatch-gateway.js';
import { PostgresTrafficProofGateway } from '../../src/infrastructure/database/postgres-traffic-proof-gateway.js';
import { PostgresKnownFactOperationsGateway } from '../../src/infrastructure/database/postgres-known-fact-operations-gateway.js';
import { PostgresWorkspaceProvisioningGateway } from '../../src/infrastructure/database/postgres-workspace-provisioning-gateway.js';
import { EnvironmentWebhookSecretProvider } from '../../src/infrastructure/security/environment-webhook-secret-provider.js';
import { WahaWebhookAdapter } from '../../src/infrastructure/channels/waha/waha-webhook-adapter.js';
import { PostgresInboundIngestionGateway } from '../../src/infrastructure/database/postgres-inbound-ingestion-gateway.js';
import { PostgresOutboxProcessingGateway } from '../../src/infrastructure/database/postgres-outbox-processing-gateway.js';
import { CompositeDependencyHealthProvider } from '../../src/infrastructure/health/composite-dependency-health-provider.js';
import { whatsappChannelRoutes } from '../../src/interfaces/http/routes/whatsapp-channel-routes.js';

// Local Supabase configuration
const DB_URL = process.env.LAB_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:55432/postgres';
const JWT_ISSUER = 'http://127.0.0.1:55431/auth/v1';

// Seeded UUIDs (RFC 4122 compliant v4 format)
const WORKSPACE_A_ID = 'a0000000-0000-4000-8000-000000000001';
const WORKSPACE_B_ID = 'b0000000-0000-4000-8000-000000000002';

const USER_OWNER_A_ID = '10000000-0000-4000-8000-000000000001';
const USER_OPERATOR_A_ID = '20000000-0000-4000-8000-000000000002';
const USER_VIEWER_A_ID = '30000000-0000-4000-8000-000000000003';
const USER_TENANT_B_ID = '40000000-0000-4000-8000-000000000004';

describe('Local Supabase E2E Authentication, RBAC, Multi-Tenancy & RLS Matrix', () => {
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;
  let privateKey: any;
  let publicKey: any;

  async function createToken(userId: string, email: string, options: { expired?: boolean } = {}) {
    const jwt = new SignJWT({
      email,
      role: 'authenticated',
      app_metadata: { provider: 'email' },
      user_metadata: {},
    })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject(userId)
      .setIssuer(JWT_ISSUER)
      .setAudience('authenticated')
      .setIssuedAt();

    if (options.expired) {
      jwt.setExpirationTime(Math.floor(Date.now() / 1000) - 3600);
    } else {
      jwt.setExpirationTime('1h');
    }

    return await jwt.sign(privateKey);
  }

  beforeAll(async () => {
    // Generate key pair for ES256 tokens
    const pair = await generateKeyPair('ES256');
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;

    // Mock WAHA fetch API for operational channel endpoints
    process.env.WAHA_API_KEY = 'mct_waha_test_key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ name: `ws_${WORKSPACE_A_ID.replace(/-/g, '')}`, status: 'CONNECTED', me: { pushName: 'Matrix Agent' } }],
    }));

    pool = new Pool({ connectionString: DB_URL, ssl: false });

    // Seed Workspaces and memberships for all test users
    const client = await pool.connect();
    try {
      await client.query(`
        -- 1. Create Workspaces A and B
        INSERT INTO workspaces (id, name, slug, active)
        VALUES 
          ('${WORKSPACE_A_ID}', 'Workspace A Tenant', 'workspace-a-matrix', true),
          ('${WORKSPACE_B_ID}', 'Workspace B Tenant', 'workspace-b-matrix', true)
        ON CONFLICT (id) DO NOTHING;

        -- 2. Create Memberships
        -- Owner of A
        INSERT INTO workspace_memberships (id, workspace_id, user_id, role)
        VALUES ('${randomUUID()}', '${WORKSPACE_A_ID}', '${USER_OWNER_A_ID}', 'owner')
        ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner';

        -- Operator of A
        INSERT INTO workspace_memberships (id, workspace_id, user_id, role)
        VALUES ('${randomUUID()}', '${WORKSPACE_A_ID}', '${USER_OPERATOR_A_ID}', 'operator')
        ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'operator';

        -- Viewer of A
        INSERT INTO workspace_memberships (id, workspace_id, user_id, role)
        VALUES ('${randomUUID()}', '${WORKSPACE_A_ID}', '${USER_VIEWER_A_ID}', 'viewer')
        ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'viewer';

        -- Owner of B (Tenant B)
        INSERT INTO workspace_memberships (id, workspace_id, user_id, role)
        VALUES ('${randomUUID()}', '${WORKSPACE_B_ID}', '${USER_TENANT_B_ID}', 'owner')
        ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner';
      `);
    } finally {
      client.release();
    }

    // Build authenticator with cryptographic ES256 verification
    const { jwtVerify } = await import('jose');
    const authenticator = new SupabaseJwtAuthenticator({
      issuer: JWT_ISSUER,
      jwksUrl: `${JWT_ISSUER}/.well-known/jwks.json`,
      audience: 'authenticated',
      verifier: {
        async verify(accessToken: string) {
          const result = await jwtVerify(accessToken, publicKey, {
            issuer: JWT_ISSUER,
            audience: 'authenticated',
          });
          return result.payload;
        },
      },
    });

    const workspaceDirectory = new PostgresWorkspaceDirectory(pool);

    app = buildApp({
      secretProvider: new EnvironmentWebhookSecretProvider(),
      wahaAdapter: new WahaWebhookAdapter(),
      ingestionGateway: new PostgresInboundIngestionGateway(),
      outboxGateway: new PostgresOutboxProcessingGateway(),
      authenticator,
      workspaceDirectory,
      cockpitReadGateway: new PostgresCockpitReadGateway(pool),
      notesGateway: new PostgresNotesGateway(pool),
      appointmentGateway: new PostgresAppointmentGateway(pool),
      handoffOperationsGateway: new PostgresHandoffOperationsGateway(pool),
      journeyOperationsGateway: new PostgresJourneyOperationsGateway(pool),
      commercialOutcomeGateway: new PostgresCommercialOutcomeGateway(pool),
      outboundDispatchGateway: new PostgresOutboundDispatchGateway(pool),
      trafficProofGateway: new PostgresTrafficProofGateway(pool),
      knownFactOperationsGateway: new PostgresKnownFactOperationsGateway(pool),
      workspaceProvisioningGateway: new PostgresWorkspaceProvisioningGateway(pool),
      healthProvider: new CompositeDependencyHealthProvider([
        { name: 'database', check: async () => true },
        { name: 'redis', check: async () => true },
        { name: 'worker', check: async () => true },
      ]),
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    const { cleanupTestFixtures } = await import('../../scripts/cleanup-test-fixtures.mjs');
    await cleanupTestFixtures();
  });

  // ---------------------------------------------------------------------------
  // 1. TOKEN VALIDATION (Invalid, Expired, Anonymous)
  // ---------------------------------------------------------------------------
  it('rejects unauthenticated requests with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${WORKSPACE_A_ID}/contacts`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects invalid/forged tokens with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${WORKSPACE_A_ID}/contacts`,
      headers: {
        authorization: 'Bearer definitely.invalid.forged.jwt',
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects expired tokens with 401', async () => {
    const expiredToken = await createToken(USER_OWNER_A_ID, 'owner-a@example.com', { expired: true });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${WORKSPACE_A_ID}/contacts`,
      headers: {
        authorization: `Bearer ${expiredToken}`,
      },
    });
    expect(res.statusCode).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // 2. TENANT ISOLATION (Tenant A accesses A, gets 403 on Tenant B)
  // ---------------------------------------------------------------------------
  it('proves Tenant A Owner accesses Workspace A (200 OK)', async () => {
    const token = await createToken(USER_OWNER_A_ID, 'owner-a@example.com');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${WORKSPACE_A_ID}/contacts`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('proves Tenant A Owner receives 403 Forbidden when accessing Workspace B', async () => {
    const token = await createToken(USER_OWNER_A_ID, 'owner-a@example.com');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${WORKSPACE_B_ID}/contacts`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('proves Tenant B User receives 403 Forbidden when accessing Workspace A', async () => {
    const token = await createToken(USER_TENANT_B_ID, 'user-b@example.com');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${WORKSPACE_A_ID}/contacts`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // 3. RBAC ROLE PERMISSIONS (Viewer 403 on mutations, 200 on reads)
  // ---------------------------------------------------------------------------
  it('proves Viewer of Tenant A can read channel status (200 OK)', async () => {
    const token = await createToken(USER_VIEWER_A_ID, 'viewer-a@example.com');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${WORKSPACE_A_ID}/channels/whatsapp/status`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('proves Viewer of Tenant A receives 403 Forbidden on mutations (POST logout)', async () => {
    const token = await createToken(USER_VIEWER_A_ID, 'viewer-a@example.com');
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${WORKSPACE_A_ID}/channels/whatsapp/logout`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // 4. OPERATOR CAPABILITIES
  // ---------------------------------------------------------------------------
  it('proves Operator of Tenant A can execute permitted mutations (POST logout -> 200 OK)', async () => {
    const token = await createToken(USER_OPERATOR_A_ID, 'operator-a@example.com');
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${WORKSPACE_A_ID}/channels/whatsapp/logout`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('proves Operator of Tenant A receives 403 Forbidden on owner-only admin actions (clear history)', async () => {
    const token = await createToken(USER_OPERATOR_A_ID, 'operator-a@example.com');
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${WORKSPACE_A_ID}/channels/whatsapp/clear-history`,
      headers: {
        authorization: `Bearer ${token}`,
        'x-confirm-destruction': 'CONFIRM_DATA_DELETION',
      },
    });
    expect(res.statusCode).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // 5. OWNER ADMINISTRATIVE ACTIONS
  // ---------------------------------------------------------------------------
  it('proves Owner of Tenant A can execute administrative actions (clear history with header -> 200 OK)', async () => {
    const token = await createToken(USER_OWNER_A_ID, 'owner-a@example.com');
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${WORKSPACE_A_ID}/channels/whatsapp/clear-history`,
      headers: {
        authorization: `Bearer ${token}`,
        'x-confirm-destruction': 'CONFIRM_DATA_DELETION',
      },
    });
    expect(res.statusCode).toBe(200);
  });

  // ---------------------------------------------------------------------------
  // 6. DIRECT DATABASE RLS PROOF
  // ---------------------------------------------------------------------------
  it('proves direct database connection under sos_sales_runtime strictly filters by RLS', async () => {
    const client = await pool.connect();
    try {
      // Test Tenant A Owner
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE sos_sales_runtime');
      await client.query("SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)", [USER_OWNER_A_ID]);
      await client.query("SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)");

      const visibleWorkspacesA = await client.query('SELECT id, name FROM public.workspaces');
      const idsA = visibleWorkspacesA.rows.map((r: any) => r.id);
      expect(idsA).toContain(WORKSPACE_A_ID);
      expect(idsA).not.toContain(WORKSPACE_B_ID);
      await client.query('COMMIT');

      // Test Tenant B Owner
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE sos_sales_runtime');
      await client.query("SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)", [USER_TENANT_B_ID]);
      await client.query("SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)");

      const visibleWorkspacesB = await client.query('SELECT id, name FROM public.workspaces');
      const idsB = visibleWorkspacesB.rows.map((r: any) => r.id);
      expect(idsB).toContain(WORKSPACE_B_ID);
      expect(idsB).not.toContain(WORKSPACE_A_ID);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });
});
