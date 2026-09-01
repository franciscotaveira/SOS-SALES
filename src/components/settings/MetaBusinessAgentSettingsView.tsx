import React from 'react';
import { Bot, CheckCircle2, ExternalLink, Loader2, Play, RefreshCw, ShieldAlert, WandSparkles } from 'lucide-react';
import { authenticatedFetch } from '../../services/authenticatedFetch';

interface MetaBusinessAgentSettingsViewProps {
  workspaceId: string;
}

type Eligibility = 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN';

interface EligibilityPayload {
  status: Eligibility;
  phoneNumberId?: string;
  checkedAt?: string;
  reason?: string;
}

export const MetaBusinessAgentSettingsView: React.FC<MetaBusinessAgentSettingsViewProps> = ({ workspaceId }) => {
  const [eligibility, setEligibility] = React.useState<EligibilityPayload>({ status: 'UNKNOWN' });
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<'onboarding' | 'test' | null>(null);
  const [feedback, setFeedback] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [catalogId, setCatalogId] = React.useState('');
  const [testMessage, setTestMessage] = React.useState('Olá, gostaria de saber como posso agendar um atendimento.');
  const [testResponse, setTestResponse] = React.useState<{ text: string; conversationId?: string } | null>(null);

  const loadEligibility = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch(`/api/v1/workspaces/${workspaceId}/meta-business-agent/eligibility`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Não foi possível consultar a elegibilidade.');
      setEligibility(payload?.data || { status: 'UNKNOWN' });
    } catch (error) {
      setEligibility({ status: 'UNKNOWN' });
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Meta Business Agent indisponível.' });
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  React.useEffect(() => { void loadEligibility(); }, [loadEligibility]);

  const startOnboarding = async () => {
    setBusy('onboarding');
    setFeedback(null);
    try {
      const response = await authenticatedFetch(`/api/v1/workspaces/${workspaceId}/meta-business-agent/onboarding`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(catalogId.trim() ? { catalogId: catalogId.trim() } : {}),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Não foi possível iniciar o onboarding.');
      setFeedback({ type: 'success', message: `Onboarding iniciado. Agente Meta: ${payload?.data?.agentId || 'criado'}.` });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Onboarding indisponível.' });
    } finally {
      setBusy(null);
    }
  };

  const runTest = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy('test');
    setFeedback(null);
    try {
      const response = await authenticatedFetch(`/api/v1/workspaces/${workspaceId}/meta-business-agent/test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMsg: testMessage }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Não foi possível executar o teste.');
      setTestResponse({ text: payload.data.agentResponse, conversationId: payload.data.conversationId });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Teste indisponível.' });
    } finally {
      setBusy(null);
    }
  };

  const eligible = eligibility.status === 'ELIGIBLE';

  return (
    <section className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-violet-600 p-2.5 text-white"><Bot size={18} /></div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Meta Business Agent</h3>
            <p className="mt-0.5 max-w-2xl text-xs text-slate-600">Use o agente nativo da Meta como primeira camada. O SOS Sales assume quando a Meta não for elegível, falhar ou houver transbordo humano.</p>
          </div>
        </div>
        <button type="button" onClick={() => void loadEligibility()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-violet-800 disabled:opacity-60"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Atualizar elegibilidade</button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-violet-100 bg-white p-3"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Status</span><p className={`mt-1 text-xs font-bold ${eligible ? 'text-emerald-700' : eligibility.status === 'INELIGIBLE' ? 'text-amber-700' : 'text-slate-600'}`}>{loading ? 'Consultando…' : eligible ? 'Elegível' : eligibility.status === 'INELIGIBLE' ? 'Não elegível' : 'Indisponível para consulta'}</p></div>
        <div className="rounded-xl border border-violet-100 bg-white p-3"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Número Meta</span><p className="mt-1 truncate font-mono text-xs text-slate-700">{eligibility.phoneNumberId || 'Não informado'}</p></div>
        <div className="rounded-xl border border-violet-100 bg-white p-3"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Fallback</span><p className="mt-1 text-xs font-bold text-slate-700">IA SOS Sales + humano</p></div>
      </div>

      {feedback && <div className={`mt-3 rounded-xl border p-3 text-xs ${feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>{feedback.message}</div>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-violet-100 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900"><WandSparkles size={15} className="text-violet-600" /> Ativar agente Meta</div>
          <p className="mt-1 text-[11px] text-slate-500">Inicia o onboarding oficial no número WABA conectado. A Meta processa a preparação de forma assíncrona.</p>
          <input value={catalogId} onChange={(event) => setCatalogId(event.target.value)} placeholder="Catalog ID (opcional, Instagram)" className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-violet-500" />
          <button type="button" onClick={() => void startOnboarding()} disabled={!eligible || busy !== null} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy === 'onboarding' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} {eligible ? 'Iniciar onboarding Meta' : 'Aguardando elegibilidade'}</button>
        </div>

        <form onSubmit={runTest} className="rounded-xl border border-violet-100 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900"><Play size={15} className="text-violet-600" /> Testar antes de publicar</div>
          <p className="mt-1 text-[11px] text-slate-500">O teste usa a API da Meta e não envia mensagem para um cliente.</p>
          <textarea value={testMessage} onChange={(event) => setTestMessage(event.target.value)} rows={3} maxLength={2000} className="mt-3 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-violet-500" />
          <button type="submit" disabled={!eligible || busy !== null || !testMessage.trim()} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-bold text-violet-800 disabled:cursor-not-allowed disabled:opacity-50">{busy === 'test' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Executar teste Meta</button>
          {testResponse && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-700"><strong>Resposta:</strong> {testResponse.text}<div className="mt-1 font-mono text-[10px] text-slate-400">conversation_id: {testResponse.conversationId}</div></div>}
        </form>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900"><ShieldAlert size={15} className="shrink-0" /><span>Conhecimento, FAQs, arquivos, skills e voz da marca continuam sendo administrados no Meta Business Manager até os endpoints oficiais de publicação serem homologados no SOS Sales.</span><a href="https://business.facebook.com/" target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 font-bold underline"><ExternalLink size={12} /> Abrir Meta Business</a></div>
    </section>
  );
};

