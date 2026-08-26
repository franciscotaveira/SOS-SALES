#!/usr/bin/env node
/**
 * SOS Sales — AI Receptionist 24/7: Homologação ao Vivo
 *
 * Usa dois números reais (SOS Sales ↔ Haven) para validar o pipeline completo:
 * NIM classification → policy → WABA outbound → DB persistence
 *
 * Uso:
 *   node scripts/test-receptionist-live.mjs
 *
 * Env necessário (no .env.production ou exportado):
 *   TEST_EMAIL, TEST_PASSWORD, SUPABASE_ANON_KEY
 */

import { createClient } from '@supabase/supabase-js';

const BASE_URL        = process.env.API_URL        || 'https://crm.iaparavendas.tech';
const SUPABASE_URL    = process.env.SUPABASE_URL   || 'https://yiiuebhyqixzluguxsqi.supabase.co';
const SUPABASE_ANON   = process.env.SUPABASE_ANON_KEY;
const TEST_EMAIL      = process.env.TEST_EMAIL;
const TEST_PASSWORD   = process.env.TEST_PASSWORD;
const WS_HAVEN        = '22222222-2222-2222-2222-222222222222';
const TEST_JOURNEY_ID = process.env.TEST_JOURNEY_ID;
const LIVE_TEST_ALLOWED = process.env.ALLOW_LIVE_RECEPTIONIST_TEST === 'true';

const COLORS = { green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', reset: '\x1b[0m', bold: '\x1b[1m', cyan: '\x1b[36m' };
const G = (t) => `${COLORS.green}${t}${COLORS.reset}`;
const R = (t) => `${COLORS.red}${t}${COLORS.reset}`;
const Y = (t) => `${COLORS.yellow}${t}${COLORS.reset}`;
const B = (t) => `${COLORS.bold}${t}${COLORS.reset}`;
const C = (t) => `${COLORS.cyan}${t}${COLORS.reset}`;

let authToken = '';
let testJourneyId = null;
const results = [];

function log(status, test, detail = '') {
  const icon = status === 'PASS' ? G('✅') : status === 'SKIP' ? Y('⏭️') : status === 'INFO' ? C('ℹ️') : R('❌');
  const line = `${icon} [${status}] ${test}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  if (status !== 'INFO') results.push({ status, test });
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  return res;
}

// ──────────────────────────────────────────
// FASE 0: Auth
// ──────────────────────────────────────────
async function login() {
  if (!SUPABASE_ANON || !TEST_EMAIL || !TEST_PASSWORD) {
    log('SKIP', 'Auth Supabase', 'vars TEST_EMAIL/TEST_PASSWORD/SUPABASE_ANON_KEY não definidas');
    return false;
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
  const { data, error } = await supabase.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  if (error || !data?.session) { log('FAIL', 'Auth Supabase', error?.message); return false; }
  authToken = data.session.access_token;
  log('PASS', 'Auth Supabase', TEST_EMAIL);
  return true;
}

// ──────────────────────────────────────────
// FASE 1: Verificar saúde + configuração do Receptionist
// ──────────────────────────────────────────
async function testHealth() {
  const res = await fetch(`${BASE_URL}/health`);
  const d = await res.json();
  if (d.status === 'ok') log('PASS', '1. API Health', `v${d.version}`);
  else log('FAIL', '1. API Health', JSON.stringify(d));
}

async function testReceptionistConfig() {
  // Verifica RECEPTIONIST_ENABLED via env no container
  log('INFO', '2. Receptionist Config', 'RECEPTIONIST_ENABLED verificado externamente — deve estar =true para o teste funcionar');
  log('INFO', '2. System Prompt', 'Agente: Camila | Haven Escovaria | Trinks booking URL configurado');
}

// ──────────────────────────────────────────
// FASE 2: Encontrar/criar jornada de homologação
// ──────────────────────────────────────────
async function findOrCreateTestJourney() {
  if (!authToken) { log('SKIP', '3. Jornada de Homologação', 'sem auth'); return; }

  if (!LIVE_TEST_ALLOWED || !TEST_JOURNEY_ID) {
    log('FAIL', '3. Jornada de Homologação', 'exige ALLOW_LIVE_RECEPTIONIST_TEST=true e TEST_JOURNEY_ID descartável');
    return;
  }

  testJourneyId = TEST_JOURNEY_ID;
  const res = await api(`/api/v1/workspaces/${WS_HAVEN}/journeys/${testJourneyId}/bot/status`);
  if (!res.ok) { log('FAIL', '3. Jornada de Homologação', `jornada controlada indisponível: HTTP ${res.status}`); testJourneyId = null; return; }
  log('PASS', '3. Jornada de Homologação', `jornada controlada confirmada: ${testJourneyId}`);
}

// ──────────────────────────────────────────
// FASE 3: Verificar estado do bot (deve ser disabled por padrão)
// ──────────────────────────────────────────
async function testBotInitialState() {
  if (!authToken || !testJourneyId) { log('SKIP', '4. Estado Inicial do Bot', 'sem jornada'); return; }

  const res = await api(`/api/v1/workspaces/${WS_HAVEN}/journeys/${testJourneyId}/bot/status`);
  if (!res.ok) { log('FAIL', '4. Estado Inicial do Bot', `HTTP ${res.status}`); return; }
  const d = await res.json();

  if (d.botEnabled === false && d.botActive === false) {
    log('PASS', '4. Estado Inicial do Bot', '🔴 bot_enabled=false — freio de segurança OK');
  } else {
    log('FAIL', '4. Estado Inicial do Bot', `bot_enabled=${d.botEnabled} (esperado: false)`);
  }
}

// ──────────────────────────────────────────
// FASE 4: Habilitar bot APENAS para esta jornada
// ──────────────────────────────────────────
async function testEnableBot() {
  if (!authToken || !testJourneyId) { log('SKIP', '5. Habilitar Bot', 'sem jornada'); return; }

  const res = await api(`/api/v1/workspaces/${WS_HAVEN}/journeys/${testJourneyId}/bot/enable`, { method: 'POST' });
  if (!res.ok) { log('FAIL', '5. Habilitar Bot', `HTTP ${res.status}: ${await res.text()}`); return; }
  const d = await res.json();

  if (d.botEnabled === true && d.botActive === true) {
    log('PASS', '5. Habilitar Bot', '🟢 bot_enabled=true, botActive=true — pronto para receber mensagens');
  } else {
    log('FAIL', '5. Habilitar Bot', JSON.stringify(d));
  }
}

// ──────────────────────────────────────────
// FASE 5: Simular webhook WABA inbound
// ──────────────────────────────────────────
async function testWebhookSimulation() {
  log('INFO', '6. Simulação Webhook WABA', 'Para testar ao vivo: envie uma mensagem de texto para o número WhatsApp da Haven.');
  log('INFO', '6. Número Haven', '+55 49 8837-0054');
  log('INFO', '6. Monitor logs', `ssh vps "docker logs sos-sales-api -f --tail 0 | grep -i receptionist"`);
  log('INFO', '6. O que esperar', 'Dentro de ~3-8s: [ReceptionistAgent] intent=greeting, reply=..., latencyMs=...');
}

// ──────────────────────────────────────────
// FASE 6: Verificar persistência no DB
// ──────────────────────────────────────────
async function testDbPersistence() {
  if (!authToken || !testJourneyId) { log('SKIP', '7. Persistência DB', 'sem jornada'); return; }

  log('INFO', '7. Persistência DB', 'Para validar: abra o Cockpit e verifique se a resposta do bot aparece com sender_type=bot');
  log('INFO', '7. SQL de verificação', `SELECT direction, sender_type, text_content, sent_at FROM public.conversation_messages WHERE journey_id = '${testJourneyId}' AND sender_type = 'bot' ORDER BY sent_at DESC LIMIT 3;`);
}

// ──────────────────────────────────────────
// FASE 7: Testar pause (humano assume)
// ──────────────────────────────────────────
async function testPauseBot() {
  if (!authToken || !testJourneyId) { log('SKIP', '8. Pausar Bot', 'sem jornada'); return; }

  const res = await api(`/api/v1/workspaces/${WS_HAVEN}/journeys/${testJourneyId}/bot/pause`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Teste de homologação — operador assumiu' }),
  });
  if (!res.ok) { log('FAIL', '8. Pausar Bot', `HTTP ${res.status}`); return; }
  const d = await res.json();

  if (d.botEnabled === true && d.botPaused === true && d.botActive === false) {
    log('PASS', '8. Pausar Bot', '🟡 bot_enabled=true, botPaused=true — humano no controle');
  } else {
    log('FAIL', '8. Pausar Bot', JSON.stringify(d));
  }
}

// ──────────────────────────────────────────
// FASE 8: Desabilitar bot (limpeza)
// ──────────────────────────────────────────
async function testDisableBot() {
  if (!authToken || !testJourneyId) { log('SKIP', '9. Desabilitar Bot (limpeza)', 'sem jornada'); return; }

  const res = await api(`/api/v1/workspaces/${WS_HAVEN}/journeys/${testJourneyId}/bot/disable`, { method: 'POST' });
  if (!res.ok) { log('FAIL', '9. Desabilitar Bot', `HTTP ${res.status}`); return; }
  const d = await res.json();

  if (d.botEnabled === false && d.botActive === false) {
    log('PASS', '9. Desabilitar Bot (limpeza)', '🔴 bot desabilitado — jornada limpa após teste');
  } else {
    log('FAIL', '9. Desabilitar Bot', JSON.stringify(d));
  }
}

// ──────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────
async function main() {
  console.log(B('\n🤖 SOS Sales — AI Receptionist: Homologação ao Vivo'));
  console.log(C(`📡 Target: ${BASE_URL}`));
  console.log('─'.repeat(60));

  await testHealth();
  testReceptionistConfig();

  const hasAuth = await login();

  if (hasAuth) {
    await findOrCreateTestJourney();
    await testBotInitialState();
    await testEnableBot();
  }

  await testWebhookSimulation();
  await testDbPersistence();

  if (hasAuth && testJourneyId) {
    await testPauseBot();
    await testDisableBot();
  }

  // ──── Relatório
  console.log('\n' + '─'.repeat(60));
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const skip = results.filter(r => r.status === 'SKIP').length;

  console.log(B(`\n📊 Resultado: ${G(pass + ' PASS')} | ${Y(skip + ' SKIP')} | ${fail > 0 ? R(fail + ' FAIL') : '0 FAIL'}`));

  if (fail === 0) {
    console.log(G('\n✅ Infra de homologação OK. Próximo passo: enviar mensagem real para o número Haven e monitorar logs.'));
    console.log(C('   Monitor: ssh vps "docker logs sos-sales-api -f --tail 0 | grep -i receptionist"'));
  } else {
    console.log(R('\n❌ Há falhas — verifique antes de ativar RECEPTIONIST_ENABLED=true.'));
  }
  console.log();
}

main().catch(console.error);
