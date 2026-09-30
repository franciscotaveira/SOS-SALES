import type { FC } from "react";
import { Drawer, Button, Badge } from "@sos-sales/ui";
import { Check, X } from "lucide-react";

export interface RadarSuggestionItem {
  id: string;
  title: string;
  reason?: string | null;
}

interface RadarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  suggestions: RadarSuggestionItem[];
  onApplySuggestion?: (s: RadarSuggestionItem) => void;
  onDismissSuggestion?: (id: string) => void;
}

export const RadarDrawer: FC<RadarDrawerProps> = ({
  isOpen,
  onClose,
  suggestions,
  onApplySuggestion,
  onDismissSuggestion,
}) => {
  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Radar de Oportunidades"
      description="Sugestões de reengajamento e oportunidades detectadas automaticamente."
      footer={
        <Button size="sm" variant="secondary" onClick={onClose}>
          Fechar Radar
        </Button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {suggestions.length === 0 ? (
          <div
            style={{
              padding: "24px 16px",
              textAlign: "center",
              color: "var(--text-secondary)",
              fontSize: "var(--font-size-sm, 0.875rem)",
            }}
          >
            Nenhuma oportunidade ou sugestão pendente no momento.
          </div>
        ) : (
          suggestions.map((sug) => (
            <div
              key={sug.id}
              style={{
                padding: "12px",
                backgroundColor: "var(--bg-canvas)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md, 8px)",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 600 }}>
                  {sug.title}
                </span>
                <Badge variant="ai">Sugestão</Badge>
              </div>

              {sug.reason && (
                <p
                  style={{
                    fontSize: "var(--font-size-xs, 0.75rem)",
                    color: "var(--text-secondary)",
                    margin: 0,
                  }}
                >
                  {sug.reason}
                </p>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", marginTop: "4px" }}>
                {onDismissSuggestion && (
                  <Button
                    size="xs"
                    variant="ghost"
                    prefixIcon={<X size={12} />}
                    onClick={() => onDismissSuggestion(sug.id)}
                  >
                    Ignorar
                  </Button>
                )}
                {onApplySuggestion && (
                  <Button
                    size="xs"
                    variant="primary"
                    prefixIcon={<Check size={12} />}
                    onClick={() => onApplySuggestion(sug)}
                  >
                    Aplicar
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Drawer>
  );
};
