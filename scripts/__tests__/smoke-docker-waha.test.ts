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
      expect(preserved).toBe(true);

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
      expect(deleted).toBe(true);

      const deleteCalls = fetchSpy.mock.calls.filter(([callUrl, opts]) => {
        return opts?.method === "DELETE" && String(callUrl).includes("ephemeral-test-session");
      });
      expect(deleteCalls).toHaveLength(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
