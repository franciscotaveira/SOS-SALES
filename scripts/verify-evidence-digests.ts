import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export interface VerificationResult {
  success: boolean;
  checkedFiles: number;
  expectedComposite: string;
  calculatedComposite: string;
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
  manifestRelativePath = "docs/work-packages/CH-09-EVIDENCE.json"
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
      errors: [`Manifest ${manifestRelativePath} is missing 'provenance' object`],
      fileHashes: [],
    };
  }

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

    // Check symlink escape
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

    let calculatedHash = "";
    try {
      const buffer = fs.readFileSync(fullPath);
      calculatedHash = crypto.createHash("sha256").update(buffer).digest("hex");
    } catch (err: any) {
      errors.push(`Failed to read ${relativePath}: ${err.message}`);
      fileHashes.push({
        file: relativePath,
        expectedHash,
        calculatedHash,
        status: "FAIL",
      });
      continue;
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
    errors,
    fileHashes,
  };
}

function runCli(): void {
  console.log("================================================================================");
  console.log(" SOS SALES V3 — EVIDENCE DIGEST VERIFIER (scoped-digest-v1)");
  console.log("================================================================================");

  const manifestPath = process.argv[2] || "docs/work-packages/CH-09-EVIDENCE.json";
  console.log(`Manifest: ${manifestPath}\n`);

  const res = verifyEvidenceDigests(manifestPath);

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
    console.log(`\x1b[32mSUCCESS: All ${res.checkedFiles} files (lexicographical order) and composite digest verified.\x1b[0m`);
    process.exit(0);
  }
}

if (require.main === module || process.argv[1]?.endsWith("verify-evidence-digests.ts")) {
  runCli();
}
