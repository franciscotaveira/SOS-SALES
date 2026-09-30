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
            padding: "var(--space-6)",
            background: "var(--bg-canvas)",
            color: "var(--text-primary)",
            fontFamily: "var(--font-sans)",
          }}
        >
          <div
            style={{
              maxWidth: "520px",
              width: "100%",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-6)",
              boxShadow: "var(--shadow-lg)",
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
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-danger-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-danger)",
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={24} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>
                  {this.props.fallbackTitle || "Falha na Renderização da Tela"}
                </h2>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                  SOS Sales V3 • Proteção Ativa Fail-Closed
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
                  background: "var(--bg-canvas)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--font-size-xs)",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-danger)",
                  border: "1px solid var(--border-subtle)",
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
