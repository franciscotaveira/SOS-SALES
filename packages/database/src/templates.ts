import type { PoolClient } from "pg";

export type TemplateCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";
export type TemplateStatus = "APPROVED" | "PENDING" | "REJECTED" | "PAUSED";

export interface MessageTemplateButton {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
}

export interface MessageTemplateRecord {
  id: string;
  workspace_id: string;
  name: string;
  category: TemplateCategory;
  language: string;
  header_text: string | null;
  body_text: string;
  footer_text: string | null;
  buttons: MessageTemplateButton[];
  variables: string[];
  status: TemplateStatus;
  meta_template_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export const CANONICAL_MASTER_TEMPLATES = [
  {
    name: "confirmacao_agendamento_v1",
    category: "UTILITY" as TemplateCategory,
    language: "pt_BR",
    header_text: "Confirmação de Agendamento",
    body_text: "Olá {{1}}, confirmamos o seu agendamento para {{2}} às {{3}}. Caso precise alterar ou reagendar, basta responder por aqui.",
    footer_text: "Atendimento Oficial",
    buttons: [
      { type: "QUICK_REPLY", text: "Confirmar Presença" },
      { type: "QUICK_REPLY", text: "Reagendar Horário" },
    ],
    variables: ["nome", "data", "horario"],
  },
  {
    name: "lembrete_2h_atendimento_v1",
    category: "UTILITY" as TemplateCategory,
    language: "pt_BR",
    header_text: "Lembrete de Horário",
    body_text: "Olá {{1}}, passando para lembrar que seu atendimento será hoje às {{2}} (em aproximadamente 2 horas). Nossa equipe já está preparada.",
    footer_text: "SOS Sales",
    buttons: [
      { type: "QUICK_REPLY", text: "Estou a Caminho" },
      { type: "QUICK_REPLY", text: "Preciso de Ajuda" },
    ],
    variables: ["nome", "horario"],
  },
  {
    name: "reativacao_lead_esfriado_v1",
    category: "MARKETING" as TemplateCategory,
    language: "pt_BR",
    header_text: "Condição Especial Reservada",
    body_text: "Olá {{1}}, notamos seu interesse em nossa solução e separamos uma condição exclusiva com bônus especial válida até {{2}}. Deseja conferir?",
    footer_text: "Oferta Exclusiva",
    buttons: [
      { type: "QUICK_REPLY", text: "Quero Ver Detalhes" },
      { type: "QUICK_REPLY", text: "Falar com Consultor" },
    ],
    variables: ["nome", "prazo"],
  },
  {
    name: "oferta_relampago_vip_v1",
    category: "MARKETING" as TemplateCategory,
    language: "pt_BR",
    header_text: "Acesso Liberado ⚡",
    body_text: "{{1}}, liberamos a condição VIP com desconto especial para {{2}}. Toque no botão abaixo para garantir o seu acesso antes do encerramento.",
    footer_text: "Tempo Limitado",
    buttons: [
      { type: "QUICK_REPLY", text: "Garantir Agora" },
      { type: "QUICK_REPLY", text: "Tirar Dúvidas" },
    ],
    variables: ["nome", "produto"],
  },
];

export async function listMessageTemplates(
  client: PoolClient,
  workspaceId: string,
  options?: { category?: TemplateCategory; status?: TemplateStatus }
): Promise<MessageTemplateRecord[]> {
  let query = `
    SELECT 
      id,
      workspace_id,
      name,
      category,
      language,
      header_text,
      body_text,
      footer_text,
      buttons,
      variables,
      status,
      meta_template_id,
      created_at,
      updated_at
    FROM public.message_templates
    WHERE workspace_id = $1
  `;
  const params: unknown[] = [workspaceId];
  let paramIdx = 2;

  if (options?.category) {
    query += ` AND category = $${paramIdx++}`;
    params.push(options.category);
  }

  if (options?.status) {
    query += ` AND status = $${paramIdx++}`;
    params.push(options.status);
  }

  query += ` ORDER BY category ASC, name ASC`;

  const result = await client.query(query, params);

  // If no templates exist for this workspace yet, seed canonical templates and return them
  if (result.rows.length === 0 && !options?.category && !options?.status) {
    await seedMasterTemplates(client, workspaceId);
    const recheck = await client.query(query, params);
    return recheck.rows.map(mapRowToTemplate);
  }

  return result.rows.map(mapRowToTemplate);
}

export async function getMessageTemplateByName(
  client: PoolClient,
  workspaceId: string,
  name: string
): Promise<MessageTemplateRecord | null> {
  const query = `
    SELECT 
      id,
      workspace_id,
      name,
      category,
      language,
      header_text,
      body_text,
      footer_text,
      buttons,
      variables,
      status,
      meta_template_id,
      created_at,
      updated_at
    FROM public.message_templates
    WHERE workspace_id = $1 AND name = $2
    LIMIT 1
  `;
  const result = await client.query(query, [workspaceId, name]);
  if (result.rows.length === 0) return null;
  return mapRowToTemplate(result.rows[0]);
}

export async function upsertMessageTemplate(
  client: PoolClient,
  template: {
    workspaceId: string;
    name: string;
    category: TemplateCategory;
    language?: string;
    headerText?: string | null;
    bodyText: string;
    footerText?: string | null;
    buttons?: MessageTemplateButton[];
    variables?: string[];
    status?: TemplateStatus;
    metaTemplateId?: string | null;
  }
): Promise<MessageTemplateRecord> {
  const query = `
    INSERT INTO public.message_templates (
      workspace_id,
      name,
      category,
      language,
      header_text,
      body_text,
      footer_text,
      buttons,
      variables,
      status,
      meta_template_id,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now()
    )
    ON CONFLICT (workspace_id, name) DO UPDATE SET
      category = EXCLUDED.category,
      language = EXCLUDED.language,
      header_text = EXCLUDED.header_text,
      body_text = EXCLUDED.body_text,
      footer_text = EXCLUDED.footer_text,
      buttons = EXCLUDED.buttons,
      variables = EXCLUDED.variables,
      status = EXCLUDED.status,
      meta_template_id = COALESCE(EXCLUDED.meta_template_id, public.message_templates.meta_template_id),
      updated_at = now()
    RETURNING *
  `;

  const params = [
    template.workspaceId,
    template.name,
    template.category,
    template.language || "pt_BR",
    template.headerText || null,
    template.bodyText,
    template.footerText || null,
    JSON.stringify(template.buttons || []),
    JSON.stringify(template.variables || []),
    template.status || "APPROVED",
    template.metaTemplateId || null,
  ];

  const result = await client.query(query, params);
  return mapRowToTemplate(result.rows[0]);
}

export async function seedMasterTemplates(
  client: PoolClient,
  workspaceId: string
): Promise<void> {
  for (const tpl of CANONICAL_MASTER_TEMPLATES) {
    await upsertMessageTemplate(client, {
      workspaceId,
      name: tpl.name,
      category: tpl.category,
      language: tpl.language,
      headerText: tpl.header_text,
      bodyText: tpl.body_text,
      footerText: tpl.footer_text,
      buttons: tpl.buttons,
      variables: tpl.variables,
      status: "APPROVED",
    });
  }
}

function mapRowToTemplate(row: Record<string, unknown>): MessageTemplateRecord {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    name: String(row.name),
    category: row.category as TemplateCategory,
    language: String(row.language),
    header_text: row.header_text ? String(row.header_text) : null,
    body_text: String(row.body_text),
    footer_text: row.footer_text ? String(row.footer_text) : null,
    buttons: (Array.isArray(row.buttons)
      ? row.buttons
      : typeof row.buttons === "string"
      ? JSON.parse(row.buttons)
      : []) as MessageTemplateButton[],
    variables: (Array.isArray(row.variables)
      ? row.variables
      : typeof row.variables === "string"
      ? JSON.parse(row.variables)
      : []) as string[],
    status: row.status as TemplateStatus,
    meta_template_id: row.meta_template_id ? String(row.meta_template_id) : null,
    created_at: new Date(row.created_at as string | number | Date),
    updated_at: new Date(row.updated_at as string | number | Date),
  };
}
