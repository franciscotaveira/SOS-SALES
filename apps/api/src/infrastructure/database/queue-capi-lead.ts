import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';

/** Atomically records an eligible lead and its outbox event. Never scans history. */
export async function queueCapiLead(client: Pick<PoolClient, 'query'>, input: {
  workspaceId: string; channelId: string; journeyId: string;
  ctwaClid: string; occurredAt: Date;
}): Promise<string | null> {
  if (!input.ctwaClid.trim() || !Number.isFinite(input.occurredAt.getTime())) return null;
  const clickKey = createHash('sha256').update(input.ctwaClid).digest('hex');
  const result = await client.query(`
    SELECT * FROM public.queue_capi_lead($1,$2,$3,$4,$5,$6)`, [input.workspaceId, input.channelId,
    input.journeyId, clickKey, input.ctwaClid, input.occurredAt]);
  return result.rows[0]?.id ?? null;
}
