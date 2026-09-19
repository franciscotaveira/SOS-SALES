/**
 * SOS Sales V3 — CampaignsPage (MCT OS v2.0)
 * Real destination for the "Disparos CAPI" navigation item.
 * Conforms to Truth in Data: zero fake metrics or campaigns.
 */

import { type FC } from "react";
import { Badge, EmptyState, Alert } from "@sos-sales/ui";
import type { UseSessionReturn } from "../hooks/useSession";
import { Send, Megaphone } from "lucide-react";

export const CampaignsPage: FC<{ session: UseSessionReturn }> = ({ session }) => {
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
            Disparos & Campanhas CAPI
          </span>
          <Badge variant="warning">Iteração 5 (Planejada)</Badge>
        </div>

        <div>
          <Badge variant="operational">
            Workspace: {session.activeWorkspace?.name || "Nenhum"}
          </Badge>
        </div>
      </div>

      <div style={{ padding: "32px 24px", maxWidth: "900px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>
        <Alert variant="info" title="Arquitetura de Atribuição Meta CAPI">
          O motor de conversões enviará eventos server-side (Lead, Purchase) com deduplicação de `event_id`, janela CTWA de 72 horas e hash SHA-256 de dados normalizados.
        </Alert>

        <EmptyState
          icon={<Megaphone size={36} />}
          title="Nenhuma Campanha Criada"
          description="Este módulo permitirá orquestrar listas de transmissão segmentadas e disparos em lote com controle estrito de cadência (anti-bloqueio) e telemetria de conversão."
        />
      </div>
    </div>
  );
};
