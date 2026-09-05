import React from 'react';
import { Workspace } from '../../types/cockpit';
import { authenticatedFetch } from '../../services/authenticatedFetch';
import { AlertTriangle, Brain, CheckCircle2, Clock, MessageSquare, RefreshCw, Image as ImageIcon } from 'lucide-react';

interface HistoricalDiagnosisSectionProps {
  workspace: Workspace;
}

interface Diagnosis {
  hasData: boolean;
  totalMessages: number;
  inboundMessages: number;
  outboundMessages: number;
  outOfHoursMessages: number;
  mediaMessages: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
}

const emptyDiagnosis: Diagnosis = {
  hasData: false,
  totalMessages: 0,
  inboundMessages: 0,
  outboundMessages: 0,
  outOfHoursMessages: 0,
  mediaMessages: 0,
  firstMessageAt: null,
  lastMessageAt: null,
};

export const HistoricalDiagnosisSection: React.FC<HistoricalDiagnosisSectionProps> = ({ workspace }) => {
  const [diagnosis, setDiagnosis] = React.useState<Diagnosis>(emptyDiagnosis);
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>('loading');

  const loadDiagnosis = React.useCallback(async () => {
    setStatus('loading');
    try {
      const response = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/intelligence/diagnosis`);
      if (!response.ok) throw new Error(`Diagnosis API ${response.status}`);
      const data = await response.json();
      setDiagnosis({ ...emptyDiagnosis, ...data });
      setStatus('ready');
    } catch {
      setDiagnosis(emptyDiagnosis);
      setStatus('error');
    }
  }, [workspace.id]);

  React.useEffect(() => {
    void loadDiagnosis();
  }, [loadDiagnosis]);

  const percentage = (value: number) => diagnosis.totalMessages > 0
    ? `${((value / diagnosis.totalMessages) * 100).toFixed(1)}%`
    : '—';
  const lastUpdated = diagnosis.lastMessageAt
    ? new Date(diagnosis.lastMessageAt).toLocaleString('pt-BR')
    : 'Nenhuma mensagem persistida';

  return (
    <div id="historical-diagnosis-section" className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-600" />
            <h2 className="text-sm font-bold text-slate-900">Diagnóstico baseado em dados persistidos</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {workspace.name}: métricas calculadas somente a partir das mensagens que chegaram ao backend.
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Última mensagem registrada: {lastUpdated}</p>
        </div>
        <button
          type="button"
          onClick={() => void loadDiagnosis()}
          disabled={status === 'loading'}
          className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${status === 'loading' ? 'animate-spin' : ''}`} />
          Atualizar dados
        </button>
      </div>

      {status === 'error' && (
        <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          Não foi possível consultar o diagnóstico no backend. Nenhum número substituto foi exibido.
        </div>
      )}

      {status === 'ready' && !diagnosis.hasData && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Ainda não há mensagens suficientes neste workspace para gerar diagnóstico. Assim que o WhatsApp sincronizar, as métricas aparecerão aqui.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric icon={<MessageSquare className="w-4 h-4 text-purple-600" />} label="Mensagens" value={diagnosis.totalMessages.toLocaleString('pt-BR')} detail={`${diagnosis.inboundMessages} recebidas · ${diagnosis.outboundMessages} enviadas`} />
        <Metric icon={<Clock className="w-4 h-4 text-amber-600" />} label="Fora do horário" value={percentage(diagnosis.outOfHoursMessages)} detail={`${diagnosis.outOfHoursMessages} mensagens`} />
        <Metric icon={<ImageIcon className="w-4 h-4 text-emerald-600" />} label="Com mídia" value={percentage(diagnosis.mediaMessages)} detail={`${diagnosis.mediaMessages} mensagens`} />
        <Metric icon={<CheckCircle2 className="w-4 h-4 text-blue-600" />} label="Cobertura" value={diagnosis.totalMessages > 0 ? 'Persistida' : '—'} detail="Sem estimativa de conversas" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p>O SOS Vendas não exibe histórico inventado nem injeta conclusões automaticamente no prompt. Regras só entram na base de conhecimento após cadastro explícito e persistência no backend.</p>
      </div>
    </div>
  );
};

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-slate-500">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-xl font-black text-slate-900">{value}</div>
      <p className="mt-1 text-[10px] text-slate-500">{detail}</p>
    </div>
  );
}
