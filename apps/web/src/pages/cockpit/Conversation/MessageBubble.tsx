import type { FC } from "react";
import { Check, CheckCheck, Clock, AlertCircle } from "lucide-react";
import type { ThreadMessageSummary } from "../../../services/api-client";
import { formatTime } from "../utils/formatTime";
import { renderWhatsappMarkdown } from "../utils/whatsappMarkdown";

interface MessageBubbleProps {
  message: ThreadMessageSummary;
}

export const MessageBubble: FC<MessageBubbleProps> = ({ message }) => {
  const isOutbound = message.direction === "outbound";
  const formattedTime = formatTime(message.createdAt);

  const renderStatus = () => {
    if (!isOutbound) return null;
    switch (message.deliveryStatus) {
      case "read":
        return <span title="Lida"><CheckCheck size={14} style={{ color: "var(--color-action)" }} /></span>;
      case "delivered":
        return <span title="Entregue"><CheckCheck size={14} style={{ color: "var(--text-muted)" }} /></span>;
      case "sent":
        return <span title="Enviada"><Check size={14} style={{ color: "var(--text-muted)" }} /></span>;
      case "failed":
        return <span title="Falha no envio"><AlertCircle size={14} style={{ color: "var(--color-danger)" }} /></span>;
      case "queued":
      default:
        return <span title="Na fila"><Clock size={12} style={{ color: "var(--text-muted)" }} /></span>;
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isOutbound ? "flex-end" : "flex-start",
        marginBottom: "8px",
        width: "100%",
      }}
    >
      <div
        style={{
          maxWidth: "min(640px, 85%)",
          backgroundColor: isOutbound
            ? "var(--color-action-subtle)"
            : "var(--bg-surface)",
          border: isOutbound
            ? "1px solid rgba(0, 128, 105, 0.15)"
            : "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg, 12px)",
          borderBottomRightRadius: isOutbound ? "var(--radius-xs, 4px)" : "var(--radius-lg, 12px)",
          borderBottomLeftRadius: !isOutbound ? "var(--radius-xs, 4px)" : "var(--radius-lg, 12px)",
          padding: "var(--space-2, 8px) var(--space-3, 12px)",
          boxShadow: "var(--shadow-xs, 0 1px 2px rgba(0, 0, 0, 0.05))",
          wordBreak: "break-word",
          position: "relative",
        }}
      >
        {message.mediaUrl && (
          <div style={{ marginBottom: "6px" }}>
            <img
              src={message.mediaUrl}
              alt="Anexo de mídia"
              style={{
                maxWidth: "100%",
                maxHeight: "300px",
                borderRadius: "var(--radius-md, 8px)",
                objectFit: "cover",
                display: "block",
              }}
            />
          </div>
        )}

        <div
          style={{
            fontSize: "var(--font-size-base, 1rem)",
            lineHeight: "var(--line-height-normal, 1.5)",
            color: "var(--text-primary)",
            whiteSpace: "pre-wrap",
          }}
        >
          {message.body ? renderWhatsappMarkdown(message.body) : "Mensagem sem conteúdo textual"}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "4px",
            marginTop: "4px",
            fontSize: "var(--font-size-xs)",
            color: "var(--text-secondary)",
          }}
        >
          <span>{formattedTime}</span>
          {renderStatus()}
        </div>
      </div>
    </div>
  );
};
