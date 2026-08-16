import React from 'react';
import { Journey } from '../../types/cockpit';
import { PriorityItem } from './PriorityItem';
import { Clock, Filter, ChevronRight, CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react';

interface PriorityQueueProps {
  journeys: Journey[];
  selectedJourneyId?: string;
  onSelectJourney: (journey: Journey) => void;
  onClaimHandoff: (journeyId: string) => void;
  currentOperatorId: string;
  onViewAllConversations: () => void;
  isLoading?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
}

export const PriorityQueue: React.FC<PriorityQueueProps> = ({
  journeys,
  selectedJourneyId,
  onSelectJourney,
  onClaimHandoff,
  currentOperatorId,
  onViewAllConversations,
  isLoading,
  errorMessage,
  onRetry,
}) => {
  const [filterMode, setFilterMode] = React.useState<'all' | 'pending' | 'mine'>('all');

  // Filter priorities strictly to 3-5 focus items on the top fold
  const priorityJourneys = React.useMemo(() => {
    let list = [...journeys];
    if (filterMode === 'pending') {
      list = list.filter((j) => j.handoffStatus === 'pending_operator');
    } else if (filterMode === 'mine') {
      list = list.filter((j) => j.assignedOperatorId === currentOperatorId);
    }
    // Sort by urgency: critical SLA first, then warning SLA, then pending, then remaining minutes
    list.sort((a, b) => {
      if (a.slaStatus === 'critical' && b.slaStatus !== 'critical') return -1;
      if (b.slaStatus === 'critical' && a.slaStatus !== 'critical') return 1;
      if (a.slaStatus === 'warning' && b.slaStatus !== 'warning') return -1;
      if (b.slaStatus === 'warning' && a.slaStatus !== 'warning') return 1;
      return a.slaMinutesRemaining - b.slaMinutesRemaining;
    });
    return list.slice(0, 5);
  }, [journeys, filterMode, currentOperatorId]);

  const pendingCount = journeys.filter((j) => j.handoffStatus === 'pending_operator').length;
  const criticalCount = journeys.filter((j) => j.slaStatus === 'critical').length;

  return (
    <div id="priority-queue-panel" className="cockpit-panel flex flex-col h-full max-h-full min-h-0 overflow-hidden">
      {/* Panel Header */}
      <div className="cockpit-panel-header px-3.5 py-2.5 shrink-0 border-b border-[#e2e8f0] bg-white space-y-1.5">
        {/* Row 1: Title and Urgency Badge */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 whitespace-nowrap">
              Fila de Prioridades
            </h2>
            {criticalCount > 0 ? (
              <span className="px-2 py-0.5 bg-rose-500 text-white rounded-full text-[10px] font-bold shrink-0 animate-pulse flex items-center gap-1 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                <span>{criticalCount} urgente</span>
              </span>
            ) : pendingCount > 0 ? (
              <span className="px-2 py-0.5 bg-amber-500 text-white rounded-full text-[10px] font-bold shrink-0 shadow-2xs">
                {pendingCount} pendente{pendingCount > 1 ? 's' : ''}
              </span>
            ) : null}
          </div>
        </div>

        {/* Row 2: Subtitle + Filter Pill */}
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-slate-500 text-[10.5px] truncate">
            3–5 conversas com prioridade
          </span>

          {/* Filter toggle */}
          <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-md text-[10px] shrink-0 border border-slate-200/60">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2 py-0.5 rounded font-medium transition-all ${
                filterMode === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Todas
            </button>
            <button
              onClick={() => setFilterMode('pending')}
              className={`px-2 py-0.5 rounded font-medium transition-all ${
                filterMode === 'pending'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Pendentes
            </button>
          </div>
        </div>
      </div>

      {/* List content */}
      <div className="p-3 overflow-y-auto flex-1 min-h-0 space-y-2.5">
        {isLoading ? (
          <div className="text-center py-12 px-4 space-y-2">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto" />
            <div className="text-xs font-semibold text-slate-700">Carregando fila de prioridades...</div>
          </div>
        ) : errorMessage ? (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-center space-y-2">
            <AlertCircle className="w-6 h-6 text-rose-600 mx-auto" />
            <div className="text-xs font-bold text-rose-900">Erro ao carregar fila</div>
            <p className="text-[11px] text-rose-700">{errorMessage}</p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-1 px-3 py-1 bg-rose-600 text-white rounded text-xs font-bold hover:bg-rose-700 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Tentar novamente
              </button>
            )}
          </div>
        ) : priorityJourneys.length === 0 ? (
          <div className="text-center py-10 px-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div className="text-xs font-bold text-slate-800">Fila sob controle!</div>
            <div className="text-[11px] text-slate-500 mt-1 max-w-[200px] mx-auto">
              Nenhuma conversa aguardando ação de emergência ou SLA atrasado no momento.
            </div>
          </div>
        ) : (
          priorityJourneys.map((journey) => (
            <PriorityItem
              key={journey.id}
              journey={journey}
              isSelected={journey.id === selectedJourneyId}
              onSelect={onSelectJourney}
              onClaim={onClaimHandoff}
              isCurrentOperatorOwner={journey.assignedOperatorId === currentOperatorId}
            />
          ))
        )}
      </div>

      {/* Footer "Ver todas" */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/50 shrink-0">
        <button
          id="view-all-conversations-btn"
          onClick={onViewAllConversations}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50/70 hover:bg-blue-100/80 rounded-lg border border-blue-200/80 transition-colors"
        >
          <span>Ver todas as {journeys.length} conversas</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
