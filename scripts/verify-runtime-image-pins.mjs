#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  { path: 'deploy/docker-compose.prod.yml', caddy: true },
  { path: 'docker-compose.lab.yml', caddy: false },
  { path: 'docker-compose.prod.yml', caddy: true },
];

for (const { path: relativePath, caddy } of files) {
  const content = readFileSync(resolve(root, relativePath), 'utf8');
  if (content.includes('devlikeapro/waha:latest')) {
    throw new Error(`${relativePath} still uses floating WAHA latest tag`);
  }
  if (!/devlikeapro\/waha@sha256:[0-9a-f]{64}/.test(content)) {
    throw new Error(`${relativePath} does not pin WAHA by digest`);
  }
  if (!/redis@sha256:[0-9a-f]{64}/.test(content)) {
    throw new Error(`${relativePath} does not pin Redis by digest`);
  }
  if (caddy && !/caddy@sha256:[0-9a-f]{64}/.test(content)) {
    throw new Error(`${relativePath} does not pin Caddy by digest`);
  }
}

console.log('[runtime-images] Caddy, WAHA and Redis digest pins verified in Lab and production compose files');
