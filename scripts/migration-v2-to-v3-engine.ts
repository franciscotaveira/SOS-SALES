import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { PhoneNumber } from "../packages/domain/src";

export interface V2Contact {
  id: string;
  name: string;
  raw_phone: string;
  created_at: string;
}

export interface V2Product {
  id: string;
  sku: string;
  title: string;
  description: string;
  price_cents: number;
  category: string;
}

export interface V2Message {
  id: string;
  sender_type: "contact" | "operator";
  content: string;
  created_at: string;
}

export interface V2Thread {
  id: string;
  contact_id: string;
  status: string;
  last_interaction_at: string;
  messages: V2Message[];
}

export interface V2OrderItem {
  product_id: string;
  quantity: number;
  unit_price_cents: number;
}

export interface V2Order {
  id: string;
  contact_id: string;
  thread_id: string;
  title: string;
  items: V2OrderItem[];
  amount_cents: number;
  status: "paid" | "pending" | "cancelled";
  pix_code: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface V2Workspace {
  id: string;
  name: string;
  slug: string;
  owner_email: string;
  owner_name: string;
  default_pix_key: string;
  default_pix_merchant_name: string;
  default_pix_merchant_city: string;
  channel: {
    id: string;
    provider: string;
    display_name: string;
  };
  contacts: V2Contact[];
  products: V2Product[];
  threads: V2Thread[];
  orders: V2Order[];
}

export interface V2SyntheticFixture {
  version: string;
  exported_at: string;
  source_system: string;
  metadata: {
    total_workspaces: number;
    total_contacts: number;
    total_products: number;
    total_threads: number;
    total_messages: number;
    total_orders: number;
    total_order_cents: number;
    paid_order_cents: number;
    checksum_sha256: string;
  };
  workspaces: V2Workspace[];
}

export interface MigrationExecutionResult {
  timestamp: string;
  success: boolean;
  dryRun: boolean;
  sourceMetadata: V2SyntheticFixture["metadata"];
  v3IngestedCounts: {
    workspaces: number;
    contacts: number;
    products: number;
    threads: number;
    messages: number;
    proposals: number;
    pixCharges: number;
    outcomes: number;
    totalOrderCents: number;
    totalPaidCents: number;
  };
  checksumsMatch: boolean;
  errors: string[];
  warnings: string[];
}

export function toDeterministicUuid(seed: string): string {
  const hash = crypto.createHash("sha256").update(`sos-v3-migration:${seed}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function normalizeToE164(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  return new PhoneNumber(`+${digits}`).toString();
}

export async function runSyntheticV2Migration(
  pool: Pool,
  options: { fixturePath?: string; dryRun?: boolean } = {}
): Promise<MigrationExecutionResult> {
  const dryRun = options.dryRun ?? false;
  const fixturePath =
    options.fixturePath ||
    path.resolve(__dirname, "fixtures/synthetic-v2-export.json");

  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Synthetic V2 fixture file not found at: ${fixturePath}`);
  }

  const rawJson = fs.readFileSync(fixturePath, "utf-8");
  const fixture = JSON.parse(rawJson) as V2SyntheticFixture;
  const errors: string[] = [];
  const warnings: string[] = [];

  const client: PoolClient = await pool.connect();

  try {
    await client.query("BEGIN;");

    // 1. Provision shared Organization for V2 migrations
    const orgId = toDeterministicUuid("org-v2-migrated");
    await client.query(
      `INSERT INTO public.organizations (id, name, slug)
       VALUES ($1, 'Organização Migrada V2', 'org-migrada-v2')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;`,
      [orgId]
    );

    for (const ws of fixture.workspaces) {
      const workspaceId = toDeterministicUuid(ws.id);
      const ownerUserId = toDeterministicUuid(`user-${ws.owner_email}`);

      // 2. Provision Owner User
      await client.query(
        `INSERT INTO public.users (id, email, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email;`,
        [ownerUserId, ws.owner_email, ws.owner_name]
      );

      // 3. Provision Workspace
      await client.query(
        `INSERT INTO public.workspaces (
           id, organization_id, name, slug,
           default_pix_key, default_pix_merchant_name, default_pix_merchant_city
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           default_pix_key = EXCLUDED.default_pix_key,
           default_pix_merchant_name = EXCLUDED.default_pix_merchant_name,
           default_pix_merchant_city = EXCLUDED.default_pix_merchant_city;`,
        [
          workspaceId,
          orgId,
          ws.name,
          ws.slug,
          ws.default_pix_key,
          ws.default_pix_merchant_name,
          ws.default_pix_merchant_city,
        ]
      );

      // 4. Membership
      await client.query(
        `INSERT INTO public.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1, $2, 'admin')
         ON CONFLICT (workspace_id, user_id) DO NOTHING;`,
        [workspaceId, ownerUserId]
      );

      // 5. Channel Instance
      const channelId = toDeterministicUuid(ws.channel.id);
      const channelPhone = ws.id === "v2-ws-haven" ? "+5549990001001" : "+5549990002002";
      const tokenHash = crypto.createHash("sha256").update(`chan-token-${channelId}`).digest("hex");
      await client.query(
        `INSERT INTO public.channel_instances (
           id, workspace_id, provider, display_name, phone_number_e164, endpoint_token_hash, status, is_active
         ) VALUES ($1, $2, $3, $4, $5, $6, 'connected', true)
         ON CONFLICT (id) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           phone_number_e164 = EXCLUDED.phone_number_e164,
           status = 'connected',
           is_active = true;`,
        [channelId, workspaceId, ws.channel.provider, ws.channel.display_name, channelPhone, tokenHash]
      );

      // 6. Products
      for (const prod of ws.products) {
        const productId = toDeterministicUuid(prod.id);
        const imageUrl = `https://mct.br/assets/products/${prod.sku.toLowerCase()}.png`;
        await client.query(
          `INSERT INTO public.products (
             id, workspace_id, retailer_id, title, description, price_cents, category, image_url
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             price_cents = EXCLUDED.price_cents,
             image_url = EXCLUDED.image_url;`,
          [
            productId,
            workspaceId,
            prod.sku,
            prod.title,
            prod.description,
            prod.price_cents,
            prod.category,
            imageUrl,
          ]
        );
      }

      // 7. Contacts (with E.164 normalization)
      for (const cnt of ws.contacts) {
        const contactId = toDeterministicUuid(cnt.id);
        const phoneE164 = normalizeToE164(cnt.raw_phone);

        await client.query(
          `INSERT INTO public.contacts (id, workspace_id, phone_e164, name, created_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             phone_e164 = EXCLUDED.phone_e164;`,
          [contactId, workspaceId, phoneE164, cnt.name, new Date(cnt.created_at)]
        );
      }

      // 8. Threads and Messages
      for (const th of ws.threads) {
        const threadId = toDeterministicUuid(th.id);
        const contactId = toDeterministicUuid(th.contact_id);
        const contact = ws.contacts.find((c) => c.id === th.contact_id);
        const contactPhone = contact ? normalizeToE164(contact.raw_phone) : "+5549999999999";

        await client.query(
          `INSERT INTO public.commercial_threads (
             id, workspace_id, channel_instance_id, contact_id, status, last_message_at
           ) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             status = EXCLUDED.status,
             last_message_at = EXCLUDED.last_message_at;`,
          [
            threadId,
            workspaceId,
            channelId,
            contactId,
            th.status,
            new Date(th.last_interaction_at),
          ]
        );

        for (const msg of th.messages) {
          const messageId = toDeterministicUuid(msg.id);
          const direction = msg.sender_type === "operator" ? "outbound" : "inbound";
          const senderE164 = direction === "inbound" ? contactPhone : channelPhone;
          const recipientE164 = direction === "inbound" ? channelPhone : contactPhone;

          await client.query(
            `INSERT INTO public.messages (
               id, workspace_id, thread_id, channel_instance_id, provider, direction,
               sender_e164, recipient_e164, content_type, body, delivery_status, status_rank, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'text', $9, 'delivered', 20, $10)
             ON CONFLICT (id) DO NOTHING;`,
            [
              messageId,
              workspaceId,
              threadId,
              channelId,
              ws.channel.provider,
              direction,
              senderE164,
              recipientE164,
              msg.content,
              new Date(msg.created_at),
            ]
          );
        }
      }

      // 9. Orders -> Journeys, Proposals, Pix Charges & Outcomes
      for (const ord of ws.orders) {
        const journeyId = toDeterministicUuid(`journey-${ord.id}`);
        const proposalId = toDeterministicUuid(ord.id);
        const contactId = toDeterministicUuid(ord.contact_id);
        const threadId = toDeterministicUuid(ord.thread_id);

        // Journey
        const journeyStage =
          ord.status === "paid" ? "won" : ord.status === "cancelled" ? "lost" : "proposal";
        const journeyStatus =
          ord.status === "paid" ? "won" : ord.status === "cancelled" ? "lost" : "open";

        await client.query(
          `INSERT INTO public.commercial_journeys (
             id, workspace_id, contact_id, thread_id, title, stage, status, estimated_value_cents
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             stage = EXCLUDED.stage,
             status = EXCLUDED.status;`,
          [
            journeyId,
            workspaceId,
            contactId,
            threadId,
            ord.title,
            journeyStage,
            journeyStatus,
            ord.amount_cents,
          ]
        );

        // Map items with title and subtotals
        const proposalItems = ord.items.map((item) => {
          const product = ws.products.find((p) => p.id === item.product_id);
          return {
            productId: toDeterministicUuid(item.product_id),
            title: product?.title || "Item V2",
            unitPriceCents: item.unit_price_cents,
            quantity: item.quantity,
            subtotalCents: item.unit_price_cents * item.quantity,
          };
        });

        // Proposal: starts draft, transitions according to order status
        const initialStatus = "draft";
        await client.query(
          `INSERT INTO public.commercial_proposals (
             id, workspace_id, thread_id, contact_id, journey_id, title,
             status, items, total_cents, currency, created_by_user_id,
             state_version, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'BRL', $10, 1, $11)
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             items = EXCLUDED.items,
             total_cents = EXCLUDED.total_cents;`,
          [
            proposalId,
            workspaceId,
            threadId,
            contactId,
            journeyId,
            ord.title,
            initialStatus,
            JSON.stringify(proposalItems),
            ord.amount_cents,
            ownerUserId,
            new Date(ord.created_at),
          ]
        );

        // Progress proposal state machine only if not already in target state
        const currPropRes = await client.query<{ status: string }>(
          `SELECT status FROM public.commercial_proposals WHERE id = $1;`,
          [proposalId]
        );
        const currStatus = currPropRes.rows[0]?.status;

        if (ord.status === "pending" && currStatus === "draft") {
          await client.query(
            `UPDATE public.commercial_proposals
             SET status = 'sent', sent_at = $2
             WHERE id = $1;`,
            [proposalId, new Date(ord.created_at)]
          );
        } else if (ord.status === "paid" && currStatus !== "accepted") {
          if (currStatus === "draft") {
            await client.query(
              `UPDATE public.commercial_proposals
               SET status = 'sent', sent_at = $2
               WHERE id = $1;`,
              [proposalId, new Date(ord.created_at)]
            );
          }
          await client.query(
            `UPDATE public.commercial_proposals
             SET status = 'accepted', accepted_at = $2
             WHERE id = $1;`,
            [proposalId, ord.paid_at ? new Date(ord.paid_at) : new Date()]
          );
        } else if (ord.status === "cancelled" && currStatus !== "cancelled") {
          await client.query(
            `UPDATE public.commercial_proposals
             SET status = 'cancelled', cancelled_at = $2
             WHERE id = $1;`,
            [proposalId, new Date()]
          );
        }

        // Pix Charge (for paid or pending orders)
        if (ord.status === "paid" || ord.status === "pending") {
          const pixChargeId = toDeterministicUuid(`pix-${ord.id}`);
          const pixStatus = ord.status === "paid" ? "PAID" : "PENDING";
          const paidAt = ord.status === "paid" && ord.paid_at ? new Date(ord.paid_at) : null;
          const expiresAt = new Date(new Date(ord.created_at).getTime() + 60 * 60 * 1000);

          await client.query(
            `INSERT INTO public.pix_charges (
               id, workspace_id, thread_id, contact_id, proposal_id,
               title, amount_cents, currency, pix_code, pix_qr_url,
               status, expires_at, paid_at, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'BRL', $8, $9, $10, $11, $12, $13)
             ON CONFLICT (id) DO UPDATE SET
               status = EXCLUDED.status,
               paid_at = EXCLUDED.paid_at;`,
            [
              pixChargeId,
              workspaceId,
              threadId,
              contactId,
              proposalId,
              ord.title,
              ord.amount_cents,
              ord.pix_code || "000201...",
              `https://pix.mct.br/qr/${pixChargeId}`,
              pixStatus,
              expiresAt,
              paidAt,
              new Date(ord.created_at),
            ]
          );
        }

        // Commercial Outcome (for paid orders)
        if (ord.status === "paid") {
          const outcomeId = toDeterministicUuid(`outcome-${ord.id}`);
          await client.query(
            `INSERT INTO public.commercial_outcomes (
               id, workspace_id, journey_id, status, value_cents, currency,
               registered_by_user_id, created_at
             ) VALUES ($1, $2, $3, 'won', $4, 'BRL', $5, $6)
             ON CONFLICT (id) DO UPDATE SET
               value_cents = EXCLUDED.value_cents;`,
            [
              outcomeId,
              workspaceId,
              journeyId,
              ord.amount_cents,
              ownerUserId,
              ord.paid_at ? new Date(ord.paid_at) : new Date(),
            ]
          );
        }
      }
    }

    // 10. Audit Counts & Checksums from V3 Database State (Sequential execution on single client)
    const wsIds = fixture.workspaces.map((w) => toDeterministicUuid(w.id));

    const qWorkspaces = await client.query<{ count: string }>(
      `SELECT count(*) FROM public.workspaces WHERE id = ANY($1);`,
      [wsIds]
    );
    const qContacts = await client.query<{ count: string }>(
      `SELECT count(*) FROM public.contacts WHERE workspace_id = ANY($1);`,
      [wsIds]
    );
    const qProducts = await client.query<{ count: string }>(
      `SELECT count(*) FROM public.products WHERE workspace_id = ANY($1);`,
      [wsIds]
    );
    const qThreads = await client.query<{ count: string }>(
      `SELECT count(*) FROM public.commercial_threads WHERE workspace_id = ANY($1);`,
      [wsIds]
    );
    const qMessages = await client.query<{ count: string }>(
      `SELECT count(*) FROM public.messages WHERE workspace_id = ANY($1);`,
      [wsIds]
    );
    const qProposals = await client.query<{ count: string }>(
      `SELECT count(*) FROM public.commercial_proposals WHERE workspace_id = ANY($1);`,
      [wsIds]
    );
    const qPix = await client.query<{ count: string }>(
      `SELECT count(*) FROM public.pix_charges WHERE workspace_id = ANY($1);`,
      [wsIds]
    );
    const qOutcomes = await client.query<{ count: string }>(
      `SELECT count(*) FROM public.commercial_outcomes WHERE workspace_id = ANY($1) AND status = 'won';`,
      [wsIds]
    );
    const qSumProposals = await client.query<{ sum: string }>(
      `SELECT COALESCE(sum(total_cents), 0) as sum FROM public.commercial_proposals WHERE workspace_id = ANY($1);`,
      [wsIds]
    );
    const qSumOutcomes = await client.query<{ sum: string }>(
      `SELECT COALESCE(sum(value_cents), 0) as sum FROM public.commercial_outcomes WHERE workspace_id = ANY($1) AND status = 'won';`,
      [wsIds]
    );

    const v3IngestedCounts = {
      workspaces: parseInt(qWorkspaces.rows[0]?.count || "0", 10),
      contacts: parseInt(qContacts.rows[0]?.count || "0", 10),
      products: parseInt(qProducts.rows[0]?.count || "0", 10),
      threads: parseInt(qThreads.rows[0]?.count || "0", 10),
      messages: parseInt(qMessages.rows[0]?.count || "0", 10),
      proposals: parseInt(qProposals.rows[0]?.count || "0", 10),
      pixCharges: parseInt(qPix.rows[0]?.count || "0", 10),
      outcomes: parseInt(qOutcomes.rows[0]?.count || "0", 10),
      totalOrderCents: parseInt(qSumProposals.rows[0]?.sum || "0", 10),
      totalPaidCents: parseInt(qSumOutcomes.rows[0]?.sum || "0", 10),
    };

    // 11. Checksum matching: compare V2 source metadata vs V3 ingested state
    const meta = fixture.metadata;
    if (v3IngestedCounts.workspaces !== meta.total_workspaces) {
      errors.push(
        `Workspaces count mismatch: expected ${meta.total_workspaces}, got ${v3IngestedCounts.workspaces}`
      );
    }
    if (v3IngestedCounts.contacts !== meta.total_contacts) {
      errors.push(
        `Contacts count mismatch: expected ${meta.total_contacts}, got ${v3IngestedCounts.contacts}`
      );
    }
    if (v3IngestedCounts.products !== meta.total_products) {
      errors.push(
        `Products count mismatch: expected ${meta.total_products}, got ${v3IngestedCounts.products}`
      );
    }
    if (v3IngestedCounts.threads !== meta.total_threads) {
      errors.push(
        `Threads count mismatch: expected ${meta.total_threads}, got ${v3IngestedCounts.threads}`
      );
    }
    if (v3IngestedCounts.messages !== meta.total_messages) {
      errors.push(
        `Messages count mismatch: expected ${meta.total_messages}, got ${v3IngestedCounts.messages}`
      );
    }
    if (v3IngestedCounts.proposals !== meta.total_orders) {
      errors.push(
        `Proposals count mismatch: expected ${meta.total_orders}, got ${v3IngestedCounts.proposals}`
      );
    }
    if (v3IngestedCounts.totalOrderCents !== meta.total_order_cents) {
      errors.push(
        `Total order cents mismatch: expected ${meta.total_order_cents}, got ${v3IngestedCounts.totalOrderCents}`
      );
    }
    if (v3IngestedCounts.totalPaidCents !== meta.paid_order_cents) {
      errors.push(
        `Total paid cents mismatch: expected ${meta.paid_order_cents}, got ${v3IngestedCounts.totalPaidCents}`
      );
    }

    const checksumsMatch = errors.length === 0;

    if (dryRun) {
      await client.query("ROLLBACK;");
    } else {
      if (!checksumsMatch) {
        await client.query("ROLLBACK;");
        throw new Error(
          `MIGRATION_RECONCILIATION_FAILED: Checksum mismatch detected during migration. Rollback executed. Errors: ${errors.join(
            "; "
          )}`
        );
      }
      await client.query("COMMIT;");
    }

    return {
      timestamp: new Date().toISOString(),
      success: checksumsMatch,
      dryRun,
      sourceMetadata: meta,
      v3IngestedCounts,
      checksumsMatch,
      errors,
      warnings,
    };
  } catch (err: unknown) {
    await client.query("ROLLBACK;");
    throw err;
  } finally {
    client.release();
  }
}

export async function verifyDisasterRecovery(
  pool: Pool,
  workspaceId: string
): Promise<{ isConsistent: boolean; issues: string[] }> {
  const issues: string[] = [];

  // 1. Check for orphaned threads
  const orphanedThreads = await pool.query<{ count: string }>(
    `SELECT count(*) FROM public.commercial_threads WHERE workspace_id = $1 AND contact_id NOT IN (
       SELECT id FROM public.contacts WHERE workspace_id = $1
     );`,
    [workspaceId]
  );
  if (parseInt(orphanedThreads.rows[0]?.count || "0", 10) > 0) {
    issues.push(`Found orphaned threads without valid contact`);
  }

  // 2. Check for proposals without thread
  const orphanedProposals = await pool.query<{ count: string }>(
    `SELECT count(*) FROM public.commercial_proposals WHERE workspace_id = $1 AND thread_id NOT IN (
       SELECT id FROM public.commercial_threads WHERE workspace_id = $1
     );`,
    [workspaceId]
  );
  if (parseInt(orphanedProposals.rows[0]?.count || "0", 10) > 0) {
    issues.push(`Found orphaned proposals without valid thread`);
  }

  // 3. Check for pix charges without workspace
  const orphanedPix = await pool.query<{ count: string }>(
    `SELECT count(*) FROM public.pix_charges WHERE workspace_id = $1 AND workspace_id NOT IN (
       SELECT id FROM public.workspaces
     );`,
    [workspaceId]
  );
  if (parseInt(orphanedPix.rows[0]?.count || "0", 10) > 0) {
    issues.push(`Found orphaned pix charges without valid workspace`);
  }

  return {
    isConsistent: issues.length === 0,
    issues,
  };
}
