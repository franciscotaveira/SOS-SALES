import { useState, useEffect, useCallback, useMemo, type FC } from "react";
import { PageHeader, Button, LoadingState, EmptyState, Badge } from "@sos-sales/ui";
import { Plus, TrendingUp, RefreshCw } from "lucide-react";
import type { UseSessionReturn } from "../../hooks/useSession";
import { apiClient, type ContactSummary, type JourneySummary } from "../../services/api-client";
import { STAGES, formatCents } from "./stages";
import { NewOpportunityDialog } from "./NewOpportunityDialog";

// API caps: contacts query max(100) (zod), journeys clamped to 100 in packages/database/src/commercial.ts
const LIST_LIMIT = 100;

export const OpportunitiesPage: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const { activeWorkspace, token } = session;
  const [journeys, setJourneys] = useState<JourneySummary[]>([]);
  const [contacts, setContacts] = useState<ContactSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspace || !token) return;
    const workspaceId = activeWorkspace.id;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [journeyRes, contactRes] = await Promise.all([
        apiClient.listJourneys(workspaceId, { limit: LIST_LIMIT }, { token }),
        apiClient.getContacts(workspaceId, { limit: LIST_LIMIT }, { token }),
      ]);
      if (activeWorkspace.id !== workspaceId) return;
      setJourneys(journeyRes.items || []);
      setContacts(contactRes.contacts || []);
    } catch (err: unknown) {
      if (activeWorkspace.id !== workspaceId) return;
      setErrorMsg((err as Error).message || "Falha ao carregar oportunidades.");
    } finally {
      if (activeWorkspace.id === workspaceId) setIsLoading(false);
    }
  }, [activeWorkspace, token]);

  useEffect(() => {
    load();
  }, [load]);

  const contactNames = useMemo(
    () => new Map(contacts.map((c) => [c.id, c.name || c.phoneE164])),
    [contacts]
  );

  const columns = useMemo(
    () =>
      STAGES.map((stage) => {
        const items = journeys.filter((j) => j.stage === stage.id);
        const totalCents = items.reduce((sum, j) => sum + (j.estimatedValueCents ?? 0), 0);
        return { ...stage, items, totalCents };
      }),
    [journeys]
  );

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
      <div style={{ width: "100%", maxWidth: "1400px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
        <PageHeader
          title="Oportunidades"
          description="Funil de vendas por etapa, com valor estimado de cada negociação."
          actions={
            <div style={{ display: "flex", gap: "8px" }}>
              <Button size="sm" variant="secondary" prefixIcon={<RefreshCw size={14} />} onClick={load} disabled={isLoading}>
                Atualizar
              </Button>
              <Button size="sm" variant="primary" prefixIcon={<Plus size={14} />} onClick={() => setIsDialogOpen(true)}>
                Nova Oportunidade
              </Button>
            </div>
          }
        />

        {errorMsg && (
          <div
            role="alert"
            style={{
              padding: "10px 14px",
              backgroundColor: "var(--color-danger-subtle)",
              color: "var(--color-danger)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-sm)",
            }}
          >
            {errorMsg}
          </div>
        )}

        {journeys.length >= LIST_LIMIT && (
          <div
            role="status"
            style={{
              padding: "8px 14px",
              backgroundColor: "var(--bg-surface-elevated)",
              color: "var(--text-secondary)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            Mostrando apenas as primeiras {LIST_LIMIT} oportunidades. Pode haver mais não exibidas.
          </div>
        )}

        {isLoading && journeys.length === 0 ? (
          <LoadingState variant="skeleton" lines={5} text="Carregando oportunidades..." />
        ) : journeys.length === 0 && !errorMsg ? (
          <EmptyState
            icon={<TrendingUp size={48} />}
            title="Nenhuma oportunidade ainda"
            description="Crie uma oportunidade para um lead e acompanhe-a pelo funil até o fechamento."
          />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--space-4, 16px)", alignItems: "start" }}>
            {columns.map((col) => (
              <section
                key={col.id}
                aria-label={col.label}
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-sm)",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <header
                  style={{
                    backgroundColor: "var(--bg-surface-elevated)",
                    borderBottom: "1px solid var(--border-strong)",
                    padding: "10px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)", color: "var(--text-primary)" }}>{col.label}</span>
                    <Badge variant="neutral">{col.items.length}</Badge>
                  </div>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                    {formatCents(col.totalCents)}
                  </span>
                </header>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "10px" }}>
                  {col.items.length === 0 ? (
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", textAlign: "center", padding: "12px 0" }}>
                      Vazio
                    </span>
                  ) : (
                    col.items.map((j) => (
                      <article
                        key={j.id}
                        style={{
                          backgroundColor: "var(--bg-canvas)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "var(--radius-md)",
                          padding: "8px 10px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        <span style={{ fontWeight: 500, fontSize: "var(--font-size-sm)", color: "var(--text-primary)" }}>
                          {contactNames.get(j.contactId) ?? "Lead"}
                        </span>
                        {j.title && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>{j.title}</span>}
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>
                            {j.estimatedValueCents != null ? formatCents(j.estimatedValueCents) : "—"}
                          </span>
                          <span>{new Date(j.createdAt).toLocaleDateString("pt-BR")}</span>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {activeWorkspace && token && (
        <NewOpportunityDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          onCreated={load}
          workspaceId={activeWorkspace.id}
          token={token}
          contacts={contacts}
        />
      )}
    </div>
  );
};

export default OpportunitiesPage;
