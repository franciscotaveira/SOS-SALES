import { describe, it, expect } from "vitest";
import { JwtIdentityProvider } from "../jwt-provider";
import { RbacAuthorizationPolicy } from "../rbac-policy";
import type { AuthUser } from "../types";

describe("JwtIdentityProvider", () => {
  const secret = "test_super_secret_key_32_characters_minimum!";
  const provider = new JwtIdentityProvider(secret);

  const testUser: AuthUser = {
    id: "user-123",
    email: "operator@mct.br",
    role: "operator",
    workspaceId: "workspace-abc",
  };

  it("should generate a valid JWT token and verify it back to the original user", async () => {
    const token = await provider.generateToken(testUser, 3600);
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);

    const verified = await provider.verifyToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.id).toBe(testUser.id);
    expect(verified?.email).toBe(testUser.email);
    expect(verified?.role).toBe(testUser.role);
    expect(verified?.workspaceId).toBe(testUser.workspaceId);
  });

  it("should reject a tampered token", async () => {
    const token = await provider.generateToken(testUser, 3600);
    const parts = token.split(".");
    const header = parts[0]!;
    const payload = parts[1]!;
    const sig = parts[2]!;
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), role: "owner" })
    ).toString("base64url");

    const tamperedToken = `${header}.${tamperedPayload}.${sig}`;
    const verified = await provider.verifyToken(tamperedToken);
    expect(verified).toBeNull();
  });

  it("should reject an expired token", async () => {
    // Generate token with -10 seconds validity
    const token = await provider.generateToken(testUser, -10);
    const verified = await provider.verifyToken(token);
    expect(verified).toBeNull();
  });

  it("should reject malformed token strings", async () => {
    expect(await provider.verifyToken("not-a-token")).toBeNull();
    expect(await provider.verifyToken("")).toBeNull();
  });
});

describe("RbacAuthorizationPolicy", () => {
  const policy = new RbacAuthorizationPolicy();

  const operatorUser: AuthUser = {
    id: "user-op",
    email: "op@mct.br",
    role: "operator",
    workspaceId: "workspace-1",
  };

  const ownerUser: AuthUser = {
    id: "user-owner",
    email: "owner@mct.br",
    role: "owner",
    workspaceId: "workspace-1",
  };

  it("should permit operators to access cockpit and send messages", () => {
    expect(policy.hasPermission(operatorUser, "cockpit:access")).toBe(true);
    expect(policy.hasPermission(operatorUser, "cockpit:send_message")).toBe(true);
  });

  it("should forbid operators from managing integrations or dispatching CAPI directly", () => {
    expect(policy.hasPermission(operatorUser, "integration:manage")).toBe(false);
    expect(policy.hasPermission(operatorUser, "capi:dispatch")).toBe(false);
  });

  it("should permit owner to manage integrations and dispatch CAPI", () => {
    expect(policy.hasPermission(ownerUser, "integration:manage")).toBe(true);
    expect(policy.hasPermission(ownerUser, "capi:dispatch")).toBe(true);
  });

  it("should enforce strict workspace boundary via canAccessWorkspace", () => {
    expect(policy.canAccessWorkspace(operatorUser, "workspace-1")).toBe(true);
    expect(policy.canAccessWorkspace(operatorUser, "workspace-2")).toBe(false);
  });
});
