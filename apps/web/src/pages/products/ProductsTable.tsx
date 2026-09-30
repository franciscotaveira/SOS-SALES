import type { FC } from "react";
import { Badge, ListItem, useBreakpoint } from "@sos-sales/ui";
import { Package } from "lucide-react";
import type { ProductRecord } from "../../services/api-client";

interface ProductsTableProps {
  products: ProductRecord[];
}

export const ProductsTable: FC<ProductsTableProps> = ({ products }) => {
  const { isMobile } = useBreakpoint();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <Badge variant="action">Ativo</Badge>;
      case "OUT_OF_STOCK":
        return <Badge variant="warning">Esgotado</Badge>;
      default:
        return <Badge variant="neutral">Inativo</Badge>;
    }
  };

  if (isMobile) {
    return (
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-default)",
          overflow: "hidden",
        }}
      >
        {products.map((p) => (
          <ListItem
            key={p.id}
            height="md"
            leading={
              p.imageUrl ? (
                <img
                  src={p.imageUrl}
                  alt={p.title}
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "var(--radius-md)",
                    objectFit: "cover",
                    backgroundColor: "var(--bg-canvas)",
                  }}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "var(--color-operational-subtle)",
                    color: "var(--color-operational)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Package size={20} />
                </div>
              )
            }
            title={<span style={{ fontWeight: 600 }}>{p.title}</span>}
            subtitle={
              <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "2px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--font-size-xs)" }}>
                  {p.retailerId}
                </span>
                <span>•</span>
                <span>{p.category}</span>
              </div>
            }
            meta={
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                  {p.priceFormatted}
                </span>
                {getStatusBadge(p.status)}
              </div>
            }
          />
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: "var(--bg-surface)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-default)",
        overflow: "hidden",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          textAlign: "left",
          fontSize: "var(--font-size-sm)",
        }}
      >
        <thead>
          <tr
            style={{
              backgroundColor: "var(--bg-canvas)",
              borderBottom: "1px solid var(--border-default)",
              position: "sticky",
              top: 0,
              zIndex: 1,
            }}
          >
            <th style={{ padding: "0 16px", height: "48px", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
              Produto
            </th>
            <th style={{ padding: "0 16px", height: "48px", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
              SKU
            </th>
            <th style={{ padding: "0 16px", height: "48px", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
              Categoria
            </th>
            <th style={{ padding: "0 16px", height: "48px", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
              Preço
            </th>
            <th style={{ padding: "0 16px", height: "48px", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr
              key={p.id}
              style={{
                height: "48px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <td style={{ padding: "0 16px", fontWeight: 600, color: "var(--text-primary)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.title}
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "var(--radius-sm)",
                        objectFit: "cover",
                        backgroundColor: "var(--bg-canvas)",
                      }}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: "var(--color-operational-subtle)",
                        color: "var(--color-operational)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Package size={16} />
                    </div>
                  )}
                  <span>{p.title}</span>
                </div>
              </td>
              <td style={{ padding: "0 16px", fontFamily: "var(--font-mono)", fontSize: "var(--font-size-xs)" }}>
                {p.retailerId}
              </td>
              <td style={{ padding: "0 16px", color: "var(--text-secondary)" }}>
                {p.category}
              </td>
              <td
                style={{
                  padding: "0 16px",
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {p.priceFormatted}
              </td>
              <td style={{ padding: "0 16px" }}>
                {getStatusBadge(p.status)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
