import { Journey, KnownFact, GuardrailValidation } from '../types/cockpit';
import { BusinessContext } from '../types/intelligence';
import { validateCommercialPolicy } from './commercialGuardrailService';

export type CustomerDecisionState =
  | 'DESCONHECIMENTO'
  | 'INTERESSE'
  | 'BUSCA_OBJETIVA'
  | 'COMPARACAO'
  | 'DECISAO_PRONTA'
  | 'COMPROMETIDO'
  | 'POS_VENDA';

export interface PerceptionResult {
  intent: 'CHECK_AVAILABILITY' | 'ASK_PRICE' | 'ASK_DETAILS' | 'NEGOTIATE_DISCOUNT' | 'BOOK_APPOINTMENT' | 'GENERAL_QUESTION';
  requestedService?: string;
  requestedDate?: string;
  preferredTime?: string;
  hardDeadline?: string;
  reason?: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH';
  primaryFriction: string;
}

export interface CommercialPlan {
  goal: string;
  recommendedAction: string;
  reason: string;
  requiredTool?: string;
  microCommitment: string;
  decisionState: CustomerDecisionState;
  shouldHandoff: boolean;
}

export interface RuntimeExecutionResult {
  perception: PerceptionResult;
  decisionState: CustomerDecisionState;
  plan: CommercialPlan;
  policyValidation: GuardrailValidation;
  toolOutput?: {
    toolName: string;
    success: boolean;
    data: any;
    message: string;
  };
  generatedResponse: string;
  confidenceScore: number;
}

/**
 * SOS Commercial Intelligence Runtime (LAB/Slice AI-001)
 * Orchestrates Perception -> Context -> Decision State -> Sales Planner -> Policy -> Tool -> Response.
 */
export function executeCommercialRuntime(
  userMessage: string,
  journey: Journey,
  businessContext: BusinessContext
): RuntimeExecutionResult {
  const msgLower = userMessage.toLowerCase();

  // 1. Perception Engine
  let intent: PerceptionResult['intent'] = 'GENERAL_QUESTION';
  if (msgLower.includes('horário') || msgLower.includes('agenda') || msgLower.includes('sábado') || msgLower.includes('hora') || msgLower.includes('dia')) {
    intent = 'CHECK_AVAILABILITY';
  } else if (msgLower.includes('preço') || msgLower.includes('quanto custa') || msgLower.includes('valor') || msgLower.includes('tabela')) {
    intent = 'ASK_PRICE';
  } else if (msgLower.includes('desconto') || msgLower.includes('mais barato') || msgLower.includes('fecha')) {
    intent = 'NEGOTIATE_DISCOUNT';
  } else if (msgLower.includes('marcar') || msgLower.includes('agendar') || msgLower.includes('pode fechar')) {
    intent = 'BOOK_APPOINTMENT';
  } else {
    intent = 'ASK_DETAILS';
  }

  const urgency = msgLower.includes('urgente') || msgLower.includes('já') || msgLower.includes('casamento') || msgLower.includes('compromisso') ? 'HIGH' : 'MEDIUM';

  const perception: PerceptionResult = {
    intent,
    requestedService: businessContext.productCatalog.find((p) => msgLower.includes(p.name.toLowerCase()))?.name || journey.acquisition?.referralOffer || 'Serviço Padrão',
    requestedDate: msgLower.includes('sábado') ? 'Sábado' : msgLower.includes('amanhã') ? 'Amanhã' : 'Próximos dias',
    preferredTime: msgLower.includes('14h') ? '~14h' : msgLower.includes('15h') ? '~15h' : 'Horário comercial',
    hardDeadline: msgLower.includes('casamento') || msgLower.includes('reunião') ? 'Compromisso agendado no mesmo dia' : undefined,
    urgency,
    primaryFriction: intent === 'CHECK_AVAILABILITY' ? 'Disponibilidade de horário' : 'Esclarecimento de detalhes',
  };

  // 2. Commercial State Engine (Decision State)
  let decisionState: CustomerDecisionState = 'BUSCA_OBJETIVA';
  if (intent === 'BOOK_APPOINTMENT' || (intent === 'CHECK_AVAILABILITY' && perception.hardDeadline)) {
    decisionState = 'DECISAO_PRONTA';
  } else if (intent === 'ASK_PRICE') {
    decisionState = 'COMPARACAO';
  } else if (journey.stage === 'won' || journey.stage === 'proposal') {
    decisionState = 'COMPROMETIDO';
  }

  // 3. Sales Planner
  let goal = 'advance_to_booking';
  let recommendedAction = 'CHECK_AVAILABILITY';
  let requiredTool: string | undefined = undefined;
  let microCommitment = 'Confirmar horário ideal';
  let shouldHandoff = false;

  if (intent === 'CHECK_AVAILABILITY') {
    goal = 'validate_schedule_and_slot';
    recommendedAction = 'CHECK_SLOT';
    requiredTool = 'check_availability';
    microCommitment = 'Sugerir encaixe exato com profissional';
  } else if (intent === 'ASK_PRICE') {
    goal = 'present_catalog_pricing';
    recommendedAction = 'SHOW_PRICING';
    requiredTool = 'get_catalog';
    microCommitment = 'Destacar benefício e valor';
  } else if (intent === 'NEGOTIATE_DISCOUNT') {
    goal = 'evaluate_discount_limit';
    recommendedAction = 'CHECK_POLICY';
    shouldHandoff = true; // High discount needs human or guardrail approval
    microCommitment = 'Encaminhar para alinhamento de diretoria';
  }

  const plan: CommercialPlan = {
    goal,
    recommendedAction,
    reason: `Cliente manifestou intenção ${intent} com urgência ${urgency} no estado ${decisionState}.`,
    requiredTool,
    microCommitment,
    decisionState,
    shouldHandoff,
  };

  // 4. Policy Engine (Guardrails)
  const draftResponse = shouldHandoff
    ? `Entendo perfeitamente. Para garantir a melhor condição para você, vou conectar você agora com nosso atendimento especializado.`
    : intent === 'CHECK_AVAILABILITY'
    ? `Olá! Temos horários disponíveis este ${perception.requestedDate}. Nossos procedimentos levam em média 40 minutos para garantir total pontualidade para seus compromissos. Posso verificar a agenda exata da nossa profissional para as ${perception.preferredTime}?`
    : `Olá! Com base nas informações da ${businessContext.companyProfile.tradeName}, estou aqui para ajudar você a escolher o melhor serviço. Como posso prosseguir?`;

  const policyValidation = validateCommercialPolicy(draftResponse, {
    maxDiscountPercent: 15,
    allowedPaymentMethods: businessContext.serviceInformation.acceptedPaymentMethods,
  });

  // 5. Tool Runner (Simulation)
  let toolOutput = undefined;
  if (requiredTool === 'check_availability') {
    toolOutput = {
      toolName: 'check_availability',
      success: true,
      data: { slot: '14:15', professional: 'Larissa', durationMinutes: 40, available: true },
      message: 'Encontrado horário livre às 14:15 com Larissa.',
    };
  } else if (requiredTool === 'get_catalog') {
    toolOutput = {
      toolName: 'get_catalog',
      success: true,
      data: businessContext.productCatalog,
      message: 'Catálogo de serviços recuperado com sucesso.',
    };
  }

  // 6. Response Engine (Final Polish)
  let finalResponse = draftResponse;
  if (toolOutput && requiredTool === 'check_availability' && toolOutput.success) {
    const slotData = toolOutput.data;
    finalResponse = `Sim, conseguimos encaixar perfeitamente! Tenho vaga às ${slotData.slot} com a ${slotData.professional} (${slotData.durationMinutes} min de duração), o que te deixa com ótima folga para o seu compromisso. Posso bloquear esse horário para você?`;
  }

  const confidenceScore = shouldHandoff ? 0.75 : 0.96;

  return {
    perception,
    decisionState,
    plan,
    policyValidation,
    toolOutput,
    generatedResponse: finalResponse,
    confidenceScore,
  };
}
