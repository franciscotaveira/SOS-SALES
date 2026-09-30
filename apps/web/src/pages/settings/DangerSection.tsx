import { useState, type FC } from "react";
import { Button } from "@sos-sales/ui";
import { AlertTriangle, Trash2 } from "lucide-react";
import type { UseSessionReturn } from "../../hooks/useSession";

export const DangerSection: FC<{ session?: UseSessionReturn }> = () => {
  const [isResetting, setIsResetting] = useState(false);

  const handleClearSession = () => {
    const confirmed = window.confirm(
      "Deseja realmente desconectar sua sessão ativa e limpar os dados locais de autenticação?"
    );
    if (!confirmed) return;

    setIsResetting(true);
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };

  return (
    <div
      style={{
        backgroundColor: "var(--color-danger-subtle)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--color-danger)",
        padding: "var(--space-5)",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <AlertTriangle size={18} style={{ color: "var(--color-danger)" }} />
        <h2 style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, margin: 0, color: "var(--color-danger)" }}>
          Zona de Perigo
        </h2>
      </div>

      <p style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", margin: 0 }}>
        Ações destrutivas e irreversíveis sobre a sessão e dados temporários do dispositivo atual.
      </p>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: "12px",
          borderTop: "1px solid var(--color-danger-border)",
        }}
      >
        <div>
          <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, color: "var(--text-primary)" }}>
            Desconectar Sessão do Dispositivo
          </div>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
            Limpa tokens armazenados localmente e retorna à tela de autenticação.
          </div>
        </div>

        <Button
          size="sm"
          variant="danger"
          prefixIcon={<Trash2 size={14} />}
          onClick={handleClearSession}
          disabled={isResetting}
        >
          Desconectar
        </Button>
      </div>
    </div>
  );
};
