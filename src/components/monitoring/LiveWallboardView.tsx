import React, { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { Journey } from '../../types/cockpit';
import { WhatsAppGroup } from '../../types/groupsAndEngines';
import { authenticatedFetch } from '../../services/authenticatedFetch';
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
  LayoutGrid,
  Rows3,
  Columns4,
  Grid3X3,
  CheckCheck,
} from 'lucide-react';

interface LiveWallboardViewProps {
  journeys?: Journey[];
  groups?: WhatsAppGroup[];
  workspaceId: string;
  mode?: 'conversations' | 'groups';
  onGoToCockpit?: (journey: Journey) => void;
  onOpenGroup?: (groupId: string) => void;
}

// A Torre TV só pode exibir fatos presentes na jornada. Inferências e textos
// promocionais fabricados aqui seriam indistinguíveis de dados operacionais.
function detectTvIntent(journey: Journey) {
  return {
    service: (journey as any).primaryServiceOrProduct || 'Atendimento comercial',
    badgeClass: 'bg-[var(--sos-border)]/30 text-[var(--sos-muted)] border-[var(--sos-border)]',
    leadMsg: journey.lastLeadMessage || 'Sem mensagem recente registrada',
    botMsg: journey.recommendation?.draftText || 'Sem sugestão disponível',
  };
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
  const isCritical = journey.slaStatus === 'critical';

  const leadName = journey.leadName || (journey as any).contact?.name || 'Cliente';
  const leadPhone = journey.leadPhone || (journey as any).phoneE164 || (journey as any).contact?.phone || '';
  const slaMinutes = journey.slaMinutesRemaining ?? 15;
  const lastActivity = journey.lastActivityAt ? 'Hoje' : 'Agora';

  const intent = detectTvIntent(journey);

  return (
    <div
      className={`rounded-xl transition-all flex flex-col justify-between overflow-hidden shadow-sm border ${
        isTvMode
          ? 'bg-[var(--sos-surface)] border-[var(--sos-border)] text-[var(--sos-ink)] hover:border-[var(--sos-action)]'
          : 'bg-[var(--sos-surface)] border-[var(--sos-border)] text-[var(--sos-ink)] hover:border-[var(--sos-action)] hover:shadow-md'
      }`}
      style={{ minHeight: '180px' }}
    >
      {/* Card Header */}
      <div className={`p-2 border-b flex items-center justify-between gap-2 ${
        isTvMode ? 'bg-[var(--sos-border)]/30 border-[var(--sos-border)]' : 'bg-[var(--sos-border)]/30 border-[var(--sos-border)]'
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
            isTvMode ? 'bg-[var(--sos-border)] text-[var(--sos-ink)]' : 'bg-[var(--sos-border)] text-[var(--sos-ink)]'
          }`}>
            {leadName.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h4 className="font-bold text-xs truncate font-heading">{leadName}</h4>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--sos-success)] shrink-0" title="Online" />
            </div>
            {leadPhone && <p className="text-[9px] text-[var(--sos-muted)] font-mono truncate">{leadPhone}</p>}
          </div>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-1 shrink-0">
          {isAiActive ? (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] border border-[var(--sos-ai)]/30 flex items-center gap-1">
              <Bot className="w-2.5 h-2.5" />
              <span>IA Ativa</span>
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[var(--sos-warning-subtle)] text-[var(--sos-warning)] border border-[var(--sos-warning)]/30 flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5" />
              <span>Fila Operador</span>
            </span>
          )}

          <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
            isCritical
              ? 'bg-[var(--sos-danger-subtle)] text-[var(--sos-danger)] border border-[var(--sos-danger)]/30'
              : 'bg-[var(--sos-border)]/30 text-[var(--sos-muted)] border border-[var(--sos-border)]'
          }`}>
            {slaMinutes}m
          </span>
        </div>
      </div>

      {/* Tag de Serviço Específico */}
      <div className="px-2 pt-1.5">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-extrabold border truncate max-w-full ${intent.badgeClass}`}>
          {intent.service}
        </span>
      </div>

      {/* Mini Chat Stream com Intenção e Resposta Real */}
      <div className="p-2 flex-1 flex flex-col justify-end space-y-1.5 overflow-hidden text-xs">
        {/* Mensagem Cliente */}
        <div className="flex flex-col items-start">
          <div className="flex items-center gap-1 mb-0.5 text-[8px] text-[var(--sos-muted)]">
            Cliente · {lastActivity}
          </div>
          <div
            className={`px-2 py-1 rounded-lg text-[10px] leading-snug max-w-[95%] line-clamp-2 ${
              isTvMode
                ? 'bg-[var(--sos-border)]/30 text-[var(--sos-ink)] rounded-tl-none border border-[var(--sos-border)]'
                : 'bg-[var(--sos-border)]/30 text-[var(--sos-ink)] rounded-tl-none'
            }`}
          >
            {intent.leadMsg}
          </div>
        </div>

        {/* Resposta da IA / Atendente */}
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-1 mb-0.5 text-[8px] text-[var(--sos-muted)]">
            {isAiActive ? '🤖 IA Copilot' : '👤 Atendente'} · Agora
          </div>
          <div
            className={`px-2 py-1 rounded-lg text-[10px] leading-snug max-w-[95%] line-clamp-2 ${
              isAiActive
                ? isTvMode
                  ? 'bg-[var(--sos-ai-subtle)]/60 text-[var(--sos-ai)] rounded-tr-none border border-[var(--sos-ai)]/30'
                  : 'bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] rounded-tr-none border border-[var(--sos-ai)]/30'
                : 'bg-[var(--sos-success-subtle)]/30 text-[var(--sos-success)] rounded-tr-none border border-[var(--sos-success)]/30'
            }`}
          >
            {intent.botMsg}
          </div>
        </div>
      </div>

      {/* Card Footer */}
      <div className={`p-2 px-2.5 border-t flex items-center justify-between gap-1.5 text-[10px] ${
        isTvMode ? 'bg-[var(--sos-border)]/30 border-[var(--sos-border)]' : 'bg-[var(--sos-border)]/30 border-[var(--sos-border)]'
      }`}>
        <div className="flex items-center gap-1.5 text-[var(--sos-muted)] truncate">
          <span className="truncate uppercase font-extrabold text-[8.5px]">
            🎯 {journey.stage ? journey.stage.replace('_', ' ') : 'Novo Lead'}
          </span>
        </div>

        {onOpen && (
          <button
            onClick={onOpen}
            className="px-2 py-0.75 text-[9.5px] font-extrabold text-white bg-[var(--sos-success)] hover:bg-[var(--sos-success)]/90 rounded-md transition-all flex items-center gap-1 shadow-2xs shrink-0 cursor-pointer"
          >
            <span>Assumir</span>
            <ArrowRight className="w-2.5 h-2.5" />
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
      className={`rounded-xl transition-all flex flex-col justify-between overflow-hidden shadow-sm border ${
        isTvMode
          ? 'bg-[var(--sos-surface)] border-[var(--sos-border)] text-[var(--sos-ink)] hover:border-[var(--sos-action)]'
          : 'bg-[var(--sos-surface)] border-[var(--sos-border)] text-[var(--sos-ink)] hover:border-[var(--sos-action)] hover:shadow-md'
      }`}
      style={{ minHeight: '180px' }}
    >
      {/* Group Card Header */}
      <div className={`p-2 border-b flex items-center justify-between gap-2 ${
        isTvMode ? 'bg-[var(--sos-border)]/30 border-[var(--sos-border)]' : 'bg-[var(--sos-border)]/30 border-[var(--sos-border)]'
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
            isTvMode ? 'bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] border border-[var(--sos-ai)]/30' : 'bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)]'
          }`}>
            <Users className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-xs truncate leading-tight font-heading">{group.name}</h4>
            <div className="flex items-center gap-1.5 text-[9px] text-[var(--sos-muted)] truncate">
              <span className="font-medium">{group.clientName}</span>
              <span>·</span>
              <span className="font-mono">{group.participantCount} membros</span>
            </div>
          </div>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-1 shrink-0">
          {isActionPending ? (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[var(--sos-warning-subtle)] text-[var(--sos-warning)] border border-[var(--sos-warning)]/30 flex items-center gap-1 animate-pulse">
              <AlertTriangle className="w-2.5 h-2.5" />
              <span>Atenção</span>
            </span>
          ) : isIdle ? (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[var(--sos-border)]/30 text-[var(--sos-muted)] border border-[var(--sos-border)]">
              Silencioso
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[var(--sos-success-subtle)] text-[var(--sos-success)] border border-[var(--sos-success)]/30 flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5" />
              <span>Saudável</span>
            </span>
          )}

          {group.unreadCount > 0 && (
            <span className="w-4.5 h-4.5 rounded-full bg-[var(--sos-danger)] text-white font-bold text-[9px] flex items-center justify-center shrink-0">
              {group.unreadCount}
            </span>
          )}
        </div>
      </div>

      {/* Mini Group Chat Stream */}
      <div className="p-2 flex-1 flex flex-col justify-end space-y-1.5 overflow-hidden text-xs">
        <div className="flex flex-col items-start">
          <div className="flex items-center gap-1 mb-0.5 text-[8px] text-[var(--sos-muted)]">
            {group.lastMessage?.sender || 'Participante'} · {group.lastMessage?.timestamp || 'Hoje'}
          </div>
          <div
            className={`px-2 py-1 rounded-lg text-[10px] leading-snug max-w-[95%] line-clamp-2 ${
              isTvMode
                ? 'bg-[var(--sos-border)]/30 text-[var(--sos-ink)] rounded-tl-none border border-[var(--sos-border)]'
                : 'bg-[var(--sos-border)]/30 text-[var(--sos-ink)] rounded-tl-none'
            }`}
          >
            {group.lastMessage?.text || 'Novas atualizações da equipe no grupo de atendimento'}
          </div>
        </div>

        {group.notes && (
          <div className="p-1.5 rounded-lg bg-[var(--sos-ai-subtle)]/50 border border-[var(--sos-ai)]/30 text-[9px] text-[var(--sos-ai)] line-clamp-2">
            <span className="font-bold">🤖 Resumo IA:</span> {group.notes}
          </div>
        )}
      </div>

      {/* Group Card Footer */}
      <div className={`p-2 px-2.5 border-t flex items-center justify-between gap-1.5 text-[10px] ${
        isTvMode ? 'bg-[var(--sos-border)]/30 border-[var(--sos-border)]' : 'bg-[var(--sos-border)]/30 border-[var(--sos-border)]'
      }`}>
        <div className="flex items-center gap-1.5 text-[var(--sos-muted)] text-[9px]">
          <span className="px-1.5 py-0.5 rounded bg-[var(--sos-border)] text-[var(--sos-muted)] font-mono font-bold uppercase">
            {group.engine}
          </span>
          <span className="truncate">#{group.category}</span>
        </div>

        {onOpen && (
          <button
            onClick={onOpen}
            className="px-2 py-0.75 text-[9.5px] font-extrabold text-white bg-[var(--sos-ai)] hover:bg-[var(--sos-ai)]/90 rounded-md transition-all flex items-center gap-1 shadow-2xs shrink-0 cursor-pointer"
          >
            <span>Abrir Grupo</span>
            <ArrowRight className="w-2.5 h-2.5" />
          </button>
        )}
      </div>
    </div>
  );
});

export const LiveWallboardView: React.FC<LiveWallboardViewProps> = ({
  journeys = [],
  groups: initialGroups = [],
  workspaceId,
  mode = 'conversations',
  onGoToCockpit,
  onOpenGroup,
}) => {
  const [currentTarget, setCurrentTarget] = useState<'conversations' | 'groups'>(mode);
  const [isTvMode, setIsTvMode] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'ai' | 'pending' | 'critical'>('all');
  const [density, setDensity] = useState<'3cols' | '4cols' | '2cols' | 'list'>('3cols');
  const [scrollMode, setScrollMode] = useState<'continuous' | 'paginated'>('continuous');
  const [autoRotate, setAutoRotate] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [groups, setGroups] = useState<WhatsAppGroup[]>(initialGroups);

  // Auto-fetch groups if empty
  useEffect(() => {
    if (groups.length > 0) return;
    const fetchGroupsData = async () => {
      try {
        const res = await authenticatedFetch(`/api/v1/workspaces/${workspaceId}/groups`);
        if (!res.ok) return;
        const data = await res.json();
        if (data && Array.isArray(data.groups) && data.groups.length > 0) {
          setGroups(data.groups);
        }
      } catch {
        // silent fallback
      }
    };
    void fetchGroupsData();
  }, [workspaceId, groups.length]);

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

  // Auto-rotation timer for Paginated TV Mode
  useEffect(() => {
    if (scrollMode !== 'paginated' || !autoRotate || totalPages <= 1) return;
    const interval = setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % totalPages);
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRotate, totalPages, scrollMode]);

  const displayedJourneys = useMemo(() => {
    if (scrollMode === 'continuous') return activeJourneys;
    const start = currentPage * pageSize;
    return activeJourneys.slice(start, start + pageSize);
  }, [activeJourneys, currentPage, pageSize, scrollMode]);

  const displayedGroups = useMemo(() => {
    if (scrollMode === 'continuous') return activeGroups;
    const start = currentPage * pageSize;
    return activeGroups.slice(start, start + pageSize);
  }, [activeGroups, currentPage, pageSize, scrollMode]);

  const gridColsClass = useMemo(() => {
    if (density === 'list') return 'grid-cols-1';
    if (density === '2cols') return 'grid-cols-1 md:grid-cols-2';
    if (density === '4cols') return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
  }, [density]);

  return (
    <div
      id="live-wallboard-view"
      className={`h-full w-full overflow-y-auto transition-all ${
        isTvMode
          ? 'fixed inset-0 z-50 bg-[var(--sos-canvas)] p-2 sm:p-4 text-[var(--sos-ink)]'
          : 'p-2 sm:p-4 w-full space-y-3'
      }`}
    >
      {/* Wallboard Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pb-2.5 border-b border-[var(--sos-border)] shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[var(--sos-action)]/10 text-[var(--sos-action)] flex items-center justify-center shrink-0">
            <Tv className="w-4.5 h-4.5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm sm:text-base font-black font-heading tracking-tight">
                TORRE DE MONITORAMENTO (NOC AO VIVO)
              </h1>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--sos-success)] animate-ping" />
              <span className="text-[8.5px] font-extrabold px-1.5 py-0.2 rounded-full bg-[var(--sos-success-subtle)] text-[var(--sos-success)] border border-[var(--sos-success)]/30">
                TEMPO REAL
              </span>
            </div>
            <p className="text-[10px] text-[var(--sos-muted)]">
              Supervisão de conversas 1:1 e grupos simultaneamente com scroll contínuo e dados reais.
            </p>
          </div>
        </div>

        {/* Controles & Seletor de Densidade */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Target Toggle */}
          <div className={`flex items-center gap-1 p-1 rounded-xl border text-xs ${
            isTvMode ? 'bg-[var(--sos-surface)] border-[var(--sos-border)]' : 'bg-[var(--sos-surface)] border-[var(--sos-border)]'
          }`}>
            <button
              onClick={() => { setCurrentTarget('conversations'); setCurrentPage(0); }}
              className={`px-2.5 py-0.75 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                currentTarget === 'conversations'
                  ? 'bg-[var(--sos-success)] text-white shadow-2xs'
                  : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)]'
              }`}
            >
              <MessageSquare className="w-3 h-3" />
              <span>Conversas ({journeys.length})</span>
            </button>

            <button
              onClick={() => { setCurrentTarget('groups'); setCurrentPage(0); }}
              className={`px-2.5 py-0.75 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                currentTarget === 'groups'
                  ? 'bg-[var(--sos-ai)] text-white shadow-2xs'
                  : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)]'
              }`}
            >
              <Users className="w-3 h-3" />
              <span>Grupos ({groups.length})</span>
            </button>
          </div>

          {/* Seletor de Densidade de Cards na Tela */}
          <div className={`flex items-center gap-1 p-1 rounded-xl border text-xs ${
            isTvMode ? 'bg-[var(--sos-surface)] border-[var(--sos-border)]' : 'bg-[var(--sos-surface)] border-[var(--sos-border)]'
          }`}>
            <button
              onClick={() => setDensity('2cols')}
              className={`p-1 rounded-lg transition-all cursor-pointer ${
                density === '2cols' ? 'bg-[var(--sos-action)] text-white' : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)]'
              }`}
              title="2 colunas (Expandido)"
            >
              <Rows3 className="w-3 h-3" />
            </button>
            <button
              onClick={() => setDensity('3cols')}
              className={`p-1 rounded-lg transition-all cursor-pointer ${
                density === '3cols' ? 'bg-[var(--sos-action)] text-white' : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)]'
              }`}
              title="3 colunas (Padrão)"
            >
              <Grid3X3 className="w-3 h-3" />
            </button>
            <button
              onClick={() => setDensity('4cols')}
              className={`p-1 rounded-lg transition-all cursor-pointer ${
                density === '4cols' ? 'bg-[var(--sos-action)] text-white' : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)]'
              }`}
              title="4 colunas (Compacto)"
            >
              <Columns4 className="w-3 h-3" />
            </button>
          </div>

          {/* Scroll Contínuo vs Slides */}
          <button
            onClick={() => setScrollMode(scrollMode === 'continuous' ? 'paginated' : 'continuous')}
            className={`px-2 py-0.75 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
              scrollMode === 'continuous'
                ? 'bg-[var(--sos-surface)] text-[var(--sos-ink)] border-[var(--sos-border)]'
                : 'bg-[var(--sos-action)] text-white border-[var(--sos-action)]'
            }`}
          >
            {scrollMode === 'continuous' ? '📜 Rolagem Livre' : '📺 Modo Slides'}
          </button>

          {/* Fullscreen / TV Toggle */}
          <button
            onClick={() => setIsTvMode(!isTvMode)}
            className="flex items-center gap-1 px-2.5 py-0.75 bg-[var(--sos-action)] hover:bg-[var(--sos-action)]/90 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
          >
            {isTvMode ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            <span>{isTvMode ? 'Sair TV' : 'Modo Telão'}</span>
          </button>
        </div>
      </div>

      {/* Grid de Cards da Torre com Rolagem Contínua e Responsiva */}
      {currentTarget === 'conversations' ? (
        displayedJourneys.length === 0 ? (
          <div className="text-center py-12 text-[var(--sos-muted)] text-xs border border-dashed border-[var(--sos-border)] rounded-xl">
            Nenhuma conversa ativa no radar para os filtros selecionados.
          </div>
        ) : (
          <div className={`grid gap-2.5 ${gridColsClass}`}>
            {displayedJourneys.map((journey) => (
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
        displayedGroups.length === 0 ? (
          <div className="text-center py-12 text-[var(--sos-muted)] text-xs border border-dashed border-[var(--sos-border)] rounded-xl">
            Nenhum grupo ativo no radar para os filtros selecionados.
          </div>
        ) : (
          <div className={`grid gap-2.5 ${gridColsClass}`}>
            {displayedGroups.map((group) => (
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
