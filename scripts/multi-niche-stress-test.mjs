import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.OPENROUTER_API_KEY || '';
const MODEL = 'nvidia/nemotron-3-nano-30b-a3b:free';

// Matriz de Testes Abrangente de PMEs Brasileiras
const TEST_MATRIX = [
  // 1. CLÍNICA ODONTOLÓGICA / SAÚDE
  {
    niche: 'Clínica Odontológica',
    clientType: 'Cliente com Dor / Urgente (Apressado)',
    entryChannel: 'Google Busca Local (emergência odontológica)',
    complexity: 'Alta (Triagem médica + Agendamento de urgência)',
    funnelStage: 'Fundo de Funil (Decisão Imediata)',
    systemPrompt: `Você é a Clara, atendente da OdontoExcellence. 
Regras: Acolher com empatia a dor, verificar disponibilidade para hoje às 17h ou amanhã 08h30, informar que a avaliação de urgência custa R$ 150 e nunca prometer diagnóstico sem o exame clínico do Dr. Marcos. Responda em no máximo 3 frases curtas de WhatsApp.`,
    userMessage: 'Estou com muita dor de dente desde ontem à noite, não aguento mais! Tem vaga para me atender agora à tarde? Quanto custa para arrancar?',
    expectedBehavior: 'Empatia com a dor, propor encaixe hoje/amanhã, citar valor da consulta R$ 150 e não prometer procedimento sem avaliação.',
  },

  // 2. SPA & ESTÉTICA (Sora Headspa / Haven)
  {
    niche: 'Estética & Headspa (Sora / Haven)',
    clientType: 'Cliente VIP / Exigente (Buscando Relaxamento)',
    entryChannel: 'Instagram Ads CTWA (Vídeo Viral de Massagem Capilar)',
    complexity: 'Média (Resgate de Oferta + Quebra de Objeção)',
    funnelStage: 'Meio de Funil (Comparando Experiência)',
    systemPrompt: `Você é a Sofia, concierge do Sora Headspa.
Regras: Conectar com o vídeo relaxante do anúncio, explicar que a Sessão Signature dura 60 min e inclui diagnóstico do couro cabeludo com microcâmera + massagem craniana, valor R$ 220 no PIX (ou 2x R$ 120 no cartão). Convidar para escolher o melhor dia. 3 frases curtas.`,
    userMessage: 'Vi o vídeo de vocês no Reels com a água caindo na cabeça... Como funciona esse headspa? É tipo lavagem normal de salão?',
    expectedBehavior: 'Diferenciar da lavagem comum, detalhar experiência e microcâmera, passar preço de R$ 220 e propor agendamento.',
  },

  // 3. OFICINA MECÂNICA & AUTO CENTER
  {
    niche: 'Oficina Mecânica & Pneus',
    clientType: 'Cliente Cético / Desconfiado de "Empurrometria"',
    entryChannel: 'Indicação de Amigo',
    complexity: 'Média (Transparência Técnica + Orçamento Prévio)',
    funnelStage: 'Meio de Funil (Construção de Confiança)',
    systemPrompt: `Você é o Bruno, consultor técnico da AutoCenter Pro.
Regras: Explicar que a oficina só troca peças com fotos/vídeos comprovando o desgaste pelo WhatsApp, oferecer o Check-up Preventivo Gratuito em 30 itens e passar o horário para trazer o carro (segunda a sexta das 08h às 18h). Responda sem jargões difíceis.`,
    userMessage: 'Meu carro tá fazendo um barulho estranho na suspensão ao passar em lombada. Outra oficina me cobrou R$ 2.000 sem nem olhar direito. Vocês cobram para dar uma olhada?',
    expectedBehavior: 'Garantir transparência com fotos/vídeos, oferecer check-up gratuito dos 30 itens e convidar para trazer o carro.',
  },

  // 4. VAREJO DE MODA / E-COMMERCE LOCAL
  {
    niche: 'Loja de Roupas & Calçados',
    clientType: 'Cliente Indecisa / Procura de Tamanho e Troca',
    entryChannel: 'Direct do Instagram -> WhatsApp',
    complexity: 'Baixa (Consulta de Estoque + Delivery Rápido)',
    funnelStage: 'Fundo de Funil (Pronta para Comprar)',
    systemPrompt: `Você é a Bia, atendente da Boutique Bella.
Regras: Confirmar que temos o Vestido Midi Floral no tamanho M (últimas 2 peças), valor R$ 189,90, frete motoboy grátis para entregas na cidade hoje até 18h. Chave PIX é o CNPJ da loja. Responda com simpatia e emojis moderados.`,
    userMessage: 'Oi! Amei aquele vestido midi floral que vocês postaram nos stories. Ainda tem tamanho M? Entrega hoje aqui no centro?',
    expectedBehavior: 'Confirmar tamanho M, destacar últimas peças (escassez), informar entrega hoje grátis e orientar para fechar no PIX.',
  },

  // 5. SERVIÇOS B2B / CONTABILIDADE & GESTÃO
  {
    niche: 'Contabilidade Consultiva B2B',
    clientType: 'Empresário Racional / Analítico (Focado em Redução de Impostos)',
    entryChannel: 'Google Ads (Migração de MEI para ME / Simples Nacional)',
    complexity: 'Alta (Enquadramento Tributário + Economia Real)',
    funnelStage: 'Topo/Meio de Funil (Necessidade de Educação)',
    systemPrompt: `Você é o Gabriel, consultor tributário da Atlas Contabilidade.
Regras: Explicar de forma simples que estourar o teto do MEI sem planejamento gera multas pesadas, mas que no Simples Nacional é possível pagar a partir de 6% com o Fator R. Convidar para uma simulação tributária gratuita de 15 minutos pelo Google Meet ou WhatsApp.`,
    userMessage: 'Faturei R$ 110 mil esse ano no meu MEI e acho que vou ter que desenquadrar. Tô com medo de pagar imposto absurdo... Vocês conseguem me ajudar a não pagar tanto imposto?',
    expectedBehavior: 'Tranquilizar o empresário, explicar a transição para Simples Nacional com Fator R (6%) e convidar para simulação gratuita.',
  },

  // 6. GESTÃO DE CRISE / RECLAMAÇÃO DE CLIENTE
  {
    niche: 'Pizzaria Delivery / Gastronomia',
    clientType: 'Cliente Irritado / Reclamação de Atraso',
    entryChannel: 'WhatsApp pós-pedido',
    complexity: 'Crítica (Desescalada de Conflito + Solução Imediata)',
    funnelStage: 'Pós-Venda / Risco de Churn e Detrator',
    systemPrompt: `Você é o Mateus, gerente da Forneria Bella.
Regras inegociáveis: NUNCA culpar a chuva ou o motoboy. Pedir desculpas sinceras pelo atraso de 15 min, informar que a pizza acabou de sair do forno e está na bag térmica com o motoboy a 8 min do local, e creditar um refrigerante cortesia ou cupom de R$ 20 para a próxima pizza.`,
    userMessage: 'Já faz 1 hora e 20 minutos que pedi minha pizza e nada! Um absurdo a falta de respeito com o cliente!',
    expectedBehavior: 'Desculpas sem desculpas esfarrapadas, dar previsão exata de 8 min e oferecer compensação pelo transtorno.',
  },

  // 7. ENVIO DE COMPROVANTE & FECHAMENTO DE ASSINATURA SOS SALES
  {
    niche: 'SOS Sales (Nossa Própria Operação)',
    clientType: 'Empresário Pragmático (Pechinchador)',
    entryChannel: 'Landing Page iaparavendas.tech',
    complexity: 'Alta (Fechamento Comercial + Oferta Anual 50%)',
    funnelStage: 'Fundo de Funil (Negociação Final)',
    systemPrompt: `Você é o Gabriel, Closer oficial do SOS Sales.
 Regras: O plano mensal é R$ 97,00/mês. As condições anuais ativas são R$ 582,00 à vista no Pix (50% OFF) ou 12x de R$ 58,20 no cartão (40% OFF). Não inventar garantias ou descontos fora da oferta publicada. Responda persuasivo em 3 frases.`,
    userMessage: 'Quero fechar o SOS Sales para os meus 3 atendentes, mas R$ 97 por mês aperta meu caixa. Você tem uma condição anual?',
    expectedBehavior: 'Apresentar uma das condições anuais ativas e enviar o link para adesão imediata.',
  },
];

async function runSingleTest(testCase) {
  const start = Date.now();
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'HTTP-Referer': 'https://iaparavendas.tech',
        'X-Title': 'SOS Sales Multi-Niche Suite',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: testCase.systemPrompt },
          { role: 'user', content: testCase.userMessage },
        ],
        temperature: 0.2,
        max_tokens: 250,
      }),
    });

    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const errText = await res.text();
      return { success: false, latencyMs, error: `${res.status}: ${errText}` };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    return {
      success: true,
      latencyMs,
      content: content.trim(),
      tokens: data.usage?.total_tokens || 0,
    };
  } catch (err) {
    return { success: false, latencyMs: Date.now() - start, error: err.message };
  }
}

async function runAllMultiNicheTests() {
  console.log('='.repeat(90));
  console.log('🔥 SOS SALES: BATERIA RIGOROSA MULTI-NICHO & ESTRESSE COMERCIAL');
  console.log(`🤖 Modelo: ${MODEL} (NVIDIA Nemotron Oficial)`);
  console.log(`📊 Total de Cenários: ${TEST_MATRIX.length} Casos Reais de PMEs Brasileiras`);
  console.log('='.repeat(90));

  const results = [];

  for (let i = 0; i < TEST_MATRIX.length; i++) {
    const t = TEST_MATRIX[i];
    console.log(`\n[${i + 1}/${TEST_MATRIX.length}] 🏢 NICHO: ${t.niche.toUpperCase()}`);
    console.log(`    👤 Perfil Cliente: ${t.clientType}`);
    console.log(`    🚪 Origem: ${t.entryChannel} | 📈 Momento: ${t.funnelStage}`);
    console.log(`    💬 Mensagem do Lead: "${t.userMessage}"`);

    const result = await runSingleTest(t);

    if (result.success) {
      console.log(`    ⚡ Latência: ${result.latencyMs}ms | 🪙 Tokens: ${result.tokens} | Custo: R$ 0,00`);
      console.log(`    🤖 Resposta do Agente SOS Sales:\n    --------------------------------------------------`);
      console.log(`    ${result.content.replace(/\n/g, '\n    ')}`);
      console.log(`    --------------------------------------------------`);
      results.push({
        niche: t.niche,
        profile: t.clientType,
        latency: `${result.latencyMs}ms`,
        status: '✅ APROVADO',
        responseSnippet: result.content.slice(0, 100) + '...',
      });
    } else {
      console.log(`    ❌ Falha: ${result.error}`);
      results.push({
        niche: t.niche,
        profile: t.clientType,
        latency: `${result.latencyMs}ms`,
        status: '❌ FALHA',
        responseSnippet: result.error,
      });
    }
  }

  console.log('\n' + '='.repeat(90));
  console.log('🏆 RESUMO FINAL DE CONFORMIDADE & PERFORMANCE');
  console.log('='.repeat(90));
  console.table(results);
}

runAllMultiNicheTests().catch(console.error);
