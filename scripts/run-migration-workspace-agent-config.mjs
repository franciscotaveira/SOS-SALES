#!/usr/bin/env node
/**
 * SOS Sales — Migration: workspace_agent_config table + Haven seed
 * Roda ONCE: cria tabela de configurações e personas de agentes IA por workspace
 *
 * Uso: node scripts/run-migration-workspace-agent-config.mjs
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
  try {
    const envPath = join(__dirname, '../../.env.production');
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
    console.log('🔄 Iniciando migration: workspace_agent_config...\n');

    await client.query('BEGIN');

    // Permissões DDL rodam direto sob o role da conexão (postgres)

    // 1. Cria tabela
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.workspace_agent_config (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        workspace_name TEXT NOT NULL,
        agent_name TEXT NOT NULL DEFAULT 'Assistente',
        business_type TEXT NOT NULL DEFAULT 'Atendimento Comercial',
        services_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        working_hours TEXT NOT NULL DEFAULT 'Segunda a Sábado, 09h às 19h',
        phone TEXT,
        city TEXT DEFAULT 'Chapecó, SC',
        booking_url TEXT,
        booking_flow_enabled BOOLEAN NOT NULL DEFAULT true,
        extra_context TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_workspace_agent_config UNIQUE(workspace_id)
      );
    `);
    console.log('✅ Tabela workspace_agent_config criada');

    // 2. Habilita RLS
    await client.query(`ALTER TABLE public.workspace_agent_config ENABLE ROW LEVEL SECURITY;`);

    // 3. Policies
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'workspace_agent_config' AND policyname = 'workspace_agent_config_select_policy'
        ) THEN
          CREATE POLICY workspace_agent_config_select_policy ON public.workspace_agent_config
            FOR SELECT USING (
              auth.jwt() ->> 'role' = 'service_role' OR
              workspace_id IN (
                SELECT workspace_id FROM public.workspace_members
                WHERE user_id = auth.uid()
              )
            );
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'workspace_agent_config' AND policyname = 'workspace_agent_config_all_service_role'
        ) THEN
          CREATE POLICY workspace_agent_config_all_service_role ON public.workspace_agent_config
            FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
        END IF;
      END
      $$;
    `);
    console.log('✅ Policies RLS configuradas');

    // 4. Seed da Haven Escovaria (idempotente ON CONFLICT)
    await client.query(`
      INSERT INTO public.workspace_agent_config (
        workspace_id,
        workspace_name,
        agent_name,
        business_type,
        services_json,
        working_hours,
        phone,
        city,
        booking_url,
        booking_flow_enabled,
        extra_context
      )
      VALUES (
        'a0000000-0000-0000-0000-000000000001',
        'Haven Escovaria',
        'Camila',
        'Escovaria e salão de beleza premium',
        '[
          {"name": "Escova Modelada", "duration": "45 min"},
          {"name": "Escova Lisa", "duration": "40 min"},
          {"name": "Tratamento Capilar / Hidratação", "duration": "60 min"},
          {"name": "Esmaltação em Gel", "duration": "50 min"},
          {"name": "Spa dos Pés", "duration": "45 min"},
          {"name": "Design de Sobrancelhas", "duration": "30 min"}
        ]'::jsonb,
        'Terça a Sábado, 09h às 19h',
        '+55 49 8837-0054',
        'Chapecó, SC',
        'https://www.trinks.com/haven-escovaria',
        true,
        'Salão de beleza e escovaria focado em praticidade e atendimento de alto padrão. Agendamento preferencial pelo Trinks ou diretamente com a equipe.'
      )
      ON CONFLICT (workspace_id) DO UPDATE SET
        workspace_name = EXCLUDED.workspace_name,
        agent_name = EXCLUDED.agent_name,
        business_type = EXCLUDED.business_type,
        services_json = EXCLUDED.services_json,
        working_hours = EXCLUDED.working_hours,
        phone = EXCLUDED.phone,
        city = EXCLUDED.city,
        booking_url = EXCLUDED.booking_url,
        booking_flow_enabled = EXCLUDED.booking_flow_enabled,
        extra_context = EXCLUDED.extra_context,
        updated_at = now();
    `);
    console.log('✅ Seed Haven Escovaria inserido/atualizado com sucesso');

    await client.query('COMMIT');

    // 5. Verifica
    const res = await client.query('SELECT workspace_id, workspace_name, agent_name, booking_url FROM public.workspace_agent_config');
    console.log('\n📊 Registros atuais em workspace_agent_config:');
    for (const r of res.rows) {
      console.log(`   - [${r.workspace_id}] ${r.workspace_name} -> Agente: ${r.agent_name} | Trinks: ${r.booking_url}`);
    }
    console.log('\n✅ Migration concluída com sucesso!');
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
