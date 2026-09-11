import {afterEach,describe,expect,it,vi} from 'vitest';
import {moneyMinor,isContactRefusal,validateSalesReply} from '../../src/application/services/agent-sales-policy.js';
import {checkoutText,resolveSosCheckout} from '../../src/application/services/sos-approved-checkout.js';
import {loadPublishedWorkspaceConfig,getReceptionistActionPolicy,ReceptionistAgent} from '../../src/application/agents/receptionist-agent.js';
import type {WorkspaceConfig} from '../../src/infrastructure/ai/receptionist-system-prompt.js';
import {PlaybookEvolutionEngine} from '../../src/application/services/playbook-evolution-engine.js';
import {dbPool} from '../../src/infrastructure/database/pool.js';
vi.mock('../../src/infrastructure/database/pool.js',()=>({dbPool:{query:vi.fn()}}));
const config:WorkspaceConfig={name:'Teste',agentName:'Sofia',businessType:'CRM',services:[{name:'Plano',price:'1.234,56'}],workingHours:'09h-18h',phone:'',city:'Chapecó',approvedLinks:['https://pay.cakto.com.br/oferta']};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
describe('published commercial facts and reply boundaries',()=>{
  it.each([[1234.56,123456],['R$ 1.234,56',123456],['1.234',123400],['49,90',4990],['49.90',4990],['0',0]])('parses %s without dropping thousands', (value,expected)=>expect(moneyMinor(value)).toBe(expected));
  it.each(['R$ 10 a 50','12x 49,90','-20','NaN','1,234.56',Infinity,{},''])('rejects ambiguous price %s',value=>expect(moneyMinor(value)).toBeUndefined());
  it.each(['R$ 1,00 hoje','Fica 100 reais.','https://evil.invalid/pay','https://pay.cakto.com.br/oferta?recipient=evil','pagamento confirmado','Sua conta foi ativada','Desconto aprovado','Não se preocupe, sua conta foi ativada.'])('blocks unsupported reply %s',reply=>expect(validateSalesReply(reply,config).ok).toBe(false));
  it('accepts the exact published amount and official link',()=>expect(validateSalesReply('R$ 1.234,56. Acesse https://pay.cakto.com.br/oferta',config).ok).toBe(true));
  it('does not treat an installment count as an approved amount',()=>expect(validateSalesReply('Pague R$ 12', {...config,services:[{name:'Plano',price:'12x R$ 49,90'}]}).ok).toBe(false));
  it('allows common objections only with enabled skills, keeps payment with humans',()=>{
    const decision={intent:'objection' as const,escalate:false,sendBookingFlow:false,reply:'Entendo. Qual recurso você precisa?'};
    expect(getReceptionistActionPolicy(decision,true).allowReply).toBe(true);
    expect(getReceptionistActionPolicy(decision,false).allowReply).toBe(false);
    expect(getReceptionistActionPolicy({...decision,intent:'payment'},true).allowReply).toBe(false);
  });
  it.each(['sair','STOP','Não quero receber mensagens','Me tire da lista','Não me envie mais nada'])('recognizes refusal %s',text=>expect(isContactRefusal(text)).toBe(true));
  it.each(['Preciso sair agora, volto depois','Não quero o plano anual','Está caro','Consigo sair do plano mensal depois?'])('does not confuse objection with refusal %s',text=>expect(isContactRefusal(text)).toBe(false));
  async function published(catalog:unknown,documents:unknown[]=[]){
    const query=vi.fn(async(sql:string)=>({rows:sql.includes('FROM public.workspace_agent_config')?[{workspace_name:'Teste',services_json:[{name:'Legado',price:'1'}]}]:sql.includes('workspace_intelligence_bundles')?[{bundle:{catalog,documents}}]:[{title:'Política crítica',status:'ready',content:'Não garante receita.'}]}));
    return loadPublishedWorkspaceConfig(query as any,'workspace');
  }
  it('respects an explicitly empty catalog',async()=>expect((await published([]))?.services).toEqual([]));
  it('preserves Brazilian amounts in the actual published loader',async()=>expect((await published([{name:'Plano',price:'R$ 1.234,56'}]))?.services[0].price).toBe('1234,56'));
  it('does not starve independent knowledge behind twelve bundled documents',async()=>expect((await published([],Array.from({length:12},(_,i)=>({name:`Doc${i}`,rawContentSnippet:`Conteúdo ${i}`}))))?.extraContext).toContain('Não garante receita.'));
});
describe('existing SOS checkout only',()=>{
  const workspace='11111111-1111-1111-1111-111111111111';
  const plan={name:'Mensal',amount_minor:9900,checkout_url:'https://pay.cakto.com.br/oferta',interval_unit:'month'};
  it('renders a verified active plan without asserting payment or provisioning',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[plan]});
    const offer=await resolveSosCheckout(query,workspace,'Quero contratar o plano mensal');
    expect(offer?.amountMinor).toBe(9900);
    expect(query.mock.calls[0][0]).toContain('active=true');
    expect(validateSalesReply(checkoutText(offer!),{...config,services:[{name:'Mensal',price:'99,00'}]}).ok).toBe(true);
  });
  it.each(['outro-workspace',''])('never sells SOS plans in tenant %s',async tenant=>{const query=vi.fn();expect(await resolveSosCheckout(query,tenant,'Quero contratar mensal')).toBeNull();expect(query).not.toHaveBeenCalled();});
  it.each([[],[plan,plan],[{...plan,checkout_url:'https://evil.invalid/oferta'}],[{...plan,amount_minor:-1}]].map(rows=>({rows})))('fails closed for absent, ambiguous or invalid plans',async ({rows})=>expect(await resolveSosCheckout(vi.fn().mockResolvedValue({rows}),workspace,'Quero contratar mensal')).toBeNull());
});
describe('playbook literal evidence',()=>{
  const messages=[{id:'c1',direction:'inbound',sender_type:'customer',text_content:'Está caro'},{id:'o1',direction:'outbound',sender_type:'operator',text_content:'O plano inclui acompanhamento da equipe.'},{id:'c2',direction:'inbound',sender_type:'customer',text_content:'Entendi'},{id:'c3',direction:'inbound',sender_type:'customer',text_content:'Vou contratar'}];
  it.each([{sourceMessageId:'o1',winningArgumentText:'Garantimos triplicar seu lucro'},{sourceMessageId:'c1',winningArgumentText:'Está caro'}])('rejects fabricated or customer-sourced argument',async extraction=>{
    const query=vi.spyOn(dbPool,'query');
    const engine=new PlaybookEvolutionEngine({generateChatCompletion:vi.fn().mockResolvedValue({content:JSON.stringify({...extraction,objectionTitle:'Preço'})})} as any);
    expect(await engine.distillAndEvolve('w','j',10000,messages as any)).toBeNull();expect(query).not.toHaveBeenCalled();
  });
  it('stores a literal human argument as an unconfirmed candidate',async()=>{
    const query=vi.spyOn(dbPool,'query').mockResolvedValue({rows:[],rowCount:1} as never);
    const generateChatCompletion=vi.fn().mockResolvedValue({content:JSON.stringify({sourceMessageId:'o1',winningArgumentText:'O plano inclui acompanhamento da equipe.',objectionTitle:'Preço'})});
    const result=await new PlaybookEvolutionEngine({generateChatCompletion} as any).distillAndEvolve('w','j',10000,messages as any);
    expect(result).toMatchObject({reviewStatus:'pending',confidence:0.5});
    expect(generateChatCompletion.mock.calls[0][0][1].content).toContain('O plano inclui acompanhamento');
    expect(query.mock.calls[0][0]).toContain("0.5, false, 'playbook_candidate'");
  });
});
