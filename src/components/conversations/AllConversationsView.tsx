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
    <div id="all-conversations-view" className="h-full overflow-y-auto w-full p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      {/* Header with Search and Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Todas as Conversas</h1>
          <p className="text-xs text-slate-500">Histórico completo de atendimentos e jornadas</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Visualizar como Kanban Button */}
          {onGoToKanban && (
            <button
              id="view-as-kanban-btn"
              onClick={onGoToKanban}
              className="px-3 py-1.5 bg-[#e7f8e8] hover:bg-[#d1fae5] text-[#00a884] border border-[#a7f3d0] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
              title="Alternar para visualização de funil Kanban"
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>Visualizar como Kanban</span>
            </button>
          )}

          {/* Search bar */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone ou mensagem..."
              className="w-full pl-9 pr-3 py-1.5 text-xs text-slate-900 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
            />
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white rounded-lg border border-slate-200 focus:border-blue-500"
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
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
              <tr>
                <th className="px-4 py-3">Lead / Telefone</th>
                <th className="px-4 py-3">Origem / Campanha</th>
                <th className="px-4 py-3">Última Mensagem</th>
                <th className="px-4 py-3">SLA / Status</th>
                <th className="px-4 py-3">Responsável</th>
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Nenhuma conversa encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filtered.map((j) => (
                  <tr
                    key={j.id}
                    onClick={() => onGoToCockpit(j)}
                    className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-900">{j.leadName}</div>
                      <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {j.leadPhone}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-800 truncate max-w-[180px]">
                        {j.acquisition.campaignName || 'Orgânico'}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {j.acquisition.referralOffer || 'Sem oferta vinculada'}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-slate-600 line-clamp-1 max-w-[260px]">
                        "{j.lastLeadMessage}"
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      {j.handoffStatus === 'resolved' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Finalizado
                        </span>
                      ) : j.slaStatus === 'critical' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          Crítico ({j.slaMinutesRemaining}m)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                          SLA {j.slaMinutesRemaining}m
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-slate-700 font-medium">
                        {j.assignedOperatorName || 'Fila geral (Pendente)'}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onGoToCockpit(j);
                        }}
                        className="px-3 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                      >
                        Abrir Cockpit ➔
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
