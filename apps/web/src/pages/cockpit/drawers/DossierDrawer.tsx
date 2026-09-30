import type { FC } from "react";
import { Drawer, Button, Badge } from "@sos-sales/ui";
import type { WorkspaceSummary } from "../../../services/api-client";

interface DossierDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  workspace: WorkspaceSummary | null;
  details?: { userRole?: string; permissions?: string[] } | null;
}

export const DossierDrawer: FC<DossierDrawerProps> = ({
  isOpen,
  onClose,
  workspace,
  details,
}) => {
  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Dossiê do Workspace"
      description="Configurações e permissões ativas do tenant selecionado."
      footer={
        <Button size="sm" variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <span style={{ fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
            Nome do Workspace
          </span>
          <div style={{ fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 500, marginTop: "2px" }}>
            {workspace?.name || "Nenhum workspace selecionado"}
          </div>
        </div>

        <div>
          <span style={{ fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
            Tenant ID
          </span>
          <div
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "var(--font-size-xs, 0.75rem)",
              backgroundColor: "var(--bg-canvas)",
              padding: "6px 8px",
              borderRadius: "var(--radius-sm, 6px)",
              marginTop: "4px",
              border: "1px solid var(--border-default)",
            }}
          >
            {workspace?.id || "N/A"}
          </div>
        </div>

        <div>
          <span style={{ fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
            Papel / Permissões
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
            <Badge variant="operational">{details?.userRole || "Owner"}</Badge>
            {details?.permissions?.map((p: string) => (
              <Badge key={p} variant="neutral">
                {p}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  );
};
