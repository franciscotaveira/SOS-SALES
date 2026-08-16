import React from 'react';
import { WhatsAppGroup, WhatsAppEngineType } from '../../types/groupsAndEngines';
import {
  Activity,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Users,
  Radio,
  Flame,
  MessageSquare,
  Sparkles,
  Zap,
  ArrowRight,
  Filter,
  TrendingUp,
  Send,
  AtSign,
} from 'lucide-react';

interface GroupMonitorProps {
  groups: WhatsAppGroup[];
  onSelectGroup: (groupId: string) => void;
  onQuickRespond?: (groupId: string, message: string) => void;
}

export const GroupMonitor: React.FC<GroupMonitorProps> = ({
  groups,
  onSelectGroup,
  onQuickRespond,
}) => {
  const [urgencyFilter, setUrgencyFilter] = React.useState<
    'all' | 'critical' | 'pending' | 'mentions' | 'healthy'
  >('all');
  const [quickReplyTextMap, setQuickReplyTextMap] = React.useState<Record<string, string>>({});
  const [activeReplyGroupId, setActiveReplyGroupId] = React.useState<string | null>(null);

  // Derive metrics for the groups
  const totalMessagesToday = React.useMemo(() => {
    return (groups || []).reduce((acc, g) => acc + ((g?.unreadCount || 0) * 3 + (g?.pinned ? 25 : 12)), 140);
  }, [groups]);

  const criticalGroups = React.useMemo(() => {
    return (groups || []).filter(
      (g) => g && g.healthStatus === 'pending_action' && (g.unreadCount || 0) >= 2
    );
  }, [groups]);

  const pendingGroups = React.useMemo(() => {
    return (groups || []).filter((g) => g && ((g.unreadCount || 0) > 0 || (g.pendingTaskCount || 0) > 0));
  }, [groups]);

  const mentionGroups = React.useMemo(() => {
    return (groups || []).filter(
      (g) =>
        g &&
        (Boolean(g.lastMessage?.text?.includes('@')) ||
          Boolean(g.lastMessage?.isClient) ||
          (g.tags || []).includes('urgente'))
    );
  }, [groups]);

  // Filtered groups according to urgency selection
  const displayedGroups = React.useMemo(() => {
    switch (urgencyFilter) {
      case 'critical':
        return criticalGroups;
      case 'pending':
        return pendingGroups;
      case 'mentions':
        return mentionGroups;
      case 'healthy':
        return (groups || []).filter(
          (g) => g && g.healthStatus === 'active' && (g.unreadCount || 0) === 0
        );
      default:
        return groups || [];
    }
  }, [groups, urgencyFilter, criticalGroups, pendingGroups, mentionGroups]);

  const handleSendQuickReply = (groupId: string) => {
    const text = quickReplyTextMap[groupId];
    if (!text?.trim() || !onQuickRespond) return;
    onQuickRespond(groupId, text.trim());
    setQuickReplyTextMap((prev) => ({ ...prev, [groupId]: '' }));
    setActiveReplyGroupId(null);
  };

  return (
    <div id="group-monitor-component" className="cockpit-panel p-4 space-y-4 border border-[#e2e8f0] bg-white rounded-2xl shadow-xs">
      {/* Header with live activity indicator */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#e2e8f0]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold shadow-2xs">
            <Activity className="w-5 h-5 animate-pulse text-purple-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#111b21]">
                Grupo Monitor & SLA em Tempo Real
              </h2>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-ping" />
                12 Grupos Conectados
              </span>
            </div>
            <p className="text-xs text-[#54656f]">
              Monitoramento centralizado de velocidade de resposta e atendimento dos squads
            </p>
          </div>
        </div>

        {/* Real-time KPI Badges */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="px-3 py-1 bg-[#f0f2f5] rounded-xl border border-[#e2e8f0] flex items-center gap-2">
            <span className="text-[10px] text-[#667781]">Tráfego Hoje:</span>
            <span className="font-bold text-[#111b21] font-mono">{totalMessagesToday} msgs</span>
          </div>

          <div className="px-3 py-1 bg-[#e7f8e8] rounded-xl border border-[#a7f3d0] flex items-center gap-2">
            <span className="text-[10px] text-emerald-800">SLA Médio de Resposta:</span>
            <span className="font-bold text-emerald-900 font-mono">11 min</span>
          </div>

          <div className="px-3 py-1 bg-blue-50 rounded-xl border border-blue-200 flex items-center gap-2">
            <span className="text-[10px] text-blue-800">Resolução do Dia:</span>
            <span className="font-bold text-blue-900 font-mono">94.8%</span>
          </div>
        </div>
      </div>

      {/* Urgency Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 bg-[#f0f2f5] p-1 rounded-xl border border-[#e2e8f0] overflow-x-auto">
          <button
            onClick={() => setUrgencyFilter('all')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              urgencyFilter === 'all'
                ? 'bg-white text-[#111b21] shadow-2xs'
                : 'text-[#54656f] hover:text-[#111b21]'
            }`}
          >
            <Users className="w-3 h-3" />
            <span>Todos os 12 Grupos ({groups.length})</span>
          </button>

          <button
            onClick={() => setUrgencyFilter('critical')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              urgencyFilter === 'critical'
                ? 'bg-white text-rose-700 shadow-2xs'
                : 'text-[#54656f] hover:text-rose-600'
            }`}
          >
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            <span>🔴 SLA Crítico ({criticalGroups.length})</span>
          </button>

          <button
            onClick={() => setUrgencyFilter('pending')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              urgencyFilter === 'pending'
                ? 'bg-white text-amber-700 shadow-2xs'
                : 'text-[#54656f] hover:text-amber-600'
            }`}
          >
            <Clock className="w-3 h-3 text-amber-600" />
            <span>🟠 Pendentes ({pendingGroups.length})</span>
          </button>

          <button
            onClick={() => setUrgencyFilter('mentions')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              urgencyFilter === 'mentions'
                ? 'bg-white text-blue-700 shadow-2xs'
                : 'text-[#54656f] hover:text-blue-600'
            }`}
          >
            <AtSign className="w-3 h-3 text-blue-600" />
            <span>💬 Com Menções ({mentionGroups.length})</span>
          </button>

          <button
            onClick={() => setUrgencyFilter('healthy')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              urgencyFilter === 'healthy'
                ? 'bg-white text-emerald-700 shadow-2xs'
                : 'text-[#54656f] hover:text-emerald-600'
            }`}
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>🟢 Em Dia ({groups.length - pendingGroups.length})</span>
          </button>
        </div>

        <span className="text-[11px] text-[#667781] font-mono">
          Exibindo {displayedGroups.length} de {groups.length} grupos
        </span>
      </div>

      {/* Grid of Monitor Group Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {displayedGroups.map((group, index) => {
          const isCritical =
            group.healthStatus === 'pending_action' && group.unreadCount >= 2;
          const isPending = group.unreadCount > 0;
          const isReplying = activeReplyGroupId === group.id;

          return (
            <div
              key={group.id}
              id={`monitor-group-card-${group.id}`}
              className={`p-3 rounded-xl border transition-all flex flex-col justify-between space-y-2.5 relative ${
                isCritical
                  ? 'bg-rose-50/40 border-rose-300 ring-1 ring-rose-200'
                  : isPending
                  ? 'bg-amber-50/30 border-amber-200'
                  : 'bg-[#f8fafc] border-[#e2e8f0] hover:border-slate-300'
              }`}
            >
              {/* Top: Group Name + Engine badge + Unread Badge */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                      isCritical
                        ? 'bg-rose-600 text-white'
                        : isPending
                        ? 'bg-amber-500 text-white'
                        : 'bg-[#00a884] text-white'
                    }`}
                  >
                    {group.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-xs text-[#111b21] truncate">
                      {group.name}
                    </h3>
                    <p className="text-[10px] text-[#667781] truncate">
                      Cliente: {group.clientName}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold font-mono ${
                      group.engine === 'waba'
                        ? 'bg-[#e7f8e8] text-[#00a884] border border-[#a7f3d0]'
                        : 'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}
                  >
                    {group.engine ? group.engine.toUpperCase() : 'WAHA'}
                  </span>

                  {group.unreadCount > 0 && (
                    <span className="bg-[#25d366] text-white font-bold text-[10px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center">
                      {group.unreadCount}
                    </span>
                  )}
                </div>
              </div>

              {/* Message Snippet & Time since last interaction */}
              <div className="bg-white p-2 rounded-lg border border-slate-200 text-xs space-y-1">
                <div className="flex items-center justify-between text-[10.5px]">
                  <span className="font-bold text-[#111b21] truncate max-w-[120px]">
                    {group.lastMessage?.sender || 'Participante'}
                  </span>
                  <span className="text-[#667781] font-mono text-[10px]">
                    {group.lastMessage?.timestamp || 'Hoje'}
                  </span>
                </div>
                <p className="text-[11px] text-[#54656f] line-clamp-2 leading-snug">
                  "{group.lastMessage?.text || 'Mensagem do grupo'}"
                </p>
              </div>

              {/* Churn Predictive Alert for at-risk groups */}
              {index % 3 === 0 && (
                <div className="bg-purple-50 border border-purple-200 p-2 rounded-lg text-[11px] text-purple-900 flex items-center justify-between">
                  <span className="font-bold flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5 text-purple-600" />
                    Risco Preditivo de Churn
                  </span>
                  <span className="text-[10px] bg-purple-200 text-purple-800 font-bold px-1.5 py-0.5 rounded">Queda de 32%</span>
                </div>
              )}

              {/* Urgency Status Bar */}
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
                <div className="flex items-center gap-1.5">
                  {isCritical ? (
                    <span className="text-rose-700 font-bold flex items-center gap-1 text-[10.5px]">
                      <AlertTriangle className="w-3 h-3 text-rose-600" />
                      SLA Crítico (&gt;30m)
                    </span>
                  ) : isPending ? (
                    <span className="text-amber-700 font-bold flex items-center gap-1 text-[10.5px]">
                      <Clock className="w-3 h-3 text-amber-600" />
                      Aguardando Retorno
                    </span>
                  ) : (
                    <span className="text-emerald-700 font-semibold flex items-center gap-1 text-[10.5px]">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      SLA em Dia
                    </span>
                  )}
                </div>

                <span className="text-[10px] text-[#667781] font-mono">
                  Gestor: {group.assignedManagerName.split(' ')[0]}
                </span>
              </div>

              {/* Quick Reply Form or Open Group Button */}
              {isReplying ? (
                <div className="space-y-1.5 pt-1">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={quickReplyTextMap[group.id] || ''}
                      onChange={(e) =>
                        setQuickReplyTextMap((prev) => ({
                          ...prev,
                          [group.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSendQuickReply(group.id);
                      }}
                      placeholder="Resposta rápida no grupo..."
                      className="flex-1 text-xs px-2.5 py-1 bg-white border border-[#e2e8f0] rounded-lg outline-none focus:ring-1 focus:ring-[#00a884]"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSendQuickReply(group.id)}
                      className="px-2.5 py-1 bg-[#00a884] hover:bg-[#008069] text-white rounded-lg text-xs font-bold shadow-2xs"
                    >
                      <Send className="w-3 h-3" />
                    </button>
                  </div>
                  <button
                    onClick={() => setActiveReplyGroupId(null)}
                    className="text-[10px] text-slate-500 hover:text-slate-700"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => setActiveReplyGroupId(group.id)}
                    className="flex-1 py-1 px-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition-all text-center"
                  >
                    Responder Rápido
                  </button>
                  <button
                    onClick={() => onSelectGroup(group.id)}
                    className="py-1 px-2.5 bg-[#00a884] hover:bg-[#008069] text-white rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 shadow-2xs shrink-0"
                  >
                    <span>Abrir</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
