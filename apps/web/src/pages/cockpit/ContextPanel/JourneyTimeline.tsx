import { type FC, useState } from "react";
import { Badge } from "@sos-sales/ui";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { formatTime } from "../utils/formatTime";

interface JourneyStageItem {
  stage: string;
  status: string;
  date?: string;
  isCurrent?: boolean;
}

interface ActionHistoryItem {
  id: string;
  actionType: string;
  actor?: string | null;
  createdAt: string;
}

interface JourneyTimelineProps {
  currentStage?: string | null;
  stages?: JourneyStageItem[];
  actionHistory?: ActionHistoryItem[];
}

export const JourneyTimeline: FC<JourneyTimelineProps> = ({
  currentStage,
  stages = [],
  actionHistory = [],
}) => {
  const [showHistory, setShowHistory] = useState(false);

  const displayStages: JourneyStageItem[] = stages.length > 0
    ? stages
    : [
        { stage: "Primeiro Contato", status: "completed" },
        { stage: currentStage || "Qualificação", status: "active", isCurrent: true },
        { stage: "Proposta", status: "pending" },
        { stage: "Fechamento", status: "pending" },
      ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* Timeline Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {displayStages.map((step, idx) => {
          const isCurrent = step.isCurrent;
          const isDone = step.status === "completed";

          return (
            <div
              key={step.stage + idx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "var(--font-size-xs, 0.75rem)",
              }}
            >
              <div
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: isCurrent
                    ? "var(--color-action)"
                    : isDone
                    ? "var(--border-strong)"
                    : "var(--border-default)",
                  outline: isCurrent ? "2px solid rgba(0, 128, 105, 0.25)" : "none",
                  outlineOffset: "2px",
                }}
              />
              <span
                style={{
                  fontWeight: isCurrent ? 600 : 400,
                  color: isCurrent
                    ? "var(--text-primary)"
                    : isDone
                    ? "var(--text-secondary)"
                    : "var(--text-muted)",
                  flex: 1,
                }}
              >
                {step.stage}
              </span>
              {isCurrent && <Badge variant="action">Atual</Badge>}
            </div>
          );
        })}
      </div>

      {/* Action History Collapsible */}
      <div
        style={{
          borderTop: "1px dashed var(--border-default)",
          paddingTop: "8px",
          marginTop: "4px",
        }}
      >
        <button
          type="button"
          onClick={() => setShowHistory(!showHistory)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "var(--font-size-xs, 0.75rem)",
            color: "var(--text-secondary)",
            fontWeight: 500,
            width: "100%",
            justifyContent: "space-between",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <History size={13} />
            Histórico de Ações ({actionHistory.length})
          </span>
          {showHistory ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {showHistory && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              marginTop: "8px",
              paddingLeft: "4px",
            }}
          >
            {actionHistory.length === 0 ? (
              <span
                style={{
                  fontSize: "var(--font-size-xs, 0.75rem)",
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                }}
              >
                Nenhuma ação registrada recentemente.
              </span>
            ) : (
              actionHistory.map((act) => (
                <div
                  key={act.id}
                  style={{
                    fontSize: "var(--font-size-xs, 0.75rem)",
                    display: "flex",
                    justifyContent: "space-between",
                    color: "var(--text-secondary)",
                  }}
                >
                  <span>
                    {act.actor ? `${act.actor}: ` : ""}
                    {act.actionType}
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>
                    {formatTime(act.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
