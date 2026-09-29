import { Pool } from "pg";
import crypto from "node:crypto";

async function runDemo() {
  const connectionString = process.env.DATABASE_URL || process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "FATAL CONFIG ERROR: DATABASE_URL or MIGRATION_DATABASE_URL environment variable is strictly required."
    );
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error(
      "FATAL CONFIG ERROR: JWT_SECRET environment variable is strictly required."
    );
  }

  const pool = new Pool({ connectionString });

  const havenWorkspaceId = process.env.WORKSPACE_ID || "22222222-2222-2222-2222-222222222222";
  const issuer = process.env.AUTH_ISSUER || "sos-sales-v3";
  const audience = process.env.AUTH_AUDIENCE || "sos-sales-api";

  const { JwtIdentityProvider } = await import("../packages/auth/src/index");
  const jwtProvider = new JwtIdentityProvider({
    type: "local-jwt",
    secret: jwtSecret,
    issuer,
    audience,
  });

  console.log("🎯 MCT CHAT SALES — F1 Radar Demo Orchestrator");
  console.log("=================================================");

  // 1. Provision / Ensure n8n integration user
  const n8nUserId = "33333333-3333-3333-3333-333333333333";
  await pool.query(
    `INSERT INTO users (id, email, name)
     VALUES ($1, 'n8n-radar@mct.br', 'n8n Radar Bot')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;`,
    [n8nUserId]
  );

  await pool.query(
    `INSERT INTO workspace_memberships (workspace_id, user_id, role)
     VALUES ($1, $2, 'integration_service')
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'integration_service';`,
    [havenWorkspaceId, n8nUserId]
  );
  console.log("✅ Usuário n8n-radar com role 'integration_service' provisionado no workspace.");

  // 2. Find thread and contact for target
  const threadRes = await pool.query(
    `SELECT t.id as thread_id, c.id as contact_id, c.name, c.phone_e164
     FROM commercial_threads t
     JOIN contacts c ON c.id = t.contact_id
     WHERE t.workspace_id = $1
     ORDER BY t.created_at ASC
     LIMIT 1;`,
    [havenWorkspaceId]
  );

  if (threadRes.rows.length === 0) {
    throw new Error("Nenhuma thread encontrada no workspace. Execute scripts de seed primeiro.");
  }

  const { thread_id, contact_id, name: contact_name } = threadRes.rows[0];
  console.log(`✅ Alvo identificado: Contato ID '${contact_id}' (Thread ID: '${thread_id}')`);

  // 3. Generate Tokens with JwtIdentityProvider (Zero token logging)
  const n8nToken = await jwtProvider.generateToken({
    id: n8nUserId,
    email: "n8n-radar@mct.br",
    role: "integration_service",
    workspaceId: havenWorkspaceId,
  });

  const ownerUserId = "08569a44-1988-49a0-8831-5fc3436a31cb";
  const ownerToken = await jwtProvider.generateToken({
    id: ownerUserId,
    email: "francisco@mct.br",
    role: "owner",
    workspaceId: havenWorkspaceId,
  });

  console.log("\n🔒 Identidades autenticadas:");
  console.log(`- Agente n8n: User ID ${n8nUserId} (role: integration_service)`);
  console.log(`- Operador: User ID ${ownerUserId} (role: owner)`);
  console.log("- Tokens emitidos com sucesso (impressão suprimida por política de segurança).");

  const apiUrl = process.env.API_URL || "http://localhost:4400";

  // 4. n8n reads Candidates
  console.log("\n📡 Passo 1: n8n consulta snapshot de candidatos via API Fastify...");
  const candRes = await fetch(`${apiUrl}/v1/workspaces/${havenWorkspaceId}/integrations/candidates`, {
    headers: { Authorization: `Bearer ${n8nToken}` },
  });
  const candData = await candRes.json();
  console.log(`-> Status HTTP: ${candRes.status}, Total candidatos governados: ${candData.total}`);

  // 5. n8n posts Suggestion
  console.log("\n💡 Passo 2: n8n cria sugestão de oportunidade (F1.1 Radar)...");
  const idempotencyKey = `n8n-radar-${thread_id}-followup-v1`;
  const sugRes = await fetch(`${apiUrl}/v1/workspaces/${havenWorkspaceId}/integrations/suggestions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${n8nToken}`,
    },
    body: JSON.stringify({
      idempotencyKey,
      source: "n8n",
      threadId: thread_id,
      contactId: contact_id,
      suggestionType: "follow_up",
      title: "Oportunidade: Confirmar atendimento agendado",
      body: `Cliente solicitou horário. Sugerimos confirmar o encaixe com a equipe antes que a vaga seja ocupada.`,
      draftMessage: `Olá ${contact_name || ""}! Verificamos nossa agenda e temos horário confirmado. Posso reservar seu atendimento? 🌺`,
      priority: "high",
    }),
  });

  const sugData = await sugRes.json();
  console.log(`-> Status HTTP: ${sugRes.status}`);
  console.log("-> Sugestão registrada:", {
    id: sugData.id,
    title: sugData.title,
    priority: sugData.priority,
    status: sugData.status,
    created: sugData.created,
  });

  // 6. Check pending count from operator view
  console.log("\n📊 Passo 3: Operador consulta contagem de pendências do Radar...");
  const countRes = await fetch(`${apiUrl}/v1/workspaces/${havenWorkspaceId}/integrations/suggestions/count`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  const countData = await countRes.json();
  console.log("-> Pending Count ativo:", countData);

  console.log("\n🎉 F1.1 Radar executado com sucesso e integrado ao banco de dados!");

  await pool.end();

  return { suggestionId: sugData.id, threadId: thread_id };
}

runDemo().catch((err) => {
  console.error("❌ Erro no demo:", err.message);
  process.exit(1);
});
