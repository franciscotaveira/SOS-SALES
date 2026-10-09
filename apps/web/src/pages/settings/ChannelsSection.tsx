import type { FC } from "react";
import { Badge, Button, EmptyState } from "@sos-sales/ui";
import { Radio, Plus, QrCode, Trash2, Smartphone } from "lucide-react";
import type { ChannelSummary } from "../../services/api-client";

interface ChannelsSectionProps {
  channels: ChannelSummary[];
  isLoading: boolean;
  onOpenWizard: () => void;
  onOpenQr: (channelId: string, channelName: string) => void;
  onRevoke: (channelId: string, channelName: string) => void;
  revokingId: string | null;
  onDelete?: (channelId: string, channelName: string) => void;
  deletingId?: string | null;
}

export const ChannelsSection: FC<ChannelsSectionProps> = ({
  channels,
  isLoading,
  onOpenWizard,
  onOpenQr,
  onRevoke,
  revokingId,
  onDelete,
  deletingId,
}) => {
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "connected":
      case "active":
        return <Badge variant="action">Conectado</Badge>;
      case "revoked":
        return <Badge variant="danger">Revogado</Badge>;
      case "configuring":
        return <Badge variant="warning">Configurando</Badge>;
      case "error":
        return <Badge variant="danger">Erro de Conexão</Badge>;
      default:
        return <Badge variant="neutral">{status || "Desconhecido"}</Badge>;
    }
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
            Canais WhatsApp Conectados
          </h2>
          <p style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            Instâncias Meta Cloud API e WAHA autorizadas no workspace.
          </p>
        </div>

        <Button
          size="sm"
          variant="primary"
          prefixIcon={<Plus size={14} />}
          onClick={onOpenWizard}
        >
          Conectar Canal
        </Button>
      </div>

      {isLoading && channels.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px", color: "var(--text-secondary)", fontSize: "var(--font-size-sm)" }}>
          Carregando canais conectados...
        </div>
      ) : channels.length === 0 ? (
        <EmptyState
          icon={<Radio size={40} />}
          title="Nenhum canal conectado"
          description="Conecte uma linha WhatsApp oficial Meta Cloud API ou instância WAHA para começar a receber leads."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {channels.map((ch) => {
            const isWaha = ch.provider === "waha";
            const isRevoking = revokingId === ch.id;
            const isDeleting = deletingId === ch.id;

            return (
              <div
                key={ch.id}
                style={{
                  padding: "12px 14px",
                  backgroundColor: "var(--bg-canvas)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-default)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      backgroundColor: "var(--color-operational-subtle)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--color-operational)",
                    }}
                  >
                    <Smartphone size={16} />
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, color: "var(--text-primary)" }}>
                        {ch.displayName || "Linha WhatsApp"}
                      </span>
                      {getStatusBadge(ch.status)}
                    </div>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", marginTop: "2px" }}>
                      {ch.provider.toUpperCase()} {ch.phoneNumberE164 ? `· ${ch.phoneNumberE164}` : ""}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {isWaha && ch.status !== "revoked" && (
                    <Button
                      size="xs"
                      variant="secondary"
                      prefixIcon={<QrCode size={13} />}
                      onClick={() => onOpenQr(ch.id, ch.displayName || "WAHA")}
                    >
                      QR Code
                    </Button>
                  )}
                  {ch.status === "connected" && (
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => onRevoke(ch.id, ch.displayName || ch.phoneNumberE164 || "Linha WhatsApp")}
                      disabled={isRevoking || isDeleting}
                    >
                      {isRevoking ? "Revogando..." : "Desconectar"}
                    </Button>
                  )}
                  <Button
                    size="xs"
                    variant="danger"
                    prefixIcon={<Trash2 size={13} />}
                    onClick={() => onDelete?.(ch.id, ch.displayName || ch.phoneNumberE164 || "Linha WhatsApp")}
                    disabled={isRevoking || isDeleting}
                  >
                    {isDeleting ? "Excluindo..." : ch.status === "revoked" ? "Excluir" : "Excluir / Arquivar"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
