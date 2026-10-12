import { type FC, useState, useEffect, useCallback } from "react";
import { Drawer, Button, Input, Badge, SegmentedControl, LoadingState, EmptyState } from "@sos-sales/ui";
import {
  QrCode,
  AlertCircle,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import {
  apiClient,
  type CommercialThreadSummary,
  type PixChargeSummary,
} from "../../../services/api-client";

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
  const [activeTab, setActiveTab] = useState<"list" | "new">("list");
  const [charges, setCharges] = useState<PixChargeSummary[]>([]);
  const [isLoadingCharges, setIsLoadingCharges] = useState(false);
  const [settlingChargeId, setSettlingChargeId] = useState<string | null>(null);
  const [confirmSuccessMessage, setConfirmSuccessMessage] = useState<string | null>(null);
  const [viewingQrChargeId, setViewingQrChargeId] = useState<string | null>(null);

  // New Charge Generation Form State
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
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadCharges = useCallback(async () => {
    if (!thread || !workspaceId || !token) return;
    setIsLoadingCharges(true);
    try {
      const res = await apiClient.getPixChargesByThread(workspaceId, thread.id, { token });
      const list = res.charges || [];
      setCharges(list);
      if (list.length === 0) {
        setActiveTab("new");
      }
    } catch {
      setCharges([]);
    } finally {
      setIsLoadingCharges(false);
    }
  }, [thread, workspaceId, token]);

  useEffect(() => {
    if (isOpen) {
      setGeneratedCharge(null);
      setError(null);
      setConfirmSuccessMessage(null);
      loadCharges();
    }
  }, [isOpen, loadCharges]);

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

      // Refresh charges list and parent thread
      await loadCharges();
      onPixCreated?.();
    } catch (err: unknown) {
      setError((err as Error).message || "Falha ao gerar cobrança Pix.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmPayment = async (chargeId: string) => {
    if (!workspaceId || !token) return;
    setSettlingChargeId(chargeId);
    setConfirmSuccessMessage(null);
    setError(null);

    try {
      const res = await apiClient.confirmPixPayment(workspaceId, chargeId, { token });
      if (res.success) {
        setConfirmSuccessMessage("Pagamento Pix confirmado no caixa com sucesso! Mensagem de confirmação enviada no WhatsApp.");
        setCharges((prev) =>
          prev.map((c) =>
            c.id === chargeId
              ? {
                  ...c,
                  status: "PAID",
                  verificationMethod: "MANUAL_CASHIER",
                  paidAt: new Date().toISOString(),
                }
              : c
          )
        );
        onPixCreated?.();
      }
    } catch (err: unknown) {
      setError((err as Error).message || "Erro ao liquidar cobrança Pix no caixa.");
    } finally {
      setSettlingChargeId(null);
    }
  };

  const handleCopy = (code: string, id: string) => {
    if (code) {
      navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const pendingCount = charges.filter((c) => c.status === "PENDING").length;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Cobrança Pix & Caixa"
      description="Gerencie cobranças Pix instantâneas, confira recebimentos no caixa e gere novos pagamentos."
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <Button
            size="sm"
            variant="ghost"
            prefixIcon={<RefreshCw size={14} className={isLoadingCharges ? "animate-spin" : ""} />}
            onClick={loadCharges}
            disabled={isLoadingCharges}
          >
            Atualizar
          </Button>

          <div style={{ display: "flex", gap: "8px" }}>
            <Button size="sm" variant="secondary" onClick={onClose}>
              Fechar
            </Button>
            {activeTab === "new" && !generatedCharge && (
              <Button
                size="sm"
                variant="primary"
                disabled={isSubmitting}
                onClick={handleGenerate}
                prefixIcon={<QrCode size={14} />}
              >
                {isSubmitting ? "Gerando..." : "Gerar & Enviar Pix"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Navigation Tabs */}
        <SegmentedControl
          value={activeTab}
          onChange={(val) => {
            setActiveTab(val as "list" | "new");
            setError(null);
          }}
          options={[
            {
              value: "list",
              label: `Cobranças (${charges.length})${pendingCount > 0 ? ` · ${pendingCount} pendente(s)` : ""}`,
            },
            {
              value: "new",
              label: "+ Nova Cobrança",
            },
          ]}
        />

        {error && (
          <div
            role="alert"
            style={{
              padding: "10px 14px",
              backgroundColor: "var(--color-danger-subtle)",
              color: "var(--color-danger)",
              borderRadius: "var(--radius-md, 8px)",
              fontSize: "var(--font-size-xs, 0.75rem)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {confirmSuccessMessage && (
          <div
            role="status"
            style={{
              padding: "10px 14px",
              backgroundColor: "var(--color-action-subtle)",
              color: "var(--color-action)",
              borderRadius: "var(--radius-md, 8px)",
              fontSize: "var(--font-size-xs, 0.75rem)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <CheckCircle2 size={16} />
            <span>{confirmSuccessMessage}</span>
          </div>
        )}

        {/* TAB 1: Lista de Cobranças da Conversa */}
        {activeTab === "list" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {isLoadingCharges ? (
              <LoadingState text="Carregando cobranças Pix desta conversa..." />
            ) : charges.length === 0 ? (
              <EmptyState
                icon={<Receipt size={32} />}
                title="Nenhuma cobrança gerada"
                description="Não há cobranças Pix ativas ou históricas nesta conversa."
                action={
                  <Button
                    size="sm"
                    variant="primary"
                    prefixIcon={<Plus size={14} />}
                    onClick={() => setActiveTab("new")}
                  >
                    Gerar Primeira Cobrança
                  </Button>
                }
              />
            ) : (
              charges.map((charge) => {
                const isPending = charge.status === "PENDING";
                const isPaid = charge.status === "PAID";
                const isExpired = charge.status === "EXPIRED";
                const isSettling = settlingChargeId === charge.id;
                const isViewingQr = viewingQrChargeId === charge.id;

                return (
                  <div
                    key={charge.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      padding: "14px",
                      borderRadius: "var(--radius-md, 8px)",
                      backgroundColor: "var(--bg-canvas)",
                      border: isPaid
                        ? "1px solid var(--color-action)"
                        : isPending
                        ? "1px solid var(--color-warning)"
                        : "1px solid var(--border-default)",
                      boxShadow: "var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.05))",
                    }}
                  >
                    {/* Header: Title and Status Badge */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm, 0.875rem)", color: "var(--text-primary)" }}>
                          {charge.title}
                        </span>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          Gerado em: {new Date(charge.createdAt).toLocaleString("pt-BR")}
                        </span>
                      </div>

                      {isPaid && (
                        <Badge variant="action">
                          <CheckCircle2 size={12} style={{ marginRight: "4px" }} /> Pago
                        </Badge>
                      )}
                      {isPending && (
                        <Badge variant="warning">
                          <Clock size={12} style={{ marginRight: "4px" }} /> Pendente
                        </Badge>
                      )}
                      {isExpired && (
                        <Badge variant="neutral">
                          Expirado
                        </Badge>
                      )}
                    </div>

                    {/* Amount & Details */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: "1.25rem",
                          fontWeight: 700,
                          color: isPaid ? "var(--color-action)" : "var(--text-primary)",
                        }}
                      >
                        {charge.amountFormatted}
                      </span>

                      {isPaid && charge.verificationMethod && (
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
                          <ShieldCheck size={13} style={{ color: "var(--color-action)" }} />
                          {charge.verificationMethod === "BANK_WEBHOOK"
                            ? "Confirmado via Webhook Bancário"
                            : "Confirmado pelo Caixa"}
                        </span>
                      )}
                    </div>

                    {/* QR Code toggle if available */}
                    {isViewingQr && charge.pixQrUrl && (
                      <div style={{ display: "flex", justifyContent: "center", padding: "10px", backgroundColor: "#fff", borderRadius: "8px" }}>
                        <img src={charge.pixQrUrl} alt="QR Code Pix" style={{ width: "160px", height: "160px" }} />
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                      <Button
                        size="xs"
                        variant="secondary"
                        prefixIcon={copiedId === charge.id ? <Check size={12} /> : <Copy size={12} />}
                        onClick={() => handleCopy(charge.pixCode, charge.id)}
                      >
                        {copiedId === charge.id ? "Copiado!" : "Copiar Pix"}
                      </Button>

                      {charge.pixQrUrl && (
                        <Button
                          size="xs"
                          variant="ghost"
                          prefixIcon={<QrCode size={12} />}
                          onClick={() => setViewingQrChargeId(isViewingQr ? null : charge.id)}
                        >
                          {isViewingQr ? "Ocultar QR" : "Ver QR Code"}
                        </Button>
                      )}

                      {/* Cashier Settlement Button */}
                      {isPending && (
                        <Button
                          size="xs"
                          variant="primary"
                          disabled={isSettling}
                          onClick={() => handleConfirmPayment(charge.id)}
                          prefixIcon={<CheckCircle2 size={12} />}
                        >
                          {isSettling ? "Confirmando..." : "Confirmar Recebimento (Caixa)"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: Formulário de Nova Cobrança */}
        {activeTab === "new" && (
          <div>
            {!generatedCharge ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <Input
                  label="Descrição da Cobrança"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Pagamento Oferta Relâmpago"
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
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px", alignItems: "center" }}>
                <div
                  style={{
                    padding: "10px 16px",
                    backgroundColor: "var(--color-action-subtle)",
                    borderRadius: "var(--radius-md, 8px)",
                    fontWeight: 600,
                    color: "var(--color-action)",
                    fontSize: "var(--font-size-base, 1rem)",
                    width: "100%",
                    textAlign: "center",
                  }}
                >
                  ⚡ Pix Gerado com Sucesso: {generatedCharge.amountFormatted}
                </div>

                {generatedCharge.pixQrUrl && (
                  <img
                    src={generatedCharge.pixQrUrl}
                    alt="QR Code Pix"
                    style={{ width: "180px", height: "180px", borderRadius: "var(--radius-md, 8px)", border: "1px solid var(--border-default)" }}
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
                  <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                    <Button
                      size="sm"
                      variant="secondary"
                      prefixIcon={copiedId === "new" ? <Check size={14} /> : <Copy size={14} />}
                      onClick={() => handleCopy(generatedCharge.pixCode, "new")}
                    >
                      {copiedId === "new" ? "Copiado!" : "Copiar Chave Pix"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setGeneratedCharge(null);
                        setActiveTab("list");
                      }}
                    >
                      Ver Lista de Cobranças
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
};
