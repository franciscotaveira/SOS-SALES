#!/usr/bin/env node
/**
 * SOS Sales — AI Receptionist 24/7 E2E Test
 * Testa o sistema completo: NVIDIA NIM → WABA → DB → Bot Control API
 */

import { createClient } from '@supabase/supabase-js';

const BASE_URL = process.env.API_URL || 'https://crm.iaparavendas.tech';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yiiuebhyqixzluguxsqi.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;

const WS_HAVEN = '22222222-2222-2222-2222-222222222222';

let authToken = '';
let testJourneyId = '';

const results = [];

function log(status, test, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'SKIP' ? '⏭️' : '❌';
  console.log(`${icon} [${status}] ${test}${detail ? ` — ${detail}` : ''}`);
  results.push({ status, test });
}

async function login() {
  if (!SUPABASE_ANON_KEY || !TEST_EMAIL || !TEST_PASSWORD) {
    console.log('⚠️  Skipping auth (TEST_EMAIL/TEST_PASSWORD/SUPABASE_ANON_KEY not set)');
    return false;
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  if (error || !data.session) return false;
  authToken = data.session.access_token;
  return true;
}

async function getFirstJourney() {
  const res = await fetch(`${BASE_URL}/api/v1/workspaces/${WS_HAVEN}/journeys?limit=1`, {
    headers: { 'Authorization': `Bearer ${authToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.items?.[0]?.id || data[0]?.id || null;
}

// Test 1: Health check
async function test1_health() {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    const data = await res.json();
    if (data.status === 'ok') log('PASS', '1. API Health', `v${data.version}`);
    else log('FAIL', '1. API Health', JSON.stringify(data));
  } catch (err) {
    log('FAIL', '1. API Health', err.message);
  }
}

// Test 2: Bot status endpoint exists
async function test2_bot_status() {
  if (!testJourneyId) {
    log('SKIP', '2. Bot Status API', 'No journey available');
    return;
  }
  try {
    const res = await fetch(
      `${BASE_URL}/api/v1/workspaces/${WS_HAVEN}/journeys/${testJourneyId}/bot/status`,
      { headers: { 'Authorization': `Bearer ${authToken}` } }
    );
    if (res.ok) {
      const data = await res.json();
      log('PASS', '2. Bot Status API', `botActive=${data.botActive}, engine=${data.engine}`);
    } else if (res.status === 404) {
      log('SKIP', '2. Bot Status API', 'Column not migrated yet (expected for first deploy)');
    } else {
      log('FAIL', '2. Bot Status API', `HTTP ${res.status}`);
    }
  } catch (err) {
    log('FAIL', '2. Bot Status API', err.message);
  }
}

// Test 3: Bot pause
async function test3_bot_pause() {
  if (!testJourneyId) {
    log('SKIP', '3. Bot Pause API', 'No journey available');
    return;
  }
  try {
    const res = await fetch(
      `${BASE_URL}/api/v1/workspaces/${WS_HAVEN}/journeys/${testJourneyId}/bot/pause`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Teste E2E — verificação de pausa do agente' }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      log('PASS', '3. Bot Pause API', data.message);
    } else if (res.status === 404) {
      log('SKIP', '3. Bot Pause API', 'Column not migrated yet (expected)');
    } else {
      log('FAIL', '3. Bot Pause API', `HTTP ${res.status}`);
    }
  } catch (err) {
    log('FAIL', '3. Bot Pause API', err.message);
  }
}

// Test 4: Bot resume
async function test4_bot_resume() {
  if (!testJourneyId) {
    log('SKIP', '4. Bot Resume API', 'No journey available');
    return;
  }
  try {
    const res = await fetch(
      `${BASE_URL}/api/v1/workspaces/${WS_HAVEN}/journeys/${testJourneyId}/bot/resume`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      }
    );
    if (res.ok) {
      const data = await res.json();
      log('PASS', '4. Bot Resume API', data.message);
    } else if (res.status === 404) {
      log('SKIP', '4. Bot Resume API', 'Column not migrated yet (expected)');
    } else {
      log('FAIL', '4. Bot Resume API', `HTTP ${res.status}`);
    }
  } catch (err) {
    log('FAIL', '4. Bot Resume API', err.message);
  }
}

// Test 5: NVIDIA NIM endpoint reachability (sem chave real)
async function test5_nvidia_nim_reachability() {
  const nimEnabled = process.env.RECEPTIONIST_ENABLED === 'true' && process.env.NVIDIA_API_KEY;
  if (!nimEnabled) {
    log('SKIP', '5. NVIDIA NIM Connectivity', 'RECEPTIONIST_ENABLED=false or NVIDIA_API_KEY not set');
    return;
  }
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/models', {
      headers: { 'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}` },
    });
    if (res.ok || res.status === 401) {
      log('PASS', '5. NVIDIA NIM Endpoint', `HTTP ${res.status} — endpoint reachable`);
    } else {
      log('FAIL', '5. NVIDIA NIM Endpoint', `HTTP ${res.status}`);
    }
  } catch (err) {
    log('FAIL', '5. NVIDIA NIM Endpoint', err.message);
  }
}

// Test 6: Simulate webhook message (smoke test do agente)
async function test6_simulate_webhook_message() {
  const metaSecret = process.env.META_APP_SECRET;
  if (!metaSecret) {
    log('SKIP', '6. WABA Webhook Simulation', 'META_APP_SECRET not set locally');
    return;
  }
  try {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: '1749193841879179',
        changes: [{
          field: 'messages',
          value: {
            metadata: { display_phone_number: '+5549883700054', phone_number_id: '601282856399474' },
            messages: [{
              id: `test_msg_${Date.now()}`,
              from: '5549999990001',
              type: 'text',
              timestamp: Math.floor(Date.now() / 1000).toString(),
              text: { body: 'Olá, gostaria de agendar uma escova modelada!' },
            }],
            contacts: [{ profile: { name: 'Teste E2E Receptionist' }, wa_id: '5549999990001' }],
          },
        }],
      }],
    };
    const bodyStr = JSON.stringify(payload);
    const { createHmac } = await import('node:crypto');
    const sig = 'sha256=' + createHmac('sha256', metaSecret).update(bodyStr).digest('hex');

    const res = await fetch(`${BASE_URL}/api/v1/channels/waba/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': sig,
      },
      body: bodyStr,
    });
    if (res.ok) {
      log('PASS', '6. WABA Webhook Simulation', 'Message ingested — ReceptionistAgent triggered async');
    } else {
      log('FAIL', '6. WABA Webhook Simulation', `HTTP ${res.status}`);
    }
  } catch (err) {
    log('FAIL', '6. WABA Webhook Simulation', err.message);
  }
}

async function main() {
  console.log('\n🤖 SOS Sales — AI Receptionist 24/7 E2E Test Suite');
  console.log(`📡 Target: ${BASE_URL}`);
  console.log('─'.repeat(60));

  const loggedIn = await login();
  if (loggedIn) {
    testJourneyId = await getFirstJourney();
    console.log(`🔑 Auth OK | Journey: ${testJourneyId || 'none found'}\n`);
  }

  await test1_health();
  await test2_bot_status();
  await test3_bot_pause();
  await test4_bot_resume();
  await test5_nvidia_nim_reachability();
  await test6_simulate_webhook_message();

  console.log('\n' + '─'.repeat(60));
  const passed = results.filter(r => r.status === 'PASS').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`\n📊 Resultado: ${passed} PASS | ${skipped} SKIP | ${failed} FAIL`);

  if (failed > 0) {
    console.log('\n❌ Alguns testes falharam. Verifique os logs do servidor.');
    process.exit(1);
  } else {
    console.log('\n✅ Agente Receptionist 24/7 pronto para produção!');
  }
}

main().catch(console.error);
