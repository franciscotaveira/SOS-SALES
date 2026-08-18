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
import { extractCustomerGoalFromChat, reasonOverOrdersERP } from "../../services/universalToolVisionEngine";
import { AutonomousSupervisorPanel } from "./AutonomousSupervisorPanel";
import { StartConversationModal } from "../conversations/StartConversationModal";
import { getWorkspaceCommercialConfig } from "../../services/workspaceCommercialConfig";

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

const PIPELINE_STAGES = [
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

function QueueCard({
  item,
  selected,
  onClick,
}: {
  item: ApiPriority | ApiJourney;
  selected: boolean;
  onClick: () => void;
}) {
  const hasPriority = "priorityReason" in item;
  const title = item.contactName || (item.contactPhone ? `Cliente ${item.contactPhone.slice(-4)}` : "Contato sem nome");
  const time = hasPriority ? item.lastMessageAt : item.updatedAt;
  const urgent = hasPriority && item.slaState === "OVERDUE";
  const avatarUrl = (item as any).contactAvatar || (item as any).avatarUrl;
  
  // Detecção inteligente do serviço e resumo de intenção
  const intent = React.useMemo(() => detectServiceAndIntent(item), [item]);

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
      return { label: "Click WA", bg: "bg-emerald-100 text-emerald-800 border-emerald-200" };
    }
    if (text.includes("instagram") || text.includes("insta")) {
      return { label: "Instagram", bg: "bg-pink-100 text-pink-800 border-pink-200" };
    }
    return { label: "WhatsApp", bg: "bg-slate-100 text-slate-700 border-slate-200" };
  }, [item.contactName, intent.preview]);


  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border p-2.5 text-left transition-all focus-visible:outline-offset-2 cursor-pointer relative group ${
        selected
          ? "border-emerald-500 bg-emerald-50/70 shadow-xs ring-2 ring-emerald-500/20 border-l-4 border-l-emerald-600"
          : urgent
          ? "border-rose-300 bg-rose-50/50 hover:border-rose-400 hover:bg-rose-50/80 shadow-2xs"
          : "border-slate-200/90 bg-white hover:border-emerald-400 hover:bg-slate-50/90 shadow-2xs"
      }`}
    >
      <div className="flex items-start gap-2.5">
        {/* Avatar */}
        <div className="relative shrink-0">
          <ContactAvatar
            name={item.contactName}
            phone={item.contactPhone}
            avatarUrl={avatarUrl}
            size="md"
            showOnlineBadge={hasPriority ? item.slaState === "OK" : true}
            className="mt-0.5 shadow-2xs"
          />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          {/* Linha 1: Nome do Cliente + Hora */}
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="truncate text-xs font-bold text-slate-900 font-heading">
                {title}
              </p>
              <span className={`px-1 py-0.2 rounded text-[8.5px] font-extrabold border shrink-0 ${sourceTag.bg}`}>
                {sourceTag.label}
              </span>
            </div>
            
            <span className="font-mono text-[10px] font-bold text-slate-400 shrink-0">
              {timeDisplay}
            </span>
          </div>

          {/* Linha 2: SERVIÇO / INTENÇÃO EM DESTAQUE VISUAL IMEDIATO (TDAH-FRIENDLY) */}
          <div className="flex items-center gap-1 min-w-0">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] border shadow-2xs truncate ${intent.badgeClass}`}>
              <span className="truncate">{intent.service}</span>
            </span>
          </div>

          {/* Linha 3: Trecho da Mensagem / Contexto */}
          <div className="flex items-start gap-1 text-slate-600">
            <CheckCheck className="w-3 h-3 text-[#53bdeb] shrink-0 mt-0.5" />
            <p className="line-clamp-1 text-[11px] text-slate-600 leading-snug font-medium">
              {intent.preview}
            </p>
          </div>

          {/* Linha 4: Etapa + Status + Botão de Ação */}
          <div className="flex items-center justify-between gap-1 border-t border-slate-100 pt-1.5 text-[10px]">
            <span className="inline-flex items-center gap-1 font-bold text-slate-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="truncate">{hasPriority ? item.priorityReason : stageLabel(item.pipelineStage)}</span>
            </span>

            <span className={`px-2 py-0.5 rounded-lg text-[9.5px] font-extrabold transition-all shadow-2xs ${
              selected
                ? "bg-emerald-600 text-white"
                : "bg-slate-900 hover:bg-slate-800 text-white"
            }`}>
              {selected ? "Em atendimento" : "Abrir →"}
            </span>
          </div>
        </div>
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

  const [queueTab, setQueueTab] = React.useState<'all' | 'priorities' | 'in_progress'>('all');
  const [queueSearch, setQueueSearch] = React.useState('');

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

  const rawQueue = queueTab === 'priorities' && prioritiesList.length > 0
    ? prioritiesList
    : queueTab === 'in_progress'
      ? journeysList.filter((j) => (j as any).status === 'in_progress' || j.pipelineStage === 'QUALIFIED' || j.pipelineStage === 'PROPOSAL' || (j as any).priorityReason)
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

      {/* Compact Top Operational Header */}
      <section className="mb-2.5 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-1.5 shadow-2xs shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-sm font-bold tracking-tight text-slate-950 font-heading">Cockpit ao Vivo</h1>
          </div>
          <span className="text-slate-300 hidden sm:inline">|</span>
          <p className="text-[11px] text-slate-500 hidden sm:inline">
            Fila de contatos reais do WhatsApp com envio direto e SLAs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleClearHistory()}
            disabled={actionInProgress}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-rose-700 hover:bg-rose-50 hover:border-rose-200 disabled:opacity-60 transition shadow-2xs cursor-pointer"
            title="Apaga todas as conversas e leads sincronizados deste workspace"
          >
            <Trash2 size={12} /> Limpar
          </button>
          <button
            type="button"
            onClick={() => void refresh(false)}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-xl bg-slate-900 hover:bg-emerald-600 text-white px-3 py-1 text-xs font-bold disabled:opacity-60 transition shadow-2xs cursor-pointer"
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} /> Atualizar
          </button>
        </div>
      </section>

      <div
        className={`grid flex-1 min-h-0 gap-2.5 grid-cols-1 md:grid-cols-[270px_minmax(0,1fr)] ${
          isDossierCollapsed
            ? 'xl:grid-cols-[270px_minmax(0,1fr)_44px]'
            : 'xl:grid-cols-[270px_minmax(0,1fr)_310px]'
        } overflow-hidden`}
      >
        {/* Priority / All Conversations Sidebar */}
        <aside className="bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col h-full min-h-0 overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/70 p-2 space-y-1.5 shrink-0">
            {/* Tab switchers */}
            <div className="grid grid-cols-3 gap-1 bg-slate-200/70 p-0.5 rounded-xl text-[10.5px] font-bold">
              <button
                type="button"
                onClick={() => setQueueTab('all')}
                className={`py-1 px-1 rounded-lg transition-all text-center flex items-center justify-center gap-1 ${
                  queueTab === 'all'
                    ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title={`Todas as conversas (${journeysList.length})`}
              >
                <span>💬 Todas</span>
                <span className="text-[9.5px] font-mono px-1 py-0.2 rounded-full bg-slate-100 text-slate-700">{journeysList.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setQueueTab('priorities')}
                className={`py-1 px-1 rounded-lg transition-all text-center flex items-center justify-center gap-1 ${
                  queueTab === 'priorities'
                    ? 'bg-white text-rose-800 shadow-2xs font-extrabold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title={`Fila de prioridades (${prioritiesList.length})`}
              >
                <span>🔥 Fila</span>
                <span className="text-[9.5px] font-mono px-1 py-0.2 rounded-full bg-rose-100 text-rose-800">{prioritiesList.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setQueueTab('in_progress')}
                className={`py-1 px-1 rounded-lg transition-all text-center flex items-center justify-center gap-1 ${
                  queueTab === 'in_progress'
                    ? 'bg-white text-emerald-800 shadow-2xs font-extrabold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Conversas em andamento"
              >
                <span>⚡ Ativas</span>
                <span className="text-[9.5px] font-mono px-1 py-0.2 rounded-full bg-emerald-100 text-emerald-800">
                  {journeysList.filter((j) => (j as any).status === 'in_progress' || j.pipelineStage === 'QUALIFIED' || j.pipelineStage === 'PROPOSAL' || (j as any).priorityReason).length}
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

          <div className="space-y-1.5 overflow-y-auto p-2 flex-1 min-h-0">
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
              isDossierCollapsed={isDossierCollapsed}
              onToggleDossier={toggleDossierCollapse}
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

        {/* Right Dossier Sidebar (Collapsible / Expandable) */}
        {isDossierCollapsed ? (
          <aside className="hidden xl:flex flex-col items-center justify-center h-full min-h-0">
            <button
              type="button"
              onClick={toggleDossierCollapse}
              className="group flex flex-col items-center gap-2.5 py-4 px-1.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/70 shadow-xs transition-all cursor-pointer text-slate-600 hover:text-indigo-700"
              title="Expandir Histórico do Cliente"
              aria-label="Expandir Histórico do Cliente"
            >
              <div className="w-6 h-6 rounded-lg bg-indigo-50 group-hover:bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-2xs">
                <Sparkles size={13} />
              </div>
              <span className="text-[10px] font-extrabold tracking-wider [writing-mode:vertical-lr] rotate-180 uppercase text-slate-700 group-hover:text-indigo-900 select-none">
                Histórico
              </span>
              <ChevronLeft size={13} className="text-slate-400 group-hover:text-indigo-600 animate-pulse" />
            </button>
          </aside>
        ) : (
          <aside className="bg-white border border-slate-200 rounded-2xl shadow-xs min-w-0 hidden xl:flex flex-col h-full min-h-0 overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50/70 flex items-center justify-between px-3 py-2 shrink-0">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900 font-heading uppercase tracking-wider">
                  <Sparkles size={13} className="text-indigo-600" /> Histórico do Cliente
                </p>
                <p className="text-[10px] text-slate-500">Preferências, dados e anotações</p>
              </div>
              <div className="flex items-center gap-1">
                {view && (
                  <button
                    type="button"
                    onClick={() => setFactModalOpen(true)}
                    className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 shadow-2xs cursor-pointer"
                    title="Registrar informação do cliente"
                  >
                    <Plus size={11} /> Info
                  </button>
                )}
                <button
                  type="button"
                  onClick={toggleDossierCollapse}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                  title="Recolher Histórico do Cliente"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
            <div className="space-y-2.5 p-2.5 overflow-y-auto flex-1 min-h-0">
              {!view && availability("Sem cliente selecionado", "O histórico aparece ao selecionar uma conversa.")}
              {view && (
                <LiveDossier
                  view={view}
                  workspaceId={workspaceId}
                  onOpenFactModal={() => setFactModalOpen(true)}
                  onOpenFollowUpModal={() => setFollowUpModalOpen(true)}
                  onOpenOutcomeModal={() => setOutcomeModalOpen(true)}
                />
              )}
            </div>
          </aside>
        )}
      </div>

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

      {wabaButtonsModalOpen && (
        <WabaInteractiveModal
          onClose={() => setWabaButtonsModalOpen(false)}
          onSubmitButtons={handleSendWabaButtons}
          onSubmitList={handleSendWabaList}
          onSubmitFlow={handleSendWabaFlow}
          inProgress={actionInProgress}
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
  actionInProgress,
}: {
  view: ApiCockpitView;
  workspaceId: string;
  isDossierCollapsed?: boolean;
  onToggleDossier?: () => void;
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

  const isTrinksClient = (commercialConfig.agendaProviderName || '').toLowerCase().includes('trinks') || (workspaceId || '').toLowerCase().includes('haven') || (workspaceId || '').toLowerCase().includes('escovaria');
  const agendaProviderLabel = commercialConfig.agendaProviderName || (isTrinksClient ? "Agenda Trinks" : "Agenda & Vagas");

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
  const showTurningPoint = currentNormalized !== inferredDossier.suggestedStage && messages.length > 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden">
      {/* Header & Stage Controller */}
      <header className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <ContactAvatar
              name={journey.contact.name}
              phone={journey.contact.phone}
              avatarUrl={(journey.contact as any)?.avatarUrl || (journey as any)?.leadAvatar}
              size="md"
              showOnlineBadge={isWindowActive}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-bold text-sm text-slate-950 truncate font-heading">
                  {journey.contact.name || "Contato sem nome"}
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
                  className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-slate-200/60 rounded-md transition cursor-pointer"
                >
                  <Edit2 size={12} />
                </button>
                {hoursSinceLastInbound !== null && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      isWindowActive
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-amber-100 text-amber-800 border border-amber-300"
                    }`}
                    title={
                      isWindowActive
                        ? `Janela de mensagens livres ativa: ${(Number(hoursRemaining) || 0).toFixed(1)}h restantes`
                        : "Janela de 24h expirada. Envie uma mensagem de reativação para retomar o contato."
                    }
                  >
                    <Clock size={10} />
                    {isWindowActive ? `Janela Meta: ${(Number(hoursRemaining) || 0).toFixed(1)}h` : "Janela: Expirada (Reativar)"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <p className="font-mono text-xs text-slate-500 truncate">{journey.contact.phone}</p>
                <span className="text-slate-300">•</span>
                <span className="text-[11px] font-semibold text-slate-700 truncate max-w-[140px]" title={acquisition?.campaignName || inferredDossier.originLabel}>
                  {acquisition?.campaignName || inferredDossier.originLabel}
                </span>
                {(ctwaFact || inferredDossier.originType === 'META_ADS') && (
                  <span className="rounded bg-indigo-100 border border-indigo-300 px-1.5 py-0.2 text-[9.5px] font-bold text-indigo-800 flex items-center gap-0.5 shrink-0">
                    <Zap size={9} className="text-amber-500" /> Click WA
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {/* Suggested Stage Advance Chip (Ponto de Virada Integrado) */}
            {showTurningPoint && (
              <button
                type="button"
                onClick={() => onStageChange(inferredDossier.suggestedStage)}
                disabled={actionInProgress}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-300 text-indigo-800 px-2 py-0.5 text-xs font-bold shadow-2xs hover:bg-indigo-100 transition cursor-pointer"
                title={`Sugerido pela IA: Avançar para ${stageLabel(inferredDossier.suggestedStage)} (${inferredDossier.stageReason})`}
              >
                <Sparkles size={11} className="text-indigo-600 animate-pulse" />
                <span>Sugerido: {stageLabel(inferredDossier.suggestedStage)}</span>
                <ChevronRight size={11} />
              </button>
            )}

            <span className="text-[11px] font-bold text-slate-600 hidden sm:inline">Estágio:</span>
            <select
              id="stage-selector"
              value={currentNormalized}
              onChange={(e) => onStageChange(e.target.value)}
              disabled={actionInProgress}
              className="rounded-md border border-blue-300 bg-white px-2 py-0.5 text-xs font-bold text-blue-900 shadow-xs focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              {PIPELINE_STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            {handoff && isHandoffActive && (
              <div className="flex items-center gap-1 ml-1">
                <button
                  type="button"
                  onClick={() => onAcceptHandoff(handoff.id)}
                  disabled={actionInProgress}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-0.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
                >
                  <UserCheck size={12} /> Assumir
                </button>
                <button
                  type="button"
                  onClick={() => onResolveHandoff(handoff.id)}
                  disabled={actionInProgress}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                >
                  <Check size={12} /> Concluir
                </button>
              </div>
            )}

            {/* Level 5: Live Closing Probability Thermometer & Radar */}
            <div
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-bold shadow-2xs cursor-help ${
                liveSentiment.closingProbability >= 75
                  ? "bg-rose-50 border-rose-200 text-rose-700"
                  : liveSentiment.closingProbability >= 50
                    ? "bg-amber-50 border-amber-200 text-amber-700"
                    : "bg-slate-50 border-slate-200 text-slate-600"
              }`}
              title={`Radar Biopsicológico (Level 5): ${liveSentiment.tacticalRecommendation}`}
            >
              <span className="relative flex h-2 w-2">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    liveSentiment.closingProbability >= 75
                      ? "bg-rose-400"
                      : liveSentiment.closingProbability >= 50
                        ? "bg-amber-400"
                        : "bg-slate-400"
                  }`}
                ></span>
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    liveSentiment.closingProbability >= 75
                      ? "bg-rose-600"
                      : liveSentiment.closingProbability >= 50
                        ? "bg-amber-600"
                        : "bg-slate-500"
                  }`}
                ></span>
              </span>
              <span>{liveSentiment.closingProbability}% Fechamento</span>
            </div>

            {/* Dynamic Agenda CTA */}
            <button
              type="button"
              onClick={onOpenExternalAgenda}
              disabled={actionInProgress}
              className="inline-flex items-center gap-1 rounded-md border border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-800 px-2 py-0.5 text-xs font-bold transition disabled:opacity-60 cursor-pointer shadow-2xs"
              title={`Consultar horários e integração (${agendaProviderLabel})`}
            >
              <Calendar size={12} className="text-purple-600" /> {agendaProviderLabel}
            </button>

            {/* Follow-Up CTA */}
            <button
              type="button"
              onClick={onOpenFollowUpModal}
              disabled={actionInProgress}
              className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-60 cursor-pointer shadow-2xs"
            >
              <Clock size={12} /> Follow-Up
            </button>

            {/* Desfecho CTA */}
            <button
              type="button"
              onClick={onOpenOutcomeModal}
              disabled={actionInProgress}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60 cursor-pointer shadow-2xs"
            >
              <DollarSign size={12} /> Desfecho
            </button>

            {onClearCurrentJourney && (
              <button
                type="button"
                onClick={onClearCurrentJourney}
                disabled={actionInProgress}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-500 hover:text-rose-700 hover:bg-rose-50 hover:border-rose-200 disabled:opacity-60 transition cursor-pointer"
                title="Reiniciar/limpar apenas esta conversa"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-col flex-1 min-h-0 p-2.5 gap-1.5 overflow-hidden">
        {/* Level 4: Ghosting Resurrection Intelligence */}
        {hoursSinceLastMessage >= 3 && hoursSinceLastMessage < 72 && journey.pipelineStage !== 'CLOSED_WON' && (
          <div className="p-2 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/30 rounded-xl flex items-center justify-between gap-2 text-xs shrink-0 shadow-2xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="px-2 py-0.5 bg-amber-600 text-white rounded font-bold text-[10px] shrink-0 uppercase tracking-wider">
                ⚡ Vácuo ({hoursSinceLastMessage.toFixed(1)}h)
              </span>
              <span className="text-slate-700 truncate text-[11px]">
                Lead em silêncio comercial. Reative a negociação com gancho sutil de IA.
              </span>
            </div>
            <button
              type="button"
              onClick={handleTriggerResurrection}
              disabled={isGeneratingResurrection}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-[11px] shrink-0 flex items-center gap-1 shadow-2xs transition cursor-pointer"
            >
              <Sparkles size={12} /> {isGeneratingResurrection ? "Sintetizando..." : "Reanimar com IA"}
            </button>
          </div>
        )}

        {/* Hidden File Input for Attachments */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileInputChange}
          accept="image/*,video/*,audio/*,application/pdf"
        />

        {/* Normalized Messages Stream (Flexible & Spacious) */}
        <section
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="relative flex-1 min-h-0 rounded-xl border border-slate-200 bg-[#efeae2] p-3 overflow-y-auto whatsapp-chat-wallpaper"
        >
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center p-6 text-center text-xs text-slate-500">
              Ainda não há mensagens registradas nesta conversa. Envie uma mensagem pelo campo abaixo para iniciar o contato com o cliente via WhatsApp.
            </div>
          ) : (
            <div className="space-y-2.5">
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
                    <div className="mt-1 text-right text-[10px] text-slate-500 font-mono flex items-center justify-end gap-1">
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

        {/* Supervised AI Suggestion & Outbound Composer Strip */}
        <section className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs shrink-0 space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs text-violet-900 border border-violet-200">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <Bot size={14} className="text-violet-600 shrink-0" />
              <span className="font-bold text-[10.5px] shrink-0">Copilot IA:</span>
              <span className="italic truncate text-[11px]">
                {recommendation?.suggestedDraftText || inferredDossier.suggestedDraftText || recommendation?.suggestedAction || inferredDossier.suggestedAction || "Sugestão inteligente contextual baseada no estágio"}
              </span>
              {(recommendation || inferredDossier) && (
                <span className="rounded bg-violet-200/80 px-1 py-0.2 font-mono text-[9px] font-bold text-violet-900 shrink-0">
                  {Math.round((recommendation?.confidence || inferredDossier.confidenceService || 0.9) * 100)}%
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {(recommendation?.suggestedDraftText || inferredDossier.suggestedDraftText) && (
                <button
                  type="button"
                  onClick={() => setDraftText(recommendation?.suggestedDraftText || inferredDossier.suggestedDraftText || "")}
                  className="rounded bg-violet-600 px-2 py-0.5 text-[10.5px] font-bold text-white hover:bg-violet-700 transition cursor-pointer"
                >
                  Usar sugestão
                </button>
              )}
              <button
                type="button"
                onClick={handleGenerateCopilotSuggestion}
                disabled={isGeneratingCopilot}
                className="rounded bg-slate-900 px-2 py-0.5 text-[10.5px] font-bold text-white hover:bg-slate-800 transition flex items-center gap-1 cursor-pointer"
                title="Gera nova sugestão ultra-rápida via OpenRouter/Nemotron"
              >
                <Sparkles size={11} className={isGeneratingCopilot ? "animate-spin" : "text-amber-400"} />
                {isGeneratingCopilot ? "Gerando..." : "Gerar com IA"}
              </button>
            </div>
          </div>

          {/* Expired Window Advisory */}
          {hoursSinceLastInbound !== null && !isWindowActive && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900 border border-amber-200">
              <div className="flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                <span className="text-[11px]">Janela de 24h encerrada. Envie uma mensagem de reativação para retomar o contato:</span>
              </div>
              <button
                type="button"
                onClick={onOpenWabaTemplateModal}
                className="shrink-0 rounded bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700 transition flex items-center gap-1 shadow-2xs"
              >
                <FileText size={11} /> Reativar Contato
              </button>
            </div>
          )}

          {/* Fast Macro & Media Vault Toolbar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0 flex items-center gap-1">
              <Zap size={10} className="text-amber-500" /> Atalhos:
            </span>

            {/* Quick Trigger for Audio & Media Vault */}
            <button
              type="button"
              onClick={onOpenSalesVaultModal}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition shrink-0 cursor-pointer shadow-2xs"
              title="Abrir Recursos de Venda, Áudios e Catálogos"
            >
              <Mic size={11} className="text-slate-500" /> 🎙️ Recursos
            </button>

            {/* Quick Trigger for External Agenda */}
            <button
              type="button"
              onClick={onOpenExternalAgenda}
              className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 text-[11px] font-bold text-purple-700 transition shrink-0 cursor-pointer shadow-2xs"
              title="Consultar vagas livres e grade Trinks"
            >
              <Calendar size={11} className="text-purple-600" /> 📅 Vagas Trinks
            </button>

            {fastMacros.map((macro) => {
              const isApplied = macroAppliedFeedback === macro.id;
              return (
                <button
                  key={macro.id}
                  type="button"
                  onClick={() => handleApplyMacro(macro.id, macro.template)}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition shrink-0 cursor-pointer shadow-2xs ${
                    isApplied
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-850 font-bold scale-105'
                      : 'border-slate-200/80 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-700 hover:text-slate-900'
                  }`}
                  title={`Inserir modelo ${macro.label}`}
                >
                  {isApplied ? <Check size={11} className="text-emerald-600 animate-pulse" /> : null}
                  <span>{isApplied ? '✓ Injetado no Chat' : macro.label}</span>
                </button>
              );
            })}
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
            <div>
              {hoursSinceLastInbound !== null && hoursSinceLastInbound >= 24 && (
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 mb-2">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                    <span><strong>Janela de 24h da Meta expirada</strong> ({Math.floor(hoursSinceLastInbound)}h desde o último contato). Mensagens livres serão rejeitadas com erro 131047.</span>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenWabaTemplateModal}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] shrink-0 transition cursor-pointer shadow-2xs"
                  >
                    <FileText size={11} /> Reabrir com Template HSM
                  </button>
                </div>
              )}
              <div className="flex items-center gap-1.5">
              {/* Attachment Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={actionInProgress}
                className="p-2 rounded-lg border border-slate-200 hover:border-emerald-300 bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 transition shrink-0 cursor-pointer shadow-2xs"
                title="Anexar Foto, Vídeo, Áudio ou PDF"
              >
                <Paperclip size={15} />
              </button>

              {/* Record Mic Button */}
              <button
                type="button"
                onClick={startRecordingAudio}
                disabled={actionInProgress}
                className="p-2 rounded-lg border border-slate-200 hover:border-emerald-300 bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 transition shrink-0 cursor-pointer shadow-2xs"
                title="Gravar mensagem de voz ao vivo"
              >
                <Mic size={15} />
              </button>

              <input
                type="text"
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder="Digite uma mensagem ou clique em um atalho acima..."
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                onKeyDown={(e) => {
                  // Tab to auto-complete recommendation from Copilot
                  if (e.key === "Tab" && !draftText.trim() && recommendation?.suggestedDraftText) {
                    e.preventDefault();
                    setDraftText(recommendation.suggestedDraftText);
                    return;
                  }
                  // Ctrl+Enter, Cmd+Enter, or standard Enter to send
                  if (e.key === "Enter" && draftText.trim()) {
                    e.preventDefault();
                    onCreateOutboundDraft(draftText.trim());
                    setDraftText("");
                  }
                }}
              />

              {/* Quick WABA Interactive Buttons Trigger */}
              <button
                type="button"
                onClick={onOpenWabaButtonsModal}
                disabled={actionInProgress}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50 transition shrink-0 cursor-pointer"
                title="Enviar Botões Interativos Quick Reply (WABA)"
              >
                <LayoutGrid size={13} className="text-slate-500" /> Botões
              </button>

              {/* Quick WABA Template Reativar Trigger */}
              <button
                type="button"
                onClick={onOpenWabaTemplateModal}
                disabled={actionInProgress}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50 transition shrink-0 cursor-pointer"
                title="Reativar contato (modelo oficial Meta)"
              >
                <FileText size={13} className="text-slate-500" /> Reativar
              </button>

              <button
                type="button"
                onClick={() => {
                  if (draftText.trim()) {
                    onCreateOutboundDraft(draftText.trim());
                    setDraftText("");
                  }
                }}
                disabled={actionInProgress || !draftText.trim()}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition shrink-0"
              >
                <Send size={13} /> Enviar
              </button>
            </div>

            {/* Speedrun Mode Quick Shortcuts Footer */}
            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1.5 px-1">
              <div className="flex items-center gap-3">
                <span><kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[9px] text-slate-600">Alt+J/K</kbd> Próx / Ant</span>
                <span><kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[9px] text-slate-600">Tab</kbd> Aceitar IA</span>
                <span><kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[9px] text-slate-600">Alt+A</kbd> Agenda</span>
                <span><kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[9px] text-slate-600">Ctrl+Enter</kbd> Enviar</span>
              </div>
              <span className="text-slate-400 font-medium hidden sm:inline">⚡ Speedrun Mode Ativo</span>
            </div>
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

function WabaInteractiveModal({
  onClose,
  onSubmitButtons,
  onSubmitList,
  onSubmitFlow,
  inProgress,
}: {
  onClose: () => void;
  onSubmitButtons: (bodyText: string, buttons: Array<{ id: string; title: string }>) => void;
  onSubmitList: (bodyText: string, buttonLabel: string, sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>) => void;
  onSubmitFlow: (flowId: string, flowCta: string, bodyText: string, screenId?: string) => void;
  inProgress: boolean;
}) {
  const [activeTab, setActiveTab] = React.useState<'buttons' | 'list' | 'flow'>('buttons');

  // Buttons State
  const [bodyText, setBodyText] = React.useState("Olá! Como prefere dar continuidade ao seu atendimento?");
  const [btn1, setBtn1] = React.useState("1. Agendar Horário");
  const [btn2, setBtn2] = React.useState("2. Ver Serviços & Preços");
  const [btn3, setBtn3] = React.useState("3. Falar com Atendente");

  // List State
  const [listBody, setListBody] = React.useState("Selecione abaixo o serviço desejado para conferir valores e disponibilidade:");
  const [listButtonLabel, setListButtonLabel] = React.useState("Ver Opções");
  const [listRow1, setListRow1] = React.useState("Escova Modelada (R$ 59)");
  const [listRow2, setListRow2] = React.useState("Corte & Tratamento (R$ 89)");
  const [listRow3, setListRow3] = React.useState("Manicure & Pedicure (R$ 45)");

  // Flow State
  const [flowId, setFlowId] = React.useState("1749193841879179");
  const [flowCta, setFlowCta] = React.useState("Agendar Horário");
  const [flowBody, setFlowBody] = React.useState("Preencha seus dados para reservar seu horário de forma instantânea:");
  const [screenId, setScreenId] = React.useState("APPOINTMENT_SCREEN");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <LayoutGrid size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Ações Interativas Oficiais (WABA)</h3>
              <p className="text-xs text-slate-500">Botões, Menus de Lista e WhatsApp Flows nativos</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* 3-Tab Switcher */}
        <div className="flex border-b border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('buttons')}
            className={`flex-1 py-2 font-bold text-center border-b-2 transition cursor-pointer ${
              activeTab === 'buttons' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            🔘 Botões Rápidos
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`flex-1 py-2 font-bold text-center border-b-2 transition cursor-pointer ${
              activeTab === 'list' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            📑 Menu de Lista
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('flow')}
            className={`flex-1 py-2 font-bold text-center border-b-2 transition cursor-pointer ${
              activeTab === 'flow' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            ⚡ WhatsApp Flow
          </button>
        </div>

        {activeTab === 'buttons' && (
          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Texto da Mensagem</label>
              <textarea
                rows={2}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                placeholder="Digite o texto explicativo..."
              />
            </div>

            <div className="space-y-2">
              <label className="block font-bold text-slate-700">Botões de Resposta Rápida (Até 3)</label>
              <input
                type="text"
                value={btn1}
                onChange={(e) => setBtn1(e.target.value)}
                placeholder="Botão 1 (máx 20 caracteres)"
                maxLength={20}
                className="w-full rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-blue-500 outline-none font-medium"
              />
              <input
                type="text"
                value={btn2}
                onChange={(e) => setBtn2(e.target.value)}
                placeholder="Botão 2 (opcional, máx 20 caracteres)"
                maxLength={20}
                className="w-full rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-blue-500 outline-none font-medium"
              />
              <input
                type="text"
                value={btn3}
                onChange={(e) => setBtn3(e.target.value)}
                placeholder="Botão 3 (opcional, máx 20 caracteres)"
                maxLength={20}
                className="w-full rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-blue-500 outline-none font-medium"
              />
            </div>
          </div>
        )}

        {activeTab === 'list' && (
          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Texto da Mensagem</label>
              <textarea
                rows={2}
                value={listBody}
                onChange={(e) => setListBody(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-xs"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Rótulo do Botão do Menu</label>
              <input
                type="text"
                value={listButtonLabel}
                onChange={(e) => setListButtonLabel(e.target.value)}
                placeholder="Ex: Ver Serviços"
                maxLength={20}
                className="w-full rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-blue-500 outline-none font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-700">Opções do Menu (Seções & Linhas)</label>
              <input
                type="text"
                value={listRow1}
                onChange={(e) => setListRow1(e.target.value)}
                placeholder="Item 1"
                className="w-full rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-blue-500 outline-none font-medium"
              />
              <input
                type="text"
                value={listRow2}
                onChange={(e) => setListRow2(e.target.value)}
                placeholder="Item 2"
                className="w-full rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-blue-500 outline-none font-medium"
              />
              <input
                type="text"
                value={listRow3}
                onChange={(e) => setListRow3(e.target.value)}
                placeholder="Item 3"
                className="w-full rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-blue-500 outline-none font-medium"
              />
            </div>
          </div>
        )}

        {activeTab === 'flow' && (
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-purple-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <Zap size={14} className="text-purple-600" />
                WhatsApp Flows (Formulário Interativo)
              </p>
              <p className="text-[11px] text-purple-800 leading-relaxed">
                Abre um formulário de agendamento/cadastro dentro do próprio WhatsApp sem redirecionar para navegadores.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Flow ID (Meta):</label>
                <input
                  type="text"
                  value={flowId}
                  onChange={(e) => setFlowId(e.target.value)}
                  placeholder="ID do Flow cadastrado"
                  className="w-full rounded-lg border border-slate-300 p-2 font-mono text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Rótulo do Botão (CTA):</label>
                <input
                  type="text"
                  value={flowCta}
                  onChange={(e) => setFlowCta(e.target.value)}
                  placeholder="Ex: Agendar Horário"
                  maxLength={20}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:ring-2 focus:ring-purple-500 outline-none font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Texto da Mensagem</label>
              <textarea
                rows={2}
                value={flowBody}
                onChange={(e) => setFlowBody(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 focus:ring-2 focus:ring-purple-500 outline-none text-xs"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button
            type="button"
            onClick={onClose}
            disabled={inProgress}
            className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Cancelar
          </button>

          {activeTab === 'buttons' && (
            <button
              type="button"
              onClick={() => {
                const buttons: Array<{ id: string; title: string }> = [];
                if (btn1.trim()) buttons.push({ id: "btn_1", title: btn1.trim() });
                if (btn2.trim()) buttons.push({ id: "btn_2", title: btn2.trim() });
                if (btn3.trim()) buttons.push({ id: "btn_3", title: btn3.trim() });
                if (bodyText.trim() && buttons.length > 0) {
                  onSubmitButtons(bodyText.trim(), buttons);
                }
              }}
              disabled={inProgress || !bodyText.trim() || !btn1.trim()}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Send size={13} /> Enviar Botões
            </button>
          )}

          {activeTab === 'list' && (
            <button
              type="button"
              onClick={() => {
                const rows: Array<{ id: string; title: string }> = [];
                if (listRow1.trim()) rows.push({ id: "row_1", title: listRow1.trim() });
                if (listRow2.trim()) rows.push({ id: "row_2", title: listRow2.trim() });
                if (listRow3.trim()) rows.push({ id: "row_3", title: listRow3.trim() });
                if (listBody.trim() && listButtonLabel.trim() && rows.length > 0) {
                  onSubmitList(listBody.trim(), listButtonLabel.trim(), [{ title: "Opções de Serviços", rows }]);
                }
              }}
              disabled={inProgress || !listBody.trim() || !listButtonLabel.trim() || !listRow1.trim()}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Send size={13} /> Enviar Menu de Lista
            </button>
          )}

          {activeTab === 'flow' && (
            <button
              type="button"
              onClick={() => {
                if (flowId.trim() && flowCta.trim() && flowBody.trim()) {
                  onSubmitFlow(flowId.trim(), flowCta.trim(), flowBody.trim(), screenId.trim() || undefined);
                }
              }}
              disabled={inProgress || !flowId.trim() || !flowCta.trim() || !flowBody.trim()}
              className="rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Zap size={13} /> Disparar WhatsApp Flow
            </button>
          )}
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

