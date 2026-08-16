const SUPABASE_URL = 'https://yiiuebhyqixzluguxsqi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpaXVlYmh5cWl4emx1Z3V4c3FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MzE3NTMsImV4cCI6MjEwMjMwNzc1M30.XObsvr-y26SODG2UjnDm1kB0dt_BeYVCkMH88B_SOuA';
const API_BASE = 'http://localhost:4334/api/v1';
const WS_ID = '11111111-1111-1111-1111-111111111111'; // SOS Sales Oficial

async function runAudit() {
  console.log('=== LOGGING IN WITH SUPABASE AUTH ===');
  const loginRes = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: 'franciscotaveira.mkt@gmail.com', password: 'Ntr*82469356' }),
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
  await check('8. Liveness Probe', 'http://localhost:4334/health');

  // 9. Readiness Probe
  await check('9. Readiness Probe', 'http://localhost:4334/ready');

  console.log('\n=== AUDIT SUMMARY ===');
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  console.log(`Total Routes Checked: ${total} | Passed: ${passed} | Failed: ${total - passed}`);
  console.table(results);

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
