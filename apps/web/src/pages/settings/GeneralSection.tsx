import type { FC } from "react";
import { Badge } from "@sos-sales/ui";
import type { UseSessionReturn } from "../../hooks/useSession";

export const GeneralSection: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const { activeWorkspace, activeWorkspaceDetails } = session;

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
          Identificação do Tenant
        </h2>
        <p style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
          Informações cadastrais e credenciais do ambiente multitenant ativo.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
            Nome do Workspace
          </span>
          <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, marginTop: "4px" }}>
            {activeWorkspace?.name || "Sem nome"}
          </div>
        </div>

        <div>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
            Papel no Tenant
          </span>
          <div style={{ marginTop: "4px" }}>
            <Badge variant="operational">{activeWorkspaceDetails?.userRole || "Owner"}</Badge>
          </div>
        </div>
      </div>

      <div>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
          Tenant ID (Isolamento RLS)
        </span>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--font-size-xs)",
            backgroundColor: "var(--bg-canvas)",
            padding: "8px 12px",
            borderRadius: "var(--radius-md)",
            marginTop: "4px",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
          }}
        >
          {activeWorkspace?.id || "N/A"}
        </div>
      </div>

      <div>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
          Permissões Ativas
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
          {activeWorkspaceDetails?.permissions && activeWorkspaceDetails.permissions.length > 0 ? (
            activeWorkspaceDetails.permissions.map((p) => (
              <Badge key={p} variant="neutral">
                {p}
              </Badge>
            ))
          ) : (
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              Acesso irrestrito (Owner)
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
