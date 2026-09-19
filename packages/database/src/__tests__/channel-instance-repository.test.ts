import crypto from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDatabasePools } from "../test-support";
import { encryptPayload } from "../infrastructure/crypto-payload";
import {
  ChannelInstanceRepository,
  ChannelInstanceNotFoundError,
  ChannelInstanceCrossTenantError,
  InvalidEndpointTokenError,
} from "../repositories/channel-instance.repository";

describe("ChannelInstanceRepository: Multi-Line, Tenant-First & RLS Guarantees (CH-10)", () => {
  const { ownerPool, appPool, ingressPool } = createTestDatabasePools();
  const repository = new ChannelInstanceRepository(appPool, ingressPool, ownerPool);

  let orgId: string;
  let workspaceAlphaId: string;
  let workspaceBetaId: string;
  let credAlphaId: string;
  let credBetaId: string;

  const testMasterKeyHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  beforeAll(async () => {
    // 1. Provision Organization and two isolated workspaces
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('Channel Repo Org', $1)
      RETURNING id;
    `, [`org-channel-repo-${Date.now()}`]);
    orgId = orgRes.rows[0].id;

    const wsAlphaRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Workspace Alpha', $2)
      RETURNING id;
    `, [orgId, `ws-alpha-${Date.now()}`]);
    workspaceAlphaId = wsAlphaRes.rows[0].id;

    const wsBetaRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Workspace Beta', $2)
      RETURNING id;
    `, [orgId, `ws-beta-${Date.now()}`]);
    workspaceBetaId = wsBetaRes.rows[0].id;

    // 2. Provision credentials
    const encAlpha = encryptPayload(JSON.stringify({ key: "alpha_waha" }), testMasterKeyHex);
    const credAlphaRes = await ownerPool.query(`
      INSERT INTO provider_credentials (workspace_id, provider, account_id, encrypted_payload, iv, auth_tag)
      VALUES ($1, 'waha', 'acc_alpha_waha', $2, $3, $4)
      RETURNING id;
    `, [workspaceAlphaId, encAlpha.encryptedBase64, encAlpha.ivBase64, encAlpha.authTagBase64]);
    credAlphaId = credAlphaRes.rows[0].id;

    const encBeta = encryptPayload(JSON.stringify({ key: "beta_waha" }), testMasterKeyHex);
    const credBetaRes = await ownerPool.query(`
      INSERT INTO provider_credentials (workspace_id, provider, account_id, encrypted_payload, iv, auth_tag)
      VALUES ($1, 'waha', 'acc_beta_waha', $2, $3, $4)
      RETURNING id;
    `, [workspaceBetaId, encBeta.encryptedBase64, encBeta.ivBase64, encBeta.authTagBase64]);
    credBetaId = credBetaRes.rows[0].id;
  });

  afterAll(async () => {
    await ownerPool.end();
    await appPool.end();
    await ingressPool.end();
  });

  describe("1. Multi-Line Support: Multiple Active Instances of Same Provider in Single Workspace", () => {
    let wahaLine1Id: string;
    let wahaLine2Id: string;
    const token1 = "raw_token_line_1_" + Date.now();
    const token2 = "raw_token_line_2_" + Date.now();

    it("should allow creating two distinct active WAHA lines in Workspace Alpha without constraint violation", async () => {
      const line1 = await repository.create({
        workspaceId: workspaceAlphaId,
        provider: "waha",
        displayName: "Sales Support WAHA Line 1",
        phoneNumberE164: "+5511999991111",
        endpointToken: token1,
        credentialId: credAlphaId,
        isActive: true,
      });

      const line2 = await repository.create({
        workspaceId: workspaceAlphaId,
        provider: "waha",
        displayName: "Customer Success WAHA Line 2",
        phoneNumberE164: "+5511999992222",
        endpointToken: token2,
        credentialId: credAlphaId,
        isActive: true,
      });

      expect(line1.id).toBeDefined();
      expect(line2.id).toBeDefined();
      expect(line1.id).not.toBe(line2.id);
      expect(line1.workspace_id).toBe(workspaceAlphaId);
      expect(line2.workspace_id).toBe(workspaceAlphaId);

      wahaLine1Id = line1.id;
      wahaLine2Id = line2.id;
    });

    it("should list BOTH active WAHA instances in Workspace Alpha as a collection", async () => {
      const activeWahaLines = await repository.listActiveByWorkspaceAndProvider(
        workspaceAlphaId,
        "waha"
      );

      expect(activeWahaLines.length).toBeGreaterThanOrEqual(2);
      const ids = activeWahaLines.map((l) => l.id);
      expect(ids).toContain(wahaLine1Id);
      expect(ids).toContain(wahaLine2Id);
    });

    it("should resolve explicit instance by findById without arbitrary selection or fallback", async () => {
      const line1 = await repository.findById(workspaceAlphaId, wahaLine1Id);
      const line2 = await repository.findById(workspaceAlphaId, wahaLine2Id);

      expect(line1).not.toBeNull();
      expect(line2).not.toBeNull();
      expect(line1!.id).toBe(wahaLine1Id);
      expect(line1!.display_name).toBe("Sales Support WAHA Line 1");
      expect(line2!.id).toBe(wahaLine2Id);
      expect(line2!.display_name).toBe("Customer Success WAHA Line 2");
    });
  });

  describe("2. Cross-Tenant Isolation & Typed Errors", () => {
    let betaLineId: string;
    const betaToken = "beta_token_secret_" + Date.now();

    beforeAll(async () => {
      const betaLine = await repository.create({
        workspaceId: workspaceBetaId,
        provider: "waha",
        displayName: "Beta Dedicated Line",
        phoneNumberE164: "+5511988880000",
        endpointToken: betaToken,
        credentialId: credBetaId,
        isActive: true,
      });
      betaLineId = betaLine.id;
    });

    it("should return null when querying Beta line from Workspace Alpha via findById (RLS fail-closed)", async () => {
      const result = await repository.findById(workspaceAlphaId, betaLineId);
      expect(result).toBeNull();
    });

    it("should throw typed ChannelInstanceCrossTenantError when accessing cross-tenant line via getById", async () => {
      await expect(
        repository.getById(workspaceAlphaId, betaLineId)
      ).rejects.toThrow(ChannelInstanceCrossTenantError);

      try {
        await repository.getById(workspaceAlphaId, betaLineId);
      } catch (err: any) {
        expect(err).toBeInstanceOf(ChannelInstanceCrossTenantError);
        expect(err.code).toBe("CHANNEL_INSTANCE_CROSS_TENANT_ACCESS");
      }
    });

    it("should throw typed ChannelInstanceNotFoundError for non-existent UUID", async () => {
      const nonExistentId = "00000000-0000-4000-8000-000000000000";
      await expect(
        repository.getById(workspaceAlphaId, nonExistentId)
      ).rejects.toThrow(ChannelInstanceNotFoundError);

      try {
        await repository.getById(workspaceAlphaId, nonExistentId);
      } catch (err: any) {
        expect(err).toBeInstanceOf(ChannelInstanceNotFoundError);
        expect(err.code).toBe("CHANNEL_INSTANCE_NOT_FOUND");
      }
    });

    it("should NOT return Beta instances in listActiveByWorkspaceAndProvider for Workspace Alpha", async () => {
      const alphaLines = await repository.listActiveByWorkspaceAndProvider(
        workspaceAlphaId,
        "waha"
      );
      const betaIdsInAlpha = alphaLines.filter((l) => l.workspace_id !== workspaceAlphaId);
      expect(betaIdsInAlpha).toHaveLength(0);
    });
  });

  describe("3. Ingress Resolution by Endpoint Token & Zero Credential Leaks", () => {
    let instanceId: string;
    const rawToken = "my_super_secret_webhook_token_123_" + Date.now();
    const previousRawToken = "old_grace_period_token_456_" + Date.now();

    beforeAll(async () => {
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const prevHash = crypto.createHash("sha256").update(previousRawToken).digest("hex");

      const insertRes = await ownerPool.query(`
        INSERT INTO channel_instances (
          workspace_id, provider, display_name, phone_number_e164,
          endpoint_token_hash, previous_token_hash, previous_token_valid_until,
          credential_id, is_active
        ) VALUES (
          $1, 'waha', 'Ingress Token Channel', '+5511977771111',
          $2, $3, NOW() + INTERVAL '1 hour',
          $4, true
        ) RETURNING id;
      `, [workspaceAlphaId, tokenHash, prevHash, credAlphaId]);
      instanceId = insertRes.rows[0].id;
    });

    it("should resolve active instance using raw endpoint token (hashed automatically)", async () => {
      const found = await repository.findByEndpointToken(rawToken);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(instanceId);
      expect(found!.provider).toBe("waha");
      expect(found!.is_active).toBe(true);

      // Security check: raw token is NEVER present in returned record
      expect(found).not.toHaveProperty("endpointToken");
      expect(found).not.toHaveProperty("rawToken");
    });

    it("should resolve active instance using previous token within valid grace period", async () => {
      const found = await repository.findByEndpointToken(previousRawToken);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(instanceId);
    });

    it("should return null for unknown token", async () => {
      const found = await repository.findByEndpointToken("unknown_token_value_random");
      expect(found).toBeNull();
    });

    it("should throw InvalidEndpointTokenError for empty token", async () => {
      await expect(repository.findByEndpointToken("")).rejects.toThrow(InvalidEndpointTokenError);
      await expect(repository.findByEndpointToken("   ")).rejects.toThrow(InvalidEndpointTokenError);
    });
  });

  describe("4. Status Updates & Instance Isolation", () => {
    let testLineId: string;

    beforeAll(async () => {
      const line = await repository.create({
        workspaceId: workspaceAlphaId,
        provider: "waha",
        displayName: "Togglable Line",
        phoneNumberE164: "+5511966660000",
        credentialId: credAlphaId,
        isActive: true,
      });
      testLineId = line.id;
    });

    it("should deactivate specific instance without affecting other instances", async () => {
      const updated = await repository.updateStatus(workspaceAlphaId, testLineId, false);
      expect(updated.is_active).toBe(false);

      const activeList = await repository.listActiveByWorkspaceAndProvider(workspaceAlphaId, "waha");
      expect(activeList.map((l) => l.id)).not.toContain(testLineId);
    });

    it("should reactivate specific instance", async () => {
      const updated = await repository.updateStatus(workspaceAlphaId, testLineId, true);
      expect(updated.is_active).toBe(true);

      const activeList = await repository.listActiveByWorkspaceAndProvider(workspaceAlphaId, "waha");
      expect(activeList.map((l) => l.id)).toContain(testLineId);
    });

    it("should reject cross-tenant updateStatus with typed error", async () => {
      await expect(
        repository.updateStatus(workspaceBetaId, testLineId, false)
      ).rejects.toThrow(ChannelInstanceNotFoundError);
    });
  });
});
