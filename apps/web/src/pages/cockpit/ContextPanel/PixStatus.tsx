import type { FC } from "react";
import { Badge, Button } from "@sos-sales/ui";
import { QrCode, CheckCircle, Clock } from "lucide-react";

interface PixStatusProps {
  status?: "paid" | "pending" | "none";
  paidAt?: string | null;
  amountCents?: number | null;
  onGeneratePix?: () => void;
}

export const PixStatus: FC<PixStatusProps> = ({
  status = "none",
  paidAt,
  amountCents,
  onGeneratePix,
}) => {
  const formattedAmount =
    amountCents != null
      ? (amountCents / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        })
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {status === "paid" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 12px",
            backgroundColor: "var(--color-action-subtle)",
            borderRadius: "var(--radius-md, 8px)",
            border: "1px solid rgba(0, 128, 105, 0.2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <CheckCircle size={16} style={{ color: "var(--color-action)" }} />
            <span style={{ fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 500 }}>
              Pago {formattedAmount ? `· ${formattedAmount}` : ""}
            </span>
          </div>
          {paidAt && (
            <span
              style={{
                fontSize: "var(--font-size-xs, 0.75rem)",
                color: "var(--text-secondary)",
              }}
            >
              {paidAt}
            </span>
          )}
        </div>
      )}

      {status === "pending" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 12px",
            backgroundColor: "var(--color-warning-subtle)",
            borderRadius: "var(--radius-md, 8px)",
            border: "1px solid rgba(217, 119, 6, 0.2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Clock size={16} style={{ color: "var(--color-warning)" }} />
            <span style={{ fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 500 }}>
              Cobrança Pendente {formattedAmount ? `· ${formattedAmount}` : ""}
            </span>
          </div>
          <Badge variant="warning">Pendente</Badge>
        </div>
      )}

      {status === "none" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "8px",
          }}
        >
          <span
            style={{
              fontSize: "var(--font-size-xs, 0.75rem)",
              color: "var(--text-secondary)",
            }}
          >
            Nenhuma cobrança Pix ativa para este lead.
          </span>
          {onGeneratePix && (
            <Button
              size="xs"
              variant="secondary"
              prefixIcon={<QrCode size={14} />}
              onClick={onGeneratePix}
            >
              Gerar Pix
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
