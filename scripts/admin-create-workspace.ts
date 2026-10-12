import { Pool, getDatabasePool } from "../packages/database/src";
import { z } from "../packages/contracts/src";

const uuidSchema = z.string().uuid();
const emailSchema = z.string().email();

export interface CreateWorkspaceCliArgs {
  create: boolean;
  list: boolean;
  name?: string;
  slug?: string;
  orgId?: string;
  orgName?: string;
  orgSlug?: string;
  ownerSubjectId?: string;
  ownerEmail?: string;
  ownerName?: string;
  apply: boolean;
}

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseCreateWorkspaceArgs(argv: string[]): CreateWorkspaceCliArgs {
  const args: CreateWorkspaceCliArgs = {
    create: false,
    list: false,
    apply: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--create") {
      args.create = true;
    } else if (arg === "--list") {
      args.list = true;
    } else if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--name") {
      args.name = argv[++i];
    } else if (arg === "--slug") {
      args.slug = argv[++i];
    } else if (arg === "--org-id") {
      args.orgId = argv[++i];
    } else if (arg === "--org-name") {
      args.orgName = argv[++i];
    } else if (arg === "--org-slug") {
      args.orgSlug = argv[++i];
    } else if (arg === "--owner-subject-id" || arg === "--owner-id") {
      args.ownerSubjectId = argv[++i];
    } else if (arg === "--owner-email") {
      args.ownerEmail = argv[++i];
    } else if (arg === "--owner-name") {
      args.ownerName = argv[++i];
    }
  }

  return args;
}

export async function runAdminWorkspaceProvisioning(
  cliArgs: CreateWorkspaceCliArgs,
  customPool?: Pool
): Promise<{ success: boolean; action: string; details: Record<string, unknown> }> {
  const pool = customPool || getDatabasePool();
  const client = await pool.connect();

  try {
    // 1. List Mode
    if (cliArgs.list) {
      const res = await client.query(
        `SELECT w.id, w.name, w.slug, w.is_active, o.name AS org_name, w.created_at,
                (SELECT count(*) FROM workspace_memberships m WHERE m.workspace_id = w.id) AS member_count
         FROM workspaces w
         LEFT JOIN organizations o ON o.id = w.organization_id
         ORDER BY w.created_at DESC`
      );

      console.log(`\n🏢 Workspaces Registrados no Sistema (${res.rows.length} encontrados):`);
      if (res.rows.length === 0) {
        console.log(" (Nenhum workspace cadastrado ainda)\n");
      } else {
        for (const row of res.rows) {
          console.log(`\n • [${row.is_active ? "ATIVO" : "INATIVO"}] ${row.name} (Slug: ${row.slug})`);
          console.log(`   ID: ${row.id}`);
          console.log(`   Organização: ${row.org_name || "N/A"}`);
          console.log(`   Membros: ${row.member_count}`);
        }
        console.log("");
      }

      return {
        success: true,
        action: "list",
        details: { count: res.rows.length },
      };
    }

    // 2. Create Workspace Mode
    if (!cliArgs.create) {
      throw new Error("Especifique --create para criar um novo workspace ou --list para listar os existentes.");
    }

    if (!cliArgs.name || cliArgs.name.trim().length < 2) {
      throw new Error("Parâmetro obrigatório ausente: --name (mínimo de 2 caracteres)");
    }

    const cleanName = cliArgs.name.trim();
    const cleanSlug = cliArgs.slug?.trim() ? slugify(cliArgs.slug.trim()) : slugify(cleanName);

    if (!cleanSlug) {
      throw new Error("Slug inválido gerado a partir do nome.");
    }

    // Check slug collision
    const existingWsRes = await client.query(
      `SELECT id, name FROM workspaces WHERE slug = $1`,
      [cleanSlug]
    );
    if (existingWsRes.rows.length > 0) {
      throw new Error(`Conflito de Slug: Já existe um workspace com o slug '${cleanSlug}' (ID: ${existingWsRes.rows[0].id})`);
    }

    // Organization Resolution
    let targetOrgId = cliArgs.orgId;
    let targetOrgName = cliArgs.orgName?.trim() || cleanName;

    if (targetOrgId) {
      if (!uuidSchema.safeParse(targetOrgId).success) {
        throw new Error("ID de organização inválido (--org-id deve ser um UUID)");
      }
      const orgCheck = await client.query(`SELECT id, name FROM organizations WHERE id = $1`, [targetOrgId]);
      if (orgCheck.rows.length === 0) {
        throw new Error(`Organização não encontrada para o ID: ${targetOrgId}`);
      }
      targetOrgName = orgCheck.rows[0].name;
    }

    // Owner checks if provided
    let hasOwner = false;
    let ownerSubjectId = cliArgs.ownerSubjectId;
    let ownerEmail = cliArgs.ownerEmail?.trim().toLowerCase();
    let ownerName = cliArgs.ownerName?.trim();

    if (ownerSubjectId || ownerEmail || ownerName) {
      if (!ownerSubjectId || !uuidSchema.safeParse(ownerSubjectId).success) {
        throw new Error("Para cadastrar o proprietário (owner), informe um --owner-subject-id válido (UUID)");
      }
      if (!ownerEmail || !emailSchema.safeParse(ownerEmail).success) {
        throw new Error("Para cadastrar o proprietário (owner), informe um --owner-email válido");
      }
      if (!ownerName || ownerName.length < 2) {
        throw new Error("Para cadastrar o proprietário (owner), informe um --owner-name com pelo menos 2 caracteres");
      }
      hasOwner = true;
    }

    // Dry Run Output
    if (!cliArgs.apply) {
      console.log(`\n🔍 [DRY-RUN] Plano de Criação de Empresa / Workspace:`);
      console.log(` • Nome da Empresa / Workspace: ${cleanName}`);
      console.log(` • Slug Único: ${cleanSlug}`);
      console.log(` • Organização: ${targetOrgId ? `Existente (ID: ${targetOrgId})` : `Nova Org: "${targetOrgName}"`}`);
      if (hasOwner) {
        console.log(` • Proprietário (Owner):`);
        console.log(`   - Nome: ${ownerName}`);
        console.log(`   - E-mail: ${ownerEmail}`);
        console.log(`   - Subject ID (Supabase Auth): ${ownerSubjectId}`);
      }
      console.log(`\n⚠️  Nenhum dado gravado no banco de dados. Para aplicar, execute com a flag --apply.\n`);

      return {
        success: true,
        action: "dry-run-create",
        details: { name: cleanName, slug: cleanSlug, hasOwner },
      };
    }

    // Apply Mode (Transactional)
    await client.query("BEGIN");

    try {
      // 1. Create Org if not specified
      if (!targetOrgId) {
        const orgSlug = cliArgs.orgSlug?.trim() ? slugify(cliArgs.orgSlug) : `${cleanSlug}-org-${Date.now().toString(36)}`;
        const orgInsert = await client.query(
          `INSERT INTO organizations (id, name, slug, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
           RETURNING id, name`,
          [targetOrgName, orgSlug]
        );
        targetOrgId = orgInsert.rows[0].id;
      }

      // 2. Create Workspace
      const wsInsert = await client.query(
        `INSERT INTO workspaces (
           id, organization_id, name, slug, timezone, currency,
           is_active, radar_enabled, created_at, updated_at
         )
         VALUES (
           gen_random_uuid(), $1, $2, $3, 'America/Sao_Paulo', 'BRL',
           TRUE, TRUE, NOW(), NOW()
         )
         RETURNING id, name, slug, radar_enabled`,
        [targetOrgId, cleanName, cleanSlug]
      );
      const createdWs = wsInsert.rows[0];

      // 3. Provision Owner if provided
      if (hasOwner && ownerSubjectId && ownerEmail && ownerName) {
        // Upsert User
        await client.query(
          `INSERT INTO users (id, email, name, created_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name`,
          [ownerSubjectId, ownerEmail, ownerName]
        );

        // Membership
        await client.query(
          `INSERT INTO workspace_memberships (id, workspace_id, user_id, role, created_at)
           VALUES (gen_random_uuid(), $1, $2, 'owner', NOW())`,
          [createdWs.id, ownerSubjectId]
        );
      }

      await client.query("COMMIT");

      console.log(`\n✅ Workspace criado com sucesso!`);
      console.log(` • ID: ${createdWs.id}`);
      console.log(` • Nome: ${createdWs.name}`);
      console.log(` • Slug: ${createdWs.slug}`);
      console.log(` • Radar de oportunidades: ${createdWs.radar_enabled ? "Ativo" : "Inativo"}`);
      if (hasOwner) {
        console.log(` • Proprietário (Owner) vinculado: ${ownerName} <${ownerEmail}>`);
      }
      console.log(`\nPronto para uso operacional.\n`);

      return {
        success: true,
        action: "created",
        details: {
          workspaceId: createdWs.id,
          name: createdWs.name,
          slug: createdWs.slug,
          ownerSubjectId,
        },
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    client.release();
  }
}

// CLI Execution Entry Point
if (process.argv[1] && process.argv[1].endsWith("admin-create-workspace.ts")) {
  const cliArgs = parseCreateWorkspaceArgs(process.argv.slice(2));

  runAdminWorkspaceProvisioning(cliArgs)
    .then(() => {
      process.exit(0);
    })
    .catch((err: Error) => {
      console.error(`\n❌ ERRO NA EXECUÇÃO: ${err.message}\n`);
      process.exit(1);
    });
}
