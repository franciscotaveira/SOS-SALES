import {
  bootstrapTestDatabase,
  disposeTestDatabase,
  executeTestRunnerSession,
  TEST_DB_DEFAULT,
} from "../packages/database/src/test-support";

const command = process.argv[2] || "run";
const rawTargetDb = process.argv[3];

// Check explicit administrative opt-in; DO NOT force it internally
if (process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS !== "true") {
  console.error(
    "[test-db-runner] FATAL SAFETY ERROR: Administrative database operations require explicit opt-in via environment variable (ALLOW_TEST_DB_ADMIN_OPERATIONS=true)."
  );
  process.exit(1);
}

async function main() {
  if (command === "clean-orphans") {
    console.error(
      "[test-db-runner] FATAL SAFETY ERROR: 'clean-orphans' is temporarily disabled by safety policy. Age alone does not authorize deletion without proving process inactivity."
    );
    process.exit(1);
  }

  if (command === "bootstrap") {
    const targetDb = rawTargetDb || TEST_DB_DEFAULT;
    const runId = process.env.TEST_RUN_ID || "bootstrap";
    console.log(`[test-db-runner] Bootstrapping test database '${targetDb}' (runId: '${runId}')...`);
    await bootstrapTestDatabase(targetDb, { dropExisting: true, runId });
    console.log(`[test-db-runner] Successfully bootstrapped test database '${targetDb}'.`);
    return;
  }

  if (command === "dispose") {
    const targetDb = rawTargetDb || TEST_DB_DEFAULT;
    console.log(`[test-db-runner] Disposing test database '${targetDb}'...`);
    await disposeTestDatabase(targetDb);
    console.log(`[test-db-runner] Successfully disposed test database '${targetDb}'.`);
    return;
  }

  if (command === "run") {
    const result = await executeTestRunnerSession({
      targetDb: rawTargetDb,
      registerSignalHandlers: true,
    });
    console.log(`[test-db-runner] Finished with exit code ${result.exitCode}.`);
    process.exit(result.exitCode);
  }

  console.error(`[test-db-runner] Unknown command '${command}'. Use 'bootstrap', 'dispose', or 'run'.`);
  process.exit(1);
}

main().catch((err) => {
  console.error("[test-db-runner] FATAL UNCAUGHT:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});

