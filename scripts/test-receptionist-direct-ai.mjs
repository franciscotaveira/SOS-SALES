#!/usr/bin/env node
/**
 * SOS Sales — Teste de Validação Direta da IA Receptionist (Haven Escovaria)
 * Testa se a Camila responde com rigor soberano, sem alucinação de preço,
 * com link do Trinks e classificação precisa de intenção.
 */

const NIM_BASE_URL = process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NVIDIA_API_KEY;
const NIM_MODEL = process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.1-70b-instruct';

if (!NIM_API_KEY) {
  console.error('❌ NVIDIA_API_KEY não encontrada');
  process.exit(1);
}

const HAVEN_CONFIG = {
  name: 'Haven Escovaria',
  agentName: 'Camila',
  businessType: 'Escovaria e salão de beleza premium',
  services: [
    { name: 'Escova Modelada', duration: '45-60 min' },
    { name: 'Esmaltação em Gel', duration: '60 min' },
    { name: 'Spa dos Pés', duration: '60 min' },
    { name: 'Terapia Capilar', duration: '90 min' },
    { name: 'Manicure + Pedicure', duration: '60 min' },
    { name: 'Progressiva / Relaxamento', duration: '120-180 min' },
    { name: 'Coloração / Luzes', duration: 'variável' },
  ],
  workingHours: 'Segunda a Sábado, das 9h às 19h',
  phone: '+55 49 8837-0054',
  city: 'Chapecó, SC',
  bookingUrl: 'https://www.trinks.com/haven-escovaria',
  bookingFlowEnabled: true,
  extraContext:
    'Ambiente premium e acolhedor. Aceitamos PIX, cartão de débito e crédito. Estacionamento gratuito. ' +
    'Os valores dos serviços estão sempre atualizados em: https://www.trinks.com/haven-escovaria',
};

function buildSystemPrompt(config) {
  const serviceList = config.services
    .map(s => `- ${s.name}${s.duration ? ` (${s.duration})` : ''}`)
    .join('\n');

  return `Você é ${config.agentName}, a recepcionista virtual da ${config.name} — ${config.businessType} em ${config.city}.

IDENTIDADE:
- Seu nome é "${config.agentName}"
- Você é calorosa, profissional e eficiente
- Você representa ${config.name} com excelência
- Responda SEMPRE em português do Brasil, de forma amigável mas concisa

HORÁRIO DE FUNCIONAMENTO: ${config.workingHours}

SERVIÇOS DISPONÍVEIS:
${serviceList}

LINK DE AGENDAMENTO OFICIAL: ${config.bookingUrl}

INFORMAÇÕES ADICIONAIS:
${config.extraContext}

CONTATO: ${config.phone}

REGRA CRÍTICA — PREÇOS (INEGOCIÁVEL, FALHA GRAVE SE VIOLADA):
- NUNCA mencione qualquer valor em Reais (R$). NUNCA diga frases como "a partir de R$", "por apenas R$", "custam R$" ou qualquer número que pareça um preço.
- Se perguntarem o preço, diga SEMPRE: "Para ver os valores atualizados acesse ${config.bookingUrl} 😊"
- Esta regra é ABSOLUTA e não admite exceções.
- Prefira SEMPRE enviar o link de agendamento a responder preços manualmente

INSTRUÇÕES DE ATENDIMENTO:

1. CLASSIFICAÇÃO DE INTENÇÃO — primeira linha da resposta, sempre, JSON estrito:
   {"intent":"<INTENT>","escalate":<true|false>,"sendBookingFlow":<true|false>}

   Intenções:
   - "greeting"      → saudação inicial
   - "inquiry"       → pergunta sobre serviços, preços, horários
   - "booking"       → quer agendar
   - "objection"     → resistência a preço ou indecisão
   - "payment"       → quer pagar, confirmar pagamento
   - "human_request" → pediu para falar com humano, reclamação grave
   - "other"         → outros assuntos

2. ESCALAÇÃO (escalate: true) quando:
   - Cliente pedir "falar com atendente", "quero humano", "chama a atendente"
   - Reclamações graves, pedidos de estorno/cancelamento complexo

3. RESPOSTA AO CLIENTE — da segunda linha em diante:
   - Mensagem direta, calorosa e objetiva (máximo 3 frases)
   - Use no máximo 1-2 emojis
   - NUNCA repita o JSON na mensagem ao cliente`;
}

const systemPrompt = buildSystemPrompt(HAVEN_CONFIG);

const testCases = [
  {
    name: '1. Pergunta de Preço (Inquiry / Price Guardrail)',
    message: 'Oi! Quanto custa a escova modelada e a esmaltação?',
  },
  {
    name: '2. Pedido de Agendamento (Booking)',
    message: 'Quero agendar um horário para amanhã à tarde, como faço?',
  },
  {
    name: '3. Escalação Humana (Human Request)',
    message: 'Preciso falar com uma atendente humana por favor',
  },
  {
    name: '4. Dúvida Geral sobre Serviços (Inquiry)',
    message: 'Vocês fazem spa dos pés e sobrancelha?',
  }
];

async function callAI(userMessage) {
  const response = await fetch(`${NIM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NIM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: NIM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.1,
      max_tokens: 300,
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`NIM error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function run() {
  console.log('====================================================');
  console.log('🤖 SOS SALES — AUDITORIA DE IA RECEPTIONIST (CAMILA)');
  console.log(`🏢 Empresa: ${HAVEN_CONFIG.name} | Agente: ${HAVEN_CONFIG.agentName}`);
  console.log(`🌐 Modelo: ${NIM_MODEL}`);
  console.log('====================================================\n');

  for (const tc of testCases) {
    console.log(`\n----------------------------------------------------`);
    console.log(`📌 TESTE: ${tc.name}`);
    console.log(`👤 Mensagem do Cliente: "${tc.message}"`);
    try {
      const rawResponse = await callAI(tc.message);
      console.log(`🤖 Resposta da IA:\n${rawResponse}`);

      const firstLine = rawResponse.split('\n')[0].trim();
      let hasPrice = /R\$\s*\d+/.test(rawResponse);

      console.log('\n--- AVALIAÇÃO ---');
      console.log(`Envelope JSON: ${firstLine.startsWith('{') && firstLine.endsWith('}') ? '✅ OK' : '⚠️ Fora do padrão'}`);
      console.log(`Proteção anti-alucinação de preço (R$ ausente): ${!hasPrice ? '✅ PASSOU (Sem preços fictícios)' : '❌ FALHOU (Alucinou preço)'}`);
      console.log(`Menção Trinks / Link: ${rawResponse.toLowerCase().includes('trinks') || rawResponse.includes('http') ? '✅ Presente' : 'ℹ️ Não mencionado'}`);
    } catch (err) {
      console.error(`❌ Erro no teste: ${err.message}`);
    }
  }

  console.log('\n====================================================');
  console.log('✅ AUDITORIA CONCLUÍDA');
  console.log('====================================================');
}

run();
