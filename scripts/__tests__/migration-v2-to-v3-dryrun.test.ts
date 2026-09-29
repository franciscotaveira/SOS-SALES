import { describe, it, expect, afterAll } from "vitest";
import { createTestDatabasePools } from "../../packages/database/src";
import { runMigrationDryRun, REQUIRED_V3_TABLES } from "../migration-v2-to-v3-dryrun";

describe("M8 Migration V2 -> V3 Dry-Run Verification", () => {
  const { ownerPool } = createTestDatabasePools();

  afterAll(async () => {
    await ownerPool.end();
  });

  it("completes dry-run verification against test database and confirms V3 schema readiness", async () => {
    const result = await runMigrationDryRun(ownerPool);

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

    // Check entity counts structure
    expect(result.entityCounts).toBeDefined();
    expect(typeof result.entityCounts.workspaces).toBe("number");
    expect(typeof result.entityCounts.contacts).toBe("number");
    expect(typeof result.entityCounts.commercialProposals).toBe("number");
    expect(typeof result.entityCounts.commercialActions).toBe("number");
    expect(typeof result.entityCounts.auditEvents).toBe("number");
  });

  it("is idempotent: running dry-run multiple times yields identical schema readiness", async () => {
    const run1 = await runMigrationDryRun(ownerPool);
    const run2 = await runMigrationDryRun(ownerPool);

    expect(run1.isReady).toBe(true);
    expect(run2.isReady).toBe(true);
    expect(run1.schemaChecks.missingTables).toEqual(run2.schemaChecks.missingTables);
    expect(run1.integrityChecks).toEqual(run2.integrityChecks);
  });
});
