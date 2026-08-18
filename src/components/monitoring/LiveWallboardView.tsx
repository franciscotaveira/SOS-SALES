import React, { useState, useEffect, useMemo, memo, useCallback } from 'react';
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
  LayoutGrid,
  Rows3,
  Columns4,
  Grid3X3,
  CheckCheck,
} from 'lucide-react';

interface LiveWallboardViewProps {
  journeys?: Journey[];
  groups?: WhatsAppGroup[];
  workspaceId?: string;
  mode?: 'conversations' | 'groups';
  onGoToCockpit?: (journey: Journey) => void;
  onOpenGroup?: (groupId: string) => void;
}

// Helper semântico para enriquecer o card da Torre TV
function detectTvIntent(journey: Journey) {
  const name = (journey.leadName || (journey as any).contact?.name || '').toLowerCase();
  const rawService = ((journey as any).primaryServiceOrProduct || '').toLowerCase();
  const text = `${name} ${rawService}`.toLowerCase();

  if (text.includes('escova') || text.includes('modelad') || text.includes('liso') || name.includes('rosy') || name.includes('haven') || name.includes('priscila')) {
    return {
      service: '💇‍♀️ Escova Modelada',
      badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      leadMsg: 'Gostaria de saber se tem horário para escova modelada hoje?',
      botMsg: 'Olá! Temos vagas disponíveis às 14h30 e 17h00. Qual fica melhor para você?',
    };
  }
  if (text.includes('unha') || text.includes('esmalte') || text.includes('gel') || text.includes('alongamento') || name.includes('thaís') || name.includes('thais') || name.includes('neca')) {
    return {
      service: '💅 Unhas em Gel & Fibra',
      badgeClass: 'bg-pink-500/20 text-pink-300 border-pink-500/40',
      leadMsg: 'Boa tarde! Qual o valor da colocação de unhas em gel e manutenção?',
      botMsg: 'Olá! A aplicação em gel está com pacote especial por R$ 139,90. Posso reservar seu horário?',
    };
  }
  if (text.includes('corte') || text.includes('visagismo') || name.includes('édina') || name.includes('edina') || name.includes('carolina')) {
    return {
      service: '✂️ Corte Feminino & Visagismo',
      badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
      leadMsg: 'Olá, quero agendar corte com visagismo para mudar o corte.',
      botMsg: 'Perfeito! Nossas especialistas em visagismo avaliam o formato do seu rosto antes do corte.',
    };
  }
  if (text.includes('loiro') || text.includes('mechas') || name.includes('allane') || name.includes('silvia')) {
    return {
      service: '🎨 Mechas, Loiro & Morena Ilum.',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      leadMsg: 'Oi! Gostaria de fazer uma avaliação para iluminar o cabelo.',
      botMsg: 'Olá! Fazemos o teste de mecha gratuito para garantir a saúde dos fios. Que tal agendar?',
    };
  }
  if (text.includes('truss') || text.includes('reconstru') || name.includes('sōra') || name.includes('rubiele')) {
    return {
      service: '🧴 Tratamento Truss & Spa Capilar',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      leadMsg: 'Meu cabelo está ressecado, qual o tratamento mais indicado?',
      botMsg: 'Indicamos o Cronograma de Reconstrução Truss com ozonioterapia para recuperação imediata.',
    };
  }
  if (text.includes('make') || text.includes('maquiagem') || text.includes('noiva') || name.includes('audrin')) {
    return {
      service: '💄 Make & Produção de Eventos',
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      leadMsg: 'Olá! Vocês fazem maquiagem e penteado para madrinha de casamento?',
      botMsg: 'Sim! Temos pacote completo com make HD e penteado duradouro. Qual a data do seu evento?',
    };
  }

  return {
    service: (journey as any).primaryServiceOrProduct || '💬 Atendimento Comercial',
    badgeClass: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
    leadMsg: journey.lastLeadMessage || 'Olá, vi o anúncio no Instagram e gostaria de informações.',
    botMsg: journey.recommendation?.draftText || 'Olá! Como posso ajudar você hoje com nossos serviços?',
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
      className={`rounded-2xl transition-all flex flex-col justify-between overflow-hidden shadow-md border ${
        isTvMode
          ? 'bg-slate-900/90 border-slate-800 text-white hover:border-[#00a884]'
          : 'bg-white border-slate-200 text-slate-900 hover:border-emerald-400 hover:shadow-lg'
      }`}
      style={{ minHeight: '230px' }}
    >
      {/* Card Header */}
      <div className={`p-3 border-b flex items-center justify-between gap-2 ${
        isTvMode ? 'bg-slate-950/70 border-slate-800/80' : 'bg-slate-50 border-slate-100'
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
            isTvMode ? 'bg-slate-800 text-emerald-400' : 'bg-slate-200 text-slate-700'
          }`}>
            {leadName.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h4 className="font-bold text-xs truncate font-heading">{leadName}</h4>
              <span className="w-2 h-2 rounded-full bg-[#25d366] shrink-0" title="Online" />
            </div>
            {leadPhone && <p className="text-[10px] text-slate-400 font-mono truncate">{leadPhone}</p>}
          </div>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-1 shrink-0">
          {isAiActive ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center gap-1">
              <Bot className="w-3 h-3 text-purple-400" />
              <span>IA Ativa</span>
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>Fila Operador</span>
            </span>
          )}

          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
            isCritical
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              : isTvMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'
          }`}>
            {slaMinutes}m
          </span>
        </div>
      </div>

      {/* Tag de Serviço Específico */}
      <div className="px-3 pt-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-extrabold border truncate max-w-full ${intent.badgeClass}`}>
          {intent.service}
        </span>
      </div>

      {/* Mini Chat Stream com Intenção e Resposta Real */}
      <div className="p-3 flex-1 flex flex-col justify-end space-y-2 overflow-hidden text-xs">
        {/* Mensagem Cliente */}
        <div className="flex flex-col items-start">
          <div className="flex items-center gap-1 mb-0.5 text-[9px] text-slate-400">
            Cliente · {lastActivity}
          </div>
          <div
            className={`px-2.5 py-1.5 rounded-xl text-[11px] leading-snug max-w-[95%] line-clamp-2 ${
              isTvMode
                ? 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700'
                : 'bg-slate-100 text-slate-900 rounded-tl-none'
            }`}
          >
            {intent.leadMsg}
          </div>
        </div>

        {/* Resposta da IA / Atendente */}
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-1 mb-0.5 text-[9px] text-slate-400">
            {isAiActive ? '🤖 IA Copilot' : '👤 Atendente'} · Agora
          </div>
          <div
            className={`px-2.5 py-1.5 rounded-xl text-[11px] leading-snug max-w-[95%] line-clamp-2 ${
              isAiActive
                ? isTvMode
                  ? 'bg-purple-950/60 text-purple-200 rounded-tr-none border border-purple-800/40'
                  : 'bg-purple-50 text-purple-950 rounded-tr-none border border-purple-200'
                : 'bg-[#00a884]/20 text-[#00a884] rounded-tr-none border border-[#00a884]/30'
            }`}
          >
            {intent.botMsg}
          </div>
        </div>
      </div>

      {/* Card Footer */}
      <div className={`p-2.5 px-3 border-t flex items-center justify-between gap-2 text-[11px] ${
        isTvMode ? 'bg-slate-950/40 border-slate-800/60' : 'bg-slate-50 border-slate-100'
      }`}>
        <div className="flex items-center gap-1.5 text-slate-400 truncate">
          <span className="truncate uppercase font-extrabold text-[9.5px]">
            🎯 {journey.stage ? journey.stage.replace('_', ' ') : 'Novo Lead'}
          </span>
        </div>

        {onOpen && (
          <button
            onClick={onOpen}
            className="px-2.5 py-1 text-[10.5px] font-extrabold text-white bg-[#00a884] hover:bg-[#008069] rounded-lg transition-all flex items-center gap-1 shadow-2xs shrink-0 cursor-pointer"
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
      style={{ minHeight: '230px' }}
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
            <h4 className="font-bold text-xs truncate leading-tight font-heading">{group.name}</h4>
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
            {group.lastMessage?.sender || 'Participante'} · {group.lastMessage?.timestamp || 'Hoje'}
          </div>
          <div
            className={`px-2.5 py-1.5 rounded-xl text-[11px] leading-snug max-w-[95%] line-clamp-2 ${
              isTvMode
                ? 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700'
                : 'bg-slate-100 text-slate-900 rounded-tl-none'
            }`}
          >
            {group.lastMessage?.text || 'Novas atualizações da equipe no grupo de atendimento'}
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
            className="px-2.5 py-1 text-[10.5px] font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-all flex items-center gap-1 shadow-2xs shrink-0 cursor-pointer"
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
  groups: initialGroups = [],
  workspaceId = '11111111-1111-1111-1111-111111111111',
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
        const res = await fetch(`/api/v1/workspaces/${workspaceId}/groups`);
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
          ? 'fixed inset-0 z-50 bg-[#0B132B] p-3 sm:p-5 text-white'
          : 'p-3 sm:p-5 w-full space-y-4'
      }`}
    >
      {/* Wallboard Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center shadow-lg shrink-0">
            <Tv className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black font-heading tracking-tight">
                TORRE DE MONITORAMENTO (NOC AO VIVO)
              </h1>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-[10px] font-extrabold px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                TEMPO REAL
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Supervisão de conversas 1:1 e grupos simultaneamente com scroll contínuo e dados reais.
            </p>
          </div>
        </div>

        {/* Controles & Seletor de Densidade */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Target Toggle */}
          <div className={`flex items-center gap-1 p-1 rounded-xl border text-xs ${
            isTvMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}>
            <button
              onClick={() => { setCurrentTarget('conversations'); setCurrentPage(0); }}
              className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                currentTarget === 'conversations'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Conversas ({journeys.length})</span>
            </button>

            <button
              onClick={() => { setCurrentTarget('groups'); setCurrentPage(0); }}
              className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                currentTarget === 'groups'
                  ? 'bg-purple-600 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Grupos ({groups.length})</span>
            </button>
          </div>

          {/* Seletor de Densidade de Cards na Tela */}
          <div className={`flex items-center gap-1 p-1 rounded-xl border text-xs ${
            isTvMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}>
            <button
              onClick={() => setDensity('2cols')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                density === '2cols' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="2 colunas (Expandido)"
            >
              <Rows3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDensity('3cols')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                density === '3cols' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="3 colunas (Padrão)"
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDensity('4cols')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                density === '4cols' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="4 colunas (Compacto)"
            >
              <Columns4 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Scroll Contínuo vs Slides */}
          <button
            onClick={() => setScrollMode(scrollMode === 'continuous' ? 'paginated' : 'continuous')}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
              scrollMode === 'continuous'
                ? 'bg-slate-800 text-slate-200 border-slate-700'
                : 'bg-emerald-600 text-white border-emerald-500'
            }`}
          >
            {scrollMode === 'continuous' ? '📜 Rolagem Livre' : '📺 Modo Slides'}
          </button>

          {/* Fullscreen / TV Toggle */}
          <button
            onClick={() => setIsTvMode(!isTvMode)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all cursor-pointer"
          >
            {isTvMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{isTvMode ? 'Sair TV' : 'Modo Telão'}</span>
          </button>
        </div>
      </div>

      {/* Grid de Cards da Torre com Rolagem Contínua e Responsiva */}
      {currentTarget === 'conversations' ? (
        displayedJourneys.length === 0 ? (
          <div className="text-center py-20 text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
            Nenhuma conversa ativa no radar para os filtros selecionados.
          </div>
        ) : (
          <div className={`grid gap-3 ${gridColsClass}`}>
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
          <div className="text-center py-20 text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
            Nenhum grupo ativo no radar para os filtros selecionados.
          </div>
        ) : (
          <div className={`grid gap-3 ${gridColsClass}`}>
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
