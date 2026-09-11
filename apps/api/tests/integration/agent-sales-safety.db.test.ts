import {randomUUID} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {dbPool} from '../../src/infrastructure/database/pool.js';

async function fixture(client:any){
  const w=randomUUID(),c=randomUUID(),j=randomUUID(),ch=randomUUID(),m=randomUUID();
  await client.query("INSERT INTO public.workspaces(id,name,slug,active) VALUES($1::uuid,'Safety test',$1::text,true)",[w]);
  await client.query("INSERT INTO public.contacts(id,workspace_id,phone,name) VALUES($1,$2,'+5549999000098','Consent test')",[c,w]);
  await client.query("INSERT INTO public.channel_connections(id,workspace_id,provider,phone_number,name,public_config,status) VALUES($1,$2,'waha','+5549999000099','Safety channel','{}','CONNECTED')",[ch,w]);
  await client.query("INSERT INTO public.commercial_journeys(id,workspace_id,contact_id,channel_connection_id,status,bot_enabled,responder_owner) VALUES($1,$2,$3,$4,'OPEN',true,'sos_sales')",[j,w,c,ch]);
  async function message(text:string,id=m){await client.query("INSERT INTO public.conversation_messages(id,workspace_id,channel_connection_id,journey_id,contact_id,direction,sender_type,provider_message_id,text_content) VALUES($1::uuid,$2,$3,$4,$5,'inbound','customer',$1::text,$6)",[id,w,ch,j,c,text]);return id;}
  await message('Quero conhecer');
  return {w,c,j,ch,m,message};
}
describe('agent safety enforced by PostgreSQL',()=>{
  it('records refusal without the AI and blocks a new outbound reservation',async()=>{
    const client=await dbPool.connect();
    try{
      await client.query('BEGIN');const f=await fixture(client);
      await client.query('UPDATE public.commercial_journeys SET bot_enabled=false WHERE id=$1',[f.j]);
      await f.message('Não me envie mais mensagens',randomUUID());
      expect((await client.query('SELECT outbound_opted_out_at FROM public.contacts WHERE id=$1',[f.c])).rows[0].outbound_opted_out_at).toBeTruthy();
      await f.message('SOS',randomUUID());
      expect((await client.query('SELECT outbound_opted_out_at FROM public.contacts WHERE id=$1',[f.c])).rows[0].outbound_opted_out_at).toBeTruthy();
      await client.query('UPDATE public.commercial_journeys SET bot_enabled=true WHERE id=$1',[f.j]);
      await client.query('SAVEPOINT sending');
      await expect(client.query("SELECT public.reserve_receptionist_outbound($1,$2,$3,$4,$5,'waha','TEXT','Mensagem',$6)",[f.w,f.m,f.j,f.c,f.ch,'0123456789abcdef0123456789abcdef'])).rejects.toThrow('CONTACT_OPTED_OUT');
      await client.query('ROLLBACK TO SAVEPOINT sending');
      expect((await client.query('SELECT count(*)::int AS n FROM public.receptionist_outbound_reservations WHERE workspace_id=$1',[f.w])).rows[0].n).toBe(0);
    }finally{await client.query('ROLLBACK');client.release();}
  });
  it('allows exactly sixty contact inferences and denies cross-tenant messages',async()=>{
    const client=await dbPool.connect();
    try{
      await client.query('BEGIN');const f=await fixture(client);
      await client.query('SET LOCAL ROLE sos_sales_runtime');
      const claim=async(w=f.w,c=f.c)=>(await client.query('SELECT public.claim_agent_turn($1,$2,$3) AS allowed',[w,c,f.m])).rows[0].allowed;
      expect(await claim(randomUUID())).toBe(false);
      expect(await claim(f.w,randomUUID())).toBe(false);
      for(let i=0;i<60;i++)expect(await claim()).toBe(true);
      expect(await claim()).toBe(false);
    }finally{await client.query('ROLLBACK');client.release();}
  });
  it('archives only published configurations for the right workspace',async()=>{
    const client=await dbPool.connect();
    try{
      await client.query('BEGIN');const f=await fixture(client);
      await client.query("INSERT INTO public.workspace_intelligence_bundles(workspace_id,bundle,published_at) VALUES($1,'{\"catalog\":[]}',NOW())",[f.w]);
      await client.query("UPDATE public.workspace_intelligence_bundles SET bundle='{\"catalog\":[{\"name\":\"Novo\"}]}' WHERE workspace_id=$1",[f.w]);
      await client.query('SET LOCAL ROLE sos_sales_runtime');
      const revisions=await client.query('SELECT bundle FROM public.agent_configuration_revisions WHERE workspace_id=$1 ORDER BY id',[f.w]);
      expect(revisions.rows).toEqual([{bundle:{catalog:[]}},{bundle:{catalog:[{name:'Novo'}]}}]);
    }finally{await client.query('ROLLBACK');client.release();}
  });
});
