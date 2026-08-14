import { LidIdentityResolver } from '../../../application/ports/lid-identity-resolver.js';

export interface WahaLidIdentityResolverOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

/** Calls WAHA's documented LID lookup endpoint; it never infers a phone from LID digits. */
export class WahaLidIdentityResolver implements LidIdentityResolver {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: WahaLidIdentityResolverOptions) {
    if (!options.baseUrl || !options.apiKey) throw new Error('WahaLidIdentityResolver requires baseUrl and apiKey');
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async resolvePhone(params: { session: string; lid: string }): Promise<string | null> {
    const session = params.session.trim();
    const lid = params.lid.trim();
    if (!session || !lid.endsWith('@lid')) return null;
    const id = lid.slice(0, -'@lid'.length);
    const response = await this.fetchImpl(`${this.baseUrl}/api/${encodeURIComponent(session)}/lids/${encodeURIComponent(id)}`, {
      headers: { 'X-Api-Key': this.apiKey },
    });
    if (!response.ok) throw new Error(`WAHA LID lookup failed with HTTP ${response.status}`);
    const payload = await response.json() as { pn?: unknown };
    const phoneJid = typeof payload.pn === 'string' ? payload.pn.trim() : '';
    return /^[1-9][0-9]{7,14}@c\.us$/.test(phoneJid) ? phoneJid : null;
  }
}
