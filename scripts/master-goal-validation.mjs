import crypto from 'node:crypto';

const SUPABASE_URL = 'https://yiiuebhyqixzluguxsqi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpaXVlYmh5cWl4emx1Z3V4c3FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MzE3NTMsImV4cCI6MjEwMjMwNzc1M30.XObsvr-y26SODG2UjnDm1kB0dt_BeYVCkMH88B_SOuA';
const API_BASE = 'https://crm.iaparavendas.tech/api/v1';
const WS_ID = '11111111-1111-1111-1111-111111111111'; // SOS Sales Oficial

const results = [];

function record(section, testName, passed, details = {}) {
  results.push({ section, testName, passed, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${icon}] [${section}] ${testName}`, Object.keys(details).length ? JSON.stringify(details) : '');
}

async function runMasterValidation() {
  console.log('===============================================================');
  console.log('🚀 MASTER GOAL VALIDATION: SOS SALES COMPLETE PLATFORM AUDIT');
  console.log('===============================================================\n');

  // -------------------------------------------------------------
  // 1. AUTHENTICATION & TOKEN ACQUISITION
  // -------------------------------------------------------------
  console.log('--- 1. AUTHENTICATION & OPERATOR TOKEN ---');
  let token = null;
  let userId = null;
  try {
    const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ email: 'franciscotaveira.mkt@gmail.com', password: 'Ntr*82469356' }),
    });
    const loginData = await loginRes.json();
    if (loginRes.ok && loginData.access_token) {
      token = loginData.access_token;
      userId = loginData.user.id;
      record('Auth', 'Supabase Password Login', true, { email: loginData.user.email, userId });
    } else {
      record('Auth', 'Supabase Password Login', false, loginData);
      process.exit(1);
    }
  } catch (err) {
    record('Auth', 'Supabase Password Login', false, { error: err.message });
    process.exit(1);
  }

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Helper fetcher
  async function apiFetch(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        ...authHeaders,
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, ok: res.ok, data };
  }

  // -------------------------------------------------------------
  // 2. COCKPIT VIEW & PRIORITIES
  // -------------------------------------------------------------
  console.log('\n--- 2. COCKPIT & PRIORITIES ---');
  let targetJourneyId = null;
  {
    const res = await apiFetch(`/workspaces/${WS_ID}/priorities?limit=5`);
    const passed = res.ok && Array.isArray(res.data?.data);
    record('Cockpit', 'GET Priorities Queue', passed, {
      status: res.status,
      count: res.data?.data?.length,
    });

    if (passed && res.data.data.length > 0) {
      targetJourneyId = res.data.data[0].journeyId;
    }
  }

  // Journeys list
  {
    const res = await apiFetch(`/workspaces/${WS_ID}/journeys?limit=10`);
    const passed = res.ok && Array.isArray(res.data?.data);
    record('Cockpit', 'GET Journeys List', passed, {
      status: res.status,
      count: res.data?.data?.length,
    });
    if (!targetJourneyId && passed && res.data.data.length > 0) {
      targetJourneyId = res.data.data[0].id;
    }
  }

  // Target journey cockpit context
  if (targetJourneyId) {
    const res = await apiFetch(`/workspaces/${WS_ID}/journeys/${targetJourneyId}/cockpit`);
    const passed = res.ok && res.data?.data?.journey?.id === targetJourneyId;
    record('Cockpit', 'GET Journey Cockpit Context', passed, {
      status: res.status,
      leadName: res.data?.data?.journey?.contactName,
      stage: res.data?.data?.journey?.pipelineStage,
      messagesCount: res.data?.data?.timeline?.length || 0,
    });
  }

  // -------------------------------------------------------------
  // 3. PIPELINE STAGES, KNOWN FACTS & OUTCOMES
  // -------------------------------------------------------------
  console.log('\n--- 3. PIPELINE STAGE MUTATION, FACTS & OUTCOMES ---');
  if (targetJourneyId) {
    // Stage update
    {
      const res = await apiFetch(`/workspaces/${WS_ID}/journeys/${targetJourneyId}/stage`, {
        method: 'PATCH',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ stage: 'QUALIFIED', reason: 'Lead qualificado com interesse no plano anual' }),
      });
      const passed = res.ok && res.data?.data?.stage === 'QUALIFIED';
      record('Pipeline', 'PATCH Journey Stage (QUALIFIED)', passed, { status: res.status, data: res.data });
    }

    // Follow-up scheduling
    {
      const dueAt = new Date(Date.now() + 86400000).toISOString();
      const res = await apiFetch(`/workspaces/${WS_ID}/journeys/${targetJourneyId}/follow-ups`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ dueAt, reason: 'Follow-up de fechamento comercial' }),
      });
      const passed = res.ok;
      record('Pipeline', 'POST Journey Follow-up', passed, { status: res.status, data: res.data });
    }

    // Known fact append
    {
      const res = await apiFetch(`/workspaces/${WS_ID}/journeys/${targetJourneyId}/facts`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          key: 'qualification.budget',
          value: { monthlyBudgetBrl: 5000, planChoice: 'annual' },
          confidence: 0.95,
          confirmedByCustomer: true,
        }),
      });
      const passed = res.ok;
      record('Facts', 'POST Known Fact Append-Only', passed, { status: res.status, data: res.data });
    }

    // Supervised outbound draft
    let dispatchId = null;
    {
      const res = await apiFetch(`/workspaces/${WS_ID}/journeys/${targetJourneyId}/outbound-drafts`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ textContent: 'Olá! Mensagem de auditoria automatizada do SOS Sales.' }),
      });
      const passed = res.ok && res.data?.data?.dispatchId;
      if (passed) dispatchId = res.data.data.dispatchId;
      record('Outbound', 'POST Supervised Outbound Draft', passed, { status: res.status, dispatchId });
    }

    // Outbound dispatch approval
    if (dispatchId) {
      const res = await apiFetch(`/workspaces/${WS_ID}/outbound-dispatches/${dispatchId}/approve`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({}),
      });
      const passed = res.ok && res.data?.data?.status === 'APPROVED';
      record('Outbound', 'POST Approve Outbound Dispatch', passed, { status: res.status, statusText: res.data?.data?.status });
    }
  }

  // -------------------------------------------------------------
  // 4. AGENDA COMERCIAL (APPOINTMENTS)
  // -------------------------------------------------------------
  console.log('\n--- 4. AGENDA COMERCIAL CRUD ---');
  let createdAppointmentId = null;
  {
    // Create Appointment
    const scheduledAt = new Date(Date.now() + 172800000).toISOString();
    const res = await apiFetch(`/workspaces/${WS_ID}/appointments`, {
      method: 'POST',
      body: JSON.stringify({
        leadName: 'Audit Lead VIP',
        leadPhone: '+554999998888',
        serviceName: 'Consultoria SOS Sales Premium',
        serviceValueMinor: 500000,
        scheduledAt,
        durationMinutes: 45,
        status: 'confirmed',
        notes: 'Lead qualificado para plano anual com desconto',
      }),
    });
    const passed = res.ok && res.data?.data?.id;
    if (passed) createdAppointmentId = res.data.data.id;
    record('Agenda', 'POST Create Appointment', passed, { status: res.status, id: createdAppointmentId });
  }

  if (createdAppointmentId) {
    // Update Appointment
    const res = await apiFetch(`/workspaces/${WS_ID}/appointments/${createdAppointmentId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'completed',
        notes: 'Reunião realizada com sucesso e proposta enviada.',
      }),
    });
    const passed = res.ok && res.data?.data?.status === 'completed';
    record('Agenda', 'PATCH Update Appointment Status (completed)', passed, { status: res.status });

    // List Appointments
    const listRes = await apiFetch(`/workspaces/${WS_ID}/appointments`);
    const listPassed = listRes.ok && Array.isArray(listRes.data?.data);
    record('Agenda', 'GET List Appointments', listPassed, { status: listRes.status, count: listRes.data?.data?.length });

    // Delete Appointment (Cleanup)
    const delRes = await apiFetch(`/workspaces/${WS_ID}/appointments/${createdAppointmentId}`, {
      method: 'DELETE',
    });
    record('Agenda', 'DELETE Appointment Cleanup', delRes.status === 204 || delRes.ok, { status: delRes.status });
  }

  // -------------------------------------------------------------
  // 5. ANOTAÇÕES OPERACIONAIS (NOTES)
  // -------------------------------------------------------------
  console.log('\n--- 5. ANOTAÇÕES OPERACIONAIS CRUD ---');
  let createdNoteId = null;
  {
    // Create Note
    const res = await apiFetch(`/workspaces/${WS_ID}/notes`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Script de Fechamento Rápido',
        content: 'Quando o lead hesitar no preço:\n1. Relembre o custo de perder leads no WhatsApp\n2. Mostre o ROI em 30 dias\n3. Ofereça garantia incondicional.',
        category: 'script',
        tags: ['Fechamento', 'Objeção', 'Preço'],
        color: 'purple',
      }),
    });
    const passed = res.ok && res.data?.data?.id;
    if (passed) createdNoteId = res.data.data.id;
    record('Notes', 'POST Create Operational Note', passed, { status: res.status, id: createdNoteId });
  }

  if (createdNoteId) {
    // Update / Pin Note
    const res = await apiFetch(`/workspaces/${WS_ID}/notes/${createdNoteId}`, {
      method: 'PATCH',
      body: JSON.stringify({ pinned: true, color: 'emerald' }),
    });
    const passed = res.ok && res.data?.data?.pinned === true;
    record('Notes', 'PATCH Pin Note', passed, { status: res.status });

    // List Notes
    const listRes = await apiFetch(`/workspaces/${WS_ID}/notes`);
    const listPassed = listRes.ok && Array.isArray(listRes.data?.data);
    record('Notes', 'GET List Notes', listPassed, { status: listRes.status, count: listRes.data?.data?.length });

    // Delete Note (Cleanup)
    const delRes = await apiFetch(`/workspaces/${WS_ID}/notes/${createdNoteId}`, {
      method: 'DELETE',
    });
    record('Notes', 'DELETE Note Cleanup', delRes.status === 204 || delRes.ok, { status: delRes.status });
  }

  // -------------------------------------------------------------
  // 6. RESULTADOS & PROVA DE TRÁFEGO (TRAFFIC PROOF)
  // -------------------------------------------------------------
  console.log('\n--- 6. TRAFFIC PROOF & ROAS ---');
  {
    const fromDate = '2026-08-01';
    const toDate = '2026-08-16';
    const res = await apiFetch(`/workspaces/${WS_ID}/traffic-proof?from=${fromDate}&to=${toDate}&limit=20`);
    const passed = res.ok && Array.isArray(res.data?.data);
    record('Traffic Proof', 'GET Traffic Proof Metrics', passed, {
      status: res.status,
      campaignsCount: res.data?.data?.length || 0,
      basis: res.data?.meta?.basis,
    });
  }

  // -------------------------------------------------------------
  // 7. CANAIS WHATSAPP (WAHA & WABA META CLOUD API)
  // -------------------------------------------------------------
  console.log('\n--- 7. CANAIS WHATSAPP (WAHA & META CLOUD API WABA) ---');
  {
    // WAHA Status
    const res = await apiFetch(`/workspaces/${WS_ID}/channels/whatsapp/status`);
    const passed = res.ok && Boolean(res.data?.status);
    record('Channels', 'GET WhatsApp Channel Status (WAHA)', passed, {
      status: res.status,
      engineStatus: res.data?.status,
      session: res.data?.session,
    });

    // WAHA QR Code
    const qrRes = await apiFetch(`/workspaces/${WS_ID}/channels/whatsapp/qr`);
    const qrPassed = qrRes.ok && Boolean(qrRes.data?.status);
    record('Channels', 'GET WhatsApp Live QR Engine State', qrPassed, {
      status: qrRes.status,
      engineStatus: qrRes.data?.status,
      hasQrImage: Boolean(qrRes.data?.qr),
    });

    // WABA Webhook Handshake Verification (Meta Hub Challenge)
    const challengeRes = await fetch(`${API_BASE}/channels/waba/webhook?hub.mode=subscribe&hub.verify_token=mct_waba_verify_2026&hub.challenge=MASTER_AUDIT_777`);
    const challengeText = await challengeRes.text();
    record('Channels', 'GET Meta WABA Webhook Handshake (hub.challenge)', challengeRes.status === 200 && challengeText === 'MASTER_AUDIT_777', {
      status: challengeRes.status,
      response: challengeText,
    });

    // WABA Inbound & CTWA Referral Ingestion
    const wabaPostRes = await fetch(`${API_BASE}/channels/waba/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{
          id: 'meta_account_audit',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '554988447562', phone_number_id: '104829482910394' },
              contacts: [{ profile: { name: 'Audit Meta Lead' }, wa_id: '554988447562' }],
              messages: [{
                from: '554988447562',
                id: `wamid.AUDIT_${Date.now()}`,
                timestamp: Math.floor(Date.now() / 1000).toString(),
                type: 'text',
                text: { body: 'Mensagem de teste de validação de WABA oficial' },
                referral: {
                  source_type: 'ad',
                  source_id: 'ad_audit_meta_2026',
                  headline: 'SOS Sales WABA Official Ad',
                  ad_id: '23859999999999999',
                },
              }],
            },
            field: 'messages',
          }],
        }],
      }),
    });
    const wabaPostJson = await wabaPostRes.json();
    record('Channels', 'POST Meta WABA Inbound & CTWA Referral Ingestion', wabaPostRes.status === 200 && wabaPostJson?.status === 'ok', {
      status: wabaPostRes.status,
      response: wabaPostJson,
    });
  }

  // -------------------------------------------------------------
  // 8. BILLING & CHECKOUT PIX (ABACATEPAY)
  // -------------------------------------------------------------
  console.log('\n--- 8. BILLING & PIX CHECKOUT (ABACATEPAY) ---');
  {
    const res = await apiFetch('/billing/abacatepay/charges', {
      method: 'POST',
      body: JSON.stringify({
        customerName: 'Francisco Taveira',
        customerPhone: '+554999998888',
        customerEmail: 'franciscotaveira.mkt@gmail.com',
        productName: 'Assinatura Mensal SOS Sales Core',
        priceInCents: 19700,
      }),
    });
    const passed = res.ok || res.status === 201 || (res.status === 200 && res.data?.id);
    record('Billing', 'POST Create Pix Charge (AbacatePay)', passed, { status: res.status, data: res.data });
  }

  // -------------------------------------------------------------
  // 9. HEALTH & READINESS PROBES
  // -------------------------------------------------------------
  console.log('\n--- 9. SYSTEM HEALTH & READINESS PROBES ---');
  {
    const livenessRes = await apiFetch('https://crm.iaparavendas.tech/health');
    record('Health', 'GET Liveness Probe (/health)', livenessRes.status === 200, { status: livenessRes.status });

    const readyRes = await apiFetch('https://crm.iaparavendas.tech/ready');
    record('Health', 'GET Readiness Probe (/ready)', readyRes.status === 200, { status: readyRes.status, data: readyRes.data });
  }

  // -------------------------------------------------------------
  // SUMMARY REPORT
  // -------------------------------------------------------------
  console.log('\n===============================================================');
  console.log('📊 MASTER GOAL VALIDATION SUMMARY');
  console.log('===============================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log(`Total Checks: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.table(
    results.map((r) => ({
      Section: r.section,
      Test: r.testName,
      Status: r.passed ? 'PASS' : 'FAIL',
    }))
  );

  if (failed === 0) {
    console.log('\n🎉 ALL SOS SALES PLATFORM FUNCTIONS ARE 100% OPERATIONAL!');
    process.exit(0);
  } else {
    console.log('\n⚠️ SOME CHECKS FAILED:');
    console.log(JSON.stringify(results.filter((r) => !r.passed), null, 2));
    process.exit(1);
  }
}

runMasterValidation().catch((err) => {
  console.error('Fatal validation runner error:', err);
  process.exit(1);
});
