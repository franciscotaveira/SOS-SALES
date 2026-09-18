import type {Pool} from 'pg';
import type {CapiLeadDispatchGateway, CapiDispatchResult} from '../../application/ports/capi-dispatch-gateway.js';
import {resolveCapiConfig} from '../channels/meta/capi-config.js';

export async function dispatchCapiLead(pool: Pick<Pool, 'connect'>, gateway: CapiLeadDispatchGateway,
  workspaceId: string, leadId: string): Promise<CapiDispatchResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE service_role');
    const result = await client.query(`SELECT l.*, c.public_config, s.secret_payload
      FROM public.capi_lead_deliveries l
      JOIN public.channel_connections c ON c.id=l.channel_connection_id AND c.workspace_id=l.workspace_id
      LEFT JOIN public.channel_connection_secrets s ON s.channel_connection_id=c.id
        AND s.workspace_id=c.workspace_id AND s.secret_kind='meta_capi_token'
      WHERE l.id=$1 AND l.workspace_id=$2 FOR UPDATE OF l`, [leadId, workspaceId]);
    const row = result.rows[0];
    if (!row) {
      await client.query('COMMIT');
      return {success:false,kind:'FATAL',errorCode:'LEAD_NOT_FOUND',errorMessage:'Lead does not belong to this workspace'};
    }
    if (row.status === 'DISPATCHED' || row.status === 'NOT_APPLICABLE') {
      await client.query('COMMIT');
      return {success:true,capiEventId:leadId};
    }
    const config = resolveCapiConfig(row.public_config, row.secret_payload || {});
    const changed = config.datasetId !== row.dataset_id || row.public_config?.wabaId !== row.waba_id
      || row.public_config?.metaCapiActionSource !== 'business_messaging';
    if (!config.enabled || changed) {
      await client.query(`UPDATE public.capi_lead_deliveries SET status='NOT_APPLICABLE',error_code=$3,updated_at=now() WHERE id=$1 AND workspace_id=$2`, [leadId,workspaceId,changed?'CAPI_DESTINATION_CHANGED':'CAPI_DISABLED']);
      await client.query('COMMIT');
      return {success:true,capiEventId:leadId};
    }
    const delivery = await gateway.sendLeadEvent({eventId:leadId,workspaceId,journeyId:row.journey_id,
      pixelId:row.dataset_id,occurredAt:row.occurred_at,ctwaClid:row.ctwa_clid,
      whatsappBusinessAccountId:row.waba_id}, config.accessToken || '');
    await client.query(`UPDATE public.capi_lead_deliveries SET status=$3,error_code=$4,fbtrace_id=$5,updated_at=now()
      WHERE id=$1 AND workspace_id=$2`, [leadId,workspaceId,delivery.success?'DISPATCHED':'FAILED',
      delivery.success?null:delivery.errorCode,delivery.success?delivery.fbtraceId || null:null]);
    await client.query('COMMIT');
    return delivery;
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally {
    await client.query('RESET ROLE').catch(()=>undefined);
    client.release();
  }
}
