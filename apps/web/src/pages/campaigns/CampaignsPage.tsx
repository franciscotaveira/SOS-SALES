import { useState, useEffect, type FC } from "react";
import { PageHeader, Badge, EmptyState, Button, LoadingState } from "@sos-sales/ui";
import type { UseSessionReturn } from "../../hooks/useSession";
import { apiClient } from "../../services/api-client";
import { RefreshCw, TrendingUp, CheckCircle, Clock, AlertTriangle } from "lucide-react";

interface ConversionItem {
  id: string;
  journeyId: string;
  outcomeId: string | null;
  eventName: string;
  valueCents: number | null;
  currency: string;
  status: string;
  providerReceipt: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
}

export const ConversoesPage: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const { activeWorkspace, token } = session;
  const [items, setItems] = useState<ConversionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  const loadConversions = async () => {
    if (!activeWorkspace || !token) return;
    setIsLoading(true);
    try {
      const res = await apiClient.getConversions(activeWorkspace.id, { token });
      setItems(res.items || []);
      setLastRefreshedAt(new Date());
    } catch {
      // Non-fatal
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConversions();
  }, [activeWorkspace?.id, token]);

  const acceptedCount = items.filter((i) => i.status === "ACCEPTED").length;
  const queuedCount = items.filter((i) => i.status === "QUEUED").length;
  const failedCount = items.filter((i) => i.status === "FAILED").length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACCEPTED":
        return <Badge variant="action">Despachado Meta</Badge>;
      case "QUEUED":
        return <Badge variant="warning">Na Fila Outbox</Badge>;
      case "FAILED":
        return <Badge variant="danger">Falha no Despacho</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

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
      <div style={{ maxWidth: "1080px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
        <PageHeader
          title="Conversões"
          description={`Auditoria de telemetria e eventos Meta Conversions API (CAPI) sob controle transacional · Atualizado às ${lastRefreshedAt.toLocaleTimeString("pt-BR")}`}
          actions={
            <Button
              size="sm"
              variant="secondary"
              prefixIcon={<RefreshCw size={14} className={isLoading ? "animate-spin" : undefined} />}
              onClick={loadConversions}
              disabled={isLoading}
            >
              Atualizar
            </Button>
          }
        />

        {/* KPI Metrics Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
          }}
        >
          {/* Card 1: Total */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-default)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
                Total de Eventos
              </span>
              <TrendingUp size={16} style={{ color: "var(--color-operational)" }} />
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 600,
                color: "var(--text-primary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {items.length}
            </div>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              Capturados no workspace
            </span>
          </div>

          {/* Card 2: Despachados Meta */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-default)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
                Despachados Meta
              </span>
              <CheckCircle size={16} style={{ color: "var(--color-action)" }} />
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 600,
                color: "var(--color-action)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {acceptedCount}
            </div>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              {items.length > 0 ? `${Math.round((acceptedCount / items.length) * 100)}% de sucesso` : "Sem dados"}
            </span>
          </div>

          {/* Card 3: Na Fila */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-default)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
                Na Fila Outbox
              </span>
              <Clock size={16} style={{ color: "var(--color-warning)" }} />
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 600,
                color: "var(--color-warning)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {queuedCount}
            </div>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              Aguardando worker de despacho
            </span>
          </div>

          {/* Card 4: Falhas */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-default)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
                Falhas
              </span>
              <AlertTriangle size={16} style={{ color: "var(--color-danger)" }} />
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 600,
                color: "var(--color-danger)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {failedCount}
            </div>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              Necessitam intervenção
            </span>
          </div>
        </div>

        {/* Content Section */}
        {isLoading && items.length === 0 ? (
          <div style={{ padding: "32px 0" }}>
            <LoadingState variant="skeleton" lines={4} text="Carregando eventos CAPI..." />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<TrendingUp size={48} />}
            title="Nenhuma conversão registrada"
            description="Os eventos Meta CAPI serão listados aqui assim que oportunidades forem ganhas ou marcadas no Cockpit."
          />
        ) : (
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-default)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "var(--font-size-sm)" }}>
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
                    Evento
                  </th>
                  <th style={{ padding: "0 16px", height: "48px", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                    Status
                  </th>
                  <th style={{ padding: "0 16px", height: "48px", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                    Valor (BRL)
                  </th>
                  <th style={{ padding: "0 16px", height: "48px", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                    Data
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const formattedValue = item.valueCents
                    ? (item.valueCents / 100).toLocaleString("pt-BR", { style: "currency", currency: item.currency || "BRL" })
                    : "—";

                  return (
                    <tr
                      key={item.id}
                      style={{
                        height: "48px",
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      <td style={{ padding: "0 16px", fontWeight: 500, color: "var(--text-primary)" }}>
                        {item.eventName}
                      </td>
                      <td style={{ padding: "0 16px" }}>
                        {getStatusBadge(item.status)}
                      </td>
                      <td
                        style={{
                          padding: "0 16px",
                          fontFamily: "var(--font-mono, monospace)",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 500,
                          color: "var(--text-primary)",
                        }}
                      >
                        {formattedValue}
                      </td>
                      <td style={{ padding: "0 16px", color: "var(--text-secondary)", fontSize: "var(--font-size-xs)" }}>
                        {new Date(item.createdAt).toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export const CampaignsPage = ConversoesPage;
export default ConversoesPage;
