import "dotenv/config";
import { Pool } from "pg";
import crypto from "node:crypto";
import { SignJWT } from "@sos-sales/auth";

async function runSeed() {
  const connectionString =
    process.env.MIGRATION_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgresql://sos_migration_owner:sos_migration_secret_2026@localhost:55440/sos_sales_v3?sslmode=disable";

    console.log("\n🌱 SOS Sales V3 — Conectando ao PostgreSQL para seed de homologação...");
    const pool = new Pool({ connectionString });

  try {
    // 1. Organização
    const orgSlug = "mct-soberana";
    const orgRes = await pool.query(
      `INSERT INTO organizations (name, slug)
       VALUES ('MCT LTDA', $1)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name, slug;`,
      [orgSlug]
    );
    const org = orgRes.rows[0];

    // 2. Workspace
    const wsSlug = "matriz-chapeco";
    const wsRes = await pool.query(
      `INSERT INTO workspaces (organization_id, name, slug, timezone, currency, is_active)
       VALUES ($1, 'Chapecó Matriz', $2, 'America/Sao_Paulo', 'BRL', true)
       ON CONFLICT (slug) DO UPDATE SET is_active = true
       RETURNING id, name, slug;`,
      [org.id, wsSlug]
    );
    const workspace = wsRes.rows[0];

    // 3. Usuário Operador / Proprietário
    const userEmail = "francisco@mct.br";
    const userRes = await pool.query(
      `INSERT INTO users (email, name)
       VALUES ($1, 'Francisco Rios')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, email, name;`,
      [userEmail]
    );
    const user = userRes.rows[0];

    // 4. Membership (Papel: owner)
    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner';`,
      [workspace.id, user.id]
    );

    // 5. Instância de Canal WhatsApp (WAHA)
    const rawEndpointToken = "waha_endpoint_token_local_dev_2026";
    const tokenHash = crypto.createHash("sha256").update(rawEndpointToken).digest("hex");

    const channelRes = await pool.query(
      `INSERT INTO channel_instances (
         workspace_id, provider, display_name, phone_number_e164, endpoint_token_hash, is_active
       ) VALUES ($1, 'waha', 'WhatsApp Comercial Chapecó', '+5549999990000', $2, true)
       ON CONFLICT (endpoint_token_hash) DO UPDATE SET is_active = true
       RETURNING id, display_name, provider;`,
      [workspace.id, tokenHash]
    );
    const channel = channelRes.rows[0];

    // 6. Contatos Reais para Teste
    const contactsData = [
      {
        name: "Carlos Eduardo Silva",
        phone: "+5511991234567",
        message: "Olá! Vi o anúncio na Meta e gostaria de entender o valor da implantação comercial.",
      },
      {
        name: "Dra. Mariana Costa",
        phone: "+5549987654321",
        message: "Boa tarde! Vocês atendem empresas de serviços com múltiplos operadores no WhatsApp?",
      },
    ];

    for (const c of contactsData) {
      const contactRes = await pool.query(
        `INSERT INTO contacts (workspace_id, phone_e164, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (workspace_id, phone_e164) DO UPDATE SET name = EXCLUDED.name
         RETURNING id;`,
        [workspace.id, c.phone, c.name]
      );
      const contactId = contactRes.rows[0].id;

      const threadRes = await pool.query(
        `INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (workspace_id, channel_instance_id, contact_id) DO UPDATE SET updated_at = now()
         RETURNING id;`,
        [workspace.id, channel.id, contactId]
      );
      const threadId = threadRes.rows[0].id;

      // Mensagem Inbound
      await pool.query(
        `INSERT INTO messages (
           workspace_id, channel_instance_id, thread_id, provider, direction,
           sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
         ) VALUES ($1, $2, $3, 'waha', 'inbound', $4, '+5549999990000', 'text', $5, 'delivered', 20)
         ON CONFLICT DO NOTHING;`,
        [workspace.id, channel.id, threadId, c.phone, c.message]
      );

      // Atualiza last_message_at
      await pool.query(
        `UPDATE commercial_threads SET last_message_at = now() WHERE id = $1;`,
        [threadId]
      );

      // Oportunidade Comercial Vinculada (CRM Journey)
      await pool.query(
        `INSERT INTO commercial_journeys (
           workspace_id, contact_id, thread_id, assigned_user_id,
           title, stage, status, attribution_source,
           campaign_id, ad_id, ctwa_clid, estimated_value_cents
         ) VALUES ($1, $2, $3, $4, $5, 'proposal', 'open', 'ctwa_meta', $6, $7, $8, $9)
         ON CONFLICT DO NOTHING;`,
        [
          workspace.id,
          contactId,
          threadId,
          user.id,
          `Implantação Comercial — ${c.name}`,
          "cmp_meta_growth_2026",
          "ad_meta_lead_gen_01",
          `ctwa_clid_demo_${c.phone.slice(-4)}`,
          150000,
        ]
      );
    }

    // 7. Gerar Token JWT Assinado para Login Imediato no Cockpit
    const jwtSecret =
      process.env.JWT_SECRET || "replace_with_a_secure_random_key_minimum_32_characters_for_local_env";
    const issuer = process.env.AUTH_ISSUER || "sos-sales-v3";
    const audience = process.env.AUTH_AUDIENCE || "sos-sales-api";

    const secretKey = new TextEncoder().encode(jwtSecret);
    const token = await new SignJWT({
      sub: user.id,
      email: user.email,
      role: "authenticated",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setExpirationTime("24h")
      .sign(secretKey);

    console.log("\n================================================================================");
    console.log(" 🎉 SEED LOCAL HOMOLOGADO COM SUCESSO!");
    console.log("================================================================================");
    console.log(`Organização:  ${org.name} (${org.slug})`);
    console.log(`Workspace:    ${workspace.name} (ID: ${workspace.id})`);
    console.log(`Usuário:      ${user.name} <${user.email}> (Papel: owner)`);
    console.log(`Canal:        ${channel.display_name} (${channel.provider})`);
    console.log(`Webhook Ingress: http://localhost:4400/v1/webhooks/whatsapp/${rawEndpointToken}`);
    console.log("--------------------------------------------------------------------------------");
    console.log("🔑 SEU TOKEN JWT DE ACESSO (Válido por 24h):");
    console.log(`\n${token}\n`);
    console.log("--------------------------------------------------------------------------------");
    console.log("COMO TESTAR AGORA:");
    console.log("1. Inicie a API e a Web:   pnpm dev");
    console.log("2. Abra o Cockpit:         http://localhost:3400");
    console.log("3. Na barra superior (DevLabToolbar), cole o token acima.");
    console.log("4. As 2 conversas aparecerão na fila com mensagens reais!");
    console.log("5. Digite uma resposta no composer e clique em Enviar!");
    console.log("================================================================================\n");
  } catch (err) {
    console.error("❌ Erro ao executar seed local:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runSeed();
