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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
              Workspace
            </span>
            <div style={{ fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 600, marginTop: "2px", color: "var(--text-primary)" }}>
              {workspace?.name || "Nenhum workspace selecionado"}
            </div>
          </div>
          <Badge variant="action">Ativo</Badge>
        </div>

        <div
          style={{
            backgroundColor: "var(--bg-canvas)",
            padding: "10px 12px",
            borderRadius: "var(--radius-md, 8px)",
            border: "1px solid var(--border-default)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <span style={{ fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)", display: "block" }}>
              ID Técnico (RLS)
            </span>
            <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-muted)" }}>
              {workspace?.id ? `${workspace.id.substring(0, 12)}...` : "N/A"}
            </span>
          </div>
          {workspace?.id && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => navigator.clipboard.writeText(workspace.id)}
            >
              Copiar
            </Button>
          )}
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
