import type { Workspace, WorkspaceMembership } from "@sos-sales/contracts";

export interface IWorkspaceRepository {
  findById(id: string): Promise<Workspace | null>;
  findBySlug(slug: string): Promise<Workspace | null>;
  create(data: Omit<Workspace, "createdAt" | "updatedAt">): Promise<Workspace>;
  getMembership(workspaceId: string, userId: string): Promise<WorkspaceMembership | null>;
  listUserWorkspaces(userId: string): Promise<Workspace[]>;
}
