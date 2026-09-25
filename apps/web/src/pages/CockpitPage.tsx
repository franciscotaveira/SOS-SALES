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
} from "lucide-react";

interface CockpitPageProps {
  session: UseSessionReturn;
  onOpenCatalog?: () => void;
}

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

  // Commercial outcome state (MVP sales recording)
  const [dealValue, setDealValue] = useState<string>("1500,00");
  const [outcomeStatus, setOutcomeStatus] = useState<"in_progress" | "won" | "lost">("in_progress");

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom of message list
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
        setMessages(res.messages);
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

    setIsLoadingMessages(true);
    loadMessages(selectedThreadId).finally(() => {
      setIsLoadingMessages(false);
      scrollToBottom();
    });

    // Poll messages every 3 seconds while thread is active
    const interval = setInterval(() => {
      loadMessages(selectedThreadId);
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

  // Filtered threads by search query
  const filteredThreads = threads.filter((t) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const nameMatch = t.contactName?.toLowerCase().includes(query);
    const phoneMatch = t.contactPhone.toLowerCase().includes(query);
    const bodyMatch = t.lastMessage?.body.toLowerCase().includes(query);
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
                {channels[0]?.displayName} ({channels[0]?.provider.toUpperCase()})
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
                const contactInitial = (thread.contactName || thread.contactPhone)
                  .replace(/^\+/, "")
                  .substring(0, 2)
                  .toUpperCase();

                return (
                  <div
                    key={thread.id}
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
                          {thread.lastMessage?.createdAt
                            ? new Date(thread.lastMessage.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : ""}
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
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontFamily: "var(--font-mono)",
                          color: "var(--text-muted, #94A3B8)",
                        }}
                      >
                        {selectedThread.contactPhone}
                      </span>
                      <Badge variant="action">{selectedThread.channelProvider.toUpperCase()}</Badge>
                    </div>
                  </div>
                </div>

                {/* Ações de Estado da Conversa */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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
                              {new Date(msg.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
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
                <div ref={messagesEndRef} />
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
                <form
                  onSubmit={handleSendMessage}
                  style={{ display: "flex", gap: "10px", alignItems: "center" }}
                >
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder={`Responder para ${selectedThread.contactName || selectedThread.contactPhone}...`}
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
                      onClick={() => setOutcomeStatus("won")}
                    >
                      <DollarSign size={14} />
                      Venda Ganha
                    </Button>
                    <Button
                      size="sm"
                      variant={outcomeStatus === "lost" ? "danger" : "outline"}
                      style={{ flex: 1 }}
                      onClick={() => setOutcomeStatus("lost")}
                    >
                      Perdido
                    </Button>
                  </div>

                  {outcomeStatus === "won" && (
                    <div
                      style={{
                        padding: "10px",
                        borderRadius: "6px",
                        backgroundColor: "var(--color-action-subtle, #E6F7F3)",
                        border: "1px solid var(--color-action-border, #A7F3D0)",
                        fontSize: "0.78rem",
                        color: "var(--color-action, #00A884)",
                        fontWeight: 600,
                      }}
                    >
                      ✓ Outcome registrado: R$ {dealValue} pronto para despacho CAPI Meta.
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
                    <strong>{activeWorkspaceDetails.workspace.name}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted, #94A3B8)" }}>Papel:</span>
                    <Badge variant="operational">{activeWorkspaceDetails.userRole}</Badge>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted, #94A3B8)" }}>Fuso:</span>
                    <span>{activeWorkspaceDetails.workspace.timezone}</span>
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
                {activeWorkspaceDetails.workspace.id}
              </div>
            </div>
            <div>
              <strong>Papel:</strong> {activeWorkspaceDetails.userRole}
            </div>
            <div>
              <strong>Permissões:</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                {activeWorkspaceDetails.permissions.map((p) => (
                  <Badge key={p} variant="operational">{p}</Badge>
                ))}
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
