import type { FC, ReactNode } from "react";
import { Info, CheckCircle2, AlertTriangle, XCircle, X } from "lucide-react";
import type { AlertProps, AlertVariant } from "./Alert.types";

export const Alert: FC<AlertProps> = ({
  variant = "info",
  title,
  action,
  onClose,
  children,
  className = "",
  style,
  ...props
}) => {
  const variantConfig: Record<
    AlertVariant,
    { bg: string; border: string; text: string; icon: ReactNode }
  > = {
    info: {
      bg: "var(--color-operational-subtle, #EFF6FF)",
      border: "var(--color-operational-border, #BFDBFE)",
      text: "var(--color-operational, #2563EB)",
      icon: <Info size={18} aria-hidden="true" />,
    },
    success: {
      bg: "var(--color-action-subtle, #E6F7F3)",
      border: "var(--color-action-border, #99E2D2)",
      text: "var(--color-action, #008069)",
      icon: <CheckCircle2 size={18} aria-hidden="true" />,
    },
    warning: {
      bg: "var(--color-warning-subtle, #FFFBEB)",
      border: "var(--color-warning-border, #FDE68A)",
      text: "var(--color-warning, #D97706)",
      icon: <AlertTriangle size={18} aria-hidden="true" />,
    },
    danger: {
      bg: "var(--color-danger-subtle, #FEF2F2)",
      border: "var(--color-danger-border, #FECACA)",
      text: "var(--color-danger, #DC2626)",
      icon: <XCircle size={18} aria-hidden="true" />,
    },
  };

  const current = variantConfig[variant];
  const role = variant === "danger" || variant === "warning" ? "alert" : "status";

  return (
    <div
      role={role}
      className={`sos-alert sos-alert-${variant} ${className}`}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        padding: "12px 16px",
        borderRadius: "var(--radius-md, 8px)",
        backgroundColor: current.bg,
        border: `1px solid ${current.border}`,
        color: "var(--text-primary, #0F172A)",
        fontSize: "0.875rem",
        lineHeight: 1.5,
        fontFamily: "var(--font-sans, sans-serif)",
        ...style,
      }}
      {...props}
    >
      <span style={{ color: current.text, flexShrink: 0, marginTop: "2px" }}>
        {current.icon}
      </span>

      <div style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" }}>
        {title && (
          <h4
            style={{
              margin: "0 0 4px 0",
              fontWeight: 600,
              fontSize: "0.875rem",
              color: "var(--text-primary, #0F172A)",
              overflowWrap: "anywhere",
              wordBreak: "break-word",
            }}
          >
            {title}
          </h4>
        )}
        <div style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>{children}</div>
        {action && <div style={{ marginTop: "8px" }}>{action}</div>}
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar alerta"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted, #64748B)",
            padding: "2px",
            display: "inline-flex",
            borderRadius: "var(--radius-sm, 6px)",
            flexShrink: 0,
          }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
