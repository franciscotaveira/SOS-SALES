import pg from 'pg';
const { Client } = pg;

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL (ou SUPABASE_DB_URL) deve ser fornecida por variável de ambiente.');
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  await client.connect();
  console.log('Connected to Supabase PostgreSQL...');

  const workspaceId = '11111111-1111-1111-1111-111111111111';

  // 1. Workspace Agent Config
  const services = JSON.stringify([
    {
      name: 'Plano Anual SOS Vendas (Pix · 50% OFF)',
      price: 582.0,
      recurrence: 'R$ 582,00 à vista no Pix',
      description: 'Acesso completo ao SOS Vendas para 1 número comercial + 5 operadores + Motor de Inteligência Comercial e Recuperação Automática de Vendas.',
      conversionTriggerPitch: 'O Plano Anual no Pix está com 50% OFF no lançamento e sai por R$ 582,00 à vista. Quer receber o checkout dessa condição?',
    },
    {
      name: 'Plano Mensal Flexível SOS Vendas',
      price: 97.0,
      recurrence: 'R$ 97,00/mês',
      description: 'Acesso completo ao Cockpit Comercial, fila com SLA, Copilot 1-Clique, Traffic Proof Meta CAPI e até 5 operadores.',
    },
    {
      name: 'Plano Anual SOS Vendas (Cartão · 40% OFF)',
      price: 698.4,
      recurrence: '12x de R$ 58,20',
      description: 'Acesso completo ao SOS Vendas com um ano de previsibilidade e desconto no cartão.',
    },
    {
      name: 'Plano Escala VIP (Mentoria & Implementação)',
      price: 1497.0,
      recurrence: 'R$ 1.497/mês',
      description: 'Acompanhamento VIP, múltiplos números de WhatsApp e implantação personalizada de continuidade cognitiva.',
    },
  ]);

  const prompt = `Você é a Sofia, especialista comercial do SOS Vendas. Seu objetivo é ajudar empresários e gestores a reduzir o prejuízo de clientes perdidos no vácuo do WhatsApp, demonstrando a velocidade das respostas em 1 clique e as condições ativas da Cakto: mensal R$ 97,00; anual no Pix R$ 582,00 à vista (50% OFF); anual no cartão 12x de R$ 58,20 (40% OFF). Nunca invente desconto, prazo, garantia ou condição fora da oferta publicada.`;

  const qAgent = `
    UPDATE public.workspace_agent_config
    SET
      agent_name = $1,
      business_type = $2,
      services_json = $3::jsonb,
      working_hours = $4,
      phone = $5,
      city = $6,
      extra_context = $7,
      autonomy_mode = $8,
      runtime_enabled = true,
      behavior_config = $9::jsonb,
      updated_at = NOW()
    WHERE workspace_id = $10
    RETURNING workspace_id, agent_name, business_type, phone, city, working_hours, autonomy_mode;
  `;

  const valsAgent = [
    'Sofia · Especialista Comercial',
    'Software Comercial (SaaS) & Inteligência de Vendas no WhatsApp',
    services,
    'Segunda a Sexta: 08h às 20h | Sábado: 09h às 18h',
    '+55 49 98844-7562',
    'Chapecó, SC',
    prompt,
    'copilot_supervised',
    JSON.stringify({ tone: 'consultivo_premium', rhythm: 'natural_humano' }),
    workspaceId,
  ];

  const resAgent = await client.query(qAgent, valsAgent);
  console.log('SUCCESS: Workspace Agent Config updated:');
  console.log(resAgent.rows[0]);

  // 2. Workspace Operational Settings
  const commercialConfig = {
    workspaceId,
    businessName: 'SOS Vendas · Sistema Operacional de Vendas',
    businessType: 'b2b_sales',
    agendaProviderType: 'google_calendar',
    agendaProviderName: 'Google Agenda Comercial',
    agendaUrl: 'https://calendar.google.com/calendar/u/0/r',
    pixKey: 'contato@iaparavendas.tech',
    pixReceiverName: 'SOS Vendas Tecnologia LTDA',
    businessAddress: 'Avenida Fernando Machado, 400 - Centro Empresarial MCT, Chapecó - SC',
    customMacros: [
      {
        id: 'pix',
        label: '💰 Pix Oficial',
        template: 'Segue nossa chave Pix oficial para confirmação: contato@iaparavendas.tech (SOS Vendas Tecnologia LTDA). Assim que fizer o envio, me manda o comprovante aqui, {{nome}}! 🚀',
      },
      {
        id: 'horarios',
        label: '📅 Demonstração Comercial',
        template: 'Oi {{nome}}! Conferi nossa grade para demonstrar o SOS Vendas e temos vagas livres hoje às {{horarios}}. Qual dessas opções fica melhor para você?',
      },
      {
        id: 'oferta',
        label: '🏷️ Oferta Empresa Amiga (50% OFF)',
        template: 'Oi {{nome}}! O Plano Anual no Pix está com 50% OFF no lançamento e sai por R$ 582,00 à vista. Quer que eu te envie o checkout?',
      },
      {
        id: 'localizacao',
        label: '📍 Sede Chapecó / Atendimento',
        template: 'Ficamos localizados no Centro Empresarial MCT em Chapecó/SC, e atendemos empresas em todo o Brasil. Quer que eu te envie o link de ativação?',
      },
    ],
  };

  const qOp = `
    INSERT INTO public.workspace_operational_settings (
      workspace_id,
      commercial_config,
      daily_target_revenue_minor,
      created_at,
      updated_at
    ) VALUES (
      $1,
      $2::jsonb,
      $3,
      NOW(),
      NOW()
    )
    ON CONFLICT (workspace_id) DO UPDATE
    SET
      commercial_config = EXCLUDED.commercial_config,
      daily_target_revenue_minor = EXCLUDED.daily_target_revenue_minor,
      updated_at = NOW()
    RETURNING workspace_id, daily_target_revenue_minor;
  `;

  const resOp = await client.query(qOp, [workspaceId, JSON.stringify(commercialConfig), 200000]);
  console.log('SUCCESS: Workspace Operational Settings upserted:');
  console.log(resOp.rows[0]);

  await client.end();
}

run().catch((err) => {
  console.error('ERROR seeding configurations:', err);
  process.exit(1);
});
