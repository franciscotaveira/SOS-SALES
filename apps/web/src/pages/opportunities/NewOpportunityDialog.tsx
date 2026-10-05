import { useState, useEffect, type FC, type FormEvent, type CSSProperties } from "react";
import { Dialog, Input, Button } from "@sos-sales/ui";
import { apiClient, ApiError, type ContactSummary, type JourneyStage } from "../../services/api-client";
import { STAGES } from "./stages";

interface NewOpportunityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  workspaceId: string;
  token: string;
  contacts: ContactSummary[];
}

const selectStyle: CSSProperties = {
  width: "100%",
  height: "36px",
  padding: "0 10px",
  fontSize: "var(--font-size-sm)",
  color: "var(--text-primary)",
  backgroundColor: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  fontFamily: "inherit",
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  fontSize: "var(--font-size-xs)",
  fontWeight: 600,
  color: "var(--text-secondary)",
};

/**
 * Parses currency strings into integer cents; null when empty or invalid.
 * Disambiguates "." as thousands separator vs. decimal point:
 *   "1.500"     -> 1500.00 (dot-grouped thousands, pt-BR)
 *   "1.234,56"  -> 1234.56 (thousands + comma decimal, pt-BR)
 *   "1234,5"    -> 1234.50 (comma decimal, no grouping)
 *   "1234.56"   -> 1234.56 (plain dot decimal)
 *   "1234"      -> 1234.00 (integer)
 */
const parseBrlToCents = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let normalized: string | null = null;
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(trimmed) || /^\d+,\d{1,2}$/.test(trimmed)) {
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(trimmed)) {
    normalized = trimmed.replace(/\./g, "");
  } else if (/^\d+\.\d{1,2}$/.test(trimmed) || /^\d+$/.test(trimmed)) {
    normalized = trimmed;
  }
  if (normalized === null) return null;

  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
};

export const NewOpportunityDialog: FC<NewOpportunityDialogProps> = ({
  isOpen,
  onClose,
  onCreated,
  workspaceId,
  token,
  contacts,
}) => {
  const [contactId, setContactId] = useState("");
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState<JourneyStage>("lead");
  const [valueInput, setValueInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setContactId(contacts[0]?.id ?? "");
      setTitle("");
      setStage("lead");
      setValueInput("");
      setErrorMsg(null);
    }
  }, [isOpen, contacts]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!contactId) {
      setErrorMsg("Selecione um lead.");
      return;
    }
    const cents = parseBrlToCents(valueInput);
    if (valueInput.trim() && cents === null) {
      setErrorMsg("Valor inválido. Use o formato 1.500,00.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await apiClient.createJourney(
        workspaceId,
        {
          contactId,
          title: title.trim() || undefined,
          stage,
          attributionSource: "manual_input",
          estimatedValueCents: cents ?? undefined,
        },
        { token }
      );
      onCreated();
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setErrorMsg("Este lead já tem uma oportunidade aberta.");
      } else {
        setErrorMsg((err as Error).message || "Falha ao criar oportunidade.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Nova Oportunidade"
      description="Abra uma oportunidade de venda vinculada a um lead."
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {errorMsg && (
          <div
            role="alert"
            style={{
              padding: "8px 12px",
              backgroundColor: "var(--color-danger-subtle)",
              color: "var(--color-danger)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            {errorMsg}
          </div>
        )}

        <label style={labelStyle}>
          Lead
          <select required value={contactId} onChange={(e) => setContactId(e.target.value)} style={selectStyle}>
            {contacts.length === 0 && <option value="">Nenhum lead cadastrado</option>}
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name ? `${c.name} · ${c.phoneE164}` : c.phoneE164}
              </option>
            ))}
          </select>
        </label>

        <Input label="Título (Opcional)" placeholder="Ex: Pacote mensal" value={title} onChange={(e) => setTitle(e.target.value)} />

        <label style={labelStyle}>
          Etapa
          <select value={stage} onChange={(e) => setStage(e.target.value as JourneyStage)} style={selectStyle}>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <Input label="Valor estimado em R$ (Opcional)" placeholder="1.500,00" value={valueInput} onChange={(e) => setValueInput(e.target.value)} />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
          <Button size="sm" variant="secondary" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" variant="primary" type="submit" disabled={isSubmitting || contacts.length === 0}>
            {isSubmitting ? "Salvando..." : "Criar Oportunidade"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
