import React from 'react';
import { AlertCircle, Bot, CheckCircle2, Loader2, Save, ShieldCheck } from 'lucide-react';
import {
  loadWorkspaceAgentConfig,
  publishWorkspaceAgentConfig,
  WorkspaceAgentRuntimeConfig,
} from '../../services/aiAutonomyManager';

interface AiRuntimeSettingsViewProps {
  workspaceId: string;
}

type Tone = 'elegante_acolhedor' | 'direto_objetivo' | 'tecnico_formal' | 'comercial_fechador' | 'empatico_cuidadoso';
type Goal = 'agendamento' | 'sinal_pix' | 'orcamento' | 'qualificacao_vendedor';

const DEFAULT_CONFIG: WorkspaceAgentRuntimeConfig = {
  autonomyMode: 'copilot_supervised',
  runtimeEnabled: false,
  runtimeEffective: false,
  providerConfigured: false,
  behaviorConfig: {},
  publishedAt: null,
};

export const AiRuntimeSettingsView: React.FC<AiRuntimeSettingsViewProps> = ({ workspaceId }) => {
  const [config, setConfig] = React.useState(DEFAULT_CONFIG);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
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
      <div className="flex justify-end"><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Publicar IA</button></div>
    </form>
  );
};
