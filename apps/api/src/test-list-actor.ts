import pg from 'pg';
const { Pool } = pg;

// Strict local development enforcement: Never allow tests to target remote or production databases
const databaseUrl = process.env.LAB_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('[FATAL] LAB_DATABASE_URL or DATABASE_URL environment variable is required');
}

const parsed = new URL(databaseUrl);
const hostname = parsed.hostname.toLowerCase();
const allowedLocalHosts = new Set(['localhost', '127.0.0.1', '::1', 'postgres-lab', 'host.docker.internal']);

if (!allowedLocalHosts.has(hostname)) {
  throw new Error(`[FAIL-CLOSED] test-list-actor is strictly restricted to local lab environments. Host '${hostname}' is rejected.`);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: false,
});

async function main() {
  const actor = { userId: '17fc95cf-7d0f-4ad5-ab92-de1531bd9eb2', email: 'operator@example.test' };
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
