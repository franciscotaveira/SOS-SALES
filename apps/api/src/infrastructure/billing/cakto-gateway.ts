export interface CaktoGatewayOptions {
  clientId?: string;
  clientSecret?: string;
  baseUrl?: string;
}

export class CaktoGateway {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;
  private token?: { value: string; expiresAt: number };

  constructor(options: CaktoGatewayOptions = {}) {
    this.clientId = options.clientId?.trim() || process.env.CAKTO_CLIENT_ID?.trim() || '';
    this.clientSecret = options.clientSecret?.trim() || process.env.CAKTO_CLIENT_SECRET?.trim() || '';
    this.baseUrl = (options.baseUrl || 'https://api.cakto.com.br').replace(/\/$/, '');
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    if (!this.isConfigured()) throw new Error('Cakto API is not configured');

    const response = await fetch(`${this.baseUrl}/public_api/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });
    if (!response.ok) throw new Error(`Cakto token error (${response.status})`);
    const body = await response.json() as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error('Cakto token response is invalid');
    this.token = {
      value: body.access_token,
      expiresAt: Date.now() + Math.max(60, body.expires_in || 300) * 1000,
    };
    return this.token.value;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.accessToken();
    const response = await fetch(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) throw new Error(`Cakto API error (${response.status})`);
    return response.json() as Promise<T>;
  }

  getSubscription<T = Record<string, unknown>>(subscriptionId: string): Promise<T> {
    return this.request<T>(`/public_api/subscriptions/${encodeURIComponent(subscriptionId)}/`);
  }

  listSubscriptions<T = Record<string, unknown>>(query = ''): Promise<T> {
    return this.request<T>(`/public_api/subscriptions/${query ? `?${query}` : ''}`);
  }

  listOrders<T = Record<string, unknown>>(query = ''): Promise<T> {
    return this.request<T>(`/public_api/orders/${query ? `?${query}` : ''}`);
  }
}
