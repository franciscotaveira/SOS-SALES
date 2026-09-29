import { Pool } from "pg";
import { getDatabasePool } from "../packages/database/src";
import {
  runSyntheticV2Migration,
  type MigrationExecutionResult,
} from "./migration-v2-to-v3-engine";

export interface MigrationDryRunResult {
  readonly timestamp: string;
  readonly databaseName: string;
  readonly isReady: boolean;
  readonly schemaChecks: {
    readonly totalTablesExpected: number;
    readonly totalTablesFound: number;
    readonly missingTables: string[];
    readonly forceRlsEnforced: boolean;
    readonly tablesMissingForceRls: string[];
  };
  readonly permissionChecks: {
    readonly deleteRevokedOnAppUser: boolean;
    readonly tablesAllowingDelete: string[];
  };
  readonly integrityChecks: {
    readonly orphanedThreads: number;
    readonly orphanedMessages: number;
    readonly orphanedProposals: number;
    readonly orphanedActions: number;
    readonly orphanedPixCharges: number;
  };
  readonly entityCounts: {
    readonly organizations: number;
    readonly workspaces: number;
    readonly contacts: number;
    readonly commercialThreads: number;
    readonly messages: number;
    readonly channelInstances: number;
    readonly commercialProposals: number;
    readonly commercialActions: number;
    readonly pixCharges: number;
    readonly auditEvents: number;
  };
  readonly syntheticMigration?: MigrationExecutionResult;
  readonly warnings: string[];
  readonly errors: string[];
}

export const REQUIRED_V3_TABLES = [
  "organizations",
  "workspaces",
  "workspace_memberships",
  "users",
  "provider_credentials",
  "channel_instances",
  "contacts",
  "commercial_threads",
  "messages",
  "channel_webhook_inbox",
  "outbound_commands",
  "commercial_journeys",
  "commercial_proposals",
  "commercial_actions",
  "pix_charges",
  "audit_events",
  "conversion_events",
];

export const TENANT_TABLES_REQUIRING_FORCE_RLS = [
  "workspaces",
  "workspace_memberships",
  "provider_credentials",
  "channel_instances",
  "contacts",
  "commercial_threads",
  "messages",
  "channel_webhook_inbox",
  "outbound_commands",
  "commercial_journeys",
  "commercial_proposals",
  "commercial_actions",
  "pix_charges",
  "audit_events",
  "conversion_events",
];

export async function runMigrationDryRun(
  pool?: Pool,
  options: { runSynthetic?: boolean; fixturePath?: string } = {}
): Promise<MigrationDryRunResult> {
  const runner = pool || getDatabasePool();
  const errors: string[] = [];
  const warnings: string[] = [];
  const shouldRunSynthetic = options.runSynthetic ?? true;

  // 1. Get current database name
  const dbNameRes = await runner.query<{ current_database: string }>("SELECT current_database();");
  const databaseName = dbNameRes.rows[0]?.current_database || "unknown";

  // 2. Schema check: verify all required tables exist
  const tablesRes = await runner.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public';`
  );
  const existingTables = new Set(tablesRes.rows.map((r) => r.tablename));
  const missingTables = REQUIRED_V3_TABLES.filter((t) => !existingTables.has(t));

  if (missingTables.length > 0) {
    errors.push(`Missing required V3 tables: ${missingTables.join(", ")}`);
  }

  // 3. Check FORCE ROW LEVEL SECURITY on tenant tables
  const rlsRes = await runner.query<{ relname: string; relforcerowsecurity: boolean }>(
    `SELECT relname, relforcerowsecurity
     FROM pg_class
     JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
     WHERE pg_namespace.nspname = 'public'
       AND pg_class.relname = ANY($1::text[]);`,
    [TENANT_TABLES_REQUIRING_FORCE_RLS]
  );
  const rlsMap = new Map(rlsRes.rows.map((r) => [r.relname, r.relforcerowsecurity]));
  const tablesMissingForceRls = TENANT_TABLES_REQUIRING_FORCE_RLS.filter(
    (t) => existingTables.has(t) && !rlsMap.get(t)
  );

  if (tablesMissingForceRls.length > 0) {
    errors.push(
      `Tables missing FORCE ROW LEVEL SECURITY: ${tablesMissingForceRls.join(", ")}`
    );
  }

  // 4. Permissions check: verify DELETE is revoked for sos_app_user
  const deletePrivRes = await runner.query<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.role_table_grants
     WHERE grantee = 'sos_app_user'
       AND privilege_type = 'DELETE'
       AND table_schema = 'public'
       AND table_name = ANY($1::text[]);`,
    [["commercial_proposals", "audit_events", "commercial_journeys"]]
  );
  const tablesAllowingDelete = deletePrivRes.rows.map((r) => r.table_name);
  if (tablesAllowingDelete.length > 0) {
    errors.push(
      `Security violation: sos_app_user has DELETE privilege on: ${tablesAllowingDelete.join(", ")}`
    );
  }

  // 5. Foreign Key & Tenant Consistency Checks
  let orphanedThreads = 0;
  let orphanedMessages = 0;
  let orphanedProposals = 0;
  let orphanedActions = 0;
  let orphanedPixCharges = 0;

  if (existingTables.has("commercial_threads")) {
    const res = await runner.query<{ count: string }>(
      `SELECT count(*) FROM commercial_threads t
       LEFT JOIN workspaces w ON t.workspace_id = w.id
       WHERE w.id IS NULL;`
    );
    orphanedThreads = parseInt(res.rows[0]?.count || "0", 10);
    if (orphanedThreads > 0) errors.push(`Found ${orphanedThreads} orphaned commercial_threads`);
  }

  if (existingTables.has("messages")) {
    const res = await runner.query<{ count: string }>(
      `SELECT count(*) FROM messages m
       LEFT JOIN commercial_threads t ON m.thread_id = t.id
       WHERE t.id IS NULL;`
    );
    orphanedMessages = parseInt(res.rows[0]?.count || "0", 10);
    if (orphanedMessages > 0) errors.push(`Found ${orphanedMessages} orphaned messages`);
  }

  if (existingTables.has("commercial_proposals")) {
    const res = await runner.query<{ count: string }>(
      `SELECT count(*) FROM commercial_proposals p
       LEFT JOIN commercial_threads t ON p.thread_id = t.id
       WHERE t.id IS NULL;`
    );
    orphanedProposals = parseInt(res.rows[0]?.count || "0", 10);
    if (orphanedProposals > 0) errors.push(`Found ${orphanedProposals} orphaned commercial_proposals`);
  }

  if (existingTables.has("commercial_actions")) {
    const res = await runner.query<{ count: string }>(
      `SELECT count(*) FROM commercial_actions a
       LEFT JOIN commercial_threads t ON a.thread_id = t.id
       WHERE t.id IS NULL;`
    );
    orphanedActions = parseInt(res.rows[0]?.count || "0", 10);
    if (orphanedActions > 0) errors.push(`Found ${orphanedActions} orphaned commercial_actions`);
  }

  if (existingTables.has("pix_charges")) {
    const res = await runner.query<{ count: string }>(
      `SELECT count(*) FROM pix_charges c
       LEFT JOIN workspaces w ON c.workspace_id = w.id
       WHERE w.id IS NULL;`
    );
    orphanedPixCharges = parseInt(res.rows[0]?.count || "0", 10);
    if (orphanedPixCharges > 0) errors.push(`Found ${orphanedPixCharges} orphaned pix_charges`);
  }

  // 6. Entity Counts
  const getCount = async (tableName: string): Promise<number> => {
    if (!existingTables.has(tableName)) return 0;
    const res = await runner.query<{ count: string }>(`SELECT count(*) FROM "${tableName}";`);
    return parseInt(res.rows[0]?.count || "0", 10);
  };

  const entityCounts = {
    organizations: await getCount("organizations"),
    workspaces: await getCount("workspaces"),
    contacts: await getCount("contacts"),
    commercialThreads: await getCount("commercial_threads"),
    messages: await getCount("messages"),
    channelInstances: await getCount("channel_instances"),
    commercialProposals: await getCount("commercial_proposals"),
    commercialActions: await getCount("commercial_actions"),
    pixCharges: await getCount("pix_charges"),
    auditEvents: await getCount("audit_events"),
  };

  // 7. Synthetic V2 Migration Dry-Run (if enabled)
  let syntheticMigration: MigrationExecutionResult | undefined;
  if (shouldRunSynthetic) {
    try {
      syntheticMigration = await runSyntheticV2Migration(runner, {
        dryRun: true,
        fixturePath: options.fixturePath,
      });

      if (!syntheticMigration.checksumsMatch) {
        errors.push(
          `Synthetic V2 migration reconciliation failed: ${syntheticMigration.errors.join("; ")}`
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Synthetic V2 migration error: ${msg}`);
    }
  }

  const isReady = errors.length === 0;

  return {
    timestamp: new Date().toISOString(),
    databaseName,
    isReady,
    schemaChecks: {
      totalTablesExpected: REQUIRED_V3_TABLES.length,
      totalTablesFound: existingTables.size,
      missingTables,
      forceRlsEnforced: tablesMissingForceRls.length === 0,
      tablesMissingForceRls,
    },
    permissionChecks: {
      deleteRevokedOnAppUser: tablesAllowingDelete.length === 0,
      tablesAllowingDelete,
    },
    integrityChecks: {
      orphanedThreads,
      orphanedMessages,
      orphanedProposals,
      orphanedActions,
      orphanedPixCharges,
    },
    entityCounts,
    syntheticMigration,
    warnings,
    errors,
  };
}

// CLI entry point
if (require.main === module || process.argv[1]?.endsWith("migration-v2-to-v3-dryrun.ts")) {
  runMigrationDryRun()
    .then((result) => {
      if (process.argv.includes("--json")) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log("\n=======================================================");
        console.log("   MIGRATION V2 -> V3 DRY-RUN REPORT (R4)");
        console.log("=======================================================");
        console.log(`Database:     ${result.databaseName}`);
        console.log(`Timestamp:    ${result.timestamp}`);
        console.log(`Status:       ${result.isReady ? "✅ READY FOR V3 CUTOVER" : "❌ DIVERGENCE DETECTED"}`);
        console.log("-------------------------------------------------------");
        console.log(`Tables Check: ${result.schemaChecks.missingTables.length === 0 ? "PASSED" : "FAILED"}`);
        console.log(`FORCE RLS:    ${result.schemaChecks.forceRlsEnforced ? "PASSED" : "FAILED"}`);
        console.log(`Permissions:  ${result.permissionChecks.deleteRevokedOnAppUser ? "PASSED (Least Privilege)" : "FAILED"}`);
        console.log("-------------------------------------------------------");
        console.log("Entity Counts (Target DB):");
        for (const [entity, count] of Object.entries(result.entityCounts)) {
          console.log(`  - ${entity.padEnd(22)}: ${count}`);
        }
        if (result.syntheticMigration) {
          console.log("-------------------------------------------------------");
          console.log("Synthetic V2 Fixture Ingestion (Dry-Run):");
          console.log(`  - Status:               ${result.syntheticMigration.checksumsMatch ? "PASSED (100% Match)" : "FAILED"}`);
          console.log(`  - Workspaces:           ${result.syntheticMigration.v3IngestedCounts.workspaces}`);
          console.log(`  - Contacts:             ${result.syntheticMigration.v3IngestedCounts.contacts}`);
          console.log(`  - Products:             ${result.syntheticMigration.v3IngestedCounts.products}`);
          console.log(`  - Threads:              ${result.syntheticMigration.v3IngestedCounts.threads}`);
          console.log(`  - Messages:             ${result.syntheticMigration.v3IngestedCounts.messages}`);
          console.log(`  - Proposals:            ${result.syntheticMigration.v3IngestedCounts.proposals}`);
          console.log(`  - Pix Charges:          ${result.syntheticMigration.v3IngestedCounts.pixCharges}`);
          console.log(`  - Won Outcomes:         ${result.syntheticMigration.v3IngestedCounts.outcomes}`);
          console.log(`  - Total Order Cents:    ${result.syntheticMigration.v3IngestedCounts.totalOrderCents}`);
          console.log(`  - Paid Cents:           ${result.syntheticMigration.v3IngestedCounts.totalPaidCents}`);
        }
        console.log("-------------------------------------------------------");
        if (result.errors.length > 0) {
          console.log("Errors:");
          for (const err of result.errors) console.log(`  ❌ ${err}`);
        }
        console.log("=======================================================\n");
      }

      if (!result.isReady) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error("Fatal error during migration dry-run:", err);
      process.exit(1);
    });
}
