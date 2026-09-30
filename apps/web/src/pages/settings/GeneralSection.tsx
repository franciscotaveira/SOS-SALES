import { useState, type FC } from "react";
import { Badge, Button } from "@sos-sales/ui";
import { Copy, Check, ShieldCheck } from "lucide-react";
import type { UseSessionReturn } from "../../hooks/useSession";

export const GeneralSection: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const { activeWorkspace, activeWorkspaceDetails } = session;
  const [copied, setCopied] = useState(false);

  const handleCopyId = () => {
    if (activeWorkspace?.id) {
      navigator.clipboard.writeText(activeWorkspace.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Primary Workspace Card */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-default)",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
          padding: "var(--space-5)",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
              Identificação do Workspace
            </h2>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
              Informações cadastrais e nível de acesso no ambiente comercial.
            </p>
          </div>
          <Badge variant="action">Ambiente Ativo</Badge>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
              Nome do Workspace
            </span>
            <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, marginTop: "4px", color: "var(--text-primary)" }}>
              {activeWorkspace?.name || "Sem nome"}
            </div>
          </div>

          <div>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
              Papel no Workspace
            </span>
            <div style={{ marginTop: "4px" }}>
              <Badge variant="operational">{activeWorkspaceDetails?.userRole || "Owner"}</Badge>
            </div>
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

      {/* Secondary Technical Audit Card */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-default)",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
          padding: "var(--space-4)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-operational-subtle)",
              color: "var(--color-operational)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={16} />
          </div>
          <div>
            <div style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)" }}>
              Identificador Técnico de Auditoria (RLS)
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--font-size-xs)",
                color: "var(--text-secondary)",
                marginTop: "2px",
              }}
            >
              {activeWorkspace?.id || "N/A"}
            </div>
          </div>
        </div>

        <Button
          size="xs"
          variant="secondary"
          prefixIcon={copied ? <Check size={13} /> : <Copy size={13} />}
          onClick={handleCopyId}
        >
          {copied ? "Copiado" : "Copiar ID"}
        </Button>
      </div>
    </div>
  );
};
