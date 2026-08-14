/** Resolves a WhatsApp Linked ID (@lid) to a verified phone JID (@c.us). */
export interface LidIdentityResolver {
  resolvePhone(params: { session: string; lid: string }): Promise<string | null>;
}
