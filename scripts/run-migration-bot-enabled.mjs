#!/usr/bin/env node
/**
 * SOS Sales — Migration: bot_enabled + bot_paused_at
 * Roda ONCE: adiciona colunas de freio de segurança duplo na tabela commercial_journeys
 *
 * Uso: node scripts/run-migration-bot-enabled.mjs
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Carrega DATABASE_URL do .env.production se não estiver no ambiente
let DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  try {
    const envPath = join(__dirname, '../.env.production');
    const envContent = readFileSync(envPath, 'utf8');
    const match = envContent.match(/^DATABASE_URL=(.+)$/m);
    if (match) DATABASE_URL = match[1].trim();
  } catch {
    // ignora se não encontrar
  }
}

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL não encontrado. Defina via env ou .env.production');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Iniciando migration: bot_enabled + bot_paused_at...\n');

    await client.query('BEGIN');

    // Eleva para service_role para ter permissão de ALTER TABLE
    await client.query('SET LOCAL ROLE service_role');
    await client.query(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);

    // 1. Adiciona colunas (idempotente com IF NOT EXISTS)
    await client.query(`
      ALTER TABLE public.commercial_journeys
        ADD COLUMN IF NOT EXISTS bot_enabled      BOOLEAN     NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS bot_paused_at    TIMESTAMPTZ          DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS bot_pause_reason TEXT                 DEFAULT NULL
    `);
    console.log('✅ Colunas adicionadas: bot_enabled, bot_paused_at, bot_pause_reason');

    // 2. Garante que todas as jornadas existentes têm bot_enabled = false
    const updateResult = await client.query(`
      UPDATE public.commercial_journeys
        SET bot_enabled = false
        WHERE bot_enabled IS NULL
    `);
    console.log(`✅ ${updateResult.rowCount} jornadas confirmadas com bot_enabled = false`);

    // 3. Índice para queries rápidas
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_journeys_bot_enabled
        ON public.commercial_journeys(workspace_id, bot_enabled)
        WHERE bot_enabled = true
    `);
    console.log('✅ Índice idx_journeys_bot_enabled criado');

    await client.query('COMMIT');

    // 4. Verifica resultado
    const verify = await client.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN bot_enabled THEN 1 ELSE 0 END) AS bot_habilitado,
        SUM(CASE WHEN bot_paused_at IS NOT NULL THEN 1 ELSE 0 END) AS bot_pausado
      FROM public.commercial_journeys
    `);

    const row = verify.rows[0];
    console.log('\n📊 Estado após migration:');
    console.log(`   Total de jornadas: ${row.total}`);
    console.log(`   Bot habilitado:    ${row.bot_habilitado} (esperado: 0)`);
    console.log(`   Bot pausado:       ${row.bot_pausado} (esperado: 0)`);
    console.log('\n✅ Migration concluída. Todos os bots estão OFF por padrão (seguro).');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration falhou — ROLLBACK executado:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
