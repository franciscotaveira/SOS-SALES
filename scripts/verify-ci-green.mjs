#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function fail(message) {
  console.error(`[ci-gate] ${message}`);
  process.exit(1);
}

const sha = process.argv[2] || run('git', ['rev-parse', 'HEAD']);
const remote = run('git', ['config', '--get', 'remote.origin.url']);
const repositoryMatch = remote.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);

if (!repositoryMatch) {
  fail(`remote.origin.url não aponta para um repositório GitHub verificável: ${remote}`);
}

const repository = repositoryMatch[1];
let runs;
try {
  const output = run('gh', [
    'run', 'list',
    '--repo', repository,
    '--workflow', 'ci.yml',
    '--commit', sha,
    '--limit', '20',
    '--json', 'databaseId,status,conclusion,headSha,workflowName',
  ]);
  runs = JSON.parse(output || '[]');
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  fail(`não foi possível consultar o GitHub Actions para ${sha}: ${detail}`);
}

if (!Array.isArray(runs) || runs.length === 0) {
  fail(`nenhuma execução de ci.yml encontrada para o SHA ${sha}`);
}

const latest = runs[0];
if (latest.headSha !== sha) {
  fail(`a execução mais recente não pertence ao SHA candidato: ${latest.headSha || 'desconhecido'}`);
}

if (latest.status !== 'completed' || latest.conclusion !== 'success') {
  fail(`a execução mais recente do SHA ${sha} não está verde: status=${latest.status || 'desconhecido'} conclusão=${latest.conclusion || 'desconhecida'} run=${latest.databaseId || 'desconhecida'}`);
}

console.log(`[ci-gate] SHA ${sha} aprovado pelo run ${latest.databaseId} (${latest.workflowName || 'ci.yml'})`);
