import React from "react";
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock,
  DatabaseZap,
  DollarSign,
  FileText,
  LayoutGrid,
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
} from "lucide-react";
import {
  ApiCockpitView,
  ApiJourney,
  ApiPriority,
  HttpSalesOsGateway,
  SalesOsTransportError,
} from "../../services/salesOsGateway";
import { getSupabaseClient } from "../../services/supabaseAuth";

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
  { value: "LEAD", label: "Lead Inicial" },
  { value: "APPROACHED", label: "Abordado" },
  { value: "ENGAGED", label: "Engajado / Conversando" },
  { value: "SCHEDULED", label: "Agendado" },
  { value: "FOLLOW_UP", label: "Follow-up" },
  { value: "CLOSED", label: "Encerrado" },
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
  if (!value) return "Estágio não definido";
  const normalized = value.toUpperCase();
  const match = PIPELINE_STAGES.find((s) => s.value === normalized);
  return match ? match.label : value.replaceAll("_", " ").toLocaleLowerCase("pt-BR");
}

function availability(label: string, detail: string) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">{label}</p>
      <p className="mt-1 text-sm leading-5 text-slate-500">{detail}</p>
    </div>
  );
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
  const title = item.contactName || item.contactPhone || "Contato sem nome";
  const secondary = hasPriority
    ? item.lastMessageText || item.priorityReason
    : item.primaryServiceOrProduct || "Sem produto ou serviço registrado";
  const time = hasPriority ? item.lastMessageAt : item.updatedAt;
  const urgent = hasPriority && item.slaState === "OVERDUE";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border-2 p-3 text-left transition focus-visible:outline-offset-2 ${
        selected
          ? "border-blue-600 bg-blue-50 shadow-sm"
          : urgent
            ? "border-rose-200 bg-rose-50 hover:border-rose-400"
            : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{title}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{item.contactPhone || "Telefone não registrado"}</p>
        </div>
        {hasPriority && (
          <span
            className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold ${
              urgent
                ? "bg-rose-100 text-rose-700"
                : item.slaState === "DUE"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {item.slaState === "OVERDUE" ? "SLA vencido" : item.slaState === "DUE" ? "SLA próximo" : "No prazo"}
          </span>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-700">{secondary}</p>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200 pt-2 text-xs text-slate-500">
        <span className="truncate">{hasPriority ? item.priorityReason : stageLabel(item.pipelineStage)}</span>
        <span className="shrink-0 font-mono">{formatDate(time)}</span>
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
  const [actionInProgress, setActionInProgress] = React.useState(false);

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
        setFeedback({ type: "success", message: "Template HSM oficial enviado com sucesso!" });
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

  const loadQueue = React.useCallback(async () => {
    setPriorities({ state: "loading" });
    setJourneys({ state: "loading" });
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
      const message = error instanceof Error ? error.message : "Não foi possível carregar a fila autenticada.";
      setPriorities({ state: "error", message });
      setJourneys({ state: "error", message });
    }
  }, [gateway, onSelectedJourneyChange, workspaceId]);

  React.useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  React.useEffect(() => {
    if (!selectedJourneyId) {
      setCockpit({ state: "empty" });
      return;
    }
    let active = true;
    setCockpit({ state: "loading" });
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

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    await loadQueue();
    if (selectedJourneyId) {
      setCockpit({ state: "loading" });
      try {
        setCockpit({ state: "ready", value: await gateway.getCockpit(workspaceId, selectedJourneyId) });
      } catch (error) {
        setCockpit({
          state: "error",
          message: error instanceof Error ? error.message : "Não foi possível atualizar a jornada.",
        });
      }
    }
    setRefreshing(false);
  }, [gateway, loadQueue, selectedJourneyId, workspaceId]);

  // Live Realtime Subscriptions via Supabase WebSockets
  React.useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;

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
        () => {
          void refresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'commercial_journeys',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          void refresh();
        }
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [workspaceId, refresh]);

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

  const handleCreateOutboundDraft = async (text: string) => {
    if (!selectedJourneyId) return;
    setActionInProgress(true);
    try {
      await gateway.createOutboundDraft(workspaceId, selectedJourneyId, text);
      showNotification("success", "Rascunho de mensagem outbound supervisionado criado.");
      await refresh();
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao criar rascunho.");
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

  const queue = priorities.state === "ready" ? priorities.value : journeys.state === "ready" ? journeys.value : [];
  const view = cockpit.state === "ready" ? cockpit.value : null;

  return (
    <main className="mx-auto max-w-[1720px] px-4 py-5 lg:px-6">
      {feedback && (
        <div
          className={`mb-4 flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-sm font-semibold shadow-sm ${
            feedback.type === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-rose-300 bg-rose-50 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="rounded p-1 text-slate-500 hover:bg-black/5"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <section className="mb-4 flex flex-wrap items-start justify-between gap-4 rounded-2xl border-2 border-blue-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-blue-700">
            <DatabaseZap size={15} /> Operação autenticada
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Cockpit ao vivo</h1>
          <p className="mt-1 text-sm text-slate-600">
            Fila, conversa e contexto vindos do Supabase. Mutações reais com auditoria, JWT e RLS.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleClearHistory()}
            disabled={actionInProgress}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-rose-300 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-60 transition cursor-pointer"
            title="Apaga todas as conversas e leads sincronizados deste workspace"
          >
            <Trash2 size={16} /> Limpar Histórico do Workspace
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-blue-600 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-60 transition cursor-pointer"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> Atualizar dados
          </button>
        </div>
      </section>

      <div className="grid min-h-[660px] gap-4 xl:grid-cols-[310px_minmax(0,1fr)_340px]">
        {/* Priority Queue Sidebar */}
        <aside className="cockpit-panel flex min-h-0 flex-col border-2 border-blue-200">
          <div className="cockpit-panel-header flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-bold text-slate-900">Fila priorizada</p>
              <p className="text-xs text-slate-500">até 5 itens com contexto real</p>
            </div>
            <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">{queue.length}</span>
          </div>
          <div className="space-y-2 overflow-y-auto p-3">
            {priorities.state === "loading" || journeys.state === "loading" ? (
              <p className="px-2 py-5 text-sm text-slate-500">Carregando fila…</p>
            ) : null}
            {priorities.state === "error" ? availability("Fila indisponível", priorities.message) : null}
            {priorities.state === "empty" && journeys.state === "empty"
              ? availability("Zero jornadas", "Nenhuma jornada autorizada foi encontrada neste workspace.")
              : null}
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
        <section className="cockpit-panel min-w-0 border-2 border-slate-200">
          {cockpit.state === "loading" && (
            <div className="flex h-full min-h-[560px] items-center justify-center text-sm text-slate-500">
              Carregando jornada autenticada…
            </div>
          )}
          {cockpit.state === "error" && (
            <div className="m-4">{availability("Contexto indisponível", cockpit.message)}</div>
          )}
          {cockpit.state === "empty" && (
            <div className="m-4">
              {availability("Selecione uma jornada", "Escolha um item da fila para abrir seu contexto comercial.")}
            </div>
          )}
          {view && (
            <LiveJourneyBody
              view={view}
              onAcceptHandoff={handleAcceptHandoff}
              onResolveHandoff={handleResolveHandoff}
              onOpenReturnAiModal={() => setReturnAiModalOpen(true)}
              onStageChange={handleStageChange}
              onOpenFollowUpModal={() => setFollowUpModalOpen(true)}
              onOpenOutcomeModal={() => setOutcomeModalOpen(true)}
              onOpenWabaButtonsModal={() => setWabaButtonsModalOpen(true)}
              onOpenWabaTemplateModal={() => setWabaTemplateModalOpen(true)}
              onCreateOutboundDraft={handleCreateOutboundDraft}
              actionInProgress={actionInProgress}
            />
          )}
        </section>

        {/* Right Dossier Sidebar */}
        <aside className="cockpit-panel min-w-0 border-2 border-violet-200">
          <div className="cockpit-panel-header flex items-center justify-between px-4 py-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Sparkles size={16} className="text-violet-600" /> Dossiê vivo
              </p>
              <p className="mt-0.5 text-xs text-slate-500">fatos e decisões com proveniência</p>
            </div>
            {view && (
              <button
                type="button"
                onClick={() => setFactModalOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-bold text-violet-700 hover:bg-violet-100"
                title="Registrar fato conhecido"
              >
                <Plus size={14} /> Fato
              </button>
            )}
          </div>
          <div className="space-y-3 p-3">
            {!view && availability("Sem dossiê selecionado", "O dossiê aparece apenas para uma jornada acessível.")}
            {view && <LiveDossier view={view} onOpenFactModal={() => setFactModalOpen(true)} />}
          </div>
        </aside>
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
        <WabaButtonsModal
          onClose={() => setWabaButtonsModalOpen(false)}
          onSubmit={handleSendWabaButtons}
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
    </main>
  );
};

function LiveJourneyBody({
  view,
  onAcceptHandoff,
  onResolveHandoff,
  onOpenReturnAiModal,
  onStageChange,
  onOpenFollowUpModal,
  onOpenOutcomeModal,
  onOpenWabaButtonsModal,
  onOpenWabaTemplateModal,
  onCreateOutboundDraft,
  actionInProgress,
}: {
  view: ApiCockpitView;
  onAcceptHandoff: (handoffCaseId: string) => void;
  onResolveHandoff: (handoffCaseId: string) => void;
  onOpenReturnAiModal: () => void;
  onStageChange: (stage: string) => void;
  onOpenFollowUpModal: () => void;
  onOpenOutcomeModal: () => void;
  onOpenWabaButtonsModal: () => void;
  onOpenWabaTemplateModal: () => void;
  onCreateOutboundDraft: (text: string) => void;
  actionInProgress: boolean;
}) {
  const { journey, acquisitionContexts, messages, decisionState, recommendation, handoff, outcome, knownFacts } = view;
  const acquisition = acquisitionContexts[0] ?? null;
  const [draftText, setDraftText] = React.useState("");

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

  return (
    <>
      {/* Header & Stage Controller */}
      {/* Compact 1-Row Header */}
      <header className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
              <UserRound size={16} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-bold text-sm text-slate-950 truncate">
                  {journey.contact.name || "Contato sem nome"}
                </p>
                {hoursSinceLastInbound !== null && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      isWindowActive
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-amber-100 text-amber-800 border border-amber-300"
                    }`}
                    title={
                      isWindowActive
                        ? `Janela de mensagens livres ativa: ${hoursRemaining.toFixed(1)}h restantes`
                        : "Janela de 24h expirada. Utilize um Template HSM para reabrir o contato."
                    }
                  >
                    <Clock size={10} />
                    {isWindowActive ? `Janela Meta: ${hoursRemaining.toFixed(1)}h` : "Janela: Expirada (Usar HSM)"}
                  </span>
                )}
              </div>
              <p className="font-mono text-xs text-slate-500 truncate">{journey.contact.phone}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <span className="text-[11px] font-bold text-slate-600 hidden sm:inline">Estágio:</span>
            <select
              id="stage-selector"
              value={journey.pipelineStage ? journey.pipelineStage.toUpperCase() : "LEAD"}
              onChange={(e) => onStageChange(e.target.value)}
              disabled={actionInProgress}
              className="rounded-md border border-blue-300 bg-white px-2 py-0.5 text-xs font-bold text-blue-900 shadow-xs focus:ring-1 focus:ring-blue-500"
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
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-0.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-60"
                >
                  <UserCheck size={12} /> Assumir
                </button>
                <button
                  type="button"
                  onClick={() => onResolveHandoff(handoff.id)}
                  disabled={actionInProgress}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-60"
                >
                  <Check size={12} /> Concluir
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onOpenFollowUpModal}
              disabled={actionInProgress}
              className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-60"
            >
              <Calendar size={12} /> Follow-Up
            </button>

            <button
              type="button"
              onClick={onOpenOutcomeModal}
              disabled={actionInProgress}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
            >
              <DollarSign size={12} /> Desfecho
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-col flex-1 min-h-0 p-3 gap-2">
        {/* Sleek 1-Line Continuity Strip */}
        <section className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1 text-white shadow-xs shrink-0 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar text-xs">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Continuidade</span>
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-blue-300 truncate">
              1. Origem: {acquisition?.campaignName || acquisition?.source || "Direto / Meta Ads"}
            </span>
            <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-amber-300 truncate">
              2. Estado: {decisionState?.currentStage || "Em atendimento"}
            </span>
            <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-purple-300 truncate">
              3. Ação: {recommendation?.suggestedAction || "Supervisionar conversa"}
            </span>
          </div>

          {ctwaFact && (
            <span className="rounded bg-indigo-950 border border-indigo-500/50 px-2 py-0.5 text-[10px] font-bold text-indigo-300 flex items-center gap-1 shrink-0">
              <Zap size={10} className="text-amber-400" /> Lead Meta Ads (CTWA)
            </span>
          )}
        </section>

        {/* Normalized Messages Stream (Flexible & Spacious) */}
        <section className="flex-1 min-h-[240px] rounded-xl border border-slate-200 bg-[#efeae2] p-3 overflow-y-auto">
          {messages.length === 0 ? (
            availability(
              "Nenhuma mensagem disponível",
              "Ainda não há mensagens normalizadas acessíveis para esta jornada."
            )
          ) : (
            <div className="space-y-2.5">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[85%] rounded-xl border px-3 py-2 shadow-xs ${
                    message.direction === "outbound"
                      ? "ml-auto border-emerald-200 bg-emerald-50 text-slate-900"
                      : "border-slate-200 bg-white text-slate-900"
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {message.textContent && message.textContent.trim()
                      ? message.textContent
                      : "📎 Mídia / Mensagem WhatsApp"}
                  </p>
                  <p className="mt-1 text-right text-[10px] text-slate-500 font-mono flex items-center justify-end gap-1">
                    <span>{message.senderType} · {formatDate(message.sentAt)}</span>
                    {message.direction === "outbound" && (
                      <span className="text-blue-500 font-bold" title="Status WhatsApp">✓✓</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Supervised AI Suggestion & Outbound Composer Strip */}
        <section className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs shrink-0 space-y-2">
          {recommendation && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-violet-50 px-2.5 py-1 text-xs text-violet-900 border border-violet-200">
              <div className="flex items-center gap-1.5 min-w-0">
                <Bot size={14} className="text-violet-600 shrink-0" />
                <span className="font-bold text-[10.5px] shrink-0">Copilot:</span>
                <span className="italic truncate text-[11px]">
                  "{recommendation.suggestedDraftText || recommendation.suggestedAction}"
                </span>
                <span className="rounded bg-violet-200/80 px-1 py-0.2 font-mono text-[9px] font-bold text-violet-900 shrink-0">
                  {Math.round(recommendation.confidence * 100)}%
                </span>
              </div>
              {recommendation.suggestedDraftText && (
                <button
                  type="button"
                  onClick={() => setDraftText(recommendation.suggestedDraftText!)}
                  className="shrink-0 rounded bg-violet-600 px-2 py-0.5 text-[10.5px] font-bold text-white hover:bg-violet-700 transition"
                >
                  Usar sugestão
                </button>
              )}
            </div>
          )}

          {/* Expired Window Advisory */}
          {hoursSinceLastInbound !== null && !isWindowActive && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900 border border-amber-200">
              <div className="flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                <span className="text-[11px]">Janela de 24h Meta encerrada. Para reabrir, envie um Template HSM oficial:</span>
              </div>
              <button
                type="button"
                onClick={onOpenWabaTemplateModal}
                className="shrink-0 rounded bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700 transition flex items-center gap-1 shadow-2xs"
              >
                <FileText size={11} /> Escolher Template HSM
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder="Digite uma mensagem supervisionada..."
              className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              onKeyDown={(e) => {
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
              className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition shrink-0"
              title="Enviar Botões Interativos Quick Reply (WABA)"
            >
              <LayoutGrid size={13} /> Botões
            </button>

            {/* Quick WABA Template Trigger */}
            <button
              type="button"
              onClick={onOpenWabaTemplateModal}
              disabled={actionInProgress}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition shrink-0"
              title="Enviar Template HSM Oficial (Meta)"
            >
              <FileText size={13} /> HSM
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
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition shrink-0"
            >
              <Send size={13} /> Enviar
            </button>
          </div>
        </section>
      </div>
    </>
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
  onOpenFactModal,
}: {
  view: ApiCockpitView;
  onOpenFactModal: () => void;
}) {
  const { journey, knownFacts, decisionState, handoff, outcome } = view;
  return (
    <>
      <section className="rounded-xl border-2 border-blue-200 bg-blue-50 p-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">Jornada</p>
        <p className="mt-1 text-sm font-bold text-slate-900">
          {journey.primaryServiceOrProduct || "Produto/serviço não registrado"}
        </p>
        <dl className="mt-2 space-y-1 text-xs text-slate-600">
          <div className="flex justify-between gap-2">
            <dt>Iniciada</dt>
            <dd>{formatDate(journey.startedAt)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Receita registrada</dt>
            <dd className="font-mono">{formatMoney(journey.totalRevenueMinor, journey.currency)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border-2 border-violet-200 bg-white">
        <div className="flex items-center justify-between border-b border-violet-100 px-3 py-2">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Sparkles size={15} className="text-violet-600" /> Fatos conhecidos ({knownFacts.length})
          </p>
          <button
            type="button"
            onClick={onOpenFactModal}
            className="text-xs font-bold text-violet-700 hover:underline"
          >
            + Adicionar
          </button>
        </div>
        <div className="max-h-[260px] space-y-2 overflow-y-auto p-3">
          {knownFacts.length === 0 ? (
            availability(
              "Sem fatos extraídos",
              "Nenhum fato com proveniência foi registrado para esta jornada."
            )
          ) : (
            knownFacts.map((fact) => (
              <div key={fact.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <p className="text-xs font-bold text-violet-700">{fact.key}</p>
                <p className="mt-1 break-words text-sm text-slate-800">{valueToText(fact.value)}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {fact.source} · confiança {Math.round(fact.confidence * 100)}%
                  {fact.confirmedByCustomer ? " · confirmado pelo cliente" : ""}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border-2 border-amber-200 bg-amber-50 p-3">
        <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <AlertTriangle size={15} className="text-amber-700" /> Fricção atual
        </p>
        {decisionState ? (
          <>
            <p className="mt-2 text-sm font-semibold text-slate-800">
              {decisionState.primaryFriction || "Nenhuma fricção primária"}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {decisionState.frictionEvidence || "Evidência não registrada"}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-600">Ainda não há um estado decisório registrado.</p>
        )}
      </section>

      <section className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3">
        <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <ShieldCheck size={15} className="text-emerald-700" /> Handoff e resultado
        </p>
        <p className="mt-2 text-sm text-slate-700">
          {handoff
            ? `Handoff ${handoff.status.toLocaleLowerCase("pt-BR")} · ${handoff.triggerReason}`
            : "Sem handoff aberto."}
        </p>
        {outcome ? (
          <div className="mt-2 border-t border-emerald-200 pt-2">
            <p className="text-sm font-semibold text-emerald-900">
              {outcome.result} · {formatMoney(outcome.finalRevenueMinor, outcome.currency)}
            </p>
            {outcome.closedReason && (
              <p className="mt-0.5 text-xs text-emerald-800">{outcome.closedReason}</p>
            )}
            <p className="mt-1 font-mono text-[10px] text-emerald-700">CAPI: {outcome.capiStatus}</p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-600">Resultado final ainda não registrado.</p>
        )}
      </section>
    </>
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

function WabaButtonsModal({
  onClose,
  onSubmit,
  inProgress,
}: {
  onClose: () => void;
  onSubmit: (bodyText: string, buttons: Array<{ id: string; title: string }>) => void;
  inProgress: boolean;
}) {
  const [bodyText, setBodyText] = React.useState("Olá! Como prefere dar continuidade ao seu atendimento?");
  const [btn1, setBtn1] = React.useState("1. Agendar Reunião");
  const [btn2, setBtn2] = React.useState("2. Ver Demonstração");
  const [btn3, setBtn3] = React.useState("3. Falar com Atendente");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <LayoutGrid size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Enviar Botões Interativos (WABA)</h3>
              <p className="text-xs text-slate-500">Quick Reply buttons oficiais para WhatsApp</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Texto da Mensagem</label>
            <textarea
              rows={3}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
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

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button
            type="button"
            onClick={onClose}
            disabled={inProgress}
            className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              const buttons: Array<{ id: string; title: string }> = [];
              if (btn1.trim()) buttons.push({ id: "btn_1", title: btn1.trim() });
              if (btn2.trim()) buttons.push({ id: "btn_2", title: btn2.trim() });
              if (btn3.trim()) buttons.push({ id: "btn_3", title: btn3.trim() });
              if (bodyText.trim() && buttons.length > 0) {
                onSubmit(bodyText.trim(), buttons);
              }
            }}
            disabled={inProgress || !bodyText.trim() || !btn1.trim()}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Send size={13} /> Enviar Botões
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
  const [availableTemplates, setAvailableTemplates] = React.useState<Array<{ name: string; language: string; status: string }>>([]);
  const [loadingTemplates, setLoadingTemplates] = React.useState(false);

  React.useEffect(() => {
    setLoadingTemplates(true);
    fetch(`/api/v1/workspaces/${workspaceId}/channels/waba/templates`)
      .then((res) => res.json())
      .then((data) => {
        if (data.templates && Array.isArray(data.templates)) {
          setAvailableTemplates(data.templates);
          if (data.templates.length > 0) {
            setTemplateName(data.templates[0].name);
            setLanguageCode(data.templates[0].language || "pt_BR");
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTemplates(false));
  }, [workspaceId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <FileText size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Enviar Template HSM Oficial</h3>
              <p className="text-xs text-slate-500">Reabertura de janela de 24h & Notificações Meta</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Template Aprovado na Meta
              {loadingTemplates && <span className="text-slate-400 font-normal ml-2">(carregando...)</span>}
            </label>
            {availableTemplates.length > 0 ? (
              <select
                value={templateName}
                onChange={(e) => {
                  setTemplateName(e.target.value);
                  const selected = availableTemplates.find((t) => t.name === e.target.value);
                  if (selected) setLanguageCode(selected.language);
                }}
                className="w-full rounded-lg border border-slate-300 p-2 font-mono text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                {availableTemplates.map((t) => (
                  <option key={`${t.name}-${t.language}`} value={t.name}>
                    {t.name} ({t.language}) - {t.status}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Ex: reabertura_contato ou hello_world"
                className="w-full rounded-lg border border-slate-300 p-2 font-mono text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            )}
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Código de Idioma</label>
            <input
              type="text"
              value={languageCode}
              onChange={(e) => setLanguageCode(e.target.value)}
              placeholder="pt_BR"
              className="w-full rounded-lg border border-slate-300 p-2 font-mono text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="block font-bold text-slate-700">Parâmetros das Variáveis (Opcional)</label>
            <input
              type="text"
              value={param1}
              onChange={(e) => setParam1(e.target.value)}
              placeholder="Variável {{1}} (Ex: Nome do Cliente)"
              className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <input
              type="text"
              value={param2}
              onChange={(e) => setParam2(e.target.value)}
              placeholder="Variável {{2}} (Ex: Data ou Horário)"
              className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button
            type="button"
            onClick={onClose}
            disabled={inProgress}
            className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
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
            disabled={inProgress || !templateName.trim() || !languageCode.trim()}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Send size={13} /> Disparar Template
          </button>
        </div>
      </div>
    </div>
  );
}
