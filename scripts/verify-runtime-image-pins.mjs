#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['deploy/docker-compose.prod.yml', 'docker-compose.lab.yml', 'docker-compose.prod.yml'];

for (const relativePath of files) {
  const content = readFileSync(resolve(root, relativePath), 'utf8');
  if (content.includes('devlikeapro/waha:latest')) {
    throw new Error(`${relativePath} still uses floating WAHA latest tag`);
  }
  if (!/devlikeapro\/waha@sha256:[0-9a-f]{64}/.test(content)) {
    throw new Error(`${relativePath} does not pin WAHA by digest`);
  }
}

console.log('[runtime-images] WAHA digest pins verified in Lab and production compose files');
