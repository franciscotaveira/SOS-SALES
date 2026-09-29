import type { Pool, PoolClient } from "pg";
import { createPixCharge, type PixChargeRecord } from "../pix";

export type CommercialProposalStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "expired"
  | "cancelled";

export interface CommercialProposalItem {
  productId: string | null;
  title: string;
  unitPriceCents: number;
  quantity: number;
  subtotalCents: number;
}

export interface CommercialProposalRecord {
  id: string;
  workspace_id: string;
  thread_id: string;
  contact_id: string;
  journey_id: string | null;
  title: string;
  status: CommercialProposalStatus;
  items: CommercialProposalItem[];
  total_cents: number;
  currency: string;
  conditions: string | null;
  valid_until: Date | null;
  sent_at: Date | null;
  accepted_at: Date | null;
  rejected_at: Date | null;
  cancelled_at: Date | null;
  created_by_user_id: string | null;
  state_version: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProposalItemInput {
  productId?: string | null;
  title?: string;
  unitPriceCents?: number;
  quantity: number;
}

export interface CreateCommercialProposalInput {
  workspaceId: string;
  threadId: string;
  contactId: string;
  journeyId?: string | null;
  title: string;
  items: CreateProposalItemInput[];
  currency?: string;
  conditions?: string | null;
  validUntil?: Date | string | null;
  userId?: string | null;
}

export interface UpdateProposalStatusInput {
  status: CommercialProposalStatus;
  expectedVersion?: number;
  userId?: string | null;
  reason?: string | null;
}

/**
 * Creates a commercial proposal with an immutable snapshot of items and prices.
 * Subsequent modifications or deletions of products in the catalog do NOT
 * change the proposal's items, unit prices, or total value.
 */
export async function createCommercialProposal(
  client: Pool | PoolClient,
  input: CreateCommercialProposalInput
): Promise<CommercialProposalRecord> {
  if (!input.title || !input.title.trim()) {
    throw new Error("TITLE_REQUIRED: Título da proposta é obrigatório.");
  }
  if (!input.items || input.items.length === 0) {
    throw new Error("ITEMS_REQUIRED: A proposta deve conter ao menos um item.");
  }

  // 1. Resolve each item, snapshotting product info if productId is provided
  const snapshotItems: CommercialProposalItem[] = [];
  let totalCents = 0;

  for (const item of input.items) {
    const qty = Math.max(1, Math.floor(item.quantity || 1));
    let title = (item.title || "").trim();
    let unitPrice = item.unitPriceCents ?? 0;

    if (item.productId) {
      const prodRes = await client.query(
        `SELECT id, title, price_cents FROM public.products WHERE workspace_id = $1 AND id = $2;`,
        [input.workspaceId, item.productId]
      );
      const prod = prodRes.rows[0];
      if (prod) {
        if (!title) title = prod.title;
        if (item.unitPriceCents === undefined) unitPrice = Number(prod.price_cents);
      }
    }

    if (!title) {
      title = "Item Comercial";
    }

    const subtotal = unitPrice * qty;
    totalCents += subtotal;

    snapshotItems.push({
      productId: item.productId || null,
      title,
      unitPriceCents: unitPrice,
      quantity: qty,
      subtotalCents: subtotal,
    });
  }

  // 2. Resolve journey if not provided
  let journeyId = input.journeyId || null;
  if (!journeyId) {
    const jRes = await client.query(
      `SELECT id FROM public.commercial_journeys WHERE workspace_id = $1 AND thread_id = $2 ORDER BY created_at DESC LIMIT 1;`,
      [input.workspaceId, input.threadId]
    );
    if (jRes.rows[0]) {
      journeyId = jRes.rows[0].id;
    }
  }

  // 3. Insert immutable proposal
  const res = await client.query<CommercialProposalRecord>(
    `INSERT INTO public.commercial_proposals (
      workspace_id, thread_id, contact_id, journey_id,
      title, status, items, total_cents, currency,
      conditions, valid_until, created_by_user_id
    ) VALUES (
      $1, $2, $3, $4,
      $5, 'draft', $6::jsonb, $7, $8,
      $9, $10, $11
    ) RETURNING *;`,
    [
      input.workspaceId,
      input.threadId,
      input.contactId,
      journeyId,
      input.title.trim(),
      JSON.stringify(snapshotItems),
      totalCents,
      input.currency || "BRL",
      input.conditions || null,
      input.validUntil ? new Date(input.validUntil) : null,
      input.userId || null,
    ]
  );

  const row = res.rows[0];
  if (!row) {
    throw new Error("INSERT_FAILED: Falha ao inserir proposta comercial.");
  }

  return {
    ...row,
    total_cents: Number(row.total_cents),
    state_version: Number(row.state_version) || 1,
    items: typeof row.items === "string" ? JSON.parse(row.items) : row.items,
  };
}

/**
 * Retrieves a proposal by ID under tenant scope.
 */
export async function getCommercialProposalById(
  client: Pool | PoolClient,
  workspaceId: string,
  proposalId: string
): Promise<CommercialProposalRecord | null> {
  const res = await client.query<CommercialProposalRecord>(
    `SELECT * FROM public.commercial_proposals WHERE workspace_id = $1 AND id = $2;`,
    [workspaceId, proposalId]
  );

  const row = res.rows[0];
  if (!row) return null;

  return {
    ...row,
    total_cents: Number(row.total_cents),
    state_version: Number(row.state_version) || 1,
    items: typeof row.items === "string" ? JSON.parse(row.items) : row.items,
  };
}

/**
 * Lists all commercial proposals for a thread under tenant scope.
 */
export async function listCommercialProposalsForThread(
  client: Pool | PoolClient,
  workspaceId: string,
  threadId: string
): Promise<CommercialProposalRecord[]> {
  const res = await client.query<CommercialProposalRecord>(
    `SELECT * FROM public.commercial_proposals
     WHERE workspace_id = $1 AND thread_id = $2
     ORDER BY created_at DESC;`,
    [workspaceId, threadId]
  );

  return res.rows.map((row) => ({
    ...row,
    total_cents: Number(row.total_cents),
    state_version: Number(row.state_version) || 1,
    items: typeof row.items === "string" ? JSON.parse(row.items) : row.items,
  }));
}

/**
 * Updates proposal status with strict validation, state machine transition guards, and optimistic locking.
 */
export async function updateCommercialProposalStatus(
  client: Pool | PoolClient,
  workspaceId: string,
  proposalId: string,
  input: UpdateProposalStatusInput
): Promise<CommercialProposalRecord> {
  const current = await getCommercialProposalById(client, workspaceId, proposalId);
  if (!current) {
    throw new Error(`PROPOSAL_NOT_FOUND: Proposta ${proposalId} não encontrada.`);
  }

  // Idempotency: same status returns immediately
  if (current.status === input.status) {
    return current;
  }

  // Governed State Machine Transitions:
  // draft -> sent | cancelled
  // sent -> accepted | rejected | expired | cancelled
  // terminal states (accepted, rejected, expired, cancelled) cannot transition
  const validTransitions: Record<string, string[]> = {
    draft: ["sent", "cancelled"],
    sent: ["accepted", "rejected", "expired", "cancelled"],
    accepted: [],
    rejected: [],
    expired: [],
    cancelled: [],
  };

  const allowed = validTransitions[current.status];
  if (allowed && !allowed.includes(input.status)) {
    throw new Error(
      `INVALID_TRANSITION: Transição de '${current.status}' para '${input.status}' não é permitida.`
    );
  }

  // Optimistic locking check if expectedVersion is supplied
  if (input.expectedVersion !== undefined && current.state_version !== input.expectedVersion) {
    throw new Error(
      `OPTIMISTIC_LOCK_CONFLICT: Versão concorrente detectada na proposta ${proposalId}. Esperada: ${input.expectedVersion}, Atual: ${current.state_version}.`
    );
  }

  const updates: string[] = ["status = $3", "updated_at = now()"];
  const params: unknown[] = [workspaceId, proposalId, input.status];

  if (input.status === "sent") {
    updates.push("sent_at = COALESCE(sent_at, now())");
  } else if (input.status === "accepted") {
    updates.push("accepted_at = COALESCE(accepted_at, now())");
  } else if (input.status === "rejected") {
    updates.push("rejected_at = COALESCE(rejected_at, now())");
  } else if (input.status === "cancelled") {
    updates.push("cancelled_at = COALESCE(cancelled_at, now())");
  }

  let versionCondition = "";
  if (input.expectedVersion !== undefined) {
    params.push(input.expectedVersion);
    versionCondition = ` AND state_version = $${params.length}`;
  }

  const res = await client.query<CommercialProposalRecord>(
    `UPDATE public.commercial_proposals
     SET ${updates.join(", ")}
     WHERE workspace_id = $1 AND id = $2${versionCondition}
     RETURNING *;`,
    params
  );

  const row = res.rows[0];
  if (!row) {
    if (input.expectedVersion !== undefined) {
      const recheck = await getCommercialProposalById(client, workspaceId, proposalId);
      if (recheck && recheck.state_version !== input.expectedVersion) {
        throw new Error(
          `OPTIMISTIC_LOCK_CONFLICT: Versão concorrente detectada na proposta ${proposalId}. Esperada: ${input.expectedVersion}, Atual: ${recheck.state_version}.`
        );
      }
    }
    throw new Error("UPDATE_FAILED: Falha ao atualizar status da proposta.");
  }

  // If proposal was accepted and linked to a journey, advance journey stage to proposal
  if (input.status === "accepted" && row.journey_id) {
    await client.query(
      `UPDATE public.commercial_journeys
       SET stage = CASE WHEN stage = 'lead' THEN 'proposal' ELSE stage END,
           updated_at = now()
       WHERE workspace_id = $1 AND id = $2;`,
      [workspaceId, row.journey_id]
    );
  }

  return {
    ...row,
    total_cents: Number(row.total_cents),
    state_version: Number(row.state_version) || 1,
    items: typeof row.items === "string" ? JSON.parse(row.items) : row.items,
  };
}

/**
 * Atomically creates a proposal and links a Pix charge in a single database transaction.
 */
export async function createProposalWithPixCharge(
  client: PoolClient,
  params: {
    workspaceId: string;
    threadId: string;
    contactId: string;
    journeyId?: string | null;
    title: string;
    items: CreateProposalItemInput[];
    currency?: string;
    conditions?: string | null;
    validUntil?: Date | string | null;
    userId?: string | null;
    expiresMinutes?: number;
  }
): Promise<{ proposal: CommercialProposalRecord; pixCharge: PixChargeRecord }> {
  // 1. Create the proposal
  const proposal = await createCommercialProposal(client, {
    workspaceId: params.workspaceId,
    threadId: params.threadId,
    contactId: params.contactId,
    journeyId: params.journeyId,
    title: params.title,
    items: params.items,
    currency: params.currency,
    conditions: params.conditions,
    validUntil: params.validUntil,
    userId: params.userId,
  });

  // 2. Create and link the Pix charge
  const pixCharge = await createPixCharge(client, {
    workspaceId: params.workspaceId,
    threadId: params.threadId,
    contactId: params.contactId,
    proposalId: proposal.id,
    title: params.title,
    amountCents: proposal.total_cents,
    currency: proposal.currency,
    expiresMinutes: params.expiresMinutes,
  });

  return { proposal, pixCharge };
}
