import { useState, useMemo, type FC } from "react";
import { Check, CheckCheck, Clock, AlertCircle, FileText, Download, Mic, ExternalLink } from "lucide-react";
import type { ThreadMessageSummary } from "../../../services/api-client";
import { formatTime } from "../utils/formatTime";
import { renderWhatsappMarkdown } from "../utils/whatsappMarkdown";

interface MessageBubbleProps {
  message: ThreadMessageSummary;
}

export const MessageBubble: FC<MessageBubbleProps> = ({ message }) => {
  const isOutbound = message.direction === "outbound";
  const formattedTime = formatTime(message.createdAt);
  const [imgError, setImgError] = useState(false);

  // Extract mediaUrl from message or metadata fallback
  const resolvedMedia = useMemo(() => {
    let url = message.mediaUrl || "";
    let mime = "";
    let filename = "";

    const meta = message.metadata as Record<string, unknown> | undefined;
    if (meta) {
      if (!url) {
        if (typeof meta.media_payload === "string") {
          try {
            const parsed = JSON.parse(meta.media_payload);
            url = parsed.url || "";
            mime = parsed.mimetype || "";
          } catch {}
        } else if (typeof meta.media_payload === "object" && meta.media_payload !== null) {
          const mp = meta.media_payload as Record<string, string>;
          url = mp.url || "";
          mime = mp.mimetype || "";
        } else if (typeof meta.mediaUrl === "string") {
          url = meta.mediaUrl;
        } else if (typeof meta.url === "string") {
          url = meta.url;
        }
      }

      if (!mime) {
        mime = String(meta.mimeType || meta.mimetype || "").toLowerCase();
      }
      if (typeof meta.filename === "string") {
        filename = meta.filename;
      }
    }

    if (url && url.startsWith("/")) {
      url = `${window.location.origin}${url}`;
    }

    // Determine media type
    let type: "text" | "image" | "audio" | "video" | "document" =
      message.contentType === "image" ||
      message.contentType === "audio" ||
      message.contentType === "video" ||
      message.contentType === "document"
        ? message.contentType
        : "text";

    if (mime.startsWith("audio/") || url.match(/\.(ogg|mp3|m4a|wav|aac)($|\?)/i)) {
      type = "audio";
    } else if (mime.startsWith("video/") || url.match(/\.(mp4|webm|mov|3gp)($|\?)/i)) {
      type = "video";
    } else if (mime.startsWith("image/") || url.match(/\.(jpeg|jpg|png|webp|gif)($|\?)/i)) {
      type = "image";
    } else if (
      mime.includes("pdf") ||
      mime.includes("document") ||
      mime.includes("sheet") ||
      mime.includes("msword") ||
      url.match(/\.(pdf|docx?|xlsx?|txt|zip)($|\?)/i)
    ) {
      type = "document";
    } else if (url && type === "text") {
      type = "image";
    }

    return { url, type, filename, mime };
  }, [message.mediaUrl, message.contentType, message.metadata]);

  // Strip placeholder text when media is present
  const isPlaceholderBody = useMemo(() => {
    if (!message.body) return true;
    const trimmed = message.body.trim();
    return (
      trimmed === "📎 [OTHER]" ||
      trimmed === "📎 [MÍDIA]" ||
      trimmed === "[OTHER]" ||
      trimmed === "[MÍDIA]" ||
      trimmed === "Anexo" ||
      trimmed === "📎"
    );
  }, [message.body]);

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

  const renderMediaContent = () => {
    if (!resolvedMedia.url) return null;

    if (resolvedMedia.type === "audio") {
      return (
        <div style={{ marginBottom: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
            <Mic size={14} style={{ color: "var(--color-action)" }} />
            <span>Mensagem de Áudio</span>
          </div>
          <audio
            controls
            src={resolvedMedia.url}
            style={{ width: "100%", maxWidth: "280px", height: "36px" }}
            preload="metadata"
          />
        </div>
      );
    }

    if (resolvedMedia.type === "video") {
      return (
        <div style={{ marginBottom: "6px" }}>
          <video
            controls
            src={resolvedMedia.url}
            style={{
              maxWidth: "100%",
              maxHeight: "300px",
              borderRadius: "var(--radius-md, 8px)",
              display: "block",
            }}
          />
        </div>
      );
    }

    if (resolvedMedia.type === "document") {
      return (
        <div style={{ marginBottom: "6px" }}>
          <a
            href={resolvedMedia.url}
            target="_blank"
            rel="noreferrer"
            download={resolvedMedia.filename || "documento"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "8px 12px",
              backgroundColor: "rgba(0, 0, 0, 0.04)",
              borderRadius: "var(--radius-md, 8px)",
              border: "1px solid var(--border-default)",
              textDecoration: "none",
              color: "inherit",
              maxWidth: "280px",
            }}
          >
            <FileText size={24} style={{ color: "var(--color-action)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <div
                style={{
                  fontSize: "var(--font-size-xs)",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {resolvedMedia.filename || "Documento anexado"}
              </div>
              <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>
                Clique para baixar
              </span>
            </div>
            <Download size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          </a>
        </div>
      );
    }

    // Default to Image
    if (!imgError) {
      return (
        <div style={{ marginBottom: "6px" }}>
          <img
            src={resolvedMedia.url}
            alt="Foto recebida"
            onError={() => setImgError(true)}
            onClick={() => window.open(resolvedMedia.url, "_blank")}
            style={{
              maxWidth: "100%",
              maxHeight: "300px",
              borderRadius: "var(--radius-md, 8px)",
              objectFit: "cover",
              display: "block",
              cursor: "pointer",
            }}
          />
        </div>
      );
    }

    return (
      <div
        style={{
          marginBottom: "6px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 10px",
          backgroundColor: "rgba(0, 0, 0, 0.03)",
          borderRadius: "6px",
          fontSize: "var(--font-size-xs)",
        }}
      >
        <ExternalLink size={14} />
        <a href={resolvedMedia.url} target="_blank" rel="noreferrer" style={{ color: "var(--color-action)" }}>
          Abrir anexo de mídia
        </a>
      </div>
    );
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
        {renderMediaContent()}

        {(!isPlaceholderBody || !resolvedMedia.url) && (
          <div
            style={{
              fontSize: "var(--font-size-base, 1rem)",
              lineHeight: "var(--line-height-normal, 1.5)",
              color: "var(--text-primary)",
              whiteSpace: "pre-wrap",
            }}
          >
            {message.body ? renderWhatsappMarkdown(message.body) : (!resolvedMedia.url ? "Mensagem sem conteúdo textual" : null)}
          </div>
        )}

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
