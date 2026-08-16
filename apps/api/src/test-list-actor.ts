import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = 'postgresql://sos_sales_runtime.yiiuebhyqixzluguxsqi:SosSalesSovereignSecure2026!@aws-0-ca-central-1.pooler.supabase.com:6543/postgres';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const actor = { userId: '17fc95cf-7d0f-4ad5-ab92-de1531bd9eb2', email: 'franciscotaveira.mkt@gmail.com' };
  console.log('Testing listForActor with claims JSON...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE authenticated');
    await client.query("SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)");
    await client.query("SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)", [actor.userId]);
    await client.query("SELECT pg_catalog.set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: actor.userId, role: 'authenticated', email: actor.email })
    ]);

    const uidRes = await client.query('SELECT auth.uid() as uid, auth.role() as role');
    console.log('auth.uid():', uidRes.rows[0]);

    const result = await client.query(`
      SELECT w.id, w.name, w.slug, wm.role
      FROM public.workspaces w
      INNER JOIN public.workspace_memberships wm
        ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid()
      ORDER BY w.name ASC, w.id ASC
    `);

    console.log('Workspaces found:', result.rows);
    await client.query('COMMIT');
  } catch (err) {
    console.error('ERROR in listForActor:', err);
    await client.query('ROLLBACK').catch(() => undefined);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
