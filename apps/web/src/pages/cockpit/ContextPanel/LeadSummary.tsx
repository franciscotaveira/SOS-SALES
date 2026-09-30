import type { FC } from "react";
import { Badge } from "@sos-sales/ui";
import type { CommercialThreadSummary } from "../../../services/api-client";
import { formatPhone } from "../utils/formatPhone";

interface LeadSummaryProps {
  thread: CommercialThreadSummary;
  journeyStage?: string | null;
  estimatedValueCents?: number | null;
}

export const LeadSummary: FC<LeadSummaryProps> = ({
  thread,
  journeyStage,
  estimatedValueCents,
}) => {
  const formattedPhone = formatPhone(thread.contactPhone);
  const formattedValue =
    estimatedValueCents != null
      ? (estimatedValueCents / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        })
      : "R$ 0,00";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "var(--font-size-sm, 0.875rem)",
        }}
      >
        <span style={{ color: "var(--text-secondary)" }}>Telefone</span>
        <span style={{ fontWeight: 500, fontFamily: "var(--font-mono, monospace)" }}>
          {formattedPhone}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "var(--font-size-sm, 0.875rem)",
        }}
      >
        <span style={{ color: "var(--text-secondary)" }}>Origem</span>
        <Badge variant="operational">{thread.channelProvider || "WhatsApp"}</Badge>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "var(--font-size-sm, 0.875rem)",
        }}
      >
        <span style={{ color: "var(--text-secondary)" }}>Etapa</span>
        <Badge variant="operational">{journeyStage || "Em qualificação"}</Badge>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "var(--font-size-sm, 0.875rem)",
        }}
      >
        <span style={{ color: "var(--text-secondary)" }}>Valor Estimado</span>
        <span
          style={{
            fontWeight: 600,
            color: "var(--text-primary)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formattedValue}
        </span>
      </div>
    </div>
  );
};
