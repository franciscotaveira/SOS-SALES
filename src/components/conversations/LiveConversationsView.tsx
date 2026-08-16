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
        return { label: 'Novo Lead', bg: 'bg-slate-800 text-slate-300' };
      case 'CONTACTED':
        return { label: 'Em Contato', bg: 'bg-blue-900/50 text-blue-300' };
      case 'QUALIFIED':
        return { label: 'Qualificado', bg: 'bg-emerald-900/50 text-emerald-300' };
      case 'PROPOSAL':
        return { label: 'Proposta', bg: 'bg-amber-900/50 text-amber-300' };
      case 'NEGOTIATION':
        return { label: 'Negociação', bg: 'bg-violet-900/50 text-violet-300' };
      case 'WON':
        return { label: 'Fechado Ganho', bg: 'bg-emerald-950 text-emerald-400 font-bold' };
      case 'LOST':
        return { label: 'Perdido', bg: 'bg-rose-950 text-rose-400' };
      default:
        return { label: stage || 'Aberto', bg: 'bg-slate-800 text-slate-400' };
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4 sm:p-6 overflow-hidden">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-400" /> Central de Conversas Ao Vivo
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {filtered.length} Conversas
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Histórico auditável e supervisão de mensagens em tempo real no banco oficial.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar contato ou número..."
              className="pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors w-48 sm:w-64"
            />
          </div>

          <button
            onClick={() => fetchJourneys()}
            disabled={loading}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Atualizar conversas"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-2 py-3 border-b border-slate-800/80 overflow-x-auto text-xs">
        <button
          onClick={() => setActiveChip('all')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
            activeChip === 'all'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
          }`}
        >
          Todas as Conversas ({journeys.length})
        </button>
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

      {/* Table / List Container */}
      <div className="mt-4 flex-1 bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden flex flex-col min-h-0">
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="p-6 space-y-3">
              <div className="h-12 bg-slate-800/40 rounded-lg animate-pulse" />
              <div className="h-12 bg-slate-800/40 rounded-lg animate-pulse" />
              <div className="h-12 bg-slate-800/40 rounded-lg animate-pulse" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <MessageSquare className="w-8 h-8 text-slate-600 mb-2" />
              <span className="text-sm font-medium text-slate-300">Nenhuma conversa encontrada</span>
              <span className="text-xs text-slate-500 mt-1">Tente ajustar os filtros ou os termos da busca.</span>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {filtered.map((j) => {
                const stage = formatStage(j.pipelineStage);

                return (
                  <div
                    key={j.id}
                    onClick={() => {
                      onJourneySelect?.(j.id);
                      onSwitchToCockpit?.();
                    }}
                    className="p-3.5 sm:p-4 hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm shrink-0">
                        {j.contactName ? j.contactName.charAt(0).toUpperCase() : <Phone className="w-4 h-4" />}
                      </div>

                      {/* Lead Details */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors truncate">
                            {j.contactName || j.contactPhone || 'Lead Sem Nome'}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${stage.bg}`}>
                            {stage.label}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                          {j.contactPhone && <span className="font-mono">{j.contactPhone}</span>}
                          {j.primaryServiceOrProduct && <span>• {j.primaryServiceOrProduct}</span>}
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
                        className="px-3 py-1.5 bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>Abrir Cockpit</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
