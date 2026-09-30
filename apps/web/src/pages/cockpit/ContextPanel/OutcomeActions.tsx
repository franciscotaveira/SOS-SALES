import type { FC } from "react";
import { Button } from "@sos-sales/ui";
import { Check, X } from "lucide-react";

interface OutcomeActionsProps {
  onMarkWon: () => void;
  onMarkLost: () => void;
  disabled?: boolean;
  currentOutcome?: "won" | "lost" | null;
}

export const OutcomeActions: FC<OutcomeActionsProps> = ({
  onMarkWon,
  onMarkLost,
  disabled = false,
  currentOutcome,
}) => {
  return (
    <div style={{ display: "flex", gap: "8px", width: "100%" }}>
      <Button
        size="sm"
        variant="primary"
        prefixIcon={<Check size={14} />}
        onClick={onMarkWon}
        disabled={disabled || currentOutcome === "won"}
        title="Registrar Negócio Fechado (Ganho)"
        style={{ flex: 1 }}
      >
        Ganho
      </Button>
      <Button
        size="sm"
        variant="danger"
        prefixIcon={<X size={14} />}
        onClick={onMarkLost}
        disabled={disabled || currentOutcome === "lost"}
        title="Registrar Negócio Perdido"
        style={{ flex: 1 }}
      >
        Perdido
      </Button>
    </div>
  );
};
