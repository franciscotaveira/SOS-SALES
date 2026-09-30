import { type FC, useState, useEffect } from "react";
import { Drawer, Button } from "@sos-sales/ui";
import { Send } from "lucide-react";
import { apiClient, type WhatsAppFlowSummary } from "../../../services/api-client";

interface FlowDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  thread?: unknown;
  workspaceId?: string;
  token?: string;
  onSendFlow?: (flow: WhatsAppFlowSummary) => void;
}

export const FlowDrawer: FC<FlowDrawerProps> = ({
  isOpen,
  onClose,
  workspaceId,
  token,
  onSendFlow,
}) => {
  const [flows, setFlows] = useState<WhatsAppFlowSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !workspaceId || !token) return;
    setLoading(true);
    apiClient
      .getFlows(workspaceId, {}, { token })
      .then((res) => setFlows(res.flows || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, workspaceId, token]);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Formulários do WhatsApp (Flows)"
      description="Selecione um fluxo estruturado para envio ao cliente."
      footer={
        <Button size="sm" variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "16px", color: "var(--text-secondary)" }}>
            Carregando flows...
          </div>
        ) : flows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "16px", color: "var(--text-secondary)" }}>
            Nenhum flow ativo cadastrado no workspace.
          </div>
        ) : (
          flows.map((f) => (
            <div
              key={f.id}
              style={{
                padding: "10px 12px",
                backgroundColor: "var(--bg-canvas)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md, 8px)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 500 }}>
                  {f.name}
                </div>
                <div style={{ fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
                  Status: {f.status}
                </div>
              </div>

              {onSendFlow && (
                <Button
                  size="xs"
                  variant="primary"
                  prefixIcon={<Send size={12} />}
                  onClick={() => {
                    onSendFlow(f);
                    onClose();
                  }}
                >
                  Disparar Flow
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </Drawer>
  );
};
