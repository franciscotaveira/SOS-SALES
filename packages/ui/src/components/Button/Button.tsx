import { forwardRef, type CSSProperties } from "react";
import type { ButtonProps } from "./Button.types";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled = false,
      prefixIcon,
      suffixIcon,
      children,
      className = "",
      style,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    // Size-based padding and font sizes (accessible touch targets)
    const sizeStyles: Record<string, CSSProperties> = {
      sm: { padding: "6px 12px", fontSize: "0.75rem", minHeight: "36px", minWidth: "36px", gap: "6px" },
      md: { padding: "8px 16px", fontSize: "0.875rem", minHeight: "44px", minWidth: "44px", gap: "8px" },
      lg: { padding: "12px 24px", fontSize: "1rem", minHeight: "48px", minWidth: "48px", gap: "10px" },
    };

    // Variant-based color styles
    const variantStyles: Record<string, CSSProperties> = {
      primary: {
        backgroundColor: "var(--color-action, #008069)",
        color: "#FFFFFF",
        border: "1px solid transparent",
      },
      secondary: {
        backgroundColor: "var(--bg-surface-elevated, #F1F5F9)",
        color: "var(--text-primary, #0F172A)",
        border: "1px solid var(--border-default, #E2E8F0)",
      },
      outline: {
        backgroundColor: "transparent",
        color: "var(--text-primary, #0F172A)",
        border: "1px solid var(--border-strong, #CBD5E1)",
      },
      ghost: {
        backgroundColor: "transparent",
        color: "var(--text-secondary, #475569)",
        border: "1px solid transparent",
      },
      danger: {
        backgroundColor: "var(--color-danger, #DC2626)",
        color: "#FFFFFF",
        border: "1px solid transparent",
      },
    };

    const baseStyle: CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 600,
      fontFamily: "var(--font-sans, sans-serif)",
      borderRadius: "var(--radius-md, 8px)",
      cursor: isDisabled ? "not-allowed" : "pointer",
      opacity: isDisabled ? 0.65 : 1,
      transition: "background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease",
      lineHeight: 1,
      textDecoration: "none",
      boxSizing: "border-box",
      ...sizeStyles[size],
      ...variantStyles[variant],
      ...style,
    };

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading}
        className={`sos-button sos-button-${variant} sos-button-${size} ${className}`}
        style={baseStyle}
        {...props}
      >
        {loading ? (
          <span
            style={{
              width: "14px",
              height: "14px",
              border: "2px solid currentColor",
              borderRightColor: "transparent",
              borderRadius: "50%",
              display: "inline-block",
              animation: "spin 0.6s linear infinite",
            }}
            aria-hidden="true"
          />
        ) : (
          prefixIcon && <span style={{ display: "inline-flex", alignItems: "center" }}>{prefixIcon}</span>
        )}
        <span>{children}</span>
        {!loading && suffixIcon && (
          <span style={{ display: "inline-flex", alignItems: "center" }}>{suffixIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
