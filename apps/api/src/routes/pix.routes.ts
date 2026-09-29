import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  withTenantTransaction,
  createPixCharge,
  listPixChargesByThread,
  confirmPixChargeManual,
} from "@sos-sales/database";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  threadId: z.string().uuid(),
});

const chargeParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  chargeId: z.string().uuid(),
});

const createChargeBodySchema = z.object({
  contactId: z.string().uuid(),
  productId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(120),
  amountCents: z.number().int().min(100), // Mínimo R$ 1,00
  expiresMinutes: z.number().int().min(5).max(1440).default(30),
});

export const pixRoutes: FastifyPluginAsync = async (app) => {
  // 1. Create a new Pix charge for a thread
  app.post(
    "/v1/workspaces/:workspaceId/threads/:threadId/pix-charges",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:send_message"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or threadId parameters",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parsedBody = createChargeBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parsedBody.error.issues[0]?.message || "Invalid payload",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, threadId } = parsedParams.data;
      const body = parsedBody.data;

      try {
        const charge = await withTenantTransaction(workspaceId, async (client) => {
          return createPixCharge(client, {
            workspaceId,
            threadId,
            contactId: body.contactId,
            productId: body.productId,
            title: body.title,
            amountCents: body.amountCents,
            expiresMinutes: body.expiresMinutes,
          });
        });

        const amountFormatted = new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: charge.currency,
        }).format(charge.amount_cents / 100);

        return reply.status(201).send({
          charge: {
            id: charge.id,
            workspaceId: charge.workspace_id,
            threadId: charge.thread_id,
            contactId: charge.contact_id,
            productId: charge.product_id,
            title: charge.title,
            amountCents: charge.amount_cents,
            amountFormatted,
            currency: charge.currency,
            pixCode: charge.pix_code,
            pixQrUrl: charge.pix_qr_url,
            status: charge.status,
            expiresAt: charge.expires_at.toISOString(),
            paidAt: charge.paid_at?.toISOString() ?? null,
            createdAt: charge.created_at.toISOString(),
            updatedAt: charge.updated_at.toISOString(),
          },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("PIX_KEY_NOT_CONFIGURED")) {
          return reply.status(422).send({
            type: "https://sos-sales.mct.br/errors/pix-key-not-configured",
            title: "Chave Pix Não Configurada",
            status: 422,
            detail: message,
            instance: request.url,
            correlationId: request.id,
          });
        }
        throw err;
      }
    }
  );

  // 2. List Pix charges for a thread
  app.get(
    "/v1/workspaces/:workspaceId/threads/:threadId/pix-charges",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:access"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or threadId parameters",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, threadId } = parsedParams.data;

      const charges = await withTenantTransaction(workspaceId, async (client) => {
        return listPixChargesByThread(client, workspaceId, threadId);
      });

      return reply.status(200).send({
        charges: charges.map((c) => ({
          id: c.id,
          workspaceId: c.workspace_id,
          threadId: c.thread_id,
          contactId: c.contact_id,
          productId: c.product_id,
          title: c.title,
          amountCents: c.amount_cents,
          amountFormatted: new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: c.currency,
          }).format(c.amount_cents / 100),
          currency: c.currency,
          pixCode: c.pix_code,
          pixQrUrl: c.pix_qr_url,
          status: c.status,
          verificationMethod: c.verification_method,
          verifiedByUserId: c.verified_by_user_id,
          verifiedAt: c.verified_at?.toISOString() ?? null,
          verificationNotes: c.verification_notes,
          expiresAt: c.expires_at.toISOString(),
          paidAt: c.paid_at?.toISOString() ?? null,
          createdAt: c.created_at.toISOString(),
          updatedAt: c.updated_at.toISOString(),
        })),
        total: charges.length,
      });
    }
  );

  // 3. Confirm Pix Payment (Manual settlement by operator / cashier)
  app.post(
    "/v1/workspaces/:workspaceId/pix-charges/:chargeId/confirm-payment",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("outcome:register"),
      ],
    },
    async (request, reply) => {
      const parsedParams = chargeParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or chargeId parameters",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, chargeId } = parsedParams.data;
      const actorUserId = request.user?.id;
      if (!actorUserId) {
        return reply.status(403).send({
          type: "https://sos-sales.mct.br/errors/forbidden",
          title: "Forbidden",
          status: 403,
          detail: "Human actor user ID is strictly required for cashier settlement",
          instance: request.url,
          correlationId: request.id,
        });
      }

      try {
        const { charge, alreadySettled } = await withTenantTransaction(
          workspaceId,
          async (client) => {
            return confirmPixChargeManual(client, {
              workspaceId,
              chargeId,
              actorUserId,
              verificationNotes: "Conferência manual efetuada pelo operador",
            });
          }
        );

        const amountFormatted = new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: charge.currency,
        }).format(charge.amount_cents / 100);

        return reply.status(200).send({
          success: true,
          alreadySettled: !!alreadySettled,
          charge: {
            id: charge.id,
            status: charge.status,
            verificationMethod: charge.verification_method,
            verifiedByUserId: charge.verified_by_user_id,
            verifiedAt: charge.verified_at?.toISOString() ?? null,
            verificationNotes: charge.verification_notes,
            amountCents: charge.amount_cents,
            amountFormatted,
            paidAt: charge.paid_at?.toISOString() ?? null,
          },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Settlement Error",
          status: 400,
          detail: message,
          instance: request.url,
          correlationId: request.id,
        });
      }
    }
  );
};
