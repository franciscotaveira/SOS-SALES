import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { scanForSecrets, SECRET_PATTERNS } from "../ci-gate-runner";

describe("CI Gate Runner Unit Suite (Gate 3 & Secret Scanner)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-runner-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should accurately scan files and detect zero secrets on clean repository files", () => {
    fs.writeFileSync(path.join(tempDir, "clean.ts"), "export const PI = 3.14159;\n");
    fs.writeFileSync(path.join(tempDir, "config.json"), JSON.stringify({ name: "sos-sales" }));

    const res = scanForSecrets(tempDir);
    expect(res.errors).toHaveLength(0);
    expect(res.scannedFilesCount).toBe(2);
  });

  it("should detect leaked Meta access tokens and report the filename", () => {
    const dummyMetaToken = "EAAG" + "A".repeat(40);
    fs.writeFileSync(
      path.join(tempDir, "meta-service.ts"),
      `const token = "${dummyMetaToken}";\n`
    );

    const res = scanForSecrets(tempDir);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors[0]).toMatch(/Leaked Meta Access Token detected/);
    expect(res.errors[0]).toContain("meta-service.ts");
    expect(res.scannedFilesCount).toBe(1);
  });

  it("should detect leaked Private Keys", () => {
    const dummyKey = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----";
    fs.writeFileSync(path.join(tempDir, "private.key"), dummyKey);

    const res = scanForSecrets(tempDir);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors[0]).toMatch(/Leaked Private Key detected/);
  });

  it("should detect leaked AWS Access Keys", () => {
    const dummyAws = "AKIA1234567890ABCDEF";
    fs.writeFileSync(path.join(tempDir, "aws.ts"), `const key = "${dummyAws}";`);

    const res = scanForSecrets(tempDir);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors[0]).toMatch(/Leaked AWS Access Key detected/);
  });

  it("should detect leaked GitHub Tokens", () => {
    const dummyGh = "ghp_" + "1234567890abcdefghijklmnopqrstuv";
    fs.writeFileSync(path.join(tempDir, "gh.ts"), `const token = "${dummyGh}";`);

    const res = scanForSecrets(tempDir);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors[0]).toMatch(/Leaked GitHub Token detected/);
  });

  it("should ignore binary extensions and ignored directories", () => {
    const nodeModules = path.join(tempDir, "node_modules");
    fs.mkdirSync(nodeModules);
    fs.writeFileSync(path.join(nodeModules, "leak.ts"), "EAAG" + "A".repeat(40));

    fs.writeFileSync(path.join(tempDir, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const res = scanForSecrets(tempDir);
    expect(res.errors).toHaveLength(0);
    expect(res.scannedFilesCount).toBe(0);
  });
});
