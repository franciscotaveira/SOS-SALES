/**
 * HERMES AI ASSURANCE — Production Readiness Verification Engine (Codex 1111)
 * Protocolo de Auditoria e Comprovação de Runtime para SOS Sales v2.0
 * 
 * PADRÃO DE EXECUÇÃO: STRICTLY READ-ONLY (MUTAÇÕES BLOQUEADAS POR PADRÃO)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const isReadOnly = !process.argv.includes('--allow-mutations-on-lab-only');
const targetHost = process.env.API_BASE || 'http://localhost:4335/api/v1';
const isProductionHost = targetHost.includes('crm.iaparavendas.tech') || targetHost.includes('179.197.72.221');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://yiiuebhyqixzluguxsqi.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpaXVlYmh5cWl4emx1Z3V4c3FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MzE3NTMsImV4cCI6MjEwMjMwNzc1M30.XObsvr-y26SODG2UjnDm1kB0dt_BeYVCkMH88B_SOuA';
const API_BASE = targetHost;

const OFFICIAL_WS_ID = '11111111-1111-1111-1111-111111111111'; // SOS Sales Oficial
const HAVEN_WS_ID = '22222222-2222-2222-2222-222222222222';    // Haven Beauty
const SORA_WS_ID = '33333333-3333-3333-3333-333333333333';     // Sora Spa

const evidenceLog = [];
let passedCount = 0;
let failedCount = 0;
let skippedCount = 0;

function logEvidence(group, scenarioId, title, status, details, rawEvidence) {
  const record = {
    timestamp: new Date().toISOString(),
    group,
    scenarioId,
    title,
    status, // 'PASS' | 'FAIL' | 'SKIPPED_READ_ONLY'
    details,
    rawEvidence: typeof rawEvidence === 'object' ? JSON.stringify(rawEvidence).slice(0, 300) : String(rawEvidence).slice(0, 300)
  };
  evidenceLog.push(record);
  if (status === 'PASS') passedCount++;
  else if (status === 'FAIL') failedCount++;
  else skippedCount++;

  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
  console.log(`${icon} [${group}] ${scenarioId}: ${title} -> ${status}`);
  if (details) console.log(`   └─ Evidência: ${details}`);
}

async function runHermesAssurance() {
  console.log('========================================================================');
  console.log('🏛️  HERMES AI ASSURANCE ENGINE — READ-ONLY ASSURANCE RUNNER (Codex 1111)');
  console.log('========================================================================');
  console.log(`Target Environment: ${API_BASE}`);
  console.log(`Execution Mode: ${isReadOnly ? 'STRICT READ-ONLY (Fail-Safe)' : 'MUTATING (LAB ONLY)'}`);
  console.log(`Production Guard: ${isProductionHost ? 'PRODUCTION DETECTED (Mutações terminantemente bloqueadas)' : 'Non-Prod'}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // -------------------------------------------------------------------------
  // GRUPO A: AUTENTICAÇÃO E ACESSO (READ-ONLY PROBES)
  // -------------------------------------------------------------------------
  console.log('\n--- [GRUPO A] Autenticação & Acesso (Probes Seguros) ---');

  // A1: Rejeição de Acesso Não Autenticado
  try {
    const res = await fetch(`${API_BASE}/workspaces/${OFFICIAL_WS_ID}/priorities`);
    if (res.status === 401) {
      logEvidence('GRUPO A', 'A1_UNAUTH_REJECT', 'Proteção 401 em rotas autenticadas sem Bearer Token', 'PASS', 'HTTP 401 Unauthorized confirmado', { status: res.status });
    } else {
      logEvidence('GRUPO A', 'A1_UNAUTH_REJECT', 'Proteção 401 em rotas autenticadas sem Bearer Token', 'FAIL', `Esperado 401, recebido ${res.status}`, {});
    }
  } catch (err) {
    logEvidence('GRUPO A', 'A1_UNAUTH_REJECT', 'Proteção 401 em rotas autenticadas sem Bearer Token', 'FAIL', err.message, err);
  }

  // A2: Bloqueio de Armadilha Substring
  try {
    const res = await fetch(`${API_BASE}/workspaces/my-haven-workspace/priorities`);
    if (res.status === 401 || res.status === 400 || res.status === 403 || res.status === 404) {
      logEvidence('GRUPO A', 'A2_SUBSTRING_TRAP', 'Bloqueio de armadilha substring (my-haven-workspace)', 'PASS', `HTTP ${res.status} retornado sem vazar dados`, { status: res.status });
    } else {
      logEvidence('GRUPO A', 'A2_SUBSTRING_TRAP', 'Bloqueio de armadilha substring (my-haven-workspace)', 'FAIL', `Esperado 400/401/403/404, recebido ${res.status}`, {});
    }
  } catch (err) {
    logEvidence('GRUPO A', 'A2_SUBSTRING_TRAP', 'Bloqueio de armadilha substring', 'FAIL', err.message, err);
  }

  // -------------------------------------------------------------------------
  // GRUPO J, K, L: OBSERVABILIDADE, PROBES & DOCKER
  // -------------------------------------------------------------------------
  console.log('\n--- [GRUPO J, K, L] Observabilidade, Probes & Status de Release ---');

  // J1: Liveness Probe /health
  const healthUrl = API_BASE.replace('/api/v1', '') + '/health';
  try {
    const res = await fetch(healthUrl);
    const data = await res.json();
    if (res.ok && data.status === 'ok') {
      logEvidence('GRUPO J', 'J1_LIVENESS_PROBE', 'Probe de Liveness /health do Core Comercial', 'PASS', `Status: ${data.status} | Sistema: ${data.system} | Versão: ${data.version} | Commit: ${data.commit || data.commitSha}`, data);
    } else {
      logEvidence('GRUPO J', 'J1_LIVENESS_PROBE', 'Probe de Liveness /health do Core Comercial', 'FAIL', `Status inesperado: ${res.status}`, data);
    }
  } catch (err) {
    logEvidence('GRUPO J', 'J1_LIVENESS_PROBE', 'Probe de Liveness /health do Core Comercial', 'FAIL', err.message, err);
  }

  // J2: Readiness Probe /ready
  const readyUrl = API_BASE.replace('/api/v1', '') + '/ready';
  try {
    const res = await fetch(readyUrl);
    const data = await res.json();
    if (res.ok && data.status === 'ready') {
      const depSummary = (data.dependencies || []).map(d => `${d.name}:${d.status}`).join(', ');
      logEvidence('GRUPO J', 'J2_READINESS_PROBE', 'Probe de Readiness /ready (Database, Redis, Worker)', 'PASS', `Status: ${data.status} | Dependências: ${depSummary}`, data);
    } else {
      logEvidence('GRUPO J', 'J2_READINESS_PROBE', 'Probe de Readiness /ready', 'FAIL', `Status de degradação: ${res.status}`, data);
    }
  } catch (err) {
    logEvidence('GRUPO J', 'J2_READINESS_PROBE', 'Probe de Readiness /ready', 'FAIL', err.message, err);
  }

  // J3: Version & Build Provenance /version
  const versionUrl = API_BASE.replace('/api/v1', '') + '/version';
  try {
    const res = await fetch(versionUrl);
    const data = await res.json();
    if (res.ok && data.product === 'SOS Sales') {
      logEvidence('GRUPO J', 'J3_VERSION_PROVENANCE', 'Proveniência de Release /version', 'PASS', `Produto: ${data.product} | Versão: ${data.version} | Commit: ${data.commitSha || data.commit}`, data);
    } else {
      logEvidence('GRUPO J', 'J3_VERSION_PROVENANCE', 'Proveniência de Release /version', 'FAIL', `Retorno inválido: ${res.status}`, data);
    }
  } catch (err) {
    logEvidence('GRUPO J', 'J3_VERSION_PROVENANCE', 'Proveniência de Release /version', 'FAIL', err.message, err);
  }

  // -------------------------------------------------------------------------
  // RELATÓRIO FINAL
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('📊 HERMES ASSURANCE VERDICT & SCORE (READ-ONLY)');
  console.log('========================================================================');
  console.log(`Cenários Executados: ${passedCount + failedCount + skippedCount}`);
  console.log(`Aprovados: ${passedCount}`);
  console.log(`Reprovados: ${failedCount}`);
  console.log(`Pulados (Read-Only Guard): ${skippedCount}`);
}

runHermesAssurance();
