import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  createTestDatabasePools,
  withTenantTransaction,
  createCommercialProposal,
  getCommercialProposalById,
  listCommercialProposalsForThread,
  updateCommercialProposalStatus,
  createCommercialJourney,
  recordCommercialOutcome,
  createPixCharge,
  confirmPixChargeManual,
  getPixChargeById,
} from "../index";

describe("Commercial Proposals & Commercial Flow (M6)", () => {
  const { ownerPool, appPool } = createTestDatabasePools();

  let workspaceAId: string;
  let workspaceBId: string;
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  let contactAId: string;
  let channelInstanceAId: string;
  let threadAId: string;

  let productAId: string;
  let productBId: string;

  beforeAll(async () => {
    // 0. Ensure migration 021 is applied to the test database
    const migrationPath = path.resolve(__dirname, "../../migrations/021_commercial_proposals.sql");
    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, "utf-8");
      await ownerPool.query(sql);
    }

    // 1. Seed Org and Workspaces
    const orgRes = await ownerPool.query(
      `INSERT INTO public.organizations (name, slug)
       VALUES ('Org Proposals', $1) RETURNING id;`,
      [`org-prop-${Date.now()}`]
    );
    const orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(
      `INSERT INTO public.workspaces (
        organization_id, name, slug, is_active,
        default_pix_key, default_pix_merchant_name, default_pix_merchant_city
      ) VALUES ($1, 'Workspace Proposals A', $2, true, 'pix@mct.br', 'MCT PROPOSTAS', 'CHAPECO') RETURNING id;`,
      [orgId, `ws-prop-a-${Date.now()}`]
    );
    workspaceAId = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(
      `INSERT INTO public.workspaces (organization_id, name, slug, is_active)
       VALUES ($1, 'Workspace Proposals B', $2, true) RETURNING id;`,
      [orgId, `ws-prop-b-${Date.now()}`]
    );
    workspaceBId = wsBRes.rows[0].id;

    // 2. Seed Users & Memberships
    await ownerPool.query(
      `INSERT INTO public.users (id, email, name)
       VALUES ($1, $2, 'Operator A'), ($3, $4, 'Operator B')
       ON CONFLICT (id) DO NOTHING;`,
      [userAId, `op-prop-a-${Date.now()}@mct.br`, userBId, `op-prop-b-${Date.now()}@mct.br`]
    );

    await ownerPool.query(
      `INSERT INTO public.workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'operator'), ($3, $4, 'operator')
       ON CONFLICT DO NOTHING;`,
      [workspaceAId, userAId, workspaceBId, userBId]
    );

    // 3. Seed Channel, Contact, Thread in Workspace A
    const tokenA = crypto.createHash("sha256").update(`token-a-${Date.now()}`).digest("hex");
    const chanARes = await ownerPool.query(
      `INSERT INTO public.channel_instances (workspace_id, provider, display_name, endpoint_token_hash)
       VALUES ($1, 'meta_waba', 'WhatsApp Principal', $2) RETURNING id;`,
      [workspaceAId, tokenA]
    );
    channelInstanceAId = chanARes.rows[0].id;

    const contARes = await ownerPool.query(
      `INSERT INTO public.contacts (workspace_id, phone_e164, name)
       VALUES ($1, '+5549999990001', 'Lead Proposta A') RETURNING id;`,
      [workspaceAId]
    );
    contactAId = contARes.rows[0].id;

    const threadARes = await ownerPool.query(
      `INSERT INTO public.commercial_threads (workspace_id, channel_instance_id, contact_id, status, last_message_at)
       VALUES ($1, $2, $3, 'active', now()) RETURNING id;`,
      [workspaceAId, channelInstanceAId, contactAId]
    );
    threadAId = threadARes.rows[0].id;

    // 4. Products in Workspace A
    await withTenantTransaction(workspaceAId, async (client) => {
      const prodARes = await client.query(
        `INSERT INTO public.products (
          workspace_id, retailer_id, title, description, price_cents, category, image_url
        ) VALUES (
          $1, 'SKU-SERVICO-01', 'Consultoria Comercial V3', 'Implementação SOS Sales', 50000, 'Serviços', 'https://mct.br/img1.png'
        ) ON CONFLICT (workspace_id, retailer_id) DO UPDATE SET price_cents = 50000
        RETURNING id;`,
        [workspaceAId]
      );
      productAId = prodARes.rows[0].id;

      const prodBRes = await client.query(
        `INSERT INTO public.products (
          workspace_id, retailer_id, title, description, price_cents, category, image_url
        ) VALUES (
          $1, 'SKU-SETUP-01', 'Taxa de Setup Inicial', 'Configuração de WhatsApp e WABA', 15000, 'Serviços', 'https://mct.br/img2.png'
        ) ON CONFLICT (workspace_id, retailer_id) DO UPDATE SET price_cents = 15000
        RETURNING id;`,
        [workspaceAId]
      );
      productBId = prodBRes.rows[0].id;
    });
  });

  afterAll(async () => {
    await ownerPool.end();
    await appPool.end();
  });

  it("CP-01: should create commercial proposal with immutable snapshot of items and total_cents", async () => {
    const proposal = await withTenantTransaction(workspaceAId, async (client) => {
      return createCommercialProposal(client, {
        workspaceId: workspaceAId,
        threadId: threadAId,
        contactId: contactAId,
        title: "Proposta Comercial SOS Sales V3",
        items: [
          { productId: productAId, quantity: 1 },
          { productId: productBId, quantity: 2 },
        ],
        conditions: "Pagamento 50% entrada via Pix e 50% após homologação",
        userId: userAId,
      });
    });

    expect(proposal.id).toBeDefined();
    expect(proposal.status).toBe("draft");
    expect(proposal.title).toBe("Proposta Comercial SOS Sales V3");
    expect(proposal.items.length).toBe(2);

    // Item 1: Consultoria Comercial V3 (50000 * 1 = 50000)
    expect(proposal.items[0]!.title).toBe("Consultoria Comercial V3");
    expect(proposal.items[0]!.unitPriceCents).toBe(50000);
    expect(proposal.items[0]!.quantity).toBe(1);
    expect(proposal.items[0]!.subtotalCents).toBe(50000);

    // Item 2: Taxa de Setup Inicial (15000 * 2 = 30000)
    expect(proposal.items[1]!.title).toBe("Taxa de Setup Inicial");
    expect(proposal.items[1]!.unitPriceCents).toBe(15000);
    expect(proposal.items[1]!.quantity).toBe(2);
    expect(proposal.items[1]!.subtotalCents).toBe(30000);

    // Total: 50000 + 30000 = 80000
    expect(proposal.total_cents).toBe(80000);

    // Verify listCommercialProposalsForThread under tenant scope
    const list = await withTenantTransaction(workspaceAId, async (client) => {
      return listCommercialProposalsForThread(client, workspaceAId, threadAId);
    });
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((p) => p.id === proposal.id)).toBe(true);
  });

  it("CP-02: should preserve snapshot immutability when catalog product price/title is modified", async () => {
    let proposalId: string;

    // 1. Create proposal
    await withTenantTransaction(workspaceAId, async (client) => {
      const p = await createCommercialProposal(client, {
        workspaceId: workspaceAId,
        threadId: threadAId,
        contactId: contactAId,
        title: "Proposta Imutabilidade",
        items: [{ productId: productAId, quantity: 2 }], // 50000 * 2 = 100000
      });
      proposalId = p.id;
    });

    // 2. Modify product in catalog: raise price to 99999 and change title
    await withTenantTransaction(workspaceAId, async (client) => {
      await client.query(
        `UPDATE public.products
         SET title = 'Consultoria Comercial V4 - PREÇO NOVO',
             price_cents = 99999
         WHERE workspace_id = $1 AND id = $2;`,
        [workspaceAId, productAId]
      );
    });

    // 3. Retrieve proposal and verify items are completely unaffected
    const proposal = await withTenantTransaction(workspaceAId, async (client) => {
      return getCommercialProposalById(client, workspaceAId, proposalId);
    });

    expect(proposal).not.toBeNull();
    expect(proposal!.items[0]!.title).toBe("Consultoria Comercial V3");
    expect(proposal!.items[0]!.unitPriceCents).toBe(50000);
    expect(proposal!.items[0]!.subtotalCents).toBe(100000);
    expect(proposal!.total_cents).toBe(100000);
  });

  it("CP-03: should preserve proposal when catalog product is deleted or archived", async () => {
    let proposalId: string;
    let ephemeralProductId: string;

    await withTenantTransaction(workspaceAId, async (client) => {
      const prodRes = await client.query(
        `INSERT INTO public.products (
          workspace_id, retailer_id, title, description, price_cents, category, image_url
        ) VALUES (
          $1, 'SKU-EPHEMERAL', 'Produto Temporário', 'Desc', 25000, 'Geral', 'https://mct.br/img.png'
        ) RETURNING id;`,
        [workspaceAId]
      );
      ephemeralProductId = prodRes.rows[0].id;

      const p = await createCommercialProposal(client, {
        workspaceId: workspaceAId,
        threadId: threadAId,
        contactId: contactAId,
        title: "Proposta Produto Efêmero",
        items: [{ productId: ephemeralProductId, quantity: 1 }],
      });
      proposalId = p.id;

      // Delete the ephemeral product from catalog
      await client.query(`DELETE FROM public.products WHERE workspace_id = $1 AND id = $2;`, [
        workspaceAId,
        ephemeralProductId,
      ]);
    });

    // Verify proposal remains completely valid and readable
    const proposal = await withTenantTransaction(workspaceAId, async (client) => {
      return getCommercialProposalById(client, workspaceAId, proposalId);
    });

    expect(proposal).not.toBeNull();
    expect(proposal!.items[0]!.title).toBe("Produto Temporário");
    expect(proposal!.items[0]!.subtotalCents).toBe(25000);
  });

  it("CP-04: should enforce strict tenant isolation (Workspace B cannot access Workspace A proposals)", async () => {
    let proposalAId: string;

    await withTenantTransaction(workspaceAId, async (client) => {
      const p = await createCommercialProposal(client, {
        workspaceId: workspaceAId,
        threadId: threadAId,
        contactId: contactAId,
        title: "Proposta Workspace A Secreta",
        items: [{ title: "Item Custom", unitPriceCents: 12000, quantity: 1 }],
      });
      proposalAId = p.id;
    });

    // Attempt to access from Workspace B
    const proposalFromB = await withTenantTransaction(workspaceBId, async (client) => {
      return getCommercialProposalById(client, workspaceBId, proposalAId);
    });

    expect(proposalFromB).toBeNull();
  });

  it("CP-05: should transition proposal status lifecycle and advance linked journey stage", async () => {
    let journeyId: string;
    let proposalId: string;

    await withTenantTransaction(workspaceAId, async (client) => {
      const journey = await createCommercialJourney(client, workspaceAId, {
        contactId: contactAId,
        threadId: threadAId,
        title: "Jornada para Proposta",
        stage: "lead",
      });
      journeyId = journey.id;

      const proposal = await createCommercialProposal(client, {
        workspaceId: workspaceAId,
        threadId: threadAId,
        contactId: contactAId,
        journeyId,
        title: "Proposta Ciclo de Vida",
        items: [{ title: "Plano Anual", unitPriceCents: 120000, quantity: 1 }],
      });
      proposalId = proposal.id;
    });

    // 1. Send proposal
    const sent = await withTenantTransaction(workspaceAId, async (client) => {
      return updateCommercialProposalStatus(client, workspaceAId, proposalId, { status: "sent" });
    });
    expect(sent.status).toBe("sent");
    expect(sent.sent_at).not.toBeNull();

    // 2. Accept proposal
    const accepted = await withTenantTransaction(workspaceAId, async (client) => {
      return updateCommercialProposalStatus(client, workspaceAId, proposalId, { status: "accepted" });
    });
    expect(accepted.status).toBe("accepted");
    expect(accepted.accepted_at).not.toBeNull();

    // Verify linked journey advanced stage to proposal
    await withTenantTransaction(workspaceAId, async (client) => {
      const jRes = await client.query(`SELECT stage FROM public.commercial_journeys WHERE id = $1;`, [journeyId]);
      expect(jRes.rows[0].stage).toBe("proposal");
    });
  });

  it("CP-06: should reject invalid backwards transition on accepted proposal", async () => {
    let proposalId: string;

    await withTenantTransaction(workspaceAId, async (client) => {
      const proposal = await createCommercialProposal(client, {
        workspaceId: workspaceAId,
        threadId: threadAId,
        contactId: contactAId,
        title: "Proposta Aceita Imutável",
        items: [{ title: "Serviço", unitPriceCents: 5000, quantity: 1 }],
      });
      proposalId = proposal.id;

      await updateCommercialProposalStatus(client, workspaceAId, proposalId, { status: "accepted" });
    });

    await expect(
      withTenantTransaction(workspaceAId, async (client) => {
        return updateCommercialProposalStatus(client, workspaceAId, proposalId, { status: "draft" });
      })
    ).rejects.toThrow(/INVALID_TRANSITION/);
  });

  it("CP-07: should bind Pix charge to commercial proposal with matching total", async () => {
    let proposalId: string;

    await withTenantTransaction(workspaceAId, async (client) => {
      const proposal = await createCommercialProposal(client, {
        workspaceId: workspaceAId,
        threadId: threadAId,
        contactId: contactAId,
        title: "Proposta com Pix",
        items: [{ title: "Licença", unitPriceCents: 45000, quantity: 1 }],
      });
      proposalId = proposal.id;

      // Create Pix charge linked to proposal
      const charge = await createPixCharge(client, {
        workspaceId: workspaceAId,
        threadId: threadAId,
        contactId: contactAId,
        title: "Cobrança Proposta Licença",
        amountCents: proposal.total_cents,
      });

      // Update proposal_id on charge
      await client.query(
        `UPDATE public.pix_charges SET proposal_id = $1 WHERE workspace_id = $2 AND id = $3;`,
        [proposalId, workspaceAId, charge.id]
      );

      const check = await getPixChargeById(client, workspaceAId, charge.id);
      expect(check?.amount_cents).toBe(45000);
      expect(check?.status).toBe("PENDING");
      expect(check?.verification_method).toBe("UNVERIFIED");
    });
  });

  it("CP-08: should enforce actor and reason validation on commercial outcome and support idempotent replay", async () => {
    let journeyId: string;

    await withTenantTransaction(workspaceAId, async (client) => {
      const journey = await createCommercialJourney(client, workspaceAId, {
        contactId: contactAId,
        threadId: threadAId,
        title: "Jornada Teste Outcome",
      });
      journeyId = journey.id;
    });

    // 1. Missing actor fails closed
    await expect(
      withTenantTransaction(workspaceAId, async (client) => {
        return recordCommercialOutcome(client, workspaceAId, {
          journeyId,
          status: "won",
          valueCents: 30000,
          registeredByUserId: "",
        });
      })
    ).rejects.toThrow(/ACTOR_REQUIRED/);

    // 2. Lost outcome without reason fails closed
    await expect(
      withTenantTransaction(workspaceAId, async (client) => {
        return recordCommercialOutcome(client, workspaceAId, {
          journeyId,
          status: "lost",
          valueCents: 0,
          reason: "  ",
          registeredByUserId: userAId,
        });
      })
    ).rejects.toThrow(/REASON_REQUIRED/);

    // 3. Valid WON outcome succeeds and enqueues CAPI event
    const outcome1 = await withTenantTransaction(workspaceAId, async (client) => {
      return recordCommercialOutcome(client, workspaceAId, {
        journeyId,
        status: "won",
        valueCents: 35000,
        registeredByUserId: userAId,
      });
    });

    expect(outcome1.outcome.status).toBe("won");
    expect(outcome1.conversionEvent).not.toBeNull();
    expect(outcome1.conversionEvent!.event_name).toBe("PurchaseCompleted");

    // 4. Repeated identical outcome returns same record without duplicate CAPI enqueue
    const outcome2 = await withTenantTransaction(workspaceAId, async (client) => {
      return recordCommercialOutcome(client, workspaceAId, {
        journeyId,
        status: "won",
        valueCents: 35000,
        registeredByUserId: userAId,
      });
    });

    expect(outcome2.outcome.id).toBe(outcome1.outcome.id);
    expect(outcome2.conversionEvent?.id).toBe(outcome1.conversionEvent?.id);
  });

  it("CP-09: should verify Pix cashier confirmation strictly updates financial state without implicit CAPI or journey mutation", async () => {
    let chargeId: string;

    await withTenantTransaction(workspaceAId, async (client) => {
      const charge = await createPixCharge(client, {
        workspaceId: workspaceAId,
        threadId: threadAId,
        contactId: contactAId,
        title: "Cobrança Caixa Separada",
        amountCents: 15000,
      });
      chargeId = charge.id;

      // Cashier confirmation
      const settled = await confirmPixChargeManual(client, {
        workspaceId: workspaceAId,
        chargeId,
        actorUserId: userAId,
        verificationNotes: "Comprovante bancário TED conferido pelo caixa.",
      });

      expect(settled.charge.status).toBe("PAID");
      expect(settled.charge.verification_method).toBe("MANUAL_CASHIER");
      expect(settled.charge.verified_by_user_id).toBe(userAId);
      expect(settled.charge.verified_at).not.toBeNull();

      // Ensure no automatic conversion event was enqueued
      const convRes = await client.query(
        `SELECT COUNT(*) as count FROM public.conversion_events WHERE workspace_id = $1 AND value_cents = 15000;`,
        [workspaceAId]
      );
      expect(Number(convRes.rows[0].count)).toBe(0);
    });
  });
});
