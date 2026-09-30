import { useState, useEffect, useCallback, type FC } from "react";
import {
  PageHeader,
  Button,
  Input,
  EmptyState,
  LoadingState,
  SegmentedControl,
} from "@sos-sales/ui";
import { Plus, Package, Search } from "lucide-react";
import { apiClient, type ProductRecord } from "../../services/api-client";
import type { UseSessionReturn } from "../../hooks/useSession";
import { CreateProductDialog } from "./CreateProductDialog";
import { ProductsTable } from "./ProductsTable";

interface ProductsPageProps {
  session: UseSessionReturn;
}

export const ProductsPage: FC<ProductsPageProps> = ({ session }) => {
  const workspaceId = session.activeWorkspace?.id;
  const token = session.token;

  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const fetchProducts = useCallback(async () => {
    if (!workspaceId || !token) return;
    setIsLoading(true);
    try {
      const res = await apiClient.getProducts(workspaceId, {}, { token });
      setProducts(res.products || []);
    } catch {
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, token]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const filteredProducts = products.filter((p) => {
    if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
    if (search.trim()) {
      const term = search.toLowerCase();
      const matchTitle = p.title.toLowerCase().includes(term);
      const matchSku = p.retailerId.toLowerCase().includes(term);
      const matchCategory = p.category.toLowerCase().includes(term);
      if (!matchTitle && !matchSku && !matchCategory) return false;
    }
    return true;
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--bg-canvas)",
        overflowY: "auto",
        padding: "var(--space-6)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: "1080px",
          width: "100%",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <PageHeader
          title="Produtos & Catálogo"
          description="Catálogo de produtos e serviços para geração ágil de cobranças Pix e propostas comerciais no Cockpit."
          actions={
            <Button
              size="sm"
              variant="primary"
              prefixIcon={<Plus size={14} />}
              onClick={() => setIsCreateOpen(true)}
            >
              Novo Produto
            </Button>
          }
        />

        {/* Search & Filters */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ maxWidth: "340px", width: "100%" }}>
            <Input
              placeholder="Buscar por título, SKU ou categoria..."
              prefixIcon={<Search size={16} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <SegmentedControl
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "ALL", label: `Todos (${products.length})` },
              { value: "ACTIVE", label: "Ativos" },
              { value: "INACTIVE", label: "Inativos" },
            ]}
          />
        </div>

        {/* Content Section */}
        {isLoading && products.length === 0 ? (
          <div style={{ padding: "32px 0" }}>
            <LoadingState variant="skeleton" lines={4} text="Carregando catálogo de produtos..." />
          </div>
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            icon={<Package size={48} />}
            title="Nenhum produto cadastrado"
            description="Cadastre produtos com SKU e preço para integrá-los às cobranças Pix do Cockpit."
            action={
              <Button
                variant="primary"
                size="sm"
                prefixIcon={<Plus size={14} />}
                onClick={() => setIsCreateOpen(true)}
              >
                Cadastrar Primeiro Produto
              </Button>
            }
          />
        ) : (
          <ProductsTable products={filteredProducts} />
        )}
      </div>

      {workspaceId && token && (
        <CreateProductDialog
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          workspaceId={workspaceId}
          token={token}
          onCreated={fetchProducts}
        />
      )}
    </div>
  );
};
