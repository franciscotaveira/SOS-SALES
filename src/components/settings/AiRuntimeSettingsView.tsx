import React from 'react';
import { AlertCircle, Bot, CheckCircle2, Loader2, Play, Save, ShieldCheck } from 'lucide-react';
import {
  loadWorkspaceAgentConfig,
  publishWorkspaceAgentConfig,
  WorkspaceAgentRuntimeConfig,
} from '../../services/aiAutonomyManager';
import { authenticatedFetch } from '../../services/authenticatedFetch';

interface AiRuntimeSettingsViewProps {
  workspaceId: string;
}

type Tone = 'elegante_acolhedor' | 'direto_objetivo' | 'tecnico_formal' | 'comercial_fechador' | 'empatico_cuidadoso';
type Goal = 'agendamento' | 'sinal_pix' | 'orcamento' | 'qualificacao_vendedor';

const DEFAULT_CONFIG: WorkspaceAgentRuntimeConfig = {
  autonomyMode: 'copilot_supervised',
  runtimeEnabled: false,
  responderMode: 'sos_sales',
  metaAgentId: null,
  metaAgentEnabled: false,
  metaAgentEligibilityStatus: 'UNKNOWN',
  metaAgentCheckedAt: null,
  metaAgentActivationStatus: 'NOT_STARTED',
  metaAgentOnboardingStartedAt: null,
  metaAgentReadyAt: null,
  metaAgentLastError: null,
  metaAgentReady: false,
  runtimeEffective: false,
  providerConfigured: false,
  behaviorConfig: {},
  publishedAt: null,
};

export const AiRuntimeSettingsView: React.FC<AiRuntimeSettingsViewProps> = ({ workspaceId }) => {
  const [config, setConfig] = React.useState(DEFAULT_CONFIG);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ model: string; latencyMs: number; response: string } | null>(null);
  const [feedback, setFeedback] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const tone = (config.behaviorConfig.tone as Tone | undefined) || 'direto_objetivo';
  const primaryGoal = (config.behaviorConfig.primaryGoal as Goal | undefined) || 'qualificacao_vendedor';

  React.useEffect(() => {
    setLoading(true);
    setFeedback(null);
    void loadWorkspaceAgentConfig(workspaceId)
      .then(setConfig)
      .catch((error) => setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'IA indisponível.' }))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const next = await publishWorkspaceAgentConfig(workspaceId, {
        autonomyMode: config.autonomyMode,
        runtimeEnabled: config.autonomyMode === 'autonomous_24_7',
        behaviorConfig: {
          ...config.behaviorConfig,
          tone,
          primaryGoal,
          humanHandoffTriggers: {
            quimicaSensivel: true,
            reclamacoes: true,
            pedidoHumano: true,
            descontoAlto: true,
          },
        },
      });
      setConfig(next);
      setFeedback({ type: 'success', message: 'Configuração publicada no backend.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Não foi possível publicar a IA.' });
    } finally {
      setSaving(false);
    }
  };

  const runProviderTest = async () => {
    setTesting(true);
    setTestResult(null);
    setFeedback(null);
    try {
      const response = await authenticatedFetch('/api/v1/ai/test-nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Responda em uma frase: qual é o próximo passo para atender um cliente? Não invente preço, prazo ou disponibilidade.',
        }),
      });
      const payload = await response.json().catch(() => null) as { response?: string; model?: string; latencyMs?: number; error?: string } | null;
      if (!response.ok || typeof payload?.response !== 'string') {
        throw new Error(payload?.error || `Teste da IA indisponível (HTTP ${response.status}).`);
      }
      setTestResult({
        model: payload.model || 'modelo configurado',
        latencyMs: Number.isFinite(payload.latencyMs) ? Number(payload.latencyMs) : 0,
        response: payload.response,
      });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Não foi possível testar a IA própria.' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 size={17} className="animate-spin" /> Consultando configuração real…</div>;

  return (
    <form onSubmit={save} className="mx-auto max-w-3xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
        <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700"><Bot size={19} /></div>
        <div><h2 className="text-sm font-bold text-slate-900">IA própria SOS Sales</h2><p className="mt-1 text-xs text-slate-500">Fallback operacional quando o Meta Business Agent não estiver elegível ou precisar de transbordo.</p></div>
      </div>

      {feedback && <div className={`flex items-center gap-2 rounded-xl border p-3 text-xs ${feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>{feedback.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}{feedback.message}</div>}
      {!config.providerConfigured && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><ShieldCheck size={15} className="shrink-0" /> O provedor global da IA não está confirmado. O modo automático permanecerá inefetivo até a infraestrutura estar configurada.</div>}

      <label className="block text-xs font-bold text-slate-700">Modo de atendimento
        <select value={config.autonomyMode} onChange={(event) => setConfig((current) => ({ ...current, autonomyMode: event.target.value as WorkspaceAgentRuntimeConfig['autonomyMode'] }))} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-normal">
          <option value="copilot_supervised">Copiloto — humano revisa e envia</option>
          <option value="autonomous_24_7">Automático 24/7 — com transbordo humano</option>
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-700">Tom
          <select value={tone} onChange={(event) => setConfig((current) => ({ ...current, behaviorConfig: { ...current.behaviorConfig, tone: event.target.value } }))} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-normal">
            <option value="direto_objetivo">Direto e objetivo</option><option value="elegante_acolhedor">Elegante e acolhedor</option><option value="tecnico_formal">Técnico e formal</option><option value="comercial_fechador">Comercial</option><option value="empatico_cuidadoso">Empático e cuidadoso</option>
          </select>
        </label>
        <label className="text-xs font-bold text-slate-700">Objetivo principal
          <select value={primaryGoal} onChange={(event) => setConfig((current) => ({ ...current, behaviorConfig: { ...current.behaviorConfig, primaryGoal: event.target.value } }))} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-normal">
            <option value="qualificacao_vendedor">Qualificar para vendedor</option><option value="agendamento">Agendamento</option><option value="orcamento">Orçamento</option><option value="sinal_pix">Sinal via Pix</option>
          </select>
        </label>
      </div>

      <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Pedidos de humano, reclamações, desconto alto e situações sensíveis sempre geram transbordo. Estado efetivo: <strong>{config.runtimeEffective ? 'ativo' : 'inativo'}</strong>.</div>
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><div className="text-xs font-bold text-indigo-950">Verificar conexão da IA própria</div><p className="mt-1 text-[11px] text-indigo-900/70">Executa uma chamada real ao NVIDIA NIM configurado no servidor. Não envia mensagem a cliente.</p></div>
          <button type="button" onClick={() => void runProviderTest()} disabled={testing} className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[11px] font-bold text-indigo-800 disabled:opacity-50">{testing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Testar IA própria</button>
        </div>
        {testResult && <div className="mt-2 rounded-lg bg-white p-2.5 text-[11px] text-slate-700"><div className="font-mono text-[10px] text-slate-500">{testResult.model} · {testResult.latencyMs} ms</div><p className="mt-1">{testResult.response}</p></div>}
      </div>
      <div className="flex justify-end"><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Publicar IA</button></div>
    </form>
  );
};
