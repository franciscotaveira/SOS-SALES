import type { FC } from "react";
import { Avatar, ListItem } from "@sos-sales/ui";
import type { CommercialThreadSummary } from "../../../services/api-client";
import { formatTime } from "../utils/formatTime";
import { formatPhone } from "../utils/formatPhone";
import { renderWhatsappMarkdown } from "../utils/whatsappMarkdown";

interface ConversationRowProps {
  thread: CommercialThreadSummary;
  selected: boolean;
  onSelect: (threadId: string) => void;
}

export const ConversationRow: FC<ConversationRowProps> = ({
  thread,
  selected,
  onSelect,
}) => {
  const hasName = Boolean(thread.contactName && thread.contactName.trim());
  const displayName = hasName
    ? thread.contactName
    : formatPhone(thread.contactPhone) || "Contato sem nome";

  const rawSnippet = thread.lastMessage?.body || "Sem mensagens";
  const formattedTime = formatTime(thread.lastMessageAt || thread.updatedAt);
  const isUnread = thread.status === "waiting_human" || thread.lastMessage?.direction === "inbound";

  return (
    <ListItem
      height="lg"
      selected={selected}
      onClick={() => onSelect(thread.id)}
      leading={
        <Avatar
          id={thread.id}
          name={hasName && thread.contactName ? thread.contactName : undefined}
          size="lg"
        />
      }
      title={
        <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 500 }}>
          {displayName}
        </span>
      }
      subtitle={
        <span
          style={{
            fontSize: "var(--font-size-sm)",
            color: "var(--text-secondary)",
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {renderWhatsappMarkdown(rawSnippet)}
        </span>
      }
      meta={formattedTime}
      trailing={
        isUnread ? (
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: "var(--color-action)",
              display: "inline-block",
            }}
            aria-label="Aguardando atendimento"
          />
        ) : undefined
      }
    />
  );
};
