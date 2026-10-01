import type { FC } from "react";
import { Avatar, IconButton } from "@sos-sales/ui";
import { ArrowLeft, RefreshCw, Sparkles, FileText, Info } from "lucide-react";
import type { CommercialThreadSummary } from "../../../services/api-client";
import { formatPhone } from "../utils/formatPhone";

interface ConversationHeaderProps {
  thread: CommercialThreadSummary;
  onBack?: () => void;
  isMobile?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onOpenRadar?: () => void;
  onOpenDossier?: () => void;
  onToggleContext?: () => void;
  isContextOpen?: boolean;
}

export const ConversationHeader: FC<ConversationHeaderProps> = ({
  thread,
  onBack,
  isMobile = false,
  onRefresh,
  isRefreshing = false,
  onOpenRadar,
  onOpenDossier,
  onToggleContext,
  isContextOpen = true,
}) => {
  const hasName = Boolean(thread.contactName && thread.contactName.trim());
  const displayName = hasName
    ? thread.contactName
    : formatPhone(thread.contactPhone) || "Contato sem nome";
  const formattedPhone = formatPhone(thread.contactPhone);
  const origin = thread.channelProvider ? ` · ${thread.channelProvider}` : "";

  return (
    <header
      style={{
        height: "var(--topbar-h, 56px)",
        minHeight: "var(--topbar-h, 56px)",
        backgroundColor: "var(--bg-surface-elevated)",
        borderBottom: "2px solid var(--border-strong)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 var(--space-4, 16px)",
        boxSizing: "border-box",
        gap: "12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
        {isMobile && onBack && (
          <IconButton
            aria-label="Voltar para a fila"
            icon={<ArrowLeft size={18} />}
            size="sm"
            variant="ghost"
            onClick={onBack}
          />
        )}
        <Avatar
          id={thread.id}
          name={hasName && thread.contactName ? thread.contactName : undefined}
          size="md"
        />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: "var(--font-size-sm, 0.875rem)",
              fontWeight: 500,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName}
          </div>
          <div
            style={{
              fontSize: "var(--font-size-xs, 0.75rem)",
              color: "var(--text-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {hasName ? `${formattedPhone}${origin}` : origin.replace(" · ", "") || "WhatsApp"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {onRefresh && (
          <IconButton
            aria-label="Atualizar mensagens"
            icon={<RefreshCw size={16} className={isRefreshing ? "animate-spin" : undefined} />}
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            tooltip="Atualizar conversa"
            disabled={isRefreshing}
          />
        )}
        {onOpenRadar && (
          <IconButton
            aria-label="Abrir Radar de Oportunidades"
            icon={<Sparkles size={16} />}
            size="sm"
            variant="ghost"
            onClick={onOpenRadar}
            tooltip="Radar de Oportunidades"
          />
        )}
        {onOpenDossier && !isMobile && (
          <IconButton
            aria-label="Abrir Dossiê"
            icon={<FileText size={16} />}
            size="sm"
            variant="ghost"
            onClick={onOpenDossier}
            tooltip="Dossiê do Workspace"
          />
        )}
        {onToggleContext && (
          <IconButton
            aria-label={isContextOpen ? "Ocultar contexto do lead" : "Exibir contexto do lead"}
            icon={<Info size={16} />}
            size="sm"
            variant={isContextOpen ? "secondary" : "ghost"}
            onClick={onToggleContext}
            tooltip="Contexto do Lead"
          />
        )}
      </div>
    </header>
  );
};
