import { describe, it, expect, vi } from "vitest";
import { runAdminMemberProvisioning } from "../admin-upsert-member";
import type { Pool } from "../../packages/database/src";

function createMockPool(queryHandler: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>) {
  const client = {
    query: vi.fn().mockImplementation(queryHandler),
    release: vi.fn(),
  };

  const pool = {
    connect: vi.fn().mockResolvedValue(client),
    end: vi.fn().mockResolvedValue(undefined),
  } as unknown as Pool;

  return { pool, client };
}

describe("Admin Member Provisioning Script (admin-upsert-member)", () => {
  const validWorkspaceId = "11111111-1111-4111-8111-111111111111";
  const validSubjectId = "22222222-2222-4222-8222-222222222222";

  it("should fail validation if workspace ID is not a valid UUID", async () => {
    const { pool } = createMockPool(async () => ({ rows: [] }));

    await expect(
      runAdminMemberProvisioning(
        {
          subjectId: validSubjectId,
          email: "operator@haven.local",
          name: "Test Operator",
          workspaceId: "invalid-uuid",
          role: "operator",
          apply: false,
          allowRoleChange: false,
          revoke: false,
          list: false,
        },
        pool
      )
    ).rejects.toThrow(/invalid --workspace-id/i);
  });

  it("should fail validation if subject ID is not a valid UUID", async () => {
    const { pool } = createMockPool(async (sql) => {
      if (sql.includes("SELECT id, name FROM workspaces")) {
        return { rows: [{ id: validWorkspaceId, name: "Haven Commercial" }] };
      }
      return { rows: [] };
    });

    await expect(
      runAdminMemberProvisioning(
        {
          subjectId: "not-a-uuid",
          email: "operator@haven.local",
          name: "Test Operator",
          workspaceId: validWorkspaceId,
          role: "operator",
          apply: false,
          allowRoleChange: false,
          revoke: false,
          list: false,
        },
        pool
      )
    ).rejects.toThrow(/invalid --subject-id/i);
  });

  it("should fail validation if role is invalid", async () => {
    const { pool } = createMockPool(async (sql) => {
      if (sql.includes("SELECT id, name FROM workspaces")) {
        return { rows: [{ id: validWorkspaceId, name: "Haven Commercial" }] };
      }
      return { rows: [] };
    });

    await expect(
      runAdminMemberProvisioning(
        {
          subjectId: validSubjectId,
          email: "operator@haven.local",
          name: "Test Operator",
          workspaceId: validWorkspaceId,
          role: "super_admin_fake" as any,
          apply: false,
          allowRoleChange: false,
          revoke: false,
          list: false,
        },
        pool
      )
    ).rejects.toThrow(/invalid --role/i);
  });

  it("should detect email identity collision with existing user ID", async () => {
    const { pool } = createMockPool(async (sql, params) => {
      if (sql.includes("SELECT id, name FROM workspaces")) {
        return { rows: [{ id: validWorkspaceId, name: "Haven Commercial" }] };
      }
      if (sql.includes("SELECT id, email, name FROM users WHERE LOWER(email)")) {
        return { rows: [{ id: "33333333-3333-4333-8333-333333333333", email: "operator@haven.local", name: "Existing" }] };
      }
      return { rows: [] };
    });

    await expect(
      runAdminMemberProvisioning(
        {
          subjectId: validSubjectId,
          email: "operator@haven.local",
          name: "Test Operator",
          workspaceId: validWorkspaceId,
          role: "operator",
          apply: false,
          allowRoleChange: false,
          revoke: false,
          list: false,
        },
        pool
      )
    ).rejects.toThrow(/Identity Collision/i);
  });

  it("should perform dry-run by default without committing any changes", async () => {
    const { pool, client } = createMockPool(async (sql) => {
      if (sql.includes("SELECT id, name FROM workspaces")) {
        return { rows: [{ id: validWorkspaceId, name: "Haven Commercial" }] };
      }
      if (sql.includes("SELECT id, email, name FROM users")) {
        return { rows: [] }; // New user
      }
      if (sql.includes("SELECT id, role FROM workspace_memberships")) {
        return { rows: [] }; // New membership
      }
      return { rows: [] };
    });

    const res = await runAdminMemberProvisioning(
      {
        subjectId: validSubjectId,
        email: "new.operator@haven.local",
        name: "New Operator",
        workspaceId: validWorkspaceId,
        role: "operator",
        apply: false,
        allowRoleChange: false,
        revoke: false,
        list: false,
      },
      pool
    );

    expect(res.action).toBe("dry-run-upsert");
    // Verify BEGIN and COMMIT were NEVER executed in dry-run mode
    expect(client.query).not.toHaveBeenCalledWith("BEGIN");
    expect(client.query).not.toHaveBeenCalledWith("COMMIT");
  });

  it("should refuse silent role changes unless --allow-role-change is provided", async () => {
    const { pool } = createMockPool(async (sql) => {
      if (sql.includes("SELECT id, name FROM workspaces")) {
        return { rows: [{ id: validWorkspaceId, name: "Haven Commercial" }] };
      }
      if (sql.includes("SELECT id, email, name FROM users")) {
        return { rows: [{ id: validSubjectId, email: "op@haven.local", name: "Op" }] };
      }
      if (sql.includes("SELECT id, role FROM workspace_memberships")) {
        return { rows: [{ id: "mem-1", role: "operator" }] };
      }
      return { rows: [] };
    });

    // Request role change to 'admin' without allowRoleChange
    await expect(
      runAdminMemberProvisioning(
        {
          subjectId: validSubjectId,
          email: "op@haven.local",
          name: "Op",
          workspaceId: validWorkspaceId,
          role: "admin",
          apply: false,
          allowRoleChange: false,
          revoke: false,
          list: false,
        },
        pool
      )
    ).rejects.toThrow(/Unauthorized Role Change/i);
  });

  it("should permit role changes when --allow-role-change is explicitly passed", async () => {
    const { pool } = createMockPool(async (sql) => {
      if (sql.includes("SELECT id, name FROM workspaces")) {
        return { rows: [{ id: validWorkspaceId, name: "Haven Commercial" }] };
      }
      if (sql.includes("SELECT id, email, name FROM users")) {
        return { rows: [{ id: validSubjectId, email: "op@haven.local", name: "Op" }] };
      }
      if (sql.includes("SELECT id, role FROM workspace_memberships")) {
        return { rows: [{ id: "mem-1", role: "operator" }] };
      }
      return { rows: [] };
    });

    const res = await runAdminMemberProvisioning(
      {
        subjectId: validSubjectId,
        email: "op@haven.local",
        name: "Op",
        workspaceId: validWorkspaceId,
        role: "admin",
        apply: false,
        allowRoleChange: true,
        revoke: false,
        list: false,
      },
      pool
    );

    expect(res.action).toBe("dry-run-upsert");
    expect(res.details.isRoleChange).toBe(true);
  });

  it("should execute transaction and commit changes when --apply is true", async () => {
    const { pool, client } = createMockPool(async (sql) => {
      if (sql.includes("SELECT id, name FROM workspaces")) {
        return { rows: [{ id: validWorkspaceId, name: "Haven Commercial" }] };
      }
      return { rows: [] };
    });

    const res = await runAdminMemberProvisioning(
      {
        subjectId: validSubjectId,
        email: "op@haven.local",
        name: "Op",
        workspaceId: validWorkspaceId,
        role: "operator",
        apply: true,
        allowRoleChange: false,
        revoke: false,
        list: false,
      },
      pool
    );

    expect(res.action).toBe("applied");
    expect(client.query).toHaveBeenCalledWith("BEGIN");
    expect(client.query).toHaveBeenCalledWith("COMMIT");
  });
});
