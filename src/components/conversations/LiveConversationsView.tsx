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
  List,
  Columns3,
  FileText,
  Tv,
  CheckCheck,
  Tag,
  Calendar,
  Layers,
  ChevronDown,
  Plus,
} from 'lucide-react';
import { ApiJourney, SalesOsGateway } from '../../services/salesOsGateway';
import { getSupabaseClient } from '../../services/supabaseAuth';
import { Workspace, Journey } from '../../types/cockpit';
import { LiveCommercialKanbanView } from '../kanban/LiveCommercialKanbanView';
import { NotesView } from '../notes/NotesView';
import { LiveWallboardView } from '../monitoring/LiveWallboardView';
import { ContactAvatar } from '../cockpit/ContactAvatar';
import { StartConversationModal } from './StartConversationModal';
import { getWorkspaceCommercialConfig } from '../../services/workspaceCommercialConfig';

interface LiveConversationsViewProps {
  workspaceId: string;
  workspace?: Workspace;
  gateway: SalesOsGateway;
  onJourneySelect?: (journeyId: string) => void;
  onSwitchToCockpit?: () => void;
  initialViewMode?: 'list' | 'kanban' | 'notes' | 'wallboard';
}

// Helper semântico para detecção de interesse nos cards da lista adaptável ao nicho
function detectServiceAndIntent(item: ApiJourney, isHairSalon: boolean) {
  const name = (item.contactName || '').toLowerCase();
  const rawService = (item.primaryServiceOrProduct || '').toLowerCase();
  const text = `${name} ${rawService}`.toLowerCase();

  if (isHairSalon) {
    if (text.includes('escova') || text.includes('modelad') || text.includes('liso') || text.includes('chapinha') || text.includes('secagem') || text.includes('lavagem') || name.includes('rosy') || name.includes('haven') || name.includes('priscila')) {
      return {
        service: '💇‍♀️ Escova Modelada & Lavagem',
        badgeClass: 'bg-purple-100/90 text-purple-900 border-purple-200 font-extrabold',
        preview: 'Interesse em agendar Escova Express ou Modelada',
        category: 'escova',
      };
    }
    if (text.includes('unha') || text.includes('esmalte') || text.includes('gel') || text.includes('alongamento') || text.includes('fibra') || text.includes('manicure') || text.includes('pedicure') || name.includes('thaís') || name.includes('thais') || name.includes('neca')) {
      return {
        service: '💅 Esmaltação & Unhas em Gel',
        badgeClass: 'bg-pink-100/90 text-pink-900 border-pink-200 font-extrabold',
        preview: 'Interesse em Alongamento de Fibra ou Esmaltação em Gel',
        category: 'unhas',
      };
    }
    if (text.includes('corte') || text.includes('visagismo') || text.includes('pontas') || text.includes('franja') || name.includes('édina') || name.includes('edina') || name.includes('carolina')) {
      return {
        service: '✂️ Corte Feminino & Visagismo',
        badgeClass: 'bg-indigo-100/90 text-indigo-900 border-indigo-200 font-extrabold',
        preview: 'Interesse em Corte com Visagismo ou Repicado',
        category: 'corte',
      };
    }
    if (text.includes('loiro') || text.includes('mechas') || text.includes('luzes') || text.includes('morena') || text.includes('color') || text.includes('tinta') || name.includes('allane') || name.includes('silvia')) {
      return {
        service: '🎨 Mechas, Loiro & Morena Ilum.',
        badgeClass: 'bg-amber-100/90 text-amber-950 border-amber-300 font-extrabold',
        preview: 'Interesse em Avaliação para Mechas / Coloração',
        category: 'mechas',
      };
    }
    if (text.includes('truss') || text.includes('reconstru') || text.includes('hidrata') || text.includes('cronograma') || text.includes('ozonio') || text.includes('detox') || name.includes('sōra') || name.includes('sora') || name.includes('rubiele')) {
      return {
        service: '🧴 Tratamento Truss & Spa Capilar',
        badgeClass: 'bg-emerald-100/90 text-emerald-950 border-emerald-300 font-extrabold',
        preview: 'Interesse em Cronograma de Reconstrução Truss',
        category: 'tratamento',
      };
    }
    if (text.includes('make') || text.includes('maquiagem') || text.includes('penteado') || text.includes('noiva') || text.includes('casamento') || text.includes('festa') || name.includes('audrin')) {
      return {
        service: '💄 Make & Produção de Eventos',
        badgeClass: 'bg-rose-100/90 text-rose-950 border-rose-300 font-extrabold',
        preview: 'Interesse em Maquiagem e Penteado para Evento',
        category: 'make',
      };
    }
    if (text.includes('preço') || text.includes('valor') || text.includes('quanto') || text.includes('tabela') || name.includes('ju')) {
      return {
        service: '💰 Consulta de Valores & Tabela',
        badgeClass: 'bg-blue-100/90 text-blue-900 border-blue-200 font-extrabold',
        preview: 'Dúvida sobre Tabela de Valores e Pacotes',
        category: 'preco',
      };
    }
  }

  // Fallback baseado no cadastro de serviço real
  if (item.primaryServiceOrProduct && item.primaryServiceOrProduct !== 'Interessada em Serviços / Atendimento') {
    return {
      service: `✨ ${item.primaryServiceOrProduct}`,
      badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-200 font-bold',
      preview: item.primaryServiceOrProduct,
      category: 'outro',
    };
  }

  return {
    service: '💬 Atendimento Comercial',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-200 font-bold',
    preview: 'Lead aguardando resposta no WhatsApp',
    category: 'geral',
  };
}

export const LiveConversationsView: React.FC<LiveConversationsViewProps> = ({
  workspaceId,
  workspace,
  gateway,
  onJourneySelect,
  onSwitchToCockpit,
  initialViewMode = 'list',
}) => {
  const commercialConfig = useMemo(() => getWorkspaceCommercialConfig(workspaceId), [workspaceId]);
  const isHairSalon = (commercialConfig.businessType === 'hair_salon') || workspaceId.toLowerCase().includes('haven') || workspaceId.toLowerCase().includes('escovaria');

  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'notes' | 'wallboard'>(initialViewMode);
  const [journeys, setJourneys] = useState<ApiJourney[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);

  const fetchJourneys = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      if ('listJourneys' in gateway && typeof (gateway as any).listJourneys === 'function') {
        const res = await (gateway as any).listJourneys(workspaceId, { limit: 150 });
        setJourneys(res.data || []);
      } else {
        const rawJourneys = await gateway.getJourneys(workspaceId);
        const mapped: ApiJourney[] = rawJourneys.map((j) => ({
          id: j.id,
          contactId: j.id,
          contactName: j.leadName || null,
          contactPhone: j.leadPhone || (j as any).phoneE164 || null,
          status: 'OPEN',
          pipelineStage: j.stage || null,
          primaryServiceOrProduct: (j as any).primaryServiceOrProduct || null,
          startedAt: (j as any).createdAt || (j as any).lastActivityAt || new Date().toISOString(),
          updatedAt: (j as any).lastActivityAt || new Date().toISOString(),
        }));
        setJourneys(mapped);
      }
    } catch (err: any) {
      if (!silent) setError(err?.message || 'Erro ao carregar lista de conversas.');
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
        .channel(`live-conversations-${workspaceId}`)
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

  const filtered = useMemo(() => {
    return journeys.filter((j) => {
      const intent = detectServiceAndIntent(j, isHairSalon);

      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matches =
          (j.contactName && j.contactName.toLowerCase().includes(q)) ||
          (j.contactPhone && j.contactPhone.includes(q)) ||
          intent.service.toLowerCase().includes(q) ||
          intent.preview.toLowerCase().includes(q);
        if (!matches) return false;
      }

      // Stage Filter
      if (stageFilter !== 'all') {
        const st = (j.pipelineStage || 'LEAD').toUpperCase();
        if (stageFilter === 'LEAD' && st !== 'LEAD' && st !== 'NEW') return false;
        if (stageFilter === 'QUALIFICADO' && st !== 'QUALIFICADO' && st !== 'QUALIFIED') return false;
        if (stageFilter === 'PROPOSTA' && st !== 'PROPOSTA' && st !== 'PROPOSAL') return false;
        if (stageFilter === 'NEGOCIACAO' && st !== 'NEGOCIACAO' && st !== 'NEGOTIATION') return false;
        if (stageFilter === 'GANHO' && st !== 'GANHO' && st !== 'WON' && st !== 'SCHEDULED') return false;
      }

      // Service Filter
      if (serviceFilter !== 'all') {
        if (intent.category !== serviceFilter) return false;
      }

      return true;
    });
  }, [journeys, search, stageFilter, serviceFilter, isHairSalon]);

  // Map ApiJourney[] to Journey[] for LiveWallboardView if active
  const mappedJourneys: Journey[] = useMemo(() => {
    return journeys.map((j) => ({
      id: j.id,
      contact: {
        id: j.contactId || j.id,
        name: j.contactName || 'Lead Sem Nome',
        phone: j.contactPhone || '',
      },
      leadName: j.contactName || 'Lead Sem Nome',
      leadPhone: j.contactPhone || '',
      status: 'active',
      stage: j.pipelineStage || 'LEAD',
      currentStage: j.pipelineStage || 'LEAD',
      channel: 'whatsapp',
      health: 'healthy',
      slaStatus: 'on_track',
      messages: [],
      createdAt: j.startedAt,
      lastActivityAt: j.updatedAt,
      primaryServiceOrProduct: j.primaryServiceOrProduct,
    })) as any;
  }, [journeys]);

  const formatStage = (stage?: string | null) => {
    const st = stage?.toUpperCase();
    switch (st) {
      case 'NEW':
      case 'LEAD':
        return { label: '1. Novo Lead', bg: 'bg-blue-50 text-blue-800 border-blue-200' };
      case 'CONTACTED':
        return { label: '1. Em Contato', bg: 'bg-indigo-50 text-indigo-800 border-indigo-200' };
      case 'QUALIFIED':
      case 'QUALIFICADO':
        return { label: '2. Qualificado', bg: 'bg-purple-50 text-purple-800 border-purple-200' };
      case 'PROPOSAL':
      case 'PROPOSTA':
        return { label: '3. Proposta', bg: 'bg-amber-50 text-amber-800 border-amber-200' };
      case 'NEGOTIATION':
      case 'NEGOCIACAO':
        return { label: '4. Negociação', bg: 'bg-violet-50 text-violet-800 border-violet-200' };
      case 'WON':
      case 'GANHO':
        return { label: '5. Agendado (Ganho)', bg: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold' };
      case 'LOST':
      case 'PERDIDO':
        return { label: 'Perdido', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
      default:
        return { label: stage || '1. Novo Lead', bg: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 text-slate-900 p-3 sm:p-5 overflow-hidden w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-950 font-heading tracking-tight flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-600" /> Central de Conversas & Funil
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
              {filtered.length} {filtered.length === 1 ? 'Conversa' : 'Conversas'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Supervisão ao vivo, funil comercial, gestão de notas e torre de monitoramento.
          </p>
        </div>

        {/* 4-Way Mode Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-200/80 p-1 rounded-xl border border-slate-300/60 text-xs">
            <button
              id="switch-view-list-btn"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>

            <button
              id="switch-view-kanban-btn"
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>Funil Kanban</span>
            </button>

            <button
              id="switch-view-notes-btn"
              onClick={() => setViewMode('notes')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'notes'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Anotações</span>
            </button>

            <button
              id="switch-view-wallboard-btn"
              onClick={() => setViewMode('wallboard')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'wallboard'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-emerald-800'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Torre TV</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsStartModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer shrink-0"
            title="Iniciar Nova Conversa WhatsApp"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo Lead</span>
          </button>

          {viewMode === 'list' && (
            <button
              onClick={() => fetchJourneys()}
              disabled={loading}
              className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 transition-colors shadow-2xs cursor-pointer"
              title="Atualizar conversas"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Subviews */}
      {viewMode === 'kanban' && (
        <div className="flex-1 overflow-hidden mt-2">
          <LiveCommercialKanbanView
            workspaceId={workspaceId}
            gateway={gateway}
            onSelectJourney={onJourneySelect}
            onSwitchToCockpit={onSwitchToCockpit}
          />
        </div>
      )}

      {viewMode === 'notes' && (
        <div className="flex-1 overflow-hidden mt-2">
          <NotesView
            workspace={workspace || ({ id: workspaceId, name: 'Workspace', channels: [] } as any)}
            gateway={gateway}
          />
        </div>
      )}

      {viewMode === 'wallboard' && (
        <div className="flex-1 overflow-hidden mt-2">
          <LiveWallboardView
            journeys={mappedJourneys}
            groups={[]}
            mode="conversations"
            onGoToCockpit={(j) => {
              onJourneySelect?.(j.id);
              onSwitchToCockpit?.();
            }}
          />
        </div>
      )}

      {viewMode === 'list' && (
        <>
          {/* Barra de Filtros Ricos (TDAH-friendly: Alta Escaneabilidade) */}
          <div className="py-2.5 space-y-2 shrink-0">
            {/* Linha 1: Filtro por Etapa do Funil + Busca */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Etapa do Funil Chips */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {[
                  { id: 'all', label: `Todas (${journeys.length})` },
                  { id: 'LEAD', label: '1. Novos Leads' },
                  { id: 'QUALIFICADO', label: '2. Qualificados' },
                  { id: 'PROPOSTA', label: '3. Proposta' },
                  { id: 'NEGOCIACAO', label: '4. Negociação' },
                  { id: 'GANHO', label: '5. Agendados / Ganho' },
                ].map((chip) => (
                  <button
                    key={chip.id}
                    onClick={() => setStageFilter(chip.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                      stageFilter === chip.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Input de Busca */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar contato, serviço ou mensagem..."
                  className="pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00a884]/30 focus:border-[#00a884] transition-colors w-64 sm:w-72 shadow-2xs"
                />
              </div>
            </div>

            {/* Linha 2: Filtro por Serviço / Procedimento */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1 mr-1">
                <Tag size={12} /> Serviços:
              </span>
              {[
                { id: 'all', label: 'Todos os Serviços' },
                { id: 'escova', label: '💇‍♀️ Escovas' },
                { id: 'unhas', label: '💅 Unhas & Gel' },
                { id: 'corte', label: '✂️ Cortes & Visagismo' },
                { id: 'tratamento', label: '🧴 Tratamento Truss' },
                { id: 'mechas', label: '🎨 Mechas & Loiro' },
                { id: 'make', label: '💄 Make & Eventos' },
                { id: 'preco', label: '💰 Consulta Preço' },
              ].map((svc) => (
                <button
                  key={svc.id}
                  onClick={() => setServiceFilter(svc.id)}
                  className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    serviceFilter === svc.id
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {svc.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mb-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2 shrink-0">
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

          {/* Cards da Lista Ricos e Detalhados */}
          <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden flex flex-col min-h-0">
            <div className="overflow-y-auto flex-1 divide-y divide-slate-100 p-2 space-y-2">
              {loading ? (
                <div className="p-6 space-y-3">
                  <div className="h-16 bg-slate-100 rounded-2xl animate-pulse" />
                  <div className="h-16 bg-slate-100 rounded-2xl animate-pulse" />
                  <div className="h-16 bg-slate-100 rounded-2xl animate-pulse" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-slate-500">
                  <MessageSquare className="w-8 h-8 text-slate-400 mb-2" />
                  <span className="text-sm font-bold text-slate-800">Nenhuma conversa encontrada</span>
                  <span className="text-xs text-slate-500 mt-1">Tente ajustar os filtros de etapa, serviço ou busca.</span>
                </div>
              ) : (
                filtered.map((j) => {
                  const stage = formatStage(j.pipelineStage);
                  const intent = detectServiceAndIntent(j, isHairSalon);
                  const title = j.contactName || (j.contactPhone ? `Cliente ${j.contactPhone.slice(-4)}` : 'Lead Sem Nome');

                  // Format time
                  let timeFormatted = 'Hoje';
                  try {
                    const d = new Date(j.updatedAt || j.startedAt);
                    if (!isNaN(d.getTime())) {
                      timeFormatted = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    }
                  } catch {
                    timeFormatted = 'Agora';
                  }

                  return (
                    <div
                      key={j.id}
                      onClick={() => {
                        onJourneySelect?.(j.id);
                        onSwitchToCockpit?.();
                      }}
                      className="p-3 sm:p-3.5 rounded-xl border border-slate-200/90 hover:border-emerald-400 bg-white hover:bg-slate-50/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group shadow-2xs"
                    >
                      <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                        {/* Avatar */}
                        <div className="relative shrink-0 mt-0.5 sm:mt-0">
                          <ContactAvatar
                            name={j.contactName}
                            phone={j.contactPhone}
                            avatarUrl={(j as any)?.contactAvatar || (j as any)?.avatarUrl}
                            size="md"
                            showOnlineBadge={true}
                          />
                        </div>

                        {/* Conteúdo Rico do Card */}
                        <div className="min-w-0 flex-1 space-y-1">
                          {/* Linha 1: Nome + Origem + Horário */}
                          <div className="flex items-center justify-between sm:justify-start gap-2">
                            <span className="text-sm font-extrabold text-slate-900 group-hover:text-emerald-700 transition-colors truncate font-heading">
                              {title}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                              Click WA
                            </span>

                            <span className="text-[11px] font-mono text-slate-400 sm:ml-auto">
                              {timeFormatted}
                            </span>
                          </div>

                          {/* Linha 2: Badge de Serviço Específico */}
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border shadow-2xs font-bold truncate ${intent.badgeClass}`}>
                              {intent.service}
                            </span>
                            {j.contactPhone && (
                              <span className="hidden md:inline font-mono text-[11px] text-slate-400">
                                {j.contactPhone}
                              </span>
                            )}
                          </div>

                          {/* Linha 3: Prévia da Mensagem / Intenção Real */}
                          <div className="flex items-center gap-1.5 text-slate-600 text-xs">
                            <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb] shrink-0" />
                            <span className="truncate font-medium text-[11.5px] text-slate-600">
                              {intent.preview}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Lado Direito: Etapa do Funil + Botão de Ação */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${stage.bg} shrink-0`}>
                          {stage.label}
                        </span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onJourneySelect?.(j.id);
                            onSwitchToCockpit?.();
                          }}
                          className="px-3.5 py-1.5 bg-slate-900 group-hover:bg-emerald-600 text-white rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
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
        </>
      )}

      <StartConversationModal
        workspace={workspace || ({ id: workspaceId, name: 'Workspace Ativo', slug: 'active' } as any)}
        isOpen={isStartModalOpen}
        onClose={() => setIsStartModalOpen(false)}
        onConversationStarted={(newJourney) => {
          setIsStartModalOpen(false);
          const journeyId = newJourney?.id || newJourney?.journey_id;
          if (journeyId && onJourneySelect) {
            onJourneySelect(journeyId);
          }
          if (onSwitchToCockpit) {
            onSwitchToCockpit();
          }
        }}
      />
    </div>
  );
};
