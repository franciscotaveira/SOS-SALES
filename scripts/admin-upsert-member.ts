import { Pool, getDatabasePool } from "../packages/database/src";
import { z, RoleEnum, type Role } from "../packages/contracts/src";

const uuidSchema = z.string().uuid();
const emailSchema = z.string().email();

interface CliArgs {
  subjectId?: string;
  email?: string;
  name?: string;
  workspaceId?: string;
  role?: Role;
  apply: boolean;
  allowRoleChange: boolean;
  revoke: boolean;
  list: boolean;
}

function parseCommandLineArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    apply: false,
    allowRoleChange: false,
    revoke: false,
    list: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--allow-role-change") {
      args.allowRoleChange = true;
    } else if (arg === "--revoke") {
      args.revoke = true;
    } else if (arg === "--list") {
      args.list = true;
    } else if (arg === "--subject-id" || arg === "--user-id") {
      args.subjectId = argv[++i];
    } else if (arg === "--email") {
      args.email = argv[++i];
    } else if (arg === "--name") {
      args.name = argv[++i];
    } else if (arg === "--workspace-id") {
      args.workspaceId = argv[++i];
    } else if (arg === "--role") {
      args.role = argv[++i] as Role;
    }
  }

  return args;
}

export async function runAdminMemberProvisioning(
  cliArgs: CliArgs,
  customPool?: Pool
): Promise<{ success: boolean; action: string; details: Record<string, unknown> }> {
  const pool = customPool || getDatabasePool();
  const client = await pool.connect();

  try {
    // 1. List Mode
    if (cliArgs.list) {
      if (!cliArgs.workspaceId || !uuidSchema.safeParse(cliArgs.workspaceId).success) {
        throw new Error("Missing or invalid --workspace-id UUID for --list");
      }

      const wsRes = await client.query(
        `SELECT id, name FROM workspaces WHERE id = $1`,
        [cliArgs.workspaceId]
      );
      if (wsRes.rows.length === 0) {
        throw new Error(`Workspace not found: ${cliArgs.workspaceId}`);
      }

      const membersRes = await client.query(
        `SELECT u.id, u.email, u.name, m.role, m.created_at
         FROM workspace_memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.workspace_id = $1
         ORDER BY m.created_at ASC`,
        [cliArgs.workspaceId]
      );

      console.log(`\n📋 Membros do Workspace "${wsRes.rows[0].name}" (${cliArgs.workspaceId}):`);
      console.log(`Total: ${membersRes.rows.length} membros\n`);
      for (const m of membersRes.rows) {
        console.log(` - [${m.role.toUpperCase()}] ${m.name} <${m.email}> (User ID: ${m.id})`);
      }
      console.log("");

      return {
        success: true,
        action: "list",
        details: { workspaceId: cliArgs.workspaceId, count: membersRes.rows.length },
      };
    }

    // 2. Validate Target Workspace
    if (!cliArgs.workspaceId || !uuidSchema.safeParse(cliArgs.workspaceId).success) {
      throw new Error("Missing or invalid --workspace-id (must be a valid UUID)");
    }
    const wsRes = await client.query(
      `SELECT id, name FROM workspaces WHERE id = $1`,
      [cliArgs.workspaceId]
    );
    if (wsRes.rows.length === 0) {
      throw new Error(`Target workspace does not exist: ${cliArgs.workspaceId}`);
    }
    const targetWorkspace = wsRes.rows[0];

    // 3. Revoke Mode
    if (cliArgs.revoke) {
      if (!cliArgs.subjectId || !uuidSchema.safeParse(cliArgs.subjectId).success) {
        throw new Error("Missing or invalid --subject-id (must be a valid UUID for revocation)");
      }

      const existingMemRes = await client.query(
        `SELECT id, role FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2`,
        [cliArgs.workspaceId, cliArgs.subjectId]
      );

      if (existingMemRes.rows.length === 0) {
        console.log(`ℹ️  Nenhuma associação encontrada para o usuário ${cliArgs.subjectId} no workspace ${cliArgs.workspaceId}. Nada a revogar.`);
        return {
          success: true,
          action: "noop",
          details: { subjectId: cliArgs.subjectId, workspaceId: cliArgs.workspaceId },
        };
      }

      if (!cliArgs.apply) {
        console.log(`\n🔍 [DRY-RUN] Plano de Revogação:`);
        console.log(` - Workspace: ${targetWorkspace.name} (${targetWorkspace.id})`);
        console.log(` - Subject ID: ${cliArgs.subjectId}`);
        console.log(` - Papel atual: ${existingMemRes.rows[0].role}`);
        console.log(`\nNenhuma alteração gravada no banco. Execute com --apply para confirmar a revogação.\n`);
        return {
          success: true,
          action: "dry-run-revoke",
          details: { subjectId: cliArgs.subjectId, workspaceId: cliArgs.workspaceId },
        };
      }

      await client.query("BEGIN");
      await client.query(
        `DELETE FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2`,
        [cliArgs.workspaceId, cliArgs.subjectId]
      );
      await client.query("COMMIT");

      console.log(`\n✅ Acesso revogado com sucesso: Usuário ${cliArgs.subjectId} removido do workspace ${targetWorkspace.name}.\n`);
      return {
        success: true,
        action: "revoked",
        details: { subjectId: cliArgs.subjectId, workspaceId: cliArgs.workspaceId },
      };
    }

    // 4. Provision / Upsert Mode Validation
    if (!cliArgs.subjectId || !uuidSchema.safeParse(cliArgs.subjectId).success) {
      throw new Error("Missing or invalid --subject-id (must be a valid UUID from Supabase Auth)");
    }
    if (!cliArgs.email || !emailSchema.safeParse(cliArgs.email.trim()).success) {
      throw new Error("Missing or invalid --email");
    }
    if (!cliArgs.name || cliArgs.name.trim().length < 2) {
      throw new Error("Missing or invalid --name (minimum 2 characters)");
    }
    if (!cliArgs.role || !RoleEnum.safeParse(cliArgs.role).success) {
      throw new Error(
        `Missing or invalid --role. Allowed roles: ${RoleEnum.options.join(", ")}`
      );
    }

    const normalizedEmail = cliArgs.email.trim().toLowerCase();
    const cleanName = cliArgs.name.trim();

    // 5. Collision Checks for User Identity
    const userByIdRes = await client.query(
      `SELECT id, email, name FROM users WHERE id = $1`,
      [cliArgs.subjectId]
    );
    const userByEmailRes = await client.query(
      `SELECT id, email, name FROM users WHERE LOWER(email) = $1`,
      [normalizedEmail]
    );

    if (userByEmailRes.rows.length > 0 && userByEmailRes.rows[0].id !== cliArgs.subjectId) {
      throw new Error(
        `Identity Collision: Email '${normalizedEmail}' is already assigned to a different user ID (${userByEmailRes.rows[0].id})`
      );
    }

    if (userByIdRes.rows.length > 0 && userByIdRes.rows[0].email.toLowerCase() !== normalizedEmail) {
      throw new Error(
        `Identity Collision: Subject ID '${cliArgs.subjectId}' is already registered with email '${userByIdRes.rows[0].email}'`
      );
    }

    // 6. Check Existing Workspace Membership
    const existingMembershipRes = await client.query(
      `SELECT id, role FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2`,
      [cliArgs.workspaceId, cliArgs.subjectId]
    );

    let isNewUser = userByIdRes.rows.length === 0;
    let isNewMembership = existingMembershipRes.rows.length === 0;
    let isRoleChange = false;

    if (!isNewMembership) {
      const currentRole = existingMembershipRes.rows[0].role;
      if (currentRole !== cliArgs.role) {
        if (!cliArgs.allowRoleChange) {
          throw new Error(
            `Unauthorized Role Change: Member already exists in workspace with role '${currentRole}'. ` +
            `Changing role to '${cliArgs.role}' requires explicit flag '--allow-role-change'.`
          );
        }
        isRoleChange = true;
      }
    }

    // 7. Dry-Run Execution
    if (!cliArgs.apply) {
      console.log(`\n🔍 [DRY-RUN] Plano de Provisionamento Administrativo:`);
      console.log(` - Workspace:         ${targetWorkspace.name} (${targetWorkspace.id})`);
      console.log(` - Subject UUID (Auth):${cliArgs.subjectId}`);
      console.log(` - Nome:              ${cleanName}`);
      console.log(` - E-mail:            ${normalizedEmail}`);
      console.log(` - Papel Solicitado:  ${cliArgs.role}`);
      console.log(` - Ação Usuário:      ${isNewUser ? "CRIAR NOVO USUÁRIO" : "ATUALIZAR DADOS CADASTRAIS"}`);
      console.log(
        ` - Ação Membership:   ${
          isNewMembership
            ? "VINCULAR NOVO MEMBRO AO WORKSPACE"
            : isRoleChange
            ? `ALTERAR PAPEL: ${existingMembershipRes.rows[0].role} -> ${cliArgs.role}`
            : "MEMBRO JÁ EXISTE COM ESTE PAPEL (IDEMPOTENTE - NENHUMA ALTERAÇÃO NECESSÁRIA)"
        }`
      );
      console.log(`\nNenhuma alteração gravada. Para aplicar em definitivo, execute com a flag '--apply'.\n`);
      return {
        success: true,
        action: "dry-run-upsert",
        details: {
          isNewUser,
          isNewMembership,
          isRoleChange,
          subjectId: cliArgs.subjectId,
          workspaceId: cliArgs.workspaceId,
        },
      };
    }

    // 8. Apply Mode: Execute strictly within database transaction
    await client.query("BEGIN");

    // Upsert User
    await client.query(
      `INSERT INTO users (id, email, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name, email = EXCLUDED.email`,
      [cliArgs.subjectId, normalizedEmail, cleanName]
    );

    // Upsert Workspace Membership
    await client.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, user_id) DO UPDATE
       SET role = EXCLUDED.role`,
      [cliArgs.workspaceId, cliArgs.subjectId, cliArgs.role]
    );

    await client.query("COMMIT");

    console.log(`\n✅ [APPLY] Provisionamento concluído com sucesso:`);
    console.log(` - Usuário:   ${cleanName} <${normalizedEmail}>`);
    console.log(` - Subject:   ${cliArgs.subjectId}`);
    console.log(` - Workspace: ${targetWorkspace.name} (${cliArgs.workspaceId})`);
    console.log(` - Papel:     ${cliArgs.role}\n`);

    return {
      success: true,
      action: "applied",
      details: {
        subjectId: cliArgs.subjectId,
        workspaceId: cliArgs.workspaceId,
        role: cliArgs.role,
      },
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback failure if transaction was not active
    }
    throw err;
  } finally {
    client.release();
    if (!customPool) {
      await pool.end();
    }
  }
}

// Direct CLI Execution Check
if (process.argv[1]?.endsWith("admin-upsert-member.ts")) {
  const cliArgs = parseCommandLineArgs(process.argv.slice(2));
  runAdminMemberProvisioning(cliArgs).catch((err) => {
    console.error(`\n❌ ERRO NO PROVISIONAMENTO ADMINISTRATIVO:`, err.message || err);
    process.exit(1);
  });
}
