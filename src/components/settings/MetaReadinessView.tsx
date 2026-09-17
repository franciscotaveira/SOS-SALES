import React from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, RefreshCw, ShieldAlert } from 'lucide-react';
import { authenticatedFetch } from '../../services/authenticatedFetch';

type Status = 'HEALTHY' | 'WARNING' | 'BLOCKED' | 'UNKNOWN';

interface Control {
  key: string;
  label: string;
  status: Status;
  severity: 'BLOCKER' | 'CRITICAL' | 'OPERATIONAL';
  observedAt: string;
  evidence: string;
  recommendation: string;
}

interface ReadinessPayload {
  observedAt: string;
  scope: 'LOCAL_CONFIGURATION_ONLY';
  summary: { score: number; counts: Record<Status, number> };
  controls: Control[];
  limitations: string[];
}

const statusStyle: Record<Status, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  HEALTHY: { label: 'Saudável', className: 'border-emerald-200 bg-emerald-50 text-emerald-800', Icon: CheckCircle2 },
  WARNING: { label: 'Atenção', className: 'border-amber-200 bg-amber-50 text-amber-900', Icon: AlertTriangle },
  BLOCKED: { label: 'Bloqueado', className: 'border-rose-200 bg-rose-50 text-rose-800', Icon: ShieldAlert },
  UNKNOWN: { label: 'Sem prova', className: 'border-slate-200 bg-slate-50 text-slate-700', Icon: CircleHelp },
};

export async function fetchMetaReadiness(workspaceId: string, signal: AbortSignal): Promise<ReadinessPayload | null> {
  try {
    const response = await authenticatedFetch(`/api/v1/workspaces/${workspaceId}/meta-readiness`, { signal });
    const body = await response.json().catch(() => null);
    if (signal.aborted) return null;
    if (!response.ok || !body?.data) throw new Error(body?.error || 'Não foi possível consultar a prontidão Meta.');
    return body.data as ReadinessPayload;
  } catch (cause) {
    if (signal.aborted) return null;
    throw cause;
  }
}

export function MetaReadinessView({ workspaceId }: { workspaceId: string }) {
  // A workspace switch must also reset already-rendered state immediately.
  return <WorkspaceMetaReadiness key={workspaceId} workspaceId={workspaceId} />;
}

function WorkspaceMetaReadiness({ workspaceId }: { workspaceId: string }) {
  const [payload, setPayload] = React.useState<ReadinessPayload | null>(null);
  const [state, setState] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = React.useState<string | null>(null);

  const requestRef = React.useRef<AbortController | null>(null);

  const load = React.useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState('loading');
    setError(null);
    try {
      const result = await fetchMetaReadiness(workspaceId, controller.signal);
      if (controller.signal.aborted || !result) return;
      setPayload(result);
      setState('ready');
    } catch (cause) {
      if (controller.signal.aborted) return;
      setPayload(null);
      setState('error');
      setError(cause instanceof Error ? cause.message : 'Não foi possível consultar a prontidão Meta.');
    }
  }, [workspaceId]);

  React.useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  if (state === 'loading') {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Verificando a configuração Meta deste workspace…</div>;
  }

  if (state === 'error') {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900">
        <p className="font-bold">Diagnóstico Meta indisponível</p>
        <p className="mt-1">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-800 px-3 py-2 text-xs font-bold text-white"><RefreshCw size={14} /> Tentar novamente</button>
      </div>
    );
  }

  if (!payload) return null;
  const blockers = payload.summary.counts.BLOCKED;
  const warnings = payload.summary.counts.WARNING;

  return (
    <section className="mx-auto max-w-5xl space-y-4" aria-labelledby="meta-readiness-title">
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700">Meta Readiness · leitura inicial</p>
            <h2 id="meta-readiness-title" className="mt-1 text-xl font-bold text-slate-950">Sua operação Meta está {payload.summary.score}% preparada</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Este diagnóstico usa apenas evidência local, por workspace. Ele não declara permissões, billing ou entregas externas como saudáveis sem teste autenticado.</p>
          </div>
          <button type="button" onClick={() => void load()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-800 hover:bg-violet-50"><RefreshCw size={14} /> Atualizar</button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-rose-100 bg-white p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Bloqueios</p><p className="mt-1 text-xl font-bold text-rose-700">{blockers}</p></div>
          <div className="rounded-xl border border-amber-100 bg-white p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Atenção</p><p className="mt-1 text-xl font-bold text-amber-700">{warnings}</p></div>
          <div className="rounded-xl border border-emerald-100 bg-white p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Saudáveis</p><p className="mt-1 text-xl font-bold text-emerald-700">{payload.summary.counts.HEALTHY}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Sem prova</p><p className="mt-1 text-xl font-bold text-slate-700">{payload.summary.counts.UNKNOWN}</p></div>
        </div>
      </div>

      <div className="space-y-3">
        {payload.controls.map((item) => {
          const presentation = statusStyle[item.status];
          const Icon = presentation.Icon;
          return (
            <article key={item.key} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-900">{item.label}</h3><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${presentation.className}`}><Icon size={12} /> {presentation.label}</span></div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.evidence}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-800">Próximo passo: {item.recommendation}</p>
                </div>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.severity}</span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
        <p className="font-bold text-slate-800">Limites desta versão</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">{payload.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
    </section>
  );
}
