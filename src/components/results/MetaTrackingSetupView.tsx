import React from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Save, Target } from 'lucide-react';
import { authenticatedFetch } from '../../services/authenticatedFetch';

interface MetaTrackingSetupViewProps {
  workspaceId: string;
}

interface TrackingState {
  metaPixelId: string;
  metaDatasetId: string;
  metaAccessTokenConfigured: boolean;
  metaCapiEnabled: boolean;
}

const EMPTY_TRACKING: TrackingState = {
  metaPixelId: '',
  metaDatasetId: '',
  metaAccessTokenConfigured: false,
  metaCapiEnabled: true,
};

export const MetaTrackingSetupView: React.FC<MetaTrackingSetupViewProps> = ({ workspaceId }) => {
  const [tracking, setTracking] = React.useState<TrackingState>(EMPTY_TRACKING);
  const [accessToken, setAccessToken] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const response = await authenticatedFetch(`/api/v1/workspaces/${workspaceId}/tracking`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Rastreamento indisponível (HTTP ${response.status}).`);
      setTracking({ ...EMPTY_TRACKING, ...(payload?.tracking || {}) });
    } catch (error) {
      setTracking(EMPTY_TRACKING);
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Não foi possível consultar a conexão Meta.' });
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const response = await authenticatedFetch(`/api/v1/workspaces/${workspaceId}/tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metaPixelId: tracking.metaPixelId.trim(),
          metaDatasetId: tracking.metaDatasetId.trim(),
          metaCapiEnabled: tracking.metaCapiEnabled,
          ...(accessToken.trim() ? { metaAccessToken: accessToken.trim() } : {}),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Não foi possível salvar (HTTP ${response.status}).`);
      setAccessToken('');
      await load();
      setFeedback({ type: 'success', message: 'Conexão Meta salva. O token permanece protegido no backend.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Não foi possível salvar a conexão Meta.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-3 py-4 sm:px-4">
      <section className="rounded-2xl border border-[var(--sos-border)] bg-[var(--sos-surface)] p-4 shadow-xs sm:p-5">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--sos-border)] pb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Target size={19} />
            </div>
            <div>
              <h1 className="text-base font-bold text-[var(--sos-ink)]">Meta Ads e Conversions API</h1>
              <p className="mt-1 text-xs leading-5 text-[var(--sos-muted)]">
                Identifica a origem dos leads e devolve resultados confirmados para a Meta otimizar as campanhas.
              </p>
            </div>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-[var(--sos-border)] p-2 text-[var(--sos-muted)] hover:bg-slate-50 disabled:opacity-50" aria-label="Atualizar conexão Meta">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {feedback && (
          <div className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
            {feedback.type === 'success' ? <CheckCircle2 size={15} className="shrink-0" /> : <AlertCircle size={15} className="shrink-0" />}
            <span>{feedback.message}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--sos-muted)]"><Loader2 size={17} className="animate-spin" /> Consultando configuração real…</div>
        ) : (
          <form onSubmit={save} className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-700">
                Dataset ID
                <input value={tracking.metaDatasetId} onChange={(event) => setTracking((current) => ({ ...current, metaDatasetId: event.target.value }))} placeholder="ID do conjunto de dados Meta" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-xs font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Pixel ID
                <input value={tracking.metaPixelId} onChange={(event) => setTracking((current) => ({ ...current, metaPixelId: event.target.value }))} placeholder="Opcional; informe apenas se for diferente do Dataset" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-xs font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" />
              </label>
            </div>

            <label className="block text-xs font-bold text-slate-700">
              Token da Conversions API
              <input type="password" autoComplete="new-password" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} placeholder={tracking.metaAccessTokenConfigured ? 'Token já protegido — preencha somente para trocar' : 'Cole o token permanente da Meta'} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-xs font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" />
              <span className="mt-1 block font-normal text-slate-500">
                {tracking.metaAccessTokenConfigured ? 'Token configurado no backend.' : 'Nenhum token confirmado para este workspace.'}
              </span>
            </label>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs">
              <span><strong className="block text-slate-800">Enviar conversões confirmadas</strong><span className="text-slate-500">Somente desfechos reais registrados no SOS Vendas.</span></span>
              <input type="checkbox" checked={tracking.metaCapiEnabled} onChange={(event) => setTracking((current) => ({ ...current, metaCapiEnabled: event.target.checked }))} className="h-4 w-4 accent-blue-600" />
            </label>

            <div className="flex justify-end">
              <button type="submit" disabled={saving || !tracking.metaDatasetId.trim()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar conexão Meta
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
};
