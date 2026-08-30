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

const explicitEnv = process.env.APP_ENV || process.env.RELEASE_ENV;
const ALLOWED_ENVIRONMENTS = new Set(['production', 'lab', 'staging', 'test']);

if (!explicitEnv || !ALLOWED_ENVIRONMENTS.has(explicitEnv.toLowerCase())) {
  console.error('❌ [FAIL-CLOSED RELEASE MANIFEST] Explicit APP_ENV or RELEASE_ENV is required.');
  console.error(`   Received: "${explicitEnv || ''}"`);
  console.error('   Permitted values: APP_ENV=production | APP_ENV=lab | APP_ENV=staging | APP_ENV=test');
  process.exit(1);
}

const activeEnv = explicitEnv.toLowerCase();

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
    execSync('git diff --quiet && git diff --cached --quiet', { cwd: rootDir, stdio: 'ignore' });
    const untracked = execSync(
      "git ls-files --others --exclude-standard -- . ':(exclude)node_modules' ':(exclude)apps/api/node_modules' ':(exclude)dist' ':(exclude)apps/api/dist'",
      { cwd: rootDir, encoding: 'utf8' },
    ).trim();
    return untracked.length === 0;
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

const fullSha = process.env.GIT_COMMIT_SHA || getGitCommitSha() || (activeEnv === 'production' ? 'UNKNOWN_UNCOMMITTED' : 'dev-local');
const shortSha = fullSha !== 'UNKNOWN_UNCOMMITTED' && fullSha !== 'dev-local' ? fullSha.slice(0, 7) : fullSha;
const cleanTree = isGitClean();
const buildTimestamp = new Date().toISOString();

const apiBundlePath = path.join(apiDir, 'dist', 'index.js');
const apiBundleHash = computeFileSha256(apiBundlePath);

const releaseTag = activeEnv === 'production' ? `v${pkg.version || '2.0.0'}-prod` : `v${pkg.version || '2.0.0'}-${activeEnv}`;

const manifest = {
  product: 'SOS Sales',
  edition: 'Enterprise Multi-Tenant WhatsApp CRM',
  version: pkg.version || '2.0.0',
  release: releaseTag,
  kernel: 'TX Commercial Core v2.0',
  commitSha: fullSha,
  shortSha: shortSha,
  cleanTree: cleanTree,
  buildTimestamp: buildTimestamp,
  environment: activeEnv,
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
console.log('Release Tag:', releaseTag, `(Env: ${activeEnv})`);
console.log('Commit:', fullSha, `(Clean: ${cleanTree})`);
if (apiBundleHash) {
  console.log('API Bundle SHA-256:', apiBundleHash);
}
