import type { JourneyStage } from "../../services/api-client";

export const STAGES: ReadonlyArray<{ id: JourneyStage; label: string }> = [
  { id: "lead", label: "Lead" },
  { id: "qualified", label: "Qualificado" },
  { id: "proposal", label: "Proposta" },
  { id: "scheduled", label: "Agendado" },
  { id: "won", label: "Ganho" },
  { id: "lost", label: "Perdido" },
];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const formatCents = (cents: number): string => brl.format(cents / 100);
