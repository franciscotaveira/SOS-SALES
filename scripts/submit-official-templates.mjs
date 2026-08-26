import fetch from 'node-fetch';

const WABA_ID = process.env.META_WABA_ID?.trim() || '';
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN?.trim() || '';

const TEMPLATES = [
  {
    name: 'cobranca_pix_sinal_v1',
    category: 'UTILITY',
    language: 'pt_BR',
    headerText: 'Garantia de Horário',
    bodyText: 'Olá {{1}}! Segue a chave Pix no valor de R$ {{2}} para garantir o seu horário exclusivo com nossa equipe: {{3}}. Aguardamos seu comprovante para confirmar!',
    buttonText: 'Ja Fiz o Pix',
  },
  {
    name: 'pesquisa_satisfacao_nps_v1',
    category: 'MARKETING',
    language: 'pt_BR',
    headerText: 'Como foi sua Experiencia',
    bodyText: 'Olá {{1}}! Agradecemos sua visita hoje. Como você avalia o atendimento que recebeu da nossa equipe em sua sessão de {{2}}?',
    buttonText: 'Excelente',
  },
];

async function submitTemplate(t) {
  const components = [];
  if (t.headerText) {
    components.push({ type: 'HEADER', format: 'TEXT', text: t.headerText });
  }

  const varMatches = t.bodyText.match(/\{\{\d+\}\}/g);
  if (varMatches && varMatches.length > 0) {
    const sampleValues = varMatches.map((_, i) => `Exemplo_${i + 1}`);
    components.push({
      type: 'BODY',
      text: t.bodyText,
      example: {
        body_text: [sampleValues],
      },
    });
  } else {
    components.push({ type: 'BODY', text: t.bodyText });
  }

  if (t.buttonText) {
    components.push({
      type: 'BUTTONS',
      buttons: [{ type: 'QUICK_REPLY', text: t.buttonText }],
    });
  }

  const payload = {
    name: t.name,
    category: t.category,
    allow_category_change: true,
    language: t.language,
    components,
  };

  console.log(`\nSubmetendo template ajustado: ${t.name} (${t.category})...`);
  const res = await fetch(`https://graph.facebook.com/v20.0/${WABA_ID}/message_templates`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (res.ok) {
    console.log(`✅ Sucesso! ID: ${data.id}, Status: ${data.status}, Categoria: ${data.category}`);
  } else {
    console.error(`❌ Erro Meta:`, data.error);
  }
}

async function main() {
  if (!WABA_ID || !ACCESS_TOKEN) {
    throw new Error('META_WABA_ID and META_ACCESS_TOKEN are required');
  }

  for (const t of TEMPLATES) {
    await submitTemplate(t);
  }

  console.log('\n=== CONSULTANDO STATUS ATUALIZADO DE TODOS OS TEMPLATES NA META ===');
  const listRes = await fetch(`https://graph.facebook.com/v20.0/${WABA_ID}/message_templates?limit=100`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  const listData = await listRes.json();
  console.log('Total de templates na conta:', listData.data?.length || 0);
  for (const item of listData.data || []) {
    console.log(`- ${item.name} (${item.category}): Status = ${item.status}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Template submission failed');
  process.exitCode = 1;
});
