import React, {useEffect,useState} from 'react';
import {authenticatedFetch} from '../../services/authenticatedFetch';

export function PilotContacts({workspaceId,selected,onChange,disabled}:{workspaceId:string;selected:string[];onChange:(ids:string[])=>void;disabled:boolean}){
  const [search,setSearch]=useState('');
  const [contacts,setContacts]=useState<Array<{id:string;name:string;phone:string}>>([]);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;setContacts([]);setError('');
    const timer=setTimeout(async()=>{try{
      const response=await authenticatedFetch(`/api/v1/workspaces/${workspaceId}/contacts?limit=30&search=${encodeURIComponent(search)}`);
      if(!response.ok)throw new Error('Não foi possível carregar os contatos.');
      const body=await response.json();if(active)setContacts(Array.from(new Map<string,{id:string;name:string;phone:string}>((body.contacts||[]).map((c:any)=>[c.id,c])).values()));
    }catch{if(active)setError('Não foi possível carregar os contatos.');}},250);
    return()=>{active=false;clearTimeout(timer);};
  },[workspaceId,search]);
  return <div className="space-y-2 text-sm">
    <label className="block">Contatos autorizados para o piloto ({selected.length}/50)
      <input className="mt-1 w-full rounded-lg border p-2 text-base" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome ou telefone" />
    </label>
    <p>Sem contatos selecionados, as novas habilidades funcionam apenas no simulador.</p>
    {error&&<p role="alert">{error}</p>}
    <div className="max-h-40 overflow-y-auto space-y-1">
      {contacts.map(contact=><label key={contact.id} className="flex items-center gap-2 min-h-11"><input type="checkbox" disabled={disabled||(!selected.includes(contact.id)&&selected.length>=50)} checked={selected.includes(contact.id)} onChange={e=>onChange(e.target.checked?[...selected,contact.id]:selected.filter(id=>id!==contact.id))}/><span>{contact.name||'Sem nome'} · {contact.phone}</span></label>)}
      {!error&&contacts.length===0&&<p>Nenhum contato encontrado.</p>}
    </div>
    <button type="button" disabled={disabled||!selected.length} onClick={()=>onChange([])} className="underline disabled:opacity-50">Remover todos do piloto</button>
  </div>;
}

export function AgentGovernancePanel({workspaceId,canManage}:{workspaceId:string;canManage:boolean}){
  const [outcomes,setOutcomes]=useState<Array<{result:string;count:number;average_latency_ms:number}>>([]);
  const [revisions,setRevisions]=useState<Array<{id:string;created_at:string}>>([]);
  const [revision,setRevision]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let active=true;setOutcomes([]);setRevisions([]);setRevision('');setError('');
    Promise.all(['agent/outcomes','intelligence/revisions'].map(async(path)=>{
      const response=await authenticatedFetch(`/api/v1/workspaces/${workspaceId}/${path}`);
      if(!response.ok)throw new Error('Falha ao carregar histórico');return (await response.json()).data;
    })).then(([runs,history])=>{if(active){setOutcomes(runs);setRevisions(history);}}).catch(()=>{if(active)setError('Não foi possível carregar o acompanhamento do agente.');});
    return()=>{active=false;};
  },[workspaceId]);
  async function restore(){
    setBusy(true);setError('');try{
      const response=await authenticatedFetch(`/api/v1/workspaces/${workspaceId}/intelligence/revisions/${revision}/restore`,{method:'POST'});
      if(!response.ok)throw new Error('Falha');window.location.reload();
    }catch{setError('Não foi possível restaurar a configuração.');}finally{setBusy(false);}
  }
  const labels:Record<string,string>={replied:'Resposta enviada',handoff:'Encaminhado à equipe',processing_error:'Falha de processamento',contact_opted_out:'Recusa de contato',agent_budget_or_consent_blocked:'Limite de uso ou recusa',bot_paused_for_journey:'Atendimento pausado ou não elegível',outbound_already_sent:'Duplicata evitada'};
  return <section className="rounded-xl border p-4 space-y-3 mt-6">
    <h3 className="font-semibold">Acompanhamento e recuperação</h3>
    <p className="text-sm">Execuções nas últimas 24 horas. Tentativas repetidas contam separadamente; resposta enviada não comprova leitura nem venda.</p>
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    {outcomes.length?<ul className="text-sm space-y-1">{outcomes.map(run=><li key={run.result}>{labels[run.result]||'Outro resultado operacional'}: {run.count} · média {(run.average_latency_ms/1000).toFixed(1)} s</li>)}</ul>:!error&&<p>Sem execuções registradas neste período.</p>}
    {canManage&&<div className="space-y-2">
      <label className="block text-sm">Voltar a uma publicação anterior
        <select className="block w-full border rounded-lg p-2 min-h-11" value={revision} onChange={e=>setRevision(e.target.value)}><option value="">Selecione a publicação</option>{revisions.slice(1).map(item=><option key={item.id} value={item.id}>{new Date(item.created_at).toLocaleString('pt-BR')}</option>)}</select>
      </label>
      <p className="text-sm">Restaurar substitui perfil, catálogo e regras atuais pela publicação selecionada. A página será recarregada e edições não salvas serão descartadas.</p>
      <button type="button" disabled={!revision||busy} onClick={restore} className="rounded-lg border px-4 py-2 min-h-11 disabled:opacity-50">{busy?'Restaurando…':'Restaurar publicação selecionada'}</button>
    </div>}
  </section>;
}
