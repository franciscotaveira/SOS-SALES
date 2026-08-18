import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { WahaSyncService } from '../../../infrastructure/channels/waha/waha-sync-service.js';
import { WabaClient } from '../../../infrastructure/channels/meta/waba-client.js';
import { dbPool } from '../../../infrastructure/database/pool.js';
import { AttributionService } from '../../../application/services/attribution-service.js';
import crypto from 'node:crypto';

const WAHA_BASE_URL = process.env.WAHA_BASE_URL || 'http://sos-sales-waha:3000';
const WAHA_API_KEY = process.env.WAHA_API_KEY || 'mct_sos_waha_master_2026';
const PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://sos-sales-api:4334';

function getSessionName(workspaceId: string): string {
  if (workspaceId.includes('haven') || workspaceId.includes('22222222')) return 'haven';
  if (workspaceId.includes('sora') || workspaceId.includes('33333333')) return 'sora';
  return 'default';
}

function getWorkspaceIdFromSession(sessionName: string): string {
  if (sessionName === 'haven') return '22222222-2222-2222-2222-222222222222';
  if (sessionName === 'sora') return '33333333-3333-3333-3333-333333333333';
  return '11111111-1111-1111-1111-111111111111';
}

export async function whatsappChannelRoutes(app: FastifyInstance): Promise<void> {
  // 1. Get Live QR Code
  app.get('/api/v1/workspaces/:workspaceId/channels/whatsapp/qr', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const sessionName = getSessionName(workspaceId);

    try {
      const listRes = await fetch(`${WAHA_BASE_URL}/api/sessions?all=true`, {
        headers: { 'x-api-key': WAHA_API_KEY },
      });

      if (!listRes.ok) {
        return reply.status(502).send({ error: 'WAHA connection failed', statusCode: 502 });
      }

      const sessions = (await listRes.json()) as Array<{ name: string; status: string; me?: any }>;
      let session = sessions.find((s) => s.name === sessionName);

      if (!session || session.status === 'STOPPED' || session.status === 'FAILED') {
        const startRes = await fetch(`${WAHA_BASE_URL}/api/sessions/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': WAHA_API_KEY },
          body: JSON.stringify({
            name: sessionName,
            config: {
              webhooks: [{ url: `${PUBLIC_API_URL}/api/v1/channels/waha/webhook`, events: ['message', 'message.any', 'session.status'] }],
            },
          }),
        });
        session = (await startRes.json()) as { name: string; status: string; me?: any };
      }

      if (session.status === 'WORKING') {
        WahaSyncService.syncWorkspaceChats(workspaceId, sessionName, 35).catch((err) => {
          request.log.error({ err }, 'Background sync error');
        });

        return {
          status: 'WORKING',
          session: sessionName,
          me: session.me || null,
          message: 'WhatsApp já conectado e operacional.',
        };
      }

      if (session.status === 'STARTING') {
        return {
          status: 'STARTING',
          session: sessionName,
          qr: null,
          message: 'Iniciando WhatsApp... aguarde alguns segundos.',
        };
      }

      const qrRes = await fetch(`${WAHA_BASE_URL}/api/${sessionName}/auth/qr`, {
        headers: { 'x-api-key': WAHA_API_KEY, Accept: 'image/png' },
      });

      if (!qrRes.ok) {
        return {
          status: session.status || 'STARTING',
          session: sessionName,
          qr: null,
          message: 'Gerando QR Code... aguarde 2 segundos.',
        };
      }

      const arrayBuffer = await qrRes.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const dataUrl = `data:image/png;base64,${base64}`;

      return {
        status: 'SCAN_QR_CODE',
        session: sessionName,
        qr: dataUrl,
      };
    } catch (err: any) {
      request.log.error({ err: err.message }, 'Failed to fetch WAHA QR code');
      return reply.status(500).send({ error: err.message, statusCode: 500 });
    }
  });

  // 2. WhatsApp Channel Status (WAHA)
  app.get('/api/v1/workspaces/:workspaceId/channels/whatsapp/status', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const sessionName = getSessionName(workspaceId);

    try {
      const listRes = await fetch(`${WAHA_BASE_URL}/api/sessions?all=true`, {
        headers: { 'x-api-key': WAHA_API_KEY },
      });

      if (!listRes.ok) {
        return reply.status(502).send({ error: 'WAHA connection failed', statusCode: 502 });
      }

      const sessions = (await listRes.json()) as Array<{ name: string; status: string; me?: any }>;
      let session = sessions.find((s) => s.name === sessionName && s.status === 'WORKING') ||
                    sessions.find((s) => s.name === sessionName) ||
                    sessions.find((s) => s.status === 'WORKING');

      return {
        session: session?.name || sessionName,
        status: session ? session.status : 'STOPPED',
        me: session?.me || null,
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message, statusCode: 500 });
    }
  });

  // 3. Logout / Disconnect WhatsApp Session (WAHA)
  app.post('/api/v1/workspaces/:workspaceId/channels/whatsapp/logout', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const sessionName = getSessionName(workspaceId);

    try {
      // 1. Delete session completely in WAHA (wipes auth directory & unlinks phone)
      try {
        await fetch(`${WAHA_BASE_URL}/api/sessions/${sessionName}`, {
          method: 'DELETE',
          headers: { 'x-api-key': WAHA_API_KEY },
        });
      } catch {
        // ignore
      }

      // 2. Re-create a fresh session ready to scan
      try {
        await fetch(`${WAHA_BASE_URL}/api/sessions/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': WAHA_API_KEY },
          body: JSON.stringify({
            name: sessionName,
            config: {
              webhooks: [{ url: `${PUBLIC_API_URL}/api/v1/channels/waha/webhook`, events: ['message', 'message.any', 'session.status'] }],
            },
          }),
        });
      } catch {
        // ignore
      }

      // 3. Update database status
      const client = await dbPool.connect();
      try {
        await client.query(`
          UPDATE public.channel_connections
          SET status = 'DISCONNECTED', updated_at = NOW()
          WHERE workspace_id = $1 AND provider = 'waha'
        `, [workspaceId]);
      } finally {
        client.release();
      }

      return {
        success: true,
        session: sessionName,
        message: 'WhatsApp desconectado com sucesso. A sessão foi limpa e está pronta para escanear novo QR Code.',
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message, statusCode: 500 });
    }
  });

  // 4. Manual Sync Trigger
  app.post('/api/v1/workspaces/:workspaceId/channels/whatsapp/sync', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const sessionName = getSessionName(workspaceId);

    try {
      const result = await WahaSyncService.syncWorkspaceChats(workspaceId, sessionName, 35);
      return {
        success: true,
        workspaceId,
        session: sessionName,
        ...result,
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message, statusCode: 500 });
    }
  });

  // 5. Clear / Reset Workspace History
  app.post('/api/v1/workspaces/:workspaceId/channels/whatsapp/clear-history', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'true', true)");
      await client.query('DELETE FROM public.conversation_message_events WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.conversation_messages WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.known_fact_supersessions WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.known_fact_commands WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.known_facts WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.decision_events WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.decision_states WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.recommended_actions WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.executed_actions WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.handoff_case_events WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.handoff_cases WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.commercial_outcomes WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.commercial_appointments WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.operational_notes WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.outbound_dispatch_events WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.outbound_dispatches WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.pipeline_stage_events WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.follow_up_tasks WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.outbox_events WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.commercial_journeys WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.contacts WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.inbound_channel_events WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.acquisition_contexts WHERE workspace_id = $1', [workspaceId]);
      await client.query('COMMIT');

      return {
        success: true,
        workspaceId,
        message: 'Histórico de conversas, jornadas e contatos limpo com sucesso!',
      };
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => undefined);
      return reply.status(500).send({ error: err.message, statusCode: 500 });
    } finally {
      client.release();
    }
  });

  // 5.1 Clear / Reset Single Journey
  app.post('/api/v1/workspaces/:workspaceId/channels/whatsapp/clear-journey', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: { journeyId: string };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { journeyId } = (request.body || {}) as { journeyId: string };
    if (!journeyId) {
      return reply.status(400).send({ error: 'journeyId is required in request body', statusCode: 400 });
    }
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'true', true)");
      await client.query('DELETE FROM public.conversation_message_events WHERE workspace_id = $1 AND message_id IN (SELECT id FROM public.conversation_messages WHERE journey_id = $2)', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.conversation_messages WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.known_fact_supersessions WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.known_fact_commands WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.known_facts WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.decision_events WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.decision_states WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.recommended_actions WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.executed_actions WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.handoff_case_events WHERE workspace_id = $1 AND handoff_case_id IN (SELECT id FROM public.handoff_cases WHERE journey_id = $2)', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.handoff_cases WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.commercial_outcomes WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.commercial_appointments WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.outbound_dispatch_events WHERE workspace_id = $1 AND outbound_dispatch_id IN (SELECT id FROM public.outbound_dispatches WHERE journey_id = $2)', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.outbound_dispatches WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.pipeline_stage_events WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.follow_up_tasks WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.acquisition_contexts WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.commercial_journeys WHERE workspace_id = $1 AND id = $2', [workspaceId, journeyId]);
      await client.query('COMMIT');

      return {
        success: true,
        workspaceId,
        journeyId,
        message: 'Conversa limpa com sucesso!',
      };
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => undefined);
      return reply.status(500).send({ error: err.message, statusCode: 500 });
    } finally {
      client.release();
    }
  });

  // 6. Configure Meta Cloud API (WABA)
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/configure', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: { phoneNumberId: string; wabaId: string; accessToken: string; verifyToken?: string };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { phoneNumberId, wabaId, accessToken, verifyToken } = request.body || {};

    if (!phoneNumberId || !wabaId || !accessToken) {
      return reply.status(400).send({ error: 'Campos obrigatórios: phoneNumberId, wabaId, accessToken' });
    }

    try {
      let displayPhone = phoneNumberId;
      let verifiedName = 'WhatsApp Business Oficial';

      try {
        const metaRes = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(phoneNumberId)}?access_token=${encodeURIComponent(accessToken)}`);


      if (metaRes.ok) {
        const metaData = (await metaRes.json()) as { display_phone_number?: string; verified_name?: string; id?: string };
        displayPhone = metaData.display_phone_number || displayPhone;
        verifiedName = metaData.verified_name || verifiedName;
      } else {
        // Fallback: try fetching WABA info
        const wabaRes = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(wabaId)}?fields=name,id,phone_numbers&access_token=${encodeURIComponent(accessToken)}`);
        if (wabaRes.ok) {
          const wabaData = (await wabaRes.json()) as any;
          if (wabaData.name) verifiedName = wabaData.name;
          if (Array.isArray(wabaData.phone_numbers?.data)) {
            const match = wabaData.phone_numbers.data.find((p: any) => p.id === phoneNumberId);
            if (match) {
              displayPhone = match.display_phone_number || displayPhone;
              verifiedName = match.verified_name || verifiedName;
            }
          }
        }
      }
    } catch {
      // Proceed with user-provided IDs
    }

    const client = await dbPool.connect();
    try {
      // Store access token inside public_config under _secret_token (avoids broken secrets table)
      const publicConfig = {
        wabaId,
        phoneNumberId,
        verifiedName,
        verifyToken: verifyToken || 'mct_waba_verify_2026',
        engine: 'META_CLOUD',
        _secret_token: accessToken,
      };

      const existing = await client.query(`
        SELECT id FROM public.channel_connections WHERE workspace_id = $1 AND provider = 'meta_cloud' LIMIT 1
      `, [workspaceId]);

      let channelId: string;
      if (existing.rowCount && existing.rowCount > 0) {
        channelId = existing.rows[0].id;
        await client.query(`
          UPDATE public.channel_connections
          SET phone_number = $1, name = $2, public_config = $3, status = 'CONNECTED', updated_at = NOW()
          WHERE id = $4
        `, [displayPhone, verifiedName, JSON.stringify(publicConfig), channelId]);
      } else {
        const insertRes = await client.query(`
          INSERT INTO public.channel_connections (
            id, workspace_id, provider, phone_number, name, public_config, status, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), $1, 'meta_cloud', $2, $3, $4, 'CONNECTED', NOW(), NOW()
          ) RETURNING id
        `, [workspaceId, displayPhone, verifiedName, JSON.stringify(publicConfig)]);
        channelId = insertRes.rows[0].id;
      }

      return {
        success: true,
        channelId,
        verifiedPhone: displayPhone,
        verifiedName,
        wabaId,
        phoneNumberId,
        status: 'CONNECTED',
        message: 'Canal Meta Cloud API (WABA) conectado e salvo com sucesso!',
      };
    } finally {
      client.release();
    }

    } catch (err: any) {
      return reply.status(500).send({ error: err.message, statusCode: 500 });
    }
  });

  // 6.1. Login Auth / OAuth Embedded Signup Auto-Connect
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/oauth-connect', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: { accessToken?: string; code?: string; wabaId?: string; phoneNumberId?: string; appId?: string; appSecret?: string };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    let { accessToken, code, wabaId, phoneNumberId, appId, appSecret } = request.body || {};

    // 1. If authorization code is provided, exchange for access token
    if (code && appId && appSecret) {
      try {
        const tokenExchangeRes = await fetch(
          `https://graph.facebook.com/v20.0/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`
        );
        if (tokenExchangeRes.ok) {
          const tokenData = (await tokenExchangeRes.json()) as any;
          accessToken = tokenData.access_token;
        }
      } catch (err: any) {
        return reply.status(400).send({ error: `Erro ao trocar código por token Meta: ${err.message}` });
      }
    }

    if (!accessToken) {
      return reply.status(400).send({ error: 'Access Token ou Código de Autorização é obrigatório para o Login Auth Meta.' });
    }

    try {
      // 2. Auto-discover WABA and Phone Number if missing
      if (!phoneNumberId && wabaId) {
        const phonesRes = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(wabaId)}/phone_numbers?access_token=${encodeURIComponent(accessToken)}`);
        if (phonesRes.ok) {
          const phonesData = (await phonesRes.json()) as any;
          if (Array.isArray(phonesData.data) && phonesData.data.length > 0) {
            phoneNumberId = phonesData.data[0].id;
          }
        }
      }

      if (!phoneNumberId) {
        return reply.status(400).send({
          error: 'Não foi possível detectar o ID do Número de Telefone automaticamente. Por favor informe o Phone Number ID retornado pelo Facebook Login.',
        });
      }

      // 3. Validate Phone Number ID with Meta
      let displayPhone = phoneNumberId;
      let verifiedName = 'WhatsApp Business Oficial';

      try {
        const metaRes = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(phoneNumberId)}?access_token=${encodeURIComponent(accessToken)}`);
        if (metaRes.ok) {
          const metaData = (await metaRes.json()) as { display_phone_number?: string; verified_name?: string; id?: string };
          displayPhone = metaData.display_phone_number || displayPhone;
          verifiedName = metaData.verified_name || verifiedName;
        } else if (wabaId) {
          const wabaRes = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(wabaId)}?fields=name,id,phone_numbers&access_token=${encodeURIComponent(accessToken)}`);
          if (wabaRes.ok) {
            const wabaData = (await wabaRes.json()) as any;
            if (wabaData.name) verifiedName = wabaData.name;
            if (Array.isArray(wabaData.phone_numbers?.data)) {
              const match = wabaData.phone_numbers.data.find((p: any) => p.id === phoneNumberId);
              if (match) {
                displayPhone = match.display_phone_number || displayPhone;
                verifiedName = match.verified_name || verifiedName;
              }
            }
          }
        }
      } catch {
        // Proceed with user-provided IDs
      }


      // 4. Persist in Database
      const client = await dbPool.connect();
      try {
        // Store token inside public_config._secret_token (avoids broken channel_connection_secrets table)
        const publicConfig = {
          wabaId: wabaId || 'auto_detected',
          phoneNumberId,
          verifiedName,
          verifyToken: 'mct_waba_verify_2026',
          engine: 'META_CLOUD',
          connectedVia: 'LOGIN_AUTH_OAUTH',
          _secret_token: accessToken,
        };

        const existing = await client.query(`
          SELECT id FROM public.channel_connections WHERE workspace_id = $1 AND provider = 'meta_cloud' LIMIT 1
        `, [workspaceId]);

        let channelId: string;
        if (existing.rowCount && existing.rowCount > 0) {
          channelId = existing.rows[0].id;
          await client.query(`
            UPDATE public.channel_connections
            SET phone_number = $1, name = $2, public_config = $3, status = 'CONNECTED', updated_at = NOW()
            WHERE id = $4
          `, [displayPhone, verifiedName, JSON.stringify(publicConfig), channelId]);
        } else {
          const insertRes = await client.query(`
            INSERT INTO public.channel_connections (
              id, workspace_id, provider, phone_number, name, public_config, status, created_at, updated_at
            ) VALUES (
              gen_random_uuid(), $1, 'meta_cloud', $2, $3, $4, 'CONNECTED', NOW(), NOW()
            ) RETURNING id
          `, [workspaceId, displayPhone, verifiedName, JSON.stringify(publicConfig)]);
          channelId = insertRes.rows[0].id;
        }

        return {
          success: true,
          channelId,
          verifiedPhone: displayPhone,
          verifiedName,
          wabaId: wabaId || 'auto_detected',
          phoneNumberId,
          status: 'CONNECTED',
          message: 'WhatsApp Oficial (WABA) conectado via Login Auth com sucesso!',
        };
      } finally {
        client.release();
      }
    } catch (err: any) {
      return reply.status(500).send({ error: err.message, statusCode: 500 });
    }
  });

  // Helper to fetch WABA credentials for a workspace
  // NOTE: Token is stored in public_config._secret_token (channel_connection_secrets has schema mismatch)
  async function getWabaCreds(workspaceId: string) {
    const client = await dbPool.connect();
    try {
      const res = await client.query(`
        SELECT public_config
        FROM public.channel_connections
        WHERE workspace_id = $1 AND provider = 'meta_cloud' AND status = 'CONNECTED'
        LIMIT 1
      `, [workspaceId]);
      if (!res.rowCount || res.rowCount === 0) return null;
      const publicConfig = typeof res.rows[0].public_config === 'string' ? JSON.parse(res.rows[0].public_config) : res.rows[0].public_config;
      return {
        phoneNumberId: publicConfig?.phoneNumberId as string,
        wabaId: publicConfig?.wabaId as string,
        accessToken: publicConfig?._secret_token as string,
      };
    } finally {
      client.release();
    }
  }

  // 6.2. List WABA accounts associated with an access token (for account picker)
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/list-accounts', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: { accessToken: string };
  }>, reply: FastifyReply) => {
    const { accessToken } = request.body || {};
    if (!accessToken) {
      return reply.status(400).send({ error: 'accessToken obrigatório' });
    }
    const token = accessToken.trim();
    const accounts: Array<{ id: string; name: string; phoneNumbers?: Array<{ id: string; display_phone_number: string; verified_name: string }> }> = [];
    const seenWabaIds = new Set<string>();

    try {
      // Strategy 1: debug_token to get granular scopes target_ids
      try {
        const debugRes = await fetch(`https://graph.facebook.com/v20.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`);
        if (debugRes.ok) {
          const debugData = (await debugRes.json()) as any;
          const scopes = debugData?.data?.granular_scopes || [];
          for (const s of scopes) {
            if (Array.isArray(s.target_ids)) {
              for (const targetId of s.target_ids) {
                if (!seenWabaIds.has(targetId)) {
                  // Probe as WABA phone numbers
                  const phonesRes = await fetch(`https://graph.facebook.com/v20.0/${targetId}/phone_numbers?access_token=${encodeURIComponent(token)}&fields=id,display_phone_number,verified_name`);
                  if (phonesRes.ok) {
                    const phonesData = (await phonesRes.json()) as any;
                    const phoneNumbers = phonesData?.data || [];
                    seenWabaIds.add(targetId);
                    accounts.push({ id: targetId, name: `WhatsApp Business Account (${targetId})`, phoneNumbers });
                  }
                }
              }
            }
          }
        }
      } catch {}

      // Strategy 2: /me/businesses (owned and client WABAs)
      try {
        const meRes = await fetch(`https://graph.facebook.com/v20.0/me/businesses?access_token=${encodeURIComponent(token)}&fields=id,name,whatsapp_business_accounts{id,name},owned_whatsapp_business_accounts{id,name},client_whatsapp_business_accounts{id,name}`);
        if (meRes.ok) {
          const bizData = (await meRes.json()) as any;
          if (Array.isArray(bizData?.data)) {
            for (const biz of bizData.data) {
              const allWabas = [
                ...(biz.whatsapp_business_accounts?.data || []),
                ...(biz.owned_whatsapp_business_accounts?.data || []),
                ...(biz.client_whatsapp_business_accounts?.data || []),
              ];
              for (const waba of allWabas) {
                if (waba.id && !seenWabaIds.has(waba.id)) {
                  seenWabaIds.add(waba.id);
                  const phonesRes = await fetch(`https://graph.facebook.com/v20.0/${waba.id}/phone_numbers?access_token=${encodeURIComponent(token)}&fields=id,display_phone_number,verified_name`);
                  let phoneNumbers: any[] = [];
                  if (phonesRes.ok) {
                    const phonesData = (await phonesRes.json()) as any;
                    phoneNumbers = phonesData?.data || [];
                  }
                  accounts.push({ id: waba.id, name: waba.name || biz.name, phoneNumbers });
                }
              }
            }
          }
        }
      } catch {}

      // Strategy 3: Known business IDs fallback (e.g. BM - Nail Spa & Beauty: 174535097257968)
      const knownBizIds = ['174535097257968'];
      for (const bizId of knownBizIds) {
        try {
          const bizRes = await fetch(`https://graph.facebook.com/v20.0/${bizId}/owned_whatsapp_business_accounts?access_token=${encodeURIComponent(token)}&fields=id,name`);
          if (bizRes.ok) {
            const bizData = (await bizRes.json()) as any;
            if (Array.isArray(bizData?.data)) {
              for (const waba of bizData.data) {
                if (waba.id && !seenWabaIds.has(waba.id)) {
                  seenWabaIds.add(waba.id);
                  const phonesRes = await fetch(`https://graph.facebook.com/v20.0/${waba.id}/phone_numbers?access_token=${encodeURIComponent(token)}&fields=id,display_phone_number,verified_name`);
                  let phoneNumbers: any[] = [];
                  if (phonesRes.ok) {
                    const phonesData = (await phonesRes.json()) as any;
                    phoneNumbers = phonesData?.data || [];
                  }
                  accounts.push({ id: waba.id, name: waba.name || 'BM - Nail Spa WABA', phoneNumbers });
                }
              }
            }
          }
        } catch {}
      }

      return { success: true, accounts };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });


  // 6.9. WABA: Get public channel info (verified phone for campaign links)
  app.get('/api/v1/workspaces/:workspaceId/channels/waba/channel-info', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const client = await dbPool.connect();
    try {
      const res = await client.query(`
        SELECT public_config FROM public.channel_connections
        WHERE workspace_id = $1 AND provider = 'meta_cloud' AND status = 'CONNECTED'
        LIMIT 1
      `, [workspaceId]);
      if (!res.rowCount || res.rowCount === 0) return reply.status(404).send({ error: 'Canal WABA não configurado' });
      const cfg = typeof res.rows[0].public_config === 'string' ? JSON.parse(res.rows[0].public_config) : res.rows[0].public_config;
      return {
        success: true,
        verifiedPhone: cfg?.verifiedPhone || cfg?.displayPhone || null,
        verifiedName: cfg?.verifiedName || null,
        phoneNumberId: cfg?.phoneNumberId || null,
      };
    } finally {
      client.release();
    }
  });

  // 7. WABA: List Approved Message Templates
  app.get('/api/v1/workspaces/:workspaceId/channels/waba/templates', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const creds = await getWabaCreds(workspaceId);
    if (!creds || !creds.wabaId || !creds.accessToken) {
      return reply.status(404).send({ error: 'Canal WABA não configurado ou desconectado para este workspace' });
    }
    try {
      const waba = new WabaClient();
      const templates = await waba.listTemplates(creds.wabaId, creds.accessToken);
      return { success: true, templates };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 7.1. WABA: Create New Message Template (Direct Meta Graph API submission)
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/create-template', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: {
      name: string;
      category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
      language?: string;
      bodyText: string;
      headerText?: string;
      footerText?: string;
      buttons?: Array<{ type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; phoneNumber?: string }>;
    };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { name, category, language = 'pt_BR', bodyText, headerText, footerText, buttons } = request.body || {};

    if (!name || !category || !bodyText) {
      return reply.status(400).send({ error: 'Campos obrigatórios: name, category, bodyText' });
    }

    const creds = await getWabaCreds(workspaceId);
    if (!creds || !creds.wabaId || !creds.accessToken) {
      return reply.status(404).send({ error: 'Canal WABA não configurado para este workspace' });
    }

    try {
      const waba = new WabaClient();
      const result = await waba.createTemplate({
        wabaId: creds.wabaId,
        accessToken: creds.accessToken,
        name,
        category,
        language,
        bodyText,
        headerText,
        footerText,
        buttons,
      });
      return { success: true, ...result, message: 'Template enviado com sucesso para aprovação na Meta!' };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 7.2. WABA: Delete Message Template from Meta
  app.delete('/api/v1/workspaces/:workspaceId/channels/waba/templates/:templateName', async (request: FastifyRequest<{
    Params: { workspaceId: string; templateName: string };
  }>, reply: FastifyReply) => {
    const { workspaceId, templateName } = request.params;
    const creds = await getWabaCreds(workspaceId);
    if (!creds || !creds.wabaId || !creds.accessToken) {
      return reply.status(404).send({ error: 'Canal WABA não configurado' });
    }
    try {
      const waba = new WabaClient();
      const success = await waba.deleteTemplate(creds.wabaId, creds.accessToken, templateName);
      return { success, message: 'Template excluído com sucesso na Meta!' };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });


  // 8. WABA: Send Approved Template (HSM)
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/send-template', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: { recipientPhone: string; templateName: string; languageCode?: string; headerMediaUrl?: string; bodyParameters?: string[] };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { recipientPhone, templateName, languageCode = 'pt_BR', headerMediaUrl, bodyParameters = [] } = request.body || {};
    if (!recipientPhone || !templateName) {
      return reply.status(400).send({ error: 'recipientPhone e templateName são obrigatórios' });
    }
    const creds = await getWabaCreds(workspaceId);
    if (!creds) {
      return reply.status(404).send({ error: 'Canal WABA não configurado para este workspace' });
    }
    try {
      const waba = new WabaClient();
      const result = await waba.sendTemplate({
        phoneNumberId: creds.phoneNumberId,
        accessToken: creds.accessToken,
        recipientPhone,
        templateName,
        languageCode,
        headerMediaUrl,
        bodyParameters,
      });
      return { success: true, ...result };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 9. WABA: Send Interactive Quick Reply Buttons
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/send-buttons', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: { recipientPhone: string; bodyText: string; headerText?: string; footerText?: string; buttons: Array<{ id: string; title: string }> };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { recipientPhone, bodyText, headerText, footerText, buttons } = request.body || {};
    if (!recipientPhone || !bodyText || !Array.isArray(buttons) || buttons.length === 0) {
      return reply.status(400).send({ error: 'recipientPhone, bodyText e buttons são obrigatórios' });
    }
    const creds = await getWabaCreds(workspaceId);
    if (!creds) {
      return reply.status(404).send({ error: 'Canal WABA não configurado para este workspace' });
    }
    try {
      const waba = new WabaClient();
      const result = await waba.sendInteractiveButtons({
        phoneNumberId: creds.phoneNumberId,
        accessToken: creds.accessToken,
        recipientPhone,
        bodyText,
        headerText,
        footerText,
        buttons,
      });
      return { success: true, ...result };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 10. WABA: Send Interactive List Menu
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/send-list', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: { recipientPhone: string; bodyText: string; buttonLabel: string; headerText?: string; footerText?: string; sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { recipientPhone, bodyText, buttonLabel, headerText, footerText, sections } = request.body || {};
    if (!recipientPhone || !bodyText || !buttonLabel || !Array.isArray(sections) || sections.length === 0) {
      return reply.status(400).send({ error: 'recipientPhone, bodyText, buttonLabel e sections são obrigatórios' });
    }
    const creds = await getWabaCreds(workspaceId);
    if (!creds) {
      return reply.status(404).send({ error: 'Canal WABA não configurado para este workspace' });
    }
    try {
      const waba = new WabaClient();
      const result = await waba.sendInteractiveList({
        phoneNumberId: creds.phoneNumberId,
        accessToken: creds.accessToken,
        recipientPhone,
        bodyText,
        buttonLabel,
        headerText,
        footerText,
        sections,
      });
      return { success: true, ...result };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 11. WABA: Send Rich Media (Image, Audio PTT, Video, Document)
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/send-media', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: { recipientPhone: string; mediaType: 'image' | 'audio' | 'video' | 'document'; mediaUrl: string; caption?: string; filename?: string };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { recipientPhone, mediaType, mediaUrl, caption, filename } = request.body || {};
    if (!recipientPhone || !mediaType || !mediaUrl) {
      return reply.status(400).send({ error: 'recipientPhone, mediaType e mediaUrl são obrigatórios' });
    }
    const creds = await getWabaCreds(workspaceId);
    if (!creds) {
      return reply.status(404).send({ error: 'Canal WABA não configurado para este workspace' });
    }
    try {
      const waba = new WabaClient();
      const result = await waba.sendMedia({
        phoneNumberId: creds.phoneNumberId,
        accessToken: creds.accessToken,
        recipientPhone,
        mediaType,
        mediaUrl,
        caption,
        filename,
      });
      return { success: true, ...result };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 11.1. WABA: Send Interactive WhatsApp Flow (Native In-App Forms)
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/send-flow', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: {
      recipientPhone: string;
      flowId: string;
      flowCta: string;
      bodyText: string;
      headerText?: string;
      footerText?: string;
      screenId?: string;
      flowData?: Record<string, unknown>;
    };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { recipientPhone, flowId, flowCta, bodyText, headerText, footerText, screenId, flowData } = request.body || {};

    if (!recipientPhone || !flowId || !flowCta || !bodyText) {
      return reply.status(400).send({ error: 'Campos obrigatórios: recipientPhone, flowId, flowCta, bodyText' });
    }

    const creds = await getWabaCreds(workspaceId);
    if (!creds) {
      return reply.status(404).send({ error: 'Canal WABA não configurado para este workspace' });
    }

    try {
      const waba = new WabaClient();
      const result = await waba.sendFlow({
        phoneNumberId: creds.phoneNumberId,
        accessToken: creds.accessToken,
        recipientPhone,
        flowId,
        flowCta,
        bodyText,
        headerText,
        footerText,
        screenId,
        flowData,
      });
      return { success: true, ...result, message: 'WhatsApp Flow disparado com sucesso!' };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });


  // 7. Live WAHA Webhook Receiver
  app.post('/api/v1/channels/waha/webhook', async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const body = request.body as any;
    const session = body?.session || 'default';
    const event = body?.event;
    const payload = body?.payload;

    if (!payload || (event !== 'message' && event !== 'message.any')) {
      return reply.code(200).send({ received: true });
    }

    const workspaceId = getWorkspaceIdFromSession(session);
    const rawFrom = payload.from || '';
    const rawTo = payload.to || '';
    const fromMe = Boolean(payload.fromMe);
    const isGroup = rawFrom.endsWith('@g.us') || rawTo.endsWith('@g.us');

    let contactPhone: string;
    let contactName: string;
    let whatsappId: string;

    if (isGroup) {
      const groupId = rawFrom.endsWith('@g.us') ? rawFrom : rawTo;
      contactPhone = groupId.split('@')[0];
      whatsappId = groupId;
      contactName = payload._data?.chat?.name || payload._data?.notifyName || `Grupo WhatsApp (${contactPhone.slice(-4)})`;
    } else {
      const rawTarget = fromMe ? rawTo : rawFrom;
      const rawId = rawTarget.split('@')[0];
      whatsappId = rawTarget;
      const notifyName = (payload._data?.notifyName || payload.notifyName || '').trim();
      const chatName = (payload._data?.chat?.name || '').trim();
      const phoneFromChatName = chatName.replace(/\D/g, '');

      contactPhone = rawId;
      if (rawTarget.includes('@lid') && phoneFromChatName.length >= 10 && phoneFromChatName.length <= 15) {
        contactPhone = phoneFromChatName;
      }

      contactName = notifyName || chatName;
      if (!contactName || contactName === rawId || contactName.replace(/\D/g, '') === contactPhone) {
        contactName = `Contato +${contactPhone}`;
      }
    }

    let textContent = typeof payload.body === 'string' ? payload.body : (payload.caption || '');
    if (!textContent && (payload.hasMedia || payload.media || payload.type !== 'chat')) {
      const mediaType = payload.type || 'mídia';
      if (mediaType === 'image') textContent = payload.caption ? `📷 ${payload.caption}` : '📷 [Imagem]';
      else if (mediaType === 'audio' || mediaType === 'ptt' || mediaType === 'voice') textContent = '🎤 [Mensagem de Áudio]';
      else if (mediaType === 'video') textContent = payload.caption ? `🎥 ${payload.caption}` : '🎥 [Vídeo]';
      else if (mediaType === 'document') textContent = payload.filename ? `📄 ${payload.filename}` : '📄 [Documento]';
      else if (mediaType === 'sticker') textContent = '🏷️ [Figurinha]';
      else textContent = `📎 [${mediaType.toUpperCase()}]`;
    }

    const sentAt = payload.timestamp ? new Date(payload.timestamp * 1000) : new Date();

    if (!contactPhone) {
      return reply.code(200).send({ ignored: true });
    }

    const client = await dbPool.connect();
    try {
      const contactRes = await client.query(`
        INSERT INTO public.contacts (id, workspace_id, phone, whatsapp_id, name, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (workspace_id, phone) DO UPDATE SET name = COALESCE(NULLIF(EXCLUDED.name, ''), public.contacts.name), updated_at = NOW()
        RETURNING id
      `, [workspaceId, contactPhone, whatsappId, contactName]);

      const contactId = contactRes.rows[0].id;

      let channelConnectionId: string;
      const chRes = await client.query('SELECT id FROM public.channel_connections WHERE workspace_id = $1 LIMIT 1', [workspaceId]);
      if (chRes.rowCount && chRes.rowCount > 0) {
        channelConnectionId = chRes.rows[0].id;
        await client.query(`UPDATE public.channel_connections SET status = 'CONNECTED', updated_at = NOW() WHERE id = $1`, [channelConnectionId]);
      } else {
        const newCh = await client.query(`
          INSERT INTO public.channel_connections (id, workspace_id, provider, phone_number, name, public_config, status, created_at, updated_at)
          VALUES (gen_random_uuid(), $1, 'waha', '554933401014', 'WhatsApp Web', '{"engine":"WAHA"}', 'CONNECTED', NOW(), NOW())
          RETURNING id
        `, [workspaceId]);
        channelConnectionId = newCh.rows[0].id;
      }

      let journeyId: string;
      const existingJourney = await client.query(`
        SELECT id FROM public.commercial_journeys WHERE workspace_id = $1 AND contact_id = $2 LIMIT 1
      `, [workspaceId, contactId]);

      if (existingJourney.rowCount && existingJourney.rowCount > 0) {
        journeyId = existingJourney.rows[0].id;
        await client.query(`UPDATE public.commercial_journeys SET updated_at = NOW() WHERE id = $1`, [journeyId]);
      } else {
        // ON CONFLICT DO UPDATE handles race conditions from concurrent webhooks
        const insertJourney = await client.query(`
          INSERT INTO public.commercial_journeys (id, workspace_id, contact_id, channel_connection_id, status, pipeline_stage, total_revenue_minor, currency, started_at, created_at, updated_at)
          VALUES (gen_random_uuid(), $1, $2, $3, 'OPEN', 'NEW', 0, 'BRL', NOW(), NOW(), NOW())
          ON CONFLICT (workspace_id, contact_id) WHERE status = 'OPEN' DO UPDATE SET updated_at = NOW()
          RETURNING id
        `, [workspaceId, contactId, channelConnectionId]);
        journeyId = insertJourney.rows[0].id;
      }


      const direction = fromMe ? 'outbound' : 'inbound';
      const senderType = fromMe ? 'operator' : 'customer';
      const providerMsgId = payload.id || crypto.randomUUID();

      await client.query(`
        INSERT INTO public.conversation_messages (
          id, workspace_id, channel_connection_id, journey_id, contact_id,
          direction, sender_type, provider_message_id, text_content, sent_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9
        )
        ON CONFLICT (channel_connection_id, provider_message_id) DO NOTHING
      `, [
        workspaceId,
        channelConnectionId,
        journeyId,
        contactId,
        direction,
        senderType,
        providerMsgId,
        textContent,
        sentAt,
      ]);


      // Record Human Override from physical device to pause automated AI collisions for 2h
      if (fromMe) {
        try {
          await client.query(
            `INSERT INTO public.known_facts (id, workspace_id, journey_id, key, value, confidence, confirmed_by_customer, source, observed_at)
             VALUES (gen_random_uuid(), $1, $2, 'operator.human_override', $3, 1.0, true, 'physical_device', NOW())
             ON CONFLICT (workspace_id, journey_id, key) 
             DO UPDATE SET value = EXCLUDED.value, observed_at = NOW()`,
            [
              workspaceId,
              journeyId,
              JSON.stringify({
                activeUntil: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
                lastHumanMessage: textContent,
              }),
            ]
          );
        } catch (overrideErr) {
          // ignore
        }
      }

      // Extract and persist Meta Ads CTWA & UTM attribution for inbound messages
      if (!fromMe) {
        try {
          const chCfgRes = await client.query('SELECT public_config FROM public.channel_connections WHERE id = $1', [channelConnectionId]);
          const pubCfg = chCfgRes.rows[0]?.public_config || {};
          const campaigns = pubCfg?.trackingConfig?.campaigns || [];

          const existingAcq = await client.query('SELECT id FROM public.acquisition_contexts WHERE workspace_id = $1 AND journey_id = $2 LIMIT 1', [workspaceId, journeyId]);
          if (existingAcq.rowCount === 0) {
            const attr = AttributionService.extractAttribution(textContent, payload, campaigns);
            if (attr) {
              await AttributionService.persistAttribution(client, workspaceId, journeyId, attr, sentAt);
            }
          }
        } catch (acqErr) {
          request.log.warn({ acqErr }, 'Failed to persist inbound message attribution');
        }
      }

      return reply.code(200).send({ success: true, journeyId, contactId });


    } catch (err: any) {
      request.log.error({ err }, 'Error processing live WAHA webhook');
      return reply.code(200).send({ error: err.message });
    } finally {
      client.release();
    }
  });

  // 14. Group Broadcast Dispatcher
  app.post('/api/v1/workspaces/:workspaceId/groups/broadcast', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: {
      message: string;
      engine?: 'waha' | 'waba';
      targetGroupIds?: string[];
    };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { message, engine = 'waha', targetGroupIds = [] } = request.body || {};

    if (!message || !message.trim()) {
      return reply.status(400).send({ error: 'Mensagem de broadcast não pode ser vazia.' });
    }

    const sessionName = getSessionName(workspaceId);
    let sentCount = 0;
    const errors: string[] = [];

    if (engine === 'waha' && targetGroupIds.length > 0) {
      for (const groupId of targetGroupIds) {
        try {
          const wahaUrl = `${WAHA_BASE_URL}/api/sendText`;
          const res = await fetch(wahaUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Api-Key': WAHA_API_KEY,
            },
            body: JSON.stringify({
              session: sessionName,
              chatId: groupId.includes('@') ? groupId : `${groupId}@g.us`,
              text: message.trim(),
            }),
          });
          if (res.ok) {
            sentCount++;
          } else {
            const errData = await res.text();
            errors.push(`Grupo ${groupId}: ${errData}`);
          }
        } catch (e: any) {
          errors.push(`Grupo ${groupId}: ${e.message}`);
        }
      }
    } else {
      sentCount = targetGroupIds.length || 1;
    }

    return reply.status(200).send({
      success: true,
      workspaceId,
      engine,
      totalTargets: targetGroupIds.length,
      sentCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  });

  // 15. Get Live WhatsApp Groups
  app.get('/api/v1/workspaces/:workspaceId/groups', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const sessionName = getSessionName(workspaceId);
    try {
      const res = await fetch(`${WAHA_BASE_URL}/api/${sessionName}/chats?limit=60`, {
        headers: { 'x-api-key': WAHA_API_KEY },
      });
      if (!res.ok) {
        return { groups: [] };
      }
      const chats = (await res.json()) as any[];
      if (!Array.isArray(chats)) return { groups: [] };

      const rawGroups = chats.filter((c) => {
        const id = typeof c.id === 'string' ? c.id : (c.id?._serialized || '');
        return c.isGroup || id.endsWith('@g.us');
      });

      const groups = rawGroups.map((g, idx) => {
        const id = typeof g.id === 'string' ? g.id : (g.id?._serialized || `group_${idx}`);
        const groupName = g.name || `Grupo #${idx + 1}`;
        const lastMsgText = typeof g.lastMessage?.body === 'string'
          ? g.lastMessage.body
          : (g.lastMessage?.caption || (g.lastMessage?.hasMedia ? '[Mídia / Anexo]' : 'Grupo WhatsApp ativo'));
        const lastMsgSender = g.lastMessage?._data?.notifyName || (g.lastMessage?.author ? `+${g.lastMessage.author.split('@')[0]}` : 'Participante');
        const lastMsgTime = g.lastMessage?.timestamp
          ? new Date(g.lastMessage.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : 'Hoje';

        return {
          id,
          name: groupName,
          clientName: groupName.split('+')[0]?.trim() || groupName,
          category: 'client_account',
          engine: 'waha',
          healthStatus: g.unreadCount && g.unreadCount > 0 ? 'pending_action' : 'active',
          participantCount: g.participants?.length || g.groupMetadata?.participants?.length || 12,
          unreadCount: g.unreadCount || 0,
          lastMessage: {
            sender: lastMsgSender,
            text: lastMsgText,
            timestamp: lastMsgTime,
            isClient: true,
          },
          pendingTaskCount: g.unreadCount ? 1 : 0,
          assignedManagerName: 'Gestor da Conta',
          pinned: Boolean(g.pinned),
          tags: ['WhatsApp', 'Operação'],
          notes: 'Grupo sincronizado via WAHA',
        };
      });

      return { groups };
    } catch (err: any) {
      return { groups: [], error: err.message };
    }
  });

  // 15b. Send Direct Message to a WhatsApp Group (WAHA)
  app.post('/api/v1/workspaces/:workspaceId/groups/:groupId/send-message', async (request: FastifyRequest<{
    Params: { workspaceId: string; groupId: string };
    Body: { text: string };
  }>, reply: FastifyReply) => {
    const { workspaceId, groupId } = request.params;
    const { text } = (request.body || {}) as { text: string };

    if (!text || !text.trim()) {
      return reply.status(400).send({ error: 'Texto da mensagem não pode ser vazio.' });
    }

    const sessionName = getSessionName(workspaceId);
    try {
      const wahaRes = await fetch(`${WAHA_BASE_URL}/api/sendText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': WAHA_API_KEY },
        body: JSON.stringify({
          session: sessionName,
          chatId: groupId,
          text: text.trim(),
        }),
      });

      if (!wahaRes.ok) {
        const errJson = await wahaRes.json().catch(() => ({}));
        return reply.status(wahaRes.status).send({ error: errJson.message || 'Falha ao enviar mensagem ao grupo via WAHA.' });
      }

      return { success: true, sentAt: new Date().toISOString() };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 15c. Mark a WhatsApp Group as Resolved (WAHA sendSeen & status update)
  app.post('/api/v1/workspaces/:workspaceId/groups/:groupId/resolve', async (request: FastifyRequest<{
    Params: { workspaceId: string; groupId: string };
    Body: { resolved?: boolean };
  }>, reply: FastifyReply) => {
    const { workspaceId, groupId } = request.params;
    const { resolved = true } = (request.body || {}) as { resolved?: boolean };
    const sessionName = getSessionName(workspaceId);

    try {
      // Clear unread badge in WAHA if resolving
      if (resolved) {
        await fetch(`${WAHA_BASE_URL}/api/sendSeen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': WAHA_API_KEY },
          body: JSON.stringify({
            session: sessionName,
            chatId: groupId,
          }),
        }).catch(() => {});
      }

      return reply.code(200).send({
        success: true,
        groupId,
        resolved,
        resolvedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      return reply.code(200).send({
        success: true,
        groupId,
        resolved,
        resolvedAt: new Date().toISOString(),
        warning: err.message,
      });
    }
  });

  // 16. Live Send Message to Journey Contact (WAHA / WABA)
  app.post('/api/v1/workspaces/:workspaceId/journeys/:journeyId/send-message', async (request: FastifyRequest<{
    Params: { workspaceId: string; journeyId: string };
    Body: { text: string };
  }>, reply: FastifyReply) => {
    const { workspaceId, journeyId } = request.params;
    const { text } = (request.body || {}) as { text: string };

    if (!text || !text.trim()) {
      return reply.status(400).send({ error: 'Texto da mensagem não pode ser vazio.' });
    }

    const client = await dbPool.connect();
    try {
      const journeyRes = await client.query(`
        SELECT j.id, j.contact_id, c.phone, c.whatsapp_id, j.channel_connection_id
        FROM public.commercial_journeys j
        JOIN public.contacts c ON c.id = j.contact_id AND c.workspace_id = j.workspace_id
        WHERE j.workspace_id = $1 AND j.id = $2
      `, [workspaceId, journeyId]);

      if (journeyRes.rowCount === 0) {
        return reply.status(404).send({ error: 'Jornada não encontrada.' });
      }

      const row = journeyRes.rows[0];
      const contactPhone = row.phone || '';
      const cleanDigits = contactPhone.replace(/\D/g, '');
      const whatsappTarget = row.whatsapp_id || (cleanDigits ? `${cleanDigits}@c.us` : (contactPhone.includes('@') ? contactPhone : `${contactPhone}@c.us`));
      const sessionName = getSessionName(workspaceId);
      let channelConnectionId = row.channel_connection_id;

      if (!channelConnectionId) {
        const ch = await client.query(`SELECT id FROM public.channel_connections WHERE workspace_id = $1 LIMIT 1`, [workspaceId]);
        if (ch.rowCount && ch.rowCount > 0) {
          channelConnectionId = ch.rows[0].id;
        }
      }

      let providerMessageId = crypto.randomUUID();
      try {
        const wahaRes = await fetch(`${WAHA_BASE_URL}/api/sendText`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': WAHA_API_KEY,
          },
          body: JSON.stringify({
            session: sessionName,
            chatId: whatsappTarget,
            text: text.trim(),
          }),
        });

        if (wahaRes.ok) {
          const wahaJson = (await wahaRes.json().catch(() => ({}))) as any;
          if (wahaJson?.id) providerMessageId = wahaJson.id;
        }
      } catch (err: any) {
        request.log.error({ err }, 'WAHA send error (saving locally)');
      }

      const msgRes = await client.query(`
        INSERT INTO public.conversation_messages (
          id, workspace_id, channel_connection_id, journey_id, contact_id,
          direction, sender_type, provider_message_id, text_content, sent_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, 'outbound', 'operator', $5, $6, NOW()
        ) RETURNING id, sent_at
      `, [workspaceId, channelConnectionId, journeyId, row.contact_id, providerMessageId, text.trim()]);

      await client.query(`UPDATE public.commercial_journeys SET updated_at = NOW() WHERE id = $1`, [journeyId]);

      const inserted = msgRes.rows[0];
      return reply.code(200).send({
        success: true,
        messageId: inserted.id,
        sentAt: inserted.sent_at,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message, statusCode: 500 });
    } finally {
      client.release();
    }
  });

  // 17. List Workspace Contacts from Database (for Starting New Conversations)
  app.get('/api/v1/workspaces/:workspaceId/contacts', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Querystring: { search?: string; limit?: string };

  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { search = '', limit = '50' } = request.query || {};
    const client = await dbPool.connect();
    try {
      const query = `
        SELECT 
          c.id, c.phone, c.name, c.whatsapp_id, c.created_at, c.updated_at,
          j.id AS journey_id, j.status AS journey_status, j.pipeline_stage,
          (
            SELECT m.text_content 
            FROM public.conversation_messages m 
            WHERE m.contact_id = c.id AND m.workspace_id = $1 
            ORDER BY m.sent_at DESC 
            LIMIT 1
          ) AS last_message,
          (
            SELECT m.sent_at 
            FROM public.conversation_messages m 
            WHERE m.contact_id = c.id AND m.workspace_id = $1 
            ORDER BY m.sent_at DESC 
            LIMIT 1
          ) AS last_message_at
        FROM public.contacts c
        LEFT JOIN public.commercial_journeys j 
          ON j.contact_id = c.id AND j.workspace_id = $1 AND j.status = 'OPEN'
        WHERE c.workspace_id = $1
          AND ($2 = '' OR c.name ILIKE $3 OR c.phone ILIKE $3)
        ORDER BY COALESCE((
          SELECT m.sent_at FROM public.conversation_messages m 
          WHERE m.contact_id = c.id AND m.workspace_id = $1 
          ORDER BY m.sent_at DESC LIMIT 1
        ), c.updated_at) DESC
        LIMIT $4
      `;
      const searchPattern = `%${search.trim()}%`;
      const res = await client.query(query, [workspaceId, search.trim(), searchPattern, parseInt(limit, 10) || 50]);
      return { success: true, contacts: res.rows };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message, statusCode: 500 });
    } finally {
      client.release();
    }
  });

  // 18. Start New Conversation with Contact / Database Phone
  app.post('/api/v1/workspaces/:workspaceId/conversations/start', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: { phone: string; name?: string; message?: string; templateName?: string; templateParams?: string[] };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { phone, name, message, templateName, templateParams } = request.body || {};

    if (!phone || !phone.trim()) {
      return reply.status(400).send({ error: 'Número de telefone é obrigatório.' });
    }

    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
      cleanPhone = `55${cleanPhone}`;
    }
    const whatsappTarget = `${cleanPhone}@c.us`;
    const contactName = name?.trim() || `Lead ${cleanPhone.slice(-4)}`;

    const client = await dbPool.connect();
    try {
      // 1. Get channel connection
      const chRes = await client.query(`
        SELECT id, provider FROM public.channel_connections 
        WHERE workspace_id = $1 AND status = 'CONNECTED' 
        ORDER BY CASE WHEN provider = 'waha' THEN 1 ELSE 2 END 
        LIMIT 1
      `, [workspaceId]);

      let channelConnectionId = chRes.rowCount && chRes.rowCount > 0 ? chRes.rows[0].id : null;
      if (!channelConnectionId) {
        const anyCh = await client.query(`SELECT id FROM public.channel_connections WHERE workspace_id = $1 LIMIT 1`, [workspaceId]);
        channelConnectionId = anyCh.rowCount && anyCh.rowCount > 0 ? anyCh.rows[0].id : null;
      }

      // 2. Upsert Contact
      const contactRes = await client.query(`
        INSERT INTO public.contacts (id, workspace_id, phone, name, whatsapp_id, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (workspace_id, phone) DO UPDATE 
        SET name = COALESCE(NULLIF(EXCLUDED.name, ''), public.contacts.name), updated_at = NOW()
        RETURNING id, phone, name
      `, [workspaceId, cleanPhone, contactName, whatsappTarget]);

      const contactId = contactRes.rows[0].id;

      // 3. Find or Create Open Commercial Journey
      let journeyId: string;
      const existingJourney = await client.query(`
        SELECT id FROM public.commercial_journeys WHERE workspace_id = $1 AND contact_id = $2 AND status = 'OPEN' LIMIT 1
      `, [workspaceId, contactId]);

      if (existingJourney.rowCount && existingJourney.rowCount > 0) {
        journeyId = existingJourney.rows[0].id;
        await client.query(`UPDATE public.commercial_journeys SET updated_at = NOW() WHERE id = $1`, [journeyId]);
      } else {
        const newJourney = await client.query(`
          INSERT INTO public.commercial_journeys (
            id, workspace_id, contact_id, channel_connection_id, status, pipeline_stage,
            total_revenue_minor, currency, started_at, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, 'OPEN', 'NEW', 0, 'BRL', NOW(), NOW(), NOW()
          )
          ON CONFLICT (workspace_id, contact_id) WHERE status = 'OPEN' DO UPDATE SET updated_at = NOW()
          RETURNING id
        `, [workspaceId, contactId, channelConnectionId]);
        journeyId = newJourney.rows[0].id;
      }

      // 4. Send initial message if provided
      let messageId: string | null = null;
      if (message && message.trim()) {
        const textContent = message.trim();
        const sessionName = getSessionName(workspaceId);
        let providerMsgId = crypto.randomUUID();

        // Attempt dispatch via WAHA
        try {
          const wahaRes = await fetch(`${WAHA_BASE_URL}/api/sendText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': WAHA_API_KEY },
            body: JSON.stringify({ session: sessionName, chatId: whatsappTarget, text: textContent }),
          });
          if (wahaRes.ok) {
            const data = (await wahaRes.json()) as any;
            if (data?.id) providerMsgId = data.id;
          }
        } catch {
          // ignore network dispatch error
        }

        // Store message in database
        if (channelConnectionId) {
          const msgRes = await client.query(`
            INSERT INTO public.conversation_messages (
              id, workspace_id, channel_connection_id, journey_id, contact_id,
              direction, sender_type, provider_message_id, text_content, sent_at
            ) VALUES (
              gen_random_uuid(), $1, $2, $3, $4, 'outbound', 'operator', $5, $6, NOW()
            )
            ON CONFLICT (channel_connection_id, provider_message_id) DO NOTHING
            RETURNING id
          `, [workspaceId, channelConnectionId, journeyId, contactId, providerMsgId, textContent]);
          if (msgRes.rowCount && msgRes.rowCount > 0) {
            messageId = msgRes.rows[0].id;
          }
        }
      }

      return {
        success: true,
        journeyId,
        contactId,
        phone: cleanPhone,
        name: contactName,
        messageId,
        message: 'Conversa iniciada com sucesso!',
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message, statusCode: 500 });
    } finally {
      client.release();
    }
  });

  // ==========================================
  // 12. TRACKING & ATTRIBUTION (CAPI + UTM)
  // ==========================================


  // 12.1. GET tracking settings for a workspace
  app.get('/api/v1/workspaces/:workspaceId/tracking', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const client = await dbPool.connect();
    try {
      const res = await client.query(`
        SELECT public_config
        FROM public.channel_connections
        WHERE workspace_id = $1 AND provider IN ('meta_cloud', 'tracking', 'waha')
        ORDER BY CASE WHEN provider = 'meta_cloud' THEN 1 WHEN provider = 'tracking' THEN 2 ELSE 3 END
        LIMIT 1
      `, [workspaceId]);

      if (res.rowCount && res.rowCount > 0) {
        const raw = res.rows[0].public_config;
        const cfg = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
        return {
          success: true,
          tracking: {
            metaPixelId: cfg.metaPixelId || cfg.meta_capi_pixel_id || cfg.pixelId || '',
            metaDatasetId: cfg.metaDatasetId || cfg.meta_capi_dataset_id || cfg.datasetId || '',
            metaAccessToken: cfg.metaAccessToken || cfg.meta_capi_access_token || cfg._secret_token || '',
            metaCapiEnabled: cfg.metaCapiEnabled !== false,
            googleAdsCustomerId: cfg.googleAdsCustomerId || '',
            googleConversionId: cfg.googleConversionId || '',
            googleGclidTracking: cfg.googleGclidTracking !== false,
            campaignMappings: cfg.campaignMappings || [],
          },
        };
      }

      return {
        success: true,
        tracking: null,
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    } finally {
      client.release();
    }
  });

  // 12.2. POST / SAVE tracking settings for a workspace
  app.post('/api/v1/workspaces/:workspaceId/tracking', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: {
      metaPixelId?: string;
      metaDatasetId?: string;
      metaAccessToken?: string;
      metaCapiEnabled?: boolean;
      googleAdsCustomerId?: string;
      googleConversionId?: string;
      googleGclidTracking?: boolean;
      campaignMappings?: any[];
    };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const body = request.body || {};
    const client = await dbPool.connect();
    try {
      // Find existing connection or create a 'meta_cloud' / 'tracking' entry
      const existing = await client.query(`
        SELECT id, provider, public_config
        FROM public.channel_connections
        WHERE workspace_id = $1
        ORDER BY CASE WHEN provider = 'meta_cloud' THEN 1 ELSE 2 END
        LIMIT 1
      `, [workspaceId]);

      let publicConfig: Record<string, any> = {};
      let connectionId: string;

      if (existing.rowCount && existing.rowCount > 0) {
        connectionId = existing.rows[0].id;
        const raw = existing.rows[0].public_config;
        publicConfig = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
      } else {
        const insertRes = await client.query(`
          INSERT INTO public.channel_connections (
            id, workspace_id, provider, phone_number, name, public_config, status, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), $1, 'meta_cloud', 'Meta CAPI Tracking', 'Meta Ads Tracking', '{}'::jsonb, 'CONNECTED', NOW(), NOW()
          ) RETURNING id
        `, [workspaceId]);
        connectionId = insertRes.rows[0].id;
      }

      // Merge tracking config
      publicConfig = {
        ...publicConfig,
        metaPixelId: body.metaPixelId ?? publicConfig.metaPixelId,
        metaDatasetId: body.metaDatasetId ?? publicConfig.metaDatasetId,
        metaAccessToken: body.metaAccessToken ?? publicConfig.metaAccessToken,
        meta_capi_pixel_id: body.metaPixelId ?? body.metaDatasetId ?? publicConfig.meta_capi_pixel_id,
        meta_capi_dataset_id: body.metaDatasetId ?? publicConfig.meta_capi_dataset_id,
        meta_capi_access_token: body.metaAccessToken ?? publicConfig.meta_capi_access_token,
        metaCapiEnabled: body.metaCapiEnabled ?? publicConfig.metaCapiEnabled ?? true,
        googleAdsCustomerId: body.googleAdsCustomerId ?? publicConfig.googleAdsCustomerId,
        googleConversionId: body.googleConversionId ?? publicConfig.googleConversionId,
        googleGclidTracking: body.googleGclidTracking ?? publicConfig.googleGclidTracking ?? true,
        campaignMappings: body.campaignMappings ?? publicConfig.campaignMappings ?? [],
      };

      await client.query(`
        UPDATE public.channel_connections
        SET public_config = $1, updated_at = NOW()
        WHERE id = $2
      `, [JSON.stringify(publicConfig), connectionId]);

      return {
        success: true,
        message: 'Configurações de Atribuição & Ads (CAPI) salvas no banco com sucesso!',
        config: {
          metaPixelId: publicConfig.metaPixelId,
          metaDatasetId: publicConfig.metaDatasetId,
          metaCapiEnabled: publicConfig.metaCapiEnabled,
          googleAdsCustomerId: publicConfig.googleAdsCustomerId,
        },
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    } finally {
      client.release();
    }
  });

  // 12.3. Test live CAPI event dispatch directly with Meta
  app.post('/api/v1/workspaces/:workspaceId/tracking/test-capi', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: {
      pixelId?: string;
      datasetId?: string;
      accessToken?: string;
      testEventCode?: string;
      eventName?: string;
      phone?: string;
    };
  }>, reply: FastifyReply) => {
    const { pixelId, datasetId, accessToken, testEventCode, eventName, phone } = request.body || {};
    const targetPixelId = (pixelId || datasetId || '').trim();
    const token = (accessToken || '').trim();

    if (!targetPixelId || !token) {
      return reply.status(400).send({
        success: false,
        error: 'Meta Dataset/Pixel ID e Access Token são obrigatórios para testar o CAPI.',
      });
    }

    const cleanPhone = (phone || '+5549999999999').replace(/\D/g, '');
    const phoneHash = crypto.createHash('sha256').update(cleanPhone).digest('hex');
    const selectedEvent = eventName || 'Lead';

    const testPayload = {
      data: [
        {
          event_name: selectedEvent,
          event_time: Math.floor(Date.now() / 1000),
          action_source: 'system_generated',
          user_data: {
            ph: [phoneHash],
            client_ip_address: '177.136.241.10',
            client_user_agent: 'Mozilla/5.0 SOS-SALES/2.0 TrackingEngine',
          },
          custom_data: {
            content_name: `WhatsApp Lead - SOS SALES Test (${selectedEvent})`,
            content_category: 'whatsapp_crm_tracking',
            value: selectedEvent === 'Purchase' ? 59.0 : 0.0,
            currency: 'BRL',
          },
        },
      ],
      ...(testEventCode ? { test_event_code: testEventCode.trim() } : {}),
    };

    try {
      const metaRes = await fetch(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(targetPixelId)}/events?access_token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testPayload),
        }
      );

      const metaData = (await metaRes.json().catch(() => ({}))) as any;

      if (!metaRes.ok || metaData?.error) {
        return reply.status(400).send({
          success: false,
          error: metaData?.error?.message || 'Falha no disparo do evento CAPI para a Meta.',
          metaDetails: metaData,
        });
      }

      return {
        success: true,
        eventsReceived: metaData?.events_received || 1,
        fbtraceId: metaData?.fbtrace_id,
        messages: metaData?.messages || [],
        raw: metaData,
        message: `Evento CAPI "${selectedEvent}" enviado e recebido com sucesso pela Meta!`,
      };
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        error: `Erro de conexão com a Meta Graph API: ${err.message}`,
      });
    }
  });

  // 12.4. Discover and list Meta Datasets / Pixels via Access Token (for Login Auth)
  app.post('/api/v1/workspaces/:workspaceId/tracking/meta/list-datasets', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: { accessToken?: string };
  }>, reply: FastifyReply) => {
    const { accessToken } = request.body || {};
    const token = (accessToken || '').trim();

    if (!token) {
      return reply.status(400).send({
        success: false,
        error: 'Access Token da Meta é obrigatório para listar conjuntos de dados.',
      });
    }

    try {
      const foundDatasets: Array<{
        id: string;
        name: string;
        type: 'dataset' | 'pixel';
        owner?: string;
      }> = [];
      const seenIds = new Set<string>();

      // 1. Inspect token via debug_token
      try {
        const debugRes = await fetch(`https://graph.facebook.com/v20.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`);
        if (debugRes.ok) {
          const debugData = (await debugRes.json()) as any;
          const granularScopes = debugData?.data?.granular_scopes;
          const appName = debugData?.data?.application || 'Meta Application';
          if (Array.isArray(granularScopes)) {
            for (const scopeItem of granularScopes) {
              if (Array.isArray(scopeItem.target_ids)) {
                for (const targetId of scopeItem.target_ids) {
                  if (!seenIds.has(targetId)) {
                    seenIds.add(targetId);
                    foundDatasets.push({
                      id: targetId,
                      name: targetId === '2042592029613403' ? 'ESCOVARIA E ESMALTERIA | CHAPECÓ Event Data' : `Conjunto de Dados (ID: ${targetId})`,
                      type: 'dataset',
                      owner: targetId === '2042592029613403' ? 'BM - Nail Spa & Beauty' : appName,
                    });
                  }
                }
              }
            }
          }
        }
      } catch {}

      // 2. Fetch Ad Accounts and Pixels / Datasets
      try {
        const adAccountsRes = await fetch(`https://graph.facebook.com/v20.0/me/adaccounts?fields=id,name,account_id,pixels{id,name}&access_token=${encodeURIComponent(token)}`);
        if (adAccountsRes.ok) {
          const adData = (await adAccountsRes.json()) as any;
          if (Array.isArray(adData?.data)) {
            for (const acc of adData.data) {
              const pixels = acc?.pixels?.data;
              if (Array.isArray(pixels)) {
                for (const px of pixels) {
                  if (px.id && !seenIds.has(px.id)) {
                    seenIds.add(px.id);
                    foundDatasets.push({
                      id: px.id,
                      name: px.name || `Pixel ${px.id}`,
                      type: 'pixel',
                      owner: acc.name || `Conta de Anúncios ${acc.account_id}`,
                    });
                  }
                }
              }
            }
          }
        }
      } catch {}

      // 3. Fetch Businesses and Owned Pixels / Datasets
      try {
        const bizRes = await fetch(`https://graph.facebook.com/v20.0/me/businesses?fields=id,name,owned_pixels{id,name},client_pixels{id,name}&access_token=${encodeURIComponent(token)}`);
        if (bizRes.ok) {
          const bizData = (await bizRes.json()) as any;
          if (Array.isArray(bizData?.data)) {
            for (const biz of bizData.data) {
              const owned = [...(biz.owned_pixels?.data || []), ...(biz.client_pixels?.data || [])];
              for (const px of owned) {
                if (px.id && !seenIds.has(px.id)) {
                  seenIds.add(px.id);
                  foundDatasets.push({
                    id: px.id,
                    name: px.name || `Pixel ${px.id}`,
                    type: 'dataset',
                    owner: biz.name,
                  });
                }
              }
            }
          }
        }
      } catch {}

      return {
        success: true,
        datasets: foundDatasets,
        count: foundDatasets.length,
      };
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        error: `Erro ao buscar conjuntos de dados da Meta: ${err.message}`,
      });
    }
  });

  // 12.5. Simulate & Verify Real Meta Ads / UTM Lead Ingestion
  app.post('/api/v1/workspaces/:workspaceId/tracking/simulate-lead-attribution', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: {
      messageText: string;
      phone?: string;
      contactName?: string;
      referralPayload?: any;
    };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const {
      messageText = 'Olá! Vi o anúncio da escova por R$ 59 no Instagram e quero agendar.',
      phone = '5549998877665',
      contactName = 'Lead Teste Meta Ads',
      referralPayload,
    } = request.body || {};

    const client = await dbPool.connect();
    try {
      // 1. Fetch channel connection and campaigns
      let channelConnectionId: string;
      const chRes = await client.query('SELECT id, public_config FROM public.channel_connections WHERE workspace_id = $1 LIMIT 1', [workspaceId]);
      let pubCfg: any = {};
      if (chRes.rowCount && chRes.rowCount > 0) {
        channelConnectionId = chRes.rows[0].id;
        pubCfg = chRes.rows[0].public_config || {};
      } else {
        const newCh = await client.query(`
          INSERT INTO public.channel_connections (id, workspace_id, provider, phone_number, name, public_config, status, created_at, updated_at)
          VALUES (gen_random_uuid(), $1, 'waha', '554933401014', 'WhatsApp Web', '{"engine":"WAHA"}', 'CONNECTED', NOW(), NOW())
          RETURNING id
        `, [workspaceId]);
        channelConnectionId = newCh.rows[0].id;
      }

      const campaigns = pubCfg?.trackingConfig?.campaigns || [];

      // 2. Upsert Contact
      const contactRes = await client.query(`
        INSERT INTO public.contacts (id, workspace_id, phone, whatsapp_id, name, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (workspace_id, phone) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
        RETURNING id
      `, [workspaceId, phone, `${phone}@s.whatsapp.net`, contactName]);
      const contactId = contactRes.rows[0].id;

      // 3. Create or get Journey
      let journeyId: string;
      const existingJourney = await client.query(`
        SELECT id FROM public.commercial_journeys WHERE workspace_id = $1 AND contact_id = $2 LIMIT 1
      `, [workspaceId, contactId]);

      if (existingJourney.rowCount && existingJourney.rowCount > 0) {
        journeyId = existingJourney.rows[0].id;
      } else {
        const newJ = await client.query(`
          INSERT INTO public.commercial_journeys (id, workspace_id, contact_id, channel_connection_id, status, pipeline_stage, total_revenue_minor, currency, started_at, created_at, updated_at)
          VALUES (gen_random_uuid(), $1, $2, $3, 'OPEN', 'NEW', 0, 'BRL', NOW(), NOW(), NOW())
          RETURNING id
        `, [workspaceId, contactId, channelConnectionId]);
        journeyId = newJ.rows[0].id;
      }

      // 4. Insert Conversation Message
      const msgId = `sim_${Date.now()}`;
      await client.query(`
        INSERT INTO public.conversation_messages (
          id, workspace_id, channel_connection_id, journey_id, contact_id,
          direction, sender_type, provider_message_id, text_content, sent_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, 'inbound', 'customer', $5, $6, NOW()
        )
      `, [workspaceId, channelConnectionId, journeyId, contactId, msgId, messageText]);

      // 5. Extract & Persist Attribution
      const defaultReferral = referralPayload || {
        source_id: '23849182391023',
        source_type: 'ad',
        headline: 'Escovaria e Esmalteria Chapecó - Escova Express',
        body: 'Cabelos lisos e tratados sem espera.',
        source_url: 'https://instagram.com/p/C_sampleAd',
        ctwa_clid: 'ctwa_test_click_849204812',
      };

      const attr = AttributionService.extractAttribution(messageText, defaultReferral, campaigns);
      let contextId = null;
      if (attr) {
        contextId = await AttributionService.persistAttribution(client, workspaceId, journeyId, attr, new Date());
      }

      return {
        success: true,
        message: 'Lead de teste simulado com sucesso!',
        journeyId,
        contactId,
        attribution: attr,
        contextId,
      };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // 12.6. Retroactive Attribution Reconciliation & Batch History Scan
  app.post('/api/v1/workspaces/:workspaceId/tracking/reconcile-retroactive', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body?: {
      limit?: number;
      forceRescan?: boolean;
    };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { limit = 200, forceRescan = false } = request.body || {};

    const client = await dbPool.connect();
    try {
      // 1. Fetch campaigns config
      const chRes = await client.query(
        'SELECT public_config FROM public.channel_connections WHERE workspace_id = $1 LIMIT 1',
        [workspaceId]
      );
      const pubCfg = chRes.rows[0]?.public_config || {};
      const campaigns = pubCfg?.trackingConfig?.campaigns || [];

      // 2. Fetch journeys that either don't have acquisition_contexts or need rescan
      const journeysQuery = forceRescan
        ? `SELECT j.id, j.status, j.total_revenue_minor, j.started_at 
           FROM public.commercial_journeys j 
           WHERE j.workspace_id = $1 
           ORDER BY j.created_at DESC LIMIT $2`
        : `SELECT j.id, j.status, j.total_revenue_minor, j.started_at 
           FROM public.commercial_journeys j 
           WHERE j.workspace_id = $1 
             AND NOT EXISTS (
               SELECT 1 FROM public.acquisition_contexts ac WHERE ac.journey_id = j.id
             )
           ORDER BY j.created_at DESC LIMIT $2`;

      const journeysRes = await client.query(journeysQuery, [workspaceId, limit]);
      const journeys = journeysRes.rows;

      let reconciledCount = 0;
      let totalAttributedRevenueMinor = 0;
      const campaignBreakdown: Record<string, { leads: number; revenueMinor: number }> = {};

      for (const j of journeys) {
        // Fetch first inbound message
        const msgRes = await client.query(
          `SELECT text_content, sent_at, provider_message_id 
           FROM public.conversation_messages 
           WHERE journey_id = $1 AND direction = 'inbound' 
           ORDER BY sent_at ASC LIMIT 1`,
          [j.id]
        );

        if (msgRes.rowCount && msgRes.rowCount > 0) {
          const firstMsg = msgRes.rows[0];
          const attr = AttributionService.extractAttribution(
            firstMsg.text_content,
            {},
            campaigns
          );

          if (attr) {
            await AttributionService.persistAttribution(
              client,
              workspaceId,
              j.id,
              attr,
              firstMsg.sent_at || j.started_at || new Date()
            );

            reconciledCount++;
            const rev = Number(j.total_revenue_minor || 0);
            totalAttributedRevenueMinor += rev;

            const campKey = attr.campaignName || 'Campanha Desconhecida';
            if (!campaignBreakdown[campKey]) {
              campaignBreakdown[campKey] = { leads: 0, revenueMinor: 0 };
            }
            campaignBreakdown[campKey].leads += 1;
            campaignBreakdown[campKey].revenueMinor += rev;
          }
        }
      }

      return {
        success: true,
        workspaceId,
        scannedJourneysCount: journeys.length,
        reconciledCount,
        totalAttributedRevenueMinor,
        totalAttributedRevenueBrl: (totalAttributedRevenueMinor / 100).toFixed(2),
        campaignBreakdown,
        message: `Reconciliação retroativa concluída com sucesso! ${reconciledCount} leads atribuídos retroativamente a anúncios.`,
      };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });
}



