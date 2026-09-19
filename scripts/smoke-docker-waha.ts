import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const SAFE_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

export function validateSafeName(name: string, fieldName: string): string {
  if (!name || typeof name !== "string" || !SAFE_NAME_REGEX.test(name)) {
    throw new Error(`Security validation error: invalid ${fieldName} '${name}'. Must match ${SAFE_NAME_REGEX}`);
  }
  return name;
}

export type CommandExecutor = (
  file: string,
  args: readonly string[],
  options?: { env?: NodeJS.ProcessEnv; timeout?: number }
) => Promise<{ stdout: string; stderr: string }>;

export const defaultCommandExecutor: CommandExecutor = async (file, args, options) => {
  return execFileAsync(file, [...args], {
    env: options?.env ?? process.env,
    timeout: options?.timeout ?? 60000,
  });
};

export interface StepResult {
  step: string;
  status: "PASS" | "FAIL" | "BLOCKED_EXTERNAL" | "SKIPPED";
  details: string;
  durationMs?: number;
}

export interface SmokeConfig {
  port?: string;
  baseUrl?: string;
  apiKey?: string;
  containerName?: string;
  sessionName?: string;
  preventCleanupOnExit?: boolean;
  simulateFailureAtStep?: number;
  execFileFn?: CommandExecutor;
  execFn?: (cmd: string) => Promise<{ stdout: string; stderr: string }>;
}

export interface SmokeLifecycleResult {
  success: boolean;
  exitCode: number;
  results: StepResult[];
}

export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WahaSmokeRunner {
  public readonly port: string;
  public readonly baseUrl: string;
  public readonly apiKey: string;
  public readonly containerName: string;
  public readonly sessionName: string;
  public readonly simulateFailureAtStep?: number;
  public readonly results: StepResult[] = [];
  public containerPreExisted = false;
  private sessionCreatedByTest = false;
  private containerStartedByTest = false;
  private readonly preventCleanupOnExit: boolean;
  private readonly execFile: CommandExecutor;

  constructor(config: SmokeConfig = {}) {
    this.port = config.port || process.env.PORT_WAHA || "3000";
    this.baseUrl = config.baseUrl || `http://127.0.0.1:${this.port}`;
    this.apiKey = config.apiKey || process.env.WAHA_API_KEY || "smoke_test_api_key_2026";
    process.env.WAHA_API_KEY = this.apiKey;

    const rawContainerName = config.containerName || "sos-v3-waha";
    this.containerName = validateSafeName(rawContainerName, "containerName");

    const rawSessionName =
      config.sessionName ||
      process.env.WAHA_SESSION_NAME ||
      `lab-smoke-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    this.sessionName = validateSafeName(rawSessionName, "sessionName");

    this.preventCleanupOnExit = Boolean(config.preventCleanupOnExit);
    this.simulateFailureAtStep =
      config.simulateFailureAtStep ||
      (process.env.SMOKE_SIMULATE_FAILURE_STEP ? parseInt(process.env.SMOKE_SIMULATE_FAILURE_STEP, 10) : undefined);

    if (config.execFileFn) {
      this.execFile = config.execFileFn;
    } else if (config.execFn) {
      const legacyExec = config.execFn;
      this.execFile = async (file, args) => legacyExec(`${file} ${args.join(" ")}`);
    } else {
      this.execFile = defaultCommandExecutor;
    }
  }

  async runStep(
    step: string,
    fn: () => Promise<{ status: "PASS" | "FAIL" | "BLOCKED_EXTERNAL"; details: string }>
  ): Promise<boolean> {
    const start = Date.now();
    console.log(`\n[STEP] ${step}...`);

    if (this.simulateFailureAtStep) {
      const stepMatch = step.match(/^(\d+)\./);
      if (stepMatch && parseInt(stepMatch[1], 10) === this.simulateFailureAtStep) {
        const durationMs = 1;
        this.results.push({
          step,
          status: "FAIL",
          details: `Simulated controlled failure for step ${this.simulateFailureAtStep} (anti-false-pass verification)`,
          durationMs,
        });
        console.error(` -> [FAIL] Simulated controlled failure for step ${this.simulateFailureAtStep} (anti-false-pass verification)`);
        return false;
      }
    }

    try {
      const res = await fn();
      const durationMs = Date.now() - start;
      this.results.push({
        step,
        status: res.status,
        details: res.details,
        durationMs,
      });
      console.log(` -> [${res.status}] ${res.details} (${durationMs}ms)`);
      return res.status === "PASS";
    } catch (err) {
      const durationMs = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      this.results.push({
        step,
        status: "FAIL",
        details: msg,
        durationMs,
      });
      console.error(` -> [FAIL] ${msg} (${durationMs}ms)`);
      return false;
    }
  }

  async checkPreExistingContainer(): Promise<boolean> {
    try {
      const { stdout } = await this.execFile("docker", [
        "ps",
        "-a",
        "--filter",
        `name=^/${this.containerName}$`,
        "--format",
        "{{.Names}}",
      ]);
      const names = stdout.trim().split("\n").map((n) => n.trim()).filter(Boolean);
      return names.includes(this.containerName);
    } catch {
      return false;
    }
  }

  async checkPreExistingSession(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/sessions?all=true`, {
        headers: { "X-Api-Key": this.apiKey },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const sessions = (await res.json()) as Array<{ name: string }>;
        return sessions.some((s) => s.name === this.sessionName);
      }
    } catch {}
    return false;
  }

  async deleteSessionViaApi(): Promise<{ success: boolean; error?: string }> {
    if (!this.sessionCreatedByTest) {
      // Pre-existing session or session not created by test: preserve it!
      return { success: true };
    }

    let lastError = "";
    const encodedSession = encodeURIComponent(this.sessionName);

    // 1. Try DELETE /api/sessions/{session}
    try {
      const deleteRes = await fetch(`${this.baseUrl}/api/sessions/${encodedSession}`, {
        method: "DELETE",
        headers: { "X-Api-Key": this.apiKey },
        signal: AbortSignal.timeout(15000),
      });
      if (deleteRes.ok || deleteRes.status === 404) {
        return { success: true };
      }
      const text = await deleteRes.text().catch(() => "");
      lastError = `DELETE: ${deleteRes.status} ${text}`.trim();
    } catch (err) {
      lastError = `DELETE: ${err instanceof Error ? err.message : String(err)}`;
    }

    // 2. Fallback to POST /api/sessions/stop
    try {
      const stopRes = await fetch(`${this.baseUrl}/api/sessions/stop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": this.apiKey,
        },
        body: JSON.stringify({ name: this.sessionName, logout: true }),
        signal: AbortSignal.timeout(15000),
      });
      if (stopRes.ok || stopRes.status === 404) {
        return { success: true };
      }
      const text = await stopRes.text().catch(() => "");
      lastError += `, STOP: ${stopRes.status} ${text}`.trim();
    } catch (err) {
      lastError += `, STOP: ${err instanceof Error ? err.message : String(err)}`;
    }

    return {
      success: false,
      error: `Failed to delete session '${this.sessionName}' via API (${lastError})`,
    };
  }

  async cleanupContainer(): Promise<{
    success: boolean;
    cleanedResources: string[];
    preservedResources: string[];
    errors: string[];
  }> {
    const cleanedResources: string[] = [];
    const preservedResources: string[] = [];
    const errors: string[] = [];

    // 1. Session cleanup
    if (this.sessionCreatedByTest) {
      const sessionDelete = await this.deleteSessionViaApi();
      if (sessionDelete.success) {
        cleanedResources.push(`Session '${this.sessionName}' (via REST API)`);
      } else {
        errors.push(sessionDelete.error || `Failed to delete session '${this.sessionName}'`);
      }
    } else {
      preservedResources.push(`Session '${this.sessionName}' (pre-existing)`);
    }

    // 2. Container cleanup
    if (this.containerStartedByTest) {
      try {
        await this.execFile("docker", ["stop", "-t", "3", this.containerName]);
        cleanedResources.push(`Container '${this.containerName}' (stopped)`);
      } catch (err) {
        errors.push(`Failed to stop container '${this.containerName}': ${err instanceof Error ? err.message : String(err)}`);
      }

      try {
        await this.execFile("docker", ["rm", "-f", this.containerName]);
        cleanedResources.push(`Container '${this.containerName}' (removed)`);
      } catch (err) {
        errors.push(`Failed to remove container '${this.containerName}': ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      preservedResources.push(`Container '${this.containerName}' (pre-existing)`);
    }

    // Volume is always preserved
    preservedResources.push("Volume 'sos_v3_waha_sessions' (data persistence)");

    return {
      success: errors.length === 0,
      cleanedResources,
      preservedResources,
      errors,
    };
  }

  evaluateVerdict(): { success: boolean; exitCode: number } {
    console.log("\n================================================================================");
    console.log(" SMOKE TEST SCORECARD");
    console.log("================================================================================");

    let hasFailures = false;
    for (const r of this.results) {
      const icon = r.status === "PASS" ? "✓ PASS" : r.status === "BLOCKED_EXTERNAL" ? "⊘ BLOCKED" : "✗ FAIL";
      console.log(`[${icon}] ${r.step}: ${r.details}`);
      if (r.status === "FAIL") {
        hasFailures = true; // Strict: any FAIL marks the run as failed
      }
    }

    console.log("================================================================================");
    if (hasFailures) {
      console.error("SMOKE TEST FAILED: One or more steps failed. Strict exit code 1 enforced.");
      return { success: false, exitCode: 1 };
    }

    const hasBlocked = this.results.some((r) => r.status === "BLOCKED_EXTERNAL");
    if (hasBlocked) {
      console.log("SMOKE TEST BLOCKED_EXTERNAL: Environment dependencies missing. Exit code 2 enforced.");
      return { success: false, exitCode: 2 }; // Distinct and documented exit code 2
    }

    console.log("SMOKE TEST COMPLETED: All executed steps passed.");
    return { success: true, exitCode: 0 };
  }

  async execute(): Promise<SmokeLifecycleResult> {
    console.log("================================================================================");
    console.log(" SOS SALES V3 — WAHA DOCKER SMOKE TEST RUNNER (CH-10)");
    console.log("================================================================================");
    console.log(`Target URL:     ${this.baseUrl}`);
    console.log(`Container:      ${this.containerName}`);
    console.log(`Session:        ${this.sessionName}`);
    console.log("================================================================================");

    let dockerAvailable = false;
    try {
      const { stdout } = await this.execFile("docker", ["info", "--format", "{{.ServerVersion}}"]);
      if (stdout.trim()) {
        dockerAvailable = true;
        console.log(`Docker daemon detected: version ${stdout.trim()}`);
      }
    } catch {
      console.log("Docker daemon is offline or inaccessible.");
    }

    if (!dockerAvailable) {
      console.log("\n[NOTICE] Docker daemon offline — marking smoke test as BLOCKED_EXTERNAL: EXT-02");
      this.results.push({
        step: "docker_daemon_connectivity",
        status: "BLOCKED_EXTERNAL",
        details: "Docker daemon offline or not running in current environment (EXT-02)",
      });
      const verdict = this.evaluateVerdict();
      return { success: verdict.success, exitCode: verdict.exitCode, results: this.results };
    }

    try {
      stepPipeline: {
        // 1. Render compose config
        const step1 = await this.runStep("1. Render docker compose config", async () => {
          const { stdout } = await this.execFile(
            "docker",
            ["compose", "--profile", "waha", "config"],
            { env: { ...process.env, WAHA_API_KEY: this.apiKey } }
          );
          if (stdout.includes("sos-v3-waha")) {
            return { status: "PASS", details: "Compose configuration parsed successfully without syntax errors" };
          }
          return { status: "FAIL", details: "Service sos-v3-waha not found in rendered config" };
        });

        if (!step1) break stepPipeline;

        // Check pre-existing container before starting to preserve external containers
        this.containerPreExisted = await this.checkPreExistingContainer();
        if (this.containerPreExisted) {
          console.log(`\n[BLOCKED_EXTERNAL] Pre-existing container '${this.containerName}' detected; preserving it and aborting smoke to maintain isolation.`);
          this.results.push({
            step: "2. Start isolated WAHA container",
            status: "BLOCKED_EXTERNAL",
            details: `Pre-existing container '${this.containerName}' prevents isolated test execution. Remove or stop it manually to run smoke test.`,
          });
          break stepPipeline;
        }

        // 2. Start WAHA container
        const step2 = await this.runStep("2. Start isolated WAHA container", async () => {
          await this.execFile(
            "docker",
            ["compose", "--profile", "waha", "up", "-d", "waha"],
            { env: { ...process.env, WAHA_API_KEY: this.apiKey } }
          );
          this.containerStartedByTest = true;
          return { status: "PASS", details: `Container ${this.containerName} started in background` };
        });

        if (!step2) break stepPipeline;

        // 3. Poll healthcheck probe and version endpoint
        const step3 = await this.runStep("3. Poll WAHA health / version probe", async () => {
          const maxAttempts = 30; // up to 60s
          let lastError = "";

          for (let i = 0; i < maxAttempts; i++) {
            try {
              const res = await fetch(`${this.baseUrl}/api/server/version`, {
                headers: { "X-Api-Key": this.apiKey },
              });

              if (res.ok) {
                const data = (await res.json()) as Record<string, unknown>;
                return {
                  status: "PASS",
                  details: `WAHA healthy! Server version: ${JSON.stringify(data.version || data)}`,
                };
              } else if (res.status === 401 || res.status === 403) {
                return {
                  status: "FAIL",
                  details: `WAHA rejected API key: HTTP ${res.status}`,
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

        if (!step3) break stepPipeline;

        // Check if session pre-exists before Step 4
        const preExisting = await this.checkPreExistingSession();
        if (!preExisting) {
          this.sessionCreatedByTest = true;
        }

        // 4. Create lab session (no pairing required)
        const step4 = await this.runStep("4. Create lab session via REST API", async () => {
          const res = await fetch(`${this.baseUrl}/api/sessions/start`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Api-Key": this.apiKey,
            },
            body: JSON.stringify({ name: this.sessionName }),
          });

          if (res.status === 201 || res.status === 200) {
            const body = (await res.json()) as Record<string, unknown>;
            return {
              status: "PASS",
              details: `Session '${this.sessionName}' initiated (status: ${body.status || "STARTING"})`,
            };
          }

          if (res.status === 422 || res.status === 400) {
            const text = await res.text();
            if (text.includes("already exists")) {
              return { status: "PASS", details: `Session '${this.sessionName}' already exists and active` };
            }
          }

          return { status: "FAIL", details: `Failed to start session: HTTP ${res.status} ${await res.text()}` };
        });

        if (!step4) break stepPipeline;

        // 5. Query active sessions
        const step5 = await this.runStep("5. Verify session listing", async () => {
          const res = await fetch(`${this.baseUrl}/api/sessions?all=true`, {
            headers: { "X-Api-Key": this.apiKey },
          });

          if (!res.ok) {
            return { status: "FAIL", details: `GET /api/sessions failed with HTTP ${res.status}` };
          }

          const sessions = (await res.json()) as Array<{ name: string; status: string }>;
          const found = sessions.some((s) => s.name === this.sessionName);

          if (found) {
            return { status: "PASS", details: `Found session '${this.sessionName}' in active session list` };
          }
          return { status: "FAIL", details: `Session '${this.sessionName}' not found in: ${JSON.stringify(sessions)}` };
        });

        if (!step5) break stepPipeline;

        // 6. Restart container to test persistence
        const step6 = await this.runStep("6. Restart container to test volume persistence", async () => {
          await this.execFile("docker", ["restart", this.containerName]);
          return { status: "PASS", details: `Container ${this.containerName} restarted cleanly` };
        });

        if (!step6) break stepPipeline;

        // 7. Verify session persists after restart
        const step7 = await this.runStep("7. Verify structural persistence of session after restart", async () => {
          let restored = false;
          for (let i = 0; i < 20; i++) {
            await delay(2000);
            try {
              const res = await fetch(`${this.baseUrl}/api/sessions?all=true`, {
                headers: { "X-Api-Key": this.apiKey },
              });
              if (res.ok) {
                const sessions = (await res.json()) as Array<{ name: string; status: string }>;
                const found = sessions.find((s) => s.name === this.sessionName);
                if (found) {
                  restored = true;
                  break;
                }
              }
            } catch {}
          }

          if (restored) {
            return {
              status: "PASS",
              details: `Session '${this.sessionName}' successfully survived container restart via volume sos_v3_waha_sessions`,
            };
          }
          return { status: "FAIL", details: `Session '${this.sessionName}' was lost after restart` };
        });

        if (!step7) break stepPipeline;
      }
    } finally {
      // 8. Targeted cleanup guaranteed by finally
      if (!this.preventCleanupOnExit) {
        await this.runStep("8. Targeted cleanup of container and test session", async () => {
          const cleanup = await this.cleanupContainer();
          const details = [
            `Cleaned: [${cleanup.cleanedResources.join(", ") || "none"}]`,
            `Preserved: [${cleanup.preservedResources.join(", ") || "none"}]`,
            cleanup.errors.length > 0 ? `Errors: [${cleanup.errors.join("; ")}]` : null,
          ]
            .filter(Boolean)
            .join(" | ");

          if (!cleanup.success) {
            return {
              status: "FAIL",
              details: `Cleanup failed to completely remove test resources: ${details}`,
            };
          }

          return {
            status: "PASS",
            details,
          };
        });
      }
    }

    // Verdict is computed ONLY AFTER finally has executed completely
    const verdict = this.evaluateVerdict();
    return { success: verdict.success, exitCode: verdict.exitCode, results: this.results };
  }
}

export async function runWahaSmoke(config: SmokeConfig = {}): Promise<SmokeLifecycleResult> {
  const runner = new WahaSmokeRunner(config);
  return runner.execute();
}

// Auto-run when invoked directly from CLI
if (
  process.argv[1]?.endsWith("smoke-docker-waha.ts") ||
  process.argv[1]?.endsWith("smoke-docker-waha.js") ||
  process.argv[1]?.endsWith("smoke-docker-waha.mjs")
) {
  const isNegative = process.argv.includes("--negative") || process.env.SMOKE_NEGATIVE_TEST === "1";
  const simulateStep = isNegative ? 4 : undefined;
  runWahaSmoke({ simulateFailureAtStep: simulateStep })
    .then((result) => {
      process.exit(result.exitCode);
    })
    .catch((err) => {
      console.error("FATAL UNCAUGHT SMOKE RUNNER ERROR:", err);
      process.exit(1);
    });
}
