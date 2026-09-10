import {afterEach,describe,expect,it,vi} from 'vitest';
import {resolveCapiConfig} from '../../src/infrastructure/channels/meta/capi-config.js';
import {CapiClient} from '../../src/infrastructure/channels/meta/capi-client.js';
import {CapiDispatchWorker} from '../../src/infrastructure/workers/capi-dispatch-worker.js';

afterEach(()=>vi.unstubAllGlobals());
const purchase={outcomeId:'sale-1',workspaceId:'workspace-a',journeyId:'journey-1',pixelId:'12345',revenueMinor:15000,currency:'BRL',phone:'+5511999999999',occurredAt:'2026-09-01T12:00:00Z'};
describe('CAPI delivery regressions',()=>{
  it('prefers Dataset over legacy Pixel and requires explicit enablement',()=>{
    expect(resolveCapiConfig({metaDatasetId:'222',metaPixelId:'111'},{accessToken:'secret'})).toEqual({datasetId:'222',accessToken:'secret',enabled:false});
  });
  it('does not report success when Meta acknowledges zero events',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({events_received:0})}));
    expect((await new CapiClient().sendPurchaseEvent(purchase,'token')).success).toBe(false);
  });
  it('retries throttling',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:429,json:async()=>({error:{code:4}})}));
    expect(await new CapiClient().sendPurchaseEvent(purchase,'token')).toMatchObject({success:false,kind:'RETRYABLE'});
  });
  it('preserves time, event identity and WhatsApp attribution',async()=>{
    const fetch=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({events_received:1})});vi.stubGlobal('fetch',fetch);
    await new CapiClient().sendPurchaseEvent({...purchase,actionSource:'business_messaging',ctwaClid:'click-1',whatsappBusinessAccountId:'waba-1'},'token');
    const event=JSON.parse(fetch.mock.calls[0][1].body).data[0];
    expect(event).toMatchObject({event_id:'sale-1',event_time:Date.parse(purchase.occurredAt)/1000,action_source:'business_messaging',messaging_channel:'whatsapp',user_data:{ctwa_clid:'click-1',whatsapp_business_account_id:'waba-1'}});
  });
  it('blocks WhatsApp events without origin identifiers',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    expect(await new CapiClient().sendPurchaseEvent({...purchase,actionSource:'business_messaging'},'token')).toMatchObject({errorCode:'MISSING_WHATSAPP_ATTRIBUTION'});
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    {name:'disabled',config:{metaCapiEnabled:false},status:null,send:false,fail:false},
    {name:'missing credentials',config:{metaCapiEnabled:true},status:null,send:false,fail:true},
    {name:'already delivered',config:{metaCapiEnabled:true},status:'DISPATCHED',send:false,fail:false},
  ])('$name never sends a Purchase',async sample=>{
    const query=vi.fn().mockResolvedValue({rows:[{public_config:sample.config,status:sample.status}]});
    const pool={connect:async()=>({query,release:vi.fn()})};
    const outbox={claimBatch:vi.fn().mockResolvedValue([{id:'event',workspaceId:'workspace-a',aggregateId:'sale-1',claimToken:'claim',payload:{result:'WON',revenueMinor:15000,journeyId:'journey-1'}}]),completeEvent:vi.fn(),failEvent:vi.fn()};
    const gateway={sendPurchaseEvent:vi.fn()};
    await new CapiDispatchWorker({pool:pool as any,outboxGateway:outbox as any,capiGateway:gateway}).processSingleBatch();
    expect(gateway.sendPurchaseEvent).not.toHaveBeenCalled();
    expect(outbox.failEvent).toHaveBeenCalledTimes(sample.fail?1:0);
    expect(query.mock.calls.some(([sql])=>String(sql).includes('UPDATE public.commercial_outcomes'))).toBe(false);
  });
});
