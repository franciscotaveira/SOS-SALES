import { useState, type FC, type FormEvent } from "react";
import { Button, Input, Alert } from "@sos-sales/ui";
import { MessageSquareText, ArrowRight, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { apiClient } from "../services/api-client";
import {
  isSupabaseConfigured,
  sendSupabaseOtp,
  verifySupabaseOtp,
} from "../services/supabase-auth";
import { LAB_DISTRIBUTION } from "../App";

interface LoginPageProps {
  onLoginSuccess: (token: string) => void;
  initialError?: string | null;
}

export const LoginPage: FC<LoginPageProps> = ({ onLoginSuccess, initialError }) => {
  const isLab = LAB_DISTRIBUTION;
  const hasSupabase = isSupabaseConfigured();

  // Clean initial state (Zero pre-filled emails or master keys)
  const [email, setEmail] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [rawToken, setRawToken] = useState("");
  const [showRawToken, setShowRawToken] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError || null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  /**
   * Commercial Supabase Auth Flow (Individual Identity via OTP)
   */
  const handleSendOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMessage("Informe o e-mail cadastrado.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessNotice(null);

    const res = await sendSupabaseOtp(email.trim());
    setIsLoading(false);

    if (res.success) {
      setOtpSent(true);
      setSuccessNotice(`Código de acesso enviado para ${email.trim()}. Verifique sua caixa de entrada.`);
    } else {
      setErrorMessage(res.message || "Falha ao enviar código de acesso.");
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) {
      setErrorMessage("Informe o código de 6 dígitos recebido.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const res = await verifySupabaseOtp(email.trim(), otpCode.trim());
    setIsLoading(false);

    if (res.token) {
      onLoginSuccess(res.token);
    } else {
      setErrorMessage(res.error || "Código de acesso inválido ou expirado.");
    }
  };

  /**
   * Laboratory Mode Auth Flow (Strictly for LAB/DEV environments)
   */
  const handleLabLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMessage("Informe o e-mail de teste.");
      return;
    }
    if (!accessKey.trim()) {
      setErrorMessage("Informe a chave mestra de laboratório.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await apiClient.requestAuthSession({
        email: email.trim(),
        accessKey: accessKey.trim(),
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

  const handleLabTokenSubmit = (e: FormEvent) => {
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
          maxWidth: "420px",
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-xl, 16px)",
          boxShadow:
            "var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.05))",
          padding: "32px 28px",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          boxSizing: "border-box",
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: "8px",
          }}
        >
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
            <h1
              style={{
                fontSize: "var(--font-size-xl, 1.25rem)",
                fontWeight: 600,
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              SOS Sales
            </h1>
            <p
              style={{
                fontSize: "var(--font-size-sm, 0.875rem)",
                color: "var(--text-secondary)",
                margin: "4px 0 0 0",
              }}
            >
              Acesso à plataforma comercial de vendas
            </p>
          </div>
        </div>

        {/* Lab Mode Badge (Strictly visible in LAB/DEV) */}
        {isLab && (
          <div
            style={{
              padding: "6px 12px",
              borderRadius: "var(--radius-md, 8px)",
              backgroundColor: "rgba(234, 179, 8, 0.12)",
              border: "1px solid rgba(234, 179, 8, 0.4)",
              color: "var(--color-warning-fg, #b45309)",
              fontSize: "var(--font-size-xs, 0.75rem)",
              fontWeight: 500,
              textAlign: "center",
            }}
          >
            🧪 Ambiente de Laboratório / Testes (DEV)
          </div>
        )}

        {/* Notices & Alerts */}
        {errorMessage && (
          <Alert variant="danger" title="Erro no Acesso">
            {errorMessage}
          </Alert>
        )}
        {successNotice && (
          <Alert variant="info" title="Código Enviado">
            {successNotice}
          </Alert>
        )}

        {/* 1. Commercial Mode UI */}
        {!isLab && (
          <>
            {hasSupabase ? (
              // Active Supabase Auth Individual Login
              !otpSent ? (
                <form
                  onSubmit={handleSendOtp}
                  style={{ display: "flex", flexDirection: "column", gap: "16px" }}
                >
                  <Input
                    label="E-mail Profissional"
                    type="email"
                    placeholder="seu.email@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />

                  <Button
                    size="md"
                    variant="primary"
                    type="submit"
                    disabled={isLoading}
                    prefixIcon={<Mail size={16} />}
                    style={{ width: "100%", marginTop: "4px" }}
                  >
                    {isLoading ? "Enviando..." : "Receber Código de Acesso"}
                  </Button>
                </form>
              ) : (
                <form
                  onSubmit={handleVerifyOtp}
                  style={{ display: "flex", flexDirection: "column", gap: "16px" }}
                >
                  <Input
                    label="Código de Acesso (6 dígitos)"
                    type="text"
                    placeholder="123456"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    required
                  />

                  <Button
                    size="md"
                    variant="primary"
                    type="submit"
                    disabled={isLoading}
                    prefixIcon={<ShieldCheck size={16} />}
                    style={{ width: "100%", marginTop: "4px" }}
                  >
                    {isLoading ? "Validando..." : "Confirmar e Acessar"}
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false);
                      setOtpCode("");
                      setErrorMessage(null);
                      setSuccessNotice(null);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      fontSize: "var(--font-size-xs, 0.75rem)",
                      color: "var(--text-secondary)",
                      textDecoration: "underline",
                      textAlign: "center",
                    }}
                  >
                    Trocar e-mail ou reenviar código
                  </button>
                </form>
              )
            ) : (
              // Honest Empty / Blocked Status for Commercial Environment without AC15 Provider
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                  padding: "16px",
                  borderRadius: "var(--radius-lg, 12px)",
                  backgroundColor: "var(--bg-canvas)",
                  border: "1px solid var(--border-default)",
                  fontSize: "var(--font-size-sm, 0.875rem)",
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)", fontWeight: 600 }}>
                  <ShieldCheck size={18} color="var(--color-action)" />
                  Autenticação Comercial Individual (AC15)
                </div>
                <p style={{ margin: 0 }}>
                  O login comercial exige autenticação individual via Supabase Auth (código OTP/Magic Link) com validação de assinatura assimétrica JWKS.
                </p>
                <p style={{ margin: 0, fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-tertiary)" }}>
                  <strong>Dependência Externa:</strong> Parametrização de credenciais de projeto Supabase real (<code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code>). O acesso por chave mestra foi permanentemente desativado em produção.
                </p>
              </div>
            )}
          </>
        )}

        {/* 2. Laboratory Mode UI (Strictly LAB/DEV) */}
        {isLab && (
          <>
            {!showRawToken ? (
              <form
                onSubmit={handleLabLogin}
                style={{ display: "flex", flexDirection: "column", gap: "16px" }}
              >
                <Input
                  label="E-mail de Laboratório"
                  type="email"
                  placeholder="operador@lab.local"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />

                <Input
                  label="Chave Mestra de Laboratório"
                  type="password"
                  placeholder="Digite a chave..."
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  required
                />

                <Button
                  size="md"
                  variant="primary"
                  type="submit"
                  disabled={isLoading}
                  prefixIcon={<ArrowRight size={16} />}
                  style={{ width: "100%", marginTop: "4px" }}
                >
                  {isLoading ? "Autenticando..." : "Entrar no Laboratório"}
                </Button>
              </form>
            ) : (
              <form
                onSubmit={handleLabTokenSubmit}
                style={{ display: "flex", flexDirection: "column", gap: "16px" }}
              >
                <Input
                  label="Token Manual de Laboratório (JWT)"
                  placeholder="Cole o JWT de teste aqui..."
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
                  Acessar com Token Lab
                </Button>
              </form>
            )}

            {/* Toggle Lab Access Form */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                borderTop: "1px solid var(--border-default)",
                paddingTop: "16px",
              }}
            >
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
                {showRawToken
                  ? "Voltar ao login com e-mail e chave"
                  : "Entrar com token manual de laboratório"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
