let pg;
try {
  pg = (await import('pg')).default;
} catch {
  try {
    pg = (await import('../apps/api/node_modules/pg/lib/index.js')).default;
  } catch {
    pg = (await import('../api/node_modules/pg/lib/index.js')).default;
  }
}
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.yiiuebhyqixzluguxsqi:sos-sales-db-prod-2026@aws-0-ca-central-1.pooler.supabase.com:6543/postgres';

const isLocal = DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1');
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

const defaultBusinessHours = [
  { day: 'Segunda-feira', open: '08:00', close: '19:00', isOpen: true },
  { day: 'Terça-feira', open: '08:00', close: '19:00', isOpen: true },
  { day: 'Quarta-feira', open: '08:00', close: '19:00', isOpen: true },
  { day: 'Quinta-feira', open: '08:00', close: '19:00', isOpen: true },
  { day: 'Sexta-feira', open: '08:00', close: '19:00', isOpen: true },
  { day: 'Sábado', open: '08:00', close: '14:00', isOpen: true },
  { day: 'Domingo', open: '08:00', close: '12:00', isOpen: false },
];

const sosBundle = {
  workspaceId: "11111111-1111-1111-1111-111111111111",
  schemaVersion: "1.0",
  updatedAt: new Date().toISOString(),
  tradeName: "SOS Vendas · Sistema Operacional de Vendas",
  agentName: "Sofia · Consultora SOS Vendas",
  businessType: "Software Comercial (SaaS) & Inteligência de Vendas no WhatsApp",
  city: "Chapecó, SC",
  bookingUrl: "https://crm.iaparavendas.tech/onboarding",
  companyProfile: {
    legalName: "SOS Vendas Tecnologia LTDA",
    tradeName: "SOS Vendas · Sistema Operacional de Vendas",
    cnpj: "55.123.456/0001-89",
    segment: "Software Comercial (SaaS) & Inteligência de Vendas no WhatsApp",
    city: "Chapecó",
    state: "SC",
    targetAudience: "Gestores comerciais, proprietários de clínicas, salões, estética e e-commerce que vendem via WhatsApp",
    differential: "Cockpit com resposta em < 30s, IA Receptionist 24/7 nativa em NVIDIA Nemotron 3.5, espelhamento de agenda e CAPI Meta Ads de loop fechado",
    bookingUrl: "https://crm.iaparavendas.tech/onboarding",
    businessHours: defaultBusinessHours
  },
  agentConfig: {
    name: "Sofia",
    persona: "Consultora Comercial Sênior de Vendas da SOS Vendas. Ágil, objetiva, segura de si, calorosa e focada em fechamento de alto valor.",
    toneOfVoice: "comercial_fechador",
    autonomyMode: "autonomous",
    creativityTemperature: 0.6,
    maxDiscountPercent: 10,
    maxInstallmentsWithoutInterest: 12,
    paymentMethods: ["pix", "cartao_credito", "boleto"],
    safetyGuardrails: [
      "Apresentar as condições ativas: mensal R$ 97,00; anual no Pix R$ 582,00 à vista; anual no cartão 12x de R$ 58,20.",
      "Nunca encerrar a resposta sem propor uma escolha fechada (Menor Próximo Passo).",
      "Não conceder descontos adicionais além da alçada autorizada (máx 10% no plano anual).",
      "Destacar o Cockpit com respostas em < 30s e espelhamento de agenda.",
      "Banco Oculto de Humanização: falar como atendente humano real, frases curtas de WhatsApp, sem clichês de IA (proibido certamente/compreendo sua dor), sem travessão longo (—) e sem listas burocráticas."
    ],
    escalationTriggers: [
      "Lead solicita falar expressamente com atendimento humano ou suporte técnico.",
      "Dúvidas jurídicas complexas, solicitação de contrato customizado ou DPA corporativo.",
      "Tentativa de negociação de plano enterprise para mais de 10 operações simultâneas."
    ]
  },
  directives: [
    "Apresentar as condições ativas: mensal R$ 97,00; anual no Pix R$ 582,00 à vista; anual no cartão 12x de R$ 58,20.",
    "Nunca encerrar a resposta sem propor uma escolha fechada (Menor Próximo Passo).",
    "Não conceder descontos adicionais além da alçada autorizada.",
    "Destacar o Cockpit com respostas em < 30s e espelhamento de agenda.",
    "Banco Oculto de Humanização: falar como atendente humano real, frases curtas de WhatsApp, sem clichês de IA (proibido certamente/compreendo sua dor), sem travessão longo (—) e sem listas burocráticas."
  ],
  catalog: [
    {
      id: "prod_anual_pix",
      name: "Plano Anual SOS Vendas (Pix)",
      category: "Planos Anuais",
      description: "Cockpit completo, IA Receptionist 24/7, Simulador Nemotron e CAPI Meta Ads em condição especial à vista",
      basePrice: 582.00,
      promotionalPrice: 582.00,
      price: "R$ 582,00 à vista (50% OFF)",
      active: true
    },
    {
      id: "prod_anual_cartao",
      name: "Plano Anual SOS Vendas (Cartão)",
      category: "Planos Anuais",
      description: "Acesso anual completo parcelado em até 12x no cartão de crédito",
      basePrice: 698.40,
      promotionalPrice: 698.40,
      price: "12x de R$ 58,20 (40% OFF)",
      active: true
    },
    {
      id: "prod_mensal",
      name: "Plano Mensal SOS Vendas",
      category: "Assinatura Mensal",
      description: "Assinatura mensal recorrente com todos os recursos, cancele quando quiser sem fidelidade",
      basePrice: 97.00,
      price: "R$ 97,00/mês sem fidelidade",
      active: true
    }
  ],
  documents: [
    {
      id: "doc_sos_politica",
      title: "Manual de Oferta e Garantia SOS Vendas",
      category: "manual",
      status: "active",
      content: "Garantia incondicional de 7 dias com devolução integral via Pix. Implantação guiada e suporte operacional via WhatsApp."
    }
  ]
};

const havenBundle = {
  workspaceId: "22222222-2222-2222-2222-222222222222",
  schemaVersion: "1.0",
  updatedAt: new Date().toISOString(),
  tradeName: "Haven Escovaria & Esmalteria",
  agentName: "Camila · Concierge Haven 24/7",
  businessType: "Escovaria e Salão de Beleza Premium",
  city: "Chapecó, SC",
  bookingUrl: "https://www.trinks.com/haven-escovaria",
  companyProfile: {
    legalName: "Haven Serviços de Beleza LTDA",
    tradeName: "Haven Escovaria & Esmalteria",
    cnpj: "42.987.654/0001-12",
    segment: "Escovaria, Esmalteria e Salão de Beleza Premium",
    city: "Chapecó",
    state: "SC",
    targetAudience: "Mulheres modernas que valorizam atendimento ágil, ambiente refinado e biossegurança rigorosa",
    differential: "Atendimento express sem hora marcada para escova, ozonioterapia capilar e esmaltação em gel de alta durabilidade",
    bookingUrl: "https://www.trinks.com/haven-escovaria",
    businessHours: defaultBusinessHours
  },
  agentConfig: {
    name: "Camila",
    persona: "Concierge da Haven Escovaria. Calorosa, atenta a detalhes de beleza e acolhedora no WhatsApp.",
    toneOfVoice: "elegante_acolhedor",
    autonomyMode: "autonomous",
    creativityTemperature: 0.5,
    maxDiscountPercent: 5,
    maxInstallmentsWithoutInterest: 3,
    paymentMethods: ["pix", "cartao_credito", "cartao_debito", "dinheiro"],
    safetyGuardrails: [
      "Apresentar a Escova Express por R$ 59 com lavagem e ozônioterapia inclusas.",
      "Direcionar agendamentos e conferência de tabela atualizada para o link oficial do Trinks.",
      "Cobrar sinal de R$ 30 via Pix para segurar vaga concorrida de sábado.",
      "Tom de voz sempre caloroso, sofisticado, acolhedor e ágil.",
      "Banco Oculto de Humanização: tom natural e humano de WhatsApp, sem clichês de IA e sem travessões tipográficos."
    ],
    escalationTriggers: [
      "Cliente relata reação alérgica ou insatisfação com procedimento anterior.",
      "Solicitação de agendamento de noivas ou grupos de madrinhas (mais de 3 pessoas).",
      "Dúvidas sobre disponibilidade urgente nos próximos 30 minutos."
    ]
  },
  directives: [
    "Apresentar a Escova Express por R$ 59 com lavagem e ozônioterapia inclusas.",
    "Direcionar agendamentos e conferência de tabela atualizada para o link oficial do Trinks.",
    "Cobrar sinal de R$ 30 via Pix para segurar vaga concorrida de sábado.",
    "Tom de voz sempre caloroso, sofisticado, acolhedor e ágil.",
    "Banco Oculto de Humanização: tom natural e humano de WhatsApp, sem clichês de IA e sem travessões tipográficos."
  ],
  catalog: [
    {
      id: "prod_escova_express",
      name: "Escova Express",
      category: "Cabelos",
      description: "Lavagem com produtos de alta performance + ozônioterapia + modelagem expressa",
      basePrice: 59.00,
      price: "R$ 59,00",
      active: true
    },
    {
      id: "prod_esmalte_gel",
      name: "Esmaltação em Gel Premium",
      category: "Unhas",
      description: "Dura até 21 dias sem lascar, acabamento impecável com cabine LED",
      basePrice: 150.00,
      price: "R$ 150,00",
      active: true
    },
    {
      id: "prod_spa_pes",
      name: "Spa dos Pés Relaxante",
      category: "Estética",
      description: "Esfoliação, hidratação profunda com parafina e massagem relaxante",
      basePrice: 80.00,
      price: "R$ 80,00",
      active: true
    },
    {
      id: "prod_terapia_capilar",
      name: "Terapia Capilar Regenerativa",
      category: "Tratamentos",
      description: "Tratamento intensivo de reconstrução para fios danificados por química ou calor",
      basePrice: 190.00,
      price: "R$ 190,00",
      active: true
    }
  ],
  documents: [
    {
      id: "doc_haven_politica",
      title: "Regras de Agendamento e Cancelamento Haven",
      category: "politica",
      status: "active",
      content: "Tolerância de atraso de 15 minutos. Cancelamento com reembolso de sinal deve ocorrer até 2h antes."
    }
  ]
};

const soraBundle = {
  workspaceId: "33333333-3333-3333-3333-333333333333",
  schemaVersion: "1.0",
  updatedAt: new Date().toISOString(),
  tradeName: "Sora Ritual Spa · Headspa Japonês",
  agentName: "Sora Concierge 24/7",
  businessType: "Headspa Sensorial & Massagem Craniana",
  city: "Chapecó, SC",
  bookingUrl: "https://crm.iaparavendas.tech/sora-booking",
  companyProfile: {
    legalName: "Sora Terapias Sensoriais LTDA",
    tradeName: "Sora Ritual Spa · Headspa Japonês",
    cnpj: "38.543.210/0001-45",
    segment: "Headspa Sensorial & Massagem Craniana Japonesa",
    city: "Chapecó",
    state: "SC",
    targetAudience: "Pessoas que buscam alívio de estresse, melhora do sono, desintoxicação do couro cabeludo e relaxamento profundo",
    differential: "Técnica japonesa autêntica com diagnóstico capilar por microcâmera, arco de água aquecida e massagem ayurvédica craniana",
    bookingUrl: "https://crm.iaparavendas.tech/sora-booking",
    businessHours: defaultBusinessHours
  },
  agentConfig: {
    name: "Sora",
    persona: "Concierge Zen do Sora Ritual Spa. Voz suave, acolhedora, respeitosa e focada em bem-estar holístico.",
    toneOfVoice: "elegante_acolhedor",
    autonomyMode: "autonomous",
    creativityTemperature: 0.5,
    maxDiscountPercent: 5,
    maxInstallmentsWithoutInterest: 3,
    paymentMethods: ["pix", "cartao_credito"],
    safetyGuardrails: [
      "Apresentar o Ritual Headspa Sensorial como experiência única de relaxamento e saúde capilar.",
      "Oferecer opções de Vale Presente dos Sonhos para aniversários e datas especiais.",
      "Manter tom zen, empático, relaxante e atencioso.",
      "Banco Oculto de Humanização: tom natural e humano de WhatsApp, sem clichês de IA e sem travessões tipográficos."
    ],
    escalationTriggers: [
      "Cliente relata condições médicas específicas (cirurgia craniana recente, gravidez de alto risco).",
      "Solicitação de reservas exclusivas do espaço para grupos corporativos.",
      "Problemas com validação de Vale Presente físico."
    ]
  },
  directives: [
    "Apresentar o Ritual Headspa Sensorial como experiência única de relaxamento e saúde capilar.",
    "Oferecer opções de Vale Presente dos Sonhos para aniversários e datas especiais.",
    "Manter tom zen, empático, relaxante e atencioso.",
    "Banco Oculto de Humanização: tom natural e humano de WhatsApp, sem clichês de IA e sem travessões tipográficos."
  ],
  catalog: [
    {
      id: "prod_headspa_sensorial",
      name: "Ritual Headspa Sensorial",
      category: "Rituais",
      description: "Diagnóstico por microcâmera + arco de água sensorial aquecida + massagem craniana",
      basePrice: 290.00,
      price: "R$ 290,00",
      active: true
    },
    {
      id: "prod_experiencia_dois",
      name: "Experiência Sora a Dois",
      category: "Experiências",
      description: "Headspa duplo sincronizado com espumante, frutas e sala aromática privativa",
      basePrice: 580.00,
      price: "R$ 580,00",
      active: true
    },
    {
      id: "prod_vale_presente",
      name: "Vale Presente dos Sonhos",
      category: "Presentes",
      description: "Caixa de cetim personalizada com voucher luxuoso para presentear alguém especial",
      basePrice: 290.00,
      price: "R$ 290,00",
      active: true
    }
  ],
  documents: [
    {
      id: "doc_sora_ritual",
      title: "Contraindicações e Preparação para o Headspa",
      category: "manual",
      status: "active",
      content: "Recomendamos vir com roupas confortáveis. Procedimento suave e 100% relaxante."
    }
  ]
};

async function main() {
  console.log('Populando workspace_intelligence_bundles com isolamento absoluto por workspace...');
  const wsRes = await pool.query('SELECT id, name, slug FROM public.workspaces');
  const existingWorkspaces = wsRes.rows;
  console.log(`Workspaces encontrados no banco: ${existingWorkspaces.length}`);

  const bundlesToInsert = [];

  for (const ws of existingWorkspaces) {
    const slug = (ws.slug || '').toLowerCase();
    const id = ws.id;
    if (slug.includes('haven') || id === '22222222-2222-2222-2222-222222222222' || id === 'a0000000-0000-0000-0000-000000000001') {
      bundlesToInsert.push({ ...havenBundle, workspaceId: id });
    } else if (slug.includes('sora') || id === '33333333-3333-3333-3333-333333333333') {
      bundlesToInsert.push({ ...soraBundle, workspaceId: id });
    } else {
      bundlesToInsert.push({ ...sosBundle, workspaceId: id });
    }
  }

  for (const b of bundlesToInsert) {
    await pool.query(
      `INSERT INTO public.workspace_intelligence_bundles (
         workspace_id, bundle, schema_version, published_at, updated_at
       ) VALUES ($1, $2::jsonb, $3, NOW(), NOW())
       ON CONFLICT (workspace_id) DO UPDATE SET
         bundle = $2::jsonb,
         schema_version = $3,
         published_at = NOW(),
         updated_at = NOW()`,
      [b.workspaceId, JSON.stringify(b), b.schemaVersion || '1.0']
    );
    console.log(`✅ [${b.tradeName}] (Workspace: ${b.workspaceId}) Bundle canônico persistido e publicado com sucesso!`);
  }
}

main().then(() => pool.end()).catch((err) => {
  console.error('Erro ao semear bundles:', err);
  process.exit(1);
});
