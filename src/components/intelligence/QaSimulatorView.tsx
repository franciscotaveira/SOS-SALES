import React, { useEffect, useRef, useState } from 'react';
import { Workspace } from '../../types/cockpit';
import { ClientIntelligenceBundle } from '../../types/intelligence';
import { authenticatedFetch } from '../../services/authenticatedFetch';

interface QaSimulatorViewProps {
  currentWorkspace?: Workspace;
  bundle?: ClientIntelligenceBundle;
  onSimulateIncomingLeadMessage?: () => void;
  onSimulateNetworkErrorToggle?: () => void;
  isNetworkErrorForced?: boolean;
  onNavigateToTab?: (tab: string) => void;
}
type Message = { role: 'customer' | 'assistant'; text: string; model?: string; latencyMs?: number };

// A new workspace gets a separate instance: pending responses cannot enter another chat.
export const QaSimulatorView: React.FC<QaSimulatorViewProps> = (props) => (
  <WorkspaceSimulator key={props.currentWorkspace?.id || 'no-workspace'} {...props} />
);

function WorkspaceSimulator({ currentWorkspace, onNavigateToTab }: QaSimulatorViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const sending = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const handleSendCustomMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    const workspaceId = currentWorkspace?.id;
    if (!text || !workspaceId || sending.current) return;
    if (text.startsWith('/')) {
      setError('Edite as orientações em IA & Conhecimento. Este simulador não publica configurações.');
      return;
    }
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await authenticatedFetch(`/api/v1/workspaces/${workspaceId}/agent/simulator/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: messages.map(m => ({ role: m.role, content: m.text })), contactName: 'Contato de teste', modelTier: 'reasoning' }),
      });
      if (!response.ok) {
        let errMessage = `A IA não respondeu (HTTP ${response.status}). Tente novamente.`;
        try {
          const errData = await response.json();
          if (errData?.error) {
            errMessage = errData.error;
          }
        } catch {}
        throw new Error(errMessage);
      }
      const data = await response.json();
      if (typeof data.agentResponse !== 'string' || !data.agentResponse.trim()) throw new Error('A API não retornou uma resposta válida. Tente novamente.');
      if (!alive.current) return;
      setMessages(prev => [...prev, { role: 'customer', text }, {
        role: 'assistant', text: data.agentResponse,
        model: typeof data.model === 'string' ? data.model : undefined,
        latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : undefined,
      }]);
      setInput('');
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : 'Falha na consulta à IA. Nenhuma resposta foi gerada localmente.');
    } finally {
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  };

  return <section className="mx-auto w-full max-w-5xl space-y-4 p-3 md:p-6">
    <header className="rounded-2xl bg-slate-950 p-5 text-white">
      <h1 className="text-xl font-bold">Teste do agente</h1>
      <p className="mt-2 text-sm text-slate-300">{currentWorkspace?.name || 'Selecione um workspace'} · Respostas da API com a configuração publicada deste cliente.</p>
      <p className="mt-1 text-sm text-slate-300">Este teste não envia mensagens pelo WhatsApp. Configure regras, catálogo e documentos em IA & Conhecimento.</p>
      {onNavigateToTab && <button type="button" onClick={() => onNavigateToTab('agent')} className="mt-3 rounded-lg bg-emerald-700 px-4 py-2">Abrir configurações do agente</button>}
    </header>
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Conversa de teste</h2><button type="button" disabled={busy} onClick={() => { setMessages([]); setError(null); }} className="rounded-lg border px-3 py-2 disabled:opacity-50">Limpar conversa</button></div>
      <div aria-live="polite" className="min-h-64 space-y-3">
        {messages.length === 0 && <p className="py-12 text-center text-slate-500">Envie uma mensagem para testar. Nenhuma avaliação foi executada ainda.</p>}
        {messages.map((message, index) => <div key={index} className={`max-w-[95%] rounded-xl p-3 md:max-w-[85%] ${message.role === 'assistant' ? 'ml-auto bg-emerald-50' : 'bg-slate-100'}`}>
          <div className="mb-1 text-xs font-semibold text-slate-500">{message.role === 'assistant' ? 'Agente' : 'Você'}</div>
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
          {message.role === 'assistant' && <p className="mt-2 text-xs text-slate-500">{message.model || 'Modelo não informado pela API'}{message.latencyMs !== undefined ? ` · ${message.latencyMs} ms` : ''}</p>}
        </div>)}
        {busy && <p role="status" className="text-sm text-slate-500">Aguardando resposta da IA…</p>}
      </div>
      {error && (
        <div role="alert" className="my-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-red-800">
          <p className="text-sm">{error}</p>
          {error.includes('Publique') && onNavigateToTab && (
            <button
              type="button"
              onClick={() => onNavigateToTab('agent')}
              className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 transition"
            >
              Publicar Configuração
            </button>
          )}
        </div>
      )}
      <form onSubmit={handleSendCustomMessage} className="mt-4 flex gap-2">
        <input aria-label="Mensagem de teste" value={input} onChange={e => setInput(e.target.value)} disabled={busy || !currentWorkspace?.id} placeholder="Digite uma mensagem para o agente" className="min-w-0 flex-1 rounded-xl border p-3 text-base" />
        <button disabled={busy || !input.trim() || !currentWorkspace?.id} className="rounded-xl bg-emerald-700 px-4 py-3 text-white disabled:opacity-50">Enviar</button>
      </form>
    </div>
  </section>;
}
