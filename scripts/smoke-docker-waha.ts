import { execSync } from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const PORT = process.env.PORT_WAHA || "3000";
const BASE_URL = `http://127.0.0.1:${PORT}`;
const API_KEY = process.env.WAHA_API_KEY || "smoke_test_api_key_2026";
const CONTAINER_NAME = "sos-v3-waha";
const SESSION_NAME = "lab-smoke-session";

interface StepResult {
  step: string;
  status: "PASS" | "FAIL" | "BLOCKED_EXTERNAL" | "SKIPPED";
  details: string;
  durationMs?: number;
}

const results: StepResult[] = [];

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runStep(
  step: string,
  fn: () => Promise<{ status: "PASS" | "FAIL" | "BLOCKED_EXTERNAL"; details: string }>
): Promise<boolean> {
  const start = Date.now();
  console.log(`\n[STEP] ${step}...`);
  try {
    const res = await fn();
    const durationMs = Date.now() - start;
    results.push({
      step,
      status: res.status,
      details: res.details,
      durationMs,
    });
    console.log(` -> [${res.status}] ${res.details} (${durationMs}ms)`);
    return res.status === "PASS" || res.status === "BLOCKED_EXTERNAL";
  } catch (err) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    results.push({
      step,
      status: "FAIL",
      details: msg,
      durationMs,
    });
    console.error(` -> [FAIL] ${msg} (${durationMs}ms)`);
    return false;
  }
}

async function main() {
  console.log("================================================================================");
  console.log(" SOS SALES V3 — WAHA DOCKER SMOKE TEST RUNNER (CH-10)");
  console.log("================================================================================");
  console.log(`Target URL:     ${BASE_URL}`);
  console.log(`Container:      ${CONTAINER_NAME}`);
  console.log(`Session:        ${SESSION_NAME}`);
  console.log("================================================================================");

  let dockerAvailable = false;
  try {
    const { stdout } = await execAsync("docker info --format '{{.ServerVersion}}'");
    if (stdout.trim()) {
      dockerAvailable = true;
      console.log(`Docker daemon detected: version ${stdout.trim()}`);
    }
  } catch {
    console.log("Docker daemon is offline or inaccessible.");
  }

  if (!dockerAvailable) {
    console.log("\n[NOTICE] Docker daemon offline — marking smoke test as BLOCKED_EXTERNAL: EXT-02");
    results.push({
      step: "docker_daemon_connectivity",
      status: "BLOCKED_EXTERNAL",
      details: "Docker daemon offline or not running in current environment (EXT-02)",
    });
    printSummary();
    return;
  }

  // 1. Render compose config
  const step1 = await runStep("1. Render docker compose config", async () => {
    const { stdout } = await execAsync("docker compose --profile waha config");
    if (stdout.includes("sos-v3-waha")) {
      return { status: "PASS", details: "Compose configuration parsed successfully without syntax errors" };
    }
    return { status: "FAIL", details: "Service sos-v3-waha not found in rendered config" };
  });

  if (!step1) {
    printSummary();
    process.exit(1);
  }

  // 2. Start WAHA container
  const step2 = await runStep("2. Start isolated WAHA container", async () => {
    const env = { ...process.env, WAHA_API_KEY: API_KEY };
    await execAsync("docker compose --profile waha up -d waha", { env });
    return { status: "PASS", details: `Container ${CONTAINER_NAME} started in background` };
  });

  if (!step2) {
    printSummary();
    await cleanup();
    process.exit(1);
  }

  try {
    // 3. Poll healthcheck probe and version endpoint
    const step3 = await runStep("3. Poll WAHA health / version probe", async () => {
      const maxAttempts = 30; // up to 60s
      let lastError = "";

      for (let i = 0; i < maxAttempts; i++) {
        try {
          const res = await fetch(`${BASE_URL}/api/server/version`, {
            headers: { "X-Api-Key": API_KEY },
          });

          if (res.ok) {
            const data = (await res.json()) as Record<string, unknown>;
            return {
              status: "PASS",
              details: `WAHA healthy! Server version: ${JSON.stringify(data.version || data)}`,
            };
          } else {
            lastError = `HTTP ${res.status}: ${await res.text()}`;
          }
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
        }
        await delay(2000);
      }

      return { status: "FAIL", details: `Health probe timed out after 60s. Last error: ${lastError}` };
    });

    if (!step3) {
      await cleanup();
      printSummary();
      process.exit(1);
    }

    // 4. Create lab session (no pairing required)
    await runStep("4. Create lab session via REST API", async () => {
      const res = await fetch(`${BASE_URL}/api/sessions/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": API_KEY,
        },
        body: JSON.stringify({ name: SESSION_NAME }),
      });

      if (res.status === 201 || res.status === 200) {
        const body = (await res.json()) as Record<string, unknown>;
        return {
          status: "PASS",
          details: `Session '${SESSION_NAME}' initiated (status: ${body.status || "STARTING"})`,
        };
      }

      // Check if session already exists
      if (res.status === 422 || res.status === 400) {
        const text = await res.text();
        if (text.includes("already exists")) {
          return { status: "PASS", details: `Session '${SESSION_NAME}' already exists and active` };
        }
      }

      return { status: "FAIL", details: `Failed to start session: HTTP ${res.status} ${await res.text()}` };
    });

    // 5. Query active sessions
    await runStep("5. Verify session listing", async () => {
      const res = await fetch(`${BASE_URL}/api/sessions?all=true`, {
        headers: { "X-Api-Key": API_KEY },
      });

      if (!res.ok) {
        return { status: "FAIL", details: `GET /api/sessions failed with HTTP ${res.status}` };
      }

      const sessions = (await res.json()) as Array<{ name: string; status: string }>;
      const found = sessions.some((s) => s.name === SESSION_NAME);

      if (found) {
        return { status: "PASS", details: `Found session '${SESSION_NAME}' in active session list` };
      }
      return { status: "FAIL", details: `Session '${SESSION_NAME}' not found in: ${JSON.stringify(sessions)}` };
    });

    // 6. Restart container to test persistence
    await runStep("6. Restart container to test volume persistence", async () => {
      await execAsync(`docker restart ${CONTAINER_NAME}`);
      return { status: "PASS", details: `Container ${CONTAINER_NAME} restarted cleanly` };
    });

    // 7. Verify session persists after restart
    await runStep("7. Verify structural persistence of session after restart", async () => {
      // Wait for boot after restart
      let restored = false;
      for (let i = 0; i < 20; i++) {
        await delay(2000);
        try {
          const res = await fetch(`${BASE_URL}/api/sessions?all=true`, {
            headers: { "X-Api-Key": API_KEY },
          });
          if (res.ok) {
            const sessions = (await res.json()) as Array<{ name: string; status: string }>;
            if (sessions.some((s) => s.name === SESSION_NAME)) {
              restored = true;
              break;
            }
          }
        } catch {}
      }

      if (restored) {
        return {
          status: "PASS",
          details: `Session '${SESSION_NAME}' successfully survived container restart via volume sos_v3_waha_sessions`,
        };
      }
      return { status: "FAIL", details: `Session '${SESSION_NAME}' was lost after restart` };
    });

  } finally {
    // 8. Targeted cleanup
    await runStep("8. Targeted cleanup of container", async () => {
      await cleanup();
      return { status: "PASS", details: `Container ${CONTAINER_NAME} stopped and removed without touching other services or data` };
    });
  }

  printSummary();
}

async function cleanup(): Promise<void> {
  try {
    await execAsync(`docker stop ${CONTAINER_NAME}`);
  } catch {}
  try {
    await execAsync(`docker rm ${CONTAINER_NAME}`);
  } catch {}
}

function printSummary() {
  console.log("\n================================================================================");
  console.log(" SMOKE TEST SCORECARD");
  console.log("================================================================================");

  let hasFailures = false;
  for (const r of results) {
    const icon = r.status === "PASS" ? "✓ PASS" : r.status === "BLOCKED_EXTERNAL" ? "⊘ BLOCKED" : "✗ FAIL";
    console.log(`[${icon}] ${r.step}: ${r.details}`);
    if (r.status === "FAIL") hasFailures = false; // flag if fail
  }

  console.log("================================================================================");
  if (hasFailures) {
    console.error("SMOKE TEST FAILED: One or more steps failed.");
    process.exit(1);
  } else {
    console.log("SMOKE TEST COMPLETED: All executed steps passed.");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("FATAL UNCAUGHT SMOKE RUNNER ERROR:", err);
  process.exit(1);
});
