import {afterEach,describe,expect,it,vi} from 'vitest';
import Fastify from 'fastify';
import {whatsappChannelRoutes} from '../../src/interfaces/http/routes/whatsapp-channel-routes.js';
import {dbPool} from '../../src/infrastructure/database/pool.js';
vi.mock('../../src/infrastructure/database/pool.js', async importOriginal => ({
  ...await importOriginal<Record<string,unknown>>(), dbPool:{query:vi.fn()},
}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
const workspace='11111111-1111-1111-1111-111111111111';
describe('CAPI test with saved credentials',()=>{
  it.each(['accepted','zero_ack','different_dataset','missing_code'])('%s',async scenario=>{
    const query=vi.spyOn(dbPool,'query').mockResolvedValue({rows:[{public_config:{metaDatasetId:'22222',metaPixelId:'11111'},secret_payload:{accessToken:'server-only-secret'}}]} as never);
    const fetch=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({events_received:scenario==='zero_ack'?0:1})});vi.stubGlobal('fetch',fetch);
    const app=Fastify();await app.register(whatsappChannelRoutes,{
      authenticator:{verifyAccessToken:async()=>({userId:'owner'})},
      workspaceDirectory:{listForActor:async()=>[{id:workspace,name:'Test',slug:'test',role:'owner'}]},
    });
    try {
      const response=await app.inject({method:'POST',url:`/api/v1/workspaces/${workspace}/tracking/test-capi`,headers:{authorization:'Bearer valid.jwt.token'},payload:{phone:'+5511999999999',eventName:'Purchase',...(scenario!=='missing_code'?{testEventCode:'TEST123'}:{}),...(scenario==='different_dataset'?{datasetId:'33333'}:{})}});
      if(scenario==='accepted'){
        expect(response.statusCode).toBe(200);expect(fetch.mock.calls[0][0]).toMatch(/\/22222\/events$/);
        expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer server-only-secret');
        expect(response.body).not.toContain('server-only-secret');
      }else if(scenario==='zero_ack'){expect(response.statusCode).toBe(400)}
      else {expect(response.statusCode).toBe(409);expect(fetch).not.toHaveBeenCalled();}
      if(scenario==='missing_code')expect(query).not.toHaveBeenCalled();
    }finally{await app.close();}
  });
});
