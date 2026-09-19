/**
 * SOS Sales V3 — ContactsPage (MCT OS v2.0)
 * Real destination for the "Contatos & Leads" navigation item.
 * Conforms to Truth in Data: zero simulated contacts.
 */

import { useState, type FC } from "react";
import { Input, Badge, EmptyState } from "@sos-sales/ui";
import type { UseSessionReturn } from "../hooks/useSession";
import { Search, Users, PhoneCall } from "lucide-react";

export const ContactsPage: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "leads" | "customers">("all");

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
          <Users size={16} color="var(--color-operational, #2563EB)" />
          <span style={{ fontWeight: 600, color: "var(--text-primary, #0F172A)" }}>
            Contatos & Leads
          </span>
          <Badge variant="neutral">0 Cadastrados</Badge>
        </div>

        <div>
          <Badge variant="operational">
            Workspace: {session.activeWorkspace?.name || "Nenhum"}
          </Badge>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ padding: "24px", maxWidth: "1000px", width: "100%", margin: "0 auto" }}>
        {/* Filters and Search */}
        <div
          style={{
            backgroundColor: "var(--bg-surface, #FFFFFF)",
            padding: "16px 20px",
            borderRadius: "var(--radius-lg, 12px)",
            border: "1px solid var(--border-default, #E2E8F0)",
            marginBottom: "24px",
            display: "flex",
            gap: "16px",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Input
            placeholder="Buscar por telefone, nome ou tag..."
            prefixIcon={<Search size={16} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "320px", fontSize: "0.85rem" }}
          />

          <div style={{ display: "flex", gap: "8px" }}>
            {(["all", "leads", "customers"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "var(--radius-sm, 6px)",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  border: "none",
                  backgroundColor:
                    filter === f ? "var(--color-operational-subtle, #EFF6FF)" : "transparent",
                  color:
                    filter === f
                      ? "var(--color-operational, #2563EB)"
                      : "var(--text-secondary, #475569)",
                  cursor: "pointer",
                }}
              >
                {f === "all" ? "Todos (0)" : f === "leads" ? "Leads (0)" : "Clientes (0)"}
              </button>
            ))}
          </div>
        </div>

        {/* Honest Empty State */}
        <EmptyState
          icon={<PhoneCall size={32} />}
          title="Nenhum Contato Registrado no Tenant"
          description="A captura automática de contatos, resolução de identidade telefônica e histórico de conversas serão ativados na Iteração 4 com a conexão da Evolution API e webhooks."
        />
      </div>
    </div>
  );
};
