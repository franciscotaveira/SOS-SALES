import type { FC } from "react";
import { Dialog, Button, LoadingState } from "@sos-sales/ui";
import { AlertCircle, CheckCircle2 } from "lucide-react";

interface QrCodeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  channelName: string;
  qrDataUri?: string;
  qrText?: string;
  isLoading: boolean;
  alreadyConnected?: boolean;
  error?: string;
}

export const QrCodeDialog: FC<QrCodeDialogProps> = ({
  isOpen,
  onClose,
  channelName,
  qrDataUri,
  isLoading,
  alreadyConnected,
  error,
}) => {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={alreadyConnected ? `Canal Conectado — ${channelName}` : `Escanear QR Code — ${channelName}`}
      description={
        alreadyConnected
          ? "Esta linha do WhatsApp já está sincronizada e autenticada."
          : "Abra o WhatsApp no seu smartphone, vá em Aparelhos Conectados e aponte a câmera para o código abaixo."
      }
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "12px 0" }}>
        {isLoading ? (
          <div style={{ padding: "32px 0", textAlign: "center" }}>
            <LoadingState variant="spinner" text="Verificando sessão e QR Code seguro..." />
          </div>
        ) : alreadyConnected ? (
          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--color-success-subtle, rgba(16, 185, 129, 0.15))",
              color: "var(--color-success, #10b981)",
              borderRadius: "var(--radius-md)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
              textAlign: "center",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <CheckCircle2 size={36} />
            <div>
              <strong style={{ fontSize: "var(--font-size-sm, 0.875rem)" }}>WhatsApp Autenticado e Operacional!</strong>
              <p style={{ margin: "6px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", opacity: 0.9 }}>
                A sessão deste canal já está conectada no servidor. As mensagens e o assistente de IA já podem responder normalmente.
              </p>
            </div>
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
