import type { FC } from "react";
import { Dialog, Button, LoadingState } from "@sos-sales/ui";
import { AlertCircle } from "lucide-react";

interface QrCodeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  channelName: string;
  qrDataUri?: string;
  qrText?: string;
  isLoading: boolean;
  error?: string;
}

export const QrCodeDialog: FC<QrCodeDialogProps> = ({
  isOpen,
  onClose,
  channelName,
  qrDataUri,
  isLoading,
  error,
}) => {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Escanear QR Code — ${channelName}`}
      description="Abra o WhatsApp no seu smartphone, vá em Aparelhos Conectados e aponte a câmera para o código abaixo."
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "12px 0" }}>
        {isLoading ? (
          <div style={{ padding: "32px 0", textAlign: "center" }}>
            <LoadingState variant="spinner" text="Gerando sessão e QR Code seguro..." />
          </div>
        ) : error ? (
          <div
            role="alert"
            style={{
              padding: "12px",
              backgroundColor: "var(--color-danger-subtle)",
              color: "var(--color-danger)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-sm)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "100%",
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        ) : qrDataUri ? (
          <div style={{ padding: "12px", backgroundColor: "var(--bg-surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)" }}>
            <img
              src={qrDataUri}
              alt="QR Code de Conexão WhatsApp"
              style={{ width: "240px", height: "240px", display: "block" }}
            />
          </div>
        ) : (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "var(--font-size-sm)" }}>
            QR Code indisponível ou instância já autenticada.
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
