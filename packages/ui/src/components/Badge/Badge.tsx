import type { FC } from "react";
import type { BadgeProps, BadgeVariant } from "./Badge.types";

export const Badge: FC<BadgeProps> = ({
  variant = "neutral",
  pulseDot = false,
  icon,
  children,
  className = "",
  style,
  ...props
}) => {
  const variantStyles: Record<
    BadgeVariant,
    { bg: string; color: string; border: string; dot: string }
  > = {
    action: {
      bg: "var(--color-action-subtle, #E6F4F1)",
      color: "var(--color-action, #008069)",
      border: "var(--color-action-border, #80C0B4)",
      dot: "var(--color-action, #008069)",
    },
    operational: {
      bg: "var(--color-operational-subtle, #EFF6FF)",
      color: "var(--color-operational, #2563EB)",
      border: "var(--color-operational-border, #BFDBFE)",
      dot: "var(--color-operational, #2563EB)",
    },
    ai: {
      bg: "var(--color-ai-subtle, #F5F3FF)",
      color: "var(--color-ai, #7C3AED)",
      border: "var(--color-ai-border, #DDD6FE)",
      dot: "var(--color-ai, #7C3AED)",
    },
    warning: {
      bg: "var(--color-warning-subtle, #FFFBEB)",
      color: "var(--color-warning, #D97706)",
      border: "var(--color-warning-border, #FDE68A)",
      dot: "var(--color-warning, #D97706)",
    },
    danger: {
      bg: "var(--color-danger-subtle, #FEF2F2)",
      color: "var(--color-danger, #DC2626)",
      border: "var(--color-danger-border, #FECACA)",
      dot: "var(--color-danger, #DC2626)",
    },
    neutral: {
      bg: "var(--bg-surface-elevated, #F1F5F9)",
      color: "var(--text-secondary, #475569)",
      border: "var(--border-default, #E2E8F0)",
      dot: "var(--text-muted, #64748B)",
    },
  };

  const current = variantStyles[variant];

  return (
    <span
      className={`sos-badge sos-badge-${variant} ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: "20px",
        boxSizing: "border-box",
        gap: "4px",
        padding: "0 8px",
        borderRadius: "var(--radius-full, 9999px)",
        fontSize: "var(--font-size-xs, 0.75rem)",
        fontWeight: 500,
        lineHeight: 1,
        backgroundColor: current.bg,
        color: current.color,
        border: `1px solid ${current.border}`,
        fontFamily: "var(--font-sans, sans-serif)",
        whiteSpace: "nowrap",
        ...style,
      }}
      {...props}
    >
      {pulseDot && (
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: current.dot,
            display: "inline-block",
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
      )}
      {icon && <span style={{ display: "inline-flex", alignItems: "center" }}>{icon}</span>}
      <span>{children}</span>
    </span>
  );
};
