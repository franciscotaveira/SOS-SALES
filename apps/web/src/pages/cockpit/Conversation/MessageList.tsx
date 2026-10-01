import { type FC, useEffect, useRef } from "react";
import { EmptyState, LoadingState } from "@sos-sales/ui";
import { MessageSquare } from "lucide-react";
import type { ThreadMessageSummary } from "../../../services/api-client";
import { MessageBubble } from "./MessageBubble";

interface MessageListProps {
  messages: ThreadMessageSummary[];
  isLoading: boolean;
}

export const MessageList: FC<MessageListProps> = ({ messages, isLoading }) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (isLoading && messages.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--bg-surface-subtle)",
        }}
      >
        <LoadingState variant="skeleton" lines={4} />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--bg-surface-subtle)",
          padding: "var(--space-6)",
        }}
      >
        <EmptyState
          icon={<MessageSquare size={48} />}
          title="Nenhuma mensagem nesta conversa"
          description="Inicie a conversa enviando uma mensagem ou selecione um modelo aprovado."
        />
      </div>
    );
  }

  return (
    <div
      role="log"
      aria-label="Mensagens da conversa"
      style={{
        flex: 1,
        overflowY: "auto",
        backgroundColor: "var(--bg-surface-subtle)",
        padding: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}
    >
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      <div ref={bottomRef} style={{ height: "1px" }} />
    </div>
  );
};
