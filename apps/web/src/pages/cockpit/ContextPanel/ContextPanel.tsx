import type { FC } from "react";
import { IconButton } from "@sos-sales/ui";
import { X } from "lucide-react";
import type {
  CommercialThreadSummary,
  CommercialProposalSummary,
} from "../../../services/api-client";
import { LeadSummary } from "./LeadSummary";
import { PixStatus } from "./PixStatus";
import { OutcomeActions } from "./OutcomeActions";
import { Notes } from "./Notes";
import { ProposalsSection } from "./ProposalsSection";
import { JourneyTimeline } from "./JourneyTimeline";

interface ContextPanelProps {
  thread: CommercialThreadSummary;
  onClose?: () => void;
  // Journey & lead
  journeyStage?: string | null;
  estimatedValueCents?: number | null;
  // Proposals (F3)
  proposals?: CommercialProposalSummary[];
  onCreateProposal?: () => void;
  onUpdateProposalStatus?: (
    proposalId: string,
    status: CommercialProposalSummary["status"]
  ) => Promise<void>;
  onGenerateProposalPix?: (proposal: CommercialProposalSummary) => void;
  proposalError?: string | null;
  // Pix
  pixStatus?: "paid" | "pending" | "none";
  pixPaidAt?: string | null;
  onGeneratePix?: () => void;
  // Notes
  notes?: string;
  onSaveNotes?: (notes: string) => void;
  isSavingNotes?: boolean;
  // Outcome
  onMarkWon?: () => void;
  onMarkLost?: () => void;
  currentOutcome?: "won" | "lost" | null;
  // Action History
  actionHistory?: Array<{ id: string; actionType: string; actor?: string | null; createdAt: string }>;
  isMobile?: boolean;
}

export const ContextPanel: FC<ContextPanelProps> = ({
  thread,
  onClose,
  journeyStage,
  estimatedValueCents,
  proposals = [],
  onCreateProposal,
  onUpdateProposalStatus,
  onGenerateProposalPix,
  proposalError,
  pixStatus,
  pixPaidAt,
  onGeneratePix,
  notes,
  onSaveNotes,
  isSavingNotes,
  onMarkWon,
  onMarkLost,
  currentOutcome,
  actionHistory,
  isMobile = false,
}) => {
  return (
    <aside
      aria-label="Painel de Contexto do Lead"
      style={{
        width: isMobile ? "100%" : "var(--context-panel-w, 360px)",
        minWidth: isMobile ? "100%" : "var(--context-panel-w, 360px)",
        maxWidth: isMobile ? "100%" : "var(--context-panel-w, 360px)",
        height: "100%",
        backgroundColor: "var(--bg-surface)",
        borderLeft: isMobile ? "none" : "1px solid var(--border-default)",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          height: "var(--topbar-h, 56px)",
          minHeight: "var(--topbar-h, 56px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 var(--space-4, 16px)",
          borderBottom: "1px solid var(--border-default)",
          boxSizing: "border-box",
        }}
      >
        <span
          style={{
            fontSize: "var(--font-size-sm, 0.875rem)",
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          Contexto do Lead
        </span>
        {onClose && (
          <IconButton
            aria-label="Fechar contexto do lead"
            icon={<X size={16} />}
            size="sm"
            variant="ghost"
            onClick={onClose}
          />
        )}
      </div>

      {/* Scrollable Sections */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--space-4, 16px)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {/* Section: Resumo do Lead */}
        <div>
          <div
            style={{
              fontSize: "var(--font-size-xs, 0.75rem)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--text-muted)",
              marginBottom: "10px",
            }}
          >
            Lead & Origem
          </div>
          <LeadSummary
            thread={thread}
            journeyStage={journeyStage}
            estimatedValueCents={estimatedValueCents}
          />
        </div>

        {/* Section: Propostas Comerciais (F3) */}
        <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "14px" }}>
          <div
            style={{
              fontSize: "var(--font-size-xs, 0.75rem)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--text-muted)",
              marginBottom: "10px",
            }}
          >
            Propostas Comerciais
          </div>
          <ProposalsSection
            proposals={proposals}
            onCreateProposal={onCreateProposal || (() => {})}
            onUpdateStatus={onUpdateProposalStatus || (async () => {})}
            onGeneratePix={onGenerateProposalPix}
            error={proposalError}
          />
        </div>

        {/* Section: Pix */}
        <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "14px" }}>
          <div
            style={{
              fontSize: "var(--font-size-xs, 0.75rem)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--text-muted)",
              marginBottom: "10px",
            }}
          >
            Cobrança Pix
          </div>
          <PixStatus
            status={pixStatus}
            paidAt={pixPaidAt}
            onGeneratePix={onGeneratePix}
          />
        </div>

        {/* Section: Jornada e Histórico (F4) */}
        <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "14px" }}>
          <div
            style={{
              fontSize: "var(--font-size-xs, 0.75rem)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--text-muted)",
              marginBottom: "10px",
            }}
          >
            Jornada do Cliente
          </div>
          <JourneyTimeline
            currentStage={journeyStage}
            actionHistory={actionHistory}
          />
        </div>

        {/* Section: Anotações */}
        <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "14px" }}>
          <div
            style={{
              fontSize: "var(--font-size-xs, 0.75rem)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--text-muted)",
              marginBottom: "10px",
            }}
          >
            Notas Comerciais
          </div>
          <Notes
            initialNotes={notes}
            onSaveNotes={onSaveNotes}
            isSaving={isSavingNotes}
          />
        </div>

        {/* Section: Fechamento / Outcome */}
        {onMarkWon && onMarkLost && (
          <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "14px" }}>
            <div
              style={{
                fontSize: "var(--font-size-xs, 0.75rem)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--text-muted)",
                marginBottom: "10px",
              }}
            >
              Fechamento do Negócio
            </div>
            <OutcomeActions
              onMarkWon={onMarkWon}
              onMarkLost={onMarkLost}
              currentOutcome={currentOutcome}
            />
          </div>
        )}
      </div>
    </aside>
  );
};
