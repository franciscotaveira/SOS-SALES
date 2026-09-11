import type {WorkspaceConfig} from '../../infrastructure/ai/receptionist-system-prompt.js';

import {moneyMinor} from '../../domain/sales-money.js';
export {moneyMinor};

export function isContactRefusal(text:string):boolean {
  return /^\s*(?:stop|sair)[.!\s]*$|\bcancelar mensagens\b|(?:n[aã]o quero|pare de|n[aã]o me|remova meu|exclua meu).{0,55}(?:contato|mensage|mandar|envi|n[uú]mero|lista)|(?:me tire|me remova).{0,25}lista/i.test(text);
}

export const SALES_SKILLS = [
  {id:'discovery',version:1,goal:'Entender necessidade e adequação',stop:'Recusa ou pedido humano',tools:['read_published_catalog'],instruction:'Responda à dúvida e faça no máximo uma pergunta necessária. Não pressione nem invente adequação.'},
  {id:'offer',version:1,goal:'Apresentar oferta publicada',stop:'Oferta ausente ou condição excepcional',tools:['read_published_catalog'],instruction:'Explique benefícios comprovados para a necessidade. Nunca invente preço, resultado, escassez ou depoimento.'},
  {id:'objection',version:1,goal:'Esclarecer objeção comum',stop:'Pedido de desconto, cobrança, reclamação grave ou humano',tools:['read_published_knowledge'],instruction:'Acolha a dúvida, explique valor com fatos publicados e confira se a solução atende. Dizer que está caro não obriga a transferir. Concessões exigem a equipe.'},
  {id:'handoff',version:1,goal:'Continuar com a equipe',stop:'Handoff registrado',tools:['open_handoff'],instruction:'Não prometa tempo de atendimento ou execução não confirmados.'},
] as const;

const links=(text:string)=>text.match(/(?:https?:\/\/|www\.)[^\s<>"'\)\]]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|tech|io|br|invalid)(?:\/[^\s<>"'\)\]]*)?/gi)||[];
const normalizedUrl=(value:string)=>value.replace(/[.,;!?]+$/,'').replace(/\/$/,'');

/** Deterministic guard, never a claim of semantic completeness. */
export function validateSalesReply(text:string,config:WorkspaceConfig): {ok:boolean;reason?:string} {
  const approvedLinks=new Set(links(config.bookingUrl || '').map(normalizedUrl));
  for(const link of config.approvedLinks || [])approvedLinks.add(normalizedUrl(link));
  if (links(text).some(link=>!approvedLinks.has(normalizedUrl(link)))) return {ok:false,reason:'unapproved_link'};
  const amounts=new Set<number>();
  for(const service of config.services){
    const direct=moneyMinor(service.price);if(direct!==undefined)amounts.add(direct);
    // Only explicit currency in legacy descriptions; an installment count is not a price.
    for(const m of (service.price || '').matchAll(/R\$\s*(\d(?:[\d.,]*\d)?)/g)){const n=moneyMinor(m[1]);if(n!==undefined)amounts.add(n);}
  }
  for(const m of text.matchAll(/(?:R\$\s*)(\d(?:[\d.,]*\d)?)|(\d(?:[\d.,]*\d)?)\s*(?:reais|real)\b/gi)){
    const n=moneyMinor(m[1]||m[2]);if(n===undefined||!amounts.has(n))return {ok:false,reason:'unapproved_price'};
  }
  // Reply text cannot assert irreversible effects: this agent has no such tools.
  const effects=/(?:pagamento|conta|acesso|reserva|agendamento).{0,25}(?:confirmad|ativad|liberad|realizad)|(?:reservei|ativei|liberei|confirmei|cobrei)|(?:garanto|garantimos).{0,60}(?:fatur|lucro|resultado)|(?:concedo|concedi|autorizo|libero).{0,30}(?:desconto|gr[aá]tis|gratuit)/gi;
  for(const match of text.matchAll(effects)){
    const prefix=text.slice(Math.max(0,match.index!-10),match.index);
    const negated=/\b(?:n[aã]o|nunca)\s*$/i.test(prefix)||/\b(?:n[aã]o|ainda n[aã]o)\s+(?:foi |est[aá] )?(?:confirmad|ativad|liberad|realizad)/i.test(match[0]);
    if(!negated)return {ok:false,reason:'unconfirmed_effect'};
  }
  if(/(?:desconto|gr[aá]tis|gratuit).{0,15}(?:aprovad|concedid|liberad)/i.test(text))return {ok:false,reason:'unauthorized_concession'};
  return {ok:true};
}
