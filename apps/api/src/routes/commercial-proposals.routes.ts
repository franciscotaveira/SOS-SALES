import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  withTenantTransaction,
  createCommercialProposal,
  getCommercialProposalById,
  listCommercialProposalsForThread,
  updateCommercialProposalStatus,
  createProposalWithPixCharge,
  createPixCharge,
  type CommercialProposalRecord,
  type PixChargeRecord,
  type CommercialProposalStatus,
} from "@sos-sales/database";

const workspaceThreadParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  threadId: z.string().uuid(),
});

const workspaceProposalParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  proposalId: z.string().uuid(),
});

const createProposalBodySchema = z.object({
  contactId: z.string().uuid(),
  journeyId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(200),
  items: z
    .array(
      z.object({
        productId: z.string().uuid().optional().nullable(),
        title: z.string().trim().min(1).max(200).optional(),
        unitPriceCents: z.number().int().nonnegative().optional(),
        quantity: z.number().int().positive().default(1),
      })
    )
    .min(1),
  currency: z.string().length(3).default("BRL"),
  conditions: z.string().max(1000).optional().nullable(),
  validUntil: z.string().datetime().optional().nullable(),
  generatePixCharge: z.boolean().optional(),
  expiresMinutes: z.number().int().min(5).max(1440).optional(),
});

const patchProposalStatusBodySchema = z.object({
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired", "cancelled"] as const),
  expectedVersion: z.number({
    required_error: "expectedVersion is strictly required for proposal status transitions",
    invalid_type_error: "expectedVersion is strictly required for proposal status transitions",
  }).int().positive(),
  reason: z.string().max(500).optional().nullable(),
});

const createProposalPixChargeBodySchema = z.object({
  expiresMinutes: z.number().int().min(5).max(1440).default(30).optional(),
});

function formatProposalResponse(p: CommercialProposalRecord) {
  return {
    id: p.id,
    workspaceId: p.workspace_id,
    threadId: p.thread_id,
    contactId: p.contact_id,
    journeyId: p.journey_id,
    title: p.title,
    status: p.status,
    items: p.items,
    totalCents: p.total_cents,
    currency: p.currency,
    conditions: p.conditions,
    validUntil: p.valid_until ? p.valid_until.toISOString() : null,
    sentAt: p.sent_at ? p.sent_at.toISOString() : null,
    acceptedAt: p.accepted_at ? p.accepted_at.toISOString() : null,
    rejectedAt: p.rejected_at ? p.rejected_at.toISOString() : null,
    cancelledAt: p.cancelled_at ? p.cancelled_at.toISOString() : null,
    createdByUserId: p.created_by_user_id,
    stateVersion: p.state_version ?? 1,
    createdAt: p.created_at.toISOString(),
    updatedAt: p.updated_at.toISOString(),
  };
}

function formatPixChargeResponse(c: PixChargeRecord) {
  const amountFormatted = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: c.currency,
  }).format(c.amount_cents / 100);

  return {
    id: c.id,
    workspaceId: c.workspace_id,
    threadId: c.thread_id,
    contactId: c.contact_id,
    proposalId: c.proposal_id ?? null,
    productId: c.product_id ?? null,
    title: c.title,
    amountCents: c.amount_cents,
    amountFormatted,
    currency: c.currency,
    pixCode: c.pix_code,
    pixQrUrl: c.pix_qr_url,
    status: c.status,
    expiresAt: c.expires_at.toISOString(),
    paidAt: c.paid_at?.toISOString() ?? null,
    createdAt: c.created_at.toISOString(),
    updatedAt: c.updated_at.toISOString(),
  };
}

export const commercialProposalsRoutes: FastifyPluginAsync = async (app) => {
  // 1. List proposals for a thread
  app.get(
    "/v1/workspaces/:workspaceId/threads/:threadId/proposals",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("journey:view"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceThreadParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or threadId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, threadId } = parsedParams.data;

      const proposals = await withTenantTransaction(workspaceId, async (client) => {
        return listCommercialProposalsForThread(client, workspaceId, threadId);
      });

      return reply.status(200).send({
        items: proposals.map(formatProposalResponse),
      });
    }
  );

  // 2. Create proposal for a thread (optionally with atomic Pix charge generation)
  app.post(
    "/v1/workspaces/:workspaceId/threads/:threadId/proposals",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("journey:transition_stage"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceThreadParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or threadId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parseResult = createProposalBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid proposal creation payload",
          details: parseResult.error.format(),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, threadId } = parsedParams.data;
      const data = parseResult.data;

      try {
        if (data.generatePixCharge) {
          const { proposal, pixCharge } = await withTenantTransaction(workspaceId, async (client) => {
            return createProposalWithPixCharge(client, {
              workspaceId,
              threadId,
              contactId: data.contactId,
              journeyId: data.journeyId,
              title: data.title,
              items: data.items,
              currency: data.currency,
              conditions: data.conditions,
              validUntil: data.validUntil,
              userId: request.user.id,
              expiresMinutes: data.expiresMinutes,
            });
          });

          return reply.status(201).send({
            ...formatProposalResponse(proposal),
            pixCharge: formatPixChargeResponse(pixCharge),
          });
        }

        const proposal = await withTenantTransaction(workspaceId, async (client) => {
          return createCommercialProposal(client, {
            workspaceId,
            threadId,
            contactId: data.contactId,
            journeyId: data.journeyId,
            title: data.title,
            items: data.items,
            currency: data.currency,
            conditions: data.conditions,
            validUntil: data.validUntil,
            userId: request.user.id,
          });
        });

        return reply.status(201).send(formatProposalResponse(proposal));
      } catch (err: unknown) {
        const error = err as Error;
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: error.message,
          instance: request.url,
          correlationId: request.id,
        });
      }
    }
  );

  // 3. Get proposal by ID
  app.get(
    "/v1/workspaces/:workspaceId/proposals/:proposalId",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("journey:view"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceProposalParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or proposalId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, proposalId } = parsedParams.data;

      const proposal = await withTenantTransaction(workspaceId, async (client) => {
        return getCommercialProposalById(client, workspaceId, proposalId);
      });

      if (!proposal) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: `Proposal ${proposalId} not found in workspace`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      return reply.status(200).send(formatProposalResponse(proposal));
    }
  );

  // 4. Update proposal status (send, accept, reject, cancel) with optimistic concurrency
  app.patch(
    "/v1/workspaces/:workspaceId/proposals/:proposalId/status",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("journey:transition_stage"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceProposalParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or proposalId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parseResult = patchProposalStatusBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail:
            parseResult.error.issues.map((i) => i.message).join(", ") ||
            "Invalid proposal status payload",
          details: parseResult.error.format(),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, proposalId } = parsedParams.data;
      const data = parseResult.data;

      try {
        const updated = await withTenantTransaction(workspaceId, async (client) => {
          return updateCommercialProposalStatus(client, workspaceId, proposalId, {
            status: data.status as CommercialProposalStatus,
            expectedVersion: data.expectedVersion,
            userId: request.user.id,
            reason: data.reason,
          });
        });

        return reply.status(200).send(formatProposalResponse(updated));
      } catch (err: unknown) {
        const error = err as Error;
        const isNotFound = error.message.includes("PROPOSAL_NOT_FOUND");
        const isConflict =
          error.message.includes("OPTIMISTIC_LOCK_CONFLICT") ||
          error.message.includes("INVALID_TRANSITION");

        const statusCode = isNotFound ? 404 : isConflict ? 409 : 400;

        return reply.status(statusCode).send({
          type:
            statusCode === 404
              ? "https://sos-sales.mct.br/errors/not-found"
              : statusCode === 409
              ? "https://sos-sales.mct.br/errors/conflict"
              : "https://sos-sales.mct.br/errors/bad-request",
          title:
            statusCode === 404
              ? "Not Found"
              : statusCode === 409
              ? "Conflict"
              : "Bad Request",
          status: statusCode,
          detail: error.message,
          instance: request.url,
          correlationId: request.id,
        });
      }
    }
  );

  // 5. Generate Pix Charge for an existing proposal
  app.post(
    "/v1/workspaces/:workspaceId/proposals/:proposalId/pix-charge",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:send_message"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceProposalParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or proposalId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parseResult = createProposalPixChargeBodySchema.safeParse(request.body || {});
      if (!parseResult.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid proposal pix charge payload",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, proposalId } = parsedParams.data;
      const data = parseResult.data;

      try {
        const { proposal, charge } = await withTenantTransaction(
          workspaceId,
          async (client) => {
            const prop = await getCommercialProposalById(client, workspaceId, proposalId);
            if (!prop) {
              throw new Error(`PROPOSAL_NOT_FOUND: Proposal ${proposalId} not found`);
            }

            if (["cancelled", "rejected", "expired"].includes(prop.status)) {
              throw new Error(
                `INVALID_PROPOSAL_STATE: Não é possível emitir cobrança Pix para proposta com status '${prop.status}'.`
              );
            }

            const pixCharge = await createPixCharge(client, {
              workspaceId,
              threadId: prop.thread_id,
              contactId: prop.contact_id,
              proposalId: prop.id,
              title: prop.title,
              amountCents: prop.total_cents,
              currency: prop.currency,
              expiresMinutes: data.expiresMinutes,
            });

            return { proposal: prop, charge: pixCharge };
          }
        );

        return reply.status(201).send({
          proposal: formatProposalResponse(proposal),
          charge: formatPixChargeResponse(charge),
        });
      } catch (err: unknown) {
        const error = err as Error;
        const isNotFound = error.message.includes("PROPOSAL_NOT_FOUND");
        const isConflict = error.message.includes("INVALID_PROPOSAL_STATE");
        const statusCode = isNotFound ? 404 : isConflict ? 409 : 400;

        return reply.status(statusCode).send({
          type:
            statusCode === 404
              ? "https://sos-sales.mct.br/errors/not-found"
              : statusCode === 409
              ? "https://sos-sales.mct.br/errors/conflict"
              : "https://sos-sales.mct.br/errors/bad-request",
          title:
            statusCode === 404
              ? "Not Found"
              : statusCode === 409
              ? "Invalid Proposal State"
              : "Bad Request",
          status: statusCode,
          detail: error.message,
          instance: request.url,
          correlationId: request.id,
        });
      }
    }
  );
};
