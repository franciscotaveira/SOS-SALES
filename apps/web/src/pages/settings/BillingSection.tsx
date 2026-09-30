import { useState, type FC } from "react";
import { Badge, Button } from "@sos-sales/ui";
import { Coins, Copy, Check } from "lucide-react";
import type { UseSessionReturn } from "../../hooks/useSession";

export const BillingSection: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const [isCopied, setIsCopied] = useState(false);

  // Instant Recharge Pix key for SOS Sales platform
  const PLATFORM_PIX_KEY = "financeiro@sossales.com.br";

  const handleCopyPix = () => {
    navigator.clipboard.writeText(PLATFORM_PIX_KEY);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div
      style={{
        backgroundColor: "var(--bg-surface)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-default)",
        padding: "var(--space-5)",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <div>
        <h2 style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
          Créditos & Recarga de Saldo
        </h2>
        <p style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
          Gerencie seu saldo para envio de mensagens ativas e telemetria Meta Conversions API.
        </p>
      </div>

      {/* Credit Balance Card */}
      <div
        style={{
          padding: "16px",
          backgroundColor: "var(--bg-canvas)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-default)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              backgroundColor: "var(--color-action-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-action)",
            }}
          >
            <Coins size={20} />
          </div>
          <div>
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
              Status da Conta
            </div>
            <div style={{ fontSize: "var(--font-size-base)", fontWeight: 600, color: "var(--text-primary)" }}>
              Plano Pro Operacional
            </div>
          </div>
        </div>

        <Badge variant="action">Ativo & Liberado</Badge>
      </div>

      {/* How to Recharge Instructions */}
      <div
        style={{
          borderTop: "1px solid var(--border-default)",
          paddingTop: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)" }}>
          Recarga Instantânea via Pix
        </span>
        <p style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", margin: 0 }}>
          Para adicionar saldo de disparos ou renovar o plano do tenant, realize a transferência Pix utilizando a chave oficial abaixo. Os créditos são compensados automaticamente via webhook bancário:
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            backgroundColor: "var(--bg-canvas)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--font-size-xs)",
          }}
        >
          <span>Chave Pix: <strong>{PLATFORM_PIX_KEY}</strong></span>
          <Button
            size="xs"
            variant="secondary"
            prefixIcon={isCopied ? <Check size={12} /> : <Copy size={12} />}
            onClick={handleCopyPix}
          >
            {isCopied ? "Copiado" : "Copiar Chave"}
          </Button>
        </div>

        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
          Identificador do Tenant para comprovante: <code style={{ fontFamily: "var(--font-mono)" }}>{session.activeWorkspace?.id}</code>
        </div>
      </div>
    </div>
  );
};
