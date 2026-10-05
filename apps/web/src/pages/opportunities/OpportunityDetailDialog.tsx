import { useEffect, useState, type FC, type CSSProperties } from "react";
import { Button, Dialog, Input, Badge } from "@sos-sales/ui";
import { apiClient, type ContactSummary, type JourneyStage, type JourneySummary } from "../../services/api-client";
import { STAGES, formatCents } from "./stages";

interface Props {
  journey: JourneySummary | null;
  contact?: ContactSummary;
  workspaceId: string;
  token: string;
  onClose: () => void;
  onChanged: () => void;
}

const selectStyle: CSSProperties = { width: "100%", height: "38px", padding: "0 10px", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", background: "var(--bg-surface)", color: "var(--text-primary)" };

const centsFromInput = (value: string) => Number(value.replace(/\D/g, "")) || 0;

export const OpportunityDetailDialog: FC<Props> = ({ journey, contact, workspaceId, token, onClose, onChanged }) => {
  const [stage, setStage] = useState<JourneyStage>("lead");
  const [value, setValue] = useState("0,00");
  const [lossReason, setLossReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!journey) return;
    setStage(journey.stage);
    setValue(((journey.estimatedValueCents ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setLossReason("");
    setError(null);
  }, [journey]);

  if (!journey) return null;

  const run = async (action: () => Promise<unknown>) => {
    setIsSaving(true);
    setError(null);
    try {
      await action();
      await onChanged();
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || "Não foi possível atualizar a oportunidade.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveStage = () => {
    if (stage === "won" || stage === "lost") return;
    return run(() => apiClient.updateJourneyStage(workspaceId, journey.id, stage, { token }));
  };

  const recordOutcome = (status: "won" | "lost") => {
    if (status === "lost" && !lossReason.trim()) {
      setError("Informe o motivo da perda para manter o histórico comercial.");
      return;
    }
    return run(() => apiClient.recordJourneyOutcome(workspaceId, journey.id, {
      status,
      valueCents: centsFromInput(value),
      currency: "BRL",
      reason: status === "lost" ? lossReason.trim() : undefined,
    }, { token }));
  };

  return (
    <Dialog isOpen={Boolean(journey)} onClose={onClose} title={contact?.name || contact?.phoneE164 || "Oportunidade"} description={journey.title || "Oportunidade comercial"}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {error && <div role="alert" style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--color-danger-subtle)", color: "var(--color-danger)", fontSize: "var(--font-size-sm)" }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div><div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>Contato</div><strong>{contact?.phoneE164 || "Não informado"}</strong></div>
          <div><div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>Valor estimado</div><strong>{formatCents(journey.estimatedValueCents ?? 0)}</strong></div>
          <div><div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>Criada em</div><span>{new Date(journey.createdAt).toLocaleString("pt-BR")}</span></div>
          <div><div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>Situação</div><Badge variant="neutral">{STAGES.find((item) => item.id === journey.stage)?.label}</Badge></div>
        </div>

        {journey.stage !== "won" && journey.stage !== "lost" && (
          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-secondary)" }}>
            Mover para outra etapa
            <select value={stage} onChange={(event) => setStage(event.target.value as JourneyStage)} style={selectStyle}>
              {STAGES.filter((item) => item.id !== "won" && item.id !== "lost").map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        )}

        <Input label="Valor final em R$" value={value} onChange={(event) => setValue(event.target.value)} helperText="Usado somente ao registrar ganho ou perda." />
        <Input label="Motivo da perda" value={lossReason} onChange={(event) => setLossReason(event.target.value)} placeholder="Ex.: cliente desistiu ou escolheu concorrente" />

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "8px" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button size="sm" variant="secondary" type="button" disabled={isSaving || journey.stage === "won" || journey.stage === "lost"} onClick={() => recordOutcome("lost")}>Marcar perdido</Button>
            <Button size="sm" variant="primary" type="button" disabled={isSaving || journey.stage === "won" || journey.stage === "lost"} onClick={() => recordOutcome("won")}>Marcar ganho</Button>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button size="sm" variant="secondary" type="button" onClick={onClose}>Fechar</Button>
            <Button size="sm" variant="primary" type="button" disabled={isSaving || stage === journey.stage || stage === "won" || stage === "lost"} onClick={saveStage}>{isSaving ? "Salvando..." : "Salvar etapa"}</Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
