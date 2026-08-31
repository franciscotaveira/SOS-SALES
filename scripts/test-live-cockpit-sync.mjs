import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const gateway = await readFile(new URL('../src/services/salesOsGateway.ts', import.meta.url), 'utf8');
const cockpit = await readFile(new URL('../src/components/cockpit/LiveCockpitView.tsx', import.meta.url), 'utf8');

assert.match(
  gateway,
  /cache:\s*\(options\.method\s*\?\?\s*'GET'\)\s*===\s*'GET'\s*\?\s*'no-store'/,
  'Authenticated GET requests must bypass the browser HTTP cache.',
);
assert.match(
  cockpit,
  /setSyncError\(queueUpdated\s*&&\s*cockpitUpdated\s*\?\s*null/,
  'The live cockpit must record failed automatic refreshes.',
);
assert.match(
  cockpit,
  /Sincronização interrompida:/,
  'The operator must see when live synchronization stops.',
);

console.log('live cockpit synchronization contract: PASS');
