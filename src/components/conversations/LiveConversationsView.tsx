import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  UserRound,
  Clock,
  ArrowRight,
  MessageSquare,
  Sparkles,
  AlertCircle,
  Phone,
  Filter,
} from 'lucide-react';
import { ApiJourney, SalesOsGateway } from '../../services/salesOsGateway';

interface LiveConversationsViewProps {
  workspaceId: string;
  gateway: SalesOsGateway;
  onJourneySelect?: (journeyId: string) => void;
  onSwitchToCockpit?: () => void;
}

type FilterChip = 'all' | 'handoff_pending' | 'sla_critical' | 'by_stage';

export const LiveConversationsView: React.FC<LiveConversationsViewProps> = ({
  workspaceId,
  gateway,
  onJourneySelect,
  onSwitchToCockpit,
}) => {
  const [journeys, setJourneys] = useState<ApiJourney[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState<FilterChip>('all');
  const [stageFilter, setStageFilter] = useState<string>('all');

  const fetchJourneys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if ('listJourneys' in gateway && typeof (gateway as any).listJourneys === 'function') {
        const res = await (gateway as any).listJourneys(workspaceId, { limit: 100 });
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
      setError(err?.message || 'Erro ao carregar lista de conversas.');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, gateway]);

  useEffect(() => {
    fetchJourneys();
  }, [fetchJourneys]);

  const filtered = useMemo(() => {
    return journeys.filter((j) => {
      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matches =
          (j.contactName && j.contactName.toLowerCase().includes(q)) ||
          (j.contactPhone && j.contactPhone.includes(q)) ||
          (j.primaryServiceOrProduct && j.primaryServiceOrProduct.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // Filter chips
      if (activeChip === 'by_stage' && stageFilter !== 'all') {
        if (j.pipelineStage !== stageFilter) return false;
      }

      return true;
    });
  }, [journeys, search, activeChip, stageFilter]);

  const formatStage = (stage?: string | null) => {
    const st = stage?.toUpperCase();
    switch (st) {
      case 'NEW':
      case 'LEAD':
        return { label: 'Novo Lead', bg: 'bg-blue-50 text-blue-700 border border-blue-200' };
      case 'CONTACTED':
        return { label: 'Em Contato', bg: 'bg-indigo-50 text-indigo-700 border border-indigo-200' };
      case 'QUALIFIED':
      case 'QUALIFICADO':
        return { label: 'Qualificado', bg: 'bg-purple-50 text-purple-700 border border-purple-200' };
      case 'PROPOSAL':
      case 'PROPOSTA':
        return { label: 'Proposta', bg: 'bg-amber-50 text-amber-700 border border-amber-200' };
      case 'NEGOTIATION':
      case 'NEGOCIACAO':
        return { label: 'Negociação', bg: 'bg-violet-50 text-violet-700 border border-violet-200' };
      case 'WON':
      case 'GANHO':
        return { label: 'Fechado Ganho', bg: 'bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold' };
      case 'LOST':
      case 'PERDIDO':
        return { label: 'Perdido', bg: 'bg-rose-50 text-rose-700 border border-rose-200' };
      default:
        return { label: stage || 'Aberto', bg: 'bg-slate-100 text-slate-700 border border-slate-200' };
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 text-slate-900 p-4 sm:p-6 overflow-hidden max-w-7xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-950 font-heading tracking-tight flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-600" /> Central de Conversas Ao Vivo
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {filtered.length} Conversas
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Histórico auditável e supervisão de mensagens em tempo real no banco oficial.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar contato ou número..."
              className="pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors w-48 sm:w-64 shadow-2xs"
            />
          </div>

          <button
            onClick={() => fetchJourneys()}
            disabled={loading}
            className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 transition-colors shadow-2xs cursor-pointer"
            title="Atualizar conversas"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-2 py-3 overflow-x-auto text-xs">
        <button
          onClick={() => setActiveChip('all')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all shadow-2xs cursor-pointer ${
            activeChip === 'all'
              ? 'bg-emerald-600 text-white shadow-emerald-600/20'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Todas as Conversas ({journeys.length})
        </button>
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

      {/* Table / List Container */}
      <div className="mt-2 flex-1 bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden flex flex-col min-h-0">
        <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
          {loading ? (
            <div className="p-6 space-y-3">
              <div className="h-14 bg-slate-100 rounded-xl animate-pulse" />
              <div className="h-14 bg-slate-100 rounded-xl animate-pulse" />
              <div className="h-14 bg-slate-100 rounded-xl animate-pulse" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <MessageSquare className="w-8 h-8 text-slate-400 mb-2" />
              <span className="text-sm font-bold text-slate-800">Nenhuma conversa encontrada</span>
              <span className="text-xs text-slate-500 mt-1">Tente ajustar os filtros ou os termos da busca.</span>
            </div>
          ) : (
            filtered.map((j) => {
              const stage = formatStage(j.pipelineStage);

              return (
                <div
                  key={j.id}
                  onClick={() => {
                    onJourneySelect?.(j.id);
                    onSwitchToCockpit?.();
                  }}
                  className="p-3.5 sm:p-4 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs">
                      {j.contactName ? j.contactName.charAt(0).toUpperCase() : <Phone className="w-4 h-4" />}
                    </div>

                    {/* Lead Details */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors truncate">
                          {j.contactName || j.contactPhone || 'Lead Sem Nome'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[10.5px] font-semibold ${stage.bg}`}>
                          {stage.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                        {j.contactPhone && <span className="font-mono text-[11px] text-slate-600">{j.contactPhone}</span>}
                        {j.primaryServiceOrProduct && (
                          <span className="truncate text-slate-500">• {j.primaryServiceOrProduct}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right side Action */}
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onJourneySelect?.(j.id);
                        onSwitchToCockpit?.();
                      }}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer group-hover:shadow-xs"
                    >
                      <span>Abrir Cockpit</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
