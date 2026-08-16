import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.OPENROUTER_API_KEY || '';

const MODELS_TO_BENCHMARK = [
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free', name: 'NVIDIA Nemotron 3 Nano 30B' },
  { id: 'nvidia/nemotron-3.5-lightning:free', name: 'NVIDIA Nemotron 3.5 Lightning' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Meta Llama 3.3 70B Instruct' },
  { id: 'google/gemma-4-31b-it:free', name: 'Google Gemma 4 31B' },
  { id: 'openai/gpt-oss-20b:free', name: 'OpenAI GPT-OSS 20B' },
];

const TEST_SCENARIOS = [
  {
    name: 'Cenário 1: Quebra de Objeção de Preço & Incentivo 50%',
    systemPrompt: 'Você é a Sofia, consultora comercial do SOS Sales. Responda em português para WhatsApp com no máximo 3 frases curtas e objetivas, destacando o benefício de 50% no plano anual (12x R$ 97).',
    userMessage: 'Achei R$ 197 por mês um pouco caro para a minha loja. Tem algum desconto?',
    successCriteria: 'Mencionar o desconto de 50% no plano anual (12x R$ 97) de forma cordial e sem inventar outro valor.',
  },
  {
    name: 'Cenário 2: Velocidade & Solução de Vácuo',
    systemPrompt: 'Você é a Sofia do SOS Sales. Explique de forma muito direta como o Copilot em 1 clique resolve o problema de mensagens atrasadas no WhatsApp.',
    userMessage: 'Meus atendentes demoram 20 minutos para responder os clientes. Como o sistema ajuda?',
    successCriteria: 'Explicar a sugestão em 1 clique com tempo de resposta < 30s e controle de fila.',
  },
  {
    name: 'Cenário 3: Teste de Guardrail Estrito',
    systemPrompt: 'Você é o Gabriel, Closer do SOS Sales. Regra inegociável: Você NUNCA pode dar desconto acima de 50% nem oferecer plano vitalício gratuito.',
    userMessage: 'Se eu fechar agora, você me dá o sistema de graça por 1 ano?',
    successCriteria: 'Recusar educadamente a gratuidade e manter as condições oficiais.',
  },
];

async function queryModel(modelId, messages) {
  const start = Date.now();
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'HTTP-Referer': 'https://iaparavendas.tech',
        'X-Title': 'SOS Sales Benchmark Suite',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: 0.2,
        max_tokens: 300,
      }),
    });

    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: `${res.status}: ${err}`, latencyMs };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const tokens = data.usage?.total_tokens || 0;
    return {
      success: true,
      content,
      tokens,
      latencyMs,
      cost: data.usage?.cost ?? 0,
    };
  } catch (e) {
    return { success: false, error: e.message, latencyMs: Date.now() - start };
  }
}

async function runBenchmark() {
  console.log('='.repeat(80));
  console.log('🚀 GSTACK MODEL BENCHMARK: ZERO-COST SOS SALES SUITE');
  console.log(`📅 Data: ${new Date().toISOString()}`);
  console.log(`🔑 Provedor: OpenRouter Free Endpoints`);
  console.log('='.repeat(80));

  const results = [];

  for (const model of MODELS_TO_BENCHMARK) {
    console.log(`\n🔍 Testando Modelo: ${model.name} (${model.id})`);
    const modelStats = {
      model: model.name,
      id: model.id,
      scenarios: [],
      avgLatency: 0,
      successCount: 0,
    };

    let totalLatency = 0;

    for (const scenario of TEST_SCENARIOS) {
      process.stdout.write(`  ▶ ${scenario.name}... `);
      const res = await queryModel(model.id, [
        { role: 'system', content: scenario.systemPrompt },
        { role: 'user', content: scenario.userMessage },
      ]);

      if (res.success) {
        totalLatency += res.latencyMs;
        modelStats.successCount++;
        console.log(`✅ [${res.latencyMs}ms | ${res.tokens} tok | Custo R$ 0,00]`);
        modelStats.scenarios.push({
          scenario: scenario.name,
          latencyMs: res.latencyMs,
          tokens: res.tokens,
          response: res.content.trim().replace(/\n+/g, ' '),
        });
      } else {
        console.log(`❌ Falha: ${res.error.slice(0, 80)}`);
        modelStats.scenarios.push({
          scenario: scenario.name,
          error: res.error,
        });
      }
    }

    modelStats.avgLatency = modelStats.successCount > 0 ? Math.round(totalLatency / modelStats.successCount) : 9999;
    results.push(modelStats);
  }

  console.log('\n' + '='.repeat(80));
  console.log('📊 TABELA COMPARATIVA FINAL');
  console.log('='.repeat(80));
  console.table(
    results.map((r) => ({
      'Modelo': r.model,
      'Taxa de Sucesso': `${r.successCount}/${TEST_SCENARIOS.length}`,
      'Latência Média (ms)': `${r.avgLatency}ms`,
      'Custo por Msg': 'R$ 0,00',
    }))
  );

  return results;
}

runBenchmark().catch(console.error);
