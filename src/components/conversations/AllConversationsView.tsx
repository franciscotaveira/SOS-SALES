import React from 'react';
import { Journey, Channel, OperatorRole } from '../../types/cockpit';
import { Search, Filter, Phone, Clock, User, CheckCircle2, AlertCircle, MessageSquare, Columns3 } from 'lucide-react';

interface AllConversationsViewProps {
  journeys: Journey[];
  channels: Channel[];
  selectedJourneyId?: string;
  onSelectJourney: (journey: Journey) => void;
  onGoToCockpit: (journey: Journey) => void;
  onGoToKanban?: () => void;
  currentOperatorId: string;
}

export const AllConversationsView: React.FC<AllConversationsViewProps> = ({
  journeys,
  channels,
  selectedJourneyId,
  onSelectJourney,
  onGoToCockpit,
  onGoToKanban,
  currentOperatorId,
}) => {
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');

  const filtered = React.useMemo(() => {
    return journeys.filter((j) => {
      const matchSearch =
        j.leadName.toLowerCase().includes(search.toLowerCase()) ||
        j.leadPhone.includes(search) ||
        j.lastLeadMessage.toLowerCase().includes(search.toLowerCase());

      if (!matchSearch) return false;
      if (statusFilter === 'all') return true;
      if (statusFilter === 'pending') return j.handoffStatus === 'pending_operator';
      if (statusFilter === 'mine') return j.assignedOperatorId === currentOperatorId;
      if (statusFilter === 'resolved') return j.handoffStatus === 'resolved' || !!j.outcome;
      return true;
    });
  }, [journeys, search, statusFilter, currentOperatorId]);

  return (
    <div id="all-conversations-view" className="h-full overflow-y-auto w-full p-3 sm:p-4 max-w-7xl mx-auto space-y-3">
      {/* Header with Search and Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-[var(--sos-border)]">
        <div>
          <h1 className="text-lg font-bold text-[var(--sos-ink)]">Todas as Conversas</h1>
          <p className="text-xs text-[var(--sos-muted)]">Histórico completo de atendimentos e jornadas</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Visualizar como Kanban Button */}
          {onGoToKanban && (
            <button
              id="view-as-kanban-btn"
              onClick={onGoToKanban}
              className="px-2.5 py-1.5 bg-[var(--sos-success-subtle)] hover:bg-[var(--sos-success-subtle)]/80 text-[var(--sos-success)] border border-[var(--sos-success)]/30 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
              title="Alternar para visualização de funil Kanban"
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>Visualizar como Kanban</span>
            </button>
          )}

          {/* Search bar */}
          <div className="relative w-full sm:w-60">
            <Search className="w-4 h-4 text-[var(--sos-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone ou mensagem..."
              className="w-full pl-8 pr-3 py-1.5 text-xs text-[var(--sos-ink)] rounded-lg border border-[var(--sos-border)] focus:border-[var(--sos-action)] focus:ring-1 focus:ring-[var(--sos-action)] bg-[var(--sos-surface)]"
            />
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs font-semibold text-[var(--sos-ink)] bg-[var(--sos-surface)] rounded-lg border border-[var(--sos-border)] focus:border-[var(--sos-action)]"
          >
            <option value="all">Todos os status</option>
            <option value="pending">Aguardando operador</option>
            <option value="mine">Meus atendimentos</option>
            <option value="resolved">Finalizados</option>
          </select>
        </div>
      </div>

      {/* Conversations Grid / List */}
      <div className="cockpit-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--sos-border)]/30 border-b border-[var(--sos-border)] text-[var(--sos-muted)] font-bold uppercase text-[10px]">
              <tr>
                <th className="px-3 py-2.5">Lead / Telefone</th>
                <th className="px-3 py-2.5">Origem / Campanha</th>
                <th className="px-3 py-2.5">Última Mensagem</th>
                <th className="px-3 py-2.5">SLA / Status</th>
                <th className="px-3 py-2.5">Responsável</th>
                <th className="px-3 py-2.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sos-border)] text-[var(--sos-ink)]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[var(--sos-muted)]">
                    Nenhuma conversa encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filtered.map((j) => (
                  <tr
                    key={j.id}
                    onClick={() => onGoToCockpit(j)}
                    className="hover:bg-[var(--sos-action-subtle)]/40 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-[var(--sos-ink)]">{j.leadName}</div>
                      <div className="text-[11px] text-[var(--sos-muted)] font-mono flex items-center gap-1">
                        <Phone className="w-3 h-3 text-[var(--sos-muted)]" />
                        {j.leadPhone}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-[var(--sos-ink)] truncate max-w-[180px]">
                        {j.acquisition.campaignName || 'Orgânico'}
                      </div>
                      <div className="text-[10px] text-[var(--sos-muted)]">
                        {j.acquisition.referralOffer || 'Sem oferta vinculada'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-[var(--sos-muted)] line-clamp-1 max-w-[260px]">
                        "{j.lastLeadMessage}"
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {j.handoffStatus === 'resolved' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--sos-success-subtle)] text-[var(--sos-success)] border border-[var(--sos-success)]/30">
                          Finalizado
                        </span>
                      ) : j.slaStatus === 'critical' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--sos-danger-subtle)] text-[var(--sos-danger)] border border-[var(--sos-danger)]/30">
                          Crítico ({j.slaMinutesRemaining}m)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--sos-border)]/30 text-[var(--sos-muted)]">
                          SLA {j.slaMinutesRemaining}m
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-[var(--sos-muted)] font-medium">
                        {j.assignedOperatorName || 'Fila geral (Pendente)'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onGoToCockpit(j);
                        }}
                        className="px-2.5 py-1 text-xs font-bold text-[var(--sos-action)] bg-[var(--sos-action-subtle)] hover:bg-[var(--sos-action-subtle)]/80 rounded-lg border border-[var(--sos-action)]/30 transition-colors"
                      >
                        Abrir Cockpit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
