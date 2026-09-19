/**
 * SOS Sales V3 — SettingsPage (MCT OS v2.0)
 * Real destination for the "Configurações" navigation item.
 * Displays real active workspace parameters from Fastify API.
 */

import { type FC } from "react";
import { Badge, LoadingState, Alert } from "@sos-sales/ui";
import type { UseSessionReturn } from "../hooks/useSession";
import { Settings, Building2, ShieldCheck, Clock, Coins } from "lucide-react";

export const SettingsPage: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const { activeWorkspaceDetails, isLoadingWorkspace } = session;

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
          <Settings size={16} color="var(--color-operational, #2563EB)" />
          <span style={{ fontWeight: 600, color: "var(--text-primary, #0F172A)" }}>
            Configurações do Tenant
          </span>
        </div>

        <div>
          <Badge variant="operational">
            Workspace: {session.activeWorkspace?.name || "Nenhum"}
          </Badge>
        </div>
      </div>

      <div style={{ padding: "32px 24px", maxWidth: "800px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>
        {isLoadingWorkspace ? (
          <LoadingState variant="skeleton" lines={5} text="Carregando parâmetros do workspace..." />
        ) : activeWorkspaceDetails ? (
          <div
            style={{
              backgroundColor: "var(--bg-surface, #FFFFFF)",
              borderRadius: "var(--radius-lg, 12px)",
              border: "1px solid var(--border-default, #E2E8F0)",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", borderBottom: "1px solid var(--border-subtle, #F1F5F9)", paddingBottom: "16px" }}>
              <Building2 size={24} color="var(--color-operational, #2563EB)" />
              <div>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary, #0F172A)" }}>
                  {activeWorkspaceDetails.workspace.name}
                </h2>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-muted, #94A3B8)" }}>
                  ID: {activeWorkspaceDetails.workspace.id} • Slug: {activeWorkspaceDetails.workspace.slug}
                </span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "0.875rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ color: "var(--text-muted, #94A3B8)", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Clock size={14} /> Fuso Horário
                </span>
                <strong>{activeWorkspaceDetails.workspace.timezone}</strong>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ color: "var(--text-muted, #94A3B8)", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Coins size={14} /> Moeda Padrão
                </span>
                <strong>{activeWorkspaceDetails.workspace.currency}</strong>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ color: "var(--text-muted, #94A3B8)", fontSize: "0.8rem" }}>
                  Status Operacional
                </span>
                <div>
                  <Badge variant={activeWorkspaceDetails.workspace.isActive ? "action" : "danger"}>
                    {activeWorkspaceDetails.workspace.isActive ? "Tenant Ativo" : "Inativo"}
                  </Badge>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ color: "var(--text-muted, #94A3B8)", fontSize: "0.8rem" }}>
                  Papel Concedido
                </span>
                <div>
                  <Badge variant="operational">{activeWorkspaceDetails.userRole}</Badge>
                </div>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border-subtle, #F1F5F9)", paddingTop: "16px" }}>
              <span style={{ color: "var(--text-muted, #94A3B8)", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                <ShieldCheck size={14} color="var(--color-action, #00A884)" /> Permissões Atribuídas
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {activeWorkspaceDetails.permissions.map((p) => (
                  <span
                    key={p}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.75rem",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      backgroundColor: "var(--color-operational-subtle, #EFF6FF)",
                      color: "var(--color-operational, #2563EB)",
                      border: "1px solid var(--color-operational-border, #BFDBFE)",
                    }}
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <Alert variant="info" title="Nenhum Workspace Selecionado">
            Conecte-se com um token válido e selecione um workspace para visualizar seus parâmetros de configuração.
          </Alert>
        )}

        <div
          style={{
            padding: "16px",
            borderRadius: "var(--radius-md, 8px)",
            border: "1px dashed var(--border-strong, #CBD5E1)",
            backgroundColor: "var(--bg-canvas, #F8FAFC)",
            fontSize: "0.8rem",
            color: "var(--text-secondary, #475569)",
          }}
        >
          <strong>Configurações Avançadas (Próxima Sprint):</strong> Gerenciamento de chaves de API, webhooks da Evolution API, números de contingência e taxas de câmbio serão disponibilizados nas próximas iterações.
        </div>
      </div>
    </div>
  );
};
