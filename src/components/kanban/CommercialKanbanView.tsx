import React, { useState, useMemo } from 'react';
import { Journey, CommercialStage, MessageStatus, OperatorRole } from '../../types/cockpit';
import { evaluateQualification, COMMERCIAL_STAGES } from '../../services/commercialDecisionEngine';
import {
  Clock,
  Check,
  CheckCheck,
  Flame,
  ArrowRight,
  ArrowLeft,
  MessageSquare,
  DollarSign,
  TrendingUp,
  Award,
  Sparkles,
  AlertCircle,
  Filter,
  CheckCircle2,
  Tag,
  UserCheck,
  User,
  Search,
  GripVertical,
  XCircle,
  PlusCircle,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Zap,
} from 'lucide-react';

interface CommercialKanbanViewProps {
  journeys: Journey[];
  onSelectJourney: (journey: Journey) => void;
  onUpdateJourney: (updated: Journey) => void;
  onSwitchToCockpit: () => void;
  currentOperatorId: string;
  role: OperatorRole;
}

interface ColumnDef {
  id: CommercialStage;
  title: string;
  subtitle: string;
  badgeColor: string;
  headerBg: string;
  borderColor: string;
  dropAccent: string;
}

const KANBAN_COLUMNS: ColumnDef[] = [
  {
    id: 'new',
    title: '1. Novos Leads',
    subtitle: 'Origem CTWA & Direto',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    headerBg: 'bg-blue-50/80',
    borderColor: 'border-blue-200',
    dropAccent: 'border-blue-400 bg-blue-50/40',
  },
  {
    id: 'contacted',
    title: '2. Em Contato',
    subtitle: 'Primeira resposta',
    badgeColor: 'bg-sky-100 text-sky-800 border-sky-200',
    headerBg: 'bg-sky-50/80',
    borderColor: 'border-sky-200',
    dropAccent: 'border-sky-400 bg-sky-50/40',
  },
  {
    id: 'qualified',
    title: '3. Qualificados',
    subtitle: 'Dores & Necessidades',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
    headerBg: 'bg-purple-50/80',
    borderColor: 'border-purple-200',
    dropAccent: 'border-purple-400 bg-purple-50/40',
  },
  {
    id: 'proposal',
    title: '4. Proposta / Orçamento',
    subtitle: 'Preço & Condições',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    headerBg: 'bg-amber-50/80',
    borderColor: 'border-amber-200',
    dropAccent: 'border-amber-400 bg-amber-50/40',
  },
  {
    id: 'negotiation',
    title: '5. Em Negociação',
    subtitle: 'Superando Objeções',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    headerBg: 'bg-indigo-50/80',
    borderColor: 'border-indigo-200',
    dropAccent: 'border-indigo-400 bg-indigo-50/40',
  },
  {
    id: 'won',
    title: '6. Fechamento (Ganha)',
    subtitle: 'Vendas Convertidas',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    headerBg: 'bg-emerald-50/80',
    borderColor: 'border-emerald-200',
    dropAccent: 'border-emerald-400 bg-emerald-50/40',
  },
];

export const CommercialKanbanView: React.FC<CommercialKanbanViewProps> = ({
  journeys,
  onSelectJourney,
  onUpdateJourney,
  onSwitchToCockpit,
  currentOperatorId,
  role,
}) => {
  const [filterSla, setFilterSla] = useState<'all' | 'critical' | 'ctwa' | 'assigned'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [draggedJourneyId, setDraggedJourneyId] = useState<string | null>(null);
  const [activeDropStage, setActiveDropStage] = useState<CommercialStage | null>(null);

  // Lost deal modal state
  const [lostModalJourney, setLostModalJourney] = useState<Journey | null>(null);
  const [lostReason, setLostReason] = useState('Sem resposta após proposta');

  // Value edit modal state
  const [editingValueJourney, setEditingValueJourney] = useState<Journey | null>(null);
  const [tempValue, setTempValue] = useState('');

  // Helper to compute deal value
  const getDealValue = (journey: Journey): number => {
    if (journey.outcome?.dealValueBrl !== undefined) return journey.outcome.dealValueBrl;
    if (journey.estimatedDealValueBrl !== undefined) return journey.estimatedDealValueBrl;
    return journey.workspaceId === 'ws-escovaria' ? 149.0 : 850.0;
  };

  // Pipeline metrics
  const { totalPipelineValue, wonTotalValue, wonCount, totalActiveLeads, avgTicket } = useMemo(() => {
    let pipeline = 0;
    let wonVal = 0;
    let wonCnt = 0;
    let activeCnt = 0;

    journeys.forEach((j) => {
      const val = getDealValue(j);
      if (j.stage === 'won' || j.outcome?.status === 'won') {
        wonVal += val;
        wonCnt += 1;
      } else if (j.stage !== 'lost') {
        pipeline += val;
        activeCnt += 1;
      }
    });

    const avg = wonCnt > 0 ? wonVal / wonCnt : activeCnt > 0 ? pipeline / activeCnt : 0;

    return {
      totalPipelineValue: pipeline,
      wonTotalValue: wonVal,
      wonCount: wonCnt,
      totalActiveLeads: activeCnt,
      avgTicket: avg,
    };
  }, [journeys]);

  // Stage change handler with full persistence logic
  const handleMoveStage = (journey: Journey, targetStage: CommercialStage, customValue?: number, reason?: string) => {
    const valueToUse = customValue !== undefined ? customValue : getDealValue(journey);

    let updatedOutcome = journey.outcome;
    let updatedHandoffStatus = journey.handoffStatus;

    if (targetStage === 'won') {
      updatedHandoffStatus = 'resolved';
      updatedOutcome = {
        id: `out-${Date.now()}`,
        journeyId: journey.id,
        status: 'won',
        dealValueBrl: valueToUse,
        closedAt: new Date().toISOString(),
        closedBy: currentOperatorId,
        serviceOrProduct:
          journey.knownFacts.find((f) => f.namespace === 'servico' || f.namespace === 'produto')?.value ||
          journey.acquisition.referralOffer ||
          'Venda Comercial',
        reason: reason || 'Fechamento concluído via WhatsApp',
      };
    } else if (targetStage === 'lost') {
      updatedHandoffStatus = 'resolved';
      updatedOutcome = {
        id: `out-${Date.now()}`,
        journeyId: journey.id,
        status: 'lost',
        dealValueBrl: 0,
        closedAt: new Date().toISOString(),
        closedBy: currentOperatorId,
        reason: reason || 'Lead cancelou ou parou de responder',
      };
    } else {
      // Reverted to active funnel
      if (journey.outcome) {
        updatedOutcome = undefined;
      }
      if (journey.handoffStatus === 'resolved') {
        updatedHandoffStatus = 'in_progress';
      }
    }

    const updated: Journey = {
      ...journey,
      stage: targetStage,
      estimatedDealValueBrl: valueToUse,
      handoffStatus: updatedHandoffStatus,
      outcome: updatedOutcome,
      lastActivityAt: new Date().toISOString(),
    };

    onUpdateJourney(updated);
  };

  // Drag and Drop Event Handlers
  const handleDragStart = (e: React.DragEvent, journeyId: string) => {
    setDraggedJourneyId(journeyId);
    e.dataTransfer.setData('text/plain', journeyId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedJourneyId(null);
    setActiveDropStage(null);
  };

  const handleDragOver = (e: React.DragEvent, stage: CommercialStage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (activeDropStage !== stage) {
      setActiveDropStage(stage);
    }
  };

  const handleDragLeave = (e: React.DragEvent, stage: CommercialStage) => {
    if (activeDropStage === stage) {
      setActiveDropStage(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetStage: CommercialStage) => {
    e.preventDefault();
    const journeyId = e.dataTransfer.getData('text/plain') || draggedJourneyId;
    setActiveDropStage(null);
    setDraggedJourneyId(null);

    if (!journeyId) return;
    const targetJourney = journeys.find((j) => j.id === journeyId);
    if (!targetJourney) return;

    if (targetJourney.stage === targetStage) return;

    handleMoveStage(targetJourney, targetStage);
  };

  // Filter journeys
  const filteredJourneys = useMemo(() => {
    return journeys.filter((j) => {
      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchesName = j.leadName.toLowerCase().includes(q);
        const matchesPhone = j.leadPhone.includes(q);
        const matchesCampaign = j.acquisition.campaignName?.toLowerCase().includes(q);
        const matchesCity = j.leadCity?.toLowerCase().includes(q);
        const matchesMsg = j.lastLeadMessage.toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesCampaign && !matchesCity && !matchesMsg) {
          return false;
        }
      }

      // Filter Pill
      if (filterSla === 'critical') {
        return j.slaStatus === 'critical' || j.slaMinutesRemaining <= 3;
      }
      if (filterSla === 'ctwa') {
        return j.acquisition.source === 'ctwa';
      }
      if (filterSla === 'assigned') {
        return !!j.assignedOperatorId;
      }
      return true;
    });
  }, [journeys, filterSla, searchTerm]);

  const renderDeliveryStatus = (status?: MessageStatus) => {
    switch (status) {
      case 'read':
        return <span title="Lido" className="inline-flex"><CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" /></span>;
      case 'delivered':
        return <span title="Entregue" className="inline-flex"><CheckCheck className="w-3.5 h-3.5 text-[#8696a0]" /></span>;
      case 'sent':
        return <span title="Enviado" className="inline-flex"><Check className="w-3.5 h-3.5 text-[#8696a0]" /></span>;
      default:
        return <span title="Lido" className="inline-flex"><CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" /></span>;
    }
  };

  return (
    <div id="commercial-kanban-view" className="h-full min-h-0 w-full flex-1 flex flex-col overflow-hidden bg-[#f0f2f5] p-3 gap-3">
      {/* Top Header & Funnel KPIs */}
      <div className="cockpit-panel p-3.5 shrink-0 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#e7f8e8] text-[#00a884] flex items-center justify-center font-bold shadow-2xs">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-[#111b21]">
                Kanban Comercial WhatsApp · Funil de Vendas 24/7
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#e7f8e8] text-[#00a884] border border-[#a7f3d0] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00a884] animate-pulse" />
                Arrastar & Soltar Ativo
              </span>
            </div>
            <p className="text-xs text-[#54656f]">
              Gerencie a progressão de cada conversa desde a captação do anúncio até o fechamento com persistência no Sales OS
            </p>
          </div>
        </div>

        {/* Funnel KPIs */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Active Pipeline */}
          <div className="px-3 py-1.5 bg-[#f8fafc] rounded-xl border border-[#e2e8f0] text-xs">
            <span className="text-[10px] text-[#667781] block">Pipeline Ativo ({totalActiveLeads})</span>
            <span className="font-bold text-[#111b21] font-mono text-sm">
              R$ {totalPipelineValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* Won Value */}
          <div className="px-3 py-1.5 bg-[#e7f8e8] rounded-xl border border-[#a7f3d0] text-xs">
            <span className="text-[10px] text-emerald-800 block">Vendas Ganhas ({wonCount})</span>
            <span className="font-bold text-emerald-900 font-mono text-sm">
              R$ {wonTotalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* Avg Ticket */}
          <div className="px-3 py-1.5 bg-[#f0f4f8] rounded-xl border border-[#cbd5e1] text-xs hidden sm:block">
            <span className="text-[10px] text-slate-600 block">Ticket Médio</span>
            <span className="font-bold text-slate-800 font-mono text-sm">
              R$ {avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* Switch to Cockpit */}
          <button
            id="kanban-switch-cockpit-btn"
            onClick={onSwitchToCockpit}
            className="px-3.5 py-2 bg-[#00a884] hover:bg-[#008069] text-white rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Voltar ao Cockpit</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="cockpit-panel px-3.5 py-2 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            id="kanban-search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por lead, telefone, campanha ou mensagem..."
            className="w-full pl-8 pr-3 py-1.5 bg-[#f0f2f5] border border-slate-200 rounded-xl text-xs text-[#111b21] placeholder-slate-400 focus:outline-none focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884]"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ×
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          <button
            onClick={() => setFilterSla('all')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
              filterSla === 'all'
                ? 'bg-[#00a884] text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todos ({journeys.length})
          </button>
          <button
            onClick={() => setFilterSla('critical')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 ${
              filterSla === 'critical'
                ? 'bg-rose-600 text-white shadow-2xs'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            SLA Crítico
          </button>
          <button
            onClick={() => setFilterSla('ctwa')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 ${
              filterSla === 'ctwa'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
            }`}
          >
            <Tag className="w-3 h-3" />
            Anúncios CTWA
          </button>
          <button
            onClick={() => setFilterSla('assigned')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 ${
              filterSla === 'assigned'
                ? 'bg-purple-600 text-white shadow-2xs'
                : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
            }`}
          >
            <User className="w-3 h-3" />
            Com Operador
          </button>
        </div>
      </div>

      {/* Horizontal Scrollable Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden pb-1">
        <div className="flex gap-3 h-full min-w-[1450px]">
          {KANBAN_COLUMNS.map((col, colIdx) => {
            const colJourneys = filteredJourneys.filter((j) => {
              const stage = j.stage || 'new';
              return stage === col.id;
            });

            const colValue = colJourneys.reduce((sum, j) => sum + getDealValue(j), 0);
            const isDropActive = activeDropStage === col.id;

            return (
              <div
                key={col.id}
                id={`kanban-column-${col.id}`}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={(e) => handleDragLeave(e, col.id)}
                onDrop={(e) => handleDrop(e, col.id)}
                className={`w-[275px] flex flex-col bg-white rounded-2xl border transition-all shadow-xs overflow-hidden ${
                  isDropActive
                    ? `${col.dropAccent} border-2 ring-2 ring-[#00a884]/30 scale-[1.01]`
                    : `${col.borderColor} border`
                }`}
              >
                {/* Column Header */}
                <div className={`p-3 border-b ${col.headerBg} ${col.borderColor} flex items-center justify-between shrink-0`}>
                  <div>
                    <h3 className="text-xs font-bold text-[#111b21] flex items-center gap-1">
                      {col.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10.5px] text-[#54656f] font-mono font-bold">
                        R$ {colValue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                      </span>
                      <span className="text-[9.5px] text-slate-400">· {col.subtitle}</span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${col.badgeColor}`}>
                    {colJourneys.length}
                  </span>
                </div>

                {/* Cards Drop Area Container */}
                <div
                  className={`flex-1 overflow-y-auto p-2.5 space-y-2.5 transition-colors ${
                    isDropActive ? 'bg-emerald-50/30' : 'bg-[#f8fafc]/70'
                  }`}
                >
                  {colJourneys.length === 0 ? (
                    <div
                      className={`h-36 flex flex-col items-center justify-center text-center p-3 text-xs rounded-xl border-2 border-dashed transition-all ${
                        isDropActive
                          ? 'border-[#00a884] bg-[#e7f8e8]/50 text-[#00a884] font-bold'
                          : 'border-slate-200 text-[#8696a0]'
                      }`}
                    >
                      <GripVertical className="w-5 h-5 mb-1 text-slate-300" />
                      <span>{isDropActive ? 'Solte para mover para cá' : 'Nenhum lead nesta etapa'}</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">Arraste uma conversa aqui</span>
                    </div>
                  ) : (
                    colJourneys.map((journey) => {
                      const isCritical = journey.slaStatus === 'critical' || journey.slaMinutesRemaining <= 2;
                      const dealVal = getDealValue(journey);
                      const isBeingDragged = draggedJourneyId === journey.id;
                      const qualResult = evaluateQualification(journey);
                      const verifiedCount = qualResult.completedItems.filter((i) => i.verified).length;
                      const totalCount = qualResult.completedItems.length;
                      const qualPercent = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 100;

                      return (
                        <div
                          key={journey.id}
                          id={`kanban-card-${journey.id}`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, journey.id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => {
                            onSelectJourney(journey);
                            onSwitchToCockpit();
                          }}
                          className={`p-3 bg-white rounded-xl border transition-all text-left space-y-2 relative group cursor-grab active:cursor-grabbing hover:shadow-md ${
                            isBeingDragged ? 'opacity-40 scale-95 border-dashed border-[#00a884]' : ''
                          } ${
                            isCritical
                              ? 'border-rose-300 ring-1 ring-rose-300 bg-rose-50/20'
                              : 'border-[#e2e8f0] hover:border-[#00a884]'
                          }`}
                        >
                          {/* Drag indicator handle */}
                          <div className="absolute top-2 right-2 text-slate-300 group-hover:text-slate-500">
                            <GripVertical className="w-3.5 h-3.5" />
                          </div>

                          {/* Card Top: Avatar, Name & Deal Value */}
                          <div className="flex items-start justify-between gap-1.5 pr-4">
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                  isCritical
                                    ? 'bg-rose-600 text-white ring-2 ring-rose-300'
                                    : 'bg-[#dfe5e7] text-[#54656f]'
                                }`}
                              >
                                {journey.leadName.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <span className="font-bold text-xs text-[#111b21] truncate block">
                                  {journey.leadName}
                                </span>
                                <span className="text-[10px] text-[#667781] font-mono truncate block">
                                  {journey.leadPhone} {journey.leadCity ? `· ${journey.leadCity.split('-')[0]}` : ''}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Deal Value Pill (Clickable to Edit) */}
                          <div className="flex items-center justify-between gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingValueJourney(journey);
                                setTempValue(String(dealVal));
                              }}
                              title="Clique para editar valor estimado"
                              className="font-mono text-[11px] font-bold text-[#00a884] bg-[#e7f8e8] hover:bg-[#d1fae5] px-2 py-0.5 rounded-lg border border-[#a7f3d0] flex items-center gap-1 transition-all"
                            >
                              <DollarSign className="w-3 h-3" />
                              R$ {dealVal.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                            </button>

                            {/* Qualification Score Pill */}
                            <span
                              className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded border ${
                                qualPercent >= 70
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : qualPercent >= 40
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}
                              title={`Critérios de Qualificação: ${verifiedCount}/${totalCount} validados`}
                            >
                              {qualPercent}% Qualif.
                            </span>
                          </div>

                          {/* CTWA Campaign Attribution */}
                          {journey.acquisition.source === 'ctwa' && (
                            <div className="flex items-center gap-1 text-[9.5px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100 truncate">
                              <Tag className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">{journey.acquisition.campaignName || 'Anúncio CTWA'}</span>
                            </div>
                          )}

                          {/* Last Lead Message Preview */}
                          <div className="flex items-start gap-1.5 text-[11px] text-[#54656f] leading-snug bg-slate-50/80 p-1.5 rounded-lg border border-slate-100">
                            <span className="shrink-0 mt-0.5">
                              {renderDeliveryStatus(journey.lastMessageDeliveryStatus)}
                            </span>
                            <p className="line-clamp-2 italic text-[11px] text-[#3b4a54]">
                              "{journey.lastLeadMessage}"
                            </p>
                          </div>

                          {/* SLA and Operator Footer */}
                          <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-100">
                            <div className="flex items-center gap-1 font-mono">
                              <Clock className={`w-3 h-3 ${isCritical ? 'text-rose-600 animate-pulse' : 'text-slate-400'}`} />
                              <span className={isCritical ? 'text-rose-700 font-bold' : 'text-[#667781]'}>
                                SLA: {journey.slaMinutesRemaining}m
                              </span>
                            </div>

                            <span className="text-[10px] text-[#54656f] font-semibold truncate max-w-[110px] bg-slate-100 px-1.5 py-0.5 rounded">
                              {journey.assignedOperatorName || 'Fila Geral'}
                            </span>
                          </div>

                          {/* Quick Navigation / Move Buttons */}
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-between pt-1 gap-1 text-[10px]"
                          >
                            {colIdx > 0 ? (
                              <button
                                onClick={() => handleMoveStage(journey, KANBAN_COLUMNS[colIdx - 1].id)}
                                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                                title={`Voltar para ${KANBAN_COLUMNS[colIdx - 1].title}`}
                              >
                                <ArrowLeft className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setLostModalJourney(journey);
                                }}
                                className="p-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                                title="Marcar como Perdido"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              onClick={() => {
                                onSelectJourney(journey);
                                onSwitchToCockpit();
                              }}
                              className="flex-1 py-1 px-2 bg-[#00a884] text-white rounded-lg text-[10.5px] font-bold hover:bg-[#008069] shadow-2xs flex items-center justify-center gap-1 transition-all"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span>Atender</span>
                            </button>

                            {colIdx < KANBAN_COLUMNS.length - 1 ? (
                              <button
                                onClick={() => handleMoveStage(journey, KANBAN_COLUMNS[colIdx + 1].id)}
                                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-[#00a884] transition-colors"
                                title={`Avançar para ${KANBAN_COLUMNS[colIdx + 1].title}`}
                              >
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <span className="p-1 text-emerald-600 font-bold" title="Venda Ganha">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </span>
                            )}
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
      </div>

      {/* Edit Deal Value Modal */}
      {editingValueJourney && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[#111b21] flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-[#00a884]" />
                Atualizar Valor da Oportunidade
              </h3>
              <button
                onClick={() => setEditingValueJourney(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ×
              </button>
            </div>

            <p className="text-xs text-[#54656f]">
              Defina o valor estimado ou fechado para <strong>{editingValueJourney.leadName}</strong>.
            </p>

            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Valor do Negócio (BRL)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  R$
                </span>
                <input
                  type="number"
                  step="10"
                  value={tempValue}
                  onChange={(e) => setTempValue(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-[#111b21] focus:outline-none focus:border-[#00a884]"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingValueJourney(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const num = parseFloat(tempValue) || 0;
                  const updated: Journey = {
                    ...editingValueJourney,
                    estimatedDealValueBrl: num,
                    outcome: editingValueJourney.outcome
                      ? { ...editingValueJourney.outcome, dealValueBrl: num }
                      : undefined,
                  };
                  onUpdateJourney(updated);
                  setEditingValueJourney(null);
                }}
                className="px-4 py-1.5 text-xs font-bold bg-[#00a884] hover:bg-[#008069] text-white rounded-xl shadow-2xs transition-all"
              >
                Salvar Valor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lost Deal Modal */}
      {lostModalJourney && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-rose-700 flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-rose-600" />
                Marcar Lead como Perdido
              </h3>
              <button
                onClick={() => setLostModalJourney(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ×
              </button>
            </div>

            <p className="text-xs text-[#54656f]">
              Informe o motivo da perda de <strong>{lostModalJourney.leadName}</strong> para fins de análise de conversão.
            </p>

            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Motivo da Perda
              </label>
              <select
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-[#111b21] focus:outline-none focus:border-rose-500"
              >
                <option value="Sem resposta após envio de proposta">Sem resposta após envio de proposta</option>
                <option value="Preço acima do orçamento do lead">Preço acima do orçamento do lead</option>
                <option value="Comprou de concorrente">Comprou de concorrente</option>
                <option value="Sem horário/agenda compatível">Sem horário/agenda compatível</option>
                <option value="Desistiu / mudança de planos">Desistiu / mudança de planos</option>
                <option value="Lead desqualificado (fora do perfil)">Lead desqualificado (fora do perfil)</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setLostModalJourney(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  handleMoveStage(lostModalJourney, 'lost', 0, lostReason);
                  setLostModalJourney(null);
                }}
                className="px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-2xs transition-all"
              >
                Confirmar Perda
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
