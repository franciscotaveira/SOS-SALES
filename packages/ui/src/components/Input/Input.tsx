import { forwardRef, useId } from "react";
import type { InputProps } from "./Input.types";

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      prefixIcon,
      suffixIcon,
      id: customId,
      disabled = false,
      required = false,
      className = "",
      style,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = customId || generatedId;
    const errorId = error ? `${inputId}-error` : undefined;
    const helperId = helperText && !error ? `${inputId}-helper` : undefined;
    const describedBy = errorId || helperId;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%" }}>
        {label && (
          <label
            htmlFor={inputId}
            style={{
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "var(--text-primary, #0F172A)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            {label}
            {required && (
              <span style={{ color: "var(--color-danger, #DC2626)" }} aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            width: "100%",
          }}
        >
          {prefixIcon && (
            <span
              style={{
                position: "absolute",
                left: "12px",
                display: "inline-flex",
                alignItems: "center",
                color: "var(--text-muted, #64748B)",
                pointerEvents: "none",
              }}
            >
              {prefixIcon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            required={required}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={describedBy}
            className={`sos-input ${error ? "sos-input-error" : ""} ${className}`}
            style={{
              width: "100%",
              // 16px font-size prevents auto-zoom on iOS Safari
              fontSize: "1rem",
              lineHeight: 1.5,
              padding: prefixIcon
                ? suffixIcon
                  ? "8px 40px 8px 40px"
                  : "8px 12px 8px 40px"
                : suffixIcon
                ? "8px 40px 8px 12px"
                : "8px 12px",
              minHeight: "42px",
              borderRadius: "var(--radius-md, 8px)",
              border: `1px solid ${
                error
                  ? "var(--color-danger, #DC2626)"
                  : "var(--border-strong, #CBD5E1)"
              }`,
              backgroundColor: disabled
                ? "var(--bg-surface-elevated, #F1F5F9)"
                : "var(--bg-surface, #FFFFFF)",
              color: "var(--text-primary, #0F172A)",
              fontFamily: "var(--font-sans, sans-serif)",
              boxSizing: "border-box",
              cursor: disabled ? "not-allowed" : "text",
              transition: "border-color 0.15s ease, box-shadow 0.15s ease",
              ...style,
            }}
            {...props}
          />

          {suffixIcon && (
            <span
              style={{
                position: "absolute",
                right: "12px",
                display: "inline-flex",
                alignItems: "center",
                color: "var(--text-muted, #64748B)",
                pointerEvents: "none",
              }}
            >
              {suffixIcon}
            </span>
          )}
        </div>

        {error && (
          <p
            id={errorId}
            role="alert"
            style={{
              fontSize: "0.75rem",
              color: "var(--color-danger, #DC2626)",
              margin: 0,
            }}
          >
            {error}
          </p>
        )}

        {helperText && !error && (
          <p
            id={helperId}
            style={{
              fontSize: "0.75rem",
              color: "var(--text-secondary, #475569)",
              margin: 0,
            }}
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
