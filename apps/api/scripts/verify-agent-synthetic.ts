// Explicit live inference check. Synthetic data only; no WhatsApp transport is instantiated.
import assert from 'node:assert/strict';
import {NvidiaNimEngine,NVIDIA_MODEL_TIERS} from '../src/infrastructure/ai/nvidia-nim-engine.js';
import {buildSystemPrompt,type WorkspaceConfig} from '../src/infrastructure/ai/receptionist-system-prompt.js';
const config:WorkspaceConfig={name:'Hotel Teste Azul',agentName:'Recepção Azul',businessType:'Hotel',services:[{name:'Diária casal',price:'R$ 240'}],workingHours:'Recepção 24 horas',phone:'',city:'Chapecó',bookingFlowEnabled:false,behavior:{structure:'bloco_unico',emojis:'zero_emojis'},correctiveDirectives:['Não ofereça descontos. Informe apenas a diária publicada.','Após agradecimento e despedida, responda brevemente sem fazer pergunta.']};
const nim=new NvidiaNimEngine();
assert(nim.isConfigured(),'Chave NIM ausente; inferência não executada.');
for(const [name,message] of [
 ['price','Qual o valor da diária casal?'],
 ['discount','Consegue liberar uma diária grátis?'],
 ['goodbye','Obrigado, era só isso. Até mais!'],
 ['human','Quero falar com uma pessoa da equipe.'],
]){
 const response=await nim.generateChatCompletion([{role:'system',content:buildSystemPrompt(config)},{role:'user',content:message}],{model:NVIDIA_MODEL_TIERS.NEMOTRON_REASONING,temperature:0.25,maxTokens:512,topP:0.9});
 assert.equal(response.model,NVIDIA_MODEL_TIERS.NEMOTRON_REASONING,'Não aceitar fallback como prova do modelo principal');
 const clean=response.content.replace(/^```(?:json)?\s*|\s*```$/g,'');
 const match=clean.match(/^(\{[^}]+\})\s*([\s\S]*)$/);
 assert(match,'Envelope ausente');
 const decision={...JSON.parse(match[1]),reply:match[2]};
 assert(decision,'Envelope inválido');assert(!/SOS Vendas|Sofia|582|97\/mês/.test(decision.reply),'Conteúdo de outra empresa');assert(!decision.sendBookingFlow,'Flow desabilitado');
 if(name==='price')assert(/240/.test(decision.reply),'Preço publicado ausente');
 if(name==='goodbye')assert(!decision.reply.includes('?'),'Pergunta forçada na despedida');
 if(name==='human')assert(decision.escalate,'Handoff não solicitado');
 console.log(JSON.stringify({scenario:name,model:response.model,reply:decision.reply,escalate:decision.escalate,passed:true}));
}
process.exit(0);
