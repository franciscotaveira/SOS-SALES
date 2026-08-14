import { CommercialStage, KnownFact, Journey } from '../types/cockpit';

export interface StageInfo {
  key: CommercialStage;
  label: string;
  shortLabel: string;
  order: number;
  color: string;
  description: string;
  requiredFacts: string[];
}

export const COMMERCIAL_STAGES: Record<CommercialStage, StageInfo> = {
  new: {
    key: 'new',
    label: 'Novo Lead',
    shortLabel: 'Novo',
    order: 1,
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    description: 'Primeiro contato recebido via WhatsApp/Meta Ads.',
    requiredFacts: ['dor principal ou objetivo'],
  },
  contacted: {
    key: 'contacted',
    label: 'Em Contato',
    shortLabel: 'Contato',
    order: 2,
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    description: 'Atendimento iniciado, entendendo a demanda.',
    requiredFacts: ['objetivo', 'prazo desejado'],
  },
  qualified: {
    key: 'qualified',
    label: 'Qualificado',
    shortLabel: 'Qualificado',
    order: 3,
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    description: 'Necessidade, veículo/cabelo e disponibilidade identificados.',
    requiredFacts: ['preferência de data/horário', 'especificação do serviço'],
  },
  proposal: {
    key: 'proposal',
    label: 'Proposta / Agendamento',
    shortLabel: 'Proposta',
    order: 4,
    color: 'bg-purple-50 text-purple-700 border-purple-200',
    description: 'Horário ou orçamento apresentado, aguardando confirmação.',
    requiredFacts: ['sinal ou aprovação', 'decisão de pagamento'],
  },
  won: {
    key: 'won',
    label: 'Ganho / Convertido',
    shortLabel: 'Ganho',
    order: 5,
    color: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    description: 'Venda ou agendamento confirmado com sucesso.',
    requiredFacts: ['valor final', 'comprovante ou confirmação'],
  },
  lost: {
    key: 'lost',
    label: 'Perdido',
    shortLabel: 'Perdido',
    order: 6,
    color: 'bg-rose-50 text-rose-800 border-rose-200',
    description: 'Negociação pausada ou desistência com motivo registrado.',
    requiredFacts: ['motivo da perda'],
  },
};

export interface QualificationStatus {
  stage: CommercialStage;
  completedItems: { key: string; label: string; verified: boolean }[];
  missingItems: string[];
  isReadyToAdvance: boolean;
}

/**
 * Evaluates the qualification status of a journey based on its known facts.
 * Adapted from taveira-crm commercialDecisionService.
 */
export function evaluateQualification(journey: Journey): QualificationStatus {
  const currentStage = journey.stage || (journey.outcome?.status === 'won' ? 'won' : 'contacted');
  const stageConfig = COMMERCIAL_STAGES[currentStage];
  
  const facts = journey.knownFacts || [];
  const factKeys = new Set(facts.map((f) => f.label.toLowerCase()));

  const items = stageConfig.requiredFacts.map((req) => {
    const hasMatch = facts.some(
      (f) =>
        f.label.toLowerCase().includes(req.toLowerCase()) ||
        f.value.toLowerCase().includes(req.toLowerCase())
    );
    return {
      key: req,
      label: req,
      verified: hasMatch,
    };
  });

  const missing = items.filter((i) => !i.verified).map((i) => i.label);

  return {
    stage: currentStage,
    completedItems: items,
    missingItems: missing,
    isReadyToAdvance: missing.length === 0,
  };
}
