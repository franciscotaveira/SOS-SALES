import { forwardRef, type CSSProperties } from "react";
import type { ButtonProps } from "./Button.types";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "sm",
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

    // Fixed control heights and padding according to visual system scale
    const sizeStyles: Record<string, CSSProperties> = {
      xs: {
        height: "var(--control-h-xs, 28px)",
        padding: "0 8px",
        fontSize: "var(--font-size-xs, 0.75rem)",
        gap: "4px",
      },
      sm: {
        height: "var(--control-h-sm, 32px)",
        padding: "0 12px",
        fontSize: "var(--font-size-sm, 0.875rem)",
        gap: "6px",
      },
      md: {
        height: "var(--control-h-md, 40px)",
        padding: "0 16px",
        fontSize: "var(--font-size-sm, 0.875rem)",
        gap: "8px",
      },
      lg: {
        height: "var(--control-h-lg, 44px)",
        padding: "0 20px",
        fontSize: "var(--font-size-sm, 0.875rem)",
        gap: "8px",
      },
    };

    // Variant-based color styles conforming to tokens
    const variantStyles: Record<string, CSSProperties> = {
      primary: {
        backgroundColor: "var(--color-action, #008069)",
        color: "var(--text-inverse, #FFFFFF)",
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
        color: "var(--text-inverse, #FFFFFF)",
        border: "1px solid transparent",
      },
    };

    const baseStyle: CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 500,
      fontFamily: "var(--font-sans, sans-serif)",
      borderRadius: "var(--radius-md, 8px)",
      cursor: isDisabled ? "not-allowed" : "pointer",
      opacity: isDisabled ? 0.65 : 1,
      transition: "background-color var(--transition-fast, 150ms ease), border-color var(--transition-fast, 150ms ease), opacity var(--transition-fast, 150ms ease)",
      lineHeight: 1,
      textDecoration: "none",
      boxSizing: "border-box",
      whiteSpace: "nowrap",
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
              flexShrink: 0,
            }}
            aria-hidden="true"
          />
        ) : (
          prefixIcon && (
            <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
              {prefixIcon}
            </span>
          )
        )}
        {children && <span>{children}</span>}
        {!loading && suffixIcon && (
          <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
            {suffixIcon}
          </span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
