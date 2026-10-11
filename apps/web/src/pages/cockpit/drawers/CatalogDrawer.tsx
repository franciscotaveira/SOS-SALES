import { type FC, useState, useEffect, useMemo } from "react";
import { Drawer, Button, Input } from "@sos-sales/ui";
import { Send, Layers, Search, Package } from "lucide-react";
import { apiClient, type ProductRecord } from "../../../services/api-client";

interface CatalogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  thread?: unknown;
  workspaceId?: string;
  token?: string;
  onSendProduct?: (product: ProductRecord) => void;
  onSendProducts?: (products: ProductRecord[]) => void;
}

export const CatalogDrawer: FC<CatalogDrawerProps> = ({
  isOpen,
  onClose,
  workspaceId,
  token,
  onSendProduct,
  onSendProducts,
}) => {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen || !workspaceId || !token) return;
    setLoading(true);
    setSelectedIds(new Set());
    setSearchTerm("");
    apiClient
      .getProducts(workspaceId, {}, { token })
      .then((res) => setProducts(res.products || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, workspaceId, token]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) =>
        p.title.toLowerCase().includes(term) ||
        p.category?.toLowerCase().includes(term) ||
        p.retailerId?.toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedProducts = useMemo(() => {
    return products.filter((p) => selectedIds.has(p.id));
  }, [products, selectedIds]);

  const handleSendSingle = (product: ProductRecord) => {
    if (onSendProduct) {
      onSendProduct(product);
      onClose();
    }
  };

  const handleSendMultiple = () => {
    if (selectedProducts.length === 1 && onSendProduct) {
      onSendProduct(selectedProducts[0]!);
      onClose();
    } else if (selectedProducts.length > 1 && onSendProducts) {
      onSendProducts(selectedProducts);
      onClose();
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Catálogo & Ofertas"
      description="Selecione produtos para enviar oferta individual ou carrossel comercial."
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Fechar
          </Button>

          {selectedProducts.length > 0 && (
            <Button
              size="sm"
              variant="primary"
              prefixIcon={<Layers size={14} />}
              onClick={handleSendMultiple}
            >
              Enviar {selectedProducts.length} {selectedProducts.length > 1 ? "Produtos (Carrossel)" : "Produto"}
            </Button>
          )}
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Search */}
        <Input
          placeholder="Buscar por nome, categoria ou SKU..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          prefixIcon={<Search size={14} color="var(--text-secondary)" />}
        />

        {selectedProducts.length > 0 && (
          <div
            style={{
              padding: "8px 12px",
              backgroundColor: "var(--color-primary-subtle, rgba(16, 185, 129, 0.1))",
              border: "1px solid var(--color-primary, #10b981)",
              borderRadius: "var(--radius-md, 8px)",
              fontSize: "var(--font-size-xs, 0.75rem)",
              color: "var(--text-primary)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              <strong>{selectedProducts.length}</strong> {selectedProducts.length > 1 ? "itens selecionados para carrossel" : "item selecionado"}
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontSize: "var(--font-size-xs, 0.75rem)",
                textDecoration: "underline",
              }}
            >
              Limpar seleção
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "24px", color: "var(--text-secondary)" }}>
            Carregando catálogo...
          </div>
        ) : filteredProducts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px", color: "var(--text-secondary)" }}>
            {searchTerm ? "Nenhum produto encontrado com este termo." : "Nenhum produto cadastrado no workspace."}
          </div>
        ) : (
          filteredProducts.map((p) => {
            const formattedPrice = (p.priceCents / 100).toLocaleString("pt-BR", {
              style: "currency",
              currency: p.currency || "BRL",
            });
            const isSelected = selectedIds.has(p.id);

            return (
              <div
                key={p.id}
                style={{
                  padding: "10px 12px",
                  backgroundColor: isSelected ? "var(--bg-surface-elevated, #f0fdf4)" : "var(--bg-canvas)",
                  border: isSelected ? "1.5px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
                  borderRadius: "var(--radius-md, 8px)",
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                  transition: "all 0.15s ease",
                }}
              >
                {/* Selection checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(p.id)}
                  style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "var(--color-primary, #10b981)" }}
                  title="Selecionar para carrossel"
                />

                {/* Product thumbnail */}
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt={p.title}
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "6px",
                      objectFit: "cover",
                      backgroundColor: "var(--bg-surface)",
                      border: "1px solid var(--border-default)",
                      flexShrink: 0,
                    }}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "6px",
                      backgroundColor: "var(--bg-surface-elevated, #f3f4f6)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--text-secondary)",
                      flexShrink: 0,
                    }}
                  >
                    <Package size={20} />
                  </div>
                )}

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "var(--font-size-sm, 0.875rem)",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {p.title}
                  </div>
                  {p.description && (
                    <div
                      style={{
                        fontSize: "var(--font-size-xs, 0.75rem)",
                        color: "var(--text-secondary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        marginTop: "1px",
                      }}
                    >
                      {p.description}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: "var(--font-size-xs, 0.75rem)",
                      color: "var(--color-action, #059669)",
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      marginTop: "2px",
                    }}
                  >
                    {p.priceFormatted || formattedPrice}
                  </div>
                </div>

                {/* Action button */}
                {onSendProduct && (
                  <Button
                    size="xs"
                    variant="primary"
                    prefixIcon={<Send size={12} />}
                    onClick={() => handleSendSingle(p)}
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
