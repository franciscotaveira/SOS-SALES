const SUPABASE_URL = process.env.SUPABASE_URL?.trim() || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY?.trim() || '';
const API_BASE = (process.env.API_BASE || process.env.API_BASE_URL || '').trim();
const WS_ID = process.env.WORKSPACE_ID?.trim() || '';

async function runAudit() {
  const requiredTargetVariables = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'API_BASE', 'WORKSPACE_ID'];
  const missingTargetVariables = requiredTargetVariables.filter((name) => !process.env[name]?.trim());
  if (missingTargetVariables.length > 0) {
    console.error(`Refusing to run without an explicit target: missing ${missingTargetVariables.join(', ')}.`);
    process.exit(1);
  }

  const email = process.env.OPERATOR_EMAIL;
  const password = process.env.OPERATOR_PASSWORD;
  if (!email || !password) {
    console.error('OPERATOR_EMAIL and OPERATOR_PASSWORD environment variables are required.');
    process.exit(1);
  }
  console.log('=== LOGGING IN WITH SUPABASE AUTH ===');
  const loginRes = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const loginData = await loginRes.json();
  if (!loginData.access_token) {
    console.error('Login failed:', loginData);
    process.exit(1);
  }
  const token = loginData.access_token;
  console.log('Login OK! User ID:', loginData.user.id);

  console.log('\n=== RUNNING COMPLETE E2E ROUTE AUDIT ===');
  const results = [];

  async function check(name, url, options = {}) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      const ok = res.status >= 200 && res.status < 300;
      results.push({ name, url, status: res.status, ok, count: data?.data?.length ?? (Array.isArray(data) ? data.length : 1) });
      console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name} -> HTTP ${res.status}`);
    } catch (err) {
      results.push({ name, url, status: 500, ok: false, error: err.message });
      console.log(`[FAIL] ${name} - Error: ${err.message}`);
    }
  }

  // 1. Cockpit Priorities
  await check('1. Cockpit Priorities', `${API_BASE}/workspaces/${WS_ID}/priorities?limit=5`);

  // 2. Journeys List
  await check('2. Journeys List', `${API_BASE}/workspaces/${WS_ID}/journeys?limit=10`);

  // 3. Traffic Proof
  await check('3. Traffic Proof Metrics', `${API_BASE}/workspaces/${WS_ID}/traffic-proof?from=2026-08-01&to=2026-08-16`);

  // 4. Appointments List
  await check('4. Appointments List', `${API_BASE}/workspaces/${WS_ID}/appointments`);

  // 5. Notes List
  await check('5. Notes List', `${API_BASE}/workspaces/${WS_ID}/notes`);

  // 6. WhatsApp Channel Status
  await check('6. WhatsApp Channel Status', `${API_BASE}/workspaces/${WS_ID}/channels/whatsapp/status`);

  // 7. WhatsApp Live QR
  await check('7. WhatsApp Live QR', `${API_BASE}/workspaces/${WS_ID}/channels/whatsapp/qr`);

  // 8. Health Probe
  const HEALTH_BASE = process.env.HEALTH_BASE_URL || new URL(API_BASE).origin;
  await check('8. Liveness Probe', `${HEALTH_BASE}/health`);

  // 9. Readiness Probe
  await check('9. Readiness Probe', `${HEALTH_BASE}/ready`);

  // 10. WAHA Webhook Live Ingestion Probe
  const wahaApiKey = process.env.WAHA_API_KEY || 'mct_sos_waha_lab_secret_2026';
  await check('10. WAHA Webhook Ingestion', `${API_BASE}/channels/waha/webhook`, {
    method: 'POST',
    headers: { 'x-api-key': wahaApiKey },
    body: JSON.stringify({
      event: 'message',
      session: 'haven_main',
      payload: {
        id: `e2e_msg_${Date.now()}`,
        timestamp: Math.floor(Date.now() / 1000),
        from: '5549999887766@c.us',
        to: '5549999112233@c.us',
        fromMe: false,
        body: 'E2E Audit Inbound WhatsApp Message',
        hasMedia: false,
        _data: { notifyName: 'Audit Operator' }
      }
    }),
  });

  console.log('\n=== AUDIT SUMMARY ===');
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  console.log(`Total Routes Checked: ${total} | Passed: ${passed} | Failed: ${total - passed}`);
  console.table(results);

  // If running against local test environment, clean up probe message fixtures automatically
  if (HEALTH_BASE.includes('127.0.0.1') || HEALTH_BASE.includes('localhost')) {
    try {
      const { cleanupTestFixtures } = await import('../apps/api/scripts/cleanup-test-fixtures.mjs');
      await cleanupTestFixtures();
    } catch {
      // Ignored if test database is not directly reachable on host
    }
  }

  if (passed === total) {
    console.log('✅ ALL API & PLATFORM ROUTES ARE 100% OPERATIONAL!');
    process.exit(0);
  } else {
    console.log('❌ SOME ROUTES RETURNED UNEXPECTED CODES:');
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
