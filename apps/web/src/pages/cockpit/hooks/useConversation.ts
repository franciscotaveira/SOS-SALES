import { useState, useEffect, useRef, useCallback } from "react";
import { apiClient, type CommercialThreadSummary, type ThreadMessageSummary } from "../../../services/api-client";
import type { UseSessionReturn } from "../../../hooks/useSession";

export interface WindowInfo {
  isOpen: boolean;
  hoursRemaining: number;
  badgeText: string;
  badgeVariant: "action" | "danger";
}

export const useConversation = (
  selectedThreadId: string | null,
  session: UseSessionReturn,
  threads: CommercialThreadSummary[],
  onThreadUpdated?: () => void
) => {
  const { token, activeWorkspace } = session;

  const [messages, setMessages] = useState<ThreadMessageSummary[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isSendingMessage, setIsSendingMessage] = useState<boolean>(false);
  const [messageInput, setMessageInput] = useState<string>("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const draftsByThreadRef = useRef<Record<string, string>>({});
  const activeThreadIdRef = useRef<string | null>(null);

  const selectedThread = threads.find((t) => t.id === selectedThreadId) || null;

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
            // Ignore storage quota
          }
        }
      }
    },
    [selectedThreadId, activeWorkspace?.id, getDraftKey]
  );

  // Restore draft when switching thread
  useEffect(() => {
    activeThreadIdRef.current = selectedThreadId;
    setAttachedFile(null);
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
    setSendError(null);
  }, [selectedThreadId, activeWorkspace?.id, getDraftKey]);

  // Load and poll messages
  const loadMessages = useCallback(
    async (threadId: string) => {
      if (!activeWorkspace?.id || !token) return;

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
        // Polling non-fatal
      }
    },
    [activeWorkspace?.id, token]
  );

  useEffect(() => {
    if (!selectedThreadId || !activeWorkspace?.id || !token) {
      setMessages([]);
      return;
    }

    setMessages([]);
    setIsLoadingMessages(true);
    const currentThreadId = selectedThreadId;

    loadMessages(currentThreadId).finally(() => {
      if (activeThreadIdRef.current === currentThreadId) {
        setIsLoadingMessages(false);
      }
    });

    const interval = setInterval(() => {
      if (activeThreadIdRef.current === currentThreadId) {
        loadMessages(currentThreadId);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedThreadId, loadMessages, activeWorkspace?.id, token]);

  // Compute 24h window
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

  // Send message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = messageInput.trim();
    if ((!trimmed && !attachedFile) || !selectedThread || !activeWorkspace?.id || !token || isSendingMessage) {
      return;
    }

    setIsSendingMessage(true);
    setSendError(null);
    const fileToSend = attachedFile;

    try {
      let mediaUrl: string | undefined;
      let contentType: "text" | "image" | "audio" | "video" | "document" = "text";

      if (fileToSend) {
        const uploadRes = await apiClient.uploadMedia(activeWorkspace.id, fileToSend, { token });
        mediaUrl = uploadRes.mediaUrl;
        contentType = uploadRes.category;
      }

      const optimisticMessage: ThreadMessageSummary = {
        id: `opt-${Date.now()}`,
        workspaceId: activeWorkspace.id,
        channelInstanceId: selectedThread.channelInstanceId,
        threadId: selectedThread.id,
        provider: selectedThread.channelProvider,
        direction: "outbound",
        senderE164: selectedThread.contactPhone,
        recipientE164: selectedThread.contactPhone,
        contentType,
        body: trimmed || (fileToSend ? fileToSend.name : ""),
        mediaUrl: mediaUrl || null,
        providerMessageId: null,
        deliveryStatus: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticMessage]);
      setMessageInput("");
      setAttachedFile(null);
      if (selectedThread.id) {
        delete draftsByThreadRef.current[selectedThread.id];
        if (activeWorkspace.id) {
          try {
            sessionStorage.removeItem(getDraftKey(activeWorkspace.id, selectedThread.id));
          } catch {}
        }
      }

      await apiClient.sendOutboundMessage(
        activeWorkspace.id,
        selectedThread.channelInstanceId,
        {
          recipientPhoneE164: selectedThread.contactPhone,
          contentType,
          body: trimmed || (fileToSend ? fileToSend.name : "Anexo"),
          mediaUrl,
        },
        { token }
      );
      if (onThreadUpdated) onThreadUpdated();
      await loadMessages(selectedThread.id);
    } catch (err: unknown) {
      setSendError((err as Error).message || "Falha ao enviar mensagem");
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Update thread status (human escalation or close)
  const handleUpdateStatus = async (newStatus: "waiting_human" | "closed" | "active") => {
    if (!selectedThread || !activeWorkspace?.id || !token) return;
    try {
      await apiClient.updateThreadStatus(activeWorkspace.id, selectedThread.id, newStatus, { token });
      if (onThreadUpdated) onThreadUpdated();
    } catch (err: unknown) {
      setSendError((err as Error).message || "Falha ao atualizar status da conversa");
    }
  };

  return {
    selectedThread,
    messages,
    isLoadingMessages,
    messageInput,
    attachedFile,
    setAttachedFile,
    handleMessageInputChange,
    handleSendMessage,
    isSendingMessage,
    sendError,
    windowInfo,
    handleUpdateStatus,
    refreshMessages: () => selectedThreadId ? loadMessages(selectedThreadId) : Promise.resolve(),
  };
};
