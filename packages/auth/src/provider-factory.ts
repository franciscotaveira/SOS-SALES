import type { IIdentityProvider, IdentityProviderConfig } from "./types";
import { JwtIdentityProvider } from "./jwt-provider";
import { SupabaseJwksIdentityProvider } from "./supabase-jwks-provider";

export function createIdentityProvider(config: IdentityProviderConfig): IIdentityProvider {
  switch (config.type) {
    case "jwt":
      return new JwtIdentityProvider(config);
    case "supabase_jwks":
      return new SupabaseJwksIdentityProvider(config);
    default:
      throw new Error(
        `Unsupported identity provider type: ${(config as { type: string }).type}`
      );
  }
}
