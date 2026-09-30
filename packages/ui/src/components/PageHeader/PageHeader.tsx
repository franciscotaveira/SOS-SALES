import type { FC } from "react";
import type { PageHeaderProps } from "./PageHeader.types";
import { useBreakpoint } from "../../hooks/useBreakpoint";

export const PageHeader: FC<PageHeaderProps> = ({
  title,
  description,
  badge,
  actions,
  className = "",
  style,
}) => {
  const { isMobile } = useBreakpoint();

  return (
    <div
      className={`sos-page-header ${className}`}
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "flex-start" : "center",
        justifyContent: "space-between",
        gap: "var(--space-4, 16px)",
        paddingBottom: "var(--space-6, 24px)",
        borderBottom: "1px solid var(--border-default, #E2E8F0)",
        marginBottom: "var(--space-6, 24px)",
        boxSizing: "border-box",
        width: "100%",
        ...style,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "var(--font-size-xl, 1.25rem)",
              fontWeight: 600,
              color: "var(--text-primary, #0F172A)",
              letterSpacing: "-0.02em",
              lineHeight: "var(--line-height-tight, 1.25)",
            }}
          >
            {title}
          </h1>
          {badge}
        </div>

        {description && (
          <p
            style={{
              margin: 0,
              fontSize: "var(--font-size-sm, 0.875rem)",
              color: "var(--text-secondary, #475569)",
              lineHeight: "var(--line-height-normal, 1.5)",
            }}
          >
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
            width: isMobile ? "100%" : "auto",
          }}
        >
          {actions}
        </div>
      )}
    </div>
  );
};
