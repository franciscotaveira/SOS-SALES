import {randomUUID, createHmac} from 'node:crypto';
import Fastify from 'fastify';
import {wabaWebhookPlugin} from '../../src/interfaces/http/routes/webhooks/waba-webhook.js';
import {Client} from 'pg';
import {expect, it, vi} from 'vitest';
import {queueCapiLead} from '../../src/infrastructure/database/queue-capi-lead.js';
import {dispatchCapiLead} from '../../src/infrastructure/workers/dispatch-capi-lead.js';
import {PostgresOutboxProcessingGateway} from '../../src/infrastructure/database/postgres-outbox-processing-gateway.js';

it('atomically queues once, rejects another workspace and rolls back both records', async () => {
  const client = new Client({connectionString: 'postgresql://postgres:postgres@127.0.0.1:55432/postgres'});
  const workspaceId = randomUUID(), channelId = randomUUID(), journeyId = randomUUID(), contactId = randomUUID();
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO public.workspaces(id,name,slug) VALUES ($1::uuid,'CAPI local test',$1::text)`, [workspaceId]);
    await client.query(`INSERT INTO public.channel_connections(id,workspace_id,provider,phone_number,name,public_config)
      VALUES ($1,$2,'meta_cloud','+15555550199','CAPI test',$3)`, [channelId,workspaceId,JSON.stringify({metaCapiEnabled:true,metaCapiActionSource:'business_messaging',metaDatasetId:'1234',wabaId:'9876'})]);
    await client.query(`INSERT INTO public.contacts(id,workspace_id,phone) VALUES ($1,$2,'+15555550199')`,[contactId,workspaceId]);
    await client.query(`INSERT INTO public.commercial_journeys(id,workspace_id,contact_id,channel_connection_id) VALUES ($1,$2,$3,$4)`,[journeyId,workspaceId,contactId,channelId]);
    const input = {workspaceId,channelId,journeyId,ctwaClid:'test-click',occurredAt:new Date()};
    expect(await queueCapiLead(client,{...input,workspaceId:randomUUID()})).toBeNull();
    const id = await queueCapiLead(client,input);
    expect(id).toBeTruthy();
    expect(await queueCapiLead(client,input)).toBeNull();
    expect((await client.query('SELECT count(*)::int AS n FROM public.outbox_events WHERE workspace_id=$1 AND aggregate_id=$2',[workspaceId,id])).rows[0].n).toBe(1);
    await client.query(`INSERT INTO public.channel_connection_secrets(channel_connection_id,workspace_id,secret_kind,secret_payload)
      VALUES ($1,$2,'meta_capi_token','{"accessToken":"local-test-only"}')`,[channelId,workspaceId]);
    // Preserve the outer fixture transaction while exercising real SQL, row locks and service role.
    const pool = {connect:async()=>({release:()=>{},query:async(sql:string,params?:unknown[])=>{
      if(sql==='BEGIN') return client.query('SAVEPOINT lead_dispatch');
      if(sql==='COMMIT') return client.query('RELEASE SAVEPOINT lead_dispatch');
      if(sql==='ROLLBACK') return client.query('ROLLBACK TO SAVEPOINT lead_dispatch');
      return client.query(sql,params);
    }})};
    const gateway = {sendLeadEvent:vi.fn(async()=>({success:true as const,capiEventId:id!,fbtraceId:'local-trace'}))};
    expect(await dispatchCapiLead(pool as any,gateway,randomUUID(),id!)).toMatchObject({success:false,errorCode:'LEAD_NOT_FOUND'});
    expect(gateway.sendLeadEvent).not.toHaveBeenCalled();
    await dispatchCapiLead(pool as any,gateway,workspaceId,id!);
    await dispatchCapiLead(pool as any,gateway,workspaceId,id!);
    expect(gateway.sendLeadEvent).toHaveBeenCalledTimes(1);
    expect(gateway.sendLeadEvent).toHaveBeenCalledWith(expect.objectContaining({eventId:id,pixelId:'1234',ctwaClid:'test-click'}),'local-test-only');
    expect((await client.query('SELECT status,fbtrace_id FROM public.capi_lead_deliveries WHERE id=$1',[id])).rows[0]).toEqual({status:'DISPATCHED',fbtrace_id:'local-trace'});
    const inboundId = randomUUID();
    await client.query(`INSERT INTO public.inbound_channel_events
      (id,workspace_id,channel_connection_id,provider,provider_event_id,event_type,raw_payload)
      VALUES ($1::uuid,$2,$3,'waha',$1::text,'message',$4)`,[inboundId,workspaceId,channelId,JSON.stringify({payload:{referral:{ctwa_clid:'waha-explicit-click'}}})]);
    const inbound = new PostgresOutboxProcessingGateway(pool as any);
    const params = {inboundEventId:inboundId,contactPhone:'+15555550199',whatsappId:null,contactName:null,
      providerMessageId:randomUUID(),textContent:'local test',mediaPayload:null,sentAt:new Date()};
    await inbound.normalizeWahaInboundMessage(params);
    await inbound.normalizeWahaInboundMessage(params);
    expect((await client.query(`SELECT count(*)::int AS n FROM public.capi_lead_deliveries
      WHERE workspace_id=$1 AND ctwa_clid='waha-explicit-click'`,[workspaceId])).rows[0].n).toBe(1);
    await client.query(`UPDATE public.channel_connections SET public_config=public_config || jsonb_build_object('phoneNumberId',$2::text) WHERE id=$1`,[channelId,channelId]);
    const app=Fastify();
    app.addHook('preValidation',async(request)=>{(request as any).rawBody=Buffer.from(JSON.stringify(request.body));});
    await app.register(wabaWebhookPlugin,{verifyToken:'local',appSecret:'local-secret',
      databasePool:{...pool,query:client.query.bind(client)} as any,
      receptionistAgent:{isEnabled:()=>false} as any});
    try {
      const payload={object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{
        metadata:{phone_number_id:channelId},messages:[{id:randomUUID(),from:'15555550198',type:'text',timestamp:String(Math.floor(Date.now()/1000)),text:{body:'local test'},referral:{ctwa_clid:'waba-click'}}]
      }}]}]};
      const signature='sha256='+createHmac('sha256','local-secret').update(JSON.stringify(payload)).digest('hex');
      for(let i=0;i<2;i++) {
        const response=await app.inject({method:'POST',url:'/api/v1/channels/waba/webhook',payload,headers:{'x-hub-signature-256':signature}});
        expect(response.statusCode,response.body).toBe(200);
      }
      expect((await client.query(`SELECT count(*)::int AS n FROM public.capi_lead_deliveries WHERE workspace_id=$1 AND ctwa_clid='waba-click'`,[workspaceId])).rows[0].n).toBe(1);
    } finally {await app.close();}
    await client.query('ROLLBACK');
    expect((await client.query('SELECT count(*)::int AS n FROM public.capi_lead_deliveries WHERE workspace_id=$1',[workspaceId])).rows[0].n).toBe(0);
    expect((await client.query('SELECT count(*)::int AS n FROM public.outbox_events WHERE workspace_id=$1',[workspaceId])).rows[0].n).toBe(0);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
