import React, { useState, useEffect, useMemo, memo } from 'react';
import { Journey } from '../../types/cockpit';
import { WhatsAppGroup } from '../../types/groupsAndEngines';
import {
  Tv,
  Maximize2,
  Minimize2,
  Bot,
  User,
  Clock,
  AlertTriangle,
  Flame,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Radio,
  Play,
  Pause,
  Layers,
  Filter,
  Volume2,
  Users,
  MessageSquare,
} from 'lucide-react';

interface LiveWallboardViewProps {
  journeys?: Journey[];
  groups?: WhatsAppGroup[];
  mode?: 'conversations' | 'groups';
  onGoToCockpit?: (journey: Journey) => void;
  onOpenGroup?: (groupId: string) => void;
}

// Ultra-light Micro-Card Snapshot for 1:1 Conversations
const MicroConversationCard = memo(({
  journey,
  onOpen,
  isTvMode,
}: {
  journey: Journey;
  onOpen?: () => void;
  isTvMode?: boolean;
}) => {
  const isAiActive = journey.handoffStatus !== 'pending_operator';
  const isPending = journey.handoffStatus === 'pending_operator';
  const isCritical = journey.slaStatus === 'critical';

  const leadMsg = journey.lastLeadMessage || journey.acquisition?.initialMessageText || 'Olá, gostaria de saber mais...';
  const botOrOperatorMsg = journey.recommendation?.draftText || 'Olá! Como posso te ajudar hoje?';

  return (
    <div
      className={`rounded-2xl transition-all flex flex-col justify-between overflow-hidden shadow-md border ${
        isTvMode
          ? 'bg-slate-900/90 border-slate-800 text-white hover:border-[#00a884]'
          : 'bg-white border-slate-200 text-slate-900 hover:border-slate-300 hover:shadow-lg'
      }`}
      style={{ minHeight: '210px' }}
    >
      {/* Card Header */}
      <div className={`p-3 border-b flex items-center justify-between gap-2 ${
        isTvMode ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-100'
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
            isTvMode ? 'bg-slate-800 text-emerald-400' : 'bg-slate-200 text-slate-700'
          }`}>
            {journey.leadName.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h4 className="font-bold text-xs truncate">{journey.leadName}</h4>
              <span className="w-2 h-2 rounded-full bg-[#25d366] shrink-0" title="Online" />
            </div>
            <p className="text-[10px] text-slate-400 font-mono truncate">{journey.leadPhone}</p>
          </div>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-1 shrink-0">
          {isAiActive ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
              <Bot className="w-3 h-3 text-purple-400 animate-pulse" />
              <span>IA Ativa</span>
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-400 animate-bounce" />
              <span>Fila Operador</span>
            </span>
          )}

          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
            isCritical
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-ping'
              : isTvMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'
          }`}>
            {journey.slaMinutesRemaining}m
          </span>
        </div>
      </div>

      {/* Mini Chat Stream */}
      <div className="p-3 flex-1 flex flex-col justify-end space-y-2 overflow-hidden text-xs">
        <div className="flex flex-col items-start">
          <div className="flex items-center gap-1 mb-0.5 text-[9.5px] text-slate-400">
            Cliente · {journey.lastActivityAt}
          </div>
          <div
            className={`px-2.5 py-1.5 rounded-xl text-[11px] leading-snug max-w-[90%] line-clamp-2 ${
              isTvMode
                ? 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700'
                : 'bg-slate-100 text-slate-900 rounded-tl-none'
            }`}
          >
            {leadMsg}
          </div>
        </div>

        <div className="flex flex-col items-end">
          <div className="flex items-center gap-1 mb-0.5 text-[9.5px] text-slate-400">
            {isAiActive ? '🤖 IA Copilot' : '👤 Atendente'} · Agora
          </div>
          <div
            className={`px-2.5 py-1.5 rounded-xl text-[11px] leading-snug max-w-[90%] line-clamp-2 ${
              isAiActive
                ? isTvMode
                  ? 'bg-purple-950/60 text-purple-200 rounded-tr-none border border-purple-800/40'
                  : 'bg-purple-50 text-purple-950 rounded-tr-none border border-purple-200'
                : 'bg-[#00a884]/20 text-[#00a884] rounded-tr-none border border-[#00a884]/30'
            }`}
          >
            {botOrOperatorMsg}
          </div>
        </div>
      </div>

      {/* Card Footer */}
      <div className={`p-2.5 px-3 border-t flex items-center justify-between gap-2 text-[11px] ${
        isTvMode ? 'bg-slate-950/40 border-slate-800/60' : 'bg-slate-50 border-slate-100'
      }`}>
        <div className="flex items-center gap-1.5 text-slate-400 truncate">
          <span className="truncate uppercase font-bold text-[10px]">
            🎯 {journey.stage ? journey.stage.replace('_', ' ') : 'Novo Lead'}
          </span>
        </div>

        {onOpen && (
          <button
            onClick={onOpen}
            className="px-2.5 py-1 text-[10.5px] font-bold text-white bg-[#00a884] hover:bg-[#008069] rounded-lg transition-all flex items-center gap-1 shadow-2xs shrink-0"
          >
            <span>Assumir</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
});

// Ultra-light Micro-Card Snapshot for WhatsApp Groups
const MicroGroupCard = memo(({
  group,
  onOpen,
  isTvMode,
}: {
  group: WhatsAppGroup;
  onOpen?: () => void;
  isTvMode?: boolean;
}) => {
  const isActionPending = group.healthStatus === 'pending_action' || group.unreadCount > 0;
  const isIdle = group.healthStatus === 'idle';

  return (
    <div
      className={`rounded-2xl transition-all flex flex-col justify-between overflow-hidden shadow-md border ${
        isTvMode
          ? 'bg-slate-900/90 border-slate-800 text-white hover:border-purple-500'
          : 'bg-white border-slate-200 text-slate-900 hover:border-purple-300 hover:shadow-lg'
      }`}
      style={{ minHeight: '210px' }}
    >
      {/* Group Card Header */}
      <div className={`p-3 border-b flex items-center justify-between gap-2 ${
        isTvMode ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-100'
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
            isTvMode ? 'bg-purple-950 text-purple-300 border border-purple-700/50' : 'bg-purple-100 text-purple-800'
          }`}>
            <Users className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-xs truncate leading-tight">{group.name}</h4>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 truncate">
              <span className="font-medium">{group.clientName}</span>
              <span>·</span>
              <span className="font-mono">{group.participantCount} membros</span>
            </div>
          </div>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-1 shrink-0">
          {isActionPending ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1 animate-pulse">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>Atenção</span>
            </span>
          ) : isIdle ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/10 text-slate-400 border border-slate-500/20">
              Silencioso
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Saudável</span>
            </span>
          )}

          {group.unreadCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-rose-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
              {group.unreadCount}
            </span>
          )}
        </div>
      </div>

      {/* Mini Group Chat Stream */}
      <div className="p-3 flex-1 flex flex-col justify-end space-y-2 overflow-hidden text-xs">
        <div className="flex flex-col items-start">
          <div className="flex items-center gap-1 mb-0.5 text-[9.5px] text-slate-400">
            {group.lastMessage.sender} · {group.lastMessage.timestamp}
          </div>
          <div
            className={`px-2.5 py-1.5 rounded-xl text-[11px] leading-snug max-w-[95%] line-clamp-2 ${
              isTvMode
                ? 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700'
                : 'bg-slate-100 text-slate-900 rounded-tl-none'
            }`}
          >
            {group.lastMessage.text}
          </div>
        </div>

        {group.notes && (
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-300 line-clamp-2">
            <span className="font-bold text-purple-400">🤖 Resumo IA:</span> {group.notes}
          </div>
        )}
      </div>

      {/* Group Card Footer */}
      <div className={`p-2.5 px-3 border-t flex items-center justify-between gap-2 text-[11px] ${
        isTvMode ? 'bg-slate-950/40 border-slate-800/60' : 'bg-slate-50 border-slate-100'
      }`}>
        <div className="flex items-center gap-1.5 text-slate-400 text-[10px]">
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono font-bold uppercase">
            {group.engine}
          </span>
          <span className="truncate">#{group.category}</span>
        </div>

        {onOpen && (
          <button
            onClick={onOpen}
            className="px-2.5 py-1 text-[10.5px] font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-all flex items-center gap-1 shadow-2xs shrink-0"
          >
            <span>Abrir Grupo</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
});

export const LiveWallboardView: React.FC<LiveWallboardViewProps> = ({
  journeys = [],
  groups = [],
  mode = 'conversations',
  onGoToCockpit,
  onOpenGroup,
}) => {
  const [currentTarget, setCurrentTarget] = useState<'conversations' | 'groups'>(mode);
  const [isTvMode, setIsTvMode] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'ai' | 'pending' | 'critical'>('all');
  const [autoRotate, setAutoRotate] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);

  const pageSize = isTvMode ? 8 : 9;

  // Filtered Journeys
  const activeJourneys = useMemo(() => {
    return journeys.filter((j) => {
      if (filterType === 'ai') return j.handoffStatus !== 'pending_operator';
      if (filterType === 'pending') return j.handoffStatus === 'pending_operator';
      if (filterType === 'critical') return j.slaStatus === 'critical';
      return true;
    });
  }, [journeys, filterType]);

  // Filtered Groups
  const activeGroups = useMemo(() => {
    return groups.filter((g) => {
      if (filterType === 'pending') return g.healthStatus === 'pending_action' || g.unreadCount > 0;
      if (filterType === 'critical') return g.healthStatus === 'idle';
      return true;
    });
  }, [groups, filterType]);

  const itemsCount = currentTarget === 'conversations' ? activeJourneys.length : activeGroups.length;
  const totalPages = Math.max(1, Math.ceil(itemsCount / pageSize));

  // Auto-rotation timer for TV Mode (every 15s)
  useEffect(() => {
    if (!autoRotate || totalPages <= 1) return;
    const interval = setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % totalPages);
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRotate, totalPages]);

  const visibleJourneys = useMemo(() => {
    const start = currentPage * pageSize;
    return activeJourneys.slice(start, start + pageSize);
  }, [activeJourneys, currentPage, pageSize]);

  const visibleGroups = useMemo(() => {
    const start = currentPage * pageSize;
    return activeGroups.slice(start, start + pageSize);
  }, [activeGroups, currentPage, pageSize]);

  return (
    <div
      id="live-wallboard-view"
      className={`h-full w-full overflow-y-auto transition-all ${
        isTvMode
          ? 'fixed inset-0 z-50 bg-[#0B132B] p-4 sm:p-6 text-white'
          : 'p-4 sm:p-6 max-w-7xl mx-auto space-y-5'
      }`}
    >
      {/* Wallboard Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center shadow-lg shrink-0">
            <Tv className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black font-heading tracking-tight">
                TORRE DE MONITORAMENTO (NOC AO VIVO)
              </h1>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                TEMPO REAL
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Visão de CFTV comercial: monitore todas as conversas 1:1 e grupos de clientes simultaneamente.
            </p>
          </div>
        </div>

        {/* Target Switcher (Conversas vs Grupos) & Controls */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Target Toggle */}
          <div className={`flex items-center gap-1 p-1 rounded-xl border text-xs ${
            isTvMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}>
            <button
              onClick={() => { setCurrentTarget('conversations'); setCurrentPage(0); }}
              className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                currentTarget === 'conversations'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Conversas 1:1 ({journeys.length})</span>
            </button>

            <button
              onClick={() => { setCurrentTarget('groups'); setCurrentPage(0); }}
              className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                currentTarget === 'groups'
                  ? 'bg-purple-600 text-white shadow-2xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Grupos ({groups.length})</span>
            </button>
          </div>

          {/* Quick Filters */}
          <div className={`flex items-center gap-1 p-1 rounded-xl border text-xs ${
            isTvMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}>
            <button
              onClick={() => { setFilterType('all'); setCurrentPage(0); }}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                filterType === 'all'
                  ? 'bg-slate-700 text-white shadow-2xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => { setFilterType('pending'); setCurrentPage(0); }}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                filterType === 'pending'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ⚠️ Atenção
            </button>
          </div>

          {/* Auto Rotate Button */}
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-2 rounded-xl border text-xs font-bold transition-colors flex items-center gap-1 ${
              autoRotate
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
            title="Rotação Automática de Lotes (Modo TV)"
          >
            {autoRotate ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            <span className="hidden md:inline">15s</span>
          </button>

          {/* Fullscreen / TV Toggle */}
          <button
            onClick={() => setIsTvMode(!isTvMode)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black rounded-xl shadow-lg transition-all"
          >
            {isTvMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span>{isTvMode ? 'Sair do Modo TV' : 'Espelhar em TV / Telão'}</span>
          </button>
        </div>
      </div>

      {/* Pagination indicators if multiple pages */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-400 py-1">
          <span>
            Exibindo página {currentPage + 1} de {totalPages} ({itemsCount} {currentTarget === 'conversas' ? 'conversas' : 'grupos'} no radar)
          </span>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }).map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentPage(idx)}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  currentPage === idx ? 'bg-emerald-400 w-6' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Grid Rendering */}
      {currentTarget === 'conversations' ? (
        visibleJourneys.length === 0 ? (
          <div className="text-center py-20 text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
            Nenhuma conversa ativa no radar para os filtros selecionados.
          </div>
        ) : (
          <div className={`grid gap-4 ${
            isTvMode
              ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 auto-rows-fr'
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
          }`}>
            {visibleJourneys.map((journey) => (
              <MicroConversationCard
                key={journey.id}
                journey={journey}
                onOpen={() => onGoToCockpit?.(journey)}
                isTvMode={isTvMode}
              />
            ))}
          </div>
        )
      ) : (
        visibleGroups.length === 0 ? (
          <div className="text-center py-20 text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
            Nenhum grupo ativo no radar para os filtros selecionados.
          </div>
        ) : (
          <div className={`grid gap-4 ${
            isTvMode
              ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 auto-rows-fr'
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
          }`}>
            {visibleGroups.map((group) => (
              <MicroGroupCard
                key={group.id}
                group={group}
                onOpen={() => onOpenGroup?.(group.id)}
                isTvMode={isTvMode}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
};
