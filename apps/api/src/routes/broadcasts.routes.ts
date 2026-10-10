import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import crypto from "crypto";
import { withTenantTransaction } from "@sos-sales/database";
import {
  TransactionalOutboundProducerService,
  type ITransactionalOutboundProducerService,
} from "@sos-sales/application";
import type { TrustedOutboundContext } from "@sos-sales/contracts";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const broadcastPreflightQuerySchema = z.object({
  channelInstanceId: z.string().uuid().optional(),
});

const createBroadcastBodySchema = z.object({
  channelInstanceId: z.string().uuid(),
  templateId: z.string().uuid(),
  audience: z.object({
    type: z.enum(["ALL_CONTACTS", "BY_STAGE", "MANUAL"]),
    stage: z.string().max(50).optional(),
    customPhoneNumbers: z.array(z.string().regex(/^\+[1-9][0-9]{8,14}$/)).max(500).optional(),
  }),
  variables: z.record(z.string().max(200)).optional(),
});

export interface BroadcastsRoutesOptions {
  producerService?: ITransactionalOutboundProducerService;
}

export const broadcastsRoutes: FastifyPluginAsync<BroadcastsRoutesOptions> = async (
  app,
  options
) => {
  const producerService =
    options.producerService ?? new TransactionalOutboundProducerService();

  // 1. GET /v1/workspaces/:workspaceId/broadcasts/preflight
  // Verifies channels, billing guardrail, contact volume, and templates readiness
  app.get(
    "/v1/workspaces/:workspaceId/broadcasts/preflight",
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
          detail: "Invalid workspaceId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;

      const preflightData = await withTenantTransaction(workspaceId, async (client) => {
        // Channels with billing status
        const channelsRes = await client.query<{
          id: string;
          provider: string;
          display_name: string;
          phone_number_e164: string | null;
          status: string;
          is_active: boolean;
          meta_billing_configured: boolean;
          meta_billing_account_id: string | null;
        }>(
          `SELECT id, provider, display_name, phone_number_e164, status, is_active, meta_billing_configured, meta_billing_account_id
           FROM public.channel_instances
           WHERE workspace_id = $1 AND status != 'revoked'
           ORDER BY created_at ASC;`,
          [workspaceId]
        );

        // Active templates count
        const templatesRes = await client.query<{
          id: string;
          name: string;
          category: string;
          header_text: string | null;
          body_text: string;
          variables: string[];
          status: string;
        }>(
          `SELECT id, name, category, header_text, body_text, variables, status
           FROM public.message_templates
           WHERE workspace_id = $1 AND status = 'APPROVED'
           ORDER BY name ASC;`,
          [workspaceId]
        );

        // Contacts count (active, non-opt-out contacts with valid phone)
        const contactsCountRes = await client.query<{ count: string }>(
          `SELECT count(*)::text as count
           FROM public.contacts
           WHERE workspace_id = $1 AND opt_out = false AND phone_e164 IS NOT NULL;`,
          [workspaceId]
        );

        return {
          channels: channelsRes.rows,
          templates: templatesRes.rows,
          totalActiveContacts: Number(contactsCountRes.rows[0]?.count || 0),
        };
      });

      return reply.status(200).send({
        success: true,
        channels: preflightData.channels.map((ch) => ({
          id: ch.id,
          provider: ch.provider,
          displayName: ch.display_name,
          phoneNumberE164: ch.phone_number_e164,
          status: ch.status,
          isActive: ch.is_active,
          metaBillingConfigured: ch.meta_billing_configured,
          metaBillingAccountId: ch.meta_billing_account_id,
          isBlockedForBroadcast: ch.provider === "meta_waba" && !ch.meta_billing_configured,
        })),
        templates: preflightData.templates,
        totalActiveContacts: preflightData.totalActiveContacts,
        billingNotice: {
          policy: "DIRECT_TO_META_CUSTOMER_ACCOUNT",
          description:
            "SOS Sales não cobra nem intermedia custos de mensagens Meta. Todo envio ativo no canal oficial é debitado diretamente no cartão de crédito cadastrado na Meta pelo cliente.",
        },
      });
    }
  );

  // 2. POST /v1/workspaces/:workspaceId/broadcasts
  // Executes active broadcast with MANDATORY Credit Card / Meta Billing Guardrail
  app.post(
    "/v1/workspaces/:workspaceId/broadcasts",
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
          detail: "Invalid workspaceId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parsedBody = createBroadcastBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parsedBody.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const { channelInstanceId, templateId, audience, variables = {} } = parsedBody.data;

      // 1. Verify Channel & Apply Mandatory Meta Billing Gate
      const { channel, template, recipients } = await withTenantTransaction(
        workspaceId,
        async (client) => {
          const chanRes = await client.query<{
            id: string;
            provider: string;
            display_name: string;
            phone_number_e164: string | null;
            status: string;
            is_active: boolean;
            meta_billing_configured: boolean;
          }>(
            `SELECT id, provider, display_name, phone_number_e164, status, is_active, meta_billing_configured
             FROM public.channel_instances
             WHERE id = $1 AND workspace_id = $2;`,
            [channelInstanceId, workspaceId]
          );

          const ch = chanRes.rows[0];
          if (!ch) {
            return { channel: null, template: null, recipients: [] };
          }

          // Fetch Template
          const tplRes = await client.query<{
            id: string;
            name: string;
            category: string;
            language: string;
            body_text: string;
            header_text: string | null;
            footer_text: string | null;
            buttons: unknown[];
            variables: string[];
            status: string;
            meta_template_id: string | null;
          }>(
            `SELECT id, name, category, language, body_text, header_text, footer_text, buttons, variables, status, meta_template_id
             FROM public.message_templates
             WHERE id = $1 AND workspace_id = $2;`,
            [templateId, workspaceId]
          );

          const tpl = tplRes.rows[0];
          if (!tpl) {
            return { channel: ch, template: null, recipients: [] };
          }

          // Resolve Audience
          let targetNumbers: Array<{ phone_e164: string; name?: string; contact_id?: string }> = [];

          if (audience.type === "MANUAL" && audience.customPhoneNumbers) {
            targetNumbers = audience.customPhoneNumbers.map((phone) => ({
              phone_e164: phone,
            }));
          } else if (audience.type === "BY_STAGE" && audience.stage) {
            const stageRes = await client.query<{
              phone_e164: string;
              name: string | null;
              contact_id: string;
            }>(
              `SELECT DISTINCT c.phone_e164, c.name, c.id as contact_id
               FROM public.contacts c
               INNER JOIN public.commercial_journeys cj ON cj.contact_id = c.id AND cj.workspace_id = c.workspace_id
               WHERE c.workspace_id = $1 AND c.opt_out = false AND c.phone_e164 IS NOT NULL AND LOWER(cj.stage) = LOWER($2);`,
              [workspaceId, audience.stage]
            );
            targetNumbers = stageRes.rows;
          } else {
            // ALL_CONTACTS
            const allRes = await client.query<{
              phone_e164: string;
              name: string | null;
              id: string;
            }>(
              `SELECT c.phone_e164, c.name, c.id as contact_id
               FROM public.contacts c
               WHERE c.workspace_id = $1 AND c.opt_out = false AND c.phone_e164 IS NOT NULL
               LIMIT 500;`,
              [workspaceId]
            );
            targetNumbers = allRes.rows;
          }

          return { channel: ch, template: tpl, recipients: targetNumbers };
        }
      );

      if (!channel) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Canal de envio não encontrado no workspace",
          instance: request.url,
          correlationId: request.id,
        });
      }

      if (!channel.is_active || channel.status !== "connected") {
        return reply.status(422).send({
          type: "https://sos-sales.mct.br/errors/channel-inactive",
          title: "Canal Inativo",
          status: 422,
          detail: `O canal "${channel.display_name}" não está conectado no momento.`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      // 🛑 MANDATORY BILLING GUARDRAIL: Lock if no direct card configured on Meta
      if (channel.provider === "meta_waba" && !channel.meta_billing_configured) {
        return reply.status(422).send({
          type: "https://sos-sales.mct.br/errors/meta-billing-unconfigured",
          title: "Disparo Bloqueado — Cartão de Crédito Meta Não Configurado",
          status: 422,
          detail:
            "Disparo ativo bloqueado: Para realizar disparos de modelos na API Oficial da Meta, este canal precisa ter o cartão de crédito cadastrado diretamente no seu Gerenciador de Negócios da Meta (Meta Business Manager). O SOS Sales não cobra nem intermedeia tarifas de mensagens. Cadastre a forma de pagamento na Meta e ative a confirmação no canal para liberar disparos ativos.",
          instance: request.url,
          correlationId: request.id,
        });
      }

      if (!template) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Modelo de mensagem não encontrado",
          instance: request.url,
          correlationId: request.id,
        });
      }

      if (template.status !== "APPROVED") {
        return reply.status(422).send({
          type: "https://sos-sales.mct.br/errors/template-not-approved",
          title: "Modelo Não Aprovado",
          status: 422,
          detail: `O modelo "${template.name}" está com status "${template.status}". Apenas modelos APROVADOS podem ser disparados.`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      if (recipients.length === 0) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/empty-audience",
          title: "Público Vazio",
          status: 400,
          detail: "Nenhum contato ativo encontrado para os critérios de público selecionados.",
          instance: request.url,
          correlationId: request.id,
        });
      }

      // Enqueue outbound messages via Producer
      let enqueuedCount = 0;
      const batchId = crypto.randomUUID();

      for (const rec of recipients) {
        const idempotencyKey = `bcast_${batchId}_${rec.phone_e164}_${Date.now()}`;
        const context: TrustedOutboundContext = {
          workspaceId,
          channelInstanceId: channel.id,
          actorId: request.user.id,
          role: request.activeRole || "owner",
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"],
        };

        // Render template body for text preview
        let renderedBody = template.body_text;
        Object.entries(variables).forEach(([k, v]) => {
          renderedBody = renderedBody.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
        });

        try {
          await producerService.produce(
            {
              recipientE164: rec.phone_e164,
              contentType: "text",
              textBody: renderedBody,
              idempotencyKey,
            },
            context
          );
          enqueuedCount++;
        } catch {
          // Continue with next recipient
        }
      }

      // Audit event
      await withTenantTransaction(workspaceId, async (client) => {
        await client.query(
          `INSERT INTO public.audit_events (
             workspace_id, actor_id, event_type, entity_type, entity_id, payload
           ) VALUES ($1, $2, $3, $4, $5, $6);`,
          [
            workspaceId,
            request.user.id,
            "broadcast.dispatched",
            "message_template",
            template.id,
            JSON.stringify({
              batchId,
              channelId: channel.id,
              channelName: channel.display_name,
              templateName: template.name,
              templateCategory: template.category,
              recipientsTargeted: recipients.length,
              enqueuedCount,
              billingMode: "DIRECT_TO_META_CUSTOMER_ACCOUNT",
            }),
          ]
        );
      });

      return reply.status(200).send({
        success: true,
        batchId,
        enqueuedCount,
        totalTargeted: recipients.length,
        template: {
          name: template.name,
          category: template.category,
        },
        channel: {
          id: channel.id,
          displayName: channel.display_name,
          provider: channel.provider,
        },
        billingSummary: {
          policy: "DIRECT_TO_META_CUSTOMER_ACCOUNT",
          estimatedUnitCost:
            template.category === "UTILITY"
              ? "R$ 0,03 a R$ 0,06 (Cobrado direto na Meta)"
              : "R$ 0,35 a R$ 0,45 (Cobrado direto na Meta)",
          message: "Todas as tarifas de conversa serão debitadas no cartão de crédito cadastrado pelo cliente no Gerenciador da Meta.",
        },
      });
    }
  );
};
