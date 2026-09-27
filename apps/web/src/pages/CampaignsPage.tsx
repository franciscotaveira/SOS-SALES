/**
 * SOS Sales V3 — CampaignsPage (MCT OS v2.0)
 * Real destination for the "Disparos CAPI" navigation item.
 * Conforms to Truth in Data: live audit of Meta Conversions API events.
 */

import { useState, useEffect, type FC } from "react";
import { Badge, EmptyState, Alert, Button, LoadingState } from "@sos-sales/ui";
import type { UseSessionReturn } from "../hooks/useSession";
import { apiClient } from "../services/api-client";
import { Send, RefreshCw, ShieldCheck, DollarSign } from "lucide-react";

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

export const CampaignsPage: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const { activeWorkspace, token } = session;
  const [items, setItems] = useState<ConversionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  const loadConversions = async () => {
    if (!activeWorkspace || !token) return;
    setIsLoading(true);
    try {
      const res = await apiClient.getConversions(activeWorkspace.id, { token });
      setItems(res.items);
      setLastRefreshedAt(new Date());
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConversions();
  }, [activeWorkspace?.id, token]);

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
        minHeight: "calc(100vh - 64px)",
        backgroundColor: "var(--bg-canvas, #F8FAFC)",
      }}
    >
      {/* Sub-header de Contexto */}
      <div
        style={{
          height: "48px",
          backgroundColor: "var(--bg-surface, #FFFFFF)",
          borderBottom: "1px solid var(--border-default, #E2E8F0)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          fontSize: "0.85rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Send size={16} color="var(--color-action, #00A884)" />
          <span style={{ fontWeight: 600, color: "var(--text-primary, #0F172A)" }}>
            Telemetria & Conversões Meta CAPI
          </span>
          <Badge variant="operational">
            {items.length} {items.length === 1 ? "Evento" : "Eventos"}
          </Badge>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #94A3B8)" }}>
            Última sync: {lastRefreshedAt.toLocaleTimeString()}
          </span>
          <Button size="sm" variant="outline" onClick={loadConversions} disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            Atualizar
          </Button>
          <Badge variant="operational">
            Workspace: {session.activeWorkspace?.name || "Nenhum"}
          </Badge>
        </div>
      </div>

      <div
        style={{
          padding: "32px 24px",
          maxWidth: "1000px",
          width: "100%",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        <Alert variant="info" title="Atribuição Server-Side & Meta CAPI">
          Todos os fechamentos comerciais realizados no Cockpit ("Venda Ganha") gravam um desfecho financeiro real e enfileiram imediatamente um evento canônico (Purchase/Lead) para o Graph API da Meta, protegendo dados sensíveis com hash SHA-256 e janela de atribuição de 72h.
        </Alert>

        {isLoading && items.length === 0 ? (
          <LoadingState variant="skeleton" lines={5} text="Carregando telemetria de conversões..." />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<DollarSign size={36} />}
            title="Nenhum Evento de Conversão Gravado"
            description="Abra uma conversa no Cockpit de Vendas, registre um fechamento comercial (Venda Ganha) para ver o despacho automático em tempo real nesta auditoria."
          />
        ) : (
          <div
            style={{
              backgroundColor: "var(--bg-surface, #FFFFFF)",
              borderRadius: "var(--radius-lg, 12px)",
              border: "1px solid var(--border-default, #E2E8F0)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--border-subtle, #F1F5F9)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0 }}>
                Trilha de Auditoria CAPI (Últimos Eventos)
              </h3>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary, #64748B)" }}>
                Governança RLS estrita por tenant
              </span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                <thead>
                  <tr style={{ backgroundColor: "var(--bg-canvas, #F8FAFC)", borderBottom: "1px solid var(--border-default, #E2E8F0)" }}>
                    <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-secondary, #475569)" }}>Evento</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-secondary, #475569)" }}>Status CAPI</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-secondary, #475569)" }}>Valor Financeiro</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-secondary, #475569)" }}>ID da Oportunidade</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-secondary, #475569)" }}>Data / Hora</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: "1px solid var(--border-subtle, #F1F5F9)",
                        transition: "background-color 0.15s ease",
                      }}
                    >
                      <td style={{ padding: "14px 16px", fontWeight: 600, color: "var(--text-primary, #0F172A)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <ShieldCheck size={16} color="var(--color-action, #00A884)" />
                          {item.eventName}
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        {getStatusBadge(item.status)}
                      </td>
                      <td style={{ padding: "14px 16px", fontWeight: 700, color: "var(--color-action, #00A884)" }}>
                        {item.valueCents != null
                          ? `R$ ${(item.valueCents / 100).toFixed(2).replace(".", ",")}`
                          : "—"}
                      </td>
                      <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-muted, #94A3B8)" }}>
                        {item.journeyId.substring(0, 8)}...
                      </td>
                      <td style={{ padding: "14px 16px", color: "var(--text-secondary, #64748B)" }}>
                        {new Date(item.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
