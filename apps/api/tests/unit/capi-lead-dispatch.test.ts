import {expect, it, vi} from 'vitest';
import {dispatchCapiLead} from '../../src/infrastructure/workers/dispatch-capi-lead.js';

function fixture(overrides: Record<string, unknown> = {}) {
  const row = {status:'QUEUED',dataset_id:'123',waba_id:'456',journey_id:'journey',ctwa_clid:'click',occurred_at:new Date(),
    public_config:{metaCapiEnabled:true,metaDatasetId:'123',wabaId:'456',metaCapiActionSource:'business_messaging'},
    secret_payload:{accessToken:'tenant-token'},...overrides};
  const query = vi.fn(async (sql:string, values?:unknown[]) => {
    if(sql.startsWith('SELECT')) return {rows:[row]};
    if(sql.includes("status=$3")) row.status=String(values?.[2]);
    return {rows:[]};
  });
  const release = vi.fn();
  const pool = {connect:vi.fn(async()=>({query,release}))};
  const gateway = {sendLeadEvent:vi.fn(async()=>({success:true as const,capiEventId:'lead',fbtraceId:'trace'}))};
  return {pool:pool as any,gateway,query,release};
}

it('uses the scoped credential and skips a previously confirmed delivery',async()=>{
  const f=fixture();
  await dispatchCapiLead(f.pool,f.gateway,'workspace','lead');
  await dispatchCapiLead(f.pool,f.gateway,'workspace','lead');
  expect(f.gateway.sendLeadEvent).toHaveBeenCalledTimes(1);
  expect(f.gateway.sendLeadEvent).toHaveBeenCalledWith(expect.objectContaining({eventId:'lead',workspaceId:'workspace',pixelId:'123'}),'tenant-token');
  expect(f.query).toHaveBeenCalledWith(expect.stringContaining('l.workspace_id=$2'),['lead','workspace']);
  expect(f.release).toHaveBeenCalledTimes(2);
});

it.each([
  {metaCapiEnabled:false,metaDatasetId:'123',wabaId:'456',metaCapiActionSource:'business_messaging'},
  {metaCapiEnabled:true,metaDatasetId:'999',wabaId:'456',metaCapiActionSource:'business_messaging'},
])('does not send when configuration no longer matches',async(public_config)=>{
  const f=fixture({public_config});
  await dispatchCapiLead(f.pool,f.gateway,'workspace','lead');
  expect(f.gateway.sendLeadEvent).not.toHaveBeenCalled();
  expect(f.query).toHaveBeenCalledWith(expect.stringContaining("status='NOT_APPLICABLE'"),expect.any(Array));
});

it('rolls back and releases the connection if transport throws',async()=>{
  const f=fixture();
  f.gateway.sendLeadEvent.mockRejectedValueOnce(new Error('transport'));
  await expect(dispatchCapiLead(f.pool,f.gateway,'workspace','lead')).rejects.toThrow('transport');
  expect(f.query).toHaveBeenCalledWith('ROLLBACK');
  expect(f.query).toHaveBeenCalledWith('RESET ROLE');
  expect(f.release).toHaveBeenCalledOnce();
});
