import { type FC, useState } from "react";
import { Drawer, Button, Input } from "@sos-sales/ui";
import { QrCode, AlertCircle, Copy, Check } from "lucide-react";
import { apiClient, type CommercialThreadSummary } from "../../../services/api-client";

interface PixDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  thread: CommercialThreadSummary | null;
  workspaceId?: string;
  token?: string;
  onPixCreated?: () => void;
}

export const PixDrawer: FC<PixDrawerProps> = ({
  isOpen,
  onClose,
  thread,
  workspaceId,
  token,
  onPixCreated,
}) => {
  const [title, setTitle] = useState("Fechamento Comercial");
  const [amount, setAmount] = useState("100,00");
  const [expiresMinutes, setExpiresMinutes] = useState(60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedCharge, setGeneratedCharge] = useState<{
    pixCode: string;
    pixQrUrl: string | null;
    amountFormatted: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const parseCents = (val: string) => {
    const clean = val.replace(/\./g, "").replace(",", ".");
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : Math.round(num * 100);
  };

  const handleGenerate = async () => {
    if (!thread || !workspaceId || !token) return;
    const amountCents = parseCents(amount);
    if (amountCents < 100) {
      setError("O valor mínimo para cobrança Pix é de R$ 1,00.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await apiClient.createPixCharge(
        workspaceId,
        thread.id,
        {
          contactId: thread.contactId,
          productId: null,
          title: title.trim() || "Cobrança Pix Oficial",
          amountCents,
          expiresMinutes,
        },
        { token }
      );

      const charge = res.charge;
      setGeneratedCharge({
        pixCode: charge.pixCode,
        pixQrUrl: charge.pixQrUrl,
        amountFormatted: charge.amountFormatted,
      });

      // Send payment link to conversation
      const renderedBody = `*Cobrança Pix Gerada — Chat Sales*\n\nOlá! Segue a chave Pix Copia e Cola para pagamento:\n\n*Item:* ${charge.title}\n*Valor:* ${charge.amountFormatted}\n\n*Chave Pix Copia e Cola:*\n\`${charge.pixCode}\`\n\n_Válido por ${expiresMinutes} minutos._`;

      await apiClient.sendOutboundMessage(
        workspaceId,
        thread.channelInstanceId,
        {
          recipientPhoneE164: thread.contactPhone,
          contentType: "text",
          body: renderedBody,
          metadata: { chargeId: charge.id },
        },
        { token }
      );

      onPixCreated?.();
    } catch (err: unknown) {
      setError((err as Error).message || "Falha ao gerar cobrança Pix.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = () => {
    if (generatedCharge?.pixCode) {
      navigator.clipboard.writeText(generatedCharge.pixCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Cobrança Pix Instantânea"
      description="Gere um QR Code e chave Copia e Cola para enviar diretamente ao cliente no WhatsApp."
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", width: "100%" }}>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          {!generatedCharge && (
            <Button
              size="sm"
              variant="primary"
              disabled={isSubmitting}
              onClick={handleGenerate}
              prefixIcon={<QrCode size={14} />}
            >
              Gerar & Enviar Pix
            </Button>
          )}
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {error && (
          <div
            role="alert"
            style={{
              padding: "8px 12px",
              backgroundColor: "var(--color-danger-subtle)",
              color: "var(--color-danger)",
              borderRadius: "var(--radius-md, 8px)",
              fontSize: "var(--font-size-xs, 0.75rem)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        {!generatedCharge ? (
          <>
            <Input
              label="Descrição da Cobrança"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Pagamento Pedido Nº 123"
            />

            <Input
              label="Valor (R$)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100,00"
            />

            <Input
              label="Tempo de Validade (Minutos)"
              type="number"
              min={5}
              max={1440}
              value={String(expiresMinutes)}
              onChange={(e) => setExpiresMinutes(parseInt(e.target.value, 10) || 60)}
            />
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "center" }}>
            <div
              style={{
                padding: "8px 16px",
                backgroundColor: "var(--color-action-subtle)",
                borderRadius: "var(--radius-md, 8px)",
                fontWeight: 600,
                color: "var(--color-action)",
                fontSize: "var(--font-size-base, 1rem)",
              }}
            >
              Pix Gerado com Sucesso: {generatedCharge.amountFormatted}
            </div>

            {generatedCharge.pixQrUrl && (
              <img
                src={generatedCharge.pixQrUrl}
                alt="QR Code Pix"
                style={{ width: "200px", height: "200px", borderRadius: "var(--radius-md, 8px)" }}
              />
            )}

            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 500 }}>
                Chave Copia e Cola:
              </span>
              <div
                style={{
                  padding: "8px 10px",
                  backgroundColor: "var(--bg-canvas)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-md, 8px)",
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "var(--font-size-xs, 0.75rem)",
                  wordBreak: "break-all",
                  maxHeight: "80px",
                  overflowY: "auto",
                }}
              >
                {generatedCharge.pixCode}
              </div>
              <Button
                size="sm"
                variant="secondary"
                prefixIcon={copied ? <Check size={14} /> : <Copy size={14} />}
                onClick={handleCopy}
              >
                {copied ? "Copiado!" : "Copiar Chave Pix"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
};
