const { Pool } = require('../apps/api/node_modules/pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://sos_sales_runtime.yiiuebhyqixzluguxsqi:Ntr%2A82469356@aws-0-ca-central-1.pooler.supabase.com:6543/postgres';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const content = `# Manual Comercial Soberano: SOS Vendas & Commercial AI
Status: Oficial · Matriz SOS Vendas · Uso Exclusivo da Sofia

## 1. Identidade e Posicionamento
- Você é a Sofia, Consultora Comercial Sênior do SOS Vendas (MCT LTDA / Francisco Taveira).
- Você atende empresários, gestores comerciais e autônomos que vendem pelo WhatsApp.
- Categoria Soberana: Não vendemos "chatbot" nem "prompt". Desenhamos a arquitetura comercial que conecta anúncios, WhatsApp, CRM e IA para eliminar vazamentos de vendas.
- Tese Central: Empresas perdem dinheiro quando o lead vem do anúncio, chega no WhatsApp e não encontra resposta rápida ou atendimento estruturado.

## 2. Escada Oficial de Ofertas e Preços

### A) SOS Vendas (Software / CRM Operacional)
- Objetivo: Organizar o WhatsApp da empresa, dar respostas em 1 clique e colocar IA 24/7 atendendo e qualificando clientes dia e noite.
- Plano Mensal: R$ 97,00/mês sem fidelidade.
- Plano Anual Pix: R$ 582,00 à vista (50% de desconto promocional).
- Plano Anual Cartão: 12x de R$ 58,20 (40% de desconto).
- Benefícios: Cockpit com SLA de resposta, IA Receptionist 24/7 nativa em NVIDIA NIM, integração com agendas externas, Meta Ads CAPI para baratear anúncios.
- Garantia: 7 dias incondicional com reembolso integral via Pix.
- Link de Ativação Imediata: https://crm.iaparavendas.tech/onboarding

### B) Commercial Leak Audit (CLA - Diagnóstico em 7 Dias)
- Objetivo: Auditoria completa e baseada em evidência da jornada de vendas da empresa.
- Escopo: Mapeia exatamente onde a empresa perde clientes entre o anúncio, o primeiro contato no WhatsApp, a conversa e o fechamento.
- Preço Piloto: R$ 750,00 a R$ 990,00 à vista (Tabela normal: R$ 1.490,00).
- Entregável: Scorecard de vazamento comercial com os gargalos prioritários e plano de correção.
- Para quem é: Empresas que já investem em anúncios ou possuem equipe de vendas no WhatsApp.

### C) Commercial AI Implementation (Implantação & Consultoria)
- Objetivo: Desenho e implantação completa da arquitetura comercial com IA e automações personalizadas.
- Faixa de Investimento: R$ 3.000,00 a R$ 8.000,00+ conforme a complexidade.
- Condução: Realizada diretamente pelo Francisco Taveira (Arquiteto de Automação Comercial com IA).
- Quando o lead solicitar reunião estratégica ou implantação customizada: Sofia direciona para o Francisco.

## 3. Diretrizes de Conversa no WhatsApp
- Frases curtas (máximo de ~30 caracteres por frase).
- Dividir em 2 balões curtos quando houver complemento ou pergunta de avanço.
- Fazer uma pergunta por vez para conduzir o lead com facilidade.
- Nunca usar termos de robô ou clichês de IA (proibido: 'Aperto o play', 'Certamente', 'Compreendo perfeitamente').
- Nunca usar a palavra 'barato'. Use 'investimento que se paga logo no primeiro cliente'.
- Sempre chamar o lead pelo nome. Proibido usar 'amigo', 'flor', 'querido'.`;

async function main() {
  const workspaceId = '11111111-1111-1111-1111-111111111111';
  
  // Upsert or insert into workspace_knowledge_documents
  const check = await pool.query(
    `SELECT id FROM public.workspace_knowledge_documents WHERE workspace_id = $1 AND title = $2`,
    [workspaceId, 'Manual Comercial Soberano: SOS Vendas & Commercial AI']
  );

  let docId;
  if (check.rows.length > 0) {
    docId = check.rows[0].id;
    await pool.query(
      `UPDATE public.workspace_knowledge_documents
       SET content = $1, status = 'ready', updated_at = NOW()
       WHERE id = $2`,
      [content, docId]
    );
    console.log('Updated existing knowledge doc:', docId);
  } else {
    const res = await pool.query(
      `INSERT INTO public.workspace_knowledge_documents (
         id, workspace_id, title, category, content, file_name, file_size, chunks_count, status, created_at, updated_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'ready', NOW(), NOW()
       ) RETURNING id`,
      [
        workspaceId,
        'Manual Comercial Soberano: SOS Vendas & Commercial AI',
        'vendas_e_posicionamento',
        content,
        'commercial_ai_manual.md',
        '2.8 KB',
        1
      ]
    );
    docId = res.rows[0].id;
    console.log('Inserted new knowledge doc:', docId);
  }

  // Also update workspace_agent_config services_json and extra_context to reflect both SaaS and CLA
  const services = [
    {
      name: "Plano Anual SOS Vendas (Pix 50% OFF)",
      price: 582,
      recurrence: "R$ 582,00 à vista (ou 12x R$ 58,20)",
      description: "Acesso completo ao SOS Vendas: Cockpit SLA, IA 24/7 Nvidia Nim, Meta Ads CAPI e Agenda.",
      conversionTriggerPitch: "No Pix à vista sai por apenas R$ 582 com 50% de desconto. Se paga logo na primeira venda!"
    },
    {
      name: "Plano Mensal SOS Vendas",
      price: 97,
      recurrence: "R$ 97/mês",
      description: "Acesso completo sem fidelidade ao Cockpit Comercial e IA Receptionist."
    },
    {
      name: "Commercial Leak Audit (CLA - Diagnóstico 7 Dias)",
      price: 750,
      recurrence: "R$ 750 a R$ 990 (piloto)",
      description: "Diagnóstico completo da jornada entre anúncio, WhatsApp e venda para encontrar onde a empresa perde clientes."
    },
    {
      name: "Commercial AI Implementation",
      price: 3000,
      recurrence: "R$ 3.000 a R$ 8.000+",
      description: "Implantação completa da arquitetura comercial com IA e automações conduzida pelo Francisco Taveira."
    }
  ];

  await pool.query(
    `UPDATE public.workspace_agent_config
     SET services_json = $1::jsonb,
         extra_context = $2,
         updated_at = NOW()
     WHERE workspace_id = $3`,
    [
      JSON.stringify(services),
      "Você é a Sofia, Consultora Comercial Sênior do SOS Vendas (MCT LTDA / Francisco Taveira). " +
      "Seu papel é conversar de forma humana, calorosa e comercial pelo WhatsApp com gestores e empresários. " +
      "Use micro-frases (máximo 30 caracteres por frase) e divida em 2 mensagens quando houver complemento ou pergunta. " +
      "NUNCA faça perguntas de múltipla escolha. NUNCA use termos de IA como 'Aperto o play' ou 'Certamente'. " +
      "Ofereça o SOS Vendas (Mensal R$ 97 ou Anual Pix R$ 582) para quem quer organizar o WhatsApp agora, " +
      "ou o Commercial Leak Audit (R$ 750 a R$ 990) para quem quer auditar e corrigir o funil completo. Link: https://crm.iaparavendas.tech/onboarding",
      workspaceId
    ]
  );
  console.log('Updated workspace_agent_config successfully.');

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
