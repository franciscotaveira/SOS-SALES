
export interface ApprovedCheckout {name:string;url:string;amountMinor:number;interval:string}
/** Only the SOS workspace can offer its own existing Cakto billing plans.
 * Does not create a checkout, confirm a payment, or provision an account.
 */
export async function resolveSosCheckout(query:(sql:string,args:unknown[])=>Promise<any>,workspaceId:string,message:string):Promise<ApprovedCheckout|null>{
  if(workspaceId!=='11111111-1111-1111-1111-111111111111')return null;
  const interval=/\bmensal\b/i.test(message)?'month':/\banual\b/i.test(message)?'year':null;
  if(!interval || !/(?:contratar|comprar|assinar|checkout|link.{0,15}pagamento|pagar)/i.test(message))return null;
  const plans=await query("SELECT name,checkout_url,amount_minor,interval_unit FROM public.billing_plans WHERE provider='cakto' AND active=true AND currency='BRL' AND interval_unit=$1 AND interval_count=1 ORDER BY id LIMIT 2",[interval]);
  if(plans.rows.length!==1)return null; // ambiguous offers require operator selection
  const plan=plans.rows[0];
  const amount=Number(plan.amount_minor);
  if(!Number.isSafeInteger(amount)||amount<=0)return null;
  let url:URL;try{url=new URL(plan.checkout_url);}catch{return null;}
  if(url.protocol!=='https:'||url.hostname!=='pay.cakto.com.br'||url.port||url.username||url.password||url.hash||url.search||url.pathname.length<2)return null;
  return {name:String(plan.name),url:url.toString(),amountMinor:amount,interval};
}

export function checkoutText(offer:ApprovedCheckout):string{
  return `${offer.name}: ${(offer.amountMinor/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} por ${offer.interval==='month'?'mês':'ano'}. Checkout oficial: ${offer.url}\nA contratação depende da confirmação do pagamento e da vinculação da compra à sua conta autenticada.`;
}
