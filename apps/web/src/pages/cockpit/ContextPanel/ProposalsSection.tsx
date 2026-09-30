import { type FC, useState } from "react";
import { Badge, Button } from "@sos-sales/ui";
import { Plus, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import type { CommercialProposalSummary } from "../../../services/api-client";

interface ProposalsSectionProps {
  proposals: CommercialProposalSummary[];
  onCreateProposal: () => void;
  onUpdateStatus: (proposalId: string, status: CommercialProposalSummary["status"]) => Promise<void>;
  onGeneratePix?: (proposal: CommercialProposalSummary) => void;
  error?: string | null;
}

export const ProposalsSection: FC<ProposalsSectionProps> = ({
  proposals,
  onCreateProposal,
  onUpdateStatus,
  onGeneratePix,
  error,
}) => {
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const getStatusBadge = (status: CommercialProposalSummary["status"]) => {
    switch (status) {
      case "accepted":
        return <Badge variant="action">Aceita</Badge>;
      case "sent":
        return <Badge variant="operational">Enviada</Badge>;
      case "draft":
        return <Badge variant="neutral">Rascunho</Badge>;
      case "rejected":
        return <Badge variant="danger">Recusada</Badge>;
      case "expired":
        return <Badge variant="warning">Expirada</Badge>;
      case "cancelled":
        return <Badge variant="neutral">Cancelada</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const handleStatusChange = async (proposalId: string, nextStatus: CommercialProposalSummary["status"]) => {
    setUpdatingId(proposalId);
    try {
      await onUpdateStatus(proposalId, nextStatus);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
          {proposals.length} proposta(s)
        </span>
        <Button
          size="xs"
          variant="secondary"
          prefixIcon={<Plus size={13} />}
          onClick={onCreateProposal}
        >
          Nova Proposta
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 8px",
            backgroundColor: "var(--color-danger-subtle)",
            color: "var(--color-danger)",
            borderRadius: "var(--radius-sm, 6px)",
            fontSize: "var(--font-size-xs, 0.75rem)",
          }}
        >
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {proposals.length === 0 ? (
        <div
          style={{
            fontSize: "var(--font-size-xs, 0.75rem)",
            color: "var(--text-secondary)",
            fontStyle: "italic",
          }}
        >
          Nenhuma proposta comercial registrada.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {proposals.map((proposal) => {
            const formattedTotal = (proposal.totalCents / 100).toLocaleString("pt-BR", {
              style: "currency",
              currency: proposal.currency || "BRL",
            });

            return (
              <div
                key={proposal.id}
                style={{
                  padding: "8px 10px",
                  backgroundColor: "var(--bg-canvas)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-md, 8px)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 500 }}>
                    {proposal.title}
                  </span>
                  {getStatusBadge(proposal.status)}
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "var(--font-size-xs, 0.75rem)",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--text-primary)",
                    }}
                  >
                    {formattedTotal}
                  </span>
                  {proposal.items.length > 0 && (
                    <span style={{ color: "var(--text-secondary)" }}>
                      {proposal.items.length} item(ns)
                    </span>
                  )}
                </div>

                {/* State Machine Transition Actions */}
                <div style={{ display: "flex", gap: "6px", marginTop: "4px", flexWrap: "wrap" }}>
                  {proposal.status === "draft" && (
                    <Button
                      size="xs"
                      variant="primary"
                      disabled={updatingId === proposal.id}
                      onClick={() => handleStatusChange(proposal.id, "sent")}
                    >
                      Marcar Enviada
                    </Button>
                  )}
                  {proposal.status === "sent" && (
                    <>
                      <Button
                        size="xs"
                        variant="primary"
                        prefixIcon={<CheckCircle size={12} />}
                        disabled={updatingId === proposal.id}
                        onClick={() => handleStatusChange(proposal.id, "accepted")}
                      >
                        Aceitar
                      </Button>
                      <Button
                        size="xs"
                        variant="secondary"
                        prefixIcon={<XCircle size={12} />}
                        disabled={updatingId === proposal.id}
                        onClick={() => handleStatusChange(proposal.id, "rejected")}
                      >
                        Recusar
                      </Button>
                    </>
                  )}
                  {proposal.status === "accepted" && onGeneratePix && (
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => onGeneratePix(proposal)}
                    >
                      Cobrar Pix
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
