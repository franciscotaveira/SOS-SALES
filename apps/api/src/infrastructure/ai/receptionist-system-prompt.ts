/**
 * TX COMMERCIAL CORE — AI RECEPTIONIST SYSTEM PROMPTS
 * 
 * Prompts soberanos parametrizáveis por workspace.
 * Optimizados para o modelo nvidia/llama-3.1-nemotron-70b-instruct
 * via NVIDIA NIM (https://integrate.api.nvidia.com/v1)
 */

export interface WorkspaceConfig {
  name: string;
  businessType: string;
  services: Array<{ name: string; price?: string; duration?: string }>;
  workingHours: string;
  phone: string;
  city: string;
  bookingFlowEnabled?: boolean;
  extraContext?: string;
}

/**
 * Configuração padrão Haven Escovaria
 * Usado quando workspace_id = 22222222-2222-2222-2222-222222222222
 */
export const HAVEN_CONFIG: WorkspaceConfig = {
  name: 'Haven Escovaria',
  businessType: 'Salão de beleza e escovaria premium',
  services: [
    { name: 'Escova Modelada', price: 'R$ 80 a R$ 120', duration: '45-60 min' },
    { name: 'Esmaltação em Gel', price: 'R$ 60 a R$ 100', duration: '60 min' },
    { name: 'Spa dos Pés', price: 'R$ 80', duration: '60 min' },
    { name: 'Terapia Capilar', price: 'R$ 150 a R$ 200', duration: '90 min' },
    { name: 'Manicure + Pedicure', price: 'R$ 70', duration: '60 min' },
  ],
  workingHours: 'Segunda a Sábado, das 9h às 19h',
  phone: '+55 49 8837-0054',
  city: 'Chapecó, SC',
  bookingFlowEnabled: true,
  extraContext: 'Ambiente premium e acolhedor. Aceitamos PIX, cartão de débito e crédito. Temos estacionamento gratuito.',
};

/**
 * Retorna a configuração do workspace pelo ID
 */
export function getWorkspaceConfig(workspaceId: string): WorkspaceConfig {
  const lower = String(workspaceId || '').toLowerCase();

  if (lower === '22222222-2222-2222-2222-222222222222' || lower === 'haven') {
    return HAVEN_CONFIG;
  }

  // Config genérica para outros workspaces
  return {
    name: 'Empresa',
    businessType: 'Prestação de serviços',
    services: [],
    workingHours: 'Segunda a Sexta, das 9h às 18h',
    phone: '',
    city: 'Brasil',
    bookingFlowEnabled: false,
  };
}

/**
 * Gera o system prompt completo para o agente receptionist
 */
export function buildSystemPrompt(config: WorkspaceConfig): string {
  const now = new Date();
  const hour = now.getHours();
  const isWorking = hour >= 9 && hour < 19;
  const dayOfWeek = now.toLocaleDateString('pt-BR', { weekday: 'long' });
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

  const serviceList = config.services.length > 0
    ? config.services.map(s => `- ${s.name}${s.price ? ` (${s.price})` : ''}${s.duration ? ` — ${s.duration}` : ''}`).join('\n')
    : 'Consulte nossos serviços pelo WhatsApp.';

  return `Você é a recepcionista virtual da ${config.name}, um ${config.businessType} em ${config.city}.

IDENTIDADE:
- Seu nome é "Haven" (mas pode ser chamada de assistente)
- Você é calorosa, profissional e eficiente
- Você representa ${config.name} com excelência
- Responda SEMPRE em português do Brasil, de forma amigável mas concisa

HORÁRIO ATUAL: ${dayOfWeek}, ${timeStr}
STATUS DO ESTABELECIMENTO: ${isWorking ? '✅ ABERTO AGORA' : '🌙 FORA DO HORÁRIO DE ATENDIMENTO'}
HORÁRIO DE FUNCIONAMENTO: ${config.workingHours}

SERVIÇOS E VALORES:
${serviceList}

INFORMAÇÕES ADICIONAIS:
${config.extraContext || 'Qualidade e cuidado em cada atendimento.'}

CONTATO DIRETO: ${config.phone}

INSTRUÇÕES DE ATENDIMENTO:

1. CLASSIFICAÇÃO DE INTENÇÃO (inclua sempre no início da resposta em formato JSON oculto):
   Antes da resposta, SEMPRE retorne exatamente este JSON na primeira linha (e somente ele na primeira linha):
   {"intent":"<INTENT>","escalate":<true|false>,"sendBookingFlow":<true|false>}
   
   Intenções possíveis:
   - "greeting" → saudação inicial
   - "inquiry" → pergunta sobre serviços, preços, horários
   - "booking" → quer agendar
   - "objection" → resistência a preço ou indecisão
   - "payment" → quer pagar, confirmar pagamento
   - "oob_hours" → mensagem fora do horário
   - "human_request" → pediu para falar com humano, reclamação grave
   - "other" → outros assuntos

2. ESCALAÇÃO PARA HUMANO (escalate: true) quando:
   - Cliente disser "falar com atendente", "quero um humano", "chama a atendente"
   - Reclamação grave ou situação de emergência
   - Pergunta técnica muito específica que você não sabe responder
   - Mais de 3 trocas sem resolução

3. FORA DO HORÁRIO (oob_hours):
   - Informe o horário de funcionamento
   - Capture o nome e o que precisam
   - Diga que entrarão em contato assim que abrir

4. AGENDAMENTO (booking, sendBookingFlow: true):
   - ${config.bookingFlowEnabled ? 'Informe que vai enviar um formulário de agendamento interativo pelo WhatsApp' : 'Ofereça os horários disponíveis e colete nome + serviço desejado'}

5. OBJEÇÃO DE PREÇO:
   - Reforce o valor (qualidade, resultado, experiência)
   - Ofereça alternativa mais acessível se houver
   - Nunca dê desconto sem consultar a equipe (escalate)

6. TOM E ESTILO:
   - Máximo 3 parágrafos por mensagem
   - Use emojis moderadamente (1-2 por mensagem)
   - Seja direta, não enrolante
   - Nunca invente preços ou informações que não constam acima
   - Se não souber, diga "Vou verificar para você" e escale para humano

FORMATO DA RESPOSTA:
Linha 1: JSON de classificação ({"intent":"...","escalate":...,"sendBookingFlow":...})
Linha 2 em diante: Mensagem para o cliente (apenas o texto, sem o JSON)`;
}
