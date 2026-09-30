/**
 * SOS Sales V3 — UI Token & Architecture Lint Guard (MCT OS v2.0)
 * Fail-Closed Anti-Regression Validator:
 * 1. Disallows raw hex colors in apps/web/src outside of CSS files
 * 2. Enforces line count limits:
 *    - CockpitPage.tsx strictly <= 200 lines
 *    - All other page components strictly <= 400 lines
 */

import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..");
const WEB_SRC_DIR = path.resolve(REPO_ROOT, "apps/web/src");
const PAGES_DIR = path.resolve(WEB_SRC_DIR, "pages");

interface Violation {
  file: string;
  line?: number;
  message: string;
}

const violations: Violation[] = [];

// Recursive file scanner
function scanFiles(dir: string, extensions: string[]): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".turbo" && entry.name !== "dist") {
        results = results.concat(scanFiles(fullPath, extensions));
      }
    } else if (entry.isFile()) {
      if (extensions.some((ext) => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

console.log("🛡️  Iniciando SOS Sales V3 — UI Token & Architecture Guard...\n");

// ============================================================================
// 1. Hex Color Verification (Tokens Integrity)
// ============================================================================
const tsxFiles = scanFiles(WEB_SRC_DIR, [".ts", ".tsx"]);
const HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/g;

for (const file of tsxFiles) {
  // Allowlist: pure css files or test fixtures if any
  if (file.endsWith(".css") || file.endsWith(".test.ts") || file.endsWith(".test.tsx")) {
    continue;
  }

  const content = fs.readFileSync(file, "utf8");
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    // Ignore comments if any
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
      return;
    }

    const matches = line.match(HEX_PATTERN);
    if (matches) {
      violations.push({
        file: path.relative(REPO_ROOT, file),
        line: idx + 1,
        message: `Cor hexadecimal literal detectada [${matches.join(", ")}]. Use tokens CSS canônicos (var(--...)).`,
      });
    }
  });
}

// ============================================================================
// 2. Line Count Limits (Anti-Monolith Architecture)
// ============================================================================
const pageFiles = scanFiles(PAGES_DIR, [".ts", ".tsx"]);

for (const file of pageFiles) {
  const content = fs.readFileSync(file, "utf8");
  const lineCount = content.split("\n").length;
  const relPath = path.relative(REPO_ROOT, file);
  const baseName = path.basename(file);

  // Cockpit orchestrators must be <= 200 lines
  if (baseName === "CockpitPage.tsx") {
    if (lineCount > 200) {
      violations.push({
        file: relPath,
        message: `CockpitPage excede o limite estrito de 200 linhas (atual: ${lineCount} linhas). Modularize em subcomponentes.`,
      });
    }
  } else {
    // All other page files must be <= 400 lines
    if (lineCount > 400) {
      violations.push({
        file: relPath,
        message: `Componente excede o limite estrito de 400 linhas (atual: ${lineCount} linhas). Decomponha em subcomponentes menores.`,
      });
    }
  }
}

// ============================================================================
// Results & Verdict
// ============================================================================
console.log(`Arquivos verificados: ${tsxFiles.length} arquivos TypeScript/TSX.`);
console.log(`Componentes de página inspecionados: ${pageFiles.length} arquivos.`);

if (violations.length > 0) {
  console.error(`\n❌ Falha: ${violations.length} violações de UI Tokens / Arquitetura encontradas:\n`);
  for (const v of violations) {
    const loc = v.line ? `:${v.line}` : "";
    console.error(`  - ${v.file}${loc} -> ${v.message}`);
  }
  console.error("\nFAIL-CLOSED: Corrija as violações acima antes de prosseguir.\n");
  process.exit(1);
}

console.log("\n✅ APROVADO: 100% de conformidade com tokens CSS canônicos e limites arquiteturais.\n");
process.exit(0);
