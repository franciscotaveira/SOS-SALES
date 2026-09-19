import type { FC } from "react";
import { Inbox } from "lucide-react";
import type { EmptyStateProps } from "./EmptyState.types";

export const EmptyState: FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = "",
  style,
}) => {
  return (
    <div
      className={`sos-empty-state ${className}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "48px 24px",
        backgroundColor: "var(--bg-surface, #FFFFFF)",
        borderRadius: "var(--radius-lg, 12px)",
        border: "1px dashed var(--border-strong, #CBD5E1)",
        fontFamily: "var(--font-sans, sans-serif)",
        ...style,
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "var(--radius-full, 9999px)",
          backgroundColor: "var(--bg-surface-elevated, #F1F5F9)",
          color: "var(--text-muted, #64748B)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "16px",
        }}
        aria-hidden="true"
      >
        {icon || <Inbox size={24} />}
      </div>

      <h3
        style={{
          fontSize: "1.125rem",
          fontWeight: 600,
          color: "var(--text-primary, #0F172A)",
          margin: "0 0 8px 0",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
          maxWidth: "100%",
        }}
      >
        {title}
      </h3>

      <p
        style={{
          fontSize: "0.875rem",
          color: "var(--text-secondary, #475569)",
          maxWidth: "420px",
          lineHeight: 1.5,
          margin: "0 0 20px 0",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {description}
      </p>

      {action && <div>{action}</div>}
    </div>
  );
};
