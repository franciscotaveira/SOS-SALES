// Read-only diagnostic: synthetic inputs, no model calls or outbound messages.
import {HumanizerKernel} from '../src//infrastructure/ai/humanizer-kernel.js';
import {buildSystemPrompt} from '../src//infrastructure/ai/receptionist-system-prompt.js';
const samples = [
 'O atendimento funciona de segunda a sábado, das 9h às 19h.',
 'Sou a assistente virtual da Haven. Como posso ajudar?',
 'Não posso liberar acesso grátis para você. Consulte a recepção do hotel.'
];
const prompt=buildSystemPrompt({name:'Hotel de teste',agentName:'Recepção do hotel',businessType:'Hotel',services:[],workingHours:'Recepção 24h',phone:'',city:'Chapecó',bookingFlowEnabled:false,behavior:{structure:'bloco_unico',emojis:'zero_emojis'}});
console.log(JSON.stringify({transformations:samples.map(input=>({input,output:HumanizerKernel.humanizeReply(input)})),promptConflicts:{foreignSofiaIdentity:prompt.includes('Aqui é a Sofia da SOS Vendas'),singleBlockAndMandatorySecond:prompt.includes('Use um único bloco curto e coeso.')&&prompt.includes('SEGUNDA MENSAGEM COMPLEMENTAR'),disabledFlowStillPromised:prompt.includes('Informe que vai enviar formulário interativo'),fixedWorkingStatus:prompt.match(/STATUS: ([^\n]+)/)?.[1]}},null,2));
