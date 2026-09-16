#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function requireMatch(content, pattern, label) {
  if (!pattern.test(content)) {
    throw new Error(`edge release layout missing ${label}`);
  }
}

const caddyfile = read('deploy/Caddyfile');
const compose = read('deploy/docker-compose.prod.yml');
const stage = read('scripts/stage-production-release.sh');
const promote = read('scripts/promote-production-release.sh');

for (const header of [
  'X-Content-Type-Options',
  'Referrer-Policy',
  'X-Frame-Options',
  'Permissions-Policy',
  'Content-Security-Policy',
]) {
  requireMatch(caddyfile, new RegExp(`\\b${header.replaceAll('-', '\\-')}\\b`), header);
}

requireMatch(
  caddyfile,
  /connect-src[^\n]*wss:\/\/\*\.supabase\.co/,
  'Supabase Realtime WebSocket origin',
);

requireMatch(
  compose,
  /\$\{SOS_SALES_RELEASE_ROOT:-\/opt\/sos-sales\/current\}\/Caddyfile:\/etc\/caddy\/Caddyfile:ro/,
  'release-local Caddyfile mount',
);
requireMatch(stage, /deploy\/Caddyfile/, 'Caddyfile staging transfer');
requireMatch(promote, /candidate\}\/Caddyfile/, 'candidate Caddyfile promotion gate');

console.log('[edge-release] Caddy headers and immutable release wiring verified');
