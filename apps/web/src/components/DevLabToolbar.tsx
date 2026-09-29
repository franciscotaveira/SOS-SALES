/**
 * SOS Sales V3 — DevLabToolbar (MCT OS v2.0)
 * Quarantined development and QA toolbar.
 * NEVER leaks into production bundle. Strictly guarded by import.meta.env.DEV.
 */

import { useState, type FC } from "react";
import { Button, Input, Badge } from "@sos-sales/ui";
import { FlaskConical, KeyRound, WifiOff, RefreshCw, LayoutTemplate } from "lucide-react";

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
  // Hard guard: Do not render in production unless explicit lab mode is enabled
  const isLab = Boolean(
    import.meta.env.DEV ||
    import.meta.env.VITE_ENABLE_LAB_TOOLS === "true" ||
    import.meta.env.MODE === "lab"
  );
  if (!isLab) {
    return null;
  }

  const LOCAL_DEV_DEMO_TOKEN =
    "REDACTED_DEV_JWT";

  const [inputToken, setInputToken] = useState<string>(token || "");
  const [isOpen, setIsOpen] = useState<boolean>(true);

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
    setInputToken(LOCAL_DEV_DEMO_TOKEN);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("sos_v3_explicit_logged_out");
    }
    onTokenChange(LOCAL_DEV_DEMO_TOKEN);
  };

  return (
    <div
      role="region"
      aria-label="Barra de Laboratório de Desenvolvimento"
      style={{
        backgroundColor: "#1E293B",
        color: "#F8FAFC",
        borderBottom: "2px solid #F59E0B",
        padding: isOpen ? "8px 16px" : "4px 16px",
        fontSize: "0.8rem",
        zIndex: 100,
        position: "sticky",
        top: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <FlaskConical size={16} color="#F59E0B" />
          <strong style={{ color: "#FCD34D", letterSpacing: "0.02em" }}>
            LABORATÓRIO DEV
          </strong>
          <Badge variant="warning">Isolado de Produção</Badge>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            style={{
              background: "none",
              border: "none",
              color: "#94A3B8",
              cursor: "pointer",
              fontSize: "0.75rem",
              textDecoration: "underline",
              marginLeft: "4px",
            }}
          >
            {isOpen ? "Recolher" : "Expandir"}
          </button>
        </div>

        {isOpen && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <Button
              variant={activeView === "catalog" ? "primary" : "secondary"}
              size="sm"
              prefixIcon={<LayoutTemplate size={14} />}
              onClick={() => onToggleView(activeView === "catalog" ? "cockpit" : "catalog")}
            >
              {activeView === "catalog" ? "Voltar ao Cockpit" : "Catálogo de Primitives (/catalog)"}
            </Button>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Input
                placeholder="Cole o JWT Bearer para teste..."
                value={inputToken}
                onChange={(e) => setInputToken(e.target.value)}
                style={{ width: "240px", fontSize: "0.75rem" }}
              />
              <Button
                variant="primary"
                size="sm"
                prefixIcon={<KeyRound size={14} />}
                onClick={handleApplyToken}
              >
                Aplicar
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleClearToken}
              >
                Limpar (401)
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleLoadDemo}
              >
                Demo Matriz (Francisco)
              </Button>
            </div>

            <Button
              variant={isOfflineSimulated ? "danger" : "secondary"}
              size="sm"
              prefixIcon={<WifiOff size={14} />}
              onClick={isOfflineSimulated ? onResetOffline : onSimulateOffline}
            >
              {isOfflineSimulated ? "Restaurar Rede" : "Simular Offline"}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              prefixIcon={<RefreshCw size={14} />}
              onClick={onRefresh}
            >
              Recarregar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
