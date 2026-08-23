/**
 * SOS SALES — SCRIPT DE CADASTRO DE NOVA EMPRESA / CLIENTE
 * 
 * Uso:
 *   node scripts/create-new-client-company.mjs --name "Odonto Excellence" --email "contato@odonto.com"
 */

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
const { Pool } = pg;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://yiiuebhyqixzluguxsqi.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpaXVlYmh5cWl4emx1Z3V4c3FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MzE3NTMsImV4cCI6MjEwMjMwNzc1M30.XObsvr-y26SODG2UjnDm1kB0dt_BeYVCkMH88B_SOuA';
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required.');
  process.exit(1);
}

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1].trim();
  }
  return null;
}

const companyName = getArg('--name') || process.argv[2];
const ownerEmail = getArg('--email') || process.argv[3];

if (!companyName) {
  console.log(`
===================================================================
🏢 SOS SALES — CADASTRO DE NOVA EMPRESA / WORKSPACE
===================================================================

Como usar:
  node scripts/create-new-client-company.mjs --name "Nome da Empresa" --email "dono@empresa.com"

Exemplo:
  node scripts/create-new-client-company.mjs --name "Clínica Sorriso VIP" --email "dra.aline@sorrisovip.com.br"
===================================================================
`);
  process.exit(1);
}

async function createCompany() {
  console.log('\n===================================================================');
  console.log(`🏢 Cadastrando Nova Empresa: "${companyName}"`);
  console.log('===================================================================\n');

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE service_role');

    // 1. Gerar slug limpo
    const slug = companyName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // 2. Inserir Workspace
    const wsResult = await client.query(
      `INSERT INTO public.workspaces (name, slug) 
       VALUES ($1, $2) 
       RETURNING id, name, slug, created_at`,
      [companyName, slug]
    );
    const ws = wsResult.rows[0];
    const wsId = ws.id;

    // 3. Gerar Sessão WAHA Isolada (ws_<32hex>)
    const sessionName = `ws_${wsId.replace(/-/g, '')}`;

    // 4. Inserir Conexão de Canal WhatsApp
    const chanResult = await client.query(
      `INSERT INTO public.channel_connections (
         workspace_id, provider, phone_number, name, status, public_config
       ) VALUES (
         $1, 'waha', 'pending', 'WhatsApp Principal', 'DISCONNECTED', $2
       ) RETURNING id`,
      [wsId, JSON.stringify({ autoCreated: true, session: sessionName })]
    );
    const chanId = chanResult.rows[0].id;

    // 5. Se foi informado o e-mail do dono, vincular membership
    let userIdFound = null;
    if (ownerEmail) {
      const userRes = await client.query(
        `SELECT id FROM auth.users WHERE email = $1 LIMIT 1`,
        [ownerEmail.toLowerCase()]
      );
      if (userRes.rows.length > 0) {
        userIdFound = userRes.rows[0].id;
        await client.query(
          `INSERT INTO public.workspace_memberships (workspace_id, user_id, role)
           VALUES ($1, $2, 'owner')
           ON CONFLICT DO NOTHING`,
          [wsId, userIdFound]
        );
      }
    }

    await client.query('COMMIT');

    console.log('✅ SUCESSO! Nova Empresa Criada e Isolada:');
    console.log('-------------------------------------------------------------------');
    console.log(`• Nome da Empresa:    ${ws.name}`);
    console.log(`• Slug:               ${ws.slug}`);
    console.log(`• Workspace UUID:     ${wsId}`);
    console.log(`• Sessão WhatsApp:    ${sessionName}`);
    console.log(`• Canal ID:           ${chanId}`);
    if (userIdFound) {
      console.log(`• Dono Vinculado:     ${ownerEmail} (ID: ${userIdFound})`);
    } else if (ownerEmail) {
      console.log(`• Aviso de Dono:      E-mail "${ownerEmail}" ainda não cadastrado no Supabase Auth.`);
      console.log(`                      Quando o cliente fizer login com este e-mail, será vinculado automaticamente!`);
    }
    console.log('-------------------------------------------------------------------');
    console.log('\n📲 PRÓXIMO PASSO COM O CLIENTE:');
    console.log(`1. O cliente entra em: https://crm.iaparavendas.tech`);
    console.log(`2. Vai em Configurações -> WhatsApp e escaneia o QR Code da sessão "${sessionName}".`);
    console.log(`3. O sistema já começa a operar 100% isolado na conta da empresa dele.\n`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erro ao cadastrar nova empresa:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

createCompany();
