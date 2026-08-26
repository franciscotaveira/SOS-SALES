import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if running from apps/api/scripts or repo scripts/
let apiDir = path.resolve(__dirname, '..');
let rootDir = path.resolve(apiDir, '..', '..');

if (!fs.existsSync(path.join(apiDir, 'package.json')) && fs.existsSync(path.join(__dirname, '..', 'apps', 'api', 'package.json'))) {
  rootDir = path.resolve(__dirname, '..');
  apiDir = path.join(rootDir, 'apps', 'api');
} else if (fs.existsSync(path.join(apiDir, 'package.json')) && !fs.existsSync(path.join(rootDir, 'package.json'))) {
  // Inside Docker container where /app is apps/api
  rootDir = apiDir;
}

function getGitCommitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: rootDir, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function getGitShortSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: rootDir, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function isGitClean() {
  try {
    const status = execSync('git status --porcelain', { cwd: rootDir, encoding: 'utf8' }).trim();
    return status.length === 0;
  } catch {
    return false;
  }
}

function computeFileSha256(filePath) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }
  return null;
}

const pkgPath = path.join(apiDir, 'package.json');
const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : { version: '2.0.0' };

const fullSha = process.env.GIT_COMMIT_SHA || getGitCommitSha() || (process.env.NODE_ENV === 'production' ? 'UNKNOWN_UNCOMMITTED' : 'dev-local');
const shortSha = fullSha !== 'UNKNOWN_UNCOMMITTED' && fullSha !== 'dev-local' ? fullSha.slice(0, 7) : fullSha;
const cleanTree = isGitClean();
const buildTimestamp = new Date().toISOString();

const apiBundlePath = path.join(apiDir, 'dist', 'index.js');
const apiBundleHash = computeFileSha256(apiBundlePath);

const manifest = {
  product: 'SOS Sales',
  edition: 'Enterprise Multi-Tenant WhatsApp CRM',
  version: pkg.version || '2.0.0',
  release: `v${pkg.version || '2.0.0'}-prod`,
  kernel: 'TX Commercial Core v2.0',
  commitSha: fullSha,
  shortSha: shortSha,
  cleanTree: cleanTree,
  buildTimestamp: buildTimestamp,
  environment: process.env.NODE_ENV || 'production',
  artifacts: {
    apiBundle: {
      path: 'apps/api/dist/index.js',
      sha256: apiBundleHash ? `sha256:${apiBundleHash}` : 'pending_build',
    },
  },
};

const apiDistDir = path.join(apiDir, 'dist');
if (!fs.existsSync(apiDistDir)) {
  fs.mkdirSync(apiDistDir, { recursive: true });
}
const apiManifestPath = path.join(apiDistDir, 'release-manifest.json');
fs.writeFileSync(apiManifestPath, JSON.stringify(manifest, null, 2), 'utf8');

const frontendDistDir = path.join(rootDir, 'dist');
if (fs.existsSync(frontendDistDir) || rootDir !== apiDir) {
  if (!fs.existsSync(frontendDistDir)) {
    fs.mkdirSync(frontendDistDir, { recursive: true });
  }
  const frontendManifestPath = path.join(frontendDistDir, 'release-manifest.json');
  fs.writeFileSync(frontendManifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

console.log('✅ [RELEASE MANIFEST] Generated successfully at:');
console.log('  ->', apiManifestPath);
console.log('Commit:', fullSha, `(Clean: ${cleanTree})`);
if (apiBundleHash) {
  console.log('API Bundle SHA-256:', apiBundleHash);
}
