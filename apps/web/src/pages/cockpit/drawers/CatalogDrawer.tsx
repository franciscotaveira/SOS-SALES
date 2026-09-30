import { type FC, useState, useEffect } from "react";
import { Drawer, Button } from "@sos-sales/ui";
import { Send } from "lucide-react";
import { apiClient, type ProductRecord } from "../../../services/api-client";

interface CatalogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  thread?: unknown;
  workspaceId?: string;
  token?: string;
  onSendProduct?: (product: ProductRecord) => void;
}

export const CatalogDrawer: FC<CatalogDrawerProps> = ({
  isOpen,
  onClose,
  workspaceId,
  token,
  onSendProduct,
}) => {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !workspaceId || !token) return;
    setLoading(true);
    apiClient
      .getProducts(workspaceId, {}, { token })
      .then((res) => setProducts(res.products || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, workspaceId, token]);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Catálogo de Produtos"
      description="Selecione um produto cadastrado para enviar oferta ao cliente."
      footer={
        <Button size="sm" variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "16px", color: "var(--text-secondary)" }}>
            Carregando catálogo...
          </div>
        ) : products.length === 0 ? (
          <div style={{ textAlign: "center", padding: "16px", color: "var(--text-secondary)" }}>
            Nenhum produto cadastrado no workspace.
          </div>
        ) : (
          products.map((p) => {
            const formattedPrice = (p.priceCents / 100).toLocaleString("pt-BR", {
              style: "currency",
              currency: p.currency || "BRL",
            });

            return (
              <div
                key={p.id}
                style={{
                  padding: "10px 12px",
                  backgroundColor: "var(--bg-canvas)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-md, 8px)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 500 }}>
                    {p.title}
                  </div>
                  <div
                    style={{
                      fontSize: "var(--font-size-xs, 0.75rem)",
                      color: "var(--color-action)",
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                      marginTop: "2px",
                    }}
                  >
                    {p.priceFormatted || formattedPrice}
                  </div>
                </div>

                {onSendProduct && (
                  <Button
                    size="xs"
                    variant="primary"
                    prefixIcon={<Send size={12} />}
                    onClick={() => {
                      onSendProduct(p);
                      onClose();
                    }}
                  >
                    Enviar
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>
    </Drawer>
  );
};
