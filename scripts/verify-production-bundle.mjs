import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const distRoot = resolve(repoRoot, process.argv[2] || "apps/web/dist");

const forbidden = [
  { name: "React development transform", pattern: /jsxDEV/ },
  { name: "absolute macOS source path", pattern: /\/Users\// },
  { name: "absolute Linux source path", pattern: /\/(?:home|root)\/[A-Za-z0-9._-]+\/(?:Downloads|Documents|workspace)\// },
  { name: "laboratory master-key UI", pattern: /Chave Mestra de Laboratório/ },
  { name: "manual laboratory token UI", pattern: /Token Manual de Laboratório/ },
];

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) walk(fullPath);
    else if (/\.(?:js|mjs|html)$/.test(entry)) files.push(fullPath);
  }
};

walk(distRoot);
const failures = [];

for (const file of files) {
  const content = readFileSync(file, "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(content)) {
      failures.push(`${relative(repoRoot, file)}: ${rule.name}`);
    }
  }
}

if (failures.length > 0) {
  console.error("SECURITY GATE FAILED: production bundle contains forbidden development artifacts:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Production bundle security gate passed (${files.length} files inspected).`);
