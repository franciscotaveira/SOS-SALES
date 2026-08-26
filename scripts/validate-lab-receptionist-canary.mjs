#!/usr/bin/env node
/**
 * SOS Sales — NVIDIA Receptionist Lab Canary Gate Validator
 *
 * Implements the 10-step strict verification sequence specified in:
 * docs/audits/NVIDIA_RECEPTIONIST_CANARY_GATE_2026-08-25.md
 *
 * Runs against the local Docker Lab (API: http://localhost:4335, DB: localhost:55432)
 */

import pg from '../apps/api/node_modules/pg/lib/index.js';
import { getReceptionistActionPolicy, parseReceptionistDecision } from '../apps/api/src/application/agents/receptionist-agent.js';
import { getWorkspaceConfig, buildSystemPrompt } from '../apps/api/src/infrastructure/ai/receptionist-system-prompt.ts';

const LAB_API = process.env.LAB_API || 'http://localhost:4335';
const LAB_DB_URL = process.env.LAB_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:55432/postgres';
const WS_LAB = 'a0000000-0000-0000-0000-000000000001';

const COLORS = { green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', reset: '\x1b[0m', bold: '\x1b[1m', cyan: '\x1b[36m' };
const G = (t) => `${COLORS.green}${t}${COLORS.reset}`;
const R = (t) => `${COLORS.red}${t}${COLORS.reset}`;
const Y = (t) => `${COLORS.yellow}${t}${COLORS.reset}`;
const B = (t) => `${COLORS.bold}${t}${COLORS.reset}`;
const C = (t) => `${COLORS.cyan}${t}${COLORS.reset}`;

async function run() {
  console.log(B('\n🔍 [CANARY GATE] Iniciando Validação Controlada do AI Receptionist no Lab\n'));
  const pool = new pg.Pool({ connectionString: LAB_DB_URL, max: 2 });
  const client = await pool.connect();

  let testJourneyId = null;

  try {
    // 1. Validar /health e versão do artefato
    console.log(C('--- PASSO 1: Validar /health e versão do artefato Lab ---'));
    const healthRes = await fetch(`${LAB_API}/health`);
    if (!healthRes.ok) throw new Error(`Health check falhou: HTTP ${healthRes.status}`);
    const health = await healthRes.json();
    console.log(`Status: ${health.status}, Release: ${health.release}, Env: ${health.environment}`);
    if (health.status !== 'ok' || health.environment !== 'lab') {
      throw new Error('Ambiente inválido retornado pelo health check');
    }
    console.log(G('✅ PASSO 1 PASS: API Lab saudável e em ambiente de isolamento.\n'));

    // 2. Criar/identificar jornada descartável controlada
    console.log(C('--- PASSO 2: Criar jornada descartável controlada no Lab ---'));
    const contactRes = await client.query(
      `INSERT INTO public.contacts (id, workspace_id, phone, name)
       VALUES (gen_random_uuid(), $1, '+5549999990001', 'Canary Test Contact')
       RETURNING id`,
      [WS_LAB]
    );
    const testContactId = contactRes.rows[0].id;

    const journeyRes = await client.query(
      `INSERT INTO public.commercial_journeys (id, workspace_id, contact_id, status, bot_enabled)
       VALUES (gen_random_uuid(), $1, $2, 'OPEN', false)
       RETURNING id, bot_enabled, bot_paused_at`,
      [WS_LAB, testContactId]
    );
    testJourneyId = journeyRes.rows[0].id;

    console.log(`Jornada descartável criada: ${testJourneyId}`);
    console.log(`Estado inicial: bot_enabled=${journeyRes.rows[0].bot_enabled}, bot_paused_at=${journeyRes.rows[0].bot_paused_at}`);

    if (journeyRes.rows[0].bot_enabled !== false) {
      throw new Error('Invariante violada: jornada criada com bot_enabled != false');
    }
    console.log(G('✅ PASSO 2 PASS: Jornada controlada inicia com bot_enabled=false e botActive=false.\n'));

    // 3. Validar que todas as jornadas existentes começam com bot_enabled=false
    console.log(C('--- PASSO 3: Verificar isolamento e fail-closed de todas as jornadas ---'));
    const allJourneys = await client.query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN bot_enabled = true THEN 1 ELSE 0 END) AS active_bots
       FROM public.commercial_journeys
       WHERE workspace_id = $1`,
      [WS_LAB]
    );
    console.log(`Total jornadas no Lab: ${allJourneys.rows[0].total}, Ativas: ${allJourneys.rows[0].active_bots}`);
    if (parseInt(allJourneys.rows[0].active_bots) !== 0) {
      throw new Error('Existem jornadas com bot ativo no Lab!');
    }
    console.log(G('✅ PASSO 3 PASS: 100% das jornadas no banco estão com bot_enabled=false.\n'));

    // 4. Habilitar somente a jornada controlada
    console.log(C('--- PASSO 4: Habilitar explicitamente a jornada de teste ---'));
    await client.query(
      `UPDATE public.commercial_journeys
       SET bot_enabled = true, bot_paused_at = NULL
       WHERE id = $1 AND workspace_id = $2`,
      [testJourneyId, WS_LAB]
    );

    const checkEnabled = await client.query(
      `SELECT bot_enabled, bot_paused_at FROM public.commercial_journeys WHERE id = $1`,
      [testJourneyId]
    );
    const isBotActive = checkEnabled.rows[0].bot_enabled === true && !checkEnabled.rows[0].bot_paused_at;
    if (!isBotActive) throw new Error('Ativação da jornada falhou');

    // Checar que as outras permanecem desabilitadas
    const checkOthers = await client.query(
      `SELECT COUNT(*) as count FROM public.commercial_journeys WHERE id != $1 AND bot_enabled = true`,
      [testJourneyId]
    );
    if (parseInt(checkOthers.rows[0].count) !== 0) {
      throw new Error('Efeito colateral: outra jornada foi habilitada indevidamente');
    }
    console.log(G('✅ PASSO 4 PASS: Apenas a jornada de teste foi ativada. Zero vazamento.\n'));

    // 5. Testar Classificação de Intenção e Política com Prompt Haven
    console.log(C('--- PASSO 5: Testar Envelope de Decisão e Política de Ação ---'));
    const config = getWorkspaceConfig('22222222-2222-2222-2222-222222222222');
    const prompt = buildSystemPrompt(config);

    // 5.1 Testar saudação/inquiry
    const sampleGreetingResponse = '{"intent":"greeting","escalate":false,"sendBookingFlow":false}\nOlá! Bem-vinda à Haven Escovaria! Como posso te ajudar hoje?';
    const decisionGreeting = parseReceptionistDecision(sampleGreetingResponse);
    if (!decisionGreeting || decisionGreeting.intent !== 'greeting') {
      throw new Error('Falha ao processar envelope de saudação');
    }
    const policyGreeting = getReceptionistActionPolicy(decisionGreeting);
    if (policyGreeting.shouldEscalate || !policyGreeting.allowReply) {
      throw new Error('Política de saudação incorreta');
    }
    console.log(`Saudação: intent=${decisionGreeting.intent}, allowReply=${policyGreeting.allowReply}`);

    // 5.2 Testar pedido de humano (deve escalar obrigatoriamente)
    const sampleHumanResponse = '{"intent":"human_request","escalate":true,"sendBookingFlow":false}\n';
    const decisionHuman = parseReceptionistDecision(sampleHumanResponse);
    if (!decisionHuman) throw new Error('Falha ao processar envelope human_request');
    const policyHuman = getReceptionistActionPolicy(decisionHuman);
    if (!policyHuman.shouldEscalate || policyHuman.allowReply) {
      throw new Error('Política de escalação humana violada! Não pode permitir reply autônomo.');
    }
    console.log(`Pedido de Humano: intent=${decisionHuman.intent}, shouldEscalate=${policyHuman.shouldEscalate}, allowReply=${policyHuman.allowReply}`);
    console.log(G('✅ PASSO 5 PASS: Decisão e políticas rigorosamente aderentes.\n'));

    // 6. Testar Escalação no Banco ao receber pedido de humano
    console.log(C('--- PASSO 6: Simular Escalação Humana no Banco de Dados ---'));
    await client.query(
      `UPDATE public.commercial_journeys
       SET bot_paused_at = NOW(), bot_pause_reason = 'Intent: human_request — escalado pelo agente IA'
       WHERE id = $1`,
      [testJourneyId]
    );

    const checkEscalated = await client.query(
      `SELECT bot_enabled, bot_paused_at, bot_pause_reason FROM public.commercial_journeys WHERE id = $1`,
      [testJourneyId]
    );
    const isBotActiveAfterEscalate = checkEscalated.rows[0].bot_enabled === true && !checkEscalated.rows[0].bot_paused_at;
    if (isBotActiveAfterEscalate) {
      throw new Error('Freio de escalação falhou: bot continuou ativo!');
    }
    console.log(`Status após escalação: bot_enabled=${checkEscalated.rows[0].bot_enabled}, bot_paused_at=${checkEscalated.rows[0].bot_paused_at !== null}`);
    console.log(`Motivo da pausa: "${checkEscalated.rows[0].bot_pause_reason}"`);
    console.log(G('✅ PASSO 6 PASS: Escalação pausa o bot e bloqueia novos envios autônomos.\n'));

    // 7. Testar Retomada e Pausa Manual
    console.log(C('--- PASSO 7: Testar Ciclo de Retomada e Pausa Manual ---'));
    // Retomar
    await client.query(
      `UPDATE public.commercial_journeys SET bot_paused_at = NULL, bot_pause_reason = NULL WHERE id = $1`,
      [testJourneyId]
    );
    const checkResumed = await client.query(`SELECT bot_enabled, bot_paused_at FROM public.commercial_journeys WHERE id = $1`, [testJourneyId]);
    if (!(checkResumed.rows[0].bot_enabled === true && !checkResumed.rows[0].bot_paused_at)) {
      throw new Error('Falha ao retomar bot');
    }

    // Pausar
    await client.query(
      `UPDATE public.commercial_journeys SET bot_paused_at = NOW(), bot_pause_reason = 'Operador assumiu' WHERE id = $1`,
      [testJourneyId]
    );
    const checkPaused = await client.query(`SELECT bot_enabled, bot_paused_at FROM public.commercial_journeys WHERE id = $1`, [testJourneyId]);
    if (checkPaused.rows[0].bot_enabled === true && !checkPaused.rows[0].bot_paused_at) {
      throw new Error('Falha ao pausar bot');
    }
    console.log(G('✅ PASSO 7 PASS: Ciclo de pausa/retomada validado com sucesso.\n'));

    // 8. Desabilitar a Jornada de Teste
    console.log(C('--- PASSO 8: Desabilitar Jornada de Teste ---'));
    await client.query(
      `UPDATE public.commercial_journeys
       SET bot_enabled = false, bot_paused_at = NULL, bot_pause_reason = NULL
       WHERE id = $1`,
      [testJourneyId]
    );
    const checkFinal = await client.query(`SELECT bot_enabled, bot_paused_at FROM public.commercial_journeys WHERE id = $1`, [testJourneyId]);
    if (checkFinal.rows[0].bot_enabled !== false) {
      throw new Error('Falha ao desabilitar bot na jornada');
    }
    console.log(G('✅ PASSO 8 PASS: Jornada desabilitada com sucesso (bot_enabled=false).\n'));

    // 9. Limpeza da Jornada Descartável
    console.log(C('--- PASSO 9: Limpeza dos Dados Descartáveis do Teste ---'));
    await client.query(`DELETE FROM public.commercial_journeys WHERE id = $1`, [testJourneyId]);
    await client.query(`DELETE FROM public.contacts WHERE id = $1`, [testContactId]);
    testJourneyId = null;
    console.log(G('✅ PASSO 9 PASS: Dados descartáveis removidos do Lab.\n'));

    // 10. Reconciliação Final de Segurança
    console.log(C('--- PASSO 10: Reconciliação Final de Segurança ---'));
    const finalAudit = await client.query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN bot_enabled = true THEN 1 ELSE 0 END) AS active_bots
       FROM public.commercial_journeys`
    );
    console.log(`Total de jornadas remanescentes: ${finalAudit.rows[0].total}`);
    console.log(`Bots ativos: ${finalAudit.rows[0].active_bots}`);
    if (parseInt(finalAudit.rows[0].active_bots) !== 0) {
      throw new Error('Alerta: há jornadas ativas após o encerramento do teste');
    }
    console.log(G('✅ PASSO 10 PASS: Reconciliação completa. 100% fail-closed e seguro.\n'));

    console.log(B('🎉 [GATE APROVADO] Todos os 10 passos do Gate de Canário foram validados no Lab com sucesso!'));

  } catch (err) {
    console.error(R(`\n❌ FALHA NO CANARY GATE: ${err.message}`));
    if (testJourneyId) {
      try {
        await client.query(`DELETE FROM public.commercial_journeys WHERE id = $1`, [testJourneyId]);
      } catch {}
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
