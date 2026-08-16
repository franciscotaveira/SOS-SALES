import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Sparkles,
  Search,
  RefreshCw,
  Clock,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Columns3,
} from 'lucide-react';
import { ApiJourney, SalesOsGateway } from '../../services/salesOsGateway';
import { getSupabaseClient } from '../../services/supabaseAuth';

interface LiveCommercialKanbanViewProps {
  workspaceId: string;
  gateway: SalesOsGateway;
  onSelectJourney?: (journeyId: string) => void;
  onSwitchToCockpit?: () => void;
}

interface KanbanColumn {
  id: string;
  title: string;
  subtitle: string;
  badgeBg: string;
  badgeText: string;
  headerBorder: string;
}

const COLUMNS: KanbanColumn[] = [
  {
    id: 'LEAD',
    title: '1. Novos Leads',
    subtitle: 'Sem contato inicial',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-800',
    headerBorder: 'border-blue-200',
  },
  {
    id: 'QUALIFICADO',
    title: '2. Qualificados',
    subtitle: 'Fatos e dor mapeados',
    badgeBg: 'bg-purple-100',
    badgeText: 'text-purple-800',
    headerBorder: 'border-purple-200',
  },
  {
    id: 'PROPOSTA',
    title: '3. Proposta',
    subtitle: 'Oferta enviada',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800',
    headerBorder: 'border-amber-200',
  },
  {
    id: 'NEGOCIACAO',
    title: '4. Negociação',
    subtitle: 'Superando objeções',
    badgeBg: 'bg-indigo-100',
    badgeText: 'text-indigo-800',
    headerBorder: 'border-indigo-200',
  },
  {
    id: 'GANHO',
    title: '5. Fechados (Ganho)',
    subtitle: 'Venda confirmada',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-800',
    headerBorder: 'border-emerald-200',
  },
];

const normalizeStage = (stage?: string | null): string => {
  if (!stage) return 'LEAD';
  const s = stage.toUpperCase();
  if (s === 'NEW' || s === 'CONTACTED' || s === 'LEAD') return 'LEAD';
  if (s === 'QUALIFIED' || s === 'QUALIFICADO') return 'QUALIFICADO';
  if (s === 'PROPOSAL' || s === 'PROPOSTA') return 'PROPOSTA';
  if (s === 'NEGOTIATION' || s === 'NEGOCIACAO') return 'NEGOCIACAO';
  if (s === 'WON' || s === 'GANHO') return 'GANHO';
  if (s === 'LOST' || s === 'PERDIDO') return 'PERDIDO';
  return s;
};

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

  const fetchJourneys = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      if ('listJourneys' in gateway && typeof (gateway as any).listJourneys === 'function') {
        const res = await (gateway as any).listJourneys(workspaceId, { limit: 150 });
        setJourneys(res.data || []);
      } else {
        const raw = await gateway.getJourneys(workspaceId);
        const mapped: ApiJourney[] = raw.map((j) => ({
          id: j.id,
          contactId: j.id,
          contactName: j.leadName || null,
          contactPhone: j.leadPhone || (j as any).phoneE164 || null,
          status: 'OPEN',
          pipelineStage: j.stage || null,
          primaryServiceOrProduct: (j as any).primaryServiceOrProduct || null,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        setJourneys(mapped);
      }
    } catch (err: any) {
      if (!silent) setError(err.message || 'Falha ao carregar funil comercial.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [workspaceId, gateway]);

  useEffect(() => {
    void fetchJourneys(false);

    const client = getSupabaseClient();
    let channel: any;
    if (client) {
      channel = client
        .channel(`live-kanban-${workspaceId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'commercial_journeys',
            filter: `workspace_id=eq.${workspaceId}`,
          },
          () => {
            void fetchJourneys(true);
          }
        )
        .subscribe();
    }

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void fetchJourneys(true);
    }, 10000);

    return () => {
      if (client && channel) void client.removeChannel(channel);
      clearInterval(timer);
    };
  }, [workspaceId, fetchJourneys]);

  const handleStageMove = async (
    journey: ApiJourney,
    direction: 'next' | 'prev',
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    const stagesOrder = ['LEAD', 'QUALIFICADO', 'PROPOSTA', 'NEGOCIACAO', 'GANHO'];
    const currentNormalized = normalizeStage(journey.pipelineStage);
    const currentIdx = stagesOrder.indexOf(currentNormalized);
    if (currentIdx === -1) return;

    const newIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;
    if (newIdx < 0 || newIdx >= stagesOrder.length) return;

    const nextStage = stagesOrder[newIdx];
    setUpdatingId(journey.id);

    try {
      if ('transitionJourneyStage' in gateway && typeof (gateway as any).transitionJourneyStage === 'function') {
        await (gateway as any).transitionJourneyStage(workspaceId, journey.id, nextStage);
      }
      setJourneys((prev) =>
        prev.map((j) => (j.id === journey.id ? { ...j, pipelineStage: nextStage } : j))
      );
    } catch (err: any) {
      alert(`Falha ao avançar estágio: ${err.message}`);
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
      items: filtered.filter((j) => normalizeStage(j.pipelineStage) === col.id),
    }));
  }, [filtered]);

  const totalActive = filtered.length;

  return (
    <div className="flex flex-col h-full bg-slate-50/50 text-slate-900 p-4 sm:p-6 overflow-hidden max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-950 font-heading tracking-tight flex items-center gap-2">
              <Columns3 className="w-5 h-5 text-emerald-600" /> Funil Comercial Ao Vivo
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {totalActive} Leads Ativos
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Progressão supervisionada de jornadas comerciais conectada ao banco soberano.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone..."
              className="pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors w-48 sm:w-64 shadow-2xs"
            />
          </div>

          <button
            onClick={() => fetchJourneys()}
            disabled={loading}
            className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 transition-colors shadow-2xs cursor-pointer"
            title="Atualizar funil"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
          <button
            onClick={() => fetchJourneys()}
            className="ml-auto underline font-bold cursor-pointer hover:text-rose-900"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Kanban Board Grid */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5 mt-4 flex-1 min-h-0 overflow-x-auto">
        {columnsData.map((col, colIdx) => (
          <div
            key={col.id}
            className="flex flex-col bg-slate-100/70 border border-slate-200 rounded-2xl overflow-hidden min-w-[240px] shadow-2xs"
          >
            {/* Column Header */}
            <div className={`p-3 border-b ${col.headerBorder} bg-white flex items-center justify-between`}>
              <div>
                <span className="font-bold text-xs text-slate-900 block font-heading">{col.title}</span>
                <span className="text-[10px] text-slate-500">{col.subtitle}</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${col.badgeBg} ${col.badgeText}`}>
                {col.items.length}
              </span>
            </div>

            {/* Cards List */}
            <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-0">
              {loading ? (
                <div className="space-y-2 pt-2">
                  <div className="h-20 bg-white rounded-xl animate-pulse" />
                  <div className="h-20 bg-white rounded-xl animate-pulse" />
                </div>
              ) : col.items.length === 0 ? (
                <div className="h-32 flex flex-col items-center justify-center text-center p-3 text-slate-400">
                  <span className="text-[11px] font-medium">Nenhum lead nesta etapa</span>
                </div>
              ) : (
                col.items.map((journey) => {
                  const isUpdating = updatingId === journey.id;

                  return (
                    <div
                      key={journey.id}
                      onClick={() => {
                        onSelectJourney?.(journey.id);
                        onSwitchToCockpit?.();
                      }}
                      className="p-3 bg-white border border-slate-200 rounded-xl transition-all cursor-pointer relative group hover:border-emerald-500 hover:shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 transition-colors line-clamp-1">
                          {journey.contactName || journey.contactPhone || 'Lead Sem Nome'}
                        </span>
                      </div>

                      {journey.contactPhone && (
                        <p className="text-[11px] text-slate-500 font-mono mb-1.5">
                          {journey.contactPhone}
                        </p>
                      )}

                      {journey.primaryServiceOrProduct && (
                        <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 mb-2 truncate max-w-full">
                          {journey.primaryServiceOrProduct}
                        </span>
                      )}

                      {/* Card Footer */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                        <div className="flex items-center gap-1 font-medium">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>Ativo</span>
                        </div>

                        {/* Fast Move Buttons */}
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {colIdx > 0 && (
                            <button
                              disabled={isUpdating}
                              onClick={(e) => handleStageMove(journey, 'prev', e)}
                              className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                              title="Voltar etapa"
                            >
                              <ArrowLeft className="w-3 h-3" />
                            </button>
                          )}
                          {colIdx < COLUMNS.length - 1 && (
                            <button
                              disabled={isUpdating}
                              onClick={(e) => handleStageMove(journey, 'next', e)}
                              className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
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
