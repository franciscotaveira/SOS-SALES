import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { withTenantTransaction, createOrGetContact } from "@sos-sales/database";
import {
  TransactionalOutboundProducerService,
  type ITransactionalOutboundProducerService,
} from "@sos-sales/application";
import type { TrustedOutboundContext } from "@sos-sales/contracts";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const createBroadcastBodySchema = z.object({
  name: z.string().max(120).optional(),
  channelInstanceId: z.string().uuid(),
  templateId: z.string().uuid(),
  isAbTest: z.boolean().optional().default(false),
  variantBTemplateId: z.string().uuid().optional(),
  audience: z.object({
    type: z.enum(["ALL_CONTACTS", "BY_STAGE", "MANUAL", "IMPORT_LIST", "SMART_FILTER"]),
    stage: z.string().max(50).optional(),
    customPhoneNumbers: z.array(z.string().regex(/^\+[1-9][0-9]{8,14}$/)).max(1000).optional(),
    importedContacts: z
      .array(
        z.object({
          phoneE164: z.string().regex(/^\+[1-9][0-9]{8,14}$/),
          name: z.string().max(150).nullable().optional(),
        })
      )
      .max(1000)
      .optional(),
    smartFilter: z.enum(["NON_BUYERS", "INACTIVE_30_DAYS", "CTWA_RESCUE"]).optional(),
  }),
  variables: z.record(z.string().max(200)).optional(),
  variantBVariables: z.record(z.string().max(200)).optional(),
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
        templates: preflightData.templates.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          headerText: t.header_text || undefined,
          bodyText: t.body_text || "",
          variables: t.variables || [],
          status: t.status,
        })),
        totalActiveContacts: preflightData.totalActiveContacts,
        billingNotice: {
          policy: "DIRECT_TO_META_CUSTOMER_ACCOUNT",
          description:
            "O Chat Sales não cobra nem intermedeia custos de mensagens Meta. Todo envio ativo no canal oficial é debitado diretamente no cartão de crédito cadastrado na Meta pelo cliente.",
        },
      });
    }
  );

  // 1.1 GET /v1/workspaces/:workspaceId/broadcasts/audience-count
  // Fast query to provide live recipient counter for any audience type or smart filter
  app.get(
    "/v1/workspaces/:workspaceId/broadcasts/audience-count",
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

      const querySchema = z.object({
        type: z.enum(["ALL_CONTACTS", "BY_STAGE", "SMART_FILTER"]),
        stage: z.string().optional(),
        smartFilter: z.enum(["NON_BUYERS", "INACTIVE_30_DAYS", "CTWA_RESCUE"]).optional(),
      });

      const parsedQuery = querySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parsedQuery.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const { type, stage, smartFilter } = parsedQuery.data;

      const count = await withTenantTransaction(workspaceId, async (client) => {
        if (type === "BY_STAGE" && stage) {
          const res = await client.query<{ count: string }>(
            `SELECT count(DISTINCT c.id)::text as count
             FROM public.contacts c
             INNER JOIN public.commercial_journeys cj ON cj.contact_id = c.id AND cj.workspace_id = c.workspace_id
             WHERE c.workspace_id = $1 AND c.opt_out = false AND c.phone_e164 IS NOT NULL AND LOWER(cj.stage) = LOWER($2);`,
            [workspaceId, stage]
          );
          return Number(res.rows[0]?.count || 0);
        }

        if (type === "SMART_FILTER" && smartFilter) {
          if (smartFilter === "NON_BUYERS") {
            const res = await client.query<{ count: string }>(
              `SELECT count(DISTINCT c.id)::text as count
               FROM public.contacts c
               WHERE c.workspace_id = $1 
                 AND c.opt_out = false 
                 AND c.phone_e164 IS NOT NULL
                 AND NOT EXISTS (
                   SELECT 1 FROM public.commercial_journeys cj 
                   WHERE cj.contact_id = c.id 
                     AND cj.workspace_id = c.workspace_id 
                     AND LOWER(cj.stage) = 'won'
                 );`,
              [workspaceId]
            );
            return Number(res.rows[0]?.count || 0);
          }
          if (smartFilter === "INACTIVE_30_DAYS") {
            const res = await client.query<{ count: string }>(
              `SELECT count(*)::text as count
               FROM public.contacts c
               WHERE c.workspace_id = $1 
                 AND c.opt_out = false 
                 AND c.phone_e164 IS NOT NULL
                 AND NOT EXISTS (
                   SELECT 1 FROM public.messages m
                   WHERE m.contact_id = c.id 
                     AND m.workspace_id = c.workspace_id
                     AND m.created_at >= (now() - interval '30 days')
                 );`,
              [workspaceId]
            );
            return Number(res.rows[0]?.count || 0);
          }
          if (smartFilter === "CTWA_RESCUE") {
            const res = await client.query<{ count: string }>(
              `SELECT count(DISTINCT c.id)::text as count
               FROM public.contacts c
               INNER JOIN public.commercial_journeys cj ON cj.contact_id = c.id AND cj.workspace_id = c.workspace_id
               WHERE c.workspace_id = $1 
                 AND c.opt_out = false 
                 AND c.phone_e164 IS NOT NULL
                 AND cj.attribution_source = 'ctwa_meta'
                 AND LOWER(cj.stage) IN ('lead', 'qualified');`,
              [workspaceId]
            );
            return Number(res.rows[0]?.count || 0);
          }
        }

        // Default: ALL_CONTACTS
        const res = await client.query<{ count: string }>(
          `SELECT count(*)::text as count
           FROM public.contacts
           WHERE workspace_id = $1 AND opt_out = false AND phone_e164 IS NOT NULL;`,
          [workspaceId]
        );
        return Number(res.rows[0]?.count || 0);
      });

      return reply.status(200).send({
        success: true,
        type,
        stage,
        smartFilter,
        count,
      });
    }
  );

  // 2. GET /v1/workspaces/:workspaceId/broadcasts/campaigns
  // Email-marketing style campaign list with delivery, read, click, and reply rates + A/B test comparison
  app.get(
    "/v1/workspaces/:workspaceId/broadcasts/campaigns",
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

      const campaigns = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query<{
          id: string;
          name: string;
          status: string;
          channel_instance_id: string;
          channel_name: string;
          channel_provider: string;
          is_ab_test: boolean;
          variant_a_template_id: string;
          variant_a_name: string;
          variant_a_category: string;
          variant_b_template_id: string | null;
          variant_b_name: string | null;
          variant_b_category: string | null;
          audience_type: string;
          audience_stage: string | null;
          total_targeted: number;
          sent_count: number;
          delivered_count: number;
          read_count: number;
          replied_count: number;
          clicked_count: number;
          failed_count: number;
          created_at: Date;
        }>(
          `SELECT c.id, c.name, c.status, c.channel_instance_id,
                  ci.display_name as channel_name, ci.provider as channel_provider,
                  c.is_ab_test,
                  c.variant_a_template_id, tpl_a.name as variant_a_name, tpl_a.category as variant_a_category,
                  c.variant_b_template_id, tpl_b.name as variant_b_name, tpl_b.category as variant_b_category,
                  c.audience_type, c.audience_stage,
                  c.total_targeted, c.sent_count, c.delivered_count, c.read_count,
                  c.replied_count, c.clicked_count, c.failed_count, c.created_at
           FROM public.broadcast_campaigns c
           LEFT JOIN public.channel_instances ci ON ci.id = c.channel_instance_id AND ci.workspace_id = c.workspace_id
           LEFT JOIN public.message_templates tpl_a ON tpl_a.id = c.variant_a_template_id AND tpl_a.workspace_id = c.workspace_id
           LEFT JOIN public.message_templates tpl_b ON tpl_b.id = c.variant_b_template_id AND tpl_b.workspace_id = c.workspace_id
           WHERE c.workspace_id = $1
           ORDER BY c.created_at DESC
           LIMIT 50;`,
          [workspaceId]
        );

        // Fetch A/B breakdowns for split test campaigns
        const campaignsWithAb = await Promise.all(
          res.rows.map(async (camp) => {
            const sent = Number(camp.sent_count || 0);
            const delivered = Number(camp.delivered_count || 0);
            const read = Number(camp.read_count || 0);
            const replied = Number(camp.replied_count || 0);
            const clicked = Number(camp.clicked_count || 0);

            const deliveryRate = sent > 0 ? Number(((delivered / sent) * 100).toFixed(1)) : 0;
            const openRate = delivered > 0 ? Number(((read / delivered) * 100).toFixed(1)) : 0;
            const replyRate = delivered > 0 ? Number(((replied / delivered) * 100).toFixed(1)) : 0;
            const ctr = delivered > 0 ? Number(((clicked / delivered) * 100).toFixed(1)) : 0;

            // Pix Sales Attribution (Truth in Data)
            // Attributes paid Pix charges to broadcast recipients who converted on or after campaign dispatch
            const salesRes = await client.query<{
              variant: string;
              sales_count: string;
              sales_cents: string;
            }>(
              `SELECT COALESCE(br.variant, 'A') as variant,
                      COALESCE(count(DISTINCT pc.id), 0) as sales_count,
                      COALESCE(sum(pc.amount_cents), 0) as sales_cents
               FROM public.broadcast_recipients br
               JOIN public.pix_charges pc 
                 ON pc.contact_id = br.contact_id 
                 AND pc.workspace_id = br.workspace_id
                 AND pc.status = 'PAID'
                 AND pc.paid_at >= br.sent_at
               WHERE br.workspace_id = $1 AND br.campaign_id = $2
               GROUP BY br.variant;`,
              [workspaceId, camp.id]
            );

            let totalSalesCount = 0;
            let totalSalesCents = 0;
            let salesCountA = 0;
            let salesCentsA = 0;
            let salesCountB = 0;
            let salesCentsB = 0;

            for (const row of salesRes.rows) {
              const count = Number(row.sales_count || 0);
              const cents = Number(row.sales_cents || 0);
              totalSalesCount += count;
              totalSalesCents += cents;
              if (row.variant === "A") {
                salesCountA += count;
                salesCentsA += cents;
              } else if (row.variant === "B") {
                salesCountB += count;
                salesCentsB += cents;
              }
            }

            const totalConversionRate = delivered > 0 ? Number(((totalSalesCount / delivered) * 100).toFixed(2)) : 0;
            const averageTicketCents = totalSalesCount > 0 ? Math.round(totalSalesCents / totalSalesCount) : 0;
            const totalFormatted = (totalSalesCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            const averageTicketFormatted = (averageTicketCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

            let abReport = null;

            if (camp.is_ab_test) {
              const abRes = await client.query<{
                variant: string;
                sent: string;
                delivered: string;
                read: string;
                replied: string;
                clicked: string;
              }>(
                `SELECT variant,
                        count(*) as sent,
                        count(*) FILTER (WHERE delivered_at IS NOT NULL) as delivered,
                        count(*) FILTER (WHERE read_at IS NOT NULL) as read,
                        count(*) FILTER (WHERE replied_at IS NOT NULL) as replied,
                        count(*) FILTER (WHERE clicked_at IS NOT NULL) as clicked
                 FROM public.broadcast_recipients
                 WHERE workspace_id = $1 AND campaign_id = $2
                 GROUP BY variant;`,
                [workspaceId, camp.id]
              );

              const rowA = abRes.rows.find((r) => r.variant === "A") || {
                sent: "0", delivered: "0", read: "0", replied: "0", clicked: "0",
              };
              const rowB = abRes.rows.find((r) => r.variant === "B") || {
                sent: "0", delivered: "0", read: "0", replied: "0", clicked: "0",
              };

              const sentA = Number(rowA.sent);
              const delA = Number(rowA.delivered);
              const readA = Number(rowA.read);
              const repA = Number(rowA.replied);
              const openRateA = delA > 0 ? Number(((readA / delA) * 100).toFixed(1)) : 0;
              const replyRateA = delA > 0 ? Number(((repA / delA) * 100).toFixed(1)) : 0;
              const convRateA = delA > 0 ? Number(((salesCountA / delA) * 100).toFixed(2)) : 0;
              const salesFormattedA = (salesCentsA / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

              const sentB = Number(rowB.sent);
              const delB = Number(rowB.delivered);
              const readB = Number(rowB.read);
              const repB = Number(rowB.replied);
              const openRateB = delB > 0 ? Number(((readB / delB) * 100).toFixed(1)) : 0;
              const replyRateB = delB > 0 ? Number(((repB / delB) * 100).toFixed(1)) : 0;
              const convRateB = delB > 0 ? Number(((salesCountB / delB) * 100).toFixed(2)) : 0;
              const salesFormattedB = (salesCentsB / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

              let winner: "A" | "B" | "TIED" = "TIED";
              // Highest revenue determines the commercial winner. If revenue tied, fallback to conversion, replies, opens
              if (salesCentsA > salesCentsB) winner = "A";
              else if (salesCentsB > salesCentsA) winner = "B";
              else if (convRateA > convRateB) winner = "A";
              else if (convRateB > convRateA) winner = "B";
              else if (replyRateA > replyRateB) winner = "A";
              else if (replyRateB > replyRateA) winner = "B";
              else if (openRateA > openRateB) winner = "A";
              else if (openRateB > openRateA) winner = "B";

              abReport = {
                winner,
                variantA: {
                  templateName: camp.variant_a_name,
                  category: camp.variant_a_category,
                  sent: sentA,
                  delivered: delA,
                  read: readA,
                  replied: repA,
                  openRate: openRateA,
                  replyRate: replyRateA,
                  salesCount: salesCountA,
                  salesCents: salesCentsA,
                  salesFormatted: salesFormattedA,
                  conversionRate: convRateA,
                },
                variantB: {
                  templateName: camp.variant_b_name,
                  category: camp.variant_b_category,
                  sent: sentB,
                  delivered: delB,
                  read: readB,
                  replied: repB,
                  openRate: openRateB,
                  replyRate: replyRateB,
                  salesCount: salesCountB,
                  salesCents: salesCentsB,
                  salesFormatted: salesFormattedB,
                  conversionRate: convRateB,
                },
              };
            }

            return {
              id: camp.id,
              name: camp.name,
              status: camp.status,
              channel: {
                id: camp.channel_instance_id,
                name: camp.channel_name || "Linha WhatsApp",
                provider: camp.channel_provider,
              },
              isAbTest: camp.is_ab_test,
              template: {
                id: camp.variant_a_template_id,
                name: camp.variant_a_name,
                category: camp.variant_a_category,
              },
              audienceType: camp.audience_type,
              audienceStage: camp.audience_stage,
              totalTargeted: Number(camp.total_targeted),
              metrics: {
                sent,
                delivered,
                read,
                replied,
                clicked,
                deliveryRate,
                openRate,
                replyRate,
                ctr,
                salesCount: totalSalesCount,
                salesCents: totalSalesCents,
                conversionRate: totalConversionRate,
                averageTicketCents,
              },
              sales: {
                count: totalSalesCount,
                totalCents: totalSalesCents,
                totalFormatted,
                conversionRate: totalConversionRate,
                averageTicketCents,
                averageTicketFormatted,
              },
              abReport,
              createdAt: camp.created_at.toISOString(),
            };
          })
        );

        return campaignsWithAb;
      });

      return reply.status(200).send({
        success: true,
        campaigns,
      });
    }
  );

  // 3. POST /v1/workspaces/:workspaceId/broadcasts
  // Executes active broadcast or 50/50 A/B split test with MANDATORY Credit Card / Meta Billing Guardrail
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
      const {
        name: customName,
        channelInstanceId,
        templateId,
        isAbTest = false,
        variantBTemplateId,
        audience,
        variables = {},
        variantBVariables = {},
      } = parsedBody.data;

      // 1. Verify Channel & Apply Mandatory Meta Billing Gate
      const { channel, templateA, templateB, recipients } = await withTenantTransaction(
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
            return { channel: null, templateA: null, templateB: null, recipients: [] };
          }

          // Fetch Template A
          const tplARes = await client.query<{
            id: string;
            name: string;
            category: string;
            body_text: string;
            status: string;
            language: string;
          }>(
            `SELECT id, name, category, body_text, status, language
             FROM public.message_templates
             WHERE id = $1 AND workspace_id = $2;`,
            [templateId, workspaceId]
          );
          const tplA = tplARes.rows[0] || null;

          // Fetch Template B if A/B test
          let tplB = null;
          if (isAbTest && variantBTemplateId) {
            const tplBRes = await client.query<{
              id: string;
              name: string;
              category: string;
              body_text: string;
              status: string;
              language: string;
            }>(
              `SELECT id, name, category, body_text, status, language
               FROM public.message_templates
               WHERE id = $1 AND workspace_id = $2;`,
              [variantBTemplateId, workspaceId]
            );
            tplB = tplBRes.rows[0] || null;
          }

          // Resolve Audience
          let targetNumbers: Array<{ phone_e164: string; name?: string | null; contact_id?: string }> = [];

          if (audience.type === "IMPORT_LIST" && audience.importedContacts) {
            // Upsert each imported contact safely under workspace RLS and exclude opt-outs
            for (const item of audience.importedContacts) {
              const contact = await createOrGetContact(client, {
                workspaceId,
                phoneE164: item.phoneE164,
                name: item.name || undefined,
              });
              if (!contact.opt_out) {
                targetNumbers.push({
                  phone_e164: contact.phone_e164,
                  name: contact.name,
                  contact_id: contact.id,
                });
              }
            }
          } else if (audience.type === "SMART_FILTER" && audience.smartFilter) {
            if (audience.smartFilter === "NON_BUYERS") {
              const res = await client.query<{
                phone_e164: string;
                name: string | null;
                contact_id: string;
              }>(
                `SELECT DISTINCT c.phone_e164, c.name, c.id as contact_id
                 FROM public.contacts c
                 WHERE c.workspace_id = $1 
                   AND c.opt_out = false 
                   AND c.phone_e164 IS NOT NULL
                   AND NOT EXISTS (
                     SELECT 1 FROM public.commercial_journeys cj 
                     WHERE cj.contact_id = c.id 
                       AND cj.workspace_id = c.workspace_id 
                       AND LOWER(cj.stage) = 'won'
                   )
                 LIMIT 1000;`,
                [workspaceId]
              );
              targetNumbers = res.rows;
            } else if (audience.smartFilter === "INACTIVE_30_DAYS") {
              const res = await client.query<{
                phone_e164: string;
                name: string | null;
                contact_id: string;
              }>(
                `SELECT c.phone_e164, c.name, c.id as contact_id
                 FROM public.contacts c
                 WHERE c.workspace_id = $1 
                   AND c.opt_out = false 
                   AND c.phone_e164 IS NOT NULL
                   AND NOT EXISTS (
                     SELECT 1 FROM public.messages m
                     WHERE m.contact_id = c.id 
                       AND m.workspace_id = c.workspace_id
                       AND m.created_at >= (now() - interval '30 days')
                   )
                 LIMIT 1000;`,
                [workspaceId]
              );
              targetNumbers = res.rows;
            } else if (audience.smartFilter === "CTWA_RESCUE") {
              const res = await client.query<{
                phone_e164: string;
                name: string | null;
                contact_id: string;
              }>(
                `SELECT DISTINCT c.phone_e164, c.name, c.id as contact_id
                 FROM public.contacts c
                 INNER JOIN public.commercial_journeys cj ON cj.contact_id = c.id AND cj.workspace_id = c.workspace_id
                 WHERE c.workspace_id = $1 
                   AND c.opt_out = false 
                   AND c.phone_e164 IS NOT NULL
                   AND cj.attribution_source = 'ctwa_meta'
                   AND LOWER(cj.stage) IN ('lead', 'qualified')
                 LIMIT 1000;`,
                [workspaceId]
              );
              targetNumbers = res.rows;
            }
          } else if (audience.type === "MANUAL" && audience.customPhoneNumbers) {
            for (const phone of audience.customPhoneNumbers) {
              const contact = await createOrGetContact(client, {
                workspaceId,
                phoneE164: phone,
              });
              if (!contact.opt_out) {
                targetNumbers.push({
                  phone_e164: contact.phone_e164,
                  name: contact.name,
                  contact_id: contact.id,
                });
              }
            }
          } else if (audience.type === "BY_STAGE" && audience.stage) {
            const stageRes = await client.query<{
              phone_e164: string;
              name: string | null;
              contact_id: string;
            }>(
              `SELECT DISTINCT c.phone_e164, c.name, c.id as contact_id
               FROM public.contacts c
               INNER JOIN public.commercial_journeys cj ON cj.contact_id = c.id AND cj.workspace_id = c.workspace_id
               WHERE c.workspace_id = $1 AND c.opt_out = false AND c.phone_e164 IS NOT NULL AND LOWER(cj.stage) = LOWER($2)
               LIMIT 1000;`,
              [workspaceId, audience.stage]
            );
            targetNumbers = stageRes.rows;
          } else {
            // ALL_CONTACTS
            const allRes = await client.query<{
              phone_e164: string;
              name: string | null;
              contact_id: string;
            }>(
              `SELECT c.phone_e164, c.name, c.id as contact_id
               FROM public.contacts c
               WHERE c.workspace_id = $1 AND c.opt_out = false AND c.phone_e164 IS NOT NULL
               LIMIT 1000;`,
              [workspaceId]
            );
            targetNumbers = allRes.rows;
          }

          return { channel: ch, templateA: tplA, templateB: tplB, recipients: targetNumbers };
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
            "Disparo ativo bloqueado: Para realizar disparos de modelos na API Oficial da Meta, este canal precisa ter o cartão de crédito cadastrado diretamente no seu Gerenciador de Negócios da Meta (Meta Business Manager). O Chat Sales não cobra nem intermedeia tarifas de mensagens. Cadastre a forma de pagamento na Meta e ative a confirmação no canal para liberar disparos ativos.",
          instance: request.url,
          correlationId: request.id,
        });
      }

      if (!templateA) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Modelo de mensagem (Variante A) não encontrado",
          instance: request.url,
          correlationId: request.id,
        });
      }

      if (templateA.status !== "APPROVED") {
        return reply.status(422).send({
          type: "https://sos-sales.mct.br/errors/template-not-approved",
          title: "Modelo A Não Aprovado",
          status: 422,
          detail: `O modelo "${templateA.name}" está com status "${templateA.status}". Apenas modelos APROVADOS podem ser disparados.`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      if (isAbTest) {
        if (!templateB) {
          return reply.status(404).send({
            type: "https://sos-sales.mct.br/errors/not-found",
            title: "Not Found",
            status: 404,
            detail: "Modelo de mensagem para o Teste A/B (Variante B) não encontrado",
            instance: request.url,
            correlationId: request.id,
          });
        }
        if (templateB.status !== "APPROVED") {
          return reply.status(422).send({
            type: "https://sos-sales.mct.br/errors/template-not-approved",
            title: "Modelo B Não Aprovado",
            status: 422,
            detail: `O modelo B "${templateB.name}" está com status "${templateB.status}". Apenas modelos APROVADOS podem ser disparados.`,
            instance: request.url,
            correlationId: request.id,
          });
        }
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

      // Generate Campaign Name
      const campaignName =
        customName?.trim() ||
        (isAbTest
          ? `Teste A/B: ${templateA.name} vs ${templateB?.name} · ${new Date().toLocaleDateString("pt-BR")}`
          : `${templateA.name} · ${new Date().toLocaleDateString("pt-BR")}`);

      // 2. Create Campaign Record in Database
      const campaign = await withTenantTransaction(workspaceId, async (client) => {
        const campRes = await client.query<{ id: string }>(
          `INSERT INTO public.broadcast_campaigns (
             workspace_id, name, channel_instance_id, is_ab_test,
             variant_a_template_id, variant_b_template_id,
             audience_type, audience_stage, total_targeted, status
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed')
           RETURNING id;`,
          [
            workspaceId,
            campaignName,
            channel.id,
            isAbTest,
            templateA.id,
            templateB ? templateB.id : null,
            audience.type,
            audience.stage || null,
            recipients.length,
          ]
        );
        return campRes.rows[0]!;
      });

      // 3. Enqueue Outbound Messages via Producer & Track Granular Recipients
      let enqueuedCount = 0;

      for (let i = 0; i < recipients.length; i++) {
        const rec = recipients[i]!;
        // 50/50 Split for A/B Test
        const isVariantB = isAbTest && Boolean(templateB) && i % 2 !== 0;
        const currentVariant = isVariantB ? "B" : "A";
        const currentTemplate = isVariantB && templateB ? templateB : templateA;
        const currentVariables = isVariantB ? variantBVariables : variables;

        // Render template body
        let renderedBody = currentTemplate.body_text;
        Object.entries(currentVariables).forEach(([k, v]) => {
          renderedBody = renderedBody.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
        });

        const idempotencyKey = `bcast_${campaign.id}_${rec.phone_e164}_${Date.now()}`;
        const rawRole = request.activeRole || "owner";
        const role = (["owner", "admin", "manager", "operator"].includes(rawRole)
          ? rawRole
          : "owner") as "owner" | "admin" | "manager" | "operator";

        const context: TrustedOutboundContext = {
          workspaceId,
          channelInstanceId: channel.id,
          actorId: request.user.id,
          role,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"],
        };

        const isMetaWaba = channel.provider === "meta_waba";
        const bodyParameters = Object.entries(currentVariables).map(([_, val]) => ({
          type: "text",
          text: String(val),
        }));

        try {
          const produceResult = await producerService.produce(
            {
              recipientPhoneE164: rec.phone_e164,
              contentType: isMetaWaba ? "template" : "text",
              body: renderedBody,
              template: isMetaWaba
                ? {
                    name: currentTemplate.name,
                    language: currentTemplate.language || "pt_BR",
                    components:
                      bodyParameters.length > 0
                        ? [{ type: "body" as const, parameters: bodyParameters }]
                        : [],
                  }
                : undefined,
              idempotencyKey,
            },
            context
          );

          // Track in broadcast_recipients
          await withTenantTransaction(workspaceId, async (client) => {
            await client.query(
              `INSERT INTO public.broadcast_recipients (
                 campaign_id, workspace_id, contact_id, phone_e164, variant, template_id, outbound_command_id, status
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'sent');`,
              [
                campaign.id,
                workspaceId,
                rec.contact_id || null,
                rec.phone_e164,
                currentVariant,
                currentTemplate.id,
                produceResult.commandId,
              ]
            );
          });

          enqueuedCount++;
        } catch {
          // Continue with next recipient
        }
      }

      // Update Campaign sent count
      await withTenantTransaction(workspaceId, async (client) => {
        await client.query(
          `UPDATE public.broadcast_campaigns
           SET sent_count = $1, updated_at = clock_timestamp()
           WHERE id = $2 AND workspace_id = $3;`,
          [enqueuedCount, campaign.id, workspaceId]
        );

        // Audit Event
        await client.query(
          `INSERT INTO public.audit_events (
             workspace_id, actor_id, event_type, entity_type, entity_id, payload
           ) VALUES ($1, $2, $3, $4, $5, $6);`,
          [
            workspaceId,
            request.user.id,
            "broadcast.dispatched",
            "broadcast_campaign",
            campaign.id,
            JSON.stringify({
              campaignId: campaign.id,
              campaignName,
              channelId: channel.id,
              channelName: channel.display_name,
              isAbTest,
              templateAName: templateA.name,
              templateBName: templateB?.name || null,
              recipientsTargeted: recipients.length,
              enqueuedCount,
              billingMode: "DIRECT_TO_META_CUSTOMER_ACCOUNT",
            }),
          ]
        );
      });

      return reply.status(200).send({
        success: true,
        batchId: campaign.id,
        campaignId: campaign.id,
        campaignName,
        enqueuedCount,
        totalTargeted: recipients.length,
        isAbTest,
        template: {
          name: templateA.name,
          category: templateA.category,
        },
        templateB: templateB
          ? {
              name: templateB.name,
              category: templateB.category,
            }
          : undefined,
        channel: {
          id: channel.id,
          displayName: channel.display_name,
          provider: channel.provider,
        },
        billingSummary: {
          policy: "DIRECT_TO_META_CUSTOMER_ACCOUNT",
          estimatedUnitCost:
            templateA.category === "UTILITY"
              ? "R$ 0,03 a R$ 0,06 (Cobrado direto na Meta)"
              : "R$ 0,35 a R$ 0,45 (Cobrado direto na Meta)",
          message: "Todas as tarifas de conversa serão debitadas no cartão de crédito cadastrado pelo cliente no Gerenciador da Meta.",
        },
      });
    }
  );
};
