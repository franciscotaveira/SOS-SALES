import { useState, type FC, type FormEvent } from "react";
import { Button, Input, Alert } from "@sos-sales/ui";
import { MessageSquareText, ArrowRight, KeyRound } from "lucide-react";
import { apiClient } from "../services/api-client";

interface LoginPageProps {
  onLoginSuccess: (token: string) => void;
  initialError?: string | null;
}

export const LoginPage: FC<LoginPageProps> = ({ onLoginSuccess, initialError }) => {
  const [email, setEmail] = useState("francisco@mct.br");
  const [accessKey, setAccessKey] = useState("mothership_master_2026");
  const [rawToken, setRawToken] = useState("");
  const [showRawToken, setShowRawToken] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError || null);

  const handleLogin = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!email.trim()) {
      setErrorMessage("Informe o e-mail cadastrado.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await apiClient.requestAuthSession({
        email: email.trim(),
        accessKey: accessKey.trim() || undefined,
      });

      if (res.token) {
        onLoginSuccess(res.token);
      } else {
        setErrorMessage("Resposta de autenticação sem token válido.");
      }
    } catch (err: unknown) {
      const msg =
        (err as { detail?: string; message?: string }).detail ||
        (err as Error).message ||
        "Falha ao autenticar no servidor.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTokenSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!rawToken.trim()) {
      setErrorMessage("Cole um token de acesso válido.");
      return;
    }
    setErrorMessage(null);
    onLoginSuccess(rawToken.trim());
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--bg-canvas)",
        padding: "var(--space-4, 16px)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-xl, 16px)",
          boxShadow: "var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.05))",
          padding: "32px 28px",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          boxSizing: "border-box",
        }}
      >
        {/* Brand Header */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "8px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "var(--radius-lg, 12px)",
              backgroundColor: "var(--color-action)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-action-fg)",
              boxShadow: "0 2px 8px rgba(0, 128, 105, 0.3)",
            }}
          >
            <MessageSquareText size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: "var(--font-size-xl, 1.25rem)", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
              SOS Sales
            </h1>
            <p style={{ fontSize: "var(--font-size-sm, 0.875rem)", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
              Acesso à plataforma de atendimento e vendas
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <Alert variant="danger" title="Erro no Acesso">
            {errorMessage}
          </Alert>
        )}

        {/* Main Form */}
        {!showRawToken ? (
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <Input
              label="E-mail"
              type="email"
              placeholder="seu.email@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Input
              label="Chave de Acesso"
              type="password"
              placeholder="Digite sua chave..."
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
            />

            <Button
              size="md"
              variant="primary"
              type="submit"
              disabled={isLoading}
              prefixIcon={<ArrowRight size={16} />}
              style={{ width: "100%", marginTop: "4px" }}
            >
              {isLoading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleTokenSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <Input
              label="Token de Acesso Direto (JWT)"
              placeholder="Cole o token JWT aqui..."
              value={rawToken}
              onChange={(e) => setRawToken(e.target.value)}
              required
            />

            <Button
              size="md"
              variant="primary"
              type="submit"
              prefixIcon={<KeyRound size={16} />}
              style={{ width: "100%", marginTop: "4px" }}
            >
              Acessar com Token
            </Button>
          </form>
        )}

        {/* Toggle Alternative Access Mode */}
        <div style={{ display: "flex", justifyContent: "center", borderTop: "1px solid var(--border-default)", paddingTop: "16px" }}>
          <button
            type="button"
            onClick={() => {
              setShowRawToken(!showRawToken);
              setErrorMessage(null);
            }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontSize: "var(--font-size-xs, 0.75rem)",
              color: "var(--text-secondary)",
              textDecoration: "underline",
            }}
          >
            {showRawToken ? "Voltar ao login com e-mail e chave" : "Entrar com token manual de desenvolvedor"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
