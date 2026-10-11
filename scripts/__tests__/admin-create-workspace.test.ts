import { describe, it, expect, vi } from "vitest";
import { runAdminWorkspaceProvisioning, slugify } from "../admin-create-workspace";
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

describe("Admin Workspace Provisioning Script (admin-create-workspace)", () => {
  it("slugifies names correctly", () => {
    expect(slugify("Clínica Dra. Camila & Cia")).toBe("clinica-dra-camila-cia");
    expect(slugify(" SOS  Sales V3 ")).toBe("sos-sales-v3");
  });

  it("lists existing workspaces", async () => {
    const { pool } = createMockPool(async (sql) => {
      if (sql.includes("SELECT w.id, w.name")) {
        return {
          rows: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              name: "Empresa Alpha",
              slug: "empresa-alpha",
              is_active: true,
              org_name: "Org Alpha",
              created_at: new Date(),
              member_count: 2,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await runAdminWorkspaceProvisioning({ create: false, list: true, apply: false }, pool);
    expect(res.success).toBe(true);
    expect(res.action).toBe("list");
    expect(res.details.count).toBe(1);
  });

  it("executes dry-run creation without modifying database", async () => {
    const { pool, client } = createMockPool(async (sql) => {
      if (sql.includes("SELECT id, name FROM workspaces WHERE slug")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const res = await runAdminWorkspaceProvisioning(
      {
        create: true,
        list: false,
        name: "Clínica Dra. Camila",
        slug: "clinica-dra-camila",
        apply: false,
      },
      pool
    );

    expect(res.success).toBe(true);
    expect(res.action).toBe("dry-run-create");
    // Verify BEGIN was never called in dry run
    expect(client.query).not.toHaveBeenCalledWith("BEGIN");
  });

  it("fails if slug collides with existing workspace", async () => {
    const { pool } = createMockPool(async (sql) => {
      if (sql.includes("SELECT id, name FROM workspaces WHERE slug")) {
        return { rows: [{ id: "existing-uuid", name: "Existing WS" }] };
      }
      return { rows: [] };
    });

    await expect(
      runAdminWorkspaceProvisioning(
        {
          create: true,
          list: false,
          name: "Existing WS",
          slug: "existing-ws",
          apply: false,
        },
        pool
      )
    ).rejects.toThrow(/Conflito de Slug/i);
  });

  it("creates workspace and owner transactionally when apply=true", async () => {
    const createdOrgId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const createdWsId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const ownerSubId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

    const executedSqls: string[] = [];

    const { pool } = createMockPool(async (sql, params) => {
      executedSqls.push(sql);
      if (sql.includes("SELECT id, name FROM workspaces WHERE slug")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO organizations")) {
        return { rows: [{ id: createdOrgId, name: "Clínica Camila" }] };
      }
      if (sql.includes("INSERT INTO workspaces")) {
        return { rows: [{ id: createdWsId, name: "Clínica Camila", slug: "clinica-camila" }] };
      }
      return { rows: [] };
    });

    const res = await runAdminWorkspaceProvisioning(
      {
        create: true,
        list: false,
        name: "Clínica Camila",
        ownerSubjectId: ownerSubId,
        ownerEmail: "camila@clinica.com",
        ownerName: "Dra. Camila",
        apply: true,
      },
      pool
    );

    expect(res.success).toBe(true);
    expect(res.action).toBe("created");
    expect(res.details.workspaceId).toBe(createdWsId);
    expect(executedSqls).toContain("BEGIN");
    expect(executedSqls).toContain("COMMIT");
  });
});
