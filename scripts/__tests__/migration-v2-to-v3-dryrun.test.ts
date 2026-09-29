import { describe, it, expect, afterAll } from "vitest";
import { createTestDatabasePools, withTenantTransaction } from "../../packages/database/src";
import { runMigrationDryRun, REQUIRED_V3_TABLES } from "../migration-v2-to-v3-dryrun";
import {
  runSyntheticV2Migration,
  verifyPostMigrationIntegrity,
  executeHermeticBackupAndRestore,
  toDeterministicUuid,
} from "../migration-v2-to-v3-engine";

describe("Phase R4: Migration V2 -> V3 Dry-Run & Disaster Recovery Suite", () => {
  const { ownerPool, appPool } = createTestDatabasePools();

  afterAll(async () => {
    await appPool.end();
    await ownerPool.end();
  });

  describe("1. V3 Schema & Security Governance Readiness", () => {
    it("completes dry-run verification against test database and confirms V3 schema readiness", async () => {
      const result = await runMigrationDryRun(ownerPool, { runSynthetic: true });

      expect(result.databaseName).toBeDefined();
      expect(result.errors).toEqual([]);
      expect(result.isReady).toBe(true);

      // Check all required tables exist
      expect(result.schemaChecks.missingTables).toEqual([]);
      expect(result.schemaChecks.totalTablesExpected).toBe(REQUIRED_V3_TABLES.length);

      // Check FORCE RLS is active on all tenant tables
      expect(result.schemaChecks.forceRlsEnforced).toBe(true);
      expect(result.schemaChecks.tablesMissingForceRls).toEqual([]);

      // Check permissions least privilege (DELETE revoked on commercial proposals, audit events, journeys)
      expect(result.permissionChecks.deleteRevokedOnAppUser).toBe(true);
      expect(result.permissionChecks.tablesAllowingDelete).toEqual([]);

      // Check zero orphaned entities
      expect(result.integrityChecks.orphanedThreads).toBe(0);
      expect(result.integrityChecks.orphanedMessages).toBe(0);
      expect(result.integrityChecks.orphanedProposals).toBe(0);
      expect(result.integrityChecks.orphanedActions).toBe(0);
      expect(result.integrityChecks.orphanedPixCharges).toBe(0);

      // Check synthetic dry-run verification was executed
      expect(result.syntheticMigration).toBeDefined();
      expect(result.syntheticMigration!.checksumsMatch).toBe(true);
      expect(result.syntheticMigration!.dryRun).toBe(true);
    });

    it("is idempotent: running dry-run multiple times yields identical schema readiness", async () => {
      const run1 = await runMigrationDryRun(ownerPool, { runSynthetic: false });
      const run2 = await runMigrationDryRun(ownerPool, { runSynthetic: false });

      expect(run1.isReady).toBe(true);
      expect(run2.isReady).toBe(true);
      expect(run1.schemaChecks.missingTables).toEqual(run2.schemaChecks.missingTables);
      expect(run1.integrityChecks).toEqual(run2.integrityChecks);
    });
  });

  describe("2. Synthetic V2 Fixture Ingestion & Checksum Reconciliation", () => {
    it("executes actual synthetic V2 migration and confirms 100% data fidelity and checksum match", async () => {
      const execResult = await runSyntheticV2Migration(ownerPool, { dryRun: false });

      expect(execResult.success).toBe(true);
      expect(execResult.checksumsMatch).toBe(true);
      expect(execResult.errors).toEqual([]);

      const counts = execResult.v3IngestedCounts;
      const meta = execResult.sourceMetadata;

      // Verify exact entity match
      expect(counts.workspaces).toBe(meta.total_workspaces);
      expect(counts.contacts).toBe(meta.total_contacts);
      expect(counts.products).toBe(meta.total_products);
      expect(counts.threads).toBe(meta.total_threads);
      expect(counts.messages).toBe(meta.total_messages);
      expect(counts.proposals).toBe(meta.total_orders);

      // Verify exact monetary amounts match to the cent (Truth in Data)
      expect(counts.totalOrderCents).toBe(meta.total_order_cents);
      expect(counts.totalPaidCents).toBe(meta.paid_order_cents);

      // Verify that phone numbers were strictly normalized to E.164
      const havenWsId = toDeterministicUuid("v2-ws-haven");
      const contactsRes = await ownerPool.query<{ phone_e164: string }>(
        `SELECT phone_e164 FROM public.contacts WHERE workspace_id = $1 ORDER BY phone_e164 ASC;`,
        [havenWsId]
      );
      expect(contactsRes.rows.length).toBe(4);
      for (const row of contactsRes.rows) {
        expect(row.phone_e164).toMatch(/^\+55\d{10,11}$/);
      }
    });

    it("is strictly idempotent: repeated execution does not duplicate records or diverge checksums", async () => {
      const run1 = await runSyntheticV2Migration(ownerPool, { dryRun: false });
      const run2 = await runSyntheticV2Migration(ownerPool, { dryRun: false });

      expect(run1.checksumsMatch).toBe(true);
      expect(run2.checksumsMatch).toBe(true);
      expect(run1.v3IngestedCounts).toEqual(run2.v3IngestedCounts);
    });
  });

  describe("3. Hermetic Restore & Disaster Recovery Verification", () => {
    it("verifies post-migration integrity across all migrated tenants", async () => {
      const havenWsId = toDeterministicUuid("v2-ws-haven");
      const domWsId = toDeterministicUuid("v2-ws-domrios");

      const havenCheck = await verifyPostMigrationIntegrity(ownerPool, havenWsId);
      expect(havenCheck.isConsistent).toBe(true);
      expect(havenCheck.issues).toEqual([]);

      const domCheck = await verifyPostMigrationIntegrity(ownerPool, domWsId);
      expect(domCheck.isConsistent).toBe(true);
      expect(domCheck.issues).toEqual([]);
    });

    it("executes hermetic physical pg_dump and restore into isolated ephemeral database with complete reconciliation", async () => {
      const drResult = await executeHermeticBackupAndRestore({
        sourceDatabase: "sos_sales_v3_test",
      });

      expect(drResult.success).toBe(true);
      expect(drResult.errors).toEqual([]);
      expect(drResult.dumpSizeBytes).toBeGreaterThan(1000);
      expect(drResult.restoredDatabase).toMatch(/^sos_sales_v3_test_dr_[a-f0-9]{8}$/);

      // Verify all tables were reconciled without count loss
      for (const [table, metric] of Object.entries(drResult.tablesReconciled)) {
        expect(metric.match, `Table ${table} counts must match: source=${metric.sourceCount}, restored=${metric.restoredCount}`).toBe(true);
      }

      // Verify exact monetary sums match
      expect(drResult.sumsReconciled.proposalsTotalCents.match).toBe(true);
      expect(drResult.sumsReconciled.pixChargesAmountCents.match).toBe(true);
      expect(drResult.sumsReconciled.outcomesValueCents.match).toBe(true);

      // Verify RLS isolation was proven on the restored database
      expect(drResult.rlsIsolationVerified).toBe(true);
    }, 60000);

    it("verifies RLS fail-closed isolation between migrated workspaces under appPool", async () => {
      const havenWsId = toDeterministicUuid("v2-ws-haven");
      const domWsId = toDeterministicUuid("v2-ws-domrios");

      // Reading under Haven workspace context
      const havenContacts = await withTenantTransaction(havenWsId, async (client) => {
        const res = await client.query<{ id: string }>(
          `SELECT id FROM public.contacts WHERE workspace_id = $1;`,
          [havenWsId]
        );
        return res.rows;
      });
      expect(havenContacts.length).toBe(4);

      // Attempting to read Dom Rios contacts while in Haven workspace context returns zero rows
      const leakAttempt = await withTenantTransaction(havenWsId, async (client) => {
        const res = await client.query<{ id: string }>(
          `SELECT id FROM public.contacts WHERE workspace_id = $1;`,
          [domWsId]
        );
        return res.rows;
      });
      expect(leakAttempt.length).toBe(0);
    });
  });
});
