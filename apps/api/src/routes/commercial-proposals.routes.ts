import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  withTenantTransaction,
  createCommercialProposal,
  getCommercialProposalById,
  listCommercialProposalsForThread,
  updateCommercialProposalStatus,
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
});

const patchProposalStatusBodySchema = z.object({
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired", "cancelled"] as const),
  reason: z.string().max(500).optional().nullable(),
});

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
        items: proposals.map((p) => ({
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
          createdAt: p.created_at.toISOString(),
          updatedAt: p.updated_at.toISOString(),
        })),
      });
    }
  );

  // 2. Create proposal for a thread
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

        return reply.status(201).send({
          id: proposal.id,
          workspaceId: proposal.workspace_id,
          threadId: proposal.thread_id,
          contactId: proposal.contact_id,
          journeyId: proposal.journey_id,
          title: proposal.title,
          status: proposal.status,
          items: proposal.items,
          totalCents: proposal.total_cents,
          currency: proposal.currency,
          conditions: proposal.conditions,
          validUntil: proposal.valid_until ? proposal.valid_until.toISOString() : null,
          sentAt: proposal.sent_at ? proposal.sent_at.toISOString() : null,
          acceptedAt: proposal.accepted_at ? proposal.accepted_at.toISOString() : null,
          rejectedAt: proposal.rejected_at ? proposal.rejected_at.toISOString() : null,
          cancelledAt: proposal.cancelled_at ? proposal.cancelled_at.toISOString() : null,
          createdByUserId: proposal.created_by_user_id,
          createdAt: proposal.created_at.toISOString(),
          updatedAt: proposal.updated_at.toISOString(),
        });
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

      return reply.status(200).send({
        id: proposal.id,
        workspaceId: proposal.workspace_id,
        threadId: proposal.thread_id,
        contactId: proposal.contact_id,
        journeyId: proposal.journey_id,
        title: proposal.title,
        status: proposal.status,
        items: proposal.items,
        totalCents: proposal.total_cents,
        currency: proposal.currency,
        conditions: proposal.conditions,
        validUntil: proposal.valid_until ? proposal.valid_until.toISOString() : null,
        sentAt: proposal.sent_at ? proposal.sent_at.toISOString() : null,
        acceptedAt: proposal.accepted_at ? proposal.accepted_at.toISOString() : null,
        rejectedAt: proposal.rejected_at ? proposal.rejected_at.toISOString() : null,
        cancelledAt: proposal.cancelled_at ? proposal.cancelled_at.toISOString() : null,
        createdByUserId: proposal.created_by_user_id,
        createdAt: proposal.created_at.toISOString(),
        updatedAt: proposal.updated_at.toISOString(),
      });
    }
  );

  // 4. Update proposal status (send, accept, reject, cancel)
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
          detail: "Invalid proposal status payload",
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
            userId: request.user.id,
            reason: data.reason,
          });
        });

        return reply.status(200).send({
          id: updated.id,
          workspaceId: updated.workspace_id,
          threadId: updated.thread_id,
          contactId: updated.contact_id,
          journeyId: updated.journey_id,
          title: updated.title,
          status: updated.status,
          items: updated.items,
          totalCents: updated.total_cents,
          currency: updated.currency,
          conditions: updated.conditions,
          validUntil: updated.valid_until ? updated.valid_until.toISOString() : null,
          sentAt: updated.sent_at ? updated.sent_at.toISOString() : null,
          acceptedAt: updated.accepted_at ? updated.accepted_at.toISOString() : null,
          rejectedAt: updated.rejected_at ? updated.rejected_at.toISOString() : null,
          cancelledAt: updated.cancelled_at ? updated.cancelled_at.toISOString() : null,
          createdByUserId: updated.created_by_user_id,
          createdAt: updated.created_at.toISOString(),
          updatedAt: updated.updated_at.toISOString(),
        });
      } catch (err: unknown) {
        const error = err as Error;
        const statusCode = error.message.includes("PROPOSAL_NOT_FOUND")
          ? 404
          : error.message.includes("INVALID_TRANSITION")
          ? 409
          : 400;

        return reply.status(statusCode).send({
          type: statusCode === 404 ? "https://sos-sales.mct.br/errors/not-found" : "https://sos-sales.mct.br/errors/conflict",
          title: statusCode === 404 ? "Not Found" : "Invalid Transition",
          status: statusCode,
          detail: error.message,
          instance: request.url,
          correlationId: request.id,
        });
      }
    }
  );
};
