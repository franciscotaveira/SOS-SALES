#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const frontendRoot = path.join(root, 'src');
const backendRoot = path.join(root, 'apps/api/src');

const OPERATOR_NESTED_ROUTE_FILES = new Set([
  'operator-auth.ts',
  'cockpit-read.ts',
  'handoff-operations.ts',
  'journey-operations.ts',
  'commercial-outcomes.ts',
  'outbound-dispatches.ts',
  'traffic-proof.ts',
  'known-fact-operations.ts',
  'appointments.ts',
  'notes.ts',
  'workspace-init.ts',
  'workspace-operational.ts',
  'autonomous-revenue-routes.ts',
]);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [absolute] : [];
  });
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function lineAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function normalizePath(raw) {
  let value = raw.trim();
  value = value.replace(/\$\{[^}]+\}/g, ':param');
  value = value.replace(/\?[^#]*$/, '');
  value = value.replace(/\/+/g, '/');
  if (!value.startsWith('/')) value = `/${value}`;
  return value.length > 1 ? value.replace(/\/$/, '') : value;
}

function routeMatches(frontendPath, backendPath) {
  const front = normalizePath(frontendPath).split('/').filter(Boolean);
  const back = normalizePath(backendPath).split('/').filter(Boolean);
  if (front.length !== back.length) return false;
  return front.every((segment, index) => {
    const expected = back[index];
    return segment.startsWith(':') || expected.startsWith(':') || segment === expected;
  });
}

function extractFrontendCalls(file) {
  const source = fs.readFileSync(file, 'utf8');
  const calls = [];
  const matcher = /\b(authenticatedFetch|fetch)\s*\(\s*([`'"])([\s\S]*?)\2/g;
  for (const match of source.matchAll(matcher)) {
    const rawPath = match[3];
    if (!rawPath.startsWith('/api/')) continue;
    let cursor = match.index + match[0].length;
    let depth = 1;
    let quote = null;
    let escaped = false;
    while (cursor < source.length && depth > 0) {
      const char = source[cursor];
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'" || char === '`') {
        quote = char;
      } else if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        depth -= 1;
      }
      cursor += 1;
    }
    const callSource = source.slice(match.index, cursor);
    const methodMatch = callSource.match(/method\s*:\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/i);
    calls.push({
      file: relative(file),
      line: lineAt(source, match.index),
      transport: match[1],
      method: (methodMatch?.[1] || 'GET').toUpperCase(),
      path: normalizePath(rawPath),
    });
  }
  return calls;
}

function extractBackendRoutes(file) {
  const source = fs.readFileSync(file, 'utf8');
  const routes = [];
  const matcher = /\bapp\.(get|post|put|patch|delete)(?:\s*<[\s\S]{0,1200}?>)?\s*\(\s*(['"])([^'"]+)\2/gims;
  for (const match of source.matchAll(matcher)) {
    let routePath = normalizePath(match[3]);
    if (OPERATOR_NESTED_ROUTE_FILES.has(path.basename(file)) && !routePath.startsWith('/api/')) {
      routePath = normalizePath(`/api/v1${routePath}`);
    }
    routes.push({
      file: relative(file),
      line: lineAt(source, match.index),
      method: match[1].toUpperCase(),
      path: routePath,
    });
  }
  return routes;
}

function extractBrowserState(file) {
  const source = fs.readFileSync(file, 'utf8');
  const findings = [];
  const rules = [
    ['LOCAL_WRITE', /localStorage\.setItem\s*\(([^,\n]+)/g],
    ['LOCAL_READ', /localStorage\.getItem\s*\(([^)\n]+)/g],
    ['MOCK_IMPORT', /import[\s\S]{0,220}?from\s+['"][^'"]*(?:mock|fixture)[^'"]*['"]/gi],
    ['RANDOM_RESULT', /Math\.random\s*\(/g],
    ['PRELOADED_RESULT', /\b(?:PRELOADED|MOCK|DEFAULT)_[A-Z0-9_]+\b/g],
  ];

  for (const [kind, matcher] of rules) {
    for (const match of source.matchAll(matcher)) {
      findings.push({
        kind,
        file: relative(file),
        line: lineAt(source, match.index),
        evidence: match[0].replace(/\s+/g, ' ').slice(0, 180),
      });
    }
  }
  return findings;
}

const frontendFiles = walk(frontendRoot);
const backendFiles = walk(backendRoot);
const frontendCalls = frontendFiles.flatMap(extractFrontendCalls);
const backendRoutes = backendFiles.flatMap(extractBackendRoutes);
const browserState = frontendFiles.flatMap(extractBrowserState);

const endpointMatrix = frontendCalls.map((call) => {
  const matches = backendRoutes.filter(
    (route) => route.method === call.method && routeMatches(call.path, route.path),
  );
  return { ...call, status: matches.length > 0 ? 'MAPPED' : 'NO_BACKEND_ROUTE', matches };
});

const summary = {
  generatedAt: new Date().toISOString(),
  frontendFiles: frontendFiles.length,
  backendFiles: backendFiles.length,
  frontendHttpCalls: endpointMatrix.length,
  mappedHttpCalls: endpointMatrix.filter((item) => item.status === 'MAPPED').length,
  missingHttpCalls: endpointMatrix.filter((item) => item.status === 'NO_BACKEND_ROUTE').length,
  localWrites: browserState.filter((item) => item.kind === 'LOCAL_WRITE').length,
  mockImports: browserState.filter((item) => item.kind === 'MOCK_IMPORT').length,
  randomResults: browserState.filter((item) => item.kind === 'RANDOM_RESULT').length,
};

if (process.argv.includes('--json')) {
  await new Promise((resolve, reject) => {
    process.stdout.write(
      `${JSON.stringify({ summary, endpointMatrix, browserState, backendRoutes }, null, 2)}\n`,
      (error) => error ? reject(error) : resolve(),
    );
  });
  process.exit(0);
}

console.log('# SOS Sales frontend-backend contract audit');
console.log(JSON.stringify(summary, null, 2));

console.log('\n## Frontend HTTP calls without a matching backend route');
for (const item of endpointMatrix.filter((entry) => entry.status === 'NO_BACKEND_ROUTE')) {
  console.log(`- ${item.method} ${item.path} — ${item.file}:${item.line}`);
}

console.log('\n## Browser-only writes');
for (const item of browserState.filter((entry) => entry.kind === 'LOCAL_WRITE')) {
  console.log(`- ${item.file}:${item.line} — ${item.evidence}`);
}

console.log('\n## Mock/fixture imports in the frontend');
for (const item of browserState.filter((entry) => entry.kind === 'MOCK_IMPORT')) {
  console.log(`- ${item.file}:${item.line} — ${item.evidence}`);
}

if (summary.missingHttpCalls > 0) process.exitCode = 2;
