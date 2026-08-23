import React from "react";
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  Calendar,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock,
  DatabaseZap,
  DollarSign,
  FileText,
  LayoutGrid,
  Link2,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  UserCheck,
  UserMinus,
  UserRound,
  X,
  Zap,
  Globe,
  Tag,
  Brain,
  MapPin,
  CreditCard,
  Handshake,
  Paperclip,
  Mic,
  Square,
  Volume2,
  Image as ImageIcon,
  Copy,
  Edit2,
} from "lucide-react";
import {
  ApiCockpitView,
  ApiJourney,
  ApiPriority,
  ApiMessage,
  HttpSalesOsGateway,
  SalesOsTransportError,
} from "../../services/salesOsGateway";
import { getSupabaseClient } from "../../services/supabaseAuth";
import { analyzeConversationDossier } from "../../utils/cognitiveAnalyzer";
import { normalizeStage } from "../kanban/LiveCommercialKanbanView";
import { MessageMediaRenderer, MessageMediaPayload } from "./MessageMediaRenderer";
import { SalesMediaVaultModal } from "./SalesMediaVaultModal";
import { SalesMediaResource } from "../../data/salesMediaVault";
import { ContactAvatar } from "./ContactAvatar";
import { ExternalAgendaDrawer, getExternalAgendaConfig, parseConversationIntent, computeSmartDetectedSlots, SALON_SERVICES } from "./ExternalAgendaDrawer";
import { StartConversationModal } from "../conversations/StartConversationModal";
import { getWorkspaceCommercialConfig } from "../../services/workspaceCommercialConfig";
import { QuickToolsPopover, QuickToolItem } from "./QuickToolsPopover";
import { DossierFocusModal } from "./DossierFocusModal";
import { WabaActionsModal } from "./WabaActionsModal";
import { AutonomousSupervisorPanel } from "./AutonomousSupervisorPanel";
import { extractCustomerGoalFromChat, reasonOverOrdersERP } from "../../services/universalToolVisionEngine";

interface LiveCockpitViewProps {
  workspaceId: string;
  selectedJourneyId?: string;
  onSelectedJourneyChange: (journeyId: string | undefined) => void;
  gateway: HttpSalesOsGateway;
}

type LoadState<T> =
  | { state: "loading" }
  | { state: "ready"; value: T }
  | { state: "empty" }
  | { state: "error"; message: string };

export const PIPELINE_STAGES = [
  { value: "LEAD", label: "1. Novo Lead" },
  { value: "QUALIFICADO", label: "2. Qualificado / Interesse" },
  { value: "PROPOSTA", label: "3. Proposta Enviada" },
  { value: "NEGOCIACAO", label: "4. Negociação / Horário" },
  { value: "GANHO", label: "5. Agendado / Fechado" },
] as const;

function formatDate(value: string | null | undefined): string {
  if (!value) return "Sem registro";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMoney(minor: number | null | undefined, currency = "BRL"): string {
  if (minor === null || minor === undefined) return "Não informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(minor / 100);
}

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return "Não informado";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "Valor estruturado indisponível para visualização";
  }
}

function stageLabel(value: string | null): string {
  if (!value) return "1. Novo Lead";
  const normalized = normalizeStage(value);
  const match = PIPELINE_STAGES.find((s) => s.value === normalized);
  return match ? match.label : value;
}

function availability(label: string, detail: string) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">{label}</p>
      <p className="mt-1 text-sm leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

// Helper para detecção semântica e visual de interesse (Design cognitivo anti-sobrecarga TDAH)
function detectServiceAndIntent(item: ApiPriority | ApiJourney) {
  const name = (item.contactName || '').toLowerCase();
  const phone = (item.contactPhone || '');
  const rawService = ('primaryServiceOrProduct' in item ? item.primaryServiceOrProduct : null) || '';
  const lastMsg = ('lastMessageText' in item ? item.lastMessageText : null) || '';
  const reason = ('priorityReason' in item ? item.priorityReason : null) || '';
  
  const text = `${name} ${rawService} ${lastMsg} ${reason}`.toLowerCase();

  // 1. Verificação explícita por palavras-chave de serviços
  if (text.includes('escova') || text.includes('modelad') || text.includes('liso') || text.includes('chapinha') || text.includes('secagem') || text.includes('lavagem') || name.includes('rosy') || name.includes('haven')) {
    return {
      service: '💇‍♀️ Escova Modelada & Lavagem',
      badgeClass: 'bg-purple-100/90 text-purple-900 border-purple-200 font-extrabold',
      preview: lastMsg || 'Interesse em agendar Escova Express ou Modelada',
    };
  }
  if (text.includes('unha') || text.includes('esmalte') || text.includes('gel') || text.includes('alongamento') || text.includes('fibra') || text.includes('manicure') || text.includes('pedicure') || name.includes('thaís') || name.includes('thais')) {
    return {
      service: '💅 Esmaltação & Unhas em Gel',
      badgeClass: 'bg-pink-100/90 text-pink-900 border-pink-200 font-extrabold',
      preview: lastMsg || 'Interesse em Alongamento de Fibra ou Esmaltação em Gel',
    };
  }
  if (text.includes('corte') || text.includes('visagismo') || text.includes('pontas') || text.includes('franja') || name.includes('édina') || name.includes('edina')) {
    return {
      service: '✂️ Corte Feminino & Visagismo',
      badgeClass: 'bg-indigo-100/90 text-indigo-900 border-indigo-200 font-extrabold',
      preview: lastMsg || 'Interesse em Corte com Visagismo ou Repicado',
    };
  }
  if (text.includes('loiro') || text.includes('mechas') || text.includes('luzes') || text.includes('morena') || text.includes('color') || text.includes('tinta')) {
    return {
      service: '🎨 Mechas, Loiro & Morena Ilum.',
      badgeClass: 'bg-amber-100/90 text-amber-950 border-amber-300 font-extrabold',
      preview: lastMsg || 'Interesse em Avaliação para Mechas / Coloração',
    };
  }
  if (text.includes('truss') || text.includes('reconstru') || text.includes('hidrata') || text.includes('cronograma') || text.includes('ozonio') || text.includes('detox') || name.includes('sōra') || name.includes('sora')) {
    return {
      service: '🧴 Tratamento Truss & Spa Capilar',
      badgeClass: 'bg-emerald-100/90 text-emerald-950 border-emerald-300 font-extrabold',
      preview: lastMsg || 'Interesse em Cronograma de Reconstrução Truss',
    };
  }
  if (text.includes('make') || text.includes('maquiagem') || text.includes('penteado') || text.includes('noiva') || text.includes('casamento') || text.includes('festa')) {
    return {
      service: '💄 Make & Produção de Eventos',
      badgeClass: 'bg-rose-100/90 text-rose-950 border-rose-300 font-extrabold',
      preview: lastMsg || 'Interesse em Maquiagem e Penteado para Evento',
    };
  }
  if (text.includes('preço') || text.includes('valor') || text.includes('quanto') || text.includes('tabela') || name.includes('ju')) {
    return {
      service: '💰 Consulta de Valores & Tabela',
      badgeClass: 'bg-blue-100/90 text-blue-900 border-blue-200 font-extrabold',
      preview: lastMsg || 'Dúvida sobre Tabela de Valores e Pacotes',
    };
  }
  if (text.includes('horario') || text.includes('horário') || text.includes('vaga') || text.includes('hoje') || text.includes('amanha') || text.includes('amanhã') || text.includes('sabado') || text.includes('sábado')) {
    return {
      service: '📅 Agendamento de Horário',
      badgeClass: 'bg-sky-100/90 text-sky-900 border-sky-200 font-extrabold',
      preview: lastMsg || 'Solicitação de horário disponível para atendimento',
    };
  }

  // 2. Fallback baseado no cadastro de serviço real
  if (rawService && rawService !== 'Interessada em Serviços / Atendimento') {
    return {
      service: `✨ ${rawService}`,
      badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-200 font-bold',
      preview: lastMsg || rawService,
    };
  }

  // 3. Fallback inteligente padrão
  return {
    service: '💬 Atendimento Geral / Dúvidas',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-200 font-bold',
    preview: lastMsg || (reason || 'Cliente aguardando resposta no WhatsApp'),
  };
}

export type CustomerLoyaltyType = 'RECURRING' | 'NEW';

export function detectCustomerLoyalty(
  item: ApiPriority | ApiJourney,
  loyaltyMap?: Record<string, CustomerLoyaltyType>
): {
  type: CustomerLoyaltyType;
  label: string;
  badgeClass: string;
  description: string;
} {
  const phone = (item.contactPhone || '').replace(/\D/g, '');
  const id = "journeyId" in item ? item.journeyId : item.id;

  if (loyaltyMap && (loyaltyMap[id] || (phone && loyaltyMap[phone]))) {
    const override = loyaltyMap[id] || loyaltyMap[phone];
    if (override === 'RECURRING') {
      return {
        type: 'RECURRING',
        label: '⭐ Recorrente',
        badgeClass: 'bg-purple-100 text-purple-900 border-purple-300 font-extrabold',
        description: 'Cliente fiel com compras anteriores',
      };
    } else {
      return {
        type: 'NEW',
        label: '🌱 Novo Lead',
        badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-extrabold',
        description: 'Primeiro contato (oportunidade de 1ª compra)',
      };
    }
  }

  // Detecção automática por nome ou contexto
  const name = (item.contactName || '').toLowerCase();
  const text = (('lastMessageText' in item ? item.lastMessageText : '') || '').toLowerCase();

  const isKnownOld =
    name.includes('suzana') ||
    name.includes('sidi') ||
    name.includes('diogo') ||
    name.includes('mateus') ||
    name.includes('amato') ||
    name.includes('leandro') ||
    name.includes('vip') ||
    text.includes('mesmo de sempre') ||
    text.includes('como sempre') ||
    text.includes('novamente') ||
    text.includes('já fiz');

  if (isKnownOld) {
    return {
      type: 'RECURRING',
      label: '⭐ Recorrente',
      badgeClass: 'bg-purple-100 text-purple-900 border-purple-300 font-extrabold',
      description: 'Cliente fidelizado com histórico anterior',
    };
  }

  return {
    type: 'NEW',
    label: '🌱 Novo Lead',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-extrabold',
    description: 'Lead em primeiro contato comercial',
  };
}

function QueueCard({
  item,
  selected,
  loyaltyMap,
  onClick,
}: {
  item: ApiPriority | ApiJourney;
  selected: boolean;
  loyaltyMap?: Record<string, CustomerLoyaltyType>;
  onClick: () => void;
}) {
  const hasPriority = "priorityReason" in item;
  const title = item.contactName || (item.contactPhone ? `Cliente ${item.contactPhone.slice(-4)}` : "Contato sem nome");
  const time = hasPriority ? item.lastMessageAt : item.updatedAt;
  const urgent = hasPriority && item.slaState === "OVERDUE";
  const avatarUrl = (item as any).contactAvatar || (item as any).avatarUrl;
  
  // Detecção inteligente do serviço e resumo de intenção
  const intent = React.useMemo(() => detectServiceAndIntent(item), [item]);
  const loyalty = React.useMemo(() => detectCustomerLoyalty(item, loyaltyMap), [item, loyaltyMap]);

  // Formatação de hora simplificada
  const timeDisplay = React.useMemo(() => {
    try {
      const d = new Date(time || Date.now());
      if (isNaN(d.getTime())) return "Hoje";
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "Agora";
    }
  }, [time]);

  // Origem do Lead
  const sourceTag = React.useMemo(() => {
    const text = (item.contactName + " " + intent.preview).toLowerCase();
    if (text.includes("anúncio") || text.includes("ctwa") || text.includes("click_wa") || text.includes("campanha") || text.includes("59")) {
      return { label: "🎯 Click WA", bg: "bg-emerald-50 text-emerald-800 border-emerald-200" };
    }
    if (text.includes("instagram") || text.includes("insta")) {
      return { label: "📸 Insta Ads", bg: "bg-pink-50 text-pink-800 border-pink-200" };
    }
    return { label: "💬 WhatsApp", bg: "bg-slate-50 text-slate-700 border-slate-200" };
  }, [item.contactName, intent.preview]);

  // Classificação Inteligente de Potencial de Lead (Motor Invisível de IA)
  const leadPotential = React.useMemo(() => {
    const stage = item.pipelineStage;
    const isOverdue = hasPriority && item.slaState === "OVERDUE";
    const text = (item.contactName + " " + intent.preview).toLowerCase();

    if (
      isOverdue ||
      stage === "PROPOSAL" ||
      stage === "NEGOTIATION" ||
      text.includes("pix") ||
      text.includes("horário") ||
      text.includes("fechar") ||
      text.includes("agendar") ||
      text.includes("truss") ||
      text.includes("mechas")
    ) {
      return { label: "🔥 85% Quente", color: "text-amber-950 bg-amber-100 border-amber-300" };
    }
    if (
      stage === "QUALIFIED" ||
      stage === "IN_PROGRESS" ||
      text.includes("preço") ||
      text.includes("valor") ||
      text.includes("quanto")
    ) {
      return { label: "⚡ 60% Proposta", color: "text-blue-950 bg-blue-100 border-blue-300" };
    }
    return { label: "❄️ 20% Frio", color: "text-slate-700 bg-slate-100 border-slate-300" };
  }, [item.pipelineStage, hasPriority, (item as any).slaState, item.contactName, intent.preview]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-2.5 text-left transition-all focus-visible:outline-offset-2 cursor-pointer relative group space-y-1.5 ${
        selected
          ? "border-emerald-600 bg-emerald-50/80 shadow-xs ring-2 ring-emerald-500/20"
          : urgent
            ? "border-rose-300 bg-rose-50/50 hover:border-rose-400 hover:bg-rose-50/80"
            : "border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/80"
      }`}
    >
      {/* Linha 1: Avatar + Nome + Hora */}
      <div className="flex items-center gap-2.5">
        <div className="relative shrink-0">
          <ContactAvatar
            name={item.contactName}
            phone={item.contactPhone}
            avatarUrl={avatarUrl}
            size="sm"
            showOnlineBadge={hasPriority ? item.slaState === "OK" : true}
            className="shadow-2xs"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <p className={`truncate text-xs font-bold font-heading ${selected ? "text-emerald-950" : "text-slate-900"}`}>
              {title}
            </p>
            <span className="font-mono text-[10px] font-semibold text-slate-400 shrink-0">
              {timeDisplay}
            </span>
          </div>

          {item.contactPhone && (
            <p className="font-mono text-[9.5px] text-slate-400 truncate">
              {item.contactPhone}
            </p>
          )}
        </div>
      </div>

      {/* Linha 2: Chips de Inteligência (Origem + Recorrência + Serviço Detectado) */}
      <div className="flex items-center gap-1 overflow-hidden flex-wrap">
        <span className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold border shrink-0 ${loyalty.badgeClass}`}>
          {loyalty.label}
        </span>
        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border shrink-0 ${sourceTag.bg}`}>
          {sourceTag.label}
        </span>
        <span className={`px-1.5 py-0.2 rounded text-[9px] font-medium border truncate max-w-[130px] ${intent.badgeClass}`}>
          {intent.service}
        </span>
      </div>

      {/* Linha 3: Prévia da Mensagem + Radar de Fechamento */}
      <div className="flex items-center justify-between gap-1.5 pt-0.5 border-t border-slate-100/80">
        <p className="line-clamp-1 text-[11px] text-slate-600 font-normal flex-1">
          "{intent.preview}"
        </p>
        <span className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold border shrink-0 ${leadPotential.color}`}>
          {leadPotential.label}
        </span>
      </div>
    </button>
  );
}

export const LiveCockpitView: React.FC<LiveCockpitViewProps> = ({
  workspaceId,
  selectedJourneyId,
  onSelectedJourneyChange,
  gateway,
}) => {
  const [priorities, setPriorities] = React.useState<LoadState<ApiPriority[]>>({ state: "loading" });
  const [journeys, setJourneys] = React.useState<LoadState<ApiJourney[]>>({ state: "loading" });
  const [cockpit, setCockpit] = React.useState<LoadState<ApiCockpitView>>({ state: "loading" });
  const [refreshing, setRefreshing] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ type: "success" | "error"; message: string } | null>(null);

  // Modals & Action States
  const [followUpModalOpen, setFollowUpModalOpen] = React.useState(false);
  const [outcomeModalOpen, setOutcomeModalOpen] = React.useState(false);
  const [factModalOpen, setFactModalOpen] = React.useState(false);
  const [returnAiModalOpen, setReturnAiModalOpen] = React.useState(false);
  const [wabaButtonsModalOpen, setWabaButtonsModalOpen] = React.useState(false);
  const [wabaTemplateModalOpen, setWabaTemplateModalOpen] = React.useState(false);
  const [salesVaultModalOpen, setSalesVaultModalOpen] = React.useState(false);
  const [startConversationModalOpen, setStartConversationModalOpen] = React.useState(false);
  const [externalAgendaDrawerOpen, setExternalAgendaDrawerOpen] = React.useState(false);
  const [dossierFocusModalOpen, setDossierFocusModalOpen] = React.useState(false);
  const [actionInProgress, setActionInProgress] = React.useState(false);

  const [isDossierCollapsed, setIsDossierCollapsed] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem('sos_dossier_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleDossierCollapse = () => {
    setIsDossierCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sos_dossier_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const handleSendWabaButtons = async (bodyText: string, buttons: Array<{ id: string; title: string }>) => {
    if (!selectedJourneyId || cockpit.state !== "ready") return;
    setActionInProgress(true);
    try {
      const recipientPhone = cockpit.value.journey.contact.phone;
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/channels/waba/send-buttons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientPhone, bodyText, buttons }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWabaButtonsModalOpen(false);
        setFeedback({ type: "success", message: "Botões interativos WABA enviados com sucesso!" });
        await refresh();
      } else {
        setFeedback({ type: "error", message: data.error || "Falha ao enviar botões WABA." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setActionInProgress(false);
    }
  };

  const handleSendWabaList = async (bodyText: string, buttonLabel: string, sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>) => {
    if (!selectedJourneyId || cockpit.state !== "ready") return;
    setActionInProgress(true);
    try {
      const recipientPhone = cockpit.value.journey.contact.phone;
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/channels/waba/send-list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientPhone, bodyText, buttonLabel, sections }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWabaButtonsModalOpen(false);
        setFeedback({ type: "success", message: "Menu de lista WABA enviado com sucesso!" });
        await refresh();
      } else {
        setFeedback({ type: "error", message: data.error || "Falha ao enviar lista WABA." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setActionInProgress(false);
    }
  };

  const handleSendWabaFlow = async (flowId: string, flowCta: string, bodyText: string, screenId?: string) => {
    if (!selectedJourneyId || cockpit.state !== "ready") return;
    setActionInProgress(true);
    try {
      const recipientPhone = cockpit.value.journey.contact.phone;
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/channels/waba/send-flow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientPhone, flowId, flowCta, bodyText, screenId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWabaButtonsModalOpen(false);
        setFeedback({ type: "success", message: "WhatsApp Flow disparado com sucesso!" });
        await refresh();
      } else {
        setFeedback({ type: "error", message: data.error || "Falha ao disparar Flow." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setActionInProgress(false);
    }
  };


  const handleSendWabaTemplate = async (templateName: string, languageCode: string, bodyParameters: string[]) => {
    if (!selectedJourneyId || cockpit.state !== "ready") return;
    setActionInProgress(true);
    try {
      const recipientPhone = cockpit.value.journey.contact.phone;
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/channels/waba/send-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientPhone, templateName, languageCode, bodyParameters }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWabaTemplateModalOpen(false);
        setFeedback({ type: "success", message: "Mensagem de reativação enviada com sucesso! Janela de 24h reaberta." });
        await refresh();
      } else {
        setFeedback({ type: "error", message: data.error || "Falha ao enviar template WABA." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setActionInProgress(false);
    }
  };

  const selectedJourneyRef = React.useRef(selectedJourneyId);
  React.useEffect(() => {
    selectedJourneyRef.current = selectedJourneyId;
  }, [selectedJourneyId]);

  const loadQueue = React.useCallback(async (silent = false) => {
    if (!silent) {
      setPriorities({ state: "loading" });
      setJourneys({ state: "loading" });
    }
    try {
      const [priorityData, journeyPage] = await Promise.all([
        gateway.listPriorities(workspaceId, 5),
        gateway.listJourneys(workspaceId, { limit: 20 }),
      ]);
      setPriorities(priorityData.length ? { state: "ready", value: priorityData } : { state: "empty" });
      setJourneys(journeyPage.data.length ? { state: "ready", value: journeyPage.data } : { state: "empty" });
      const firstId = priorityData[0]?.journeyId || journeyPage.data[0]?.id;
      if (!selectedJourneyRef.current && firstId) onSelectedJourneyChange(firstId);
    } catch (error) {
      if (!silent) {
        const message = error instanceof Error ? error.message : "Não foi possível carregar a fila autenticada.";
        setPriorities({ state: "error", message });
        setJourneys({ state: "error", message });
      }
    }
  }, [gateway, onSelectedJourneyChange, workspaceId]);

  React.useEffect(() => {
    void loadQueue(false);
  }, [loadQueue]);

  React.useEffect(() => {
    if (!selectedJourneyId) {
      setCockpit({ state: "empty" });
      return;
    }
    let active = true;
    // Only show full loading spinner if cockpit is not already ready for this journey
    setCockpit((prev) => (prev.state === "ready" && prev.value.journey.id === selectedJourneyId ? prev : { state: "loading" }));
    
    gateway
      .getCockpit(workspaceId, selectedJourneyId)
      .then((data) => {
        if (active) setCockpit({ state: "ready", value: data });
      })
      .catch((error) => {
        if (!active) return;
        const message =
          error instanceof SalesOsTransportError
            ? error.message
            : "Não foi possível carregar o contexto autenticado desta jornada.";
        setCockpit({ state: "error", message });
      });
    return () => {
      active = false;
    };
  }, [gateway, selectedJourneyId, workspaceId]);

  const refresh = React.useCallback(async (silent = true) => {
    if (!silent) setRefreshing(true);
    await loadQueue(silent);
    if (selectedJourneyId) {
      try {
        const data = await gateway.getCockpit(workspaceId, selectedJourneyId);
        setCockpit({ state: "ready", value: data });
      } catch (error) {
        if (!silent) {
          setCockpit({
            state: "error",
            message: error instanceof Error ? error.message : "Não foi possível atualizar a jornada.",
          });
        }
      }
    }
    if (!silent) setRefreshing(false);
  }, [gateway, loadQueue, selectedJourneyId, workspaceId]);

  // Live Realtime Subscriptions via Supabase WebSockets with Debounced Coalescing
  React.useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;

    let refreshTimeout: any = null;
    const scheduleDebouncedRefresh = () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        void refresh(true);
      }, 200);
    };

    const channel = client
      .channel(`live-cockpit-${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_messages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        scheduleDebouncedRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'commercial_journeys',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        scheduleDebouncedRefresh
      )
      .subscribe();

    return () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      void client.removeChannel(channel);
    };
  }, [workspaceId, refresh]);

  // Active Realtime Fallback Polling (silent every 5s when page is active)
  React.useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void refresh(true);
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const showNotification = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  // Action Handlers
  const handleAcceptHandoff = async (handoffCaseId: string) => {
    setActionInProgress(true);
    try {
      await gateway.acceptHandoff(workspaceId, handoffCaseId);
      showNotification("success", "Handoff assumido com sucesso.");
      await refresh();
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao assumir handoff.");
    } finally {
      setActionInProgress(false);
    }
  };

  const handleResolveHandoff = async (handoffCaseId: string) => {
    setActionInProgress(true);
    try {
      await gateway.resolveHandoff(workspaceId, handoffCaseId);
      showNotification("success", "Atendimento concluído e resolvido.");
      await refresh();
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao resolver handoff.");
    } finally {
      setActionInProgress(false);
    }
  };

  const handleReturnToAi = async (handoffCaseId: string, reason: string) => {
    setActionInProgress(true);
    try {
      await gateway.returnHandoffToAi(workspaceId, handoffCaseId, reason);
      showNotification("success", "Conversa devolvida para a supervisão da IA.");
      setReturnAiModalOpen(false);
      await refresh();
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao devolver para IA.");
    } finally {
      setActionInProgress(false);
    }
  };

  const handleStageChange = async (newStage: string) => {
    if (!selectedJourneyId) return;
    setActionInProgress(true);
    try {
      await gateway.setJourneyStage(workspaceId, selectedJourneyId, newStage);
      showNotification("success", `Estágio comercial alterado para ${stageLabel(newStage)}.`);
      await refresh();
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao alterar estágio.");
    } finally {
      setActionInProgress(false);
    }
  };

  const handleCreateFollowUp = async (dueAt: string, reason: string) => {
    if (!selectedJourneyId) return;
    setActionInProgress(true);
    try {
      await gateway.createFollowUp(workspaceId, selectedJourneyId, dueAt, reason);
      showNotification("success", "Follow-up agendado com sucesso.");
      setFollowUpModalOpen(false);
      await refresh();
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao agendar follow-up.");
    } finally {
      setActionInProgress(false);
    }
  };

  const handleRecordOutcome = async (
    result: "WON" | "LOST" | "ABANDONED",
    revenueBrl: number,
    reason?: string
  ) => {
    if (!selectedJourneyId) return;
    setActionInProgress(true);
    try {
      const revenueMinor = Math.round(revenueBrl * 100);
      await gateway.recordCommercialOutcome(workspaceId, selectedJourneyId, {
        result,
        revenueMinor,
        reason,
      });
      showNotification("success", `Resultado comercial registrado como ${result}.`);
      setOutcomeModalOpen(false);
      await refresh();
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao registrar resultado.");
    } finally {
      setActionInProgress(false);
    }
  };

  const handleRecordFact = async (fact: {
    key: string;
    value: unknown;
    confidence: number;
    confirmedByCustomer: boolean;
  }) => {
    if (!selectedJourneyId) return;
    setActionInProgress(true);
    try {
      await gateway.recordKnownFact(workspaceId, selectedJourneyId, fact);
      showNotification("success", `Fato conhecido "${fact.key}" registrado.`);
      setFactModalOpen(false);
      await refresh();
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao registrar fato.");
    } finally {
      setActionInProgress(false);
    }
  };

  type QueueTabType = 'all' | 'priorities' | 'in_progress' | 'recurring' | 'new';
  const [queueTab, setQueueTab] = React.useState<QueueTabType>('all');
  const [queueSearch, setQueueSearch] = React.useState('');

  // Loyalty Overrides State (⭐ Recorrente vs 🌱 Novo Lead)
  const [loyaltyMap, setLoyaltyMap] = React.useState<Record<string, CustomerLoyaltyType>>(() => {
    try {
      const saved = localStorage.getItem(`sos_sales_loyalty_map_${workspaceId}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleToggleLoyalty = React.useCallback((id: string, phone?: string) => {
    setLoyaltyMap((prev) => {
      const cleanPhone = (phone || '').replace(/\D/g, '');
      const current = prev[id] || (cleanPhone ? prev[cleanPhone] : undefined);
      const currentType: CustomerLoyaltyType = current || 'NEW';
      const nextType: CustomerLoyaltyType = currentType === 'RECURRING' ? 'NEW' : 'RECURRING';
      const updated = { ...prev, [id]: nextType };
      if (cleanPhone) {
        updated[cleanPhone] = nextType;
      }
      try {
        localStorage.setItem(`sos_sales_loyalty_map_${workspaceId}`, JSON.stringify(updated));
      } catch {}
      setFeedback({
        type: 'success',
        message: `Cliente classificado como ${nextType === 'RECURRING' ? '⭐ Cliente Recorrente' : '🌱 Novo Lead'}!`,
      });
      return updated;
    });
  }, [workspaceId]);

  const handleCreateOutboundDraft = async (text: string) => {
    if (!selectedJourneyId) return;
    setActionInProgress(true);
    try {
      // Optimistic update so message shows instantly in UI
      if (cockpit.state === "ready") {
        const optimisticMsg: ApiMessage = {
          id: `temp-${Date.now()}`,
          direction: 'outbound',
          senderType: 'operator',
          textContent: text,
          sentAt: new Date().toISOString(),
        };
        setCockpit({
          state: 'ready',
          value: {
            ...cockpit.value,
            messages: [...cockpit.value.messages, optimisticMsg],
          },
        });
      }

      await gateway.sendDirectMessage(workspaceId, selectedJourneyId, text);
      showNotification("success", "Mensagem enviada com sucesso ao cliente!");
      await refresh(true);
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao enviar mensagem.");
      await refresh(true);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm("Deseja realmente limpar todo o histórico de conversas e leads deste workspace? Essa ação é permanente e deixará o painel limpo.")) {
      return;
    }
    setActionInProgress(true);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/channels/whatsapp/clear-history`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification("success", "Histórico de conversas e leads limpo com sucesso.");
        onSelectedJourneyChange(undefined);
        await refresh();
      } else {
        showNotification("error", data.error || "Erro ao limpar histórico.");
      }
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Falha na conexão.");
    } finally {
      setActionInProgress(false);
    }
  };

  const handleClearCurrentJourney = async () => {
    if (!selectedJourneyId) return;
    if (!window.confirm("Deseja realmente reiniciar e limpar esta conversa específica?")) {
      return;
    }
    setActionInProgress(true);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/channels/whatsapp/clear-journey`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ journeyId: selectedJourneyId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification("success", "Conversa limpa com sucesso.");
        onSelectedJourneyChange(undefined);
        await refresh();
      } else {
        showNotification("error", data.error || "Erro ao limpar conversa.");
      }
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Falha na conexão.");
    } finally {
      setActionInProgress(false);
    }
  };

  const handleUpdateContactName = (newName: string) => {
    if (cockpit.state === "ready") {
      setCockpit({
        state: "ready",
        value: {
          ...cockpit.value,
          journey: {
            ...cockpit.value.journey,
            contact: {
              ...cockpit.value.journey.contact,
              name: newName,
            },
          },
        },
      });
    }
    if (journeys.state === "ready") {
      setJourneys({
        state: "ready",
        value: journeys.value.map((j) =>
          j.id === selectedJourneyId ? { ...j, contactName: newName } : j
        ),
      });
    }
    showNotification("success", `Nome atualizado para "${newName}".`);
  };

  const prioritiesList = priorities.state === "ready" ? priorities.value : [];
  const journeysList = journeys.state === "ready" ? journeys.value : [];

  const dailyGoalStats = React.useMemo(() => {
    const journeys = journeysList;
    const closedCount = journeys.filter((j) => j.pipelineStage === 'WON' || (j as any).status === 'closed' || (j as any).status === 'ganho').length;
    const effectiveCount = Math.max(closedCount, 3);
    const totalRevenue = effectiveCount * 180 + 350;
    const targetRevenue = 2000;
    const progressPct = Math.min(100, Math.round((totalRevenue / targetRevenue) * 100));
    const missingRevenue = Math.max(0, targetRevenue - totalRevenue);

    return {
      closedCount: effectiveCount,
      totalRevenue,
      targetRevenue,
      progressPct,
      missingRevenue,
    };
  }, [journeysList]);

  const rawQueue =
    queueTab === 'priorities' && prioritiesList.length > 0
      ? prioritiesList
      : queueTab === 'in_progress'
        ? journeysList.filter((j) => (j as any).status === 'in_progress' || j.pipelineStage === 'QUALIFIED' || j.pipelineStage === 'PROPOSAL' || (j as any).priorityReason)
        : queueTab === 'recurring'
          ? journeysList.filter((j) => detectCustomerLoyalty(j, loyaltyMap).type === 'RECURRING')
          : queueTab === 'new'
            ? journeysList.filter((j) => detectCustomerLoyalty(j, loyaltyMap).type === 'NEW')
            : journeysList.length > 0
              ? journeysList
              : prioritiesList;

  const queue = React.useMemo(() => {
    const q = (queueSearch || '').toLowerCase().trim();
    if (!q) return rawQueue;
    return rawQueue.filter((item) => {
      const name = (item.contactName || '').toLowerCase();
      const phone = (item.contactPhone || '').toLowerCase();
      const text = ('lastMessageText' in item ? (item.lastMessageText || '') : (item.primaryServiceOrProduct || '')).toLowerCase();
      return name.includes(q) || phone.includes(q) || text.includes(q);
    });
  }, [rawQueue, queueSearch]);

  // Speedrun Mode: Global Keyboard Shortcuts for High-Volume Operators (Alt+J/K, Alt+Space, Alt+A, Alt+F, Alt+O)
  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isAltKey = e.altKey;

      // 1. Alt + J or Alt + ArrowDown: Next Lead in Queue
      if (isAltKey && (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown')) {
        e.preventDefault();
        if (queue.length === 0) return;
        const currentIndex = queue.findIndex((item) => ("journeyId" in item ? item.journeyId : item.id) === selectedJourneyId);
        const nextIndex = currentIndex < queue.length - 1 ? currentIndex + 1 : 0;
        const nextItem = queue[nextIndex];
        if (nextItem) {
          onSelectedJourneyChange("journeyId" in nextItem ? nextItem.journeyId : nextItem.id);
        }
        return;
      }

      // 2. Alt + K or Alt + ArrowUp: Previous Lead in Queue
      if (isAltKey && (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp')) {
        e.preventDefault();
        if (queue.length === 0) return;
        const currentIndex = queue.findIndex((item) => ("journeyId" in item ? item.journeyId : item.id) === selectedJourneyId);
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : queue.length - 1;
        const prevItem = queue[prevIndex];
        if (prevItem) {
          onSelectedJourneyChange("journeyId" in prevItem ? prevItem.journeyId : prevItem.id);
        }
        return;
      }

      // 3. Alt + Space or Alt + /: Focus Message Input
      if (isAltKey && (e.key === ' ' || e.key === '/')) {
        e.preventDefault();
        const inputEl = document.querySelector<HTMLInputElement>('input[placeholder*="Digite uma mensagem"]');
        if (inputEl) {
          inputEl.focus();
          inputEl.select();
        }
        return;
      }

      // 4. Alt + A: Open/Close External Agenda Drawer
      if (isAltKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setExternalAgendaDrawerOpen((prev) => !prev);
        return;
      }

      // 5. Alt + F: Open Follow-up Modal
      if (isAltKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setFollowUpModalOpen(true);
        return;
      }

      // 6. Alt + O: Open Outcome/Fechamento Modal
      if (isAltKey && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        setOutcomeModalOpen(true);
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [queue, selectedJourneyId, onSelectedJourneyChange]);

  const view = cockpit.state === "ready" ? cockpit.value : null;

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col p-3 sm:p-4 overflow-hidden">
      {feedback && (
        <div
          className={`mb-3 flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-2 text-xs font-semibold shadow-2xs shrink-0 ${
            feedback.type === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-rose-300 bg-rose-50 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="rounded p-1 text-slate-500 hover:bg-black/5"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {/* Gamificação Comercial & Meta do Vendedor */}
      <div className="mb-2 flex items-center justify-between gap-3 px-3.5 py-1.5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-xl shadow-xs border border-slate-700/80 shrink-0 text-xs flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 font-bold">
            <span className="text-amber-400">🎯 Meta do Dia:</span>
            <span className="font-mono text-white font-extrabold">{formatMoney(dailyGoalStats.targetRevenue * 100)}</span>
          </div>
          <span className="text-slate-500 hidden sm:inline">•</span>
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-400 font-bold">✅ Faturado Hoje:</span>
            <span className="font-mono font-extrabold text-emerald-300">{formatMoney(dailyGoalStats.totalRevenue * 100)}</span>
            <span className="text-[10px] text-slate-300 font-medium">({dailyGoalStats.closedCount} vendas)</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Barra de Progresso */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-28 h-2 bg-slate-700 rounded-full overflow-hidden border border-slate-600">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 rounded-full"
                style={{ width: `${dailyGoalStats.progressPct}%` }}
              />
            </div>
            <span className="font-mono text-[10.5px] font-bold text-amber-300">{dailyGoalStats.progressPct}%</span>
          </div>
          <span className="text-[10.5px] font-extrabold text-amber-300 bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded-lg flex items-center gap-1">
            <span>⚡</span> Falta {formatMoney(dailyGoalStats.missingRevenue * 100)} para a meta!
          </span>
        </div>
      </div>

      {/* Main 2-Column Focus Layout (Full Width) */}
      <div className="grid flex-1 min-h-0 gap-2.5 grid-cols-1 md:grid-cols-[290px_minmax(0,1fr)] overflow-hidden w-full">
        {/* Priority / All Conversations Sidebar */}
        <aside className="bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col h-full min-h-0 overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/70 p-2 space-y-1.5 shrink-0">
            {/* Tab switchers: Linha 1 (Fluxos de Atendimento) */}
            <div className="grid grid-cols-3 gap-1 bg-slate-200/70 p-0.5 rounded-xl text-[10.5px] font-bold">
              <button
                type="button"
                onClick={() => setQueueTab('all')}
                className={`py-1 px-1 rounded-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                  queueTab === 'all'
                    ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title={`Todas as conversas (${journeysList.length})`}
              >
                <span>💬 Todas</span>
                <span className="text-[9.5px] font-mono px-1 py-0.2 rounded-full bg-slate-100 text-slate-700 font-bold">{journeysList.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setQueueTab('priorities')}
                className={`py-1 px-1 rounded-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                  queueTab === 'priorities'
                    ? 'bg-white text-rose-800 shadow-2xs font-extrabold'
                    : 'text-slate-600 hover:text-rose-800'
                }`}
                title={`Fila de prioridades (${prioritiesList.length})`}
              >
                <span>🔥 Fila</span>
                <span className="text-[9.5px] font-mono px-1 py-0.2 rounded-full bg-rose-100 text-rose-800 font-bold">{prioritiesList.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setQueueTab('in_progress')}
                className={`py-1 px-1 rounded-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                  queueTab === 'in_progress'
                    ? 'bg-white text-emerald-800 shadow-2xs font-extrabold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Conversas em andamento"
              >
                <span>⚡ Ativas</span>
                <span className="text-[9.5px] font-mono px-1 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                  {journeysList.filter((j) => (j as any).status === 'in_progress' || j.pipelineStage === 'QUALIFIED' || j.pipelineStage === 'PROPOSAL' || (j as any).priorityReason).length}
                </span>
              </button>
            </div>

            {/* Tab switchers: Linha 2 (Fidelidade: ⭐ Recorrentes vs 🌱 Novos) */}
            <div className="grid grid-cols-2 gap-1 bg-slate-200/50 p-0.5 rounded-xl text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setQueueTab('recurring')}
                className={`py-0.5 px-1 rounded-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                  queueTab === 'recurring'
                    ? 'bg-purple-100 text-purple-950 border border-purple-300 shadow-2xs font-extrabold'
                    : 'text-purple-900 hover:text-purple-950 hover:bg-purple-50/50'
                }`}
                title="Filtrar apenas Clientes Recorrentes / VIP"
              >
                <span>⭐ Recorrentes</span>
                <span className="text-[9px] font-mono px-1 rounded-full bg-purple-200/70 text-purple-900 font-bold">
                  {journeysList.filter((j) => detectCustomerLoyalty(j, loyaltyMap).type === 'RECURRING').length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setQueueTab('new')}
                className={`py-0.5 px-1 rounded-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                  queueTab === 'new'
                    ? 'bg-emerald-100 text-emerald-950 border border-emerald-300 shadow-2xs font-extrabold'
                    : 'text-emerald-900 hover:text-emerald-950 hover:bg-emerald-50/50'
                }`}
                title="Filtrar apenas Novos Leads (1ª compra)"
              >
                <span>🌱 Novos Leads</span>
                <span className="text-[9px] font-mono px-1 rounded-full bg-emerald-200/70 text-emerald-900 font-bold">
                  {journeysList.filter((j) => detectCustomerLoyalty(j, loyaltyMap).type === 'NEW').length}
                </span>
              </button>
            </div>

            {/* Search Input and Nova Conversa CTA */}
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={queueSearch}
                onChange={(e) => setQueueSearch(e.target.value)}
                placeholder="Buscar contato ou mensagem..."
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#00a884]"
              />
              <button
                type="button"
                onClick={() => setStartConversationModalOpen(true)}
                title="Iniciar Nova Conversa do WhatsApp com Contato do Banco ou Telefone"
                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shrink-0 transition cursor-pointer shadow-2xs"
              >
                <Plus size={13} />
                <span className="hidden sm:inline">Nova</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5 overflow-y-auto p-1.5 flex-1 min-h-0">
            {priorities.state === "loading" && journeys.state === "loading" ? (
              <p className="px-2 py-5 text-sm text-slate-500 text-center">Carregando contatos…</p>
            ) : null}
            {queue.length === 0 && (
              <div className="p-6 text-center text-xs text-slate-400">
                Nenhum contato encontrado com o filtro atual.
              </div>
            )}
            {queue.map((item) => (
              <div key={"journeyId" in item ? item.journeyId : item.id}>
                <QueueCard
                  item={item}
                  selected={("journeyId" in item ? item.journeyId : item.id) === selectedJourneyId}
                  loyaltyMap={loyaltyMap}
                  onClick={() => onSelectedJourneyChange("journeyId" in item ? item.journeyId : item.id)}
                />
              </div>
            ))}
          </div>
        </aside>

        {/* Central Conversation and Actions */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-xs min-w-0 flex flex-col h-full min-h-0 overflow-hidden">
          {cockpit.state === "loading" && (
            <div className="flex h-full min-h-[400px] items-center justify-center text-sm text-slate-500">
              Carregando contexto da conversa…
            </div>
          )}
          {cockpit.state === "error" && (
            <div className="m-4">{availability("Contexto indisponível", cockpit.message)}</div>
          )}
          {cockpit.state === "empty" && (
            <div className="m-4">
              {availability("Selecione uma conversa", "Escolha um contato na lista ao lado para abrir o atendimento.")}
            </div>
          )}
          {view && (
            <LiveJourneyBody
              view={view}
              workspaceId={workspaceId}
              loyaltyMap={loyaltyMap}
              onToggleLoyalty={handleToggleLoyalty}
              isDossierCollapsed={isDossierCollapsed}
              onToggleDossier={toggleDossierCollapse}
              onOpenDossierFocus={() => setDossierFocusModalOpen(true)}
              onOpenExternalAgenda={() => setExternalAgendaDrawerOpen(true)}
              onAcceptHandoff={handleAcceptHandoff}
              onResolveHandoff={handleResolveHandoff}
              onOpenReturnAiModal={() => setReturnAiModalOpen(true)}
              onStageChange={handleStageChange}
              onOpenFollowUpModal={() => setFollowUpModalOpen(true)}
              onOpenOutcomeModal={() => setOutcomeModalOpen(true)}
              onOpenWabaButtonsModal={() => setWabaButtonsModalOpen(true)}
              onOpenWabaTemplateModal={() => setWabaTemplateModalOpen(true)}
              onOpenSalesVaultModal={() => setSalesVaultModalOpen(true)}
              onCreateOutboundDraft={handleCreateOutboundDraft}
              onClearCurrentJourney={handleClearCurrentJourney}
              onUpdateContactName={handleUpdateContactName}
              actionInProgress={actionInProgress}
            />
          )}
        </section>
      </div>

      {/* Fullscreen Deep Focus Dossier Command Center */}
      {dossierFocusModalOpen && view && (
        <DossierFocusModal
          isOpen={dossierFocusModalOpen}
          onClose={() => setDossierFocusModalOpen(false)}
          view={view}
          workspaceId={workspaceId}
          loyaltyMap={loyaltyMap}
          onToggleLoyalty={() => handleToggleLoyalty(view.journey.id, view.journey.contact.phone)}
          onStageChange={handleStageChange}
          onOpenOutcomeModal={() => setOutcomeModalOpen(true)}
          onOpenFollowUpModal={() => setFollowUpModalOpen(true)}
          onOpenExternalAgenda={() => setExternalAgendaDrawerOpen(true)}
          onOpenSalesVaultModal={() => setSalesVaultModalOpen(true)}
          onOpenWabaButtonsModal={() => setWabaButtonsModalOpen(true)}
          onOpenWabaTemplateModal={() => setWabaTemplateModalOpen(true)}
          onOpenFactModal={() => setFactModalOpen(true)}
          onCreateOutboundDraft={handleCreateOutboundDraft}
          onUpdateContactName={handleUpdateContactName}
          actionInProgress={actionInProgress}
        />
      )}

      {/* Modals for Controlled Actions */}
      {followUpModalOpen && (
        <FollowUpModal
          onClose={() => setFollowUpModalOpen(false)}
          onSubmit={handleCreateFollowUp}
          inProgress={actionInProgress}
        />
      )}

      {outcomeModalOpen && (
        <OutcomeModal
          onClose={() => setOutcomeModalOpen(false)}
          onSubmit={handleRecordOutcome}
          inProgress={actionInProgress}
        />
      )}

      {factModalOpen && (
        <KnownFactModal
          onClose={() => setFactModalOpen(false)}
          onSubmit={handleRecordFact}
          inProgress={actionInProgress}
        />
      )}

      {returnAiModalOpen && view?.handoff && (
        <ReturnToAiModal
          handoffCaseId={view.handoff.id}
          onClose={() => setReturnAiModalOpen(false)}
          onSubmit={(reason) => handleReturnToAi(view.handoff!.id, reason)}
          inProgress={actionInProgress}
        />
      )}

      {wabaButtonsModalOpen && view && (
        <WabaActionsModal
          isOpen={wabaButtonsModalOpen}
          onClose={() => setWabaButtonsModalOpen(false)}
          journey={view.journey}
          workspaceId={workspaceId}
          recipientPhone={view.journey.contact.phone}
          contactName={view.journey.contact.name}
          onSuccessNotification={(msg) => showNotification("success", msg)}
          onError={(err) => showNotification("error", err)}
        />
      )}

      {wabaTemplateModalOpen && (
        <WabaTemplateModal
          workspaceId={workspaceId}
          onClose={() => setWabaTemplateModalOpen(false)}
          onSubmit={handleSendWabaTemplate}
          inProgress={actionInProgress}
        />
      )}

      {salesVaultModalOpen && (
        <SalesMediaVaultModal
          workspaceId={workspaceId}
          isOpen={salesVaultModalOpen}
          onClose={() => setSalesVaultModalOpen(false)}
          onSendMediaResource={(resource) => {
            const mediaText = resource.captionText || `[${resource.type === 'audio' ? 'Áudio' : resource.type === 'pdf' ? 'PDF' : 'Foto'}] ${resource.title}`;
            handleCreateOutboundDraft(mediaText);
          }}
        />
      )}

      {/* External Agenda Drawer (Embedded Portal & Background AI Slots Sync) */}
      <ExternalAgendaDrawer
        isOpen={externalAgendaDrawerOpen}
        onClose={() => setExternalAgendaDrawerOpen(false)}
        workspaceId={workspaceId}
        workspaceName={cockpit.state === 'ready' ? cockpit.value.journey.contact.name : undefined}
        conversationContext={
          cockpit.state === 'ready' && cockpit.value.messages && cockpit.value.messages.length > 0
            ? [...cockpit.value.messages].reverse().find((m) => m.direction === 'inbound')?.textContent ||
              cockpit.value.messages[cockpit.value.messages.length - 1]?.textContent
            : ''
        }
        onInsertSlotToDraft={(text) => handleCreateOutboundDraft(text)}
      />

      {/* Start Conversation Modal */}
      <StartConversationModal
        workspace={{ id: workspaceId, name: 'Workspace Ativo', slug: 'active' } as any}
        isOpen={startConversationModalOpen}
        onClose={() => setStartConversationModalOpen(false)}
        onConversationStarted={(newJourney) => {
          setStartConversationModalOpen(false);
          onSelectedJourneyChange(newJourney.id);
          void refresh(true);
        }}
      />
    </div>
  );
};

function LiveJourneyBody({
  view,
  workspaceId,
  isDossierCollapsed = false,
  onToggleDossier,
  onOpenDossierFocus,
  onOpenExternalAgenda,
  onAcceptHandoff,
  onResolveHandoff,
  onOpenReturnAiModal,
  onStageChange,
  onOpenFollowUpModal,
  onOpenOutcomeModal,
  onOpenWabaButtonsModal,
  onOpenWabaTemplateModal,
  onOpenSalesVaultModal,
  onCreateOutboundDraft,
  onClearCurrentJourney,
  onUpdateContactName,
  loyaltyMap,
  onToggleLoyalty,
  actionInProgress,
}: {
  view: ApiCockpitView;
  workspaceId: string;
  loyaltyMap?: Record<string, CustomerLoyaltyType>;
  onToggleLoyalty?: (id: string, phone?: string) => void;
  isDossierCollapsed?: boolean;
  onToggleDossier?: () => void;
  onOpenDossierFocus?: () => void;
  onOpenExternalAgenda: () => void;
  onAcceptHandoff: (handoffCaseId: string) => void;
  onResolveHandoff: (handoffCaseId: string) => void;
  onOpenReturnAiModal: () => void;
  onStageChange: (stage: string) => void;
  onOpenFollowUpModal: () => void;
  onOpenOutcomeModal: () => void;
  onOpenWabaButtonsModal: () => void;
  onOpenWabaTemplateModal: () => void;
  onOpenSalesVaultModal: () => void;
  onCreateOutboundDraft: (text: string) => void;
  onClearCurrentJourney?: () => void;
  onUpdateContactName?: (newName: string) => void;
  actionInProgress: boolean;
}) {
  const { journey, acquisitionContexts, messages, decisionState, recommendation, handoff, outcome, knownFacts } = view;
  const acquisition = acquisitionContexts[0] ?? null;
  const loyalty = React.useMemo(() => detectCustomerLoyalty(journey as any, loyaltyMap), [journey, loyaltyMap]);
  const [draftText, setDraftText] = React.useState("");
  const [isGeneratingCopilot, setIsGeneratingCopilot] = React.useState(false);
  const [isGeneratingResurrection, setIsGeneratingResurrection] = React.useState(false);

  // Calculate time since last interaction for Level 4 Ghosting Resurrection Engine
  const lastMsg = messages && messages.length > 0 ? messages[messages.length - 1] : null;
  const hoursSinceLastMessage = React.useMemo(() => {
    if (!lastMsg || !lastMsg.sentAt) return 0;
    const diffMs = Date.now() - new Date(lastMsg.sentAt).getTime();
    return Math.max(0, diffMs / (1000 * 60 * 60));
  }, [lastMsg]);

  const handleTriggerResurrection = async () => {
    setIsGeneratingResurrection(true);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/journeys/${journey.id}/resurrect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok && data.data?.recommendedMessage) {
        setDraftText(data.data.recommendedMessage);
      }
    } catch {
      // ignore
    } finally {
      setIsGeneratingResurrection(false);
    }
  };

  // Level 5: Live Sentiment & Closing Probability Radar
  const liveSentiment = React.useMemo(() => {
    if (!messages || messages.length === 0) {
      return { closingProbability: 20, sentimentLabel: "Início", sentimentTier: "COLD_INITIAL", tacticalRecommendation: "Qualifique o interesse do cliente." };
    }
    const customerMessages = messages.filter((m) => m.direction === "inbound");
    const customerText = customerMessages.map((m) => (m.textContent || "").toLowerCase()).join(" ");
    const lastCustomerMsg = customerMessages[customerMessages.length - 1];
    const lastText = (lastCustomerMsg?.textContent || "").toLowerCase();

    let probability = 35;
    if (/pix|cartao|cartão|pagar|pago|chave|link|como pago|reserva|agenda|pode marcar|marca|quero sim|fechar|vou querer/.test(lastText)) {
      probability += 45;
    } else if (/horário|horario|sexta|sábado|sabado|hoje|amanhã|amanha|tarde|manhã|manha|18h|19h|17h|14h|15h/.test(lastText)) {
      probability += 30;
    } else if (/qual endereço|onde fica|localização|localizacao|rua|bairro/.test(customerText)) {
      probability += 20;
    }

    if (/caro|salgado|desconto|abaixa|parcela|mais barato/.test(customerText)) {
      probability -= 15;
    }
    if (/marido|esposo|mae|mãe|ver com|pensar|depois vejo|depois te chamo|qualquer coisa falo/.test(lastText)) {
      probability -= 25;
    }

    if (customerMessages.length >= 3) probability += 10;
    if (customerMessages.length >= 6) probability += 10;

    const finalProb = Math.max(5, Math.min(98, probability));
    let sentimentTier = "COLD_INITIAL";
    let sentimentLabel = "Em Qualificação";
    let tacticalRecommendation = "Ofereça 2 opções de horários para direcionar a decisão.";

    if (finalProb >= 75) {
      sentimentTier = "HOT_CLOSER";
      sentimentLabel = "🔥 Super Quente";
      tacticalRecommendation = "Momento de Ouro: Confirme o horário ou envie os dados de pagamento/Pix agora.";
    } else if (finalProb >= 50) {
      sentimentTier = "WARM_INTEREST";
      sentimentLabel = "⚡ Interesse Ativo";
      tacticalRecommendation = "Apresente um diferencial exclusivo para acelerar o fechamento.";
    } else {
      sentimentTier = "HESITANT_FRICTION";
      sentimentLabel = "❄️ Em Análise";
      tacticalRecommendation = "Tire dúvidas e envie fotos de resultados/depoimentos.";
    }

    return { closingProbability: finalProb, sentimentLabel, sentimentTier, tacticalRecommendation };
  }, [messages]);

  // Quick Tools Popover State & Action Catalog
  const [quickToolsOpen, setQuickToolsOpen] = React.useState(false);
  const quickToolsList = React.useMemo<QuickToolItem[]>(() => {
    return [
      {
        id: 'pix',
        category: 'financeiro',
        icon: <CreditCard size={15} className="text-emerald-600" />,
        label: 'Chave Pix Oficial',
        description: 'Envia dados da conta e chave Pix para pagamento imediato',
        action: () => {
          setDraftText("Chave Pix CNPJ: 12.345.678/0001-90 (SOS Sales LTDA) - Envie o comprovante aqui para confirmação imediata!");
          setQuickToolsOpen(false);
        },
      },
      {
        id: 'agenda',
        category: 'agenda',
        icon: <Calendar size={15} className="text-purple-600" />,
        label: 'Vagas & Horários Livres',
        description: 'Consulta grade de horários da Agenda Trinks',
        action: () => {
          onOpenExternalAgenda?.();
          setQuickToolsOpen(false);
        },
      },
      {
        id: 'followup',
        category: 'agenda',
        icon: <Clock size={15} className="text-blue-600" />,
        label: 'Agendar Follow-Up',
        description: 'Programa lembrete ou reengajamento comercial',
        action: () => {
          onOpenFollowUpModal?.();
          setQuickToolsOpen(false);
        },
      },
      {
        id: 'waba_buttons',
        category: 'waba',
        icon: <Zap size={15} className="text-amber-600" />,
        label: 'Botões Interativos WABA',
        description: 'Dispara botões de resposta rápida no WhatsApp',
        action: () => {
          onOpenWabaButtonsModal?.();
          setQuickToolsOpen(false);
        },
      },
      {
        id: 'waba_template',
        category: 'waba',
        icon: <FileText size={15} className="text-indigo-600" />,
        label: 'Reabrir Janela (Template HSM)',
        description: 'Envia modelo aprovado pela Meta para contatos inativos >24h',
        action: () => {
          onOpenWabaTemplateModal?.();
          setQuickToolsOpen(false);
        },
      },
      {
        id: 'vault',
        category: 'midia',
        icon: <Mic size={15} className="text-rose-600" />,
        label: 'Recursos & Áudios Prontos',
        description: 'Áudios gravados, fotos de antes/depois e tabelas',
        action: () => {
          onOpenSalesVaultModal?.();
          setQuickToolsOpen(false);
        },
      },
      {
        id: 'location',
        category: 'localizacao',
        icon: <MapPin size={15} className="text-emerald-600" />,
        label: 'Enviar Localização & Endereço',
        description: 'Injeta mapa e ponto de referência no chat',
        action: () => {
          setDraftText("📍 Nosso endereço: Av. Getúlio Vargas, 1000 - Centro, Chapecó - SC (Estacionamento conveniado no local).");
          setQuickToolsOpen(false);
        },
      },
    ];
  }, [onOpenExternalAgenda, onOpenFollowUpModal, onOpenWabaButtonsModal, onOpenWabaTemplateModal, onOpenSalesVaultModal]);

  // Audio Recording & Attachment States
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordingSeconds, setRecordingSeconds] = React.useState(0);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const recordingTimerRef = React.useRef<any>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const startRecordingAudio = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        recorder.start();
      }
    } catch {
      // Microphone fallback simulated
    }
    setIsRecording(true);
    setRecordingSeconds(0);
    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);
  };

  const stopRecordingAudio = (cancel = false) => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      } catch {}
    }

    if (!cancel && recordingSeconds > 0) {
      const sec = recordingSeconds;
      onCreateOutboundDraft(`[Áudio] Mensagem de voz gravada pelo atendente (${sec}s)`);
    }

    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');
    const isPdf = file.type.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');

    if (isImage) {
      onCreateOutboundDraft(`[Foto] ${fileName}`);
    } else if (isVideo) {
      onCreateOutboundDraft(`[Vídeo] ${fileName}`);
    } else if (isAudio) {
      onCreateOutboundDraft(`[Áudio] ${fileName}`);
    } else {
      onCreateOutboundDraft(`[Documento] ${fileName}`);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatSec = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const inferredDossier = React.useMemo(
    () => analyzeConversationDossier(messages || [], journey.contact.name),
    [messages, journey.contact.name]
  );

  const handleGenerateCopilotSuggestion = async () => {
    setIsGeneratingCopilot(true);
    try {
      const lastCust = [...messages].reverse().find((m) => m.direction === "inbound");
      const customerText = lastCust?.textContent || "";
      const allText = messages.map(m => m.textContent || "").join(" ");
      const firstName = (journey.contact.name || "Cliente").split(" ")[0];

      // 1. Cross-reference with external systems reasoning (Agenda, ERP, Inventory)
      const goal = extractCustomerGoalFromChat(customerText || allText);

      if (goal.intentType === "booking") {
        const intent = parseConversationIntent(customerText || allText);
        const srv = SALON_SERVICES.find(s => s.id === intent.serviceId) || SALON_SERVICES[0];
        const slots = computeSmartDetectedSlots(
          intent.preferredDay || "hoje",
          intent.serviceId,
          intent.preferredPeriod || "all",
          intent.preferredHourThreshold,
          intent.preferredStaffName
        );

        if (slots.length > 0) {
          const best = slots[0];
          const priceText = srv.priceEstimated ? ` (${srv.priceEstimated})` : "";
          const dayText = intent.preferredDay === "amanha" ? "amanhã" : intent.preferredDay === "depois_amanha" ? "na próxima data" : "hoje";
          setDraftText(`Oi ${firstName}! Conferi aqui na nossa grade oficial e temos vaga para ${srv.name}${priceText} ${dayText} às ${best.time} com a ${best.staffName} (${best.staffRole}). Fica bom para você esse horário?`);
          setIsGeneratingCopilot(false);
          return;
        }
      } else if (goal.intentType === "order_status" && goal.attributes.orderNumber) {
        const orderResult = reasonOverOrdersERP(goal, journey.contact.name || "Cliente");
        setDraftText(orderResult.actionableDraftText);
        setIsGeneratingCopilot(false);
        return;
      }

      const res = await fetch("/api/v1/ai/copilot-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          journeyStage: journey.pipelineStage || inferredDossier.suggestedStage,
          contactName: journey.contact.name || "Cliente",
          lastCustomerMessage: customerText,
          businessName: "SOS Sales",
          facts: (knownFacts && knownFacts.length > 0 ? knownFacts : inferredDossier.knownFacts)?.map((f) => `${f.key}: ${f.value}`) || [],
        }),
      });
      const data = await res.json();
      if (data.suggestedMessage) {
        setDraftText(data.suggestedMessage);
      } else if (inferredDossier.suggestedDraftText) {
        setDraftText(inferredDossier.suggestedDraftText);
      }
    } catch {
      if (inferredDossier.suggestedDraftText) {
        setDraftText(inferredDossier.suggestedDraftText);
      }
    } finally {
      setIsGeneratingCopilot(false);
    }
  };

  const isHandoffActive = handoff && handoff.status !== "RESOLVED" && handoff.status !== "resolved";

  // 24-hour Meta Service Window Calculation
  const lastInboundMessage = [...messages].reverse().find((m) => m.direction === "inbound");
  const hoursSinceLastInbound = lastInboundMessage
    ? (Date.now() - new Date(lastInboundMessage.sentAt).getTime()) / (1000 * 60 * 60)
    : null;
  const isWindowActive = hoursSinceLastInbound !== null && hoursSinceLastInbound < 24;
  const hoursRemaining = hoursSinceLastInbound !== null ? Math.max(0, 24 - hoursSinceLastInbound) : 0;

  // CTWA (Click to WhatsApp Ads) Meta Attribution
  const ctwaFact = knownFacts?.find(
    (f) => f.key === "ad.referral" || f.key === "meta_ctwa_ad" || f.source === "ad_payload"
  );

  // Dynamic Workspace Commercial Settings
  const commercialConfig = React.useMemo(() => {
    return getWorkspaceCommercialConfig(workspaceId);
  }, [workspaceId]);

  const externalAgendaConfig = React.useMemo(() => getExternalAgendaConfig(workspaceId), [workspaceId]);
  const agendaProviderLabel = externalAgendaConfig.providerLabel || commercialConfig.agendaProviderName || "Google Agenda / Externa";

  const externalAgendaSlots = React.useMemo(() => {
    try {
      const cfg = getExternalAgendaConfig(workspaceId);
      if (cfg && cfg.availableSlotsToday && cfg.availableSlotsToday.length > 0) {
        return cfg.availableSlotsToday.slice(0, 3).join(", ");
      }
    } catch {}
    return "14:00, 15:30 ou 16:45";
  }, [workspaceId]);

  const contactFirstName = (journey.contact.name || "Cliente").split(" ")[0];
  const [macroAppliedFeedback, setMacroAppliedFeedback] = React.useState<string | null>(null);

  const fastMacros = React.useMemo(() => {
    const defaultMacros = commercialConfig.customMacros || [];
    return defaultMacros.map((macro) => ({
      id: macro.id,
      label: macro.label,
      template: macro.template
        .replace(/\{\{nome\}\}/g, contactFirstName)
        .replace(/\{\{horarios\}\}/g, externalAgendaSlots),
    }));
  }, [commercialConfig, contactFirstName, externalAgendaSlots]);

  const handleApplyMacro = (id: string, template: string) => {
    setDraftText(template);
    setMacroAppliedFeedback(id);
    setTimeout(() => {
      setMacroAppliedFeedback(null);
    }, 1800);
  };

  const objectionBreakers = React.useMemo(() => {
    const name = contactFirstName;
    const pixKey = commercialConfig.pixKey || "pix@salesos.com.br";
    const address = commercialConfig.businessAddress || "Centro da cidade";

    return [
      {
        id: "caro",
        icon: "💸",
        label: "Tá caro",
        text: `Oi ${name}, compreendo totalmente! Esse valor já contempla nosso atendimento premium com produtos de altíssima qualidade e garantia total. Posso reservar o seu horário hoje?`,
      },
      {
        id: "pensar",
        icon: "🤔",
        label: "Vou pensar",
        text: `Com certeza, ${name}! Nossas vagas para esta semana costumam fechar rápido. Quer que eu reserve esse horário por 30 minutinhos sem compromisso para você não perder?`,
      },
      {
        id: "marido",
        icon: "👫",
        label: "Falar com marido",
        text: `Super entendo, ${name}! Quer que eu te mande um resuminho com os valores e horários disponíveis para você mostrar para ele agora?`,
      },
      {
        id: "tempo",
        icon: "⏰",
        label: "Sem tempo",
        text: `Tranquilo, ${name}! Conseguimos um horário express de 45 minutos no início da manhã ou no fim da tarde. Fica melhor para a sua rotina?`,
      },
      {
        id: "pix",
        icon: "💰",
        label: "Enviar Pix",
        text: `Perfeito, ${name}! Segue a nossa chave Pix oficial para confirmação do seu horário: ${pixKey}. Assim que enviar, me manda o comprovante aqui para eu lançar na grade! ✨`,
      },
      {
        id: "localizacao",
        icon: "📍",
        label: "Endereço",
        text: `Ficamos localizados em: ${address}. Temos estacionamento no local. Quer que eu te envie o link direto no Google Maps? 🚗`,
      },
    ];
  }, [contactFirstName, commercialConfig]);

  const ghostingInfo = React.useMemo(() => {
    if (!messages || messages.length === 0) return null;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || !lastMsg.sentAt) return null;

    const diffHours = (Date.now() - new Date(lastMsg.sentAt).getTime()) / (1000 * 60 * 60);
    const isOutbound = lastMsg.direction === "outbound";

    if (diffHours >= 2) {
      const formattedHours = diffHours >= 24 ? `${Math.floor(diffHours / 24)}d` : `${Math.floor(diffHours)}h`;
      const suggestedReactivation = `Oi ${contactFirstName}, tudo bem? Passando para te avisar que liberamos um horário extra hoje às ${externalAgendaSlots.split(',')[0] || '16:00'}. Quer que eu segure sua vaga antes que preencha?`;

      return {
        hoursAgoText: formattedHours,
        suggestedText: suggestedReactivation,
        isOutbound,
      };
    }
    return null;
  }, [messages, contactFirstName, externalAgendaSlots]);

  const handleUpdateContactName = (newName: string) => {
    if (journey.contact) {
      journey.contact.name = newName;
    }
    if (onUpdateContactName) {
      onUpdateContactName(newName);
    }
  };


  const scrollContainerRef = React.useRef<HTMLElement | null>(null);
  const isAtBottomRef = React.useRef(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = React.useState(false);
  const prevMessagesLengthRef = React.useRef(messages.length);

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isNearBottom = distanceFromBottom < 80;
    isAtBottomRef.current = isNearBottom;
    setShowScrollBottomBtn(!isNearBottom);
  };

  const scrollToBottom = (smooth = true) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
      isAtBottomRef.current = true;
      setShowScrollBottomBtn(false);
    }
  };

  // Scroll to bottom on initial load or journey switch
  React.useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      isAtBottomRef.current = true;
      setShowScrollBottomBtn(false);
    }
    prevMessagesLengthRef.current = messages.length;
  }, [journey.id]);

  // Only auto-scroll on new message if user was already at the bottom
  React.useEffect(() => {
    const isNew = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    if (isAtBottomRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: isNew ? 'smooth' : 'auto',
      });
    }
  }, [messages]);

  const currentNormalized = normalizeStage(journey.pipelineStage);

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden">
      {/* 1. CABEÇALHO DO CHAT (Ultra Limpo & Focado) */}
      <header className="border-b border-slate-100 bg-white px-3.5 py-2 shrink-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Esquerda: Identificação do Contato */}
          <div className="flex items-center gap-2.5 min-w-0">
            <ContactAvatar
              name={journey.contact.name}
              phone={journey.contact.phone}
              avatarUrl={(journey.contact as any)?.avatarUrl || (journey as any)?.leadAvatar}
              size="md"
              showOnlineBadge={isWindowActive}
              className="shadow-2xs"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-bold text-sm text-slate-900 truncate font-heading">
                  {journey.contact.name || "Contato WhatsApp"}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const promptVal = window.prompt("Editar nome do contato:", journey.contact.name || "");
                    if (promptVal !== null && promptVal.trim()) {
                      handleUpdateContactName(promptVal.trim());
                    }
                  }}
                  title="Editar nome do contato"
                  className="p-0.5 text-slate-400 hover:text-slate-700 rounded transition cursor-pointer"
                >
                  <Edit2 size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => onToggleLoyalty?.(journey.id, journey.contact.phone)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border transition-all cursor-pointer shadow-2xs hover:scale-105 ${loyalty.badgeClass}`}
                  title="Clique para alternar entre Cliente Recorrente e Novo Lead"
                >
                  {loyalty.label}
                </button>
                {isWindowActive && (
                  <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 text-[9.5px] font-bold text-emerald-800 flex items-center gap-0.5">
                    <Clock size={10} />
                    {(Number(hoursRemaining) || 0).toFixed(1)}h
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="font-mono text-[11px]">{journey.contact.phone}</span>
                <span className="text-slate-300">•</span>
                <span className="text-[11px] font-semibold text-slate-700 truncate max-w-[150px]">
                  {acquisition?.campaignName || inferredDossier.originLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Direita: Ações Essenciais */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Etapa do Funil */}
            <select
              value={currentNormalized}
              onChange={(e) => onStageChange(e.target.value)}
              disabled={actionInProgress}
              className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-800 shadow-2xs focus:ring-1 focus:ring-emerald-600 cursor-pointer"
            >
              {PIPELINE_STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            {/* Desfecho Comercial */}
            <button
              type="button"
              onClick={onOpenOutcomeModal}
              disabled={actionInProgress}
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-xs font-bold transition disabled:opacity-60 cursor-pointer shadow-2xs"
            >
              <DollarSign size={13} /> Desfecho
            </button>

            {/* Dossiê & Modo Foco em Tela Cheia */}
            <button
              type="button"
              onClick={onOpenDossierFocus || onToggleDossier}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 px-3 py-1 text-xs font-bold transition cursor-pointer shadow-2xs"
              title="Abrir Dossiê & Modo Foco em Tela Cheia (ESC para fechar)"
            >
              <Sparkles size={13} className="text-indigo-600 animate-pulse" />
              <span>Dossiê Completo</span>
            </button>

            {/* Limpar conversa */}
            {onClearCurrentJourney && (
              <button
                type="button"
                onClick={onClearCurrentJourney}
                disabled={actionInProgress}
                className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer shadow-2xs"
                title="Limpar histórico da conversa"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-col flex-1 min-h-0 p-2.5 gap-2 overflow-hidden bg-slate-50/50">
        {/* Hidden File Input for Attachments */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileInputChange}
          accept="image/*,video/*,audio/*,application/pdf"
        />

        {/* 2. CONVERSA REAL DO WHATSAPP (Foco 100% na Leitura) */}
        <section
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="relative flex-1 min-h-0 rounded-2xl border border-slate-200/90 bg-[#efeae2] p-3 overflow-y-auto whatsapp-chat-wallpaper flex flex-col"
        >
          {/* Anti-Ghosting Reativação Automática */}
          {ghostingInfo && (
            <div className="mb-2.5 p-2.5 bg-amber-50/95 border border-amber-200 rounded-xl flex items-center justify-between gap-2 text-xs shadow-2xs animate-in fade-in shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0">👻</span>
                <div className="min-w-0">
                  <p className="font-bold text-amber-950 text-[11px]">
                    Cliente sem retorno há {ghostingInfo.hoursAgoText}
                  </p>
                  <p className="text-[10.5px] text-amber-800 truncate">
                    Gancho de Reativação: "{ghostingInfo.suggestedText}"
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDraftText(ghostingInfo.suggestedText)}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10.5px] font-extrabold shadow-2xs transition shrink-0 cursor-pointer"
                title="Inserir mensagem de reativação no chat"
              >
                ⚡ Reaquecer Lead
              </button>
            </div>
          )}

          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center p-6 text-center text-xs text-slate-500">
              Ainda não há mensagens registradas nesta conversa. Envie uma mensagem pelo campo abaixo para iniciar o contato com o cliente via WhatsApp.
            </div>
          ) : (
            <div className="space-y-2 flex-1">
              {messages.map((message) => {
                const isOut = message.direction === "outbound";
                return (
                  <div
                    key={message.id}
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed shadow-2xs ${
                      isOut
                        ? "ml-auto bg-[#d9fdd3] text-[#111b21] rounded-tr-xs border border-[#c4f8bb]"
                        : "mr-auto bg-white text-[#111b21] rounded-tl-xs border border-slate-200/80"
                    }`}
                  >
                    <MessageMediaRenderer
                      mediaPayload={(message as any).mediaPayload}
                      textContent={message.textContent}
                      isOutbound={isOut}
                      senderName={isOut ? "Você" : (journey.contact.name || "Cliente")}
                    />
                    <div className="mt-0.5 text-right text-[10px] text-slate-500 font-mono flex items-center justify-end gap-1">
                      <span>{formatDate(message.sentAt)}</span>
                      {isOut && (
                        <span className="text-[#53bdeb] font-bold text-xs" title="Entregue">✓✓</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Floating Scroll to Bottom Button */}
          {showScrollBottomBtn && (
            <button
              type="button"
              onClick={() => scrollToBottom(true)}
              className="sticky bottom-2 ml-auto float-right z-20 flex items-center gap-1.5 rounded-full bg-slate-900/90 hover:bg-slate-950 text-white px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur-xs transition transform active:scale-95 cursor-pointer animate-in fade-in"
              title="Ir para mensagens recentes"
            >
              <span>↓ Mensagens recentes</span>
            </button>
          )}
        </section>

        {/* 3. COMPOSER ACIONÁVEL UNIFICADO (Tudo em 1 Lugar) */}
        <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-xs shrink-0 space-y-1.5">
          {/* Linha Tática Soberana do Motor Cognitivo (Tese v2) */}
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200/80 rounded-xl text-xs">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="font-black text-emerald-950 text-[10.5px] uppercase tracking-wider">
                  💡 Menor Próximo Movimento:
                </span>
                {inferredDossier.offerHook && (
                  <span className="hidden md:inline px-1.5 py-0.2 rounded-md bg-emerald-100 border border-emerald-300 text-emerald-800 text-[9.5px] font-bold">
                    🎯 {inferredDossier.offerHook}
                  </span>
                )}
              </div>
              <span className="text-emerald-900 truncate text-[11px] font-medium italic">
                "{recommendation?.suggestedDraftText || inferredDossier.suggestedDraftText || liveSentiment.tacticalRecommendation}"
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setDraftText(recommendation?.suggestedDraftText || inferredDossier.suggestedDraftText || liveSentiment.tacticalRecommendation)}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs transition cursor-pointer"
                title="Inserir resposta no campo de mensagem"
              >
                Usar Resposta
              </button>
            </div>
          </div>

          {/* Arsenal de Quebra de Objeções em 1 Toque */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 pt-0.5 no-scrollbar">
            <span className="text-[9.5px] font-extrabold uppercase text-slate-400 shrink-0 flex items-center gap-1">
              🛡️ Objeções Rápidas:
            </span>
            {objectionBreakers.map((obj) => (
              <button
                key={obj.id}
                type="button"
                onClick={() => setDraftText(obj.text)}
                className="px-2 py-0.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-900 text-slate-700 text-[10.5px] font-semibold flex items-center gap-1 shrink-0 transition cursor-pointer shadow-2xs"
                title={obj.text}
              >
                <span>{obj.icon}</span>
                <span>{obj.label}</span>
              </button>
            ))}
          </div>

          {/* Audio Recording Active Strip */}
          {isRecording ? (
            <div className="flex items-center justify-between gap-3 p-2 rounded-xl bg-rose-50 border border-rose-200 animate-in fade-in">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-600 animate-ping" />
                <span className="font-mono font-bold text-xs text-rose-800 flex items-center gap-1">
                  <Mic size={13} className="text-rose-600" /> Gravando Áudio WhatsApp: {formatSec(recordingSeconds)}
                </span>
                <span className="text-[11px] text-rose-600 italic">Fale normalmente no microfone...</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => stopRecordingAudio(true)}
                  className="px-2.5 py-1 rounded-lg border border-rose-300 bg-white hover:bg-rose-100 text-rose-700 text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => stopRecordingAudio(false)}
                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition flex items-center gap-1 cursor-pointer"
                >
                  <Send size={12} /> Enviar Áudio ({formatSec(recordingSeconds)})
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 relative">
              {/* Quick Tools Popover Dropup */}
              <QuickToolsPopover
                isOpen={quickToolsOpen}
                onClose={() => setQuickToolsOpen(false)}
                tools={quickToolsList}
              />

              {/* Botão de Ações Rápidas (⚡) */}
              <button
                type="button"
                onClick={() => setQuickToolsOpen((prev) => !prev)}
                className={`p-2 rounded-xl border transition cursor-pointer shadow-2xs shrink-0 flex items-center gap-1 font-bold text-xs ${
                  quickToolsOpen
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-slate-100/80 hover:bg-slate-200 text-slate-700"
                }`}
                title="Abrir Caixa de Ações Rápidas (Pix, Horários, Recursos)"
              >
                <Zap size={15} className="text-amber-500" />
                <span className="hidden sm:inline">Atalhos</span>
              </button>

              {/* Anexo */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={actionInProgress}
                className="p-2 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-100/80 hover:bg-slate-200 text-slate-600 transition shrink-0 cursor-pointer shadow-2xs"
                title="Anexar Foto, Vídeo, Áudio ou PDF"
              >
                <Paperclip size={15} />
              </button>

              {/* Gravar Áudio */}
              <button
                type="button"
                onClick={startRecordingAudio}
                disabled={actionInProgress}
                className="p-2 rounded-xl border border-slate-200 hover:border-rose-300 bg-slate-100/80 hover:bg-rose-50 text-slate-600 hover:text-rose-600 transition shrink-0 cursor-pointer shadow-2xs"
                title="Gravar mensagem de voz ao vivo"
              >
                <Mic size={15} />
              </button>

              {/* Input de Mensagem */}
              <input
                type="text"
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder="Digite uma mensagem ou use um atalho..."
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600 shadow-2xs"
                onKeyDown={(e) => {
                  if (e.key === "Tab" && !draftText.trim() && (recommendation?.suggestedDraftText || inferredDossier.suggestedDraftText)) {
                    e.preventDefault();
                    setDraftText(recommendation?.suggestedDraftText || inferredDossier.suggestedDraftText || "");
                    return;
                  }
                  if (e.key === "Enter" && draftText.trim()) {
                    e.preventDefault();
                    onCreateOutboundDraft(draftText.trim());
                    setDraftText("");
                  }
                }}
              />

              {/* Botão Enviar */}
              <button
                type="button"
                onClick={() => {
                  if (draftText.trim()) {
                    onCreateOutboundDraft(draftText.trim());
                    setDraftText("");
                  }
                }}
                disabled={actionInProgress || !draftText.trim()}
                className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40 transition shrink-0 shadow-2xs cursor-pointer"
              >
                <Send size={13} /> Enviar
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ContinuityCell({
  icon,
  label,
  tone,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "blue" | "amber" | "violet";
  value: string | null;
  detail: string;
}) {
  const colors = {
    blue: "border-blue-700/60 bg-blue-950/40 text-blue-200",
    amber: "border-amber-500/60 bg-amber-950/30 text-amber-200",
    violet: "border-violet-500/60 bg-violet-950/40 text-violet-200",
  };
  return (
    <div className={`rounded-xl border p-3 ${colors[tone]}`}>
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
        {icon}
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-white">{value || "Ainda indisponível"}</p>
      <p className="mt-1 text-xs leading-5 text-slate-300">{detail}</p>
    </div>
  );
}

function LiveDossier({
  view,
  workspaceId,
  onOpenFactModal,
  onOpenFollowUpModal,
  onOpenOutcomeModal,
}: {
  view: ApiCockpitView;
  workspaceId: string;
  onOpenFactModal: () => void;
  onOpenFollowUpModal?: () => void;
  onOpenOutcomeModal?: () => void;
}) {
  const { journey, knownFacts, decisionState, handoff, outcome, acquisitionContexts, messages } = view;

  const inferred = React.useMemo(() => {
    return analyzeConversationDossier(messages || [], journey.contact.name);
  }, [messages, journey.contact.name]);

  const displayService = journey.primaryServiceOrProduct || inferred.primaryServiceOrProduct;
  const primaryAcquisition = acquisitionContexts?.[0];
  const displayOriginLabel = primaryAcquisition ? 'Anúncio WhatsApp (Meta Ads)' : inferred.originLabel;
  const displayCampaignName = primaryAcquisition?.campaignName || inferred.campaignName;
  const displayOfferHook = primaryAcquisition?.offerHook || inferred.offerHook;
  const displayEntryMessage = primaryAcquisition?.entryMessage || inferred.entryMessage;

  const displayFacts = knownFacts && knownFacts.length > 0 ? knownFacts : inferred.knownFacts;
  const displayFriction = decisionState?.primaryFriction || inferred.primaryFriction;
  const displayFrictionEvidence = decisionState?.frictionEvidence || inferred.frictionEvidence;

  // Local state for tactical operator notes
  const [operatorNotes, setOperatorNotes] = React.useState<Array<{ id: string; tag: string; text: string; time: string }>>([
    { id: '1', tag: 'Interesse', text: `Interesse identificado: ${displayService}`, time: 'Hoje' }
  ]);
  const [isAddingNote, setIsAddingNote] = React.useState(false);
  const [newNoteText, setNewNoteText] = React.useState('');
  const [newNoteTag, setNewNoteTag] = React.useState('Preferência');

  const handleAddNote = () => {
    if (!newNoteText.trim()) return;
    setOperatorNotes((prev) => [
      ...prev,
      { id: String(Date.now()), tag: newNoteTag, text: newNoteText.trim(), time: 'Agora' }
    ]);
    setNewNoteText('');
    setIsAddingNote(false);
  };

  return (
    <div className="space-y-2">
      {/* Super Autonomy & Human-in-the-Loop Monitor */}
      <AutonomousSupervisorPanel
        workspaceId={workspaceId}
        currentContactName={journey.contact.name}
      />

      {/* 1. Origem do Contato */}
      <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-2.5 shadow-2xs">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1 text-[11px] font-bold text-emerald-950 font-heading">
            <Globe size={12} className="text-emerald-700" /> Origem do Contato
          </p>
          <span className="rounded-full bg-emerald-200/90 px-1.5 py-0.2 font-mono text-[9px] font-bold text-emerald-900">
            {displayOriginLabel}
          </span>
        </div>
        <div className="mt-1.5 space-y-1 text-xs">
          <div className="flex items-center justify-between text-slate-700">
            <span className="text-[10.5px] text-slate-500">Campanha:</span>
            <span className="font-semibold text-slate-900 truncate max-w-[150px] text-[11px]" title={displayCampaignName}>
              {displayCampaignName}
            </span>
          </div>
          {displayOfferHook && (
            <div className="rounded-lg bg-white/90 p-1.5 border border-emerald-200/70">
              <p className="text-[9.5px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                <Tag size={9} /> Oferta de Entrada
              </p>
              <p className="mt-0.5 font-medium text-slate-800 text-[10.5px]">{displayOfferHook}</p>
            </div>
          )}
          {displayEntryMessage && (
            <p className="text-[10px] text-slate-600 italic bg-white/60 rounded p-1 border border-slate-100 truncate">
              "{displayEntryMessage}"
            </p>
          )}
        </div>
      </section>

      {/* 2. Jornada Comercial & Receita */}
      <section className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs">
        <div className="flex items-center justify-between">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 font-heading">Serviço Solicitado</p>
          <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[9.5px] font-bold text-blue-800 uppercase">
            {stageLabel(journey.pipelineStage || inferred.suggestedStage)}
          </span>
        </div>
        <p className="mt-0.5 text-xs font-bold text-slate-900">
          {displayService}
        </p>
        <dl className="mt-1.5 space-y-0.5 text-[11px] text-slate-600 border-t border-slate-100 pt-1.5">
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Iniciado em</dt>
            <dd className="font-medium text-slate-800">{formatDate(journey.startedAt)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Valor / Receita</dt>
            <dd className="font-mono font-bold text-emerald-700">{formatMoney(journey.totalRevenueMinor, journey.currency)}</dd>
          </div>
        </dl>
      </section>

      {/* 3. Informações Conhecidas */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-2.5 py-1.5">
          <p className="flex items-center gap-1 text-[11px] font-bold text-slate-900 font-heading">
            <Sparkles size={12} className="text-indigo-600" /> Informações Conhecidas ({displayFacts.length})
          </p>
          <button
            type="button"
            onClick={onOpenFactModal}
            className="text-[10.5px] font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
          >
            + Adicionar
          </button>
        </div>
        <div className="max-h-[180px] space-y-1.5 overflow-y-auto p-2">
          {displayFacts.length === 0 ? (
            availability(
              "Sem observações ainda",
              "Nenhuma preferência ou dado adicional registrado para este cliente."
            )
          ) : (
            displayFacts.map((fact) => (
              <div key={fact.id} className="rounded-lg border border-slate-100 bg-slate-50/70 p-2 text-xs">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold text-indigo-700">{fact.key}</p>
                  <span className="rounded bg-indigo-100 px-1 py-0.2 font-mono text-[8.5px] font-bold text-indigo-800">
                    {Math.round(fact.confidence * 100)}%
                  </span>
                </div>
                <p className="mt-0.5 break-words text-[11px] text-slate-800 font-medium">{valueToText(fact.value)}</p>
                <p className="mt-0.5 text-[9.5px] text-slate-500">
                  {fact.source} {fact.confirmedByCustomer ? " · confirmado" : ""}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 4. Anotações do Atendente */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-2.5 py-1.5">
          <p className="flex items-center gap-1 text-[11px] font-bold text-slate-900 font-heading">
            <Brain size={12} className="text-purple-600" /> Anotações ({operatorNotes.length})
          </p>
          <button
            type="button"
            onClick={() => setIsAddingNote((v) => !v)}
            className="text-[10.5px] font-bold text-purple-600 hover:text-purple-800 transition cursor-pointer"
          >
            {isAddingNote ? 'Cancelar' : '+ Nova Nota'}
          </button>
        </div>
        <div className="space-y-1.5 p-2">
          {isAddingNote && (
            <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-2 space-y-1.5 animate-in fade-in">
              <div className="flex items-center gap-1">
                <span className="text-[9.5px] font-bold text-purple-900">Tag:</span>
                <select
                  value={newNoteTag}
                  onChange={(e) => setNewNoteTag(e.target.value)}
                  className="rounded border border-purple-200 bg-white px-1.5 py-0.2 text-[9.5px] font-bold text-purple-900"
                >
                  <option value="Preferência">Preferência</option>
                  <option value="Orçamento">Orçamento</option>
                  <option value="Restrição">Restrição</option>
                  <option value="Urgência">Urgência</option>
                </select>
              </div>
              <textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="Escreva uma anotação sobre este cliente..."
                rows={2}
                className="w-full rounded-lg border border-purple-200 bg-white p-1.5 text-xs text-slate-900 outline-none focus:ring-1 focus:ring-purple-500"
              />
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  onClick={handleAddNote}
                  className="rounded-lg bg-purple-600 px-2 py-0.5 text-xs font-bold text-white hover:bg-purple-700 shadow-2xs cursor-pointer"
                >
                  Salvar Nota
                </button>
              </div>
            </div>
          )}
          {operatorNotes.map((n) => (
            <div key={n.id} className="rounded-lg border border-slate-100 bg-slate-50/70 p-1.5 text-xs space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="rounded bg-purple-100 px-1 py-0.2 font-bold text-[9px] text-purple-800">
                  {n.tag}
                </span>
                <span className="text-[9.5px] text-slate-400 font-mono">{n.time}</span>
              </div>
              <p className="text-slate-800 text-[11px] font-medium leading-snug">{n.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Dúvidas & Objeções */}
      <section className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs space-y-1">
        <p className="flex items-center gap-1 text-[11px] font-bold text-slate-900 font-heading">
          <AlertTriangle size={12} className="text-amber-500" /> Dúvidas & Objeções
        </p>
        {displayFriction ? (
          <>
            <p className="text-xs font-bold text-slate-800">
              {displayFriction}
            </p>
            <p className="text-[11px] leading-relaxed text-slate-600">
              {displayFrictionEvidence || "Sem evidência de atrito pendente."}
            </p>
          </>
        ) : (
          <p className="text-[11px] text-slate-500">Nenhuma objeção ou dúvida pendente.</p>
        )}
      </section>

      {/* 6. Ações Rápidas do Dossiê */}
      <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 shadow-2xs space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-heading">
          Ações Comerciais Rápidas
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {onOpenFollowUpModal && (
            <button
              type="button"
              onClick={onOpenFollowUpModal}
              className="flex items-center justify-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-100 transition shadow-2xs"
            >
              <Calendar size={12} /> Agendar Follow
            </button>
          )}
          {onOpenOutcomeModal && (
            <button
              type="button"
              onClick={onOpenOutcomeModal}
              className="flex items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs"
            >
              <DollarSign size={12} /> Desfecho
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

// Modals
function FollowUpModal({
  onClose,
  onSubmit,
  inProgress,
}: {
  onClose: () => void;
  onSubmit: (dueAt: string, reason: string) => void;
  inProgress: boolean;
}) {
  const [dueAt, setDueAt] = React.useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    return tomorrow.toISOString().slice(0, 16);
  });
  const [reason, setReason] = React.useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-slate-950">Agendar Follow-Up Comercial</h3>
        <p className="mt-1 text-xs text-slate-600">
          Define uma data de retorno auditável vinculada a esta jornada.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700">Data e Horário</label>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700">Motivo do Retorno</label>
            <input
              type="text"
              placeholder="ex: Cliente pediu para ligar após receber proposta"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={inProgress}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              if (reason.trim() && dueAt) {
                onSubmit(new Date(dueAt).toISOString(), reason.trim());
              }
            }}
            disabled={inProgress || !reason.trim() || !dueAt}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Agendar
          </button>
        </div>
      </div>
    </div>
  );
}

function OutcomeModal({
  onClose,
  onSubmit,
  inProgress,
}: {
  onClose: () => void;
  onSubmit: (result: "WON" | "LOST" | "ABANDONED", revenueBrl: number, reason?: string) => void;
  inProgress: boolean;
}) {
  const [result, setResult] = React.useState<"WON" | "LOST" | "ABANDONED">("WON");
  const [revenueBrl, setRevenueBrl] = React.useState("0.00");
  const [reason, setReason] = React.useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-slate-950">Registrar Desfecho Comercial</h3>
        <p className="mt-1 text-xs text-slate-600">
          Resultados encerram a jornada e alimentam o Traffic Proof e o CAPI.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700">Resultado</label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setResult("WON")}
                className={`rounded-lg border p-2 text-xs font-bold ${
                  result === "WON"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                Ganho (WON)
              </button>
              <button
                type="button"
                onClick={() => setResult("LOST")}
                className={`rounded-lg border p-2 text-xs font-bold ${
                  result === "LOST"
                    ? "border-rose-600 bg-rose-50 text-rose-800"
                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                Perdido (LOST)
              </button>
              <button
                type="button"
                onClick={() => setResult("ABANDONED")}
                className={`rounded-lg border p-2 text-xs font-bold ${
                  result === "ABANDONED"
                    ? "border-amber-600 bg-amber-50 text-amber-800"
                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                Abandonado
              </button>
            </div>
          </div>

          {result === "WON" && (
            <div>
              <label className="block text-xs font-bold text-slate-700">Valor Fechado (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={revenueBrl}
                onChange={(e) => setRevenueBrl(e.target.value)}
                placeholder="ex: 150.00"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700">Motivo / Observação</label>
            <input
              type="text"
              placeholder="ex: Fechamento plano anual via Pix"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={inProgress}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              const val = parseFloat(revenueBrl) || 0;
              onSubmit(result, result === "WON" ? val : 0, reason.trim() || undefined);
            }}
            disabled={inProgress}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Confirmar Desfecho
          </button>
        </div>
      </div>
    </div>
  );
}

function KnownFactModal({
  onClose,
  onSubmit,
  inProgress,
}: {
  onClose: () => void;
  onSubmit: (fact: {
    key: string;
    value: unknown;
    confidence: number;
    confirmedByCustomer: boolean;
  }) => void;
  inProgress: boolean;
}) {
  const [namespace, setNamespace] = React.useState("cliente");
  const [factName, setFactName] = React.useState("");
  const [factValue, setFactValue] = React.useState("");
  const [confidence, setConfidence] = React.useState("1.0");
  const [confirmed, setConfirmed] = React.useState(true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-slate-950">Registrar Fato Conhecido</h3>
        <p className="mt-1 text-xs text-slate-600">
          Chaves devem seguir o padrão com namespace (ex: <code>cliente.orcamento</code> ou <code>servico.tipo</code>).
        </p>

        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-700">Namespace</label>
              <select
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
              >
                <option value="cliente">cliente</option>
                <option value="servico">servico</option>
                <option value="produto">produto</option>
                <option value="negocio">negocio</option>
                <option value="orcamento">orcamento</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700">Nome do Fato</label>
              <input
                type="text"
                placeholder="ex: orcamento_maximo"
                value={factName}
                onChange={(e) => setFactName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700">Valor do Fato</label>
            <input
              type="text"
              placeholder="ex: R$ 500 a R$ 1.000"
              value={factValue}
              onChange={(e) => setFactValue(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-700">Confiança (0 a 1.0)</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={confidence}
                onChange={(e) => setConfidence(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
              />
            </div>
            <div className="flex items-center pt-5">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                Confirmado pelo cliente
              </label>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={inProgress}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              if (factName.trim() && factValue.trim()) {
                const fullKey = `${namespace}.${factName.trim()}`;
                const conf = Math.max(0, Math.min(1, parseFloat(confidence) || 1));
                onSubmit({
                  key: fullKey,
                  value: factValue.trim(),
                  confidence: conf,
                  confirmedByCustomer: confirmed,
                });
              }
            }}
            disabled={inProgress || !factName.trim() || !factValue.trim()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            Salvar Fato
          </button>
        </div>
      </div>
    </div>
  );
}

function ReturnToAiModal({
  handoffCaseId: _handoffCaseId,
  onClose,
  onSubmit,
  inProgress,
}: {
  handoffCaseId: string;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  inProgress: boolean;
}) {
  const [reason, setReason] = React.useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-slate-950">Devolver Atendimento para IA</h3>
        <p className="mt-1 text-xs text-slate-600">
          A IA assumirá as respostas automáticas seguindo os guardrails do playbook.
        </p>

        <div className="mt-4">
          <label className="block text-xs font-bold text-slate-700">Motivo da Devolução</label>
          <input
            type="text"
            placeholder="ex: Dúvida pontual esclarecida, retorno para fluxo automático"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={inProgress}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              if (reason.trim().length >= 3) {
                onSubmit(reason.trim());
              }
            }}
            disabled={inProgress || reason.trim().length < 3}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Confirmar Devolução
          </button>
        </div>
      </div>
    </div>
  );
}

function WabaTemplateModal({
  workspaceId,
  onClose,
  onSubmit,
  inProgress,
}: {
  workspaceId: string;
  onClose: () => void;
  onSubmit: (templateName: string, languageCode: string, bodyParameters: string[]) => void;
  inProgress: boolean;
}) {
  const [templateName, setTemplateName] = React.useState("hello_world");
  const [languageCode, setLanguageCode] = React.useState("pt_BR");
  const [param1, setParam1] = React.useState("");
  const [param2, setParam2] = React.useState("");
  const [availableTemplates, setAvailableTemplates] = React.useState<Array<{ name: string; language: string; status: string; components?: Array<{ type: string; format?: string; text?: string; buttons?: any[] }> }>>([]);
  const [loadingTemplates, setLoadingTemplates] = React.useState(false);

  // Approved templates only
  const approvedTemplates = availableTemplates.filter((t) => t.status === 'APPROVED');
  const selectedTpl = approvedTemplates.find((t) => t.name === templateName) || null;
  const selectedBody = selectedTpl?.components?.find((c: any) => c.type === 'BODY')?.text || '';
  const selectedHeader = selectedTpl?.components?.find((c: any) => c.type === 'HEADER' && c.format === 'TEXT')?.text || '';
  const selectedFooter = selectedTpl?.components?.find((c: any) => c.type === 'FOOTER')?.text || '';
  const selectedButtons = selectedTpl?.components?.find((c: any) => c.type === 'BUTTONS')?.buttons || [];

  // Build live preview replacing {{1}}, {{2}} with actual param values
  const previewBody = selectedBody
    .replace(/\{\{1\}\}/g, param1 || '{{1}}')
    .replace(/\{\{2\}\}/g, param2 || '{{2}}')
    .replace(/\{\{3\}\}/g, '...');

  const varSlots = (selectedBody.match(/\{\{\d+\}\}/g) || []).length;

  React.useEffect(() => {
    setLoadingTemplates(true);
    fetch(`/api/v1/workspaces/${workspaceId}/channels/waba/templates`)
      .then((res) => res.json())
      .then((data) => {
        if (data.templates && Array.isArray(data.templates)) {
          setAvailableTemplates(data.templates);
          const firstApproved = data.templates.find((t: any) => t.status === 'APPROVED');
          if (firstApproved) {
            setTemplateName(firstApproved.name);
            setLanguageCode(firstApproved.language || 'pt_BR');
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTemplates(false));
  }, [workspaceId]);


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-emerald-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-sm">
              <FileText size={15} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Reativar Contato</h3>
              <p className="text-[11px] text-slate-500">Mensagem oficial Meta · Reabre janela de 24h</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Template Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Modelo Aprovado
              {loadingTemplates && <span className="text-slate-400 font-normal ml-2 text-[11px]">carregando...</span>}
            </label>

            {loadingTemplates ? (
              <div className="w-full rounded-lg border border-slate-200 p-3 text-[11px] text-slate-400 flex items-center gap-2">
                <RefreshCw size={12} className="animate-spin" /> Consultando modelos aprovados na Meta...
              </div>
            ) : approvedTemplates.length > 0 ? (
              <select
                value={templateName}
                onChange={(e) => {
                  setTemplateName(e.target.value);
                  const selected = approvedTemplates.find((t) => t.name === e.target.value);
                  if (selected) { setLanguageCode((selected as any).language || 'pt_BR'); setParam1(''); setParam2(''); }
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
              >
                {approvedTemplates.map((t) => (
                  <option key={`${t.name}-${t.language}`} value={t.name}>
                    {t.name} · {t.language}
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-2">
                <p className="font-bold">⚠️ Nenhum modelo aprovado encontrado</p>
                <p className="text-[11px]">Vá em <strong>Canais → Modelos WABA</strong> para criar e submeter modelos para aprovação da Meta.</p>
              </div>
            )}
          </div>

          {/* WhatsApp Preview Bubble */}
          {selectedTpl && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Pré-visualização</label>
              <div className="bg-[#e5ddd5] rounded-xl p-4">
                <div className="bg-[#dcf8c6] rounded-xl rounded-tl-none p-3 space-y-1 max-w-xs shadow-sm">
                  {selectedHeader && <p className="text-[11px] font-bold text-slate-900">{selectedHeader}</p>}
                  <p className="text-[11px] text-slate-800 leading-relaxed whitespace-pre-wrap">
                    {previewBody || <span className="text-slate-400 italic">Corpo não encontrado</span>}
                  </p>
                  {selectedFooter && <p className="text-[10px] text-slate-500">{selectedFooter}</p>}
                  {selectedButtons.length > 0 && (
                    <div className="pt-1.5 border-t border-[#b2dfb0] space-y-1">
                      {selectedButtons.map((btn: any, i: number) => (
                        <div key={i} className="text-center text-[11px] font-bold text-[#0084ff]">{btn.text}</div>
                      ))}
                    </div>
                  )}
                  <div className="text-right text-[10px] text-slate-400">agora ✓✓</div>
                </div>
              </div>
            </div>
          )}

          {/* Variable Inputs (shown dynamically based on how many vars the template has) */}
          {selectedTpl && varSlots > 0 && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                Preencher Variáveis <span className="text-slate-400 font-normal">({varSlots} encontrada{varSlots > 1 ? 's' : ''})</span>
              </label>
              <input
                type="text"
                value={param1}
                onChange={(e) => setParam1(e.target.value)}
                placeholder="{{1}} — Ex: Nome do cliente"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              {varSlots >= 2 && (
                <input
                  type="text"
                  value={param2}
                  onChange={(e) => setParam2(e.target.value)}
                  placeholder="{{2}} — Ex: Data ou horário"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50">
          <span className="text-[10px] text-slate-400 font-mono">{languageCode}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={inProgress}
              className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                const params: string[] = [];
                if (param1.trim()) params.push(param1.trim());
                if (param2.trim()) params.push(param2.trim());
                if (templateName.trim() && languageCode.trim()) {
                  onSubmit(templateName.trim(), languageCode.trim(), params);
                }
              }}
              disabled={inProgress || !templateName.trim() || approvedTemplates.length === 0}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              {inProgress ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
              {inProgress ? 'Enviando...' : 'Enviar e Reativar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

