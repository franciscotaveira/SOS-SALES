import {describe,it,expect,vi} from 'vitest';
import {HumanizerKernel} from '../../src/infrastructure/ai/humanizer-kernel.js';
import {buildSystemPrompt,publishedOpeningStatus, type WorkspaceConfig} from '../../src/infrastructure/ai/receptionist-system-prompt.js';
import {loadPublishedWorkspaceConfig,ReceptionistAgent,HANDOFF_ACKNOWLEDGEMENT} from '../../src/application/agents/receptionist-agent.js';
const config:WorkspaceConfig={name:'Hotel Brasil',agentName:'Recepção',businessType:'Hotel',services:[],workingHours:'Recepção 24h',phone:'',city:'Chapecó',bookingFlowEnabled:false,behavior:{structure:'bloco_unico',emojis:'zero_emojis'}};
describe('Published agent instructions and tenant isolation',()=>{
 it.each([
 'Não posso liberar acesso grátis para você. Consulte a recepção do hotel.',
 'O atendimento funciona de segunda a sábado, das 9h às 19h.',
 'Sou uma assistente virtual da Haven. Como posso ajudar?',
 'Contato oficial: (49) 98888-7777.',
 ])('preserves meaning without inserting offers or questions: %s',text=>{expect(HumanizerKernel.humanizeReply(text)).toBe(text);});
 it('does not inject the SOS identity, invent closed hours, or offer disabled flows',()=>{
  const p=buildSystemPrompt(config,new Date('2026-09-10T23:00:00Z'));
  expect(p).not.toContain('Sofia');expect(p).not.toContain('SOS Vendas');
  expect(p).toContain('abertura atual não confirmada');expect(p).toContain('sendBookingFlow deve ser false');
  expect(p).toContain('Use um único bloco curto e coeso.');expect(p).toContain('Não use emojis.');
 });
 it('computes structured hours in Sao Paulo including overnight windows',()=>{
  const c={...config,businessHours:{qui:{isOpen:true,open:'22:00',close:'02:00'},sex:{isOpen:false}}};
  expect(publishedOpeningStatus(c,new Date('2026-09-11T02:00:00Z'))).toMatch(/^ABERTO/);
  expect(publishedOpeningStatus(c,new Date('2026-09-11T04:00:00Z'))).toMatch(/^ABERTO/);
  expect(publishedOpeningStatus(c,new Date('2026-09-11T05:00:00Z'))).toMatch(/^FORA/);
 });
 it('loads legacy payment fields and corrections even with safety guardrails',async()=>{
  const query=vi.fn(async(sql:string)=>({rows:sql.includes('workspace_agent_config')?[{workspace_name:'Hotel',agent_name:'Recepção',services_json:[]}]:sql.includes('workspace_intelligence_bundles')?[{bundle:{agentConfig:{paymentMethods:['pix'],maxInstallmentsWithoutInterest:3,workingHoursOnly:false,safetyGuardrails:['Regra antiga']},directives:['Regra corretiva atual']}}]:[],rowCount:1}));
  const c=await loadPublishedWorkspaceConfig(query as any,'workspace');expect(c?.allowedPaymentMethods).toEqual(['pix']);expect(c?.installmentLimitWithoutInterest).toBe(3);expect(c?.workingHoursOnly).toBe(false);
  expect(buildSystemPrompt(c!)).toContain('Regra corretiva atual');
  expect(query.mock.calls.some(([sql])=>sql.includes('published_at IS NOT NULL'))).toBe(true);
 });
 it('disables generation when published instruction reads fail',async()=>{
  const query=vi.fn(async(sql:string)=>{if(sql.includes('workspace_agent_config'))return {rows:[{services_json:[]}]};throw new Error('database unavailable');});
  expect(await loadPublishedWorkspaceConfig(query as any,'workspace')).toBeNull();
 });
 it('canonical empty values override legacy settings',async()=>{
  const query=vi.fn(async(sql:string)=>({rows:sql.includes('workspace_agent_config')?[{services_json:[]}]:sql.includes('workspace_intelligence_bundles')?[{bundle:{agentConfig:{allowedPaymentMethods:[],paymentMethods:['pix'],installmentLimitWithoutInterest:0,maxInstallmentsWithoutInterest:12}}}]:[]}));
  const c=await loadPublishedWorkspaceConfig(query as any,'workspace');expect(c?.allowedPaymentMethods).toBeUndefined();expect(c?.installmentLimitWithoutInterest).toBe(0);
 });
 it('acknowledges handoff once using the outbound reservation',async()=>{
  const agent=new ReceptionistAgent({query:vi.fn() as any}) as any;
  agent.resolveChannelTransport=vi.fn().mockResolvedValue({provider:'waha',sessionName:'test'});
  agent.reserveOutbound=vi.fn().mockResolvedValueOnce({shouldSend:true,reservationId:'r1',status:'SENDING'}).mockResolvedValue({shouldSend:false,reservationId:'r1',status:'SENT'});
  agent.waha={sendText:vi.fn().mockResolvedValue({success:true,providerMessageId:'p1'})};
  agent.completeOutbound=vi.fn();
  const input={conversationMessageId:'m1',workspaceId:'w1',journeyId:'j1',channelConnectionId:'c1',fromPhone:'5549999999999'};
  await agent.sendHandoffAcknowledgement(input);await agent.sendHandoffAcknowledgement(input);
  expect(agent.waha.sendText).toHaveBeenCalledTimes(1);expect(agent.waha.sendText.mock.calls[0][0].text).toBe(HANDOFF_ACKNOWLEDGEMENT);
  expect(agent.completeOutbound).toHaveBeenCalledWith(input,'r1',HANDOFF_ACKNOWLEDGEMENT,'p1');
 });
 it('marks ambiguous acknowledgement for reconciliation without retrying the provider',async()=>{
  const agent=new ReceptionistAgent({query:vi.fn() as any}) as any;
  agent.resolveChannelTransport=vi.fn().mockResolvedValue({provider:'waha',sessionName:'test'});
  agent.reserveOutbound=vi.fn().mockResolvedValue({shouldSend:true,reservationId:'r1'});
  agent.waha={sendText:vi.fn().mockRejectedValue(new Error('timeout'))};agent.markOutboundUnknown=vi.fn();
  await agent.sendHandoffAcknowledgement({conversationMessageId:'m1',workspaceId:'w1',channelConnectionId:'c1',fromPhone:'5549999999999'});
  expect(agent.markOutboundUnknown).toHaveBeenCalledWith('r1','HANDOFF_ACK_DELIVERY_UNCONFIRMED');
 });
});
