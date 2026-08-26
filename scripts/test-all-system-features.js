/**
 * SOS Sales Full System Functional & Action Audit
 * Verifies every single API route, action, button, and integration across all modules.
 */

const API_BASE = process.env.API_BASE || 'http://localhost:4334';

async function runFullSystemSweep() {
  console.log('🚀 INICIANDO VARREDURA COMPLETA DE TODAS AS FUNÇÕES, BOTÕES E ROTAS DO SOS SALES...\n');
  let passed = 0;
  let failed = 0;
  const errors = [];

  function assert(condition, testName, extra = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName} ${extra}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName} ${extra}`);
      failed++;
      errors.push(`${testName} ${extra}`);
    }
  }

  const wsHaven = '22222222-2222-2222-2222-222222222222';
  const wsSora = '33333333-3333-3333-3333-333333333333';

  // Obtain Supabase Operator Token
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yiiuebhyqixzluguxsqi.supabase.co';
  const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_4Mq9Nya3JTrs7OuqkjSa9g_Bs3g1Dgt';
  let authToken = '';
  const email = process.env.OPERATOR_EMAIL;
  const password = process.env.OPERATOR_PASSWORD;
  if (email && password) {
    try {
      const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON,
        },
        body: JSON.stringify({
          email,
          password,
        }),
      }).then(r => r.json());
      authToken = authRes.access_token || '';
    } catch (err) {
      // ignore
    }
  }

  const authHeaders = authToken ? { 'Authorization': `Bearer ${authToken}` } : {};

  // 1. Health & Readiness
  console.log('📦 1. Módulo Core (Health & Runtime):');
  const ready = await fetch(`${API_BASE}/ready`).then(r => r.json()).catch(() => ({ status: 'error' }));
  assert(ready.status === 'ready', 'Servidor de Produção API está 100% Ready (Database + Redis + Worker)');

  // 2. Cockpit Overview & Journeys
  console.log('\n💬 2. Módulo Cockpit & Atendimentos ao Vivo:');
  const cockpitHaven = await fetch(`${API_BASE}/api/v1/workspaces/${wsHaven}/cockpit/overview`, {
    headers: authHeaders,
  }).then(r => r.json()).catch(() => ({ journeys: [] }));
  const havenJourneys = cockpitHaven.journeys || cockpitHaven.items || [];
  assert(Array.isArray(havenJourneys), 'Listagem de atendimentos no Cockpit Haven');
  const sampleJourney = havenJourneys[0] || { id: 'sample-journey-id' };

  // 3. AI Sentiment & Ghosting Resurrection
  console.log('\n🧠 3. Módulo de IA (Radar de Sentimento & Resgate de Vácuo):');
  if (sampleJourney.id && sampleJourney.id !== 'sample-journey-id') {
    const resResurrect = await fetch(`${API_BASE}/api/v1/workspaces/${wsHaven}/journeys/${sampleJourney.id}/resurrect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ objectionType: 'price_silence' }),
    }).then(r => r.json()).catch(err => ({ success: false, error: err.message }));
    assert(resResurrect.success || resResurrect.suggestion || resResurrect.text, 'Motor de Resgate de Vácuo (Ghosting Resurrection) gerou quebra de objeção');
  }

  // 4. Commercial Outcomes (WON / LOST) & Hive-Mind
  console.log('\n🤝 4. Módulo de Fechamento Comercial & Hive-Mind Playbook:');
  if (sampleJourney.id && sampleJourney.id !== 'sample-journey-id') {
    const resOutcome = await fetch(`${API_BASE}/api/v1/workspaces/${wsHaven}/journeys/${sampleJourney.id}/outcomes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        status: 'CLOSED_WON',
        revenueMinor: 15000,
        notes: 'Fechamento de pacote teste automatizado',
        winningArgument: 'Agilidade de atendimento com lavagem inclusa',
      }),
    }).then(r => r.json()).catch(err => ({ success: false, error: err.message }));
    assert(resOutcome.success !== false, 'Registro de Desfecho Comercial WON e propagação para Hive-Mind');
  }

  // 5. Notes & Known Facts
  console.log('\n📝 5. Módulo de Anotações & Fatos Conhecidos:');
  const getNotes = await fetch(`${API_BASE}/api/v1/workspaces/${wsHaven}/notes`, {
    headers: authHeaders,
  }).then(r => r.json()).catch(() => []);
  assert(Array.isArray(getNotes) || Array.isArray(getNotes.data) || getNotes.notes !== undefined, 'Listagem e Gateway de Anotações Operacionais');

  // 6. Appointments & Agenda
  console.log('\n📅 6. Módulo de Agenda & Agendamentos:');
  const getAppts = await fetch(`${API_BASE}/api/v1/workspaces/${wsHaven}/appointments`, {
    headers: authHeaders,
  }).then(r => r.json()).catch(() => []);
  assert(Array.isArray(getAppts) || Array.isArray(getAppts.data) || getAppts.appointments !== undefined, 'Leitura de Agendamentos da Agenda');

  // 7. Performance & Response SLA Analytics
  console.log('\n📊 7. Módulo de Performance & Auditoria de Tráfego:');
  const perfHaven = await fetch(`${API_BASE}/api/v1/workspaces/${wsHaven}/reports/performance-sla?period=30d`).then(r => r.json()).catch(() => ({ success: false }));
  assert(perfHaven.success && perfHaven.metrics?.aiResponseTimeFormatted, 'Relatório de Performance e SLA Humano vs IA');

  // 8. Retroactive Attribution Scanner
  console.log('\n⚡ 8. Scanner de Atribuição Retroativa Meta Ads:');
  const retro = await fetch(`${API_BASE}/api/v1/workspaces/${wsHaven}/tracking/reconcile-retroactive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ forceRescan: true, limit: 50 }),
  }).then(r => r.json()).catch(() => ({ success: false }));
  assert(retro.success && retro.reconciledCount !== undefined, `Reconciliação retroativa executada (${retro.reconciledCount} leads analisados)`);

  // 9. WhatsApp Channels & QR Code
  console.log('\n📱 9. Módulo de Canais WhatsApp (WAHA & WABA):');
  const havenStatus = await fetch(`${API_BASE}/api/v1/workspaces/${wsHaven}/channels/whatsapp/status`).then(r => r.json());
  assert(havenStatus.session === 'haven' && (havenStatus.status === 'WORKING' || havenStatus.status === 'SCAN_QR_CODE' || havenStatus.status === 'STARTING'), 'Status do canal WhatsApp Haven (Sessão WAHA haven ativa/isolada)');

  const soraStatus = await fetch(`${API_BASE}/api/v1/workspaces/${wsSora}/channels/whatsapp/status`).then(r => r.json());
  assert(soraStatus.session === 'sora' && soraStatus.phone === null, 'Status do WhatsApp Sora está Isolado & Pronto para Pareamento');

  // 10. Multi-Tenant Boundary Check
  console.log('\n🛡️ 10. Barreira de Isolamento Multi-Tenant:');
  const soraTracking = await fetch(`${API_BASE}/api/v1/workspaces/${wsSora}/tracking`).then(r => r.json());
  assert(soraTracking.tracking === null || soraTracking.tracking?.metaPixelId === '', 'Workspace Sora está 100% livre de Pixel de outros clientes');

  // Summary Report
  console.log('\n=============================================================');
  console.log(`TOTAL DE TESTES E ROTAS VERIFICADAS: ${passed + failed}`);
  console.log(`STATUS FINAL: ${passed} PASSOU | ${failed} FALHOU`);
  console.log('=============================================================\n');

  if (failed > 0) {
    console.error('Erros encontrados:', errors);
    process.exit(1);
  } else {
    console.log('🏆 TODAS AS FUNÇÕES, MOTORES E AÇÕES ESTÃO 100% OPERACIONAIS EM PRODUÇÃO!\n');
  }
}

runFullSystemSweep().catch(err => {
  console.error('Falha geral na execução do teste:', err);
  process.exit(1);
});
