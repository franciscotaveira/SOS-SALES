import { Component, type ErrorInfo, type ReactNode } from "react";
import { Alert, Button } from "@sos-sales/ui";
import { AlertTriangle, RotateCcw } from "lucide-react";

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("🔥 [ErrorBoundary] Uncaught React exception:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            background: "var(--color-bg-base, #0F172A)",
            color: "var(--color-text-primary, #F8FAFC)",
            fontFamily: "var(--font-sans, system-ui, -apple-system, sans-serif)",
          }}
        >
          <div
            style={{
              maxWidth: "520px",
              width: "100%",
              background: "var(--color-bg-surface, #1E293B)",
              border: "1px solid var(--color-border-subtle, #334155)",
              borderRadius: "12px",
              padding: "28px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "8px",
                  background: "rgba(239, 68, 68, 0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-status-danger, #EF4444)",
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={24} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>
                  {this.props.fallbackTitle || "Falha na Renderização da Tela"}
                </h2>
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted, #94A3B8)" }}>
                  MCT OS v2.0 • Proteção Ativa Fail-Closed
                </span>
              </div>
            </div>

            <Alert variant="danger" title="Exceção Não Tratada">
              {this.state.error?.message || "Ocorreu um erro inesperado ao carregar este módulo."}
            </Alert>

            {this.state.error && (
              <pre
                style={{
                  margin: 0,
                  padding: "12px",
                  background: "rgba(0, 0, 0, 0.3)",
                  borderRadius: "6px",
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono, monospace)",
                  color: "#FCA5A5",
                  overflowX: "auto",
                  maxHeight: "140px",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {this.state.error.stack || this.state.error.message}
              </pre>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <Button
                variant="primary"
                onClick={this.handleReset}
                prefixIcon={<RotateCcw size={16} />}
              >
                Recarregar Aplicação
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
