import type { FC } from "react";
import type { LoadingStateProps } from "./LoadingState.types";

export const LoadingState: FC<LoadingStateProps> = ({
  variant = "skeleton",
  lines = 3,
  height = "16px",
  text = "Carregando informações...",
  className = "",
  style,
}) => {
  if (variant === "spinner") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`sos-loading-spinner-wrapper ${className}`}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px",
          gap: "12px",
          color: "var(--text-secondary, #475569)",
          fontFamily: "var(--font-sans, sans-serif)",
          ...style,
        }}
      >
        <span
          style={{
            width: "28px",
            height: "28px",
            border: "3px solid var(--border-strong, #CBD5E1)",
            borderRightColor: "var(--color-action, #00A884)",
            borderRadius: "50%",
            display: "inline-block",
            animation: "spin 0.6s linear infinite",
          }}
          aria-hidden="true"
        />
        <span style={{ fontSize: "0.875rem" }}>{text}</span>
      </div>
    );
  }

  if (variant === "card-skeleton") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`sos-card-skeleton ${className}`}
        style={{
          padding: "20px",
          backgroundColor: "var(--bg-surface, #FFFFFF)",
          borderRadius: "var(--radius-lg, 12px)",
          border: "1px solid var(--border-default, #E2E8F0)",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          ...style,
        }}
      >
        <div
          className="animate-pulse"
          style={{
            height: "20px",
            width: "40%",
            borderRadius: "var(--radius-sm, 6px)",
            backgroundColor: "var(--bg-surface-elevated, #F1F5F9)",
          }}
        />
        <div
          className="animate-pulse"
          style={{
            height: "14px",
            width: "80%",
            borderRadius: "var(--radius-sm, 6px)",
            backgroundColor: "var(--bg-surface-elevated, #F1F5F9)",
          }}
        />
        <div
          className="animate-pulse"
          style={{
            height: "14px",
            width: "60%",
            borderRadius: "var(--radius-sm, 6px)",
            backgroundColor: "var(--bg-surface-elevated, #F1F5F9)",
          }}
        />
      </div>
    );
  }

  // Default: multi-line text skeleton
  return (
    <div
      role="status"
      aria-live="polite"
      className={`sos-loading-skeleton-lines ${className}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        width: "100%",
        ...style,
      }}
    >
      {Array.from({ length: lines }).map((_, idx) => (
        <div
          key={idx}
          className="animate-pulse"
          style={{
            height: typeof height === "number" ? `${height}px` : height,
            width: idx === lines - 1 ? "60%" : "100%",
            borderRadius: "var(--radius-sm, 6px)",
            backgroundColor: "var(--bg-surface-elevated, #F1F5F9)",
          }}
        />
      ))}
    </div>
  );
};
