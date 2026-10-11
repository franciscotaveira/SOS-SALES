import "dotenv/config";
import { Pool } from "pg";
import crypto from "node:crypto";
import { encryptPayload, parseKeyringFromEnv } from "@sos-sales/auth";

/**
 * Seed Script para WABA e Catálogo Haven
 * Suporta modo Lab sintético (default seguro) ou credenciais fornecidas via variáveis de ambiente.
 * NUNCA embutir credenciais literais no código.
 */
async function seedHavenWaba() {
  const connectionString =
    process.env.DATABASE_URL ||
    "postgresql://sos_app_user:sos_app_secret_2026@localhost:55440/sos_sales_v3?sslmode=disable";

  console.log("🌱 Conectando ao Postgres V3 para seed Haven WABA...");
  const pool = new Pool({ connectionString });

  try {
    // 1. Obter ou criar Organização Haven
    const orgRes = await pool.query(
      `INSERT INTO organizations (name, slug)
       VALUES ('Haven Odontologia Integrada', 'haven-odonto')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name, slug;`
    );
    const org = orgRes.rows[0];
    console.log(`✓ Organização garantida: ${org.name} (${org.id})`);

    // 2. Obter ou criar Workspace Haven
    const havenWorkspaceId = "22222222-2222-2222-2222-222222222222";
    const wsRes = await pool.query(
      `INSERT INTO workspaces (id, organization_id, name, slug)
       VALUES ($1, $2, 'Haven Clínica Chapecó', 'haven-chapeco')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name, slug;`,
      [havenWorkspaceId, org.id]
    );

    // Ajustar RLS session context
    await pool.query(
      `SELECT set_config('app.current_workspace_id', $1, false);`,
      [havenWorkspaceId]
    );
    await pool.query(
      `SELECT set_config('app.current_user_role', 'owner', false);`
    );

    const workspace = wsRes.rows[0];
    console.log(`✓ Workspace garantido: ${workspace.name} (${workspace.id})`);

    // 3. Usuários e Membros:
    // NOTA DE SEGURANÇA: Não cadastrar usuários ou operadores por este script.
    // O cadastro de operadores deve ser feito exclusivamente via 'scripts/admin-upsert-member.ts'
    // utilizando o subject UUID previamente autenticado no Supabase Auth.
    console.log("ℹ️  Provisionamento de operadores delegado a scripts/admin-upsert-member.ts");

    // 4. Credenciais WABA — Verificação Fail-Closed e Suporte a Modo Lab
    const isLab = process.env.NODE_ENV !== "production" || process.env.ENABLE_LAB_SYNTHETIC === "true";
    
    // Obter credenciais estritamente de variáveis de ambiente
    const metaAccessToken = process.env.HAVEN_META_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    const wabaId = process.env.HAVEN_WABA_ID || process.env.META_WABA_ID;
    const phoneNumberId = process.env.HAVEN_PHONE_NUMBER_ID || process.env.META_PHONE_NUMBER_ID;
    const appSecret = process.env.HAVEN_APP_SECRET || process.env.META_APP_SECRET;

    let rawWabaCredentials: Record<string, string>;

    if (metaAccessToken && wabaId && phoneNumberId) {
      console.log("🔒 Utilizando credenciais Meta WABA fornecidas via variáveis de ambiente.");
      rawWabaCredentials = {
        access_token: metaAccessToken,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        app_secret: appSecret || "unspecified",
      };
    } else if (isLab) {
      console.log("🧪 Variáveis de credencial Meta não fornecidas. Utilizando identificadores sintéticos de laboratório.");
      rawWabaCredentials = {
        access_token: "synthetic_lab_token_haven_waba_preview",
        waba_id: "synthetic_lab_waba_id_81829182",
        phone_number_id: "synthetic_lab_phone_id_992145",
        app_secret: "synthetic_lab_app_secret",
      };
    } else {
      throw new Error(
        "FAIL-CLOSED: Em ambiente de produção, as variáveis HAVEN_META_ACCESS_TOKEN, HAVEN_WABA_ID e HAVEN_PHONE_NUMBER_ID são estritamente obrigatórias."
      );
    }

    const masterKey = process.env.APP_MASTER_KEY;
    if (!masterKey) {
      throw new Error("FAIL-CLOSED: APP_MASTER_KEY não configurada no ambiente. Impossível encriptar credenciais.");
    }

    const keyringOrKey = parseKeyringFromEnv(masterKey);
    const enc = encryptPayload(JSON.stringify(rawWabaCredentials), keyringOrKey);

    const credRes = await pool.query(
      `INSERT INTO workspace_credentials (
        workspace_id,
        category,
        provider,
        encrypted_payload,
        key_version,
        metadata
      )
      VALUES ($1, 'messaging', 'meta_waba', $2, $3, $4)
      RETURNING id;`,
      [
        workspace.id,
        enc.encryptedData,
        enc.keyVersion || "v1",
        JSON.stringify({
          phone_number: "+5549999123456",
          display_phone_number: "+55 (49) 99912-3456",
          verified_name: "Haven Odontologia Chapecó",
          is_synthetic: isLab && !metaAccessToken,
        }),
      ]
    );
    const credentialId = credRes.rows[0].id;
    console.log(`✓ Credencial WABA criptografada gravada (id: ${credentialId})`);

    // 5. Canal WABA
    const rawEndpointToken = "haven_meta_waba_endpoint_token_2026";
    const endpointTokenHash = crypto.createHash("sha256").update(rawEndpointToken).digest("hex");
    const rawVerifyToken = process.env.HAVEN_VERIFY_TOKEN || "haven_verify_token_lab_2026";
    const verifyTokenHash = crypto.createHash("sha256").update(rawVerifyToken).digest("hex");

    const channelRes = await pool.query(
      `INSERT INTO channels (
        workspace_id,
        credential_id,
        provider,
        identifier,
        name,
        endpoint_token_hash,
        verify_token_hash,
        is_active,
        metadata
      )
      VALUES ($1, $2, 'meta_waba', 'waba:5549999123456', 'WhatsApp Oficial Haven', $3, $4, true, $5)
      ON CONFLICT (workspace_id, provider, identifier) 
      DO UPDATE SET credential_id = EXCLUDED.credential_id, is_active = true
      RETURNING id, name;`,
      [
        workspace.id,
        credentialId,
        endpointTokenHash,
        verifyTokenHash,
        JSON.stringify({
          webhook_url: `/webhooks/v1/meta-waba/${rawEndpointToken}`,
          verify_token: rawVerifyToken,
        }),
      ]
    );
    const channel = channelRes.rows[0];
    console.log(`✓ Canal WABA associado: ${channel.name} (${channel.id})`);

    // 6. Catálogo de Serviços Haven
    const services = [
      {
        title: "Harmonização Orofacial e Facetas",
        description: "Protocolo completo de alinhamento estético dental e harmonia facial com lentes cerâmicas de contato.",
        priceInCents: 450000,
        retailerId: "haven_hof_facetas_01",
        category: "Estética Avançada",
      },
      {
        title: "Implante Dentário Guiado por Computador",
        description: "Cirurgia sem cortes invasivos guiada por tomografia 3D e carga rápida com anestesia assistida.",
        priceInCents: 320000,
        retailerId: "haven_implante_guiado_02",
        category: "Reabilitação Oral",
      },
      {
        title: "Checkup Preventivo e Profilaxia Ultrassônica",
        description: "Avaliação minuciosa com câmera intraoral HD, raspagem com ultrassom e aplicação de flúor bioativo.",
        priceInCents: 38000,
        retailerId: "haven_checkup_profilaxia_03",
        category: "Prevenção",
      },
      {
        title: "Clareamento Dental Laser Premium",
        description: "Tratamento de clareamento a laser em consultório com barreira gengival fotoativada e dessensibilização.",
        priceInCents: 98000,
        retailerId: "haven_clareamento_laser_04",
        category: "Estética",
      },
    ];

    for (const s of services) {
      await pool.query(
        `INSERT INTO products (
          workspace_id,
          title,
          description,
          price_in_cents,
          retailer_id,
          category,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'active')
        ON CONFLICT (workspace_id, retailer_id)
        DO UPDATE SET title = EXCLUDED.title, price_in_cents = EXCLUDED.price_in_cents;`,
        [workspace.id, s.title, s.description, s.priceInCents, s.retailerId, s.category]
      );
    }
    console.log(`✓ ${services.length} Serviços e Produtos cadastrados no Catálogo Oficial.`);

    // 7. Templates Oficiais WABA
    const templates = [
      {
        name: "haven_confirmacao_consulta_v1",
        category: "UTILITY",
        language: "pt_BR",
        status: "APPROVED",
        bodyText: "Olá {{1}}! Confirmamos sua consulta na Haven Clínica Odontológica para o dia {{2}} às {{3}}. Para confirmar sua presença, responda 1. Para reagendar, responda 2.",
        headerType: "NONE",
      },
      {
        name: "haven_envio_cobranca_pix_v1",
        category: "UTILITY",
        language: "pt_BR",
        status: "APPROVED",
        bodyText: "Olá {{1}}, segue o link e chave Pix para confirmação do seu procedimento *{{2}}* no valor de {{3}}. O código é válido por 30 minutos.",
        headerType: "TEXT",
      },
      {
        name: "haven_lembrete_procedimento_v1",
        category: "UTILITY",
        language: "pt_BR",
        status: "APPROVED",
        bodyText: "Lembrete Haven: Seu procedimento de {{1}} é amanhã às {{2}}. Recomendamos chegar com 10 minutos de antecedência.",
        headerType: "NONE",
      },
    ];

    for (const t of templates) {
      await pool.query(
        `INSERT INTO waba_templates (
          workspace_id,
          name,
          category,
          language,
          status,
          components
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (workspace_id, name, language)
        DO UPDATE SET status = EXCLUDED.status, components = EXCLUDED.components;`,
        [
          workspace.id,
          t.name,
          t.category,
          t.language,
          t.status,
          JSON.stringify([
            { type: "BODY", text: t.bodyText },
            ...(t.headerType !== "NONE" ? [{ type: "HEADER", format: t.headerType, text: "Haven Odontologia" }] : []),
          ]),
        ]
      );
    }
    console.log(`✓ ${templates.length} Templates WABA aprovados cadastrados.`);

    // 8. Clientes Demo com Atribuição Meta Ads
    const demoClients = [
      {
        name: "Mariana Siqueira",
        phone: "+5549988221100",
        adCampaign: "Campanha Implantes Chapecó Q3",
        adId: "ad_fb_implantes_2026_01",
        message: "Olá! Vi o anúncio de vocês no Instagram sobre lentes dentais e gostaria de saber valores e disponibilidade para avaliação.",
      },
      {
        name: "Rodrigo Mendonça",
        phone: "+5549999334455",
        adCampaign: "Campanha Clareamento Express",
        adId: "ad_fb_clareamento_2026_04",
        message: "Boa tarde, tudo bem? Gostaria de saber como funciona o clareamento a laser.",
      },
    ];

    for (const client of demoClients) {
      const contactRes = await pool.query(
        `INSERT INTO contacts (workspace_id, phone_e164, name, metadata)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (workspace_id, phone_e164) DO UPDATE SET name = EXCLUDED.name
         RETURNING id;`,
        [workspace.id, client.phone, client.name, JSON.stringify({ ad_campaign: client.adCampaign, ad_id: client.adId })]
      );
      const contactId = contactRes.rows[0].id;

      const threadRes = await pool.query(
        `INSERT INTO threads (workspace_id, channel_id, contact_id, status, assigned_to_user_id)
         VALUES ($1, $2, $3, 'open', $4)
         RETURNING id;`,
        [workspace.id, channel.id, contactId, user.id]
      );
      const threadId = threadRes.rows[0].id;

      await pool.query(
        `INSERT INTO messages (
          workspace_id,
          channel_id,
          thread_id,
          direction,
          sender_e164,
          recipient_e164,
          body,
          status
        )
        VALUES ($1, $2, $3, 'inbound', $4, '+5549999123456', $5, 'delivered');`,
        [workspace.id, channel.id, threadId, client.phone, client.message]
      );
    }
    console.log(`✓ ${demoClients.length} Clientes e Threads com atribuição Meta Ads criados.`);

    console.log("\n=======================================================");
    console.log("✨ SEED HAVEN WABA CONCLUÍDO COM SUCESSO!");
    console.log(`Workspace ID: ${workspace.id}`);
    console.log(`Canal ID:    ${channel.id}`);
    console.log("=======================================================\n");
  } finally {
    await pool.end();
  }
}

seedHavenWaba().catch((err) => {
  console.error("❌ Erro ao rodar seed Haven WABA:", err);
  process.exit(1);
});
