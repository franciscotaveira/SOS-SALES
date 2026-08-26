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
    if (text.includes('escova') || text.includes('modelad') || text.includes('liso') || text.includes('chapinha') || text.includes('secagem') || text.includes('lavagem')) {
      return {
        service: '💇‍♀️ Escova Modelada & Lavagem',
        badgeClass: 'bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] border-[var(--sos-ai)]/30 font-extrabold',
        preview: 'Interesse em agendar Escova Express ou Modelada',
        category: 'escova',
      };
    }
    if (text.includes('unha') || text.includes('esmalte') || text.includes('gel') || text.includes('alongamento') || text.includes('fibra') || text.includes('manicure') || text.includes('pedicure')) {
      return {
        service: '💅 Esmaltação & Unhas em Gel',
        badgeClass: 'bg-[var(--sos-warning-subtle)] text-[var(--sos-warning)] border-[var(--sos-warning)]/30 font-extrabold',
        preview: 'Interesse em Alongamento de Fibra ou Esmaltação em Gel',
        category: 'unhas',
      };
    }
    if (text.includes('corte') || text.includes('visagismo') || text.includes('pontas') || text.includes('franja')) {
      return {
        service: '✂️ Corte Feminino & Visagismo',
        badgeClass: 'bg-[var(--sos-operational-subtle)] text-[var(--sos-operational)] border-[var(--sos-operational)]/30 font-extrabold',
        preview: 'Interesse em Corte com Visagismo ou Repicado',
        category: 'corte',
      };
    }
    if (text.includes('loiro') || text.includes('mechas') || text.includes('luzes') || text.includes('morena') || text.includes('color') || text.includes('tinta')) {
      return {
        service: '🎨 Mechas, Loiro & Morena Ilum.',
        badgeClass: 'bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] border-[var(--sos-ai)]/30 font-extrabold',
        preview: 'Interesse em Avaliação para Mechas / Coloração',
        category: 'mechas',
      };
    }
    if (text.includes('truss') || text.includes('reconstru') || text.includes('hidrata') || text.includes('cronograma') || text.includes('ozonio') || text.includes('detox') || text.includes('spa') || text.includes('terapia')) {
      return {
        service: '🧴 Tratamento Truss & Spa Capilar',
        badgeClass: 'bg-[var(--sos-success-subtle)] text-[var(--sos-success)] border-[var(--sos-success)]/30 font-extrabold',
        preview: 'Interesse em Cronograma de Reconstrução Truss / Spa',
        category: 'tratamento',
      };
    }
    if (text.includes('make') || text.includes('maquiagem') || text.includes('penteado') || text.includes('noiva') || text.includes('casamento') || text.includes('festa')) {
      return {
        service: '💄 Make & Produção de Eventos',
        badgeClass: 'bg-[var(--sos-warning-subtle)] text-[var(--sos-warning)] border-[var(--sos-warning)]/30 font-extrabold',
        preview: 'Interesse em Maquiagem e Penteado para Evento',
        category: 'make',
      };
    }
    if (text.includes('preço') || text.includes('valor') || text.includes('quanto') || text.includes('tabela')) {
      return {
        service: '💰 Consulta de Valores & Tabela',
        badgeClass: 'bg-[var(--sos-action-subtle)] text-[var(--sos-action)] border-[var(--sos-action)]/30 font-extrabold',
        preview: 'Dúvida sobre Tabela de Valores e Pacotes',
        category: 'preco',
      };
    }
  }

  // Fallback baseado no cadastro de serviço real
  if (item.primaryServiceOrProduct && item.primaryServiceOrProduct !== 'Interessada em Serviços / Atendimento') {
    return {
      service: `✨ ${item.primaryServiceOrProduct}`,
      badgeClass: 'bg-[var(--sos-operational-subtle)] text-[var(--sos-operational)] border-[var(--sos-operational)]/30 font-bold',
      preview: item.primaryServiceOrProduct,
      category: 'outro',
    };
  }

  return {
    service: '💬 Atendimento Comercial',
    badgeClass: 'bg-[var(--sos-border)]/30 text-[var(--sos-muted)] border-[var(--sos-border)] font-bold',
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

  useEffect(() => {
    if (initialViewMode) {
      setViewMode(initialViewMode);
    }
  }, [initialViewMode]);
  const [journeys, setJourneys] = useState<ApiJourney[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [customServices, setCustomServices] = useState<Array<{ id: string; label: string }>>(() => {
    try {
      const saved = localStorage.getItem(`sos_sales_custom_services_${workspaceId}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);

  const availableServiceCategories = useMemo(() => {
    if (customServices.length > 0) return customServices;
    if (isHairSalon) {
      return [
        { id: 'escova', label: '💇‍♀️ Escovas' },
        { id: 'unhas', label: '💅 Unhas & Gel' },
        { id: 'corte', label: '✂️ Cortes & Visagismo' },
        { id: 'tratamento', label: '🧴 Tratamento Truss' },
        { id: 'mechas', label: '🎨 Mechas & Loiro' },
        { id: 'make', label: '💄 Make & Eventos' },
        { id: 'preco', label: '💰 Consulta Preço' },
      ];
    }
    // Para empresas de outros segmentos, extrair das jornadas ativas
    const distinctServices = new Set<string>();
    journeys.forEach((j) => {
      if (j.primaryServiceOrProduct && j.primaryServiceOrProduct !== 'Interessada em Serviços / Atendimento') {
        distinctServices.add(j.primaryServiceOrProduct);
      }
    });

    if (distinctServices.size > 0) {
      return Array.from(distinctServices).slice(0, 8).map((s) => ({
        id: s.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        label: `✨ ${s}`,
      }));
    }

    return [
      { id: 'vendas', label: '💼 Vendas & Planos' },
      { id: 'orcamento', label: '💰 Orçamentos' },
      { id: 'duvidas', label: '❓ Dúvidas Gerais' },
      { id: 'suporte', label: '🛠️ Suporte & Pós-Venda' },
    ];
  }, [customServices, isHairSalon, journeys]);

  const handleCustomizeServices = () => {
    const currentListStr = availableServiceCategories.map((c) => c.label.replace(/^[^\w\s]+\s*/, '')).join(', ');
    const promptVal = window.prompt(
      'Defina as categorias/serviços da sua empresa separados por vírgula (ex: Vendas B2B, Consultoria, Orçamento, Suporte):',
      currentListStr
    );
    if (promptVal !== null) {
      const items = promptVal
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => ({
          id: s.toLowerCase().replace(/[^a-z0-9]/g, '_'),
          label: `✨ ${s}`,
        }));
      setCustomServices(items);
      try {
        localStorage.setItem(`sos_sales_custom_services_${workspaceId}`, JSON.stringify(items));
      } catch {}
    }
  };

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
        return { label: '1. Novo Lead', bg: 'bg-[var(--sos-action-subtle)] text-[var(--sos-action)] border-[var(--sos-action)]/30' };
      case 'CONTACTED':
        return { label: '1. Em Contato', bg: 'bg-[var(--sos-operational-subtle)] text-[var(--sos-operational)] border-[var(--sos-operational)]/30' };
      case 'QUALIFIED':
      case 'QUALIFICADO':
        return { label: '2. Qualificado', bg: 'bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] border-[var(--sos-ai)]/30' };
      case 'PROPOSAL':
      case 'PROPOSTA':
        return { label: '3. Proposta', bg: 'bg-[var(--sos-warning-subtle)] text-[var(--sos-warning)] border-[var(--sos-warning)]/30' };
      case 'NEGOTIATION':
      case 'NEGOCIACAO':
        return { label: '4. Negociação', bg: 'bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] border-[var(--sos-ai)]/30' };
      case 'WON':
      case 'GANHO':
        return { label: '5. Agendado (Ganho)', bg: 'bg-[var(--sos-success-subtle)] text-[var(--sos-success)] border-[var(--sos-success)]/30 font-bold' };
      case 'LOST':
      case 'PERDIDO':
        return { label: 'Perdido', bg: 'bg-[var(--sos-danger-subtle)] text-[var(--sos-danger)] border-[var(--sos-danger)]/30' };
      default:
        return { label: stage || '1. Novo Lead', bg: 'bg-[var(--sos-border)]/30 text-[var(--sos-muted)] border-[var(--sos-border)]' };
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--sos-canvas)] text-[var(--sos-ink)] p-2 sm:p-3 overflow-hidden w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[var(--sos-border)] shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-[var(--sos-ink)] font-heading tracking-tight flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[var(--sos-success)]" /> Central de Conversas & Funil
            </h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-[var(--sos-success-subtle)] text-[var(--sos-success)] border border-[var(--sos-success)]/30">
              {filtered.length} {filtered.length === 1 ? 'Conversa' : 'Conversas'}
            </span>
          </div>
          <p className="text-xs text-[var(--sos-muted)] mt-0.5">
            Supervisão ao vivo, funil comercial, gestão de notas e torre de monitoramento.
          </p>
        </div>

        {/* 4-Way Mode Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[var(--sos-border)]/30 p-1 rounded-lg border border-[var(--sos-border)] text-xs">
            <button
              id="switch-view-list-btn"
              onClick={() => setViewMode('list')}
              className={`px-2.5 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-[var(--sos-surface)] text-[var(--sos-ink)] shadow-2xs'
                  : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>

            <button
              id="switch-view-kanban-btn"
              onClick={() => setViewMode('kanban')}
              className={`px-2.5 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-[var(--sos-surface)] text-[var(--sos-ink)] shadow-2xs'
                  : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)]'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>Funil Kanban</span>
            </button>

            <button
              id="switch-view-notes-btn"
              onClick={() => setViewMode('notes')}
              className={`px-2.5 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'notes'
                  ? 'bg-[var(--sos-surface)] text-[var(--sos-ink)] shadow-2xs'
                  : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Anotações</span>
            </button>

            <button
              id="switch-view-wallboard-btn"
              onClick={() => setViewMode('wallboard')}
              className={`px-2.5 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'wallboard'
                  ? 'bg-[var(--sos-action)] text-white shadow-2xs'
                  : 'text-[var(--sos-muted)] hover:text-[var(--sos-action)]'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Torre TV</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsStartModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--sos-success)] hover:bg-[var(--sos-success)]/90 text-white rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer shrink-0"
            title="Iniciar Nova Conversa WhatsApp"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo Lead</span>
          </button>

          {viewMode === 'list' && (
            <button
              onClick={() => fetchJourneys()}
              disabled={loading}
              className="p-2 bg-[var(--sos-surface)] hover:bg-[var(--sos-border)]/30 border border-[var(--sos-border)] rounded-lg text-[var(--sos-muted)] hover:text-[var(--sos-ink)] transition-colors shadow-2xs cursor-pointer"
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
          <div className="py-2 space-y-2 shrink-0">
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                      stageFilter === chip.id
                        ? 'bg-[var(--sos-ink)] text-white'
                        : 'bg-[var(--sos-surface)] text-[var(--sos-muted)] border border-[var(--sos-border)] hover:bg-[var(--sos-border)]/30'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Input de Busca */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[var(--sos-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar contato, serviço ou mensagem..."
                  className="pl-8 pr-3 py-1.5 bg-[var(--sos-surface)] border border-[var(--sos-border)] rounded-lg text-xs text-[var(--sos-ink)] placeholder-[var(--sos-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--sos-action)] focus:border-[var(--sos-action)] transition-colors w-56 sm:w-64 shadow-2xs"
                />
              </div>
            </div>

            {/* Linha 2: Filtro por Serviço / Procedimento / Segmento Dinâmico */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--sos-muted)] flex items-center gap-1 mr-1">
                <Tag size={11} /> Segmento / Serviços:
              </span>
              <button
                type="button"
                onClick={() => setServiceFilter('all')}
                className={`px-2 py-0.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  serviceFilter === 'all'
                    ? 'bg-[var(--sos-success)] text-white shadow-2xs'
                    : 'bg-[var(--sos-surface)] text-[var(--sos-muted)] border border-[var(--sos-border)] hover:bg-[var(--sos-border)]/30'
                }`}
              >
                Todos os Serviços
              </button>

              {availableServiceCategories.map((svc) => (
                <button
                  key={svc.id}
                  type="button"
                  onClick={() => setServiceFilter(svc.id)}
                  className={`px-2 py-0.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    serviceFilter === svc.id
                      ? 'bg-[var(--sos-success)] text-white shadow-2xs'
                      : 'bg-[var(--sos-surface)] text-[var(--sos-muted)] border border-[var(--sos-border)] hover:bg-[var(--sos-border)]/30'
                  }`}
                >
                  {svc.label}
                </button>
              ))}

              <button
                type="button"
                onClick={handleCustomizeServices}
                className="px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition cursor-pointer flex items-center gap-1 ml-auto"
                title="Personalizar serviços e categorias para o nicho da sua empresa"
              >
                <Tag size={10} /> Personalizar Filtros
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-2 p-3 rounded-xl bg-[var(--sos-danger-subtle)] border border-[var(--sos-danger)]/30 text-xs text-[var(--sos-danger)] flex items-center gap-2 shrink-0">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
              <button
                onClick={() => fetchJourneys()}
                className="ml-auto underline font-bold cursor-pointer hover:text-[var(--sos-danger)]/80"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {/* Cards da Lista Ricos e Detalhados */}
          <div className="flex-1 bg-[var(--sos-surface)] border border-[var(--sos-border)] rounded-xl shadow-xs overflow-hidden flex flex-col min-h-0">
            <div className="overflow-y-auto flex-1 divide-y divide-[var(--sos-border)] p-2 space-y-1.5">
              {loading ? (
                <div className="p-4 space-y-2">
                  <div className="h-12 bg-[var(--sos-border)]/30 rounded-xl animate-pulse" />
                  <div className="h-12 bg-[var(--sos-border)]/30 rounded-xl animate-pulse" />
                  <div className="h-12 bg-[var(--sos-border)]/30 rounded-xl animate-pulse" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="h-40 flex flex-col items-center justify-center text-center p-4 text-[var(--sos-muted)]">
                  <MessageSquare className="w-6 h-6 text-[var(--sos-muted)]/50 mb-1.5" />
                  <span className="text-sm font-bold text-[var(--sos-ink)]">Nenhuma conversa encontrada</span>
                  <span className="text-xs text-[var(--sos-muted)] mt-0.5">Tente ajustar os filtros de etapa, serviço ou busca.</span>
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
                      className="p-2.5 sm:p-3 rounded-lg border border-[var(--sos-border)]/50 hover:border-[var(--sos-action)] bg-[var(--sos-surface)] hover:bg-[var(--sos-border)]/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer group shadow-2xs"
                    >
                      <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                        {/* Avatar */}
                        <div className="relative shrink-0 mt-0.5 sm:mt-0">
                          <ContactAvatar
                            name={j.contactName}
                            phone={j.contactPhone}
                            avatarUrl={(j as any)?.contactAvatar || (j as any)?.avatarUrl}
                            size="sm"
                            showOnlineBadge={true}
                          />
                        </div>

                        {/* Conteúdo Rico do Card */}
                        <div className="min-w-0 flex-1 space-y-0.5">
                          {/* Linha 1: Nome + Origem + Horário */}
                          <div className="flex items-center justify-between sm:justify-start gap-2">
                            <span className="text-sm font-extrabold text-[var(--sos-ink)] group-hover:text-[var(--sos-action)] transition-colors truncate font-heading">
                              {title}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-xs font-extrabold bg-[var(--sos-success-subtle)] text-[var(--sos-success)] border border-[var(--sos-success)]/30 shrink-0">
                              Click WA
                            </span>

                            <span className="text-xs font-mono text-[var(--sos-muted)] sm:ml-auto">
                              {timeFormatted}
                            </span>
                          </div>

                          {/* Linha 2: Badge de Serviço Específico */}
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border shadow-2xs font-bold truncate ${intent.badgeClass}`}>
                              {intent.service}
                            </span>
                            {j.contactPhone && (
                              <span className="hidden md:inline font-mono text-xs text-[var(--sos-muted)]">
                                {j.contactPhone}
                              </span>
                            )}
                          </div>

                          {/* Linha 3: Prévia da Mensagem / Intenção Real */}
                          <div className="flex items-center gap-1 text-[var(--sos-muted)] text-xs">
                            <CheckCheck className="w-3 h-3 text-[var(--sos-success)] shrink-0" />
                            <span className="truncate font-medium text-[10.5px] text-[var(--sos-muted)]">
                              {intent.preview}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Lado Direito: Etapa do Funil + Botão de Ação */}
                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--sos-border)]">
                        <span className={`px-2 py-0.75 rounded-md text-xs font-bold border ${stage.bg} shrink-0`}>
                          {stage.label}
                        </span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onJourneySelect?.(j.id);
                            onSwitchToCockpit?.();
                          }}
                          className="px-3 py-1 bg-[var(--sos-ink)] group-hover:bg-[var(--sos-action)] text-white rounded-lg text-xs font-extrabold transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                        >
                          <span>Abrir Cockpit</span>
                          <ArrowRight className="w-3 h-3" />
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
