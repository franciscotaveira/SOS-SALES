/**
 * SOS Sales V3 — DevLabToolbar (MCT OS v2.0)
 * Floating pill overlay for QA and development.
 * NEVER leaks into production bundle. Strictly guarded by import.meta.env.DEV.
 */

import { useState, type FC } from "react";
import { Button, Input, Badge } from "@sos-sales/ui";
import { FlaskConical, KeyRound, WifiOff, RefreshCw, LayoutTemplate, Copy, Check, X } from "lucide-react";

interface DevLabToolbarProps {
  token: string | null;
  onTokenChange: (token: string | null) => void;
  onSimulateOffline: () => void;
  onResetOffline: () => void;
  isOfflineSimulated: boolean;
  activeView: "cockpit" | "catalog";
  onToggleView: (view: "cockpit" | "catalog") => void;
  onRefresh: () => void;
}

export const DevLabToolbar: FC<DevLabToolbarProps> = ({
  token,
  onTokenChange,
  onSimulateOffline,
  onResetOffline,
  isOfflineSimulated,
  activeView,
  onToggleView,
  onRefresh,
}) => {
  const LOCAL_DEV_DEMO_TOKEN =
    (import.meta.env.VITE_DEV_DEMO_TOKEN as string | undefined)?.trim() || "";

  const [inputToken, setInputToken] = useState<string>(token || "");
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const handleApplyToken = () => {
    onTokenChange(inputToken.trim() ? inputToken.trim() : null);
  };

  const handleClearToken = () => {
    setInputToken("");
    if (typeof window !== "undefined") {
      sessionStorage.setItem("sos_v3_explicit_logged_out", "true");
    }
    onTokenChange(null);
  };

  const handleLoadDemo = () => {
    if (!LOCAL_DEV_DEMO_TOKEN) {
      alert("Nenhum token configurado. Adicione VITE_DEV_DEMO_TOKEN no arquivo .env.");
      return;
    }
    setInputToken(LOCAL_DEV_DEMO_TOKEN);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("sos_v3_explicit_logged_out");
    }
    onTokenChange(LOCAL_DEV_DEMO_TOKEN);
  };

  const handleCopyToken = () => {
    if (token && typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const maskedToken = token
    ? `${token.slice(0, 10)}...••••`
    : "Nenhum token ativo";

  return (
    <div
      role="region"
      aria-label="Barra de Laboratório de Desenvolvimento"
      style={{
        position: "fixed",
        bottom: "calc(var(--mobile-nav-h, 56px) + 16px)",
        left: "16px",
        zIndex: 9999,
        fontFamily: "var(--font-sans, sans-serif)",
      }}
    >
      {/* 1. Closed State: Floating 32px Pill */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title="Abrir Laboratório de Testes (Dev Lab)"
          style={{
            height: "var(--control-h-sm, 32px)",
            padding: "0 12px",
            borderRadius: "var(--radius-full)",
            backgroundColor: "var(--bg-sidebar)",
            color: "var(--color-warning)",
            border: "1px solid var(--color-warning-border)",
            boxShadow: "var(--shadow-md)",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "var(--font-size-xs)",
            fontWeight: 600,
            cursor: "pointer",
            transition: "transform var(--transition-fast)",
          }}
        >
          <FlaskConical size={14} color="var(--color-warning)" />
          <span>LAB</span>
        </button>
      )}

      {/* 2. Expanded State: Floating Overlay Panel */}
      {isOpen && (
        <div
          style={{
            width: "min(420px, calc(100vw - 32px))",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-lg)",
            padding: "14px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            color: "var(--text-primary)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: "8px",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <FlaskConical size={16} color="var(--color-warning)" />
              <strong style={{ fontSize: "var(--font-size-sm)" }}>LABORATÓRIO DEV</strong>
              <Badge variant="warning">Modo Lab</Badge>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Recolher painel LAB"
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: "2px",
                display: "inline-flex",
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Masked JWT with Copy Button */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: "var(--bg-canvas)",
              padding: "6px 10px",
              borderRadius: "var(--radius-sm)",
              fontSize: "var(--font-size-xs)",
              fontFamily: "var(--font-mono)",
              border: "1px solid var(--border-default)",
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "280px" }}>
              {maskedToken}
            </span>
            {token && (
              <button
                type="button"
                onClick={handleCopyToken}
                title="Copiar JWT"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: copied ? "var(--color-action)" : "var(--text-muted)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "var(--font-size-xs)",
                  padding: "2px 4px",
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? "Copiado" : "Copiar"}</span>
              </button>
            )}
          </div>

          {/* Input & Token Action Buttons */}
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <Input
              placeholder="Cole JWT Bearer..."
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value)}
              style={{ flex: 1, height: "var(--control-h-sm, 32px)", fontSize: "var(--font-size-xs, 0.75rem)" }}
            />
            <Button
              variant="primary"
              size="sm"
              prefixIcon={<KeyRound size={13} />}
              onClick={handleApplyToken}
            >
              Aplicar
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleClearToken}
            >
              401
            </Button>
          </div>

          {/* Preset & Testing Buttons */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleLoadDemo}
            >
              Demo Francisco
            </Button>

            <Button
              variant={isOfflineSimulated ? "danger" : "secondary"}
              size="sm"
              prefixIcon={<WifiOff size={13} />}
              onClick={isOfflineSimulated ? onResetOffline : onSimulateOffline}
            >
              {isOfflineSimulated ? "Online" : "Offline"}
            </Button>

            <Button
              variant="secondary"
              size="sm"
              prefixIcon={<RefreshCw size={13} />}
              onClick={onRefresh}
            >
              Recarregar
            </Button>

            <Button
              variant={activeView === "catalog" ? "primary" : "secondary"}
              size="sm"
              prefixIcon={<LayoutTemplate size={13} />}
              onClick={() => onToggleView(activeView === "catalog" ? "cockpit" : "catalog")}
            >
              {activeView === "catalog" ? "Cockpit" : "Catálogo UI"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
