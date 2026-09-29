import { execFileSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export interface VerifyEvidenceOptions {
  mode?: "historical" | "working-tree";
}

export interface VerificationResult {
  success: boolean;
  checkedFiles: number;
  expectedComposite: string;
  calculatedComposite: string;
  mode: "historical" | "working-tree";
  commitSha?: string;
  errors: string[];
  fileHashes: Array<{
    file: string;
    expectedHash: string;
    calculatedHash: string;
    status: "PASS" | "FAIL" | "MISSING";
  }>;
}

const REPO_ROOT = path.resolve(__dirname, "..");

export function verifyEvidenceDigests(
  manifestRelativePath = "docs/work-packages/CH-09-EVIDENCE.json",
  options: VerifyEvidenceOptions = {}
): VerificationResult {
  const manifestFullPath = path.join(REPO_ROOT, manifestRelativePath);
  const errors: string[] = [];
  const fileHashes: VerificationResult["fileHashes"] = [];

  if (!fs.existsSync(manifestFullPath)) {
    return {
      success: false,
      checkedFiles: 0,
      expectedComposite: "",
      calculatedComposite: "",
      mode: options.mode || "working-tree",
      errors: [`Manifest file not found: ${manifestRelativePath}`],
      fileHashes: [],
    };
  }

  let manifest: any;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFullPath, "utf-8"));
  } catch (err: any) {
    return {
      success: false,
      checkedFiles: 0,
      expectedComposite: "",
      calculatedComposite: "",
      mode: options.mode || "working-tree",
      errors: [`Failed to parse JSON manifest ${manifestRelativePath}: ${err.message}`],
      fileHashes: [],
    };
  }

  const provenance = manifest.provenance;
  if (!provenance) {
    return {
      success: false,
      checkedFiles: 0,
      expectedComposite: "",
      calculatedComposite: "",
      mode: options.mode || "working-tree",
      errors: [`Manifest ${manifestRelativePath} is missing 'provenance' object`],
      fileHashes: [],
    };
  }

  const commitSha = manifest.commit_sha || provenance.checkpoint_sha;
  const isHistoricalManifest =
    manifest.package_id === "CH-09" ||
    manifest.package_id === "CH-11" ||
    manifest.package_id === "CH-12" ||
    manifest.verification_mode === "historical" ||
    manifest.mode === "historical" ||
    provenance.verification_mode === "historical" ||
    provenance.mode === "historical" ||
    Boolean(options.mode === "historical");

  const mode: "historical" | "working-tree" =
    options.mode || (isHistoricalManifest ? "historical" : "working-tree");

  const scopedCodeSha256: Record<string, string> = provenance.scoped_code_sha256 || {};
  const rawFiles: string[] =
    provenance.scoped_code_files || Object.keys(scopedCodeSha256);
  const expectedComposite: string =
    provenance.scoped_composite_code_sha256 || "";

  if (rawFiles.length === 0) {
    errors.push("No scoped code files defined in manifest provenance");
  }

  // 1. Detect duplicate paths
  const seenPaths = new Set<string>();
  for (const f of rawFiles) {
    if (seenPaths.has(f)) {
      errors.push(`Duplicate path forbidden in manifest: ${f}`);
    }
    seenPaths.add(f);
  }

  // 2. Strict path validation: reject absolute paths, traversal, external files, escaping symlinks
  const validatedFiles: string[] = [];
  for (const relativePath of rawFiles) {
    // Check absolute path
    if (path.isAbsolute(relativePath)) {
      errors.push(`Absolute path forbidden: ${relativePath}`);
      continue;
    }

    // Check path traversal with ..
    const parts = relativePath.split(/[\\/]/);
    if (parts.includes("..") || relativePath.includes("..")) {
      errors.push(`Path traversal (..) forbidden: ${relativePath}`);
      continue;
    }

    // Check boundary containment within REPO_ROOT
    const fullPath = path.resolve(REPO_ROOT, relativePath);
    const relToRoot = path.relative(REPO_ROOT, fullPath);
    if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
      errors.push(`File outside repository root forbidden: ${relativePath}`);
      continue;
    }

    // Check symlink escape if file exists locally
    if (fs.existsSync(fullPath)) {
      try {
        const realPath = fs.realpathSync(fullPath);
        const relReal = path.relative(REPO_ROOT, realPath);
        if (relReal.startsWith("..") || path.isAbsolute(relReal)) {
          errors.push(`Symlink escaping repository forbidden: ${relativePath} -> ${realPath}`);
          continue;
        }
      } catch (err: any) {
        errors.push(`Failed to resolve realpath for ${relativePath}: ${err.message}`);
        continue;
      }
    }

    validatedFiles.push(relativePath);
  }

  // If in historical mode, validate commit exists and is an ancestor of HEAD using safe non-shell git invocation
  if (mode === "historical") {
    if (!commitSha || !/^[0-9a-fA-F]{40}$/.test(commitSha)) {
      errors.push(
        `Historical mode requires a valid 40-character commit_sha in manifest (found: ${commitSha || "none"})`
      );
      return {
        success: false,
        checkedFiles: 0,
        expectedComposite,
        calculatedComposite: "",
        mode,
        commitSha,
        errors,
        fileHashes: [],
      };
    }

    try {
      execFileSync("git", ["cat-file", "-e", `${commitSha}^{commit}`], {
        cwd: REPO_ROOT,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      errors.push(`Commit ${commitSha} does not exist in git history`);
      return {
        success: false,
        checkedFiles: 0,
        expectedComposite,
        calculatedComposite: "",
        mode,
        commitSha,
        errors,
        fileHashes: [],
      };
    }

    try {
      execFileSync("git", ["merge-base", "--is-ancestor", commitSha, "HEAD"], {
        cwd: REPO_ROOT,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      errors.push(`Commit ${commitSha} is not an ancestor of current HEAD`);
      return {
        success: false,
        checkedFiles: 0,
        expectedComposite,
        calculatedComposite: "",
        mode,
        commitSha,
        errors,
        fileHashes: [],
      };
    }
  }

  // 3. Enforce deterministic lexicographical sorting for scoped-digest-v1
  const sortedFiles = [...validatedFiles].sort();
  const compositeHash = crypto.createHash("sha256");

  for (const relativePath of sortedFiles) {
    const fullPath = path.join(REPO_ROOT, relativePath);
    const expectedHash = scopedCodeSha256[relativePath];

    if (!expectedHash) {
      errors.push(`Missing expected SHA-256 for file in scoped_code_sha256: ${relativePath}`);
      fileHashes.push({
        file: relativePath,
        expectedHash: "",
        calculatedHash: "",
        status: "FAIL",
      });
      continue;
    }

    let calculatedHash = "";
    if (mode === "historical") {
      let buffer: Buffer;
      try {
        buffer = execFileSync("git", ["show", `${commitSha}:${relativePath}`], {
          cwd: REPO_ROOT,
          maxBuffer: 20 * 1024 * 1024,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch {
        errors.push(`Required scoped file missing at commit ${commitSha}: ${relativePath}`);
        fileHashes.push({
          file: relativePath,
          expectedHash,
          calculatedHash: "",
          status: "MISSING",
        });
        continue;
      }
      calculatedHash = crypto.createHash("sha256").update(buffer).digest("hex");
    } else {
      if (!fs.existsSync(fullPath)) {
        errors.push(`Required scoped file missing on disk: ${relativePath}`);
        fileHashes.push({
          file: relativePath,
          expectedHash,
          calculatedHash: "",
          status: "MISSING",
        });
        continue;
      }

      try {
        const buffer = fs.readFileSync(fullPath);
        calculatedHash = crypto.createHash("sha256").update(buffer).digest("hex");
      } catch (err: any) {
        errors.push(`Failed to read ${relativePath}: ${err.message}`);
        fileHashes.push({
          file: relativePath,
          expectedHash,
          calculatedHash: "",
          status: "FAIL",
        });
        continue;
      }
    }

    if (calculatedHash !== expectedHash) {
      errors.push(
        `SHA-256 mismatch for ${relativePath}: expected ${expectedHash}, got ${calculatedHash}`
      );
      fileHashes.push({
        file: relativePath,
        expectedHash,
        calculatedHash,
        status: "FAIL",
      });
    } else {
      fileHashes.push({
        file: relativePath,
        expectedHash,
        calculatedHash,
        status: "PASS",
      });
    }

    // Canonical composition formula: <path>:<sha256>\n (UTF-8)
    compositeHash.update(`${relativePath}:${calculatedHash}\n`, "utf8");
  }

  const calculatedComposite = compositeHash.digest("hex");

  if (!expectedComposite) {
    errors.push("Missing expected scoped_composite_code_sha256 in manifest");
  } else if (calculatedComposite !== expectedComposite) {
    errors.push(
      `Composite digest mismatch: expected ${expectedComposite}, calculated ${calculatedComposite}`
    );
  }

  return {
    success: errors.length === 0,
    checkedFiles: sortedFiles.length,
    expectedComposite,
    calculatedComposite,
    mode,
    commitSha: mode === "historical" ? commitSha : undefined,
    errors,
    fileHashes,
  };
}

export interface ComprehensiveAuditResult {
  totalManifests: number;
  structuralManifests: number;
  cryptographicManifests: number;
  allPassed: boolean;
  errors: string[];
}

export function auditAllManifests(): ComprehensiveAuditResult {
  const workPackagesDir = path.join(REPO_ROOT, "docs/work-packages");
  const manifestFiles = fs.readdirSync(workPackagesDir).filter((f) => f.endsWith("-EVIDENCE.json")).sort();
  const errors: string[] = [];
  let structuralCount = 0;
  let cryptographicCount = 0;

  for (const file of manifestFiles) {
    const relPath = path.join("docs/work-packages", file);
    const fullPath = path.join(REPO_ROOT, relPath);
    let data: any;

    try {
      data = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
    } catch (e: any) {
      errors.push(`${relPath}: Invalid JSON syntax - ${e.message}`);
      continue;
    }

    // Structural audit
    if (!data.package_id || typeof data.package_id !== "string") {
      errors.push(`${relPath}: Missing or invalid 'package_id'`);
    }
    if (!data.timestamp || typeof data.timestamp !== "string") {
      errors.push(`${relPath}: Missing or invalid 'timestamp'`);
    }
    if (!data.metrics || typeof data.metrics !== "object") {
      errors.push(`${relPath}: Missing or invalid 'metrics' object`);
    }
    if (!Array.isArray(data.acceptance_criteria) || data.acceptance_criteria.length === 0) {
      errors.push(`${relPath}: 'acceptance_criteria' must be a non-empty array`);
    } else {
      for (let i = 0; i < data.acceptance_criteria.length; i++) {
        const ac = data.acceptance_criteria[i];
        if (!ac.ac_id || !ac.result || !ac.evidence) {
          errors.push(`${relPath}: Acceptance criteria item at index ${i} is missing ac_id, result, or evidence`);
        }
      }
    }

    structuralCount++;

    // Cryptographic audit if scoped_code_sha256 is present
    if (data.provenance && data.provenance.scoped_code_sha256) {
      cryptographicCount++;
      const res = verifyEvidenceDigests(relPath);
      if (!res.success) {
        errors.push(`${relPath} (Cryptographic verification failed): ${res.errors.join("; ")}`);
      }
    }
  }

  return {
    totalManifests: manifestFiles.length,
    structuralManifests: structuralCount,
    cryptographicManifests: cryptographicCount,
    allPassed: errors.length === 0,
    errors,
  };
}

function parseCliArgs(): { manifestPath?: string; mode?: "historical" | "working-tree"; all: boolean } {
  const args = process.argv.slice(2);
  let manifestPath: string | undefined;
  let mode: "historical" | "working-tree" | undefined;
  let all = false;

  for (const arg of args) {
    if (arg === "--all") {
      all = true;
    } else if (arg.startsWith("--mode=")) {
      const val = arg.split("=")[1];
      if (val === "historical" || val === "working-tree") {
        mode = val;
      }
    } else if (!arg.startsWith("--")) {
      manifestPath = arg;
    }
  }

  if (!manifestPath && !all) {
    all = true;
  }

  return { manifestPath, mode, all };
}

function runCli(): void {
  console.log("================================================================================");
  console.log(" SOS SALES V3 — EVIDENCE DIGEST & MANIFEST VERIFIER (scoped-digest-v1)");
  console.log("================================================================================");

  const { manifestPath, mode, all } = parseCliArgs();

  if (all) {
    console.log("Auditing ALL evidence manifests in docs/work-packages/...\n");
    const audit = auditAllManifests();

    console.log("--------------------------------------------------------------------------------");
    console.log(`Total manifests scanned       : ${audit.totalManifests}`);
    console.log(`Structural manifests verified : ${audit.structuralManifests}`);
    console.log(`Cryptographic manifests verified: ${audit.cryptographicManifests}`);
    console.log(`Audit Verdict                 : ${audit.allPassed ? "[\x1b[32mPASS\x1b[0m]" : "[\x1b[31mFAIL\x1b[0m]"}`);
    console.log("================================================================================");

    if (!audit.allPassed) {
      console.error(`\x1b[31mAUDIT FAILED (${audit.errors.length} errors):\x1b[0m`);
      audit.errors.forEach((e) => console.error(`  * ${e}`));
      process.exit(1);
    } else {
      console.log(`\x1b[32mSUCCESS: All ${audit.totalManifests} manifests structurally and cryptographically sound.\x1b[0m`);
      process.exit(0);
    }
  } else if (manifestPath) {
    console.log(`Manifest: ${manifestPath}`);

    const res = verifyEvidenceDigests(manifestPath, { mode });
    console.log(`Mode    : ${res.mode}${res.commitSha ? ` (commit: ${res.commitSha})` : ""}\n`);

    for (const fh of res.fileHashes) {
      const statusTag =
        fh.status === "PASS"
          ? "[\x1b[32mPASS\x1b[0m]"
          : fh.status === "MISSING"
            ? "[\x1b[31mMISSING\x1b[0m]"
            : "[\x1b[31mFAIL\x1b[0m]";
      console.log(`${statusTag} ${fh.file} -> ${fh.calculatedHash || "N/A"}`);
    }

    console.log("--------------------------------------------------------------------------------");
    console.log(`Calculated Composite (Lexicographical) : ${res.calculatedComposite}`);
    console.log(`Expected Composite                     : ${res.expectedComposite}`);

    const compositeStatus =
      res.calculatedComposite === res.expectedComposite && res.expectedComposite !== ""
        ? "[\x1b[32mPASS\x1b[0m]"
        : "[\x1b[31mFAIL\x1b[0m]";
    console.log(`Composite Verdict                      : ${compositeStatus}`);
    console.log("================================================================================");

    if (!res.success) {
      console.error(`\x1b[31mEVIDENCE DIGEST VERIFICATION FAILED (${res.errors.length} errors):\x1b[0m`);
      res.errors.forEach((e) => console.error(`  * ${e}`));
      process.exit(1);
    } else {
      console.log(`\x1b[32mSUCCESS: All ${res.checkedFiles} files (${res.mode} mode) and composite digest verified.\x1b[0m`);
      process.exit(0);
    }
  }
}

if (require.main === module || process.argv[1]?.endsWith("verify-evidence-digests.ts")) {
  runCli();
}
