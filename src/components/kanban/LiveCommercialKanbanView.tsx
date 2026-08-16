import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock,
  ArrowRight,
  ArrowLeft,
  UserRound,
  RefreshCw,
  AlertCircle,
  MessageSquare,
  Sparkles,
  Search,
  Filter,
} from 'lucide-react';
import { ApiJourney, SalesOsGateway } from '../../services/salesOsGateway';
import { CommercialStage } from '../../types/cockpit';

interface LiveCommercialKanbanViewProps {
  workspaceId: string;
  gateway: SalesOsGateway;
  onSelectJourney?: (journeyId: string) => void;
  onSwitchToCockpit?: () => void;
}

interface ColumnDef {
  id: CommercialStage;
  title: string;
  subtitle: string;
  badgeBg: string;
  badgeText: string;
  headerBorder: string;
}

const COLUMNS: ColumnDef[] = [
  {
    id: 'new',
    title: 'Novos Leads',
    subtitle: 'Triagem inicial',
    badgeBg: 'bg-slate-800',
    badgeText: 'text-slate-200',
    headerBorder: 'border-slate-700',
  },
  {
    id: 'contacted',
    title: 'Em Contato',
    subtitle: 'Conversando / Sondagem',
    badgeBg: 'bg-blue-900/40',
    badgeText: 'text-blue-300',
    headerBorder: 'border-blue-700/50',
  },
  {
    id: 'qualified',
    title: 'Qualificados',
    subtitle: 'Fit confirmado',
    badgeBg: 'bg-emerald-900/40',
    badgeText: 'text-emerald-300',
    headerBorder: 'border-emerald-700/50',
  },
  {
    id: 'proposal',
    title: 'Proposta Enviada',
    subtitle: 'Aguardando decisão',
    badgeBg: 'bg-amber-900/40',
    badgeText: 'text-amber-300',
    headerBorder: 'border-amber-700/50',
  },
  {
    id: 'negotiation',
    title: 'Em Negociação',
    subtitle: 'Fechamento / Objeções',
    badgeBg: 'bg-violet-900/40',
    badgeText: 'text-violet-300',
    headerBorder: 'border-violet-700/50',
  },
];

export const LiveCommercialKanbanView: React.FC<LiveCommercialKanbanViewProps> = ({
  workspaceId,
  gateway,
  onSelectJourney,
  onSwitchToCockpit,
}) => {
  const [journeys, setJourneys] = useState<ApiJourney[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchJourneys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if ('listJourneys' in gateway && typeof (gateway as any).listJourneys === 'function') {
        const res = await (gateway as any).listJourneys(workspaceId, { limit: 50 });
        setJourneys(res.data || []);
      } else {
        const rawJourneys = await gateway.getJourneys(workspaceId);
        const mapped: ApiJourney[] = rawJourneys.map((j) => ({
          id: j.id,
          contactId: j.id,
          contactName: j.leadName,
          contactPhone: j.phoneE164,
          status: 'OPEN',
          pipelineStage: j.stage,
          primaryServiceOrProduct: j.primaryServiceOrProduct,
          startedAt: j.createdAt,
          updatedAt: j.lastActivityAt,
        }));
        setJourneys(mapped);
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar o funil ao vivo.');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, gateway]);

  useEffect(() => {
    fetchJourneys();
  }, [fetchJourneys]);

  const handleStageMove = async (
    journey: ApiJourney,
    direction: 'prev' | 'next',
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    const currentIdx = COLUMNS.findIndex((c) => c.id === journey.pipelineStage?.toLowerCase());
    if (currentIdx === -1) return;
    const targetIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;
    if (targetIdx < 0 || targetIdx >= COLUMNS.length) return;

    const targetStage = COLUMNS[targetIdx]?.id;
    if (!targetStage) return;

    setUpdatingId(journey.id);
    try {
      if ('setJourneyStage' in gateway && typeof (gateway as any).setJourneyStage === 'function') {
        await (gateway as any).setJourneyStage(workspaceId, journey.id, targetStage.toUpperCase());
      } else if (gateway.updateJourneyStage) {
        await gateway.updateJourneyStage(journey.id, targetStage);
      }
      setJourneys((prev) =>
        prev.map((j) => (j.id === journey.id ? { ...j, pipelineStage: targetStage } : j))
      );
    } catch (err: any) {
      alert(`Falha ao alterar etapa: ${err?.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = useMemo(() => {
    return journeys.filter((j) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (j.contactName && j.contactName.toLowerCase().includes(q)) ||
        (j.contactPhone && j.contactPhone.includes(q)) ||
        (j.primaryServiceOrProduct && j.primaryServiceOrProduct.toLowerCase().includes(q))
      );
    });
  }, [journeys, search]);

  const columnsData = useMemo(() => {
    return COLUMNS.map((col) => ({
      ...col,
      items: filtered.filter((j) => (j.pipelineStage?.toLowerCase() || 'new') === col.id),
    }));
  }, [filtered]);

  const totalActive = filtered.length;

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4 sm:p-6 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" /> Funil Comercial Ao Vivo
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {totalActive} Leads Ativos
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Progressão supervisionada de jornadas comerciais conectada ao banco soberano.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone..."
              className="pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors w-48 sm:w-64"
            />
          </div>

          <button
            onClick={() => fetchJourneys()}
            disabled={loading}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Atualizar funil"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => fetchJourneys()}
            className="ml-auto underline font-medium cursor-pointer"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Kanban Board Grid */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-4 flex-1 min-h-0 overflow-x-auto">
        {columnsData.map((col, colIdx) => (
          <div
            key={col.id}
            className="flex flex-col bg-slate-900/60 border border-slate-800/80 rounded-xl overflow-hidden min-w-[240px]"
          >
            {/* Column Header */}
            <div className={`p-3 border-b ${col.headerBorder} bg-slate-900/90 flex items-center justify-between`}>
              <div>
                <span className="font-semibold text-xs text-white block">{col.title}</span>
                <span className="text-[10px] text-slate-400">{col.subtitle}</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${col.badgeBg} ${col.badgeText}`}>
                {col.items.length}
              </span>
            </div>

            {/* Cards List */}
            <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-0">
              {loading ? (
                <div className="space-y-2 pt-2">
                  <div className="h-20 bg-slate-800/40 rounded-lg animate-pulse" />
                  <div className="h-20 bg-slate-800/40 rounded-lg animate-pulse" />
                </div>
              ) : col.items.length === 0 ? (
                <div className="h-32 flex flex-col items-center justify-center text-center p-3 text-slate-600">
                  <span className="text-[11px]">Nenhum lead nesta etapa</span>
                </div>
              ) : (
                col.items.map((journey) => {
                  const isUpdating = updatingId === journey.id;
                  const isOverdue = false;
                  const isDue = false;

                  return (
                    <div
                      key={journey.id}
                      onClick={() => {
                        onSelectJourney?.(journey.id);
                        onSwitchToCockpit?.();
                      }}
                      className={`p-3 bg-slate-900 border rounded-lg transition-all cursor-pointer relative group hover:border-slate-600 hover:shadow-lg ${
                        isOverdue
                          ? 'border-rose-500/40 bg-rose-950/10'
                          : isDue
                          ? 'border-amber-500/40 bg-amber-950/10'
                          : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1 mb-1.5">
                        <span className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors line-clamp-1">
                          {journey.contactName || journey.contactPhone || 'Lead Sem Nome'}
                        </span>
                      </div>

                      {journey.contactPhone && (
                        <p className="text-[11px] text-slate-400 font-mono mb-1">
                          {journey.contactPhone}
                        </p>
                      )}

                      {journey.primaryServiceOrProduct && (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 mb-2">
                          {journey.primaryServiceOrProduct}
                        </span>
                      )}

                      {/* Card Footer */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[10px] text-slate-500">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span
                            className={
                              isOverdue
                                ? 'text-rose-400 font-bold'
                                : isDue
                                ? 'text-amber-400 font-bold'
                                : 'text-slate-400'
                            }
                          >
                            {isOverdue ? 'SLA Estourado' : isDue ? 'SLA Crítico' : 'SLA OK'}
                          </span>
                        </div>

                        {/* Fast Move Buttons */}
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {colIdx > 0 && (
                            <button
                              disabled={isUpdating}
                              onClick={(e) => handleStageMove(journey, 'prev', e)}
                              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
                              title="Voltar etapa"
                            >
                              <ArrowLeft className="w-3 h-3" />
                            </button>
                          )}
                          {colIdx < COLUMNS.length - 1 && (
                            <button
                              disabled={isUpdating}
                              onClick={(e) => handleStageMove(journey, 'next', e)}
                              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
                              title="Avançar etapa"
                            >
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
