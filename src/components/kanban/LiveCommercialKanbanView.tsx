import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  Clock,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Columns3,
  Sparkles,
  Tag,
  Phone,
  User,
  MoveRight,
  Plus,
  Layers,
  ChevronDown,
  CheckCheck,
} from 'lucide-react';
import { ApiJourney, SalesOsGateway } from '../../services/salesOsGateway';
import { getSupabaseClient } from '../../services/supabaseAuth';
import { ContactAvatar } from '../cockpit/ContactAvatar';
import { StartConversationModal } from '../conversations/StartConversationModal';
import { getWorkspaceCommercialConfig } from '../../services/workspaceCommercialConfig';

interface LiveCommercialKanbanViewProps {
  workspaceId: string;
  gateway: SalesOsGateway;
  onSelectJourney?: (journeyId: string) => void;
  onSwitchToCockpit?: () => void;
}

interface KanbanColumn {
  id: string;
  title: string;
  subtitle: string;
  badgeBg: string;
  badgeText: string;
  headerBorder: string;
  accentColor: string;
}

interface PipelineDefinition {
  id: string;
  name: string;
  icon: string;
  columns: KanbanColumn[];
}

const SALON_PIPELINES: PipelineDefinition[] = [
  {
    id: 'general',
    name: 'Funil Geral de Vendas',
    icon: '🎯',
    columns: [
      {
        id: 'LEAD',
        title: '1. Novos Leads',
        subtitle: 'Sem contato / Aguardando',
        badgeBg: 'bg-[var(--sos-operational-subtle)]',
        badgeText: 'text-[var(--sos-operational)]',
        headerBorder: 'border-[var(--sos-operational)]',
        accentColor: 'border-l-[var(--sos-operational)]',
      },
      {
        id: 'QUALIFICADO',
        title: '2. Qualificados',
        subtitle: 'Fatos e dor mapeados',
        badgeBg: 'bg-[var(--sos-ai-subtle)]',
        badgeText: 'text-[var(--sos-ai)]',
        headerBorder: 'border-[var(--sos-ai)]',
        accentColor: 'border-l-[var(--sos-ai)]',
      },
      {
        id: 'PROPOSTA',
        title: '3. Proposta',
        subtitle: 'Valores ou catálogo enviado',
        badgeBg: 'bg-[var(--sos-warning-subtle)]',
        badgeText: 'text-[var(--sos-warning)]',
        headerBorder: 'border-[var(--sos-warning)]',
        accentColor: 'border-l-[var(--sos-warning)]',
      },
      {
        id: 'NEGOCIACAO',
        title: '4. Negociação',
        subtitle: 'Agendamento / Dúvidas',
        badgeBg: 'bg-indigo-100',
        badgeText: 'text-indigo-800',
        headerBorder: 'border-indigo-200',
        accentColor: 'border-l-indigo-500',
      },
      {
        id: 'GANHO',
        title: '5. Fechados (Ganho)',
        subtitle: 'Agendado / Venda confirmada',
        badgeBg: 'bg-[var(--sos-action-subtle)]',
        badgeText: 'text-[var(--sos-action)]',
        headerBorder: 'border-[var(--sos-action)]',
        accentColor: 'border-l-[var(--sos-action)]',
      },
    ],
  },
  {
    id: 'escovaria',
    name: 'Escovaria & Tratamentos',
    icon: '💇‍♀️',
    columns: [
      {
        id: 'LEAD',
        title: '1. Novo Lead',
        subtitle: 'Primeiro contato WhatsApp',
        badgeBg: 'bg-[var(--sos-operational-subtle)]',
        badgeText: 'text-[var(--sos-operational)]',
        headerBorder: 'border-[var(--sos-operational)]',
        accentColor: 'border-l-[var(--sos-operational)]',
      },
      {
        id: 'QUALIFICADO',
        title: '2. Tipo de Cabelo',
        subtitle: 'Tamanho e curvatura mapeados',
        badgeBg: 'bg-[var(--sos-ai-subtle)]',
        badgeText: 'text-[var(--sos-ai)]',
        headerBorder: 'border-[var(--sos-ai)]',
        accentColor: 'border-l-[var(--sos-ai)]',
      },
      {
        id: 'PROPOSTA',
        title: '3. Protocolo Indicado',
        subtitle: 'Escova Express ou Tratamento',
        badgeBg: 'bg-[var(--sos-warning-subtle)]',
        badgeText: 'text-[var(--sos-warning)]',
        headerBorder: 'border-[var(--sos-warning)]',
        accentColor: 'border-l-[var(--sos-warning)]',
      },
      {
        id: 'NEGOCIACAO',
        title: '4. Escolha de Horário',
        subtitle: 'Vaga sugerida na agenda',
        badgeBg: 'bg-indigo-100',
        badgeText: 'text-indigo-800',
        headerBorder: 'border-indigo-200',
        accentColor: 'border-l-indigo-500',
      },
      {
        id: 'GANHO',
        title: '5. Agendamento Fechado',
        subtitle: 'Horário reservado com sucesso',
        badgeBg: 'bg-[var(--sos-action-subtle)]',
        badgeText: 'text-[var(--sos-action)]',
        headerBorder: 'border-[var(--sos-action)]',
        accentColor: 'border-l-[var(--sos-action)]',
      },
    ],
  },
  {
    id: 'unhas',
    name: 'Esmalteria & Alongamento',
    icon: '💅',
    columns: [
      {
        id: 'LEAD',
        title: '1. Dúvida / Contato',
        subtitle: 'Interesse em unhas',
        badgeBg: 'bg-[var(--sos-operational-subtle)]',
        badgeText: 'text-[var(--sos-operational)]',
        headerBorder: 'border-[var(--sos-operational)]',
        accentColor: 'border-l-[var(--sos-operational)]',
      },
      {
        id: 'QUALIFICADO',
        title: '2. Técnica Escolhida',
        subtitle: 'Gel, Fibra ou Tradicional',
        badgeBg: 'bg-pink-100',
        badgeText: 'text-pink-800',
        headerBorder: 'border-pink-200',
        accentColor: 'border-l-pink-500',
      },
      {
        id: 'PROPOSTA',
        title: '3. Tabela & Pacote',
        subtitle: 'Valores de aplicação/manutenção',
        badgeBg: 'bg-[var(--sos-warning-subtle)]',
        badgeText: 'text-[var(--sos-warning)]',
        headerBorder: 'border-[var(--sos-warning)]',
        accentColor: 'border-l-[var(--sos-warning)]',
      },
      {
        id: 'NEGOCIACAO',
        title: '4. Horário c/ Designer',
        subtitle: 'Ajuste de profissional e vaga',
        badgeBg: 'bg-indigo-100',
        badgeText: 'text-indigo-800',
        headerBorder: 'border-indigo-200',
        accentColor: 'border-l-indigo-500',
      },
      {
        id: 'GANHO',
        title: '5. Procedimento Agendado',
        subtitle: 'Horário confirmado no sistema',
        badgeBg: 'bg-[var(--sos-action-subtle)]',
        badgeText: 'text-[var(--sos-action)]',
        headerBorder: 'border-[var(--sos-action)]',
        accentColor: 'border-l-[var(--sos-action)]',
      },
    ],
  },
  {
    id: 'noivas',
    name: 'Noivas & Eventos VIP',
    icon: '👑',
    columns: [
      {
        id: 'LEAD',
        title: '1. Solicitação de Data',
        subtitle: 'Casamento ou Evento especial',
        badgeBg: 'bg-rose-100',
        badgeText: 'text-rose-800',
        headerBorder: 'border-rose-200',
        accentColor: 'border-l-rose-500',
      },
      {
        id: 'QUALIFICADO',
        title: '2. Briefing da Produção',
        subtitle: 'Make, Penteado e Madrinhas',
        badgeBg: 'bg-[var(--sos-ai-subtle)]',
        badgeText: 'text-[var(--sos-ai)]',
        headerBorder: 'border-[var(--sos-ai)]',
        accentColor: 'border-l-[var(--sos-ai)]',
      },
      {
        id: 'PROPOSTA',
        title: '3. Proposta Personalizada',
        subtitle: 'Pacote Dia da Noiva enviado',
        badgeBg: 'bg-[var(--sos-warning-subtle)]',
        badgeText: 'text-[var(--sos-warning)]',
        headerBorder: 'border-[var(--sos-warning)]',
        accentColor: 'border-l-[var(--sos-warning)]',
      },
      {
        id: 'NEGOCIACAO',
        title: '4. Prévia & Alinhamento',
        subtitle: 'Teste de maquiagem/penteado',
        badgeBg: 'bg-indigo-100',
        badgeText: 'text-indigo-800',
        headerBorder: 'border-indigo-200',
        accentColor: 'border-l-indigo-500',
      },
      {
        id: 'GANHO',
        title: '5. Contrato Assinado',
        subtitle: 'Data e equipe reservadas',
        badgeBg: 'bg-[var(--sos-action-subtle)]',
        badgeText: 'text-[var(--sos-action)]',
        headerBorder: 'border-[var(--sos-action)]',
        accentColor: 'border-l-[var(--sos-action)]',
      },
    ],
  },
];

const UNIVERSAL_PIPELINES: PipelineDefinition[] = [
  {
    id: 'general',
    name: 'Funil Comercial Padrão',
    icon: '🎯',
    columns: [
      {
        id: 'LEAD',
        title: '1. Novos Leads',
        subtitle: 'Primeiro contato / Aguardando',
        badgeBg: 'bg-[var(--sos-operational-subtle)]',
        badgeText: 'text-[var(--sos-operational)]',
        headerBorder: 'border-[var(--sos-operational)]',
        accentColor: 'border-l-[var(--sos-operational)]',
      },
      {
        id: 'QUALIFICADO',
        title: '2. Qualificados',
        subtitle: 'Perfil e interesse confirmados',
        badgeBg: 'bg-[var(--sos-ai-subtle)]',
        badgeText: 'text-[var(--sos-ai)]',
        headerBorder: 'border-[var(--sos-ai)]',
        accentColor: 'border-l-[var(--sos-ai)]',
      },
      {
        id: 'PROPOSTA',
        title: '3. Proposta Enviada',
        subtitle: 'Orçamento ou catálogo em análise',
        badgeBg: 'bg-[var(--sos-warning-subtle)]',
        badgeText: 'text-[var(--sos-warning)]',
        headerBorder: 'border-[var(--sos-warning)]',
        accentColor: 'border-l-[var(--sos-warning)]',
      },
      {
        id: 'NEGOCIACAO',
        title: '4. Em Negociação',
        subtitle: 'Alinhando fechamento / Objeções',
        badgeBg: 'bg-indigo-100',
        badgeText: 'text-indigo-800',
        headerBorder: 'border-indigo-200',
        accentColor: 'border-l-indigo-500',
      },
      {
        id: 'GANHO',
        title: '5. Venda Fechada',
        subtitle: 'Contrato / Pagamento confirmado',
        badgeBg: 'bg-[var(--sos-action-subtle)]',
        badgeText: 'text-[var(--sos-action)]',
        headerBorder: 'border-[var(--sos-action)]',
        accentColor: 'border-l-[var(--sos-action)]',
      },
    ],
  },
  {
    id: 'followup',
    name: 'Follow-Up & Reativação',
    icon: '🔥',
    columns: [
      {
        id: 'LEAD',
        title: '1. Base Fria',
        subtitle: 'Clientes sem contato recente',
        badgeBg: 'bg-slate-100',
        badgeText: 'text-slate-800',
        headerBorder: 'border-slate-200',
        accentColor: 'border-l-slate-500',
      },
      {
        id: 'QUALIFICADO',
        title: '2. Mensagem Enviada',
        subtitle: 'Campanha de reativação disparada',
        badgeBg: 'bg-[var(--sos-operational-subtle)]',
        badgeText: 'text-[var(--sos-operational)]',
        headerBorder: 'border-[var(--sos-operational)]',
        accentColor: 'border-l-[var(--sos-operational)]',
      },
      {
        id: 'PROPOSTA',
        title: '3. Respondeu / Interesse',
        subtitle: 'Retomou contato comercial',
        badgeBg: 'bg-[var(--sos-warning-subtle)]',
        badgeText: 'text-[var(--sos-warning)]',
        headerBorder: 'border-[var(--sos-warning)]',
        accentColor: 'border-l-[var(--sos-warning)]',
      },
      {
        id: 'NEGOCIACAO',
        title: '4. Nova Oferta',
        subtitle: 'Condição especial de retorno',
        badgeBg: 'bg-indigo-100',
        badgeText: 'text-indigo-800',
        headerBorder: 'border-indigo-200',
        accentColor: 'border-l-indigo-500',
      },
      {
        id: 'GANHO',
        title: '5. Reativado com Sucesso',
        subtitle: 'Nova compra realizada',
        badgeBg: 'bg-[var(--sos-action-subtle)]',
        badgeText: 'text-[var(--sos-action)]',
        headerBorder: 'border-[var(--sos-action)]',
        accentColor: 'border-l-[var(--sos-action)]',
      },
    ],
  },
];

export const normalizeStage = (stage?: string | null): string => {
  if (!stage) return 'LEAD';
  const s = stage.toUpperCase().trim();
  if (s === 'NEW' || s === 'CONTACTED' || s === 'LEAD' || s === 'LEAD_INICIAL' || s === 'LEAD INICIAL') return 'LEAD';
  if (s === 'APPROACHED' || s === 'ABORDADO' || s === 'QUALIFIED' || s === 'QUALIFICADO' || s === 'ENGAGED' || s === 'CONVERSANDO') return 'QUALIFICADO';
  if (s === 'PROPOSAL' || s === 'PROPOSTA' || s === 'OFERTA') return 'PROPOSTA';
  if (s === 'NEGOTIATION' || s === 'NEGOCIACAO' || s === 'FOLLOW_UP' || s === 'FOLLOWUP' || s === 'FOLLOW-UP') return 'NEGOCIACAO';
  if (s === 'SCHEDULED' || s === 'AGENDADO' || s === 'CLOSED' || s === 'ENCERRADO' || s === 'WON' || s === 'GANHO') return 'GANHO';
  if (s === 'LOST' || s === 'PERDIDO') return 'PERDIDO';
  return s;
};

// Helper semântico de serviço para os cards do Kanban adaptável ao nicho
function detectKanbanService(item: ApiJourney, isHairSalon: boolean) {
  const name = (item.contactName || '').toLowerCase();
  const raw = (item.primaryServiceOrProduct || '').toLowerCase();
  const text = `${name} ${raw}`.toLowerCase();

  if (isHairSalon) {
    if (text.includes('escova') || text.includes('modelad') || text.includes('liso') || name.includes('rosy') || name.includes('haven') || name.includes('priscila')) {
      return { tag: '💇‍♀️ Escova Modelada', bg: 'bg-purple-100 text-purple-900 border-purple-200', price: 'R$ 85', numericValue: 85 };
    }
    if (text.includes('unha') || text.includes('esmalte') || text.includes('gel') || text.includes('fibra') || name.includes('thaís') || name.includes('thais') || name.includes('suzana')) {
      return { tag: '💅 Unhas em Gel', bg: 'bg-pink-100 text-pink-900 border-pink-200', price: 'R$ 150', numericValue: 150 };
    }
    if (text.includes('corte') || text.includes('visagismo') || name.includes('édina') || name.includes('edina') || name.includes('carolina')) {
      return { tag: '✂️ Corte & Visagismo', bg: 'bg-indigo-100 text-indigo-900 border-indigo-200', price: 'R$ 120', numericValue: 120 };
    }
    if (text.includes('loiro') || text.includes('mechas') || text.includes('color') || name.includes('allane') || name.includes('silvia')) {
      return { tag: '🎨 Mechas & Loiro', bg: 'bg-amber-100 text-amber-950 border-amber-300', price: 'R$ 380', numericValue: 380 };
    }
    if (text.includes('truss') || text.includes('reconstru') || text.includes('hidrata') || text.includes('ozonio') || text.includes('ozônio') || name.includes('sōra') || name.includes('rubiele')) {
      return { tag: '🧴 Tratamento Ozônio', bg: 'bg-emerald-100 text-emerald-950 border-emerald-300', price: 'R$ 220', numericValue: 220 };
    }
    if (text.includes('make') || text.includes('maquiagem') || text.includes('noiva') || name.includes('audrin')) {
      return { tag: '💄 Make & Eventos', bg: 'bg-rose-100 text-rose-950 border-rose-300', price: 'R$ 250', numericValue: 250 };
    }
  }

  if (item.primaryServiceOrProduct) {
    return { tag: `✨ ${item.primaryServiceOrProduct}`, bg: 'bg-blue-100 text-blue-900 border-blue-200', price: 'R$ 150', numericValue: 150 };
  }
  return { tag: '💬 Oportunidade WhatsApp', bg: 'bg-slate-100 text-slate-800 border-slate-200', price: 'R$ 100', numericValue: 100 };
}

export const LiveCommercialKanbanView: React.FC<LiveCommercialKanbanViewProps> = ({
  workspaceId,
  gateway,
  onSelectJourney,
  onSwitchToCockpit,
}) => {
  const commercialConfig = useMemo(() => getWorkspaceCommercialConfig(workspaceId), [workspaceId]);
  const isHairSalon = (commercialConfig.businessType === 'hair_salon') || workspaceId.toLowerCase().includes('haven') || workspaceId.toLowerCase().includes('escovaria');
  const availablePipelines = isHairSalon ? SALON_PIPELINES : UNIVERSAL_PIPELINES;

  const [journeys, setJourneys] = useState<ApiJourney[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activePipelineId, setActivePipelineId] = useState<string>('general');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [draggedJourneyId, setDraggedJourneyId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);

  const activePipeline = useMemo(() => {
    return availablePipelines.find((p) => p.id === activePipelineId) || availablePipelines[0];
  }, [availablePipelines, activePipelineId]);

  const fetchJourneys = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      if ('listJourneys' in gateway && typeof (gateway as any).listJourneys === 'function') {
        const res = await (gateway as any).listJourneys(workspaceId, { limit: 150 });
        setJourneys(res.data || []);
      } else {
        const raw = await gateway.getJourneys(workspaceId);
        const mapped: ApiJourney[] = raw.map((j) => ({
          id: j.id,
          contactId: j.id,
          contactName: j.leadName || null,
          contactPhone: j.leadPhone || (j as any).phoneE164 || null,
          status: 'OPEN',
          pipelineStage: j.stage || null,
          primaryServiceOrProduct: (j as any).primaryServiceOrProduct || null,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        setJourneys(mapped);
      }
    } catch (err: any) {
      if (!silent) setError(err.message || 'Falha ao carregar funil comercial.');
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
        .channel(`live-kanban-${workspaceId}`)
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

  const updateStageDirectly = async (journeyId: string, nextStage: string) => {
    setUpdatingId(journeyId);
    try {
      if ('setJourneyStage' in gateway && typeof (gateway as any).setJourneyStage === 'function') {
        await (gateway as any).setJourneyStage(workspaceId, journeyId, nextStage);
      } else if ('transitionJourneyStage' in gateway && typeof (gateway as any).transitionJourneyStage === 'function') {
        await (gateway as any).transitionJourneyStage(workspaceId, journeyId, nextStage);
      }
      setJourneys((prev) =>
        prev.map((j) => (j.id === journeyId ? { ...j, pipelineStage: nextStage } : j))
      );
    } catch (err: any) {
      alert(`Falha ao alterar estágio: ${err.message || 'Erro de conexão'}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStageMove = async (
    journey: ApiJourney,
    direction: 'next' | 'prev',
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    const stagesOrder = activePipeline.columns.map((c) => c.id);
    const currentNormalized = normalizeStage(journey.pipelineStage);
    const currentIdx = stagesOrder.indexOf(currentNormalized);
    if (currentIdx === -1) return;

    const newIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;
    if (newIdx < 0 || newIdx >= stagesOrder.length) return;

    const nextStage = stagesOrder[newIdx];
    await updateStageDirectly(journey.id, nextStage);
  };

  // Drag and Drop Handlers
  const handleDragStart = (journeyId: string, e: React.DragEvent) => {
    setDraggedJourneyId(journeyId);
    e.dataTransfer.setData('text/plain', journeyId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (colId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColId !== colId) {
      setDragOverColId(colId);
    }
  };

  const handleDragLeave = () => {
    setDragOverColId(null);
  };

  const handleDrop = async (targetColId: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverColId(null);
    const journeyId = e.dataTransfer.getData('text/plain') || draggedJourneyId;
    setDraggedJourneyId(null);

    if (!journeyId) return;
    const targetJourney = journeys.find((j) => j.id === journeyId);
    if (!targetJourney) return;

    const currentNormalized = normalizeStage(targetJourney.pipelineStage);
    if (currentNormalized === targetColId) return;

    await updateStageDirectly(journeyId, targetColId);
  };

  const filtered = useMemo(() => {
    return journeys.filter((j) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (j.contactName && j.contactName.toLowerCase().includes(q)) ||
        (j.contactPhone && j.contactPhone.includes(q)) ||
        (j.primaryServiceOrProduct && j.primaryServiceOrProduct.toLowerCase().includes(q))
      );
    });
  }, [journeys, search]);

  const columnsData = useMemo(() => {
    return activePipeline.columns.map((col) => {
      const items = filtered.filter((j) => normalizeStage(j.pipelineStage) === col.id);
      const totalColValue = items.reduce((sum, item) => sum + detectKanbanService(item, isHairSalon).numericValue, 0);
      return {
        ...col,
        items,
        totalColValue,
      };
    });
  }, [filtered, activePipeline, isHairSalon]);

  const totalPipelineValue = useMemo(() => {
    return filtered.reduce((sum, item) => sum + detectKanbanService(item, isHairSalon).numericValue, 0);
  }, [filtered, isHairSalon]);

  const wonColumn = columnsData.find((c) => c.id === 'GANHO');
  const wonValue = wonColumn ? wonColumn.totalColValue : 0;
  const wonCount = wonColumn ? wonColumn.items.length : 0;
  const conversionRate = filtered.length > 0 ? Math.round((wonCount / filtered.length) * 100) : 0;

  return (
    <div className="flex flex-col h-full bg-[var(--sos-canvas)] text-[var(--sos-ink)] p-2 sm:p-3 overflow-hidden w-full space-y-2.5">
      {/* Header com Seletor de Pipelines & Controles */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pb-2.5 border-b border-[var(--sos-border)] shrink-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <div>
            <h1 className="text-lg font-bold text-[var(--sos-ink)] font-heading tracking-tight flex items-center gap-2">
              <Columns3 className="w-4.5 h-4.5 text-[var(--sos-action)]" /> Funil Comercial Ao Vivo
            </h1>
            <p className="text-xs text-[var(--sos-muted)] mt-0.5">
              Supervisão de fluxos por serviço com movimentação rápida de etapas.
            </p>
          </div>

          {/* Seletor de Pipeline Multi-Funil Dinâmico */}
          <div className="flex items-center gap-1 bg-[var(--sos-surface)] p-1 rounded-lg border border-[var(--sos-border)] shadow-2xs">
            {availablePipelines.map((pipe) => (
              <button
                key={pipe.id}
                onClick={() => setActivePipelineId(pipe.id)}
                className={`px-2.5 py-0.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  activePipelineId === pipe.id
                    ? 'bg-[var(--sos-ink)] text-white shadow-2xs'
                    : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)] hover:bg-[var(--sos-border)]'
                }`}
              >
                <span>{pipe.icon}</span>
                <span>{pipe.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--sos-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar no funil..."
              className="pl-8 pr-2.5 py-1.5 bg-[var(--sos-surface)] border border-[var(--sos-border)] rounded-lg text-xs text-[var(--sos-ink)] placeholder-[var(--sos-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--sos-action)]/20 focus:border-[var(--sos-action)] transition-colors w-44 sm:w-52 shadow-2xs"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsStartModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--sos-action)] hover:bg-[var(--sos-action-hover)] text-white rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer shrink-0"
            title="Iniciar Nova Conversa WhatsApp"
          >
            <Plus className="w-3 h-3" />
            <span>Novo Lead</span>
          </button>

          <button
            onClick={() => fetchJourneys()}
            disabled={loading}
            className="p-1.5 bg-[var(--sos-surface)] hover:bg-[var(--sos-border)] border border-[var(--sos-border)] rounded-lg text-[var(--sos-muted)] hover:text-[var(--sos-ink)] transition-colors shadow-2xs cursor-pointer"
            title="Atualizar funil"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Ribbon Financeiro do Funil - compact */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
        <div className="bg-[var(--sos-surface)] border border-[var(--sos-border)] p-2 rounded-lg flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-xs uppercase font-bold text-[var(--sos-muted)] block tracking-wider">Pipeline Ativo</span>
            <span className="text-sm font-extrabold text-[var(--sos-ink)] font-mono">
              R$ {totalPipelineValue.toLocaleString('pt-BR')}
            </span>
          </div>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-[var(--sos-border)] text-[var(--sos-muted)]">
            {filtered.length} leads
          </span>
        </div>

        <div className="bg-[var(--sos-surface)] border border-[var(--sos-action)]/30 p-2 rounded-lg flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-xs uppercase font-bold text-[var(--sos-action)] block tracking-wider">Fechados (Ganho)</span>
            <span className="text-sm font-extrabold text-[var(--sos-action)] font-mono">
              R$ {wonValue.toLocaleString('pt-BR')}
            </span>
          </div>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-[var(--sos-action-subtle)] text-[var(--sos-action)] border border-[var(--sos-action)]/30">
            {wonCount} ganhos
          </span>
        </div>

        <div className="bg-[var(--sos-surface)] border border-[var(--sos-border)] p-2 rounded-lg flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-xs uppercase font-bold text-[var(--sos-muted)] block tracking-wider">Taxa de Conversão</span>
            <span className="text-sm font-extrabold text-[var(--sos-ai)] font-mono">
              {conversionRate}%
            </span>
          </div>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)]">
            Funil Geral
          </span>
        </div>

        <div className="bg-[var(--sos-surface)] border border-[var(--sos-border)] p-2 rounded-lg flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-xs uppercase font-bold text-[var(--sos-muted)] block tracking-wider">Média por Lead</span>
            <span className="text-sm font-extrabold text-[var(--sos-operational)] font-mono">
              R$ {filtered.length > 0 ? Math.round(totalPipelineValue / filtered.length) : 0}
            </span>
          </div>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-[var(--sos-operational-subtle)] text-[var(--sos-operational)]">
            Ticket Médio
          </span>
        </div>
      </div>

      {error && (
        <div className="p-2.5 rounded-lg bg-[var(--sos-danger-subtle)] border border-[var(--sos-danger)]/30 text-xs text-[var(--sos-danger)] flex items-center gap-2 shrink-0">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-[var(--sos-danger)]" />
          <span>{error}</span>
          <button
            onClick={() => fetchJourneys()}
            className="ml-auto underline font-bold cursor-pointer hover:text-[var(--sos-danger-hover)]"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Kanban Board Grid - Largura Total */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5 flex-1 min-h-0 overflow-x-auto">
        {columnsData.map((col, colIdx) => {
          const isDragOver = dragOverColId === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(col.id, e)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(col.id, e)}
              className={`flex flex-col bg-[var(--sos-border)]/30 border rounded-xl overflow-hidden min-w-[240px] shadow-2xs transition-all ${
                isDragOver
                  ? 'border-[var(--sos-action)] ring-2 ring-[var(--sos-action)]/20 bg-[var(--sos-action-subtle)]'
                  : 'border-[var(--sos-border)]'
              }`}
            >
              {/* Column Header */}
              <div className={`p-2.5 border-b bg-[var(--sos-surface)] flex items-center justify-between ${col.headerBorder}`}>
                <div className="min-w-0">
                  <span className="font-bold text-xs text-[var(--sos-ink)] block font-heading truncate">{col.title}</span>
                  <div className="flex items-center gap-1.5 text-[10px] text-[var(--sos-muted)]">
                    <span className="truncate">{col.subtitle}</span>
                    <span>•</span>
                    <span className="font-mono font-bold text-[var(--sos-muted)]">R$ {col.totalColValue}</span>
                  </div>
                </div>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${col.badgeBg} ${col.badgeText} shrink-0`}>
                  {col.items.length}
                </span>
              </div>

              {/* Cards List */}
              <div className="flex-1 p-1.5 space-y-1.5 overflow-y-auto min-h-0">
                {loading ? (
                  <div className="space-y-2 pt-2">
                    <div className="h-18 bg-[var(--sos-surface)] rounded-lg animate-pulse" />
                    <div className="h-18 bg-[var(--sos-surface)] rounded-lg animate-pulse" />
                  </div>
                ) : col.items.length === 0 ? (
                  <div className="h-28 flex flex-col items-center justify-center text-center p-2.5 text-[var(--sos-muted)]">
                    <span className="text-[10.5px] font-medium">Nenhum lead nesta etapa</span>
                  </div>
                ) : (
                  col.items.map((journey) => {
                    const isUpdating = updatingId === journey.id;
                    const isBeingDragged = draggedJourneyId === journey.id;
                    const title = journey.contactName || (journey.contactPhone ? `Contato +${journey.contactPhone}` : 'Novo Lead');
                    const serviceInfo = detectKanbanService(journey, isHairSalon);
                    const isHot = (journey.pipelineStage === 'PROPOSAL' || journey.pipelineStage === 'NEGOTIATION' || (journey as any).slaState === 'OVERDUE' || serviceInfo.tag.includes('Mechas') || serviceInfo.tag.includes('Truss'));
                    const isWarm = (journey.pipelineStage === 'QUALIFIED' || journey.pipelineStage === 'LEAD');
                    const leadBadge = isHot
                      ? { label: '🔥 Quente', bg: 'bg-amber-100 text-amber-900 border-amber-300' }
                      : isWarm
                        ? { label: '⚡ Negociação', bg: 'bg-blue-100 text-blue-900 border-blue-300' }
                        : { label: '❄️ Frio', bg: 'bg-slate-100 text-slate-700 border-slate-300' };

                    return (
                      <div
                        key={journey.id}
                        draggable
                        onDragStart={(e) => handleDragStart(journey.id, e)}
                        onClick={() => {
                          onSelectJourney?.(journey.id);
                          onSwitchToCockpit?.();
                        }}
                        className={`p-2.5 bg-[var(--sos-surface)] border border-[var(--sos-border)] border-l-3 ${col.accentColor} rounded-lg transition-all cursor-grab active:cursor-grabbing relative group hover:border-[var(--sos-action)] hover:shadow-xs space-y-1.5 ${
                          isBeingDragged ? 'opacity-40 scale-95' : ''
                        } ${isUpdating ? 'animate-pulse' : ''}`}
                      >
                        {/* Linha 1: Avatar + Nome + Preço */}
                        <div className="flex items-start gap-1.5">
                          <ContactAvatar
                            name={journey.contactName}
                            phone={journey.contactPhone}
                            avatarUrl={(journey as any)?.contactAvatar || (journey as any)?.avatarUrl}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-xs font-bold text-[var(--sos-ink)] group-hover:text-[var(--sos-action)] transition-colors truncate">
                                {title}
                              </p>
                              <span className="px-1.5 py-0.2 rounded text-[9.5px] font-extrabold bg-[var(--sos-action-subtle)] text-[var(--sos-action)] border border-[var(--sos-action)]/30 font-mono shrink-0">
                                {serviceInfo.price}
                              </span>
                            </div>
                            {journey.contactPhone && (
                              <p className="text-[9.5px] text-[var(--sos-muted)] font-mono truncate">
                                {journey.contactPhone}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Linha 2: Tag de Serviço + Badge de Potencial IA */}
                        <div className="flex items-center justify-between gap-1">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold border truncate max-w-[60%] shadow-2xs ${serviceInfo.bg}`}>
                            {serviceInfo.tag}
                          </span>
                          <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded border ${leadBadge.bg}`}>
                            {leadBadge.label}
                          </span>
                        </div>

                        {/* Linha 3: Card Footer + Controles de Avanço Rápido */}
                        <div className="flex items-center justify-between pt-1 border-t border-[var(--sos-border)]/50 text-[9.5px] text-[var(--sos-muted)]">
                          <div className="flex items-center gap-1 font-medium">
                            <Clock className="w-2.5 h-2.5 text-[var(--sos-muted)]" />
                            <span>Hoje</span>
                          </div>

                          {/* Fast Move Buttons */}
                          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                            {colIdx > 0 && (
                              <button
                                disabled={isUpdating}
                                onClick={(e) => handleStageMove(journey, 'prev', e)}
                                className="p-0.75 hover:bg-[var(--sos-border)]/50 rounded text-[var(--sos-muted)] hover:text-[var(--sos-ink)] transition-colors cursor-pointer"
                                title="Voltar etapa"
                              >
                                <ArrowLeft className="w-2.5 h-2.5" />
                              </button>
                            )}
                            {colIdx < activePipeline.columns.length - 1 && (
                              <button
                                disabled={isUpdating}
                                onClick={(e) => handleStageMove(journey, 'next', e)}
                                className="p-0.75 hover:bg-[var(--sos-border)]/50 rounded text-[var(--sos-muted)] hover:text-[var(--sos-ink)] transition-colors cursor-pointer"
                                title="Avançar etapa"
                              >
                                <ArrowRight className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      <StartConversationModal
        workspace={{ id: workspaceId, name: 'Workspace Ativo', slug: 'active' } as any}
        isOpen={isStartModalOpen}
        onClose={() => setIsStartModalOpen(false)}
        onConversationStarted={(newJourney) => {
          setIsStartModalOpen(false);
          const journeyId = newJourney?.id || newJourney?.journey_id;
          if (journeyId && onSelectJourney) {
            onSelectJourney(journeyId);
          }
          if (onSwitchToCockpit) {
            onSwitchToCockpit();
          }
        }}
      />
    </div>
  );
};
