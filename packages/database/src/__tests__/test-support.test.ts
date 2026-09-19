import { describe, it, expect, beforeAll } from "vitest";
import {
  validateTestDatabaseUrl,
  validateTestAdminDatabaseUrl,
  assertEquivalentTestDestinations,
  assertAdministrativeOptIn,
  sanitizeDatabaseUrl,
  createTestDatabasePools,
  confirmTestDatabaseContext,
  runSafeNegativeDdlTest,
  bootstrapTestDatabase,
  disposeTestDatabase,
  cleanOrphanTestDatabases,
  executeTestRunnerSession,
  generateTestRunDatabaseName,
  TEST_DB_DEFAULT,
  TEST_PORT_DEFAULT,
} from "../test-support";
import { Pool } from "pg";

describe("TAREFA A: Isolamento Estrito do Banco de Testes e Runner Seguro (R01 — R05)", () => {
  const sentinelPassword = "sentinel_super_secret_db_pass_999!";
  const testPort = process.env.TEST_DB_PORT || TEST_PORT_DEFAULT;
  const invalidTestPort = testPort === "5432" ? "5433" : "5432";

  describe("R01 & R02: Matriz de URLs e Proteção Fail-Closed Estática", () => {
    it("should accept strictly authorized local test database URL", () => {
      const validUrl = `postgresql://sos_app_user:pass@localhost:${testPort}/${TEST_DB_DEFAULT}?sslmode=disable`;
      const result = validateTestDatabaseUrl(validUrl, "sos_app_user");

      expect(result.protocol).toBe("postgresql:");
      expect(result.host).toBe("localhost");
      expect(result.port).toBe(testPort);
      expect(result.database).toBe(TEST_DB_DEFAULT);
      expect(result.username).toBe("sos_app_user");
    });

    it("should accept dynamic suite databases matching governed test prefix", () => {
      const validDynamicUrl = `postgres://sos_app_user:pass@127.0.0.1:${testPort}/sos_sales_v3_test_run_12345?sslmode=disable`;
      const result = validateTestDatabaseUrl(validDynamicUrl, "sos_app_user");

      expect(result.database).toBe("sos_sales_v3_test_run_12345");
      expect(result.host).toBe("127.0.0.1");
    });

    it("should reject remote database host without opening a connection (R01, R02)", () => {
      const remoteUrl = `postgresql://sos_app_user:pass@db.example.com:${testPort}/${TEST_DB_DEFAULT}`;
      expect(() => validateTestDatabaseUrl(remoteUrl)).toThrow(
        /Remote database hosts are strictly forbidden in test suites/i
      );
    });

    it("should reject unexpected database port (R01, R02)", () => {
      const wrongPortUrl = `postgresql://sos_app_user:pass@localhost:${invalidTestPort}/${TEST_DB_DEFAULT}`;
      expect(() => validateTestDatabaseUrl(wrongPortUrl)).toThrow(
        new RegExp(`Unexpected port '${invalidTestPort}'`, "i")
      );
    });

    it("should reject invalid protocol (R01, R02)", () => {
      const invalidProtoUrl = `http://sos_app_user:pass@localhost:${testPort}/${TEST_DB_DEFAULT}`;
      expect(() => validateTestDatabaseUrl(invalidProtoUrl)).toThrow(
        /Invalid database protocol 'http:'/i
      );
    });

    it("should reject lab database (sos_sales_v3) even on local authorized host/port (R01)", () => {
      const labUrl = `postgresql://sos_app_user:pass@localhost:${testPort}/sos_sales_v3`;
      expect(() => validateTestDatabaseUrl(labUrl)).toThrow(
        /Target database 'sos_sales_v3' is NOT an authorized test database/i
      );
    });

    it("should reject production/v2 databases and names that merely end in _test without prefix (R01)", () => {
      const genericTestUrl = `postgresql://sos_app_user:pass@localhost:${testPort}/production_test`;
      expect(() => validateTestDatabaseUrl(genericTestUrl)).toThrow(
        /Target database 'production_test' is NOT an authorized test database/i
      );

      const v2TestUrl = `postgresql://sos_app_user:pass@localhost:${testPort}/v2_test`;
      expect(() => validateTestDatabaseUrl(v2TestUrl)).toThrow(
        /Target database 'v2_test' is NOT an authorized test database/i
      );

      const postgresUrl = `postgresql://sos_app_user:pass@localhost:${testPort}/postgres`;
      expect(() => validateTestDatabaseUrl(postgresUrl)).toThrow(
        /Target database 'postgres' is NOT an authorized test database/i
      );
    });

    it("should reject divergent runtime and migration destinations (R01)", () => {
      const appUrl = `postgresql://sos_app_user:pass@localhost:${testPort}/${TEST_DB_DEFAULT}`;
      const divergentMigrationUrl = `postgresql://sos_migration_owner:pass@127.0.0.1:${testPort}/sos_sales_v3_test_other`;

      expect(() =>
        assertEquivalentTestDestinations(appUrl, divergentMigrationUrl)
      ).toThrow(/Divergent test database destinations/i);
    });

    it("should reject matching roles between runtime and migration (R01)", () => {
      const appUrl = `postgresql://sos_app_user:pass@localhost:${testPort}/${TEST_DB_DEFAULT}`;
      const wrongRoleMigrationUrl = `postgresql://sos_app_user:pass@localhost:${testPort}/${TEST_DB_DEFAULT}`;

      expect(() =>
        assertEquivalentTestDestinations(appUrl, wrongRoleMigrationUrl)
      ).toThrow(/Expected role 'sos_migration_owner'|must use distinct roles/i);
    });

    it("should reject administrative operations without explicit opt-in (R01)", () => {
      const originalOptIn = process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;
      delete process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;

      try {
        expect(() =>
          assertAdministrativeOptIn("CREATE DATABASE", TEST_DB_DEFAULT)
        ).toThrow(/requires explicit opt-in/i);
      } finally {
        if (originalOptIn) {
          process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS = originalOptIn;
        }
      }
    });
  });

  describe("Validação de Admin URL e Guards de Dispose (R01, R02)", () => {
    it("should strictly validate admin maintenance URL and reject remote or non-postgres target", () => {
      expect(() =>
        validateTestAdminDatabaseUrl(`postgresql://sos_user:pass@remote-host:${testPort}/postgres`)
      ).toThrow(/Remote database hosts are strictly forbidden/i);

      expect(() =>
        validateTestAdminDatabaseUrl(`postgresql://sos_user:pass@localhost:${invalidTestPort}/postgres`)
      ).toThrow(new RegExp(`Unexpected port '${invalidTestPort}'`, "i"));

      expect(() =>
        validateTestAdminDatabaseUrl(`postgresql://sos_user:pass@localhost:${testPort}/sos_sales_v3`)
      ).toThrow(/must target 'postgres' maintenance database/i);
    });

    it("should reject dispose with invalid or foreign dbName without opening connection or pool", async () => {
      const originalOptIn = process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;
      process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS = "true";

      try {
        // Attempting to dispose production or lab DB must throw fail-closed
        await expect(disposeTestDatabase("sos_sales_v3")).rejects.toThrow(
          /Refusing administrative operation 'DROP DATABASE' on non-test database/i
        );

        await expect(disposeTestDatabase("production_db")).rejects.toThrow(
          /Refusing administrative operation 'DROP DATABASE' on non-test database/i
        );
      } finally {
        if (originalOptIn) {
          process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS = originalOptIn;
        } else {
          delete process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;
        }
      }
    });

    it("should reject dispose when remote host is configured in environment without opening pool", async () => {
      const originalOptIn = process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;
      const originalHost = process.env.TEST_DB_HOST;
      process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS = "true";
      process.env.TEST_DB_HOST = "attacker-remote-host.com";

      try {
        await expect(disposeTestDatabase("sos_sales_v3_test")).rejects.toThrow(
          /Remote database hosts are strictly forbidden/i
        );
      } finally {
        if (originalOptIn) {
          process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS = originalOptIn;
        } else {
          delete process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;
        }
        if (originalHost) {
          process.env.TEST_DB_HOST = originalHost;
        } else {
          delete process.env.TEST_DB_HOST;
        }
      }
    });
  });

  describe("R03: Higienização de URLs e Sanitização de Erros", () => {
    it("should sanitize database URLs and completely redact passwords", () => {
      const dirtyUrl = `postgresql://sos_app_user:${sentinelPassword}@localhost:${testPort}/sos_sales_v3_test?sslmode=disable`;
      const clean = sanitizeDatabaseUrl(dirtyUrl);

      expect(clean).not.toContain(sentinelPassword);
      expect(clean).toContain("***");
      expect(clean).toContain(`localhost:${testPort}/sos_sales_v3_test`);
    });

    it("should never include raw credentials in validation error messages (R03)", () => {
      const dirtyMalformedUrl = `postgresql://sos_app_user:${sentinelPassword}@db.example.com:${testPort}/sos_sales_v3_test`;

      try {
        validateTestDatabaseUrl(dirtyMalformedUrl);
        expect.unreachable("Should have thrown error");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).not.toContain(sentinelPassword);
        expect(message).toContain("***");
      }
    });
  });

  describe("Verificação de Marcador de Teste e Propriedade de Recurso", () => {
    it("should refuse to drop a database that lacks the test comment marker", async () => {
      const originalOptIn = process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;
      process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS = "true";

      const testDbNoMarker = "sos_sales_v3_test_unmarked";
      const adminPool = new Pool({
        connectionString: `postgresql://sos_user:sos_secret_lab_2026@localhost:${testPort}/postgres?sslmode=disable`,
      });

      try {
        // Create database directly without MCT_TEST_ISOLATED_DB comment
        await adminPool.query(`DROP DATABASE IF EXISTS "${testDbNoMarker}";`);
        await adminPool.query(`CREATE DATABASE "${testDbNoMarker}";`);
        await adminPool.query(`COMMENT ON DATABASE "${testDbNoMarker}" IS 'FOREIGN_DATABASE_WITHOUT_MARKER';`);

        // Attempting to dispose it must be rejected because it lacks MCT_TEST_ISOLATED_DB marker
        await expect(disposeTestDatabase(testDbNoMarker)).rejects.toThrow(
          /lacks the required test marker 'MCT_TEST_ISOLATED_DB'/i
        );

        // Also bootstrap with dropExisting should refuse to drop unverified database
        await expect(
          bootstrapTestDatabase(testDbNoMarker, { dropExisting: true })
        ).rejects.toThrow(/lacks test comment marker 'MCT_TEST_ISOLATED_DB'/i);
      } finally {
        // Cleanup manual test DB
        await adminPool.query(`DROP DATABASE IF EXISTS "${testDbNoMarker}";`);
        await adminPool.end();
        if (originalOptIn) {
          process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS = originalOptIn;
        } else {
          delete process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;
        }
      }
    });

    it("should refuse to drop a database if expected runId does not match", async () => {
      const originalOptIn = process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;
      process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS = "true";

      const runIdA = "run_alpha_123";
      const dbName = "sos_sales_v3_test_run_alpha_123";

      try {
        await bootstrapTestDatabase(dbName, { dropExisting: true, runId: runIdA });

        // Attempt to dispose with wrong runId
        await expect(
          disposeTestDatabase(dbName, { expectedRunId: "run_beta_999" })
        ).rejects.toThrow(/runId mismatch/i);

        // Dispose with correct runId must succeed
        await disposeTestDatabase(dbName, { expectedRunId: runIdA });
      } finally {
        if (originalOptIn) {
          process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS = originalOptIn;
        } else {
          delete process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;
        }
      }
    });

    it("should refuse to recreate an existing database if runId does not match during bootstrap with dropExisting", async () => {
      const originalOptIn = process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;
      process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS = "true";

      const ownerRunId = "run_owner_alpha";
      const foreignRunId = "run_foreign_beta";
      const dbName = "sos_sales_v3_test_run_recreate_check";

      try {
        // 1. Initial bootstrap with owner runId
        await bootstrapTestDatabase(dbName, { dropExisting: true, runId: ownerRunId });

        // 2. Attempting to bootstrap with dropExisting and foreign runId must fail closed
        await expect(
          bootstrapTestDatabase(dbName, { dropExisting: true, runId: foreignRunId })
        ).rejects.toThrow(
          /runId mismatch\. Expected run_id='run_foreign_beta', but found 'run_owner_alpha'/i
        );

        // 3. Attempting to bootstrap with dropExisting without runId must also fail (runId mismatch with environment or default)
        const expectedUnsetRunId = process.env.TEST_RUN_ID || "default";
        await expect(
          bootstrapTestDatabase(dbName, { dropExisting: true })
        ).rejects.toThrow(
          new RegExp(`runId mismatch\\. Expected run_id='${expectedUnsetRunId}', but found 'run_owner_alpha'`, "i")
        );

        // 4. Re-bootstrapping with the matching runId must succeed
        await bootstrapTestDatabase(dbName, { dropExisting: true, runId: ownerRunId });
      } finally {
        await disposeTestDatabase(dbName, { expectedRunId: ownerRunId });
        if (originalOptIn) {
          process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS = originalOptIn;
        } else {
          delete process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;
        }
      }
    });
  });

  describe("Isolamento de Runners Concorrentes (RUN_ID)", () => {
    it("should allow two concurrent runners with distinct runIds without interference", async () => {
      const originalOptIn = process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;
      process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS = "true";

      const runner1 = generateTestRunDatabaseName("sos_sales_v3_test");
      const runner2 = generateTestRunDatabaseName("sos_sales_v3_test");

      expect(runner1.dbName).not.toBe(runner2.dbName);
      expect(runner1.runId).not.toBe(runner2.runId);

      try {
        // Bootstrap both in parallel
        await Promise.all([
          bootstrapTestDatabase(runner1.dbName, { runId: runner1.runId, dropExisting: true }),
          bootstrapTestDatabase(runner2.dbName, { runId: runner2.runId, dropExisting: true }),
        ]);

        // Connect to both and verify they exist independently
        const pool1 = new Pool({
          connectionString: `postgresql://sos_app_user:sos_app_secret_2026@localhost:${testPort}/${runner1.dbName}?sslmode=disable`,
        });
        const pool2 = new Pool({
          connectionString: `postgresql://sos_app_user:sos_app_secret_2026@localhost:${testPort}/${runner2.dbName}?sslmode=disable`,
        });

        await confirmTestDatabaseContext(pool1, runner1.dbName, "sos_app_user");
        await confirmTestDatabaseContext(pool2, runner2.dbName, "sos_app_user");

        await pool1.end();
        await pool2.end();

        // Dispose runner1, runner2 remains untouched
        await disposeTestDatabase(runner1.dbName, { expectedRunId: runner1.runId });

        // Verify runner2 is still operational
        const pool2Check = new Pool({
          connectionString: `postgresql://sos_app_user:sos_app_secret_2026@localhost:${testPort}/${runner2.dbName}?sslmode=disable`,
        });
        await confirmTestDatabaseContext(pool2Check, runner2.dbName, "sos_app_user");
        await pool2Check.end();

        // Dispose runner2
        await disposeTestDatabase(runner2.dbName, { expectedRunId: runner2.runId });
      } finally {
        if (originalOptIn) {
          process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS = originalOptIn;
        } else {
          delete process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;
        }
      }
    });
  });

  describe("Validação de Contexto no Servidor e Transação DDL Negativa", () => {
    const targetDb = process.env.TEST_DB_NAME || TEST_DB_DEFAULT;

    beforeAll(async () => {
      const originalOptIn = process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;
      process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS = "true";
      try {
        await bootstrapTestDatabase(targetDb, { dropExisting: false });
      } finally {
        if (originalOptIn) {
          process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS = originalOptIn;
        } else {
          delete process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;
        }
      }
    });

    it("should verify server-side context on active test database", async () => {
      const { appPool, ownerPool } = createTestDatabasePools(targetDb);

      try {
        await confirmTestDatabaseContext(appPool, targetDb, "sos_app_user");
        await confirmTestDatabaseContext(ownerPool, targetDb, "sos_migration_owner");
      } finally {
        await appPool.end();
        await ownerPool.end();
      }
    });

    it("should safely rollback negative DDL test statements on expected permission denied", async () => {
      const { appPool } = createTestDatabasePools(targetDb);
      const client = await appPool.connect();

      try {
        await expect(
          runSafeNegativeDdlTest(client, "DROP TABLE IF EXISTS audit_events;")
        ).rejects.toThrow(/must be owner|permission denied/i);

        const checkRes = await client.query(
          "SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_events';"
        );
        expect(checkRes.rowCount).toBe(1);
      } finally {
        client.release();
        await appPool.end();
      }
    });

    it("should detect privilege regression and rollback if a dangerous DDL statement unexpectedly succeeds", async () => {
      // Use ownerPool (which has table creation privileges) to simulate an unexpected success in runSafeNegativeDdlTest
      const { ownerPool } = createTestDatabasePools(targetDb);
      const client = await ownerPool.connect();

      try {
        // A statement that succeeds on ownerPool but was run through runSafeNegativeDdlTest
        // must trigger the PRIVILEGE REGRESSION DETECTED error AND roll back the transaction!
        await expect(
          runSafeNegativeDdlTest(client, "CREATE TABLE public.accidental_leak_test (id INT);")
        ).rejects.toThrow(/PRIVILEGE REGRESSION DETECTED/i);

        // Verify that because of the rollback, the table was NOT created in the schema!
        const checkRes = await client.query(
          "SELECT to_regclass('public.accidental_leak_test') as tbl;"
        );
        expect(checkRes.rows[0].tbl).toBeNull();
      } finally {
        client.release();
        await ownerPool.end();
      }
    });
  });

  describe("Desativação Temporária de cleanOrphanTestDatabases (Política de Segurança)", () => {
    it("should refuse orphan cleanup based on age alone according to safety policy", async () => {
      const originalOptIn = process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;
      process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS = "true";

      try {
        await expect(cleanOrphanTestDatabases({ maxAgeMs: 0 })).rejects.toThrow(
          /SAFETY POLICY: Automated orphan cleanup based on age is temporarily disabled/i
        );
      } finally {
        if (originalOptIn) {
          process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS = originalOptIn;
        } else {
          delete process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;
        }
      }
    });
  });

  describe("Interrupção por Sinal Durante Bootstrap (SIGINT / SIGTERM)", () => {
    it("should abort before spawning child process and safely dispose database when SIGINT arrives during bootstrap", async () => {
      const originalOptIn = process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;
      process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS = "true";

      let spawnCalled = false;
      const mockSpawn = async () => {
        spawnCalled = true;
        return 0;
      };

      try {
        const result = await executeTestRunnerSession({
          simulateSignalDuringBootstrap: "SIGINT",
          spawnRunner: mockSpawn,
        });

        // 1. Must NOT have spawned the child process
        expect(spawnCalled).toBe(false);
        expect(result.spawned).toBe(false);
        expect(result.abortedBeforeSpawn).toBe(true);

        // 2. Exit code must reflect SIGINT interruption (130)
        expect(result.exitCode).toBe(130);

        // 3. Database must have been safely disposed in finally
        expect(result.disposed).toBe(true);

        // 4. Verify directly in PostgreSQL that the database does NOT exist
        const { appPool } = createTestDatabasePools();
        const checkRes = await appPool.query(
          "SELECT 1 FROM pg_database WHERE datname = $1;",
          [result.dbName]
        );
        expect(checkRes.rowCount).toBe(0);
        await appPool.end();
      } finally {
        if (originalOptIn) {
          process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS = originalOptIn;
        } else {
          delete process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;
        }
      }
    });

    it("should abort before spawning child process and safely dispose database when SIGTERM arrives during bootstrap", async () => {
      const originalOptIn = process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;
      process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS = "true";

      let spawnCalled = false;
      const mockSpawn = async () => {
        spawnCalled = true;
        return 0;
      };

      try {
        const result = await executeTestRunnerSession({
          simulateSignalDuringBootstrap: "SIGTERM",
          spawnRunner: mockSpawn,
        });

        // Must NOT spawn child process, must abort before spawn
        expect(spawnCalled).toBe(false);
        expect(result.spawned).toBe(false);
        expect(result.abortedBeforeSpawn).toBe(true);

        // Exit code 143 for SIGTERM
        expect(result.exitCode).toBe(143);
        expect(result.disposed).toBe(true);

        // Verify database is completely disposed
        const { appPool } = createTestDatabasePools();
        const checkRes = await appPool.query(
          "SELECT 1 FROM pg_database WHERE datname = $1;",
          [result.dbName]
        );
        expect(checkRes.rowCount).toBe(0);
        await appPool.end();
      } finally {
        if (originalOptIn) {
          process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS = originalOptIn;
        } else {
          delete process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS;
        }
      }
    });
  });
});

