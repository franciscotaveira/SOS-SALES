/**
 * Re-seeds the test operator user in local GoTrue after database reset
 */

const GOTRUE_ADMIN_URL = process.env.GOTRUE_ADMIN_URL || 'http://127.0.0.1:55431/auth/v1/admin/users';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

async function reseedOperator() {
  try {
    const res = await fetch(GOTRUE_ADMIN_URL, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: '00000000-0000-0000-0000-000000000001',
        email: 'operator@sos-sales.test',
        password: 'Password123!',
        email_confirm: true,
      }),
    });
    if (res.ok || res.status === 422) {
      console.log('✅ [TEST TEARDOWN] GoTrue operator user seeded & database restored to clean seed state.');
    } else {
      const err = await res.text();
      console.warn('⚠️ [TEST TEARDOWN] Operator seed returned:', res.status, err);
    }
  } catch (err) {
    console.warn('⚠️ [TEST TEARDOWN] Operator seed error:', err.message);
  }
}

reseedOperator();
