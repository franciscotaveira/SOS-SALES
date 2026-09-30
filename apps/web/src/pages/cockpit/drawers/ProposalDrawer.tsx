import { type FC, useState } from "react";
import { Drawer, Button, Input } from "@sos-sales/ui";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { apiClient, type CommercialThreadSummary } from "../../../services/api-client";

interface ProposalDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  thread: CommercialThreadSummary | null;
  workspaceId?: string;
  token?: string;
  onProposalCreated?: () => void;
}

interface ProposalItemInput {
  title: string;
  price: string;
  quantity: number;
}

export const ProposalDrawer: FC<ProposalDrawerProps> = ({
  isOpen,
  onClose,
  thread,
  workspaceId,
  token,
  onProposalCreated,
}) => {
  const [title, setTitle] = useState("Proposta Comercial");
  const [validUntil, setValidUntil] = useState("");
  const [items, setItems] = useState<ProposalItemInput[]>([
    { title: "Serviço / Produto Principal", price: "1500,00", quantity: 1 },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddItem = () => {
    setItems((prev) => [...prev, { title: "", price: "0,00", quantity: 1 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof ProposalItemInput, value: string | number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const parseCents = (val: string) => {
    const clean = val.replace(/\./g, "").replace(",", ".");
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : Math.round(num * 100);
  };

  const totalCents = items.reduce((acc, it) => acc + parseCents(it.price) * (it.quantity || 1), 0);

  const handleSubmit = async () => {
    if (!thread || !workspaceId || !token || !title.trim()) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await apiClient.createThreadProposal(
        workspaceId,
        thread.id,
        {
          contactId: thread.contactId,
          title: title.trim(),
          validUntil: validUntil ? new Date(validUntil).toISOString() : null,
          items: items.map((it) => ({
            title: it.title || "Item Comercial",
            unitPriceCents: parseCents(it.price),
            quantity: it.quantity || 1,
          })),
        },
        { token }
      );

      onProposalCreated?.();
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || "Falha ao criar proposta comercial.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Nova Proposta Comercial"
      description="Elabore a proposta de fechamento e vincule à negociação deste lead."
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", width: "100%" }}>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={isSubmitting || !title.trim() || items.length === 0}
            onClick={handleSubmit}
          >
            Criar Proposta
          </Button>
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

        <Input
          label="Título da Proposta"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Consultoria de Vendas + Licença"
        />

        <Input
          label="Validade (Opcional)"
          type="date"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 500 }}>
              Itens da Proposta
            </span>
            <Button size="xs" variant="secondary" prefixIcon={<Plus size={12} />} onClick={handleAddItem}>
              Adicionar Item
            </Button>
          </div>

          {items.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 100px 70px 32px",
                gap: "8px",
                alignItems: "end",
                padding: "8px",
                backgroundColor: "var(--bg-canvas)",
                borderRadius: "var(--radius-md, 8px)",
                border: "1px solid var(--border-default)",
              }}
            >
              <Input
                label="Item"
                value={item.title}
                onChange={(e) => handleItemChange(idx, "title", e.target.value)}
                placeholder="Descrição"
              />
              <Input
                label="Preço (R$)"
                value={item.price}
                onChange={(e) => handleItemChange(idx, "price", e.target.value)}
                placeholder="0,00"
              />
              <Input
                label="Qtd"
                type="number"
                min={1}
                value={String(item.quantity)}
                onChange={(e) => handleItemChange(idx, "quantity", parseInt(e.target.value, 10) || 1)}
              />
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveItem(idx)}
                  style={{
                    height: "32px",
                    width: "32px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-danger)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title="Remover Item"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Total Summary */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px",
            backgroundColor: "var(--color-action-subtle)",
            borderRadius: "var(--radius-md, 8px)",
            border: "1px solid rgba(0, 128, 105, 0.2)",
          }}
        >
          <span style={{ fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 500 }}>
            Valor Total da Proposta:
          </span>
          <span
            style={{
              fontSize: "var(--font-size-lg, 1.125rem)",
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              color: "var(--color-action)",
            }}
          >
            {(totalCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
        </div>
      </div>
    </Drawer>
  );
};
