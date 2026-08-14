import React from 'react';
import { ContinuousLearningRecord } from '../../types/intelligence';
import {
  TrendingUp,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  ArrowRight,
  ShieldCheck,
  Zap,
  Clock,
  Filter,
  Check,
  X,
  MessageSquare,
  Award,
} from 'lucide-react';

interface ContinuousLearningSectionProps {
  learningRecords: ContinuousLearningRecord[];
  onApproveRecord?: (id: string) => void;
  onRejectRecord?: (id: string) => void;
}

export const ContinuousLearningSection: React.FC<ContinuousLearningSectionProps> = ({
  learningRecords: initialRecords,
  onApproveRecord,
  onRejectRecord,
}) => {
  const [records, setRecords] = React.useState<ContinuousLearningRecord[]>(initialRecords);
  const [filter, setFilter] = React.useState<'all' | 'curated_approved' | 'active_learning'>('all');

  React.useEffect(() => {
    setRecords(initialRecords);
  }, [initialRecords]);

  const handleApprove = (id: string) => {
    const updated = records.map((r) =>
      r.id === id
        ? {
            ...r,
            status: 'curated_approved' as const,
            approvedBy: 'Você (Gestor)',
            approvedAt: new Date().toISOString(),
          }
        : r
    );
    setRecords(updated);
    if (onApproveRecord) onApproveRecord(id);
  };

  const handleReject = (id: string) => {
    const updated = records.map((r) =>
      r.id === id ? { ...r, status: 'rejected' as const } : r
    );
    setRecords(updated);
    if (onRejectRecord) onRejectRecord(id);
  };

  const filteredRecords = React.useMemo(() => {
    if (filter === 'all') return records;
    return records.filter((r) => r.status === filter);
  }, [records, filter]);

  const approvedCount = records.filter((r) => r.status === 'curated_approved').length;
  const accuracyRate = 96.4;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 rounded-xl p-5 border border-slate-800 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold font-heading">
              Aprendizado Contínuo & Curadoria de IA (RLHF Loop)
            </h2>
            <span className="text-[10px] bg-emerald-950 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-800 flex items-center gap-1">
              <Award className="w-3 h-3" /> Auto-Evolução Ativa
            </span>
          </div>
          <p className="text-xs text-slate-300 max-w-3xl">
            Toda vez que um operador humano edita ou aprimora uma sugestão do robô, o sistema aprende o padrão e gera um novo fato curado, elevando progressivamente a assertividade das vendas.
          </p>
        </div>

        {/* Metric Cards */}
        <div className="flex items-center gap-3 shrink-0 bg-slate-800/80 px-3.5 py-2 rounded-lg border border-slate-700">
          <div className="text-center">
            <span className="text-[10px] text-slate-400 block font-semibold">Assertividade</span>
            <span className="text-sm font-bold text-emerald-400">{accuracyRate}%</span>
          </div>
          <div className="h-6 w-px bg-slate-700" />
          <div className="text-center">
            <span className="text-[10px] text-slate-400 block font-semibold">Regras Curadas</span>
            <span className="text-sm font-bold text-purple-300">{approvedCount}</span>
          </div>
          <div className="h-6 w-px bg-slate-700" />
          <div className="text-center">
            <span className="text-[10px] text-slate-400 block font-semibold">Ganho Semanal</span>
            <span className="text-sm font-bold text-blue-300">+18% ROAS</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold ${
              filter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todos os Aprendizados ({records.length})
          </button>
          <button
            onClick={() => setFilter('curated_approved')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 ${
              filter === 'curated_approved'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Aprovados no Playbook ({approvedCount})
          </button>
        </div>

        <span className="text-[11px] text-slate-400 hidden sm:inline">
          Mostrando retroalimentação de conversas reais deste cliente
        </span>
      </div>

      {/* Learning Records List */}
      <div className="space-y-4">
        {filteredRecords.map((record) => (
          <div
            key={record.id}
            className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:border-slate-300 transition-all space-y-3"
          >
            {/* Header of Record */}
            <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-slate-100 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                  {record.type === 'operator_correction'
                    ? 'Intervenção de Operador'
                    : record.type === 'deal_won_insight'
                    ? 'Insight de Fechamento'
                    : 'Regra Proposta'}
                </span>
                <span className="text-slate-400 text-[11px]">
                  {new Date(record.date).toLocaleDateString('pt-BR')} às{' '}
                  {new Date(record.date).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  Impacto: {record.impactMetric}
                </span>

                {record.status === 'curated_approved' ? (
                  <span className="text-[10px] bg-emerald-600 text-white font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3" /> Curado & Aprovado
                  </span>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleApprove(record.id)}
                      className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-md flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" /> Aprovar
                    </button>
                    <button
                      onClick={() => handleReject(record.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Context & Evolution Comparison */}
            <div className="space-y-2 text-xs">
              <div className="p-2 rounded-lg bg-slate-50 text-slate-700 border border-slate-200">
                <span className="font-bold text-[11px] text-slate-500 block">Contexto da Pergunta do Lead:</span>
                <p className="font-semibold text-slate-900 mt-0.5">"{record.leadContext}"</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-2.5 rounded-lg bg-rose-50/70 border border-rose-200 text-rose-950 space-y-0.5">
                  <span className="text-[10.5px] font-bold uppercase text-rose-700 block flex items-center gap-1">
                    <X className="w-3 h-3" /> Rascunho Antigo da IA (Incompleto)
                  </span>
                  <p className="text-[11.5px] italic">"{record.originalAiProposal}"</p>
                </div>

                <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200 text-emerald-950 space-y-0.5">
                  <span className="text-[10.5px] font-bold uppercase text-emerald-700 block flex items-center gap-1">
                    <Check className="w-3 h-3" /> Correção do Atendente Humano (Vencedora)
                  </span>
                  <p className="text-[11.5px] font-semibold">"{record.humanCorrection}"</p>
                </div>
              </div>

              {/* Fato Aprendido que entrou para a Memória Geral */}
              <div className="p-3 bg-purple-50/70 rounded-lg border border-purple-200 text-purple-950 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[11px] text-purple-900 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" /> Fato Aprendido e Vetorizado para o Futuro:
                  </span>
                  <span className="text-[10px] font-mono text-purple-700">
                    Confiança: {(record.confidenceScore * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="font-medium text-xs text-purple-900">{record.learnedFact}</p>
                {record.approvedBy && (
                  <span className="text-[10px] text-purple-600 block pt-0.5">
                    Curado e auditado por <span className="font-bold">{record.approvedBy}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}

        {filteredRecords.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 space-y-1">
            <Sparkles className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-xs font-semibold">Nenhum registro de aprendizado pendente.</p>
            <p className="text-[11px]">As novas correções dos operadores aparecerão aqui automaticamente.</p>
          </div>
        )}
      </div>
    </div>
  );
};
