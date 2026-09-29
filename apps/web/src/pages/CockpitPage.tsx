/**
 * SOS Sales V3 — CockpitPage (MCT OS v2.0)
 * Aligned with official design board (Light theme default, Dark Navy sidebar, Inter + Mono typography).
 * Implements Truth in Data: live threads and messages directly from Fastify with tenant RLS.
 */

import { useState, useEffect, useRef, useCallback, type FC } from "react";
import {
  Button,
  Input,
  Badge,
  Alert,
  EmptyState,
  LoadingState,
  Drawer,
} from "@sos-sales/ui";
import type { UseSessionReturn } from "../hooks/useSession";
import {
  apiClient,
  type CommercialThreadSummary,
  type ThreadMessageSummary,
  type ChannelSummary,
  type MessageTemplateSummary,
  type WabaTemplateComponent,
  type WhatsAppFlowSummary,
  type WabaInteractiveMessage,
  type ProductRecord,
  type PixChargeSummary,
  type IntegrationSuggestionSummary,
} from "../services/api-client";
import {
  Search,
  MessageSquare,
  Building2,
  ShieldCheck,
  RefreshCw,
  SlidersHorizontal,
  Send,
  User,
  Radio,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  DollarSign,
  TrendingUp,
  Zap,
  CheckCircle2,
  FileText,
  Sparkles,
  ShoppingBag,
  Package,
  Tag,
  QrCode,
  Copy,
} from "lucide-react";

interface CockpitPageProps {
  session: UseSessionReturn;
  onOpenCatalog?: () => void;
}

const safeFormatTime = (dateStr?: string | null): string => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

export const CockpitPage: FC<CockpitPageProps> = ({ session }) => {
  const {
    token,
    activeWorkspace,
    activeWorkspaceDetails,
    isLoadingMe,
    error,
    refreshWorkspace,
    refreshSession,
  } = session;

  const [queueFilter, setQueueFilter] = useState<"all" | "open" | "closed">("open");
  const [searchQuery, setSearchQuery] = useState("");
  const [isDossierDrawerOpen, setIsDossierDrawerOpen] = useState(false);

  // Live state
  const [threads, setThreads] = useState<CommercialThreadSummary[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessageSummary[]>([]);
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState<boolean>(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isSendingMessage, setIsSendingMessage] = useState<boolean>(false);
  const [messageInput, setMessageInput] = useState<string>("");
  const [sendError, setSendError] = useState<string | null>(null);

  // Per-thread draft isolation & async sequence guards (CS-01)
  const draftsByThreadRef = useRef<Record<string, string>>({});
  const activeThreadIdRef = useRef<string | null>(null);

  const getDraftKey = useCallback((workspaceId: string, threadId: string) => {
    return `chat_sales_draft_${workspaceId}_${threadId}`;
  }, []);

  const handleMessageInputChange = useCallback(
    (val: string) => {
      setMessageInput(val);
      if (selectedThreadId) {
        draftsByThreadRef.current[selectedThreadId] = val;
        if (activeWorkspace?.id) {
          try {
            if (val.trim()) {
              sessionStorage.setItem(getDraftKey(activeWorkspace.id, selectedThreadId), val);
            } else {
              sessionStorage.removeItem(getDraftKey(activeWorkspace.id, selectedThreadId));
            }
          } catch {
            // ignore session storage quota errors
          }
        }
      }
    },
    [selectedThreadId, activeWorkspace?.id, getDraftKey]
  );

  useEffect(() => {
    activeThreadIdRef.current = selectedThreadId;
    if (selectedThreadId) {
      let draft = draftsByThreadRef.current[selectedThreadId];
      if (!draft && activeWorkspace?.id) {
        try {
          draft = sessionStorage.getItem(getDraftKey(activeWorkspace.id, selectedThreadId)) || "";
          if (draft) {
            draftsByThreadRef.current[selectedThreadId] = draft;
          }
        } catch {
          draft = "";
        }
      }
      setMessageInput(draft || "");
    } else {
      setMessageInput("");
    }
  }, [selectedThreadId, activeWorkspace?.id, getDraftKey]);

  // Reset transient operation feedback when switching threads
  useEffect(() => {
    setSendError(null);
    setOutcomeError(null);
    setOutcomeSuccessMessage(null);
    setProductError(null);
    setFlowError(null);
    setTemplateError(null);
    setPixError(null);
  }, [selectedThreadId]);

  // WABA Templates & 24h Window state
  const [templates, setTemplates] = useState<MessageTemplateSummary[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState<boolean>(false);
  const [isTemplateDrawerOpen, setIsTemplateDrawerOpen] = useState<boolean>(false);
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplateSummary | null>(null);
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});
  const [isSendingTemplate, setIsSendingTemplate] = useState<boolean>(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateFilterCategory, setTemplateFilterCategory] = useState<"ALL" | "UTILITY" | "MARKETING">("ALL");

  // WhatsApp Flows (Formulários Nativos) state
  const [flows, setFlows] = useState<WhatsAppFlowSummary[]>([]);
  const [isLoadingFlows, setIsLoadingFlows] = useState<boolean>(false);
  const [isFlowDrawerOpen, setIsFlowDrawerOpen] = useState<boolean>(false);
  const [selectedFlow, setSelectedFlow] = useState<WhatsAppFlowSummary | null>(null);
  const [flowFilterCategory, setFlowFilterCategory] = useState<"ALL" | "APPOINTMENT_BOOKING" | "LEAD_GENERATION" | "SURVEY">("ALL");
  const [isSendingFlow, setIsSendingFlow] = useState<boolean>(false);
  const [flowError, setFlowError] = useState<string | null>(null);

  // WhatsApp Catalog & Products state (Catálogo de Vendas e Ofertas)
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(false);
  const [isProductDrawerOpen, setIsProductDrawerOpen] = useState<boolean>(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(null);
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>("ALL");
  const [productSearch, setProductSearch] = useState<string>("");
  const [isSendingProduct, setIsSendingProduct] = useState<boolean>(false);
  const [productError, setProductError] = useState<string | null>(null);

  // Pix Charges & Instant Checkout state (Cobrança Pix & Fechamento)
  const [pixCharges, setPixCharges] = useState<PixChargeSummary[]>([]);
  const [isPixDrawerOpen, setIsPixDrawerOpen] = useState<boolean>(false);
  const [pixTitle, setPixTitle] = useState<string>("");
  const [pixAmount, setPixAmount] = useState<string>("");
  const [pixSelectedProduct, setPixSelectedProduct] = useState<ProductRecord | null>(null);
  const [pixExpiresMinutes, setPixExpiresMinutes] = useState<number>(30);
  const [isCreatingPix, setIsCreatingPix] = useState<boolean>(false);
  const [pixError, setPixError] = useState<string | null>(null);
  const [copiedPixId, setCopiedPixId] = useState<string | null>(null);

  // Commercial outcome state (MVP sales recording)
  const [dealValue, setDealValue] = useState<string>("");
  const [outcomeStatus, setOutcomeStatus] = useState<"in_progress" | "won" | "lost">("in_progress");
  const [isRecordingOutcome, setIsRecordingOutcome] = useState<boolean>(false);
  const [outcomeSuccessMessage, setOutcomeSuccessMessage] = useState<string | null>(null);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);
  const [lossReason, setLossReason] = useState<string>("");

  // Integration Suggestions state (F1 Radar)
  const [suggestions, setSuggestions] = useState<IntegrationSuggestionSummary[]>([]);
  const [suggestionCount, setSuggestionCount] = useState<number>(0);
  const [isRadarDrawerOpen, setIsRadarDrawerOpen] = useState<boolean>(false);
  const [isDecidingSuggestion, setIsDecidingSuggestion] = useState<boolean>(false);
  const [radarFilter, setRadarFilter] = useState<"all" | "urgent" | "high" | "normal">("all");

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom of message list strictly within the container
  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, []);

  // 1. Fetch channels on workspace change
  useEffect(() => {
    if (!activeWorkspace || !token) return;

    let isMounted = true;
    apiClient
      .getChannels(activeWorkspace.id, { token })
      .then((res) => {
        if (isMounted) setChannels(res.channels);
      })
      .catch(() => {
        // Channels fetch failure non-blocking for cockpit
      });

    return () => {
      isMounted = false;
    };
  }, [activeWorkspace?.id, token]);

  // 2. Fetch and poll commercial threads
  const loadThreads = useCallback(async () => {
    if (!activeWorkspace || !token) return;

    try {
      const statusParam =
        queueFilter === "open"
          ? "active"
          : queueFilter === "closed"
          ? "closed"
          : undefined;

      const res = await apiClient.getThreads(
        activeWorkspace.id,
        { status: statusParam },
        { token }
      );
      setThreads(res.threads);
    } catch {
      // Background polling error non-fatal
    }
  }, [activeWorkspace?.id, token, queueFilter]);

  useEffect(() => {
    if (!activeWorkspace || !token) return;

    setIsLoadingThreads(true);
    loadThreads().finally(() => setIsLoadingThreads(false));

    // Poll threads every 3.5 seconds
    const interval = setInterval(loadThreads, 3500);
    return () => clearInterval(interval);
  }, [loadThreads, activeWorkspace?.id, token]);

  // Fetch and poll integration suggestions (F1 Radar)
  const loadSuggestions = useCallback(async () => {
    if (!activeWorkspace?.id || !token) return;
    try {
      const [countRes, listRes] = await Promise.all([
        apiClient.getIntegrationSuggestionCount(activeWorkspace.id, { token }),
        apiClient.getIntegrationSuggestions(activeWorkspace.id, { status: "pending" }, { token }),
      ]);
      setSuggestionCount(countRes.pendingCount);
      setSuggestions(listRes.items);
    } catch {
      // Background suggestion load non-fatal
    }
  }, [activeWorkspace?.id, token]);

  useEffect(() => {
    if (!activeWorkspace || !token) return;
    loadSuggestions();
    const interval = setInterval(loadSuggestions, 10000);
    return () => clearInterval(interval);
  }, [loadSuggestions, activeWorkspace?.id, token]);

  const handleDecideSuggestion = useCallback(
    async (suggestion: IntegrationSuggestionSummary, status: "accepted" | "dismissed") => {
      if (!activeWorkspace?.id || !token) return;
      setIsDecidingSuggestion(true);
      try {
        await apiClient.decideIntegrationSuggestion(
          activeWorkspace.id,
          suggestion.id,
          { status, stateVersion: suggestion.stateVersion },
          { token }
        );
        if (status === "accepted" && suggestion.draftMessage) {
          const targetId = suggestion.threadId || selectedThreadId;
          if (targetId) {
            draftsByThreadRef.current[targetId] = suggestion.draftMessage;
            if (activeWorkspace?.id) {
              try {
                sessionStorage.setItem(getDraftKey(activeWorkspace.id, targetId), suggestion.draftMessage);
              } catch {
                // ignore
              }
            }
          }
          if (suggestion.threadId && suggestion.threadId !== selectedThreadId) {
            setSelectedThreadId(suggestion.threadId);
          } else {
            setMessageInput(suggestion.draftMessage);
          }
        }
        await loadSuggestions();
      } catch (err) {
        console.error("Erro ao processar sugestão Radar:", err);
      } finally {
        setIsDecidingSuggestion(false);
      }
    },
    [activeWorkspace?.id, token, selectedThreadId, loadSuggestions, getDraftKey]
  );

  // 3. Fetch and poll messages for selected thread
  const loadMessages = useCallback(
    async (threadId: string) => {
      if (!activeWorkspace || !token) return;

      try {
        const res = await apiClient.getThreadMessages(
          activeWorkspace.id,
          threadId,
          { token }
        );
        if (activeThreadIdRef.current === threadId) {
          setMessages(res.messages);
        }
      } catch {
        // Message load error non-fatal in polling
      }
    },
    [activeWorkspace?.id, token]
  );

  useEffect(() => {
    if (!selectedThreadId || !activeWorkspace || !token) {
      setMessages([]);
      return;
    }

    // Immediately clear stale messages from prior thread
    setMessages([]);
    setIsLoadingMessages(true);
    const currentThreadId = selectedThreadId;

    loadMessages(currentThreadId).finally(() => {
      if (activeThreadIdRef.current === currentThreadId) {
        setIsLoadingMessages(false);
        scrollToBottom();
      }
    });

    // Poll messages every 3 seconds while thread is active
    const interval = setInterval(() => {
      if (activeThreadIdRef.current === currentThreadId) {
        loadMessages(currentThreadId);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedThreadId, loadMessages, activeWorkspace?.id, token, scrollToBottom]);

  // Scroll to bottom when messages count changes
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages.length, scrollToBottom]);

  // Handle outbound message dispatch
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = messageInput.trim();
    if (!trimmed || !selectedThread || !activeWorkspace || !token || isSendingMessage) {
      return;
    }

    setIsSendingMessage(true);
    setSendError(null);

    // Optimistic message update for immediate user feedback
    const optimisticMessage: ThreadMessageSummary = {
      id: `opt-${Date.now()}`,
      workspaceId: activeWorkspace.id,
      channelInstanceId: selectedThread.channelInstanceId,
      threadId: selectedThread.id,
      provider: selectedThread.channelProvider,
      direction: "outbound",
      senderE164: selectedThread.contactPhone,
      recipientE164: selectedThread.contactPhone,
      contentType: "text",
      body: trimmed,
      mediaUrl: null,
      providerMessageId: null,
      deliveryStatus: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setMessageInput("");
    if (selectedThread.id) {
      delete draftsByThreadRef.current[selectedThread.id];
      if (activeWorkspace?.id) {
        try {
          sessionStorage.removeItem(getDraftKey(activeWorkspace.id, selectedThread.id));
        } catch {
          // ignore
        }
      }
    }

    try {
      await apiClient.sendOutboundMessage(
        activeWorkspace.id,
        selectedThread.channelInstanceId,
        {
          recipientPhoneE164: selectedThread.contactPhone,
          contentType: "text",
          body: trimmed,
        },
        { token }
      );

      // Re-fetch messages from server
      await loadMessages(selectedThread.id);
      loadThreads();
    } catch (err: unknown) {
      setSendError(
        err instanceof Error ? err.message : "Falha ao despachar mensagem outbound"
      );
    } finally {
      setIsSendingMessage(false);
      scrollToBottom();
    }
  };

  // Handle thread status update (e.g. waiting_human, closed, active)
  const handleUpdateStatus = async (
    newStatus: "active" | "waiting_client" | "waiting_human" | "closed"
  ) => {
    if (!selectedThread || !activeWorkspace || !token) return;

    try {
      await apiClient.updateThreadStatus(
        activeWorkspace.id,
        selectedThread.id,
        newStatus,
        { token }
      );
      setThreads((prev) =>
        prev.map((t) =>
          t.id === selectedThread.id ? { ...t, status: newStatus } : t
        )
      );
    } catch {
      // Status update error
    }
  };

  const selectedThread = threads.find((t) => t.id === selectedThreadId) || null;

  // Reset outcome feedback and fetch journey when selected thread changes
  useEffect(() => {
    setOutcomeSuccessMessage(null);
    setOutcomeError(null);
    setOutcomeStatus("in_progress");
    setLossReason("");
    setDealValue("");

    const targetThreadId = selectedThreadId;
    if (targetThreadId && activeWorkspace && token) {
      apiClient
        .getThreadJourney(activeWorkspace.id, targetThreadId, { token })
        .then((res) => {
          if (activeThreadIdRef.current !== targetThreadId) return;
          if (res.latestOutcome) {
            setOutcomeStatus(res.latestOutcome.status);
            if (res.latestOutcome.status === "won") {
              const formatted = (res.latestOutcome.valueCents / 100).toFixed(2).replace(".", ",");
              setDealValue(formatted);
              setOutcomeSuccessMessage(
                `✓ Venda Concluída: R$ ${formatted} (Meta CAPI PurchaseCompleted)`
              );
            } else if (res.latestOutcome.status === "lost") {
              setOutcomeSuccessMessage(
                `Negócio Marcado como Perdido (${res.latestOutcome.reason || "Sem motivo informado"})`
              );
            }
          }
        })
        .catch(() => {
          // ignore if no journey yet
        });
    }
  }, [selectedThreadId, activeWorkspace?.id, token]);

  // Handle commercial outcome recording (Won / Lost + Meta CAPI trigger)
  const handleRecordOutcome = async (status: "won" | "lost") => {
    if (!selectedThread || !activeWorkspace || !token || isRecordingOutcome) return;

    setIsRecordingOutcome(true);
    setOutcomeError(null);
    setOutcomeSuccessMessage(null);

    try {
      let cents = 0;
      if (status === "won") {
        const cleaned = dealValue.replace(/\./g, "").replace(",", ".");
        const parsed = parseFloat(cleaned);
        cents = isNaN(parsed) || parsed < 0 ? 0 : Math.round(parsed * 100);
      }

      const res = await apiClient.recordOutcome(
        activeWorkspace.id,
        selectedThread.id,
        {
          status,
          valueCents: cents,
          currency: "BRL",
          reason: status === "lost" ? lossReason.trim() || "Desistência / Sem perfil" : undefined,
        },
        { token }
      );

      setOutcomeStatus(status);
      if (res.conversionEvent) {
        setOutcomeSuccessMessage(
          `✓ Venda [R$ ${(res.outcome.valueCents / 100).toFixed(2)}] gravada com sucesso! Evento Meta CAPI [${res.conversionEvent.eventName}] enfileirado.`
        );
      } else {
        setOutcomeSuccessMessage(
          `✓ Desfecho [${status === "won" ? "Venda Ganha" : "Perdido"}] registrado com sucesso!`
        );
      }
      loadThreads();
    } catch (err: unknown) {
      setOutcomeError(
        err instanceof Error ? err.message : "Falha ao registrar desfecho comercial."
      );
    } finally {
      setIsRecordingOutcome(false);
    }
  };

  // Load templates for active workspace
  const loadTemplates = useCallback(async () => {
    if (!activeWorkspace?.id || !token) return;
    setIsLoadingTemplates(true);
    try {
      const res = await apiClient.getTemplates(activeWorkspace.id, undefined, { token });
      setTemplates(res.templates);
      if (res.templates.length > 0 && !selectedTemplate) {
        setSelectedTemplate(res.templates[0] ?? null);
      }
    } catch (err) {
      console.error("Failed to load templates", err);
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [activeWorkspace?.id, token, selectedTemplate]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const initVariablesForTemplate = useCallback(
    (tpl: MessageTemplateSummary, thread: CommercialThreadSummary | null) => {
      const initialVars: Record<string, string> = {};
      (tpl.variables || []).forEach((v, idx) => {
        const num = String(idx + 1);
        if (idx === 0) {
          initialVars[num] = thread?.contactName || "Cliente";
        } else if (v.toLowerCase().includes("data")) {
          initialVars[num] = new Date().toLocaleDateString("pt-BR");
        } else if (v.toLowerCase().includes("horario") || v.toLowerCase().includes("hora")) {
          initialVars[num] = "15:00";
        } else if (v.toLowerCase().includes("prazo")) {
          initialVars[num] = "amanhã às 18h";
        } else if (v.toLowerCase().includes("produto")) {
          initialVars[num] = "Plano VIP";
        } else {
          initialVars[num] = "";
        }
      });
      setTemplateVariables(initialVars);
    },
    []
  );

  const handleOpenTemplateDrawer = useCallback(() => {
    setIsTemplateDrawerOpen(true);
    setTemplateError(null);
    if (templates.length === 0) {
      loadTemplates();
    }
    const current = selectedTemplate || templates[0];
    if (current) {
      setSelectedTemplate(current);
      initVariablesForTemplate(current, selectedThread);
    }
  }, [templates, selectedTemplate, loadTemplates, initVariablesForTemplate, selectedThread]);

  const handleSelectTemplate = useCallback(
    (tpl: MessageTemplateSummary) => {
      setSelectedTemplate(tpl);
      initVariablesForTemplate(tpl, selectedThread);
    },
    [initVariablesForTemplate, selectedThread]
  );

  const handleSendTemplate = async () => {
    if (!selectedThread || !selectedTemplate || !activeWorkspace || !token || isSendingTemplate) return;

    setIsSendingTemplate(true);
    setTemplateError(null);

    try {
      const varKeys = Object.keys(templateVariables).sort((a, b) => Number(a) - Number(b));
      const parameters = varKeys.map((k) => ({
        type: "text",
        text: templateVariables[k] || `{{${k}}}`,
      }));

      const components: WabaTemplateComponent[] = [];
      if (parameters.length > 0) {
        components.push({
          type: "body",
          parameters,
        });
      }

      let renderedBody = selectedTemplate.bodyText;
      varKeys.forEach((k) => {
        renderedBody = renderedBody.split(`{{${k}}}`).join(templateVariables[k] || `{{${k}}}`);
      });

      if (selectedTemplate.headerText) {
        renderedBody = `[${selectedTemplate.headerText}]\n\n${renderedBody}`;
      }
      if (selectedTemplate.footerText) {
        renderedBody = `${renderedBody}\n\n_${selectedTemplate.footerText}_`;
      }

      const optimisticMessage: ThreadMessageSummary = {
        id: `opt-tpl-${Date.now()}`,
        workspaceId: activeWorkspace.id,
        channelInstanceId: selectedThread.channelInstanceId,
        threadId: selectedThread.id,
        provider: selectedThread.channelProvider,
        direction: "outbound",
        senderE164: selectedThread.contactPhone,
        recipientE164: selectedThread.contactPhone,
        contentType: "template",
        body: renderedBody,
        mediaUrl: null,
        providerMessageId: null,
        deliveryStatus: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticMessage]);

      await apiClient.sendOutboundMessage(
        activeWorkspace.id,
        selectedThread.channelInstanceId,
        {
          recipientPhoneE164: selectedThread.contactPhone,
          contentType: "template",
          body: renderedBody,
          template: {
            name: selectedTemplate.name,
            language: selectedTemplate.language,
            components: components.length > 0 ? components : undefined,
          },
        },
        { token }
      );

      setIsTemplateDrawerOpen(false);
      await loadMessages(selectedThread.id);
      loadThreads();
    } catch (err: unknown) {
      setTemplateError(
        err instanceof Error ? err.message : "Falha ao despachar modelo WABA."
      );
    } finally {
      setIsSendingTemplate(false);
      scrollToBottom();
    }
  };

  // Load WhatsApp Flows for active workspace
  const loadFlows = useCallback(async () => {
    if (!activeWorkspace?.id || !token) return;
    setIsLoadingFlows(true);
    try {
      const res = await apiClient.getFlows(activeWorkspace.id, undefined, { token });
      setFlows(res.flows);
      if (res.flows.length > 0 && !selectedFlow) {
        setSelectedFlow(res.flows[0] ?? null);
      }
    } catch (err) {
      console.error("Failed to load WhatsApp flows", err);
    } finally {
      setIsLoadingFlows(false);
    }
  }, [activeWorkspace?.id, token, selectedFlow]);

  useEffect(() => {
    loadFlows();
  }, [loadFlows]);

  const handleOpenFlowDrawer = useCallback(() => {
    setIsFlowDrawerOpen(true);
    setFlowError(null);
    if (flows.length === 0) {
      loadFlows();
    }
    const current = selectedFlow || flows[0];
    if (current) {
      setSelectedFlow(current);
    }
  }, [flows, selectedFlow, loadFlows]);

  const handleSelectFlow = useCallback((flow: WhatsAppFlowSummary) => {
    setSelectedFlow(flow);
  }, []);

  const handleSendFlow = async () => {
    if (!selectedThread || !selectedFlow || !activeWorkspace || !token || isSendingFlow) return;

    setIsSendingFlow(true);
    setFlowError(null);

    try {
      let renderedBody = selectedFlow.bodyText;
      if (selectedFlow.headerText) {
        renderedBody = `[${selectedFlow.headerText}]\n\n${renderedBody}`;
      }
      if (selectedFlow.footerText) {
        renderedBody = `${renderedBody}\n\n_${selectedFlow.footerText}_`;
      }
      renderedBody = `${renderedBody}\n\n[📋 ${selectedFlow.ctaLabel}]`;

      const optimisticMessage: ThreadMessageSummary = {
        id: `opt-flow-${Date.now()}`,
        workspaceId: activeWorkspace.id,
        channelInstanceId: selectedThread.channelInstanceId,
        threadId: selectedThread.id,
        provider: selectedThread.channelProvider,
        direction: "outbound",
        senderE164: selectedThread.contactPhone,
        recipientE164: selectedThread.contactPhone,
        contentType: "interactive",
        body: renderedBody,
        mediaUrl: null,
        providerMessageId: null,
        deliveryStatus: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticMessage]);

      const interactivePayload: WabaInteractiveMessage = {
        type: "flow",
        ...(selectedFlow.headerText ? { header: { type: "text", text: selectedFlow.headerText } } : {}),
        body: { text: selectedFlow.bodyText },
        ...(selectedFlow.footerText ? { footer: { text: selectedFlow.footerText } } : {}),
        action: {
          name: "flow",
          parameters: {
            flow_message_version: "3",
            flow_token: `flow_${selectedFlow.name}_${Date.now()}`,
            flow_id: selectedFlow.metaFlowId,
            flow_cta: selectedFlow.ctaLabel,
            flow_action: "navigate",
            flow_action_payload: {
              screen: selectedFlow.initialScreen || "START_SCREEN",
            },
          },
        },
      };

      await apiClient.sendOutboundMessage(
        activeWorkspace.id,
        selectedThread.channelInstanceId,
        {
          recipientPhoneE164: selectedThread.contactPhone,
          contentType: "interactive",
          body: renderedBody,
          interactive: interactivePayload,
        },
        { token }
      );

      setIsFlowDrawerOpen(false);
      await loadMessages(selectedThread.id);
      loadThreads();
    } catch (err: unknown) {
      setFlowError(
        err instanceof Error ? err.message : "Falha ao enviar formulário do WhatsApp."
      );
    } finally {
      setIsSendingFlow(false);
      scrollToBottom();
    }
  };

  // Load WhatsApp Catalog Products for active workspace
  const loadProducts = useCallback(async () => {
    if (!activeWorkspace?.id || !token) return;
    setIsLoadingProducts(true);
    try {
      const res = await apiClient.getProducts(activeWorkspace.id, undefined, { token });
      setProducts(res.products);
    } catch (err) {
      console.error("Failed to load WhatsApp products", err);
    } finally {
      setIsLoadingProducts(false);
    }
  }, [activeWorkspace?.id, token, selectedProduct]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleOpenProductDrawer = useCallback(() => {
    setIsProductDrawerOpen(true);
    setProductError(null);
    if (products.length === 0) {
      loadProducts();
    }
    const current = selectedProduct || products[0];
    if (current) {
      setSelectedProduct(current);
    }
  }, [products, selectedProduct, loadProducts]);

  const handleSelectProduct = useCallback((product: ProductRecord) => {
    setSelectedProduct(product);
  }, []);

  const handleSendProduct = async (productToSend?: ProductRecord) => {
    const targetProduct = productToSend || selectedProduct;
    if (!selectedThread || !targetProduct || !activeWorkspace || !token || isSendingProduct) return;

    setIsSendingProduct(true);
    setProductError(null);

    try {
      const renderedBody = `🛍️ *${targetProduct.title}*\n${targetProduct.subtitle || targetProduct.description}\n\n💰 *Valor:* ${targetProduct.priceFormatted}\n\n[🛍️ Ver Detalhes do Produto]`;

      const optimisticMessage: ThreadMessageSummary = {
        id: `opt-prod-${Date.now()}`,
        workspaceId: activeWorkspace.id,
        channelInstanceId: selectedThread.channelInstanceId,
        threadId: selectedThread.id,
        provider: selectedThread.channelProvider,
        direction: "outbound",
        senderE164: selectedThread.contactPhone,
        recipientE164: selectedThread.contactPhone,
        contentType: "interactive",
        body: renderedBody,
        mediaUrl: targetProduct.imageUrl,
        providerMessageId: null,
        deliveryStatus: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticMessage]);

      const interactivePayload: WabaInteractiveMessage = {
        type: "product",
        body: {
          text: `Olá! Conforme combinamos, segue o link oficial da nossa solução:\n\n*${targetProduct.title}*\n${targetProduct.subtitle || targetProduct.description}`,
        },
        footer: {
          text: "SOS Sales • Catálogo Oficial",
        },
        action: {
          catalog_id: targetProduct.catalogId || "meta_catalog_default",
          product_retailer_id: targetProduct.retailerId,
        },
      };

      await apiClient.sendOutboundMessage(
        activeWorkspace.id,
        selectedThread.channelInstanceId,
        {
          recipientPhoneE164: selectedThread.contactPhone,
          contentType: "interactive",
          body: renderedBody,
          mediaUrl: targetProduct.imageUrl,
          interactive: interactivePayload,
        },
        { token }
      );

      setIsProductDrawerOpen(false);
      await loadMessages(selectedThread.id);
      loadThreads();
    } catch (err: unknown) {
      setProductError(
        err instanceof Error ? err.message : "Falha ao enviar produto do catálogo."
      );
    } finally {
      setIsSendingProduct(false);
      scrollToBottom();
    }
  };

  const handleSendMultiProduct = async () => {
    if (!selectedThread || products.length === 0 || !activeWorkspace || !token || isSendingProduct) return;

    setIsSendingProduct(true);
    setProductError(null);

    try {
      const featuredItems = products.slice(0, 4);
      let renderedBody = `📦 *Vitrine de Soluções e Planos*\n\nConheça nossas opções para acelerar suas vendas:\n`;
      for (const item of featuredItems) {
        renderedBody += `\n• *${item.title}* — ${item.priceFormatted}`;
      }
      renderedBody += `\n\n[🛒 Ver Catálogo de Itens no WhatsApp]`;

      const optimisticMessage: ThreadMessageSummary = {
        id: `opt-mpm-${Date.now()}`,
        workspaceId: activeWorkspace.id,
        channelInstanceId: selectedThread.channelInstanceId,
        threadId: selectedThread.id,
        provider: selectedThread.channelProvider,
        direction: "outbound",
        senderE164: selectedThread.contactPhone,
        recipientE164: selectedThread.contactPhone,
        contentType: "interactive",
        body: renderedBody,
        mediaUrl: null,
        providerMessageId: null,
        deliveryStatus: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticMessage]);

      const interactivePayload: WabaInteractiveMessage = {
        type: "product_list",
        header: {
          type: "text",
          text: "Vitrine Comercial Oficial",
        },
        body: {
          text: "Selecione uma das opções abaixo para ver detalhes completos e condições exclusivas:",
        },
        footer: {
          text: "SOS Sales • Atendimento Comercial",
        },
        action: {
          catalog_id: "meta_catalog_default",
          sections: [
            {
              title: "Soluções em Destaque",
              product_items: featuredItems.map((p) => ({
                product_retailer_id: p.retailerId,
              })),
            },
          ],
        },
      };

      await apiClient.sendOutboundMessage(
        activeWorkspace.id,
        selectedThread.channelInstanceId,
        {
          recipientPhoneE164: selectedThread.contactPhone,
          contentType: "interactive",
          body: renderedBody,
          interactive: interactivePayload,
        },
        { token }
      );

      setIsProductDrawerOpen(false);
      await loadMessages(selectedThread.id);
      loadThreads();
    } catch (err: unknown) {
      setProductError(
        err instanceof Error ? err.message : "Falha ao enviar vitrine de produtos."
      );
    } finally {
      setIsSendingProduct(false);
      scrollToBottom();
    }
  };

  // Load Pix Charges for active thread
  const loadPixCharges = useCallback(async (threadId: string) => {
    if (!activeWorkspace?.id || !token) return;
    try {
      const res = await apiClient.getPixChargesByThread(activeWorkspace.id, threadId, { token });
      if (activeThreadIdRef.current === threadId) {
        setPixCharges(res.charges);
      }
    } catch (err) {
      console.error("Failed to load Pix charges", err);
    }
  }, [activeWorkspace?.id, token]);

  useEffect(() => {
    if (selectedThreadId) {
      loadPixCharges(selectedThreadId);
    } else {
      setPixCharges([]);
    }
  }, [selectedThreadId, loadPixCharges]);

  const hasConfiguredPixKey = Boolean(activeWorkspaceDetails?.workspace?.defaultPixKey?.trim());

  const handleOpenPixDrawer = useCallback(() => {
    setIsPixDrawerOpen(true);
    setPixError(null);
    setPixSelectedProduct(null);
    setPixTitle("");
    setPixAmount("");
  }, []);

  const handleSelectPixProduct = useCallback((prod: ProductRecord) => {
    setPixSelectedProduct((prev) => {
      if (prev?.id === prod.id) {
        setPixTitle("");
        setPixAmount("");
        return null;
      }
      setPixTitle(prod.title);
      setPixAmount((prod.priceCents / 100).toFixed(2).replace(".", ","));
      return prod;
    });
  }, []);

  const handleGenerateAndSendPix = async () => {
    if (!selectedThread || !activeWorkspace || !token || isCreatingPix) return;

    if (!hasConfiguredPixKey) {
      setPixError("Chave Pix não configurada para este workspace. Configure em Ajustes antes de gerar cobranças.");
      return;
    }

    setIsCreatingPix(true);
    setPixError(null);

    try {
      const cleanAmountStr = pixAmount.replace(/\./g, "").replace(",", ".");
      const numericAmount = parseFloat(cleanAmountStr);
      if (isNaN(numericAmount) || numericAmount < 1) {
        throw new Error("O valor da cobrança Pix deve ser de no mínimo R$ 1,00.");
      }
      const amountCents = Math.round(numericAmount * 100);

      // 1. Create Pix charge in backend
      const res = await apiClient.createPixCharge(
        activeWorkspace.id,
        selectedThread.id,
        {
          contactId: selectedThread.contactId,
          productId: pixSelectedProduct?.id ?? null,
          title: pixTitle.trim() || "Cobrança Pix Oficial",
          amountCents,
          expiresMinutes: pixExpiresMinutes,
        },
        { token }
      );

      const charge = res.charge;
      setPixCharges((prev) => [charge, ...prev]);

      // 2. Dispatch message directly to WhatsApp conversation
      const renderedBody = `💰 *Cobrança Pix Gerada — SOS Sales*\n\nOlá! Segue a chave Pix Copia e Cola para pagamento do seu pedido:\n\n📌 *Item:* ${charge.title}\n💵 *Valor:* ${charge.amountFormatted}\n\n🔑 *Chave Pix Copia e Cola:*\n\`${charge.pixCode}\`\n\n⏳ _Válido por ${pixExpiresMinutes} minutos._`;

      const optimisticMessage: ThreadMessageSummary = {
        id: `opt-pix-${Date.now()}`,
        workspaceId: activeWorkspace.id,
        channelInstanceId: selectedThread.channelInstanceId,
        threadId: selectedThread.id,
        provider: selectedThread.channelProvider,
        direction: "outbound",
        senderE164: selectedThread.contactPhone,
        recipientE164: selectedThread.contactPhone,
        contentType: "text",
        body: renderedBody,
        mediaUrl: charge.pixQrUrl,
        metadata: { chargeId: charge.id },
        providerMessageId: null,
        deliveryStatus: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticMessage]);

      const isHttpsMedia = Boolean(charge.pixQrUrl?.startsWith("https://"));

      await apiClient.sendOutboundMessage(
        activeWorkspace.id,
        selectedThread.channelInstanceId,
        {
          recipientPhoneE164: selectedThread.contactPhone,
          contentType: "text",
          body: renderedBody,
          mediaUrl: isHttpsMedia && charge.pixQrUrl ? charge.pixQrUrl : undefined,
          metadata: { chargeId: charge.id },
        },
        { token }
      );

      setIsPixDrawerOpen(false);
      await loadMessages(selectedThread.id);
      loadThreads();
    } catch (err: unknown) {
      setPixError(
        err instanceof Error ? err.message : "Falha ao gerar cobrança Pix."
      );
    } finally {
      setIsCreatingPix(false);
      scrollToBottom();
    }
  };

  const handleConfirmPixPayment = async (chargeId: string) => {
    if (!activeWorkspace || !token || !selectedThread) return;

    try {
      const res = await apiClient.confirmPixPayment(activeWorkspace.id, chargeId, { token });
      
      setPixCharges((prev) =>
        prev.map((c) =>
          c.id === chargeId
            ? {
                ...c,
                status: "PAID",
                paidAt: new Date().toISOString(),
                verificationMethod: "MANUAL_CASHIER",
              }
            : c
        )
      );

      // Pre-fill composer draft so attendant CAN send confirmation message if desired,
      // and isolate in thread draft store so switching threads preserves it (CS-01)
      const receiptDraft = `✓ Pagamento Pix de ${res.charge.amountFormatted} conferido pelo caixa.`;
      draftsByThreadRef.current[selectedThread.id] = receiptDraft;
      if (activeWorkspace?.id) {
        try {
          sessionStorage.setItem(getDraftKey(activeWorkspace.id, selectedThread.id), receiptDraft);
        } catch {
          // ignore
        }
      }
      setMessageInput(receiptDraft);

      loadThreads();
      refreshWorkspace();
    } catch (err) {
      console.error("Failed to confirm Pix payment", err);
    }
  };

  // Window 24h & CTWA 72h status calculation
  const lastInboundMessage = messages
    .filter((m) => m.direction === "inbound")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const computeWindowInfo = () => {
    if (!lastInboundMessage) {
      return {
        isOpen: false,
        hoursRemaining: 0,
        badgeText: "Janela 24h Fechada (Requer Modelo)",
        badgeVariant: "danger" as const,
      };
    }
    const diffHours = (Date.now() - new Date(lastInboundMessage.createdAt).getTime()) / (1000 * 60 * 60);
    if (diffHours < 24) {
      const remaining = Math.max(0, Math.ceil(24 - diffHours));
      return {
        isOpen: true,
        hoursRemaining: remaining,
        badgeText: `Janela 24h Aberta (${remaining}h rest.)`,
        badgeVariant: "action" as const,
      };
    } else {
      return {
        isOpen: false,
        hoursRemaining: 0,
        badgeText: "Janela 24h Expirada",
        badgeVariant: "danger" as const,
      };
    }
  };

  const windowInfo = computeWindowInfo();

  // Filtered threads by search query
  const filteredThreads = threads.filter((t) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const nameMatch = t.contactName ? t.contactName.toLowerCase().includes(query) : false;
    const phoneMatch = t.contactPhone ? t.contactPhone.toLowerCase().includes(query) : false;
    const bodyMatch = t.lastMessage?.body ? t.lastMessage.body.toLowerCase().includes(query) : false;
    return Boolean(nameMatch || phoneMatch || bodyMatch);
  });

  // 1. Tratamento de Estados de Erro Críticos
  if (error) {
    if (error.type === "auth") {
      const isLab = import.meta.env.VITE_ENABLE_LAB_TOOLS === "true";
      return (
        <div style={{ padding: "48px 24px", maxWidth: "600px", margin: "0 auto" }}>
          <Alert
            variant="danger"
            title="Autenticação Necessária (401)"
            action={
              isLab ? (
                <Button size="sm" variant="danger" onClick={refreshSession}>
                  Reconectar
                </Button>
              ) : undefined
            }
          >
            {error.detail}
          </Alert>
        </div>
      );
    }

    if (error.type === "membership") {
      return (
        <div style={{ padding: "48px 24px", maxWidth: "640px", margin: "0 auto" }}>
          <EmptyState
            icon={<Building2 size={36} color="var(--color-warning, #D97706)" />}
            title="Nenhum Workspace Vinculado"
            description="Sua identidade foi autenticada, mas você ainda não é membro de nenhuma organização comercial."
            action={
              <Button variant="primary" onClick={refreshSession}>
                Verificar Novamente
              </Button>
            }
          />
        </div>
      );
    }

    if (error.type === "network") {
      return (
        <div style={{ padding: "48px 24px", maxWidth: "600px", margin: "0 auto" }}>
          <Alert
            variant="danger"
            title="Falha de Conectividade com a API"
            action={
              <Button
                size="sm"
                variant="danger"
                prefixIcon={<RefreshCw size={14} />}
                onClick={refreshWorkspace}
              >
                Tentar Conectar
              </Button>
            }
          >
            {error.detail}
          </Alert>
        </div>
      );
    }

    // Fallback para qualquer outro tipo de erro (forbidden, generic, etc.)
    return (
      <div style={{ padding: "48px 24px", maxWidth: "600px", margin: "0 auto" }}>
        <Alert
          variant="danger"
          title={error.title || "Erro no Workspace"}
          action={
            <Button size="sm" variant="danger" onClick={refreshWorkspace}>
              Tentar Novamente
            </Button>
          }
        >
          {error.detail}
        </Alert>
      </div>
    );
  }

  // 2. Loading da Sessão Inicial
  if (isLoadingMe && !activeWorkspace) {
    return (
      <div style={{ padding: "48px 24px", maxWidth: "900px", margin: "0 auto" }}>
        <LoadingState variant="skeleton" lines={6} text="Conectando à API Fastify e carregando permissões..." />
      </div>
    );
  }

  // 3. Estado Desconectado / Não Autenticado
  if (!session.user && !isLoadingMe) {
    const isLab = import.meta.env.VITE_ENABLE_LAB_TOOLS === "true";
    return (
      <div style={{ padding: "64px 24px", maxWidth: "600px", margin: "0 auto" }}>
        <EmptyState
          icon={<ShieldCheck size={40} color="var(--color-operational, #2563EB)" />}
          title="Nenhuma Sessão Ativa"
          description={
            isLab
              ? "O cockpit comercial opera com isolamento multi-tenant estrito (RLS). Insira um token Bearer válido na barra de laboratório acima para carregar sua organização."
              : "O cockpit comercial opera com autenticação protegida. O acesso ao cockpit aguarda a configuração de credenciais da sua organização."
          }
          action={
            isLab ? (
              <Button variant="outline" onClick={refreshSession}>
                Recarregar Sessão
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 56px)",
        overflow: "hidden",
      }}
    >
      {/* Sub-header de Contexto Operacional */}
      <div
        style={{
          height: "48px",
          backgroundColor: "var(--bg-surface, #FFFFFF)",
          borderBottom: "1px solid var(--border-default, #E2E8F0)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          fontSize: "0.85rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontWeight: 600, color: "var(--text-primary, #0F172A)" }}>
            Workspace: {activeWorkspace ? activeWorkspace.name : "Nenhum selecionado"}
          </span>
          <Badge variant={activeWorkspace ? "action" : "neutral"} pulseDot={!!activeWorkspace}>
            {activeWorkspace ? "Tenant Conectado" : "Aguardando Seleção"}
          </Badge>
          {channels.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Radio size={12} color="var(--color-action, #00A884)" />
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary, #475569)" }}>
                {channels[0]?.displayName} ({(channels[0]?.provider || "").toUpperCase()})
              </span>
            </div>
          ) : (
            <Badge variant="warning">Sem Canal Conectado</Badge>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            type="button"
            onClick={() => loadThreads()}
            style={{
              background: "none",
              border: "1px solid var(--border-default, #E2E8F0)",
              borderRadius: "var(--radius-sm, 6px)",
              padding: "4px 8px",
              fontSize: "0.75rem",
              color: "var(--text-secondary, #475569)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <RefreshCw size={12} />
            Atualizar
          </button>
          <button
            type="button"
            data-testid="btn-radar-drawer"
            onClick={() => setIsRadarDrawerOpen(true)}
            style={{
              background: suggestionCount > 0 ? "rgba(99, 102, 241, 0.1)" : "none",
              border: `1px solid ${suggestionCount > 0 ? "#6366F1" : "var(--border-default, #E2E8F0)"}`,
              borderRadius: "var(--radius-sm, 6px)",
              padding: "4px 10px",
              fontSize: "0.75rem",
              color: suggestionCount > 0 ? "#4F46E5" : "var(--text-secondary, #475569)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontWeight: suggestionCount > 0 ? 600 : 400,
            }}
            title="Radar de Oportunidades & Sugestões Externas (n8n)"
          >
            <Sparkles size={12} color={suggestionCount > 0 ? "#4F46E5" : "currentColor"} />
            Radar
            {suggestionCount > 0 && (
              <span
                style={{
                  background: "#4F46E5",
                  color: "#FFFFFF",
                  padding: "1px 6px",
                  borderRadius: "10px",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                }}
              >
                {suggestionCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setIsDossierDrawerOpen(true)}
            style={{
              background: "none",
              border: "1px solid var(--border-default, #E2E8F0)",
              borderRadius: "var(--radius-sm, 6px)",
              padding: "4px 8px",
              fontSize: "0.75rem",
              color: "var(--text-secondary, #475569)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <SlidersHorizontal size={12} />
            Dossiê & Permissões
          </button>
        </div>
      </div>

      {/* Grid Principal Tripartite */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "340px 1fr 320px",
          flex: 1,
          overflow: "hidden",
        }}
        className="sos-cockpit-grid"
      >
        {/* Coluna 1: Fila de Atendimento (Queue) */}
        <section
          aria-label="Fila de Atendimento"
          style={{
            borderRight: "1px solid var(--border-default, #E2E8F0)",
            backgroundColor: "var(--bg-surface, #FFFFFF)",
            display: "flex",
            flexDirection: "column",
            overflowY: "hidden",
          }}
        >
          {/* Header da Fila com Busca */}
          <div style={{ padding: "16px", borderBottom: "1px solid var(--border-subtle, #F1F5F9)" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary, #0F172A)" }}>
                Fila de Atendimento
              </h2>
              <Badge variant="action">{threads.length} Ativas</Badge>
            </div>

            <Input
              placeholder="Buscar por telefone ou nome..."
              prefixIcon={<Search size={14} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ fontSize: "0.85rem", height: "36px" }}
            />

            {/* Filtros da Fila */}
            <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
              {(["open", "all", "closed"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setQueueFilter(f)}
                  style={{
                    flex: 1,
                    padding: "4px 8px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    borderRadius: "var(--radius-sm, 6px)",
                    border: "none",
                    backgroundColor:
                      queueFilter === f ? "var(--color-operational-subtle, #EFF6FF)" : "transparent",
                    color:
                      queueFilter === f
                        ? "var(--color-operational, #2563EB)"
                        : "var(--text-secondary, #475569)",
                    cursor: "pointer",
                  }}
                >
                  {f === "open" ? "Abertas" : f === "all" ? "Todas" : "Pausadas"}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de Chats Real */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {isLoadingThreads && threads.length === 0 ? (
              <div style={{ padding: "24px" }}>
                <LoadingState variant="skeleton" lines={4} text="Carregando fila de chats..." />
              </div>
            ) : filteredThreads.length === 0 ? (
              <div style={{ padding: "32px 16px" }}>
                <EmptyState
                  icon={<MessageSquare size={28} />}
                  title="Nenhuma Conversa Encontrada"
                  description="Quando mensagens forem recebidas via WhatsApp (WABA ou WAHA), os atendimentos aparecerão aqui."
                />
              </div>
            ) : (
              filteredThreads.map((thread) => {
                const isSelected = thread.id === selectedThreadId;
                const rawInitial = thread.contactName || thread.contactPhone || "WA";
                const contactInitial = rawInitial
                  .replace(/^\+/, "")
                  .substring(0, 2)
                  .toUpperCase();

                return (
                  <div
                    key={thread.id}
                    data-testid="thread-item"
                    data-thread-id={thread.id}
                    onClick={() => setSelectedThreadId(thread.id)}
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid var(--border-subtle, #F1F5F9)",
                      backgroundColor: isSelected
                        ? "var(--color-operational-subtle, #EFF6FF)"
                        : "transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                      transition: "background-color 0.15s ease",
                    }}
                  >
                    {/* Avatar do Contato */}
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        backgroundColor: isSelected
                          ? "var(--color-operational, #2563EB)"
                          : "var(--bg-canvas, #F1F5F9)",
                        color: isSelected ? "#FFFFFF" : "var(--text-primary, #0F172A)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: "0.85rem",
                        flexShrink: 0,
                      }}
                    >
                      {contactInitial}
                    </div>

                    {/* Conteúdo do Card */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "2px",
                        }}
                      >
                        <strong
                          style={{
                            fontSize: "0.88rem",
                            color: "var(--text-primary, #0F172A)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {thread.contactName || thread.contactPhone}
                        </strong>
                        <span
                          style={{
                            fontSize: "0.7rem",
                            color: "var(--text-muted, #94A3B8)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {safeFormatTime(thread.lastMessage?.createdAt)}
                        </span>
                      </div>

                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.75rem",
                          color: "var(--text-muted, #94A3B8)",
                          marginBottom: "4px",
                        }}
                      >
                        {thread.contactPhone}
                      </div>

                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-secondary, #475569)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {thread.lastMessage?.direction === "outbound" && (
                          <span style={{ color: "var(--color-operational, #2563EB)", marginRight: "4px" }}>
                            Você:
                          </span>
                        )}
                        {thread.lastMessage?.body || "Sem mensagens"}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Coluna 2: Área Central de Conversa (Timeline + Composer) */}
        <section
          aria-label="Área de Conversa Ativa"
          style={{
            backgroundColor: "var(--bg-canvas, #F8FAFC)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRight: "1px solid var(--border-default, #E2E8F0)",
          }}
        >
          {selectedThread ? (
            <>
              {/* Header do Chat Ativo */}
              <div
                style={{
                  height: "56px",
                  backgroundColor: "var(--bg-surface, #FFFFFF)",
                  borderBottom: "1px solid var(--border-default, #E2E8F0)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 20px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      backgroundColor: "var(--color-action-subtle, #E6F7F3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--color-action, #00A884)",
                      fontWeight: 700,
                    }}
                  >
                    <User size={18} />
                  </div>
                  <div>
                    <strong style={{ fontSize: "0.92rem", color: "var(--text-primary, #0F172A)" }}>
                      {selectedThread.contactName || selectedThread.contactPhone}
                    </strong>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontFamily: "var(--font-mono)",
                          color: "var(--text-muted, #94A3B8)",
                        }}
                      >
                        {selectedThread.contactPhone}
                      </span>
                      <Badge variant="action">{(selectedThread.channelProvider || "whatsapp").toUpperCase()}</Badge>
                      <Badge
                        variant={windowInfo.badgeVariant}
                        style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                      >
                        <Clock size={11} />
                        {windowInfo.badgeText}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Ações de Estado da Conversa */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Button
                    size="sm"
                    variant="outline"
                    prefixIcon={<Zap size={14} color="#00A884" />}
                    onClick={handleOpenTemplateDrawer}
                  >
                    Modelos WABA
                  </Button>
                  <Button
                    size="sm"
                    variant={selectedThread.status === "waiting_human" ? "danger" : "outline"}
                    onClick={() =>
                      handleUpdateStatus(
                        selectedThread.status === "waiting_human" ? "active" : "waiting_human"
                      )
                    }
                  >
                    {selectedThread.status === "waiting_human" ? "Em Atendimento Humano" : "Chamar Humano"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleUpdateStatus("closed")}
                  >
                    Encerrar
                  </Button>
                </div>
              </div>

              {/* Timeline de Mensagens */}
              <div
                ref={messagesContainerRef}
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {isLoadingMessages ? (
                  <LoadingState variant="spinner" text="Carregando histórico..." />
                ) : messages.length === 0 ? (
                  <EmptyState
                    icon={<MessageSquare size={24} />}
                    title="Nenhuma Mensagem"
                    description="Envie uma mensagem abaixo para iniciar o diálogo com este contato."
                  />
                ) : (
                  messages.map((msg) => {
                    const isOutbound = msg.direction === "outbound";
                    return (
                      <div
                        key={msg.id}
                        style={{
                          display: "flex",
                          justifyContent: isOutbound ? "flex-end" : "flex-start",
                        }}
                      >
                        <div
                          style={{
                            maxWidth: "70%",
                            padding: "10px 14px",
                            borderRadius: isOutbound ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                            backgroundColor: isOutbound
                              ? "var(--color-operational-subtle, #EFF6FF)"
                              : "var(--bg-surface, #FFFFFF)",
                            border: `1px solid ${
                              isOutbound
                                ? "var(--color-operational-border, #BFDBFE)"
                                : "var(--border-default, #E2E8F0)"
                            }`,
                            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                          }}
                        >
                          {msg.contentType === "template" && (
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                fontSize: "0.72rem",
                                color: "var(--color-action, #00A884)",
                                fontWeight: 700,
                                marginBottom: "4px",
                                padding: "2px 6px",
                                backgroundColor: "var(--color-action-subtle, #E6F7F3)",
                                borderRadius: "4px",
                              }}
                            >
                              <Zap size={11} /> Modelo WABA Aprovado
                            </div>
                          )}

                          {msg.contentType === "interactive" && (
                            <>
                              {msg.body?.includes("🛍️ *") || msg.body?.includes("[🛍️ Ver Detalhes") ? (
                                <div
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    fontSize: "0.72rem",
                                    color: "#D97706",
                                    fontWeight: 700,
                                    marginBottom: "4px",
                                    padding: "2px 6px",
                                    backgroundColor: "#FEF3C7",
                                    borderRadius: "4px",
                                  }}
                                >
                                  <Tag size={11} /> Oferta do Catálogo WABA
                                </div>
                              ) : msg.body?.includes("📦 *Vitrine") ? (
                                <div
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    fontSize: "0.72rem",
                                    color: "#7C3AED",
                                    fontWeight: 700,
                                    marginBottom: "4px",
                                    padding: "2px 6px",
                                    backgroundColor: "#F5F3FF",
                                    borderRadius: "4px",
                                  }}
                                >
                                  <Package size={11} /> Vitrine de Produtos (Catálogo)
                                </div>
                              ) : (
                                <div
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    fontSize: "0.72rem",
                                    color: "var(--color-operational, #2563EB)",
                                    fontWeight: 700,
                                    marginBottom: "4px",
                                    padding: "2px 6px",
                                    backgroundColor: "var(--color-operational-subtle, #EFF6FF)",
                                    borderRadius: "4px",
                                  }}
                                >
                                  <FileText size={11} /> Formulário do WhatsApp (Flow)
                                </div>
                              )}
                            </>
                          )}

                          {msg.mediaUrl && (msg.body?.includes("🛍️ *") || msg.body?.includes("[🛍️ Ver Detalhes")) && (
                            <div style={{ marginBottom: "8px", borderRadius: "8px", overflow: "hidden", border: "1px solid #E2E8F0" }}>
                              <img
                                src={msg.mediaUrl}
                                alt="Produto"
                                style={{ width: "100%", maxHeight: "160px", objectFit: "cover", display: "block" }}
                              />
                            </div>
                          )}

                          {msg.body?.startsWith("📋 Formulário Respondido:") ? (
                            <div
                              style={{
                                backgroundColor: "var(--bg-canvas, #F8FAFC)",
                                border: "1px solid var(--border-default, #E2E8F0)",
                                borderRadius: "8px",
                                padding: "10px 12px",
                                marginTop: "4px",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  fontSize: "0.82rem",
                                  fontWeight: 700,
                                  color: "var(--color-action, #00A884)",
                                  marginBottom: "6px",
                                }}
                              >
                                <CheckCircle2 size={15} /> Formulário Respondido pelo Cliente
                              </div>
                              <div
                                style={{
                                  fontSize: "0.84rem",
                                  color: "var(--text-primary, #0F172A)",
                                  lineHeight: 1.5,
                                  whiteSpace: "pre-wrap",
                                }}
                              >
                                {msg.body.replace("📋 Formulário Respondido:\n", "")}
                              </div>
                            </div>
                          ) : msg.body?.startsWith("🛍️ Pedido Enviado pelo Cliente") ? (
                            <div
                              style={{
                                backgroundColor: "#F0FDF4",
                                border: "1px solid #BBF7D0",
                                borderRadius: "8px",
                                padding: "10px 12px",
                                marginTop: "4px",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  fontSize: "0.82rem",
                                  fontWeight: 700,
                                  color: "#15803D",
                                  marginBottom: "6px",
                                }}
                              >
                                <ShoppingBag size={15} /> Pedido Recebido via Catálogo WhatsApp
                              </div>
                              <div
                                style={{
                                  fontSize: "0.84rem",
                                  color: "#166534",
                                  lineHeight: 1.5,
                                  whiteSpace: "pre-wrap",
                                }}
                              >
                                {msg.body.replace("🛍️ Pedido Enviado pelo Cliente (Catálogo):\n", "")}
                              </div>
                            </div>
                          ) : msg.body?.startsWith("💰 *Cobrança Pix Gerada") ? (
                            <div
                              style={{
                                backgroundColor: "#F0FDF4",
                                border: "1px solid #BBF7D0",
                                borderRadius: "8px",
                                padding: "12px",
                                marginTop: "4px",
                              }}
                            >
                              {(() => {
                                const msgChargeId = (msg.metadata as Record<string, unknown> | undefined)?.chargeId as string | undefined;
                                const matchedCharge = (msgChargeId
                                  ? pixCharges.find((c) => c.id === msgChargeId)
                                  : pixCharges.find((c) => c.pixCode && msg.body?.includes(c.pixCode))) || (pixCharges.length === 1 ? pixCharges[0] : null);

                                const isPaid = matchedCharge?.status === "PAID";
                                const isExpired = matchedCharge?.status === "EXPIRED";
                                const isManualCashier = isPaid && matchedCharge?.verificationMethod === "MANUAL_CASHIER";
                                const isBankWebhook = isPaid && matchedCharge?.verificationMethod === "BANK_WEBHOOK";

                                return (
                                  <>
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        marginBottom: "8px",
                                      }}
                                    >
                                      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", fontWeight: 700, color: isPaid ? "#15803D" : "#166534" }}>
                                        <DollarSign size={15} /> Cobrança Pix Enviada ao Cliente
                                      </div>
                                      {isPaid ? (
                                        isManualCashier ? (
                                          <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#15803D", backgroundColor: "#DCFCE7", padding: "1px 6px", borderRadius: "4px" }}>
                                            ✓ Conferido no Caixa (Manual)
                                          </span>
                                        ) : isBankWebhook ? (
                                          <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#1D4ED8", backgroundColor: "#DBEAFE", padding: "1px 6px", borderRadius: "4px" }}>
                                            ✓ Confirmado por Integração Bancária
                                          </span>
                                        ) : (
                                          <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#15803D", backgroundColor: "#DCFCE7", padding: "1px 6px", borderRadius: "4px" }}>
                                            ✓ Pago
                                          </span>
                                        )
                                      ) : isExpired ? (
                                        <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#DC2626", backgroundColor: "#FEE2E2", padding: "1px 6px", borderRadius: "4px" }}>
                                          Expirado
                                        </span>
                                      ) : (
                                        <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#B45309", backgroundColor: "#FEF3C7", padding: "1px 6px", borderRadius: "4px" }}>
                                          ⏳ Aguardando Pagamento
                                        </span>
                                      )}
                                    </div>

                                    <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "8px" }}>
                                      {(msg.mediaUrl || matchedCharge?.pixQrUrl) && (
                                        <img
                                          src={(msg.mediaUrl || matchedCharge?.pixQrUrl) ?? undefined}
                                          alt="QR Code Pix"
                                          style={{ width: "90px", height: "90px", borderRadius: "6px", border: "1px solid #CBD5E1", backgroundColor: "#FFF" }}
                                        />
                                      )}
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: "0.84rem", color: "#166534", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
                                          {msg.body.replace("💰 *Cobrança Pix Gerada — SOS Sales*\n\n", "")}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Ação rápida para o operador simular/confirmar a baixa imediata */}
                                    {isOutbound && (
                                      <div style={{ borderTop: "1px dashed #BBF7D0", paddingTop: "8px", marginTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (matchedCharge) {
                                              navigator.clipboard?.writeText(matchedCharge.pixCode);
                                              setCopiedPixId(matchedCharge.id);
                                              setTimeout(() => setCopiedPixId(null), 2500);
                                            }
                                          }}
                                          style={{
                                            padding: "4px 8px",
                                            fontSize: "0.72rem",
                                            fontWeight: 600,
                                            borderRadius: "5px",
                                            border: "1px solid #CBD5E1",
                                            backgroundColor: "#FFFFFF",
                                            color: "#475569",
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "4px",
                                          }}
                                        >
                                          <Copy size={12} /> {copiedPixId === matchedCharge?.id ? "Código Copiado! ✅" : "Copiar Chave"}
                                        </button>

                                        {isPaid ? (
                                          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.72rem", color: "#166534", fontWeight: 600 }}>
                                            <CheckCircle2 size={13} color="#16A34A" />
                                            {isManualCashier
                                              ? `Conferência manual no caixa${matchedCharge?.paidAt ? ` às ${new Date(matchedCharge.paidAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}`
                                              : "Liquidado via Webhook Bancário"}
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (matchedCharge && matchedCharge.status === "PENDING") {
                                                handleConfirmPixPayment(matchedCharge.id);
                                              }
                                            }}
                                            style={{
                                              padding: "4px 10px",
                                              fontSize: "0.74rem",
                                              fontWeight: 700,
                                              borderRadius: "6px",
                                              border: "1px solid #16A34A",
                                              backgroundColor: "#DCFCE7",
                                              color: "#15803D",
                                              cursor: "pointer",
                                              display: "flex",
                                              alignItems: "center",
                                              gap: "4px",
                                            }}
                                          >
                                            <CheckCircle2 size={13} /> Conferir no Caixa (Manual)
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          ) : msg.body?.startsWith("🎉 *Pagamento Pix Confirmado") ? (
                            <div
                              style={{
                                backgroundColor: "#ECFDF5",
                                border: "1px solid #A7F3D0",
                                borderRadius: "8px",
                                padding: "12px",
                                marginTop: "4px",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", fontWeight: 800, color: "#047857", marginBottom: "4px" }}>
                                <Sparkles size={16} color="#059669" /> Venda Fechada com Sucesso! 🚀
                              </div>
                              <div style={{ fontSize: "0.84rem", color: "#065F46", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                                {msg.body}
                              </div>
                            </div>
                          ) : (
                            <div
                              style={{
                                fontSize: "0.88rem",
                                color: "var(--text-primary, #0F172A)",
                                lineHeight: 1.45,
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                              }}
                            >
                              {msg.body}
                            </div>
                          )}

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "flex-end",
                              gap: "4px",
                              marginTop: "4px",
                              fontSize: "0.68rem",
                              color: "var(--text-muted, #94A3B8)",
                            }}
                          >
                            <span>
                              {safeFormatTime(msg.createdAt)}
                            </span>
                            {isOutbound && (
                              <span>
                                {msg.deliveryStatus === "read" ? (
                                  <CheckCheck size={12} color="var(--color-operational, #2563EB)" />
                                ) : msg.deliveryStatus === "delivered" ? (
                                  <CheckCheck size={12} color="var(--text-muted, #94A3B8)" />
                                ) : msg.deliveryStatus === "sent" ? (
                                  <Check size={12} color="var(--text-muted, #94A3B8)" />
                                ) : msg.deliveryStatus === "failed" ? (
                                  <AlertCircle size={12} color="var(--color-danger, #DC2626)" />
                                ) : (
                                  <Clock size={12} color="var(--text-muted, #94A3B8)" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Erro de Envio se houver */}
              {sendError && (
                <div style={{ padding: "0 16px" }}>
                  <Alert variant="danger" title="Erro no Envio">
                    {sendError}
                  </Alert>
                </div>
              )}

              {/* Composer de Envio */}
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "var(--bg-surface, #FFFFFF)",
                  borderTop: "1px solid var(--border-default, #E2E8F0)",
                }}
              >
                {/* Radar Suggestions for current thread */}
                {suggestions
                  .filter((s) => s.threadId === selectedThreadId && s.status === "pending")
                  .map((sug) => (
                    <div
                      key={sug.id}
                      data-testid={`radar-suggestion-${sug.id}`}
                      style={{
                        marginBottom: "12px",
                        padding: "12px 14px",
                        backgroundColor: "#EEF2FF",
                        border: "1px solid #C7D2FE",
                        borderRadius: "var(--radius-md, 8px)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Sparkles size={15} color="#4F46E5" />
                          <span style={{ fontSize: "0.76rem", fontWeight: 700, color: "#3730A3", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            Sugestão Radar ({sug.source})
                          </span>
                          <span
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: 600,
                              padding: "1px 6px",
                              borderRadius: "4px",
                              backgroundColor:
                                sug.priority === "urgent" || sug.priority === "high"
                                  ? "#FEE2E2"
                                  : "#E0E7FF",
                              color:
                                sug.priority === "urgent" || sug.priority === "high"
                                  ? "#991B1B"
                                  : "#3730A3",
                            }}
                          >
                            {sug.priority.toUpperCase()}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            type="button"
                            disabled={isDecidingSuggestion}
                            onClick={() => handleDecideSuggestion(sug, "dismissed")}
                            style={{
                              padding: "4px 10px",
                              fontSize: "0.75rem",
                              borderRadius: "6px",
                              border: "1px solid #CBD5E1",
                              backgroundColor: "#FFFFFF",
                              color: "#475569",
                              cursor: "pointer",
                            }}
                          >
                            Dispensar
                          </button>
                          <button
                            type="button"
                            disabled={isDecidingSuggestion}
                            onClick={() => handleDecideSuggestion(sug, "accepted")}
                            style={{
                              padding: "4px 12px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              borderRadius: "6px",
                              border: "none",
                              backgroundColor: "#4F46E5",
                              color: "#FFFFFF",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            Aceitar & Usar Rascunho ✨
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: "0.84rem", fontWeight: 600, color: "#1E1B4B" }}>
                        {sug.title}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "#334155", lineHeight: 1.4 }}>
                        {sug.body}
                      </div>
                      {sug.draftMessage && (
                        <div
                          style={{
                            padding: "8px 12px",
                            backgroundColor: "#FFFFFF",
                            border: "1px dashed #A5B4FC",
                            borderRadius: "6px",
                            fontSize: "0.8rem",
                            color: "#1F2937",
                          }}
                        >
                          <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#6366F1", display: "block", marginBottom: "2px" }}>
                            Rascunho sugerido:
                          </span>
                          &ldquo;{sug.draftMessage}&rdquo;
                        </div>
                      )}
                    </div>
                  ))}
                {!windowInfo.isOpen && (
                  <div
                    style={{
                      marginBottom: "12px",
                      padding: "10px 14px",
                      backgroundColor: "var(--color-warning-subtle, #FEF3C7)",
                      border: "1px solid var(--color-warning-border, #FCD34D)",
                      borderRadius: "var(--radius-md, 8px)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem", color: "#92400E" }}>
                      <AlertCircle size={16} color="#D97706" style={{ flexShrink: 0 }} />
                      <span>
                        <strong>Janela de 24h Fechada:</strong> Envio de texto livre bloqueado pela Meta. Dispare um Modelo Aprovado (Utility ou Marketing) para reabrir a conversa.
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      prefixIcon={<Zap size={14} />}
                      onClick={handleOpenTemplateDrawer}
                      style={{ flexShrink: 0 }}
                    >
                      Disparar Modelo ⚡
                    </Button>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", overflowX: "auto" }}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleOpenTemplateDrawer}
                      prefixIcon={<Zap size={14} color="#00A884" />}
                      title="Disparar Modelo Aprovado WABA"
                    >
                      Modelos WABA
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleOpenFlowDrawer}
                      prefixIcon={<FileText size={14} color="#2563EB" />}
                      title="Enviar Formulário Interativo do WhatsApp (Flow)"
                    >
                      Formulários Flow
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      data-testid="btn-catalog-waba"
                      onClick={handleOpenProductDrawer}
                      prefixIcon={<ShoppingBag size={14} color="#D97706" />}
                      title="Enviar Oferta ou Produto do Catálogo WhatsApp"
                    >
                      Catálogo 🛍️
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      data-testid="btn-pix-charge"
                      onClick={handleOpenPixDrawer}
                      prefixIcon={<DollarSign size={14} color="#16A34A" />}
                      title="Gerar Cobrança Pix e Fechamento no WhatsApp"
                    >
                      Pix 💰
                    </Button>
                  </div>

                  <form
                    onSubmit={handleSendMessage}
                    style={{ display: "flex", gap: "10px", alignItems: "center" }}
                  >
                    <input
                      type="text"
                      data-testid="message-input"
                      value={messageInput}
                      onChange={(e) => handleMessageInputChange(e.target.value)}
                      placeholder={
                        windowInfo.isOpen
                          ? `Responder para ${selectedThread.contactName || selectedThread.contactPhone}...`
                          : "Janela 24h fechada — use Modelos WABA para enviar..."
                      }
                      disabled={isSendingMessage}
                      style={{
                        flex: 1,
                        height: "44px",
                        padding: "0 16px",
                        borderRadius: "var(--radius-md, 8px)",
                        border: "1px solid var(--border-default, #E2E8F0)",
                        backgroundColor: "var(--bg-canvas, #F8FAFC)",
                        fontSize: "0.88rem",
                        color: "var(--text-primary, #0F172A)",
                        outline: "none",
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={isSendingMessage || !messageInput.trim()}
                      prefixIcon={<Send size={16} />}
                    >
                      {isSendingMessage ? "Enviando..." : "Enviar"}
                    </Button>
                  </form>
                </div>
              </div>
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                padding: "24px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  maxWidth: "480px",
                  backgroundColor: "var(--bg-surface, #FFFFFF)",
                  padding: "36px 24px",
                  borderRadius: "var(--radius-lg, 12px)",
                  border: "1px solid var(--border-default, #E2E8F0)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                }}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    backgroundColor: "var(--color-action-subtle, #E6F7F3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 16px auto",
                    color: "var(--color-action, #00A884)",
                  }}
                >
                  <MessageSquare size={28} />
                </div>

                <h3
                  style={{
                    fontSize: "1.15rem",
                    fontWeight: 700,
                    color: "var(--text-primary, #0F172A)",
                    marginBottom: "8px",
                  }}
                >
                  Nenhuma Conversa Selecionada
                </h3>
                <p style={{ color: "var(--text-secondary, #475569)", fontSize: "0.9rem" }}>
                  Selecione um contato na fila à esquerda para ler as mensagens e responder diretamente pelo WhatsApp.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Coluna 3: Dossiê e Desfecho Comercial (Outcome) */}
        <aside
          aria-label="Dossiê do Lead e Fechamento Comercial"
          style={{
            backgroundColor: "var(--bg-surface, #FFFFFF)",
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
            padding: "20px",
            gap: "20px",
          }}
        >
          {selectedThread ? (
            <>
              {/* Card de Desfecho Comercial (Outcome & Venda) */}
              <div>
                <h3
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: 700,
                    color: "var(--text-primary, #0F172A)",
                    marginBottom: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <TrendingUp size={16} color="var(--color-action, #00A884)" />
                  Fechamento Comercial
                </h3>

                <div
                  style={{
                    backgroundColor: "var(--bg-canvas, #F8FAFC)",
                    padding: "16px",
                    borderRadius: "var(--radius-md, 8px)",
                    border: "1px solid var(--border-default, #E2E8F0)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "var(--text-secondary, #475569)",
                        marginBottom: "4px",
                      }}
                    >
                      Valor do Contrato / Venda (R$)
                    </label>
                    <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
                      <span
                        style={{
                          position: "absolute",
                          left: "10px",
                          fontSize: "0.85rem",
                          color: "var(--text-muted, #94A3B8)",
                        }}
                      >
                        R$
                      </span>
                      <input
                        type="text"
                        value={dealValue}
                        onChange={(e) => setDealValue(e.target.value)}
                        placeholder="0,00"
                        style={{
                          width: "100%",
                          height: "36px",
                          paddingLeft: "32px",
                          paddingRight: "10px",
                          borderRadius: "var(--radius-sm, 6px)",
                          border: "1px solid var(--border-default, #E2E8F0)",
                          backgroundColor: "#FFFFFF",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <Button
                      size="sm"
                      variant={outcomeStatus === "won" ? "primary" : "outline"}
                      style={{ flex: 1 }}
                      disabled={isRecordingOutcome}
                      onClick={() => handleRecordOutcome("won")}
                    >
                      <DollarSign size={14} />
                      {isRecordingOutcome && outcomeStatus === "won" ? "Gravando..." : "Venda Ganha"}
                    </Button>
                    <Button
                      size="sm"
                      variant={outcomeStatus === "lost" ? "danger" : "outline"}
                      style={{ flex: 1 }}
                      disabled={isRecordingOutcome}
                      onClick={() => handleRecordOutcome("lost")}
                    >
                      {isRecordingOutcome && outcomeStatus === "lost" ? "Gravando..." : "Perdido"}
                    </Button>
                  </div>

                  {outcomeSuccessMessage && (
                    <div
                      style={{
                        padding: "10px",
                        borderRadius: "6px",
                        backgroundColor: "var(--color-action-subtle, #E6F7F3)",
                        border: "1px solid var(--color-action-border, #A7F3D0)",
                        fontSize: "0.78rem",
                        color: "var(--color-action, #00A884)",
                        fontWeight: 600,
                        lineHeight: 1.4,
                      }}
                    >
                      {outcomeSuccessMessage}
                    </div>
                  )}

                  {outcomeError && (
                    <div
                      style={{
                        padding: "10px",
                        borderRadius: "6px",
                        backgroundColor: "var(--color-danger-subtle, #FEE2E2)",
                        border: "1px solid var(--color-danger-border, #FCA5A5)",
                        fontSize: "0.78rem",
                        color: "var(--color-danger, #EF4444)",
                        fontWeight: 600,
                      }}
                    >
                      {outcomeError}
                    </div>
                  )}
                </div>
              </div>

              {/* Card: Detalhes do Lead */}
              <div>
                <h3
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: 700,
                    color: "var(--text-primary, #0F172A)",
                    marginBottom: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <User size={16} color="var(--color-operational, #2563EB)" />
                  Dossiê do Contato
                </h3>

                <div
                  style={{
                    backgroundColor: "var(--bg-canvas, #F8FAFC)",
                    padding: "14px",
                    borderRadius: "var(--radius-md, 8px)",
                    border: "1px solid var(--border-default, #E2E8F0)",
                    fontSize: "0.8rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted, #94A3B8)" }}>Nome:</span>
                    <strong style={{ color: "var(--text-primary, #0F172A)" }}>
                      {selectedThread.contactName || "Não Informado"}
                    </strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted, #94A3B8)" }}>Telefone:</span>
                    <span style={{ fontFamily: "var(--font-mono)" }}>
                      {selectedThread.contactPhone}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted, #94A3B8)" }}>Canal:</span>
                    <span>{selectedThread.channelName}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted, #94A3B8)" }}>Criado em:</span>
                    <span>{new Date(selectedThread.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Contexto Global do Workspace se nenhuma conversa estiver aberta */
            <div>
              <h3
                style={{
                  fontSize: "0.9rem",
                  fontWeight: 700,
                  color: "var(--text-primary, #0F172A)",
                  marginBottom: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <Building2 size={16} color="var(--color-operational, #2563EB)" />
                Contexto do Workspace
              </h3>

              {activeWorkspaceDetails && (
                <div
                  style={{
                    backgroundColor: "var(--bg-canvas, #F8FAFC)",
                    padding: "14px",
                    borderRadius: "var(--radius-md, 8px)",
                    border: "1px solid var(--border-default, #E2E8F0)",
                    fontSize: "0.8rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted, #94A3B8)" }}>Nome:</span>
                    <strong>{activeWorkspaceDetails.workspace?.name || "Workspace Ativo"}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted, #94A3B8)" }}>Papel:</span>
                    <Badge variant="operational">
                      {activeWorkspaceDetails.userRole || (activeWorkspaceDetails as any).membership?.role || "Membro"}
                    </Badge>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted, #94A3B8)" }}>Fuso:</span>
                    <span>{activeWorkspaceDetails.workspace?.timezone || "UTC"}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Drawer com Detalhes do Dossiê para Telas Menores */}
      <Drawer
        isOpen={isDossierDrawerOpen}
        onClose={() => setIsDossierDrawerOpen(false)}
        title="Dossiê do Workspace"
        description="Configurações e permissões ativas do tenant selecionado."
        footer={
          <Button variant="secondary" onClick={() => setIsDossierDrawerOpen(false)}>
            Fechar
          </Button>
        }
      >
        {activeWorkspaceDetails && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", fontSize: "0.85rem" }}>
            <div>
              <strong>Tenant ID:</strong>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", marginTop: "4px" }}>
                {activeWorkspaceDetails.workspace?.id || "N/A"}
              </div>
            </div>
            <div>
              <strong>Papel:</strong>{" "}
              {activeWorkspaceDetails.userRole || (activeWorkspaceDetails as any).membership?.role || "Membro"}
            </div>
            <div>
              <strong>Permissões:</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                {(activeWorkspaceDetails.permissions || []).length > 0 ? (
                  activeWorkspaceDetails.permissions.map((p) => (
                    <Badge key={p} variant="operational">{p}</Badge>
                  ))
                ) : (
                  <span style={{ color: "var(--text-muted, #94A3B8)", fontSize: "0.75rem" }}>
                    Nenhuma permissão específica listada
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Drawer de Disparo de Modelo WABA (Meta Cloud API) */}
      <Drawer
        isOpen={isTemplateDrawerOpen}
        onClose={() => setIsTemplateDrawerOpen(false)}
        title="Disparo de Modelo Oficial WABA"
        description="Gestão de custos e reabertura da janela de atendimento Meta Cloud API"
        width="560px"
        footer={
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", width: "100%" }}>
            <Button variant="secondary" onClick={() => setIsTemplateDrawerOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              disabled={isSendingTemplate || !selectedTemplate}
              onClick={handleSendTemplate}
              prefixIcon={<Zap size={15} />}
            >
              {isSendingTemplate
                ? "Disparando..."
                : selectedTemplate
                ? `Disparar Modelo (${selectedTemplate.category === "UTILITY" ? "~R$ 0,04" : "~R$ 0,40"}) ⚡`
                : "Disparar Modelo"}
            </Button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* Header de Governança Meta */}
          <div
            style={{
              padding: "12px",
              backgroundColor: "var(--bg-canvas, #F8FAFC)",
              borderRadius: "var(--radius-md, 8px)",
              border: "1px solid var(--border-default, #E2E8F0)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  backgroundColor: "var(--color-action-subtle, #E6F7F3)",
                  color: "var(--color-action, #00A884)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                }}
              >
                <Zap size={16} />
              </div>
              <div>
                <strong style={{ fontSize: "0.85rem", color: "var(--text-primary, #0F172A)" }}>
                  Meta WhatsApp Business API
                </strong>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted, #94A3B8)" }}>
                  Destinatário: {selectedThread?.contactName || selectedThread?.contactPhone} ({selectedThread?.contactPhone})
                </div>
              </div>
            </div>

            <Badge variant="action">Oficial v21.0+</Badge>
          </div>

          {/* Filtro de Categoria de Templates */}
          <div>
            <label
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: "var(--text-secondary, #475569)",
                marginBottom: "6px",
                display: "block",
              }}
            >
              Filtrar por Categoria WABA
            </label>
            <div style={{ display: "flex", gap: "6px" }}>
              {(["ALL", "UTILITY", "MARKETING"] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setTemplateFilterCategory(cat)}
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    borderRadius: "6px",
                    border:
                      templateFilterCategory === cat
                        ? "1px solid var(--color-operational, #2563EB)"
                        : "1px solid var(--border-default, #E2E8F0)",
                    backgroundColor:
                      templateFilterCategory === cat
                        ? "var(--color-operational-subtle, #EFF6FF)"
                        : "var(--bg-surface, #FFFFFF)",
                    color:
                      templateFilterCategory === cat
                        ? "var(--color-operational, #2563EB)"
                        : "var(--text-secondary, #475569)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "4px",
                  }}
                >
                  {cat === "ALL" && `Todos (${templates.length})`}
                  {cat === "UTILITY" && "Utilidade (~R$ 0,04)"}
                  {cat === "MARKETING" && "Marketing (~R$ 0,40)"}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de Templates Disponíveis */}
          <div>
            <label
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: "var(--text-secondary, #475569)",
                marginBottom: "6px",
                display: "block",
              }}
            >
              Escolha o Modelo Aprovado
            </label>

            {isLoadingTemplates ? (
              <LoadingState variant="skeleton" lines={3} text="Carregando modelos aprovados..." />
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  maxHeight: "180px",
                  overflowY: "auto",
                  paddingRight: "4px",
                }}
              >
                {templates
                  .filter((t) =>
                    templateFilterCategory === "ALL" ? true : t.category === templateFilterCategory
                  )
                  .map((tpl) => {
                    const isSelected = selectedTemplate?.id === tpl.id;
                    const isUtility = tpl.category === "UTILITY";
                    return (
                      <div
                        key={tpl.id}
                        onClick={() => handleSelectTemplate(tpl)}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "var(--radius-md, 8px)",
                          border: isSelected
                            ? "2px solid var(--color-action, #00A884)"
                            : "1px solid var(--border-default, #E2E8F0)",
                          backgroundColor: isSelected
                            ? "var(--color-action-subtle, #E6F7F3)"
                            : "var(--bg-surface, #FFFFFF)",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                            <strong style={{ fontSize: "0.85rem", color: "var(--text-primary, #0F172A)" }}>
                              {tpl.name}
                            </strong>
                            <Badge variant={isUtility ? "action" : "operational"}>
                              {isUtility ? "UTILITY (~R$ 0,04)" : "MARKETING (~R$ 0,40)"}
                            </Badge>
                          </div>
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--text-secondary, #475569)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: "340px",
                            }}
                          >
                            {tpl.bodyText}
                          </div>
                        </div>

                        {isSelected && <CheckCircle2 size={18} color="var(--color-action, #00A884)" />}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Parâmetros do Template Selecionado (Variáveis) */}
          {selectedTemplate && selectedTemplate.variables && selectedTemplate.variables.length > 0 && (
            <div
              style={{
                backgroundColor: "var(--bg-canvas, #F8FAFC)",
                padding: "14px",
                borderRadius: "var(--radius-md, 8px)",
                border: "1px solid var(--border-default, #E2E8F0)",
              }}
            >
              <div
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  color: "var(--text-primary, #0F172A)",
                  marginBottom: "10px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <SlidersHorizontal size={14} color="var(--color-operational, #2563EB)" />
                Preenchimento de Variáveis ({selectedTemplate.variables.length})
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {selectedTemplate.variables.map((varName, idx) => {
                  const key = String(idx + 1);
                  return (
                    <div key={key}>
                      <label
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          color: "var(--text-secondary, #475569)",
                          marginBottom: "4px",
                          display: "block",
                        }}
                      >
                        Variável &#123;&#123;{key}&#125;&#125; — {varName.toUpperCase()}
                      </label>
                      <Input
                        value={templateVariables[key] || ""}
                        onChange={(e) =>
                          setTemplateVariables((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        placeholder={`Valor para {{${key}}}...`}
                        style={{ height: "34px", fontSize: "0.82rem" }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Preview em Tempo Real do Balão WhatsApp */}
          {selectedTemplate && (
            <div>
              <label
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  color: "var(--text-secondary, #475569)",
                  marginBottom: "6px",
                  display: "block",
                }}
              >
                Pré-visualização Oficial WhatsApp
              </label>

              <div
                style={{
                  backgroundColor: "#EFEAE2",
                  borderRadius: "10px",
                  padding: "16px",
                  border: "1px solid #D1D7DB",
                }}
              >
                <div
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "8px 8px 8px 2px",
                    padding: "12px 14px",
                    maxWidth: "92%",
                    boxShadow: "0 1px 1px rgba(0,0,0,0.1)",
                    border: "1px solid #E2E8F0",
                  }}
                >
                  {selectedTemplate.headerText && (
                    <strong
                      style={{
                        display: "block",
                        fontSize: "0.88rem",
                        color: "#111B21",
                        marginBottom: "6px",
                      }}
                    >
                      {selectedTemplate.headerText}
                    </strong>
                  )}

                  <div
                    style={{
                      fontSize: "0.84rem",
                      color: "#111B21",
                      lineHeight: 1.45,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {(() => {
                      let text = selectedTemplate.bodyText;
                      Object.keys(templateVariables).forEach((k) => {
                        text = text.split(`{{${k}}}`).join(templateVariables[k] || `{{${k}}}`);
                      });
                      return text;
                    })()}
                  </div>

                  {selectedTemplate.footerText && (
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: "#667781",
                        marginTop: "8px",
                      }}
                    >
                      {selectedTemplate.footerText}
                    </div>
                  )}

                  {selectedTemplate.buttons && selectedTemplate.buttons.length > 0 && (
                    <div
                      style={{
                        marginTop: "10px",
                        borderTop: "1px solid #E9EDEF",
                        paddingTop: "6px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                      }}
                    >
                      {selectedTemplate.buttons.map((btn, bIdx) => (
                        <div
                          key={bIdx}
                          style={{
                            textAlign: "center",
                            padding: "6px",
                            color: "#00A884",
                            fontSize: "0.82rem",
                            fontWeight: 600,
                            backgroundColor: "#F7F8FA",
                            borderRadius: "4px",
                            cursor: "default",
                          }}
                        >
                          {btn.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Feedback de Erro do Envio */}
          {templateError && (
            <Alert variant="danger" title="Erro no Disparo">
              {templateError}
            </Alert>
          )}
        </div>
      </Drawer>

      {/* Drawer de Formulários Nativos do WhatsApp (Flows) */}
      <Drawer
        isOpen={isFlowDrawerOpen}
        onClose={() => setIsFlowDrawerOpen(false)}
        title="Formulários do WhatsApp (Flows)"
        width="560px"
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
            <Button variant="ghost" onClick={() => setIsFlowDrawerOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleSendFlow}
              disabled={isSendingFlow || !selectedFlow}
              prefixIcon={<Send size={15} />}
            >
              {isSendingFlow ? "Enviando Formulário..." : "Enviar Formulário ao Cliente 🚀"}
            </Button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Banner Comercial de Orientação */}
          <div
            style={{
              padding: "12px 16px",
              backgroundColor: "var(--color-operational-subtle, #EFF6FF)",
              borderRadius: "8px",
              border: "1px solid var(--color-operational-border, #BFDBFE)",
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
            }}
          >
            <Sparkles size={18} color="#2563EB" style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong style={{ fontSize: "0.85rem", color: "#1E40AF", display: "block", marginBottom: "2px" }}>
                Experiência Nativa no WhatsApp
              </strong>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#3B82F6", lineHeight: 1.4 }}>
                O cliente preenche o formulário diretamente na tela do WhatsApp, sem links externos ou navegadores. A conversão de agendamentos e cadastros é até 3x maior.
              </p>
            </div>
          </div>

          {/* Filtro por Categoria */}
          <div>
            <label
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: "var(--text-secondary, #475569)",
                marginBottom: "6px",
                display: "block",
              }}
            >
              Filtrar por Objetivo Comercial
            </label>
            <div style={{ display: "flex", gap: "6px" }}>
              {(["ALL", "APPOINTMENT_BOOKING", "LEAD_GENERATION", "SURVEY"] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFlowFilterCategory(cat)}
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    borderRadius: "6px",
                    border:
                      flowFilterCategory === cat
                        ? "1px solid var(--color-operational, #2563EB)"
                        : "1px solid var(--border-default, #E2E8F0)",
                    backgroundColor:
                      flowFilterCategory === cat
                        ? "var(--color-operational-subtle, #EFF6FF)"
                        : "var(--bg-surface, #FFFFFF)",
                    color:
                      flowFilterCategory === cat
                        ? "var(--color-operational, #2563EB)"
                        : "var(--text-secondary, #475569)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "4px",
                  }}
                >
                  {cat === "ALL" && `Todos (${flows.length})`}
                  {cat === "APPOINTMENT_BOOKING" && "🗓️ Agendamento"}
                  {cat === "LEAD_GENERATION" && "🎯 Qualificação"}
                  {cat === "SURVEY" && "⭐ Satisfação"}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de Flows Disponíveis */}
          <div>
            <label
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: "var(--text-secondary, #475569)",
                marginBottom: "6px",
                display: "block",
              }}
            >
              Escolha o Formulário
            </label>

            {isLoadingFlows ? (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--text-secondary, #475569)" }}>
                Carregando formulários do WhatsApp...
              </div>
            ) : flows.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--text-secondary, #475569)" }}>
                Nenhum formulário encontrado.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "220px", overflowY: "auto" }}>
                {flows
                  .filter((f) =>
                    flowFilterCategory === "ALL" ? true : f.category === flowFilterCategory
                  )
                  .map((f) => {
                    const isSelected = selectedFlow?.id === f.id;
                    return (
                      <div
                        key={f.id}
                        onClick={() => handleSelectFlow(f)}
                        style={{
                          padding: "12px 14px",
                          borderRadius: "8px",
                          border: isSelected
                            ? "2px solid var(--color-operational, #2563EB)"
                            : "1px solid var(--border-default, #E2E8F0)",
                          backgroundColor: isSelected
                            ? "var(--color-operational-subtle, #EFF6FF)"
                            : "var(--bg-surface, #FFFFFF)",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text-primary, #0F172A)" }}>
                            {f.title}
                          </span>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              padding: "2px 6px",
                              borderRadius: "4px",
                              backgroundColor:
                                f.category === "APPOINTMENT_BOOKING"
                                  ? "#FEF3C7"
                                  : f.category === "LEAD_GENERATION"
                                  ? "#E0E7FF"
                                  : "#ECFDF5",
                              color:
                                f.category === "APPOINTMENT_BOOKING"
                                  ? "#92400E"
                                  : f.category === "LEAD_GENERATION"
                                  ? "#3730A3"
                                  : "#065F46",
                            }}
                          >
                            {f.category === "APPOINTMENT_BOOKING"
                              ? "Agendamento"
                              : f.category === "LEAD_GENERATION"
                              ? "Qualificação"
                              : "Pesquisa"}
                          </span>
                        </div>
                        {f.description && (
                          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary, #475569)", lineHeight: 1.35 }}>
                            {f.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Pré-visualização Realista no WhatsApp */}
          {selectedFlow && (
            <div>
              <label
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  color: "var(--text-secondary, #475569)",
                  marginBottom: "8px",
                  display: "block",
                }}
              >
                Pré-visualização no WhatsApp do Cliente
              </label>

              <div
                style={{
                  backgroundColor: "#EFEAE2",
                  borderRadius: "10px",
                  padding: "16px",
                  border: "1px solid #D1D7DB",
                }}
              >
                {/* Balão do Chat */}
                <div
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "8px 8px 8px 2px",
                    padding: "12px 14px",
                    maxWidth: "92%",
                    boxShadow: "0 1px 1px rgba(0,0,0,0.1)",
                    border: "1px solid #E2E8F0",
                    marginBottom: "12px",
                  }}
                >
                  {selectedFlow.headerText && (
                    <strong style={{ display: "block", fontSize: "0.88rem", color: "#111B21", marginBottom: "6px" }}>
                      {selectedFlow.headerText}
                    </strong>
                  )}

                  <div style={{ fontSize: "0.84rem", color: "#111B21", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                    {selectedFlow.bodyText}
                  </div>

                  {selectedFlow.footerText && (
                    <div style={{ fontSize: "0.72rem", color: "#667781", marginTop: "8px" }}>
                      {selectedFlow.footerText}
                    </div>
                  )}

                  {/* Botão Oficial do Flow */}
                  <div style={{ marginTop: "10px", borderTop: "1px solid #E9EDEF", paddingTop: "8px" }}>
                    <div
                      style={{
                        textAlign: "center",
                        padding: "8px",
                        color: "#00A884",
                        fontSize: "0.85rem",
                        fontWeight: 700,
                        backgroundColor: "#F7F8FA",
                        borderRadius: "6px",
                        border: "1px solid #E2E8F0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                      }}
                    >
                      <FileText size={15} /> {selectedFlow.ctaLabel}
                    </div>
                  </div>
                </div>

                {/* Simulador da Tela Nativa Aberta */}
                <div
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "8px",
                    padding: "12px",
                    border: "1px solid #CBD5E1",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "#475569",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: "8px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span>📱 Tela do Formulário (Ao Tocar no Botão)</span>
                  </div>

                  {selectedFlow.screensPreview && selectedFlow.screensPreview.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {selectedFlow.screensPreview.map((screen, sIdx) => (
                        <div
                          key={sIdx}
                          style={{
                            backgroundColor: "#F8FAFC",
                            padding: "8px 10px",
                            borderRadius: "6px",
                            border: "1px solid #E2E8F0",
                          }}
                        >
                          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#1E293B", marginBottom: "4px" }}>
                            {screen.title}
                          </div>
                          {screen.fields.map((fld, fIdx) => (
                            <div key={fIdx} style={{ fontSize: "0.76rem", color: "#64748B", marginLeft: "8px" }}>
                              • {fld.label} {fld.required ? "*" : ""}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: "0.8rem", color: "#64748B" }}>
                      Etapas interativas pré-configuradas.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Feedback de Erro do Envio */}
          {flowError && (
            <Alert variant="danger" title="Erro no Envio">
              {flowError}
            </Alert>
          )}
        </div>
      </Drawer>

      {/* Drawer de Produtos e Catálogo do WhatsApp */}
      <Drawer
        isOpen={isProductDrawerOpen}
        onClose={() => setIsProductDrawerOpen(false)}
        title="Catálogo de Produtos & Ofertas"
        width="620px"
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
            <Button variant="ghost" onClick={() => setIsProductDrawerOpen(false)}>
              Cancelar
            </Button>
            <div style={{ display: "flex", gap: "8px" }}>
              <Button
                variant="primary"
                data-testid="btn-send-product"
                onClick={() => handleSendProduct()}
                disabled={isSendingProduct || !selectedProduct}
                prefixIcon={<Send size={15} />}
              >
                {isSendingProduct ? "Enviando Produto..." : "Enviar Produto no Chat 🚀"}
              </Button>
            </div>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* Banner Comercial de Conversão */}
          <div
            style={{
              padding: "12px 16px",
              backgroundColor: "#FFFBEB",
              borderRadius: "8px",
              border: "1px solid #FDE68A",
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
            }}
          >
            <ShoppingBag size={18} color="#D97706" style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong style={{ fontSize: "0.85rem", color: "#92400E", display: "block", marginBottom: "2px" }}>
                Venda Direta com o Catálogo do WhatsApp
              </strong>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#B45309", lineHeight: 1.4 }}>
                Envie produtos com foto, preço em R$ e botão de compra nativo. A apresentação profissional reduz objeções e aumenta o ticket médio da conversa.
              </p>
            </div>
          </div>

          {/* Ação Rápida de Vitrine Completa (Multi-Product) */}
          <div
            style={{
              padding: "12px 14px",
              background: "linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)",
              borderRadius: "8px",
              border: "1px solid #BFDBFE",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div>
              <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#1E3A8A" }}>
                📦 Vitrine de Produtos Completa
              </div>
              <div style={{ fontSize: "0.75rem", color: "#3B82F6" }}>
                Envie um menu interativo com os 4 principais itens para o cliente explorar.
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSendMultiProduct}
              disabled={isSendingProduct || products.length === 0}
              prefixIcon={<Package size={14} color="#2563EB" />}
            >
              Enviar Vitrine 📦
            </Button>
          </div>

          {/* Filtros e Busca de Produtos */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Buscar produto por nome, código ou descrição..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                style={{
                  width: "100%",
                  height: "36px",
                  padding: "0 12px 0 34px",
                  fontSize: "0.82rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border-default, #CBD5E1)",
                  backgroundColor: "var(--bg-canvas, #F8FAFC)",
                  outline: "none",
                }}
              />
              <Search
                size={15}
                color="#64748B"
                style={{ position: "absolute", left: "10px", top: "10px", pointerEvents: "none" }}
              />
            </div>

            <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "2px" }}>
              {(["ALL", "Planos & Assinaturas", "Serviços & Consultoria", "Capacitação & Cursos"] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setProductCategoryFilter(cat)}
                  style={{
                    padding: "5px 10px",
                    fontSize: "0.74rem",
                    fontWeight: 600,
                    borderRadius: "6px",
                    border:
                      productCategoryFilter === cat
                        ? "1px solid #D97706"
                        : "1px solid var(--border-default, #E2E8F0)",
                    backgroundColor:
                      productCategoryFilter === cat
                        ? "#FEF3C7"
                        : "var(--bg-surface, #FFFFFF)",
                    color:
                      productCategoryFilter === cat
                        ? "#92400E"
                        : "var(--text-secondary, #475569)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {cat === "ALL" ? `Todos (${products.length})` : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de Produtos */}
          <div>
            <label
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: "var(--text-secondary, #475569)",
                marginBottom: "6px",
                display: "block",
              }}
            >
              Selecione o Produto para Envio
            </label>

            {isLoadingProducts ? (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--text-secondary, #475569)" }}>
                Carregando catálogo de produtos...
              </div>
            ) : products.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--text-secondary, #475569)" }}>
                Nenhum produto cadastrado no catálogo.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "200px", overflowY: "auto" }}>
                {products
                  .filter((p) => {
                    const matchesCategory =
                      productCategoryFilter === "ALL" ? true : p.category === productCategoryFilter;
                    const matchesSearch =
                      !productSearch ||
                      p.title.toLowerCase().includes(productSearch.toLowerCase()) ||
                      p.description.toLowerCase().includes(productSearch.toLowerCase()) ||
                      p.retailerId.toLowerCase().includes(productSearch.toLowerCase());
                    return matchesCategory && matchesSearch;
                  })
                  .map((p) => {
                    const isSelected = selectedProduct?.id === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelectProduct(p)}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: isSelected
                            ? "2px solid #D97706"
                            : "1px solid var(--border-default, #E2E8F0)",
                          backgroundColor: isSelected
                            ? "#FFFBEB"
                            : "var(--bg-surface, #FFFFFF)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <img
                          src={p.imageUrl}
                          alt={p.title}
                          style={{
                            width: "56px",
                            height: "56px",
                            borderRadius: "6px",
                            objectFit: "cover",
                            flexShrink: 0,
                            border: "1px solid #E2E8F0",
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                            <strong style={{ fontSize: "0.85rem", color: "var(--text-primary, #0F172A)" }}>
                              {p.title}
                            </strong>
                            {p.badge && (
                              <span
                                style={{
                                  fontSize: "0.68rem",
                                  fontWeight: 700,
                                  color: "#D97706",
                                  backgroundColor: "#FEF3C7",
                                  padding: "1px 5px",
                                  borderRadius: "4px",
                                }}
                              >
                                {p.badge}
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--text-muted, #64748B)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {p.subtitle || p.description}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#15803D" }}>
                            {p.priceFormatted}
                          </div>
                          <div style={{ fontSize: "0.68rem", color: "#64748B" }}>
                            {p.category}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Simulador Realista de WhatsApp */}
          {selectedProduct && (
            <div>
              <label
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  color: "var(--text-secondary, #475569)",
                  marginBottom: "6px",
                  display: "block",
                }}
              >
                Prévia Fiel no WhatsApp do Cliente
              </label>

              <div
                style={{
                  backgroundColor: "#ECE5DD",
                  borderRadius: "10px",
                  padding: "16px",
                  border: "1px solid #CBD5E1",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                {/* Balão do WhatsApp */}
                <div
                  style={{
                    width: "100%",
                    maxWidth: "340px",
                    backgroundColor: "#FFFFFF",
                    borderRadius: "8px",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.12)",
                    overflow: "hidden",
                    border: "1px solid #E2E8F0",
                  }}
                >
                  <img
                    src={selectedProduct.imageUrl}
                    alt={selectedProduct.title}
                    style={{
                      width: "100%",
                      height: "150px",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                  <div style={{ padding: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px" }}>
                      <span style={{ fontSize: "0.72rem", color: "#64748B", textTransform: "uppercase", fontWeight: 600 }}>
                        {selectedProduct.category}
                      </span>
                      <strong style={{ fontSize: "1.05rem", color: "#15803D", fontWeight: 800 }}>
                        {selectedProduct.priceFormatted}
                      </strong>
                    </div>

                    <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#1E293B", marginBottom: "4px" }}>
                      {selectedProduct.title}
                    </div>

                    <div style={{ fontSize: "0.78rem", color: "#475569", lineHeight: 1.4, marginBottom: "12px" }}>
                      {selectedProduct.subtitle || selectedProduct.description}
                    </div>

                    {/* Botão de Ação Oficial do WhatsApp */}
                    <div
                      style={{
                        padding: "8px",
                        textAlign: "center",
                        backgroundColor: "#F0F2F5",
                        borderRadius: "6px",
                        border: "1px solid #E4E6EB",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color: "#00A884",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                      }}
                    >
                      <ShoppingBag size={14} color="#00A884" />
                      <span>Ver Produto</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Feedback de Erro */}
          {productError && (
            <Alert variant="danger" title="Erro no Envio">
              {productError}
            </Alert>
          )}
        </div>
      </Drawer>

      {/* Drawer de Cobrança Pix & Fechamento Comercial Instantâneo */}
      <Drawer
        isOpen={isPixDrawerOpen}
        onClose={() => setIsPixDrawerOpen(false)}
        title="Gerar Cobrança Pix no WhatsApp"
        width="560px"
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
            <Button variant="ghost" onClick={() => setIsPixDrawerOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              data-testid="btn-submit-pix"
              onClick={handleGenerateAndSendPix}
              disabled={isCreatingPix || !pixAmount.trim() || !hasConfiguredPixKey}
              prefixIcon={<Zap size={15} />}
            >
              {isCreatingPix ? "Gerando Pix..." : "Enviar Cobrança Pix no Chat 🚀"}
            </Button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {!hasConfiguredPixKey && (
            <div
              style={{
                padding: "12px 16px",
                backgroundColor: "#FEF2F2",
                borderRadius: "8px",
                border: "1px solid #FECACA",
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
              }}
            >
              <AlertCircle size={20} color="#DC2626" style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong style={{ fontSize: "0.85rem", color: "#991B1B", display: "block", marginBottom: "2px" }}>
                  Chave Pix não configurada no Workspace
                </strong>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#B91C1C", lineHeight: 1.4 }}>
                  Este workspace ainda não possui chave Pix oficial cadastrada. Configure em <strong>Ajustes do Workspace</strong> para habilitar cobranças sem fallbacks fictícios.
                </p>
              </div>
            </div>
          )}
          {/* Banner Comercial de Conversão Rápida */}
          <div
            style={{
              padding: "12px 16px",
              backgroundColor: "#F0FDF4",
              borderRadius: "8px",
              border: "1px solid #BBF7D0",
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
            }}
          >
            <QrCode size={20} color="#16A34A" style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong style={{ fontSize: "0.85rem", color: "#166534", display: "block", marginBottom: "2px" }}>
                Fechamento Instantâneo com Pix Copia e Cola
              </strong>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#15803D", lineHeight: 1.4 }}>
                Envie o QR Code e o código Pix prontos diretamente para a conversa. O cliente só precisa colar no aplicativo do banco para concluir o pagamento em segundos.
              </p>
            </div>
          </div>

          {/* Atalho de Produtos do Catálogo */}
          {products.length > 0 && (
            <div>
              <label
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  color: "var(--text-secondary, #475569)",
                  marginBottom: "6px",
                  display: "block",
                }}
              >
                Preenchimento Rápido via Catálogo (Opcional):
              </label>
              <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px" }}>
                {products.map((p) => {
                  const isSelected = pixSelectedProduct?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPixProduct(p)}
                      style={{
                        padding: "8px 12px",
                        fontSize: "0.76rem",
                        fontWeight: 600,
                        borderRadius: "6px",
                        border: isSelected ? "2px solid #16A34A" : "1px solid var(--border-default, #CBD5E1)",
                        backgroundColor: isSelected ? "#F0FDF4" : "#FFFFFF",
                        color: isSelected ? "#15803D" : "#334155",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <Tag size={13} color={isSelected ? "#16A34A" : "#64748B"} />
                      <span>{p.title}</span>
                      <span style={{ color: "#16A34A", fontWeight: 700 }}>{p.priceFormatted}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Campos de Configuração do Pix */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <label
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  color: "var(--text-secondary, #475569)",
                  marginBottom: "4px",
                  display: "block",
                }}
              >
                Título ou Descrição do Pedido
              </label>
              <Input
                type="text"
                data-testid="input-pix-title"
                value={pixTitle}
                onChange={(e) => setPixTitle(e.target.value)}
                placeholder="Ex: Assinatura Mensal, Taxa de Matrícula, Pedido #123"
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    color: "var(--text-secondary, #475569)",
                    marginBottom: "4px",
                    display: "block",
                  }}
                >
                  Valor da Cobrança (R$)
                </label>
                <div style={{ position: "relative" }}>
                  <span
                    style={{
                      position: "absolute",
                      left: "12px",
                      top: "10px",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      color: "#64748B",
                    }}
                  >
                    R$
                  </span>
                  <input
                    type="text"
                    data-testid="input-pix-amount"
                    value={pixAmount}
                    onChange={(e) => setPixAmount(e.target.value)}
                    placeholder="0,00"
                    style={{
                      width: "100%",
                      height: "38px",
                      padding: "0 12px 0 38px",
                      fontSize: "1rem",
                      fontWeight: 700,
                      color: "#15803D",
                      borderRadius: "6px",
                      border: "1px solid var(--border-default, #CBD5E1)",
                      backgroundColor: "var(--bg-canvas, #F8FAFC)",
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              <div>
                <label
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    color: "var(--text-secondary, #475569)",
                    marginBottom: "4px",
                    display: "block",
                  }}
                >
                  Tempo de Validade do Pix
                </label>
                <div style={{ display: "flex", gap: "6px" }}>
                  {[
                    { label: "15 min", value: 15 },
                    { label: "30 min", value: 30 },
                    { label: "1 hora", value: 60 },
                    { label: "24 horas", value: 1440 },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setPixExpiresMinutes(item.value)}
                      style={{
                        flex: 1,
                        padding: "8px 4px",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        borderRadius: "6px",
                        border: pixExpiresMinutes === item.value ? "1.5px solid #16A34A" : "1px solid #CBD5E1",
                        backgroundColor: pixExpiresMinutes === item.value ? "#DCFCE7" : "#FFFFFF",
                        color: pixExpiresMinutes === item.value ? "#15803D" : "#475569",
                        cursor: "pointer",
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Prévia Realista no WhatsApp */}
          <div>
            <label
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: "var(--text-secondary, #475569)",
                marginBottom: "6px",
                display: "block",
              }}
            >
              Prévia do Que o Cliente Receberá no WhatsApp
            </label>

            <div
              style={{
                backgroundColor: "#ECE5DD",
                borderRadius: "10px",
                padding: "16px",
                border: "1px solid #CBD5E1",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: "340px",
                  backgroundColor: "#FFFFFF",
                  borderRadius: "8px",
                  padding: "14px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.12)",
                  border: "1px solid #E2E8F0",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #F1F5F9", paddingBottom: "8px" }}>
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      backgroundColor: "#DCFCE7",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <DollarSign size={16} color="#16A34A" />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#1E293B" }}>
                      Cobrança Pix — SOS Sales
                    </div>
                    <div style={{ fontSize: "0.68rem", color: "#64748B" }}>
                      Válido por {pixExpiresMinutes} minutos
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.76rem", color: "#64748B", marginBottom: "2px" }}>
                    Item / Pedido:
                  </div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#1E293B" }}>
                    {pixTitle || "Cobrança Pix Oficial"}
                  </div>
                </div>

                <div style={{ backgroundColor: "#F8FAFC", padding: "10px", borderRadius: "6px", border: "1px solid #E2E8F0" }}>
                  <div style={{ fontSize: "0.72rem", color: "#64748B" }}>Valor total a pagar:</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#15803D" }}>
                    R$ {pixAmount || "0,00"}
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: "#F1F5F9",
                    padding: "8px",
                    borderRadius: "6px",
                    fontSize: "0.72rem",
                    color: "#334155",
                    fontFamily: "monospace",
                    wordBreak: "break-all",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "6px",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    00020126580014br.gov.bcb.pix...
                  </span>
                  <Copy size={13} color="#64748B" style={{ flexShrink: 0 }} />
                </div>
              </div>
            </div>
          </div>

          {/* Mensagem de Erro se houver */}
          {pixError && (
            <Alert variant="danger" title="Erro ao Gerar Pix">
              {pixError}
            </Alert>
          )}
        </div>
      </Drawer>

      {/* Drawer de Radar de Oportunidades & Sugestões (n8n / Extensões) */}
      <Drawer
        isOpen={isRadarDrawerOpen}
        onClose={() => setIsRadarDrawerOpen(false)}
        title="Radar de Oportunidades & Sugestões (n8n)"
        description="Oportunidades identificadas deterministicamente por rotinas externas a partir de conversas paradas ou sem resposta. Nenhuma mensagem é enviada sem sua aprovação explícita."
        width="600px"
        footer={
          <div style={{ display: "flex", gap: "10px", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary, #64748B)" }}>
              {suggestions.length} sugestão(ões) pendente(s)
            </span>
            <Button variant="secondary" onClick={() => setIsRadarDrawerOpen(false)}>
              Fechar Radar
            </Button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Header explicativo de Governança */}
          <div
            style={{
              padding: "12px 14px",
              backgroundColor: "#EEF2FF",
              borderRadius: "8px",
              border: "1px solid #C7D2FE",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "0.8rem",
              color: "#3730A3",
            }}
          >
            <Sparkles size={18} color="#4F46E5" style={{ flexShrink: 0 }} />
            <span>
              <strong>Arquitetura Soberana:</strong> O n8n sugere ações via API governada. O operador do CHAT SALES sempre revisa, edita e dispara. Zero envio autônomo.
            </span>
          </div>

          {/* Filtros de Prioridade */}
          <div style={{ display: "flex", gap: "8px" }}>
            {(["all", "urgent", "high", "normal"] as const).map((filter) => {
              const count =
                filter === "all"
                  ? suggestions.length
                  : suggestions.filter((s) => s.priority === filter).length;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setRadarFilter(filter)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "0.75rem",
                    fontWeight: radarFilter === filter ? 600 : 400,
                    backgroundColor: radarFilter === filter ? "#4F46E5" : "var(--bg-canvas, #F1F5F9)",
                    color: radarFilter === filter ? "#FFFFFF" : "var(--text-secondary, #475569)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {filter === "all"
                    ? "Todas"
                    : filter === "urgent"
                    ? "Urgentes"
                    : filter === "high"
                    ? "Altas"
                    : "Normais"}{" "}
                  ({count})
                </button>
              );
            })}
          </div>

          {/* Lista de Sugestões */}
          {suggestions
            .filter((s) => (radarFilter === "all" ? true : s.priority === radarFilter))
            .map((sug) => (
              <div
                key={sug.id}
                data-testid={`drawer-radar-suggestion-${sug.id}`}
                style={{
                  padding: "14px",
                  borderRadius: "8px",
                  border: "1px solid #E2E8F0",
                  backgroundColor: "var(--bg-surface, #FFFFFF)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          backgroundColor:
                            sug.priority === "urgent" || sug.priority === "high"
                              ? "#FEE2E2"
                              : "#E0E7FF",
                          color:
                            sug.priority === "urgent" || sug.priority === "high"
                              ? "#991B1B"
                              : "#3730A3",
                        }}
                      >
                        {sug.priority}
                      </span>
                      <span style={{ fontSize: "0.7rem", color: "#64748B" }}>
                        Fonte: <strong>{sug.source}</strong> · Tipo: {sug.suggestionType}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary, #0F172A)" }}>
                      {sug.title}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary, #475569)", lineHeight: 1.45 }}>
                  {sug.body}
                </div>

                {sug.draftMessage && (
                  <div
                    style={{
                      padding: "8px 12px",
                      backgroundColor: "#F8FAFC",
                      borderRadius: "6px",
                      border: "1px dashed #CBD5E1",
                      fontSize: "0.78rem",
                      color: "#1E293B",
                    }}
                  >
                    <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#6366F1", display: "block", marginBottom: "2px" }}>
                      Rascunho de Mensagem Sugerido:
                    </span>
                    &ldquo;{sug.draftMessage}&rdquo;
                  </div>
                )}

                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isDecidingSuggestion}
                    onClick={() => handleDecideSuggestion(sug, "dismissed")}
                  >
                    Dispensar
                  </Button>
                  {sug.threadId && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setSelectedThreadId(sug.threadId);
                        setIsRadarDrawerOpen(false);
                      }}
                    >
                      Ir para Conversa
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={isDecidingSuggestion}
                    onClick={() => {
                      handleDecideSuggestion(sug, "accepted");
                      setIsRadarDrawerOpen(false);
                    }}
                    style={{ backgroundColor: "#4F46E5", borderColor: "#4338CA" }}
                  >
                    Aceitar & Usar Rascunho ✨
                  </Button>
                </div>
              </div>
            ))}

          {suggestions.length === 0 && (
            <div style={{ padding: "40px 16px", textAlign: "center" }}>
              <EmptyState
                icon={<Sparkles size={36} color="#6366F1" />}
                title="Nenhuma Sugestão Pendente"
                description="O Radar monitora continuamente as conversas paradas. Quando o n8n ou outro motor externo detectar uma oportunidade, ela aparecerá aqui para sua validação."
              />
            </div>
          )}
        </div>
      </Drawer>
    </div>
  );
};
