/**
 * TX COMMERCIAL CORE — ABACATEPAY BILLING GATEWAY
 * Integração oficial com a API v1 do AbacatePay
 * https://docs.abacatepay.com/
 */

export interface CreateAbacateChargeInput {
  externalId: string;
  customer: {
    name: string;
    cellphone: string;
    email: string;
    taxId?: string; // CPF ou CNPJ
  };
  product: {
    externalId: string;
    name: string;
    priceInCents: number; // Ex: 116400 para R$ 1.164,00
    quantity?: number;
    description?: string;
  };
  metadata?: Record<string, unknown>;
  returnUrl?: string;
  completionUrl?: string;
}

export interface AbacateChargeOutput {
  billingId: string;
  url: string;
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED';
  amount: number;
  pixQrCode?: string;
  pixCopiaECola?: string;
}

export class AbacatePayGateway {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey?: string, baseUrl = 'https://api.abacatepay.com/v1') {
    this.apiKey = apiKey || process.env.ABACATEPAY_API_KEY || '';
    this.baseUrl = baseUrl;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Cria uma cobrança PIX única ou link de pagamento no AbacatePay
   */
  public async createBilling(input: CreateAbacateChargeInput): Promise<AbacateChargeOutput> {
    if (!this.isConfigured()) {
      throw new Error('AbacatePay is not configured');
    }

    const payload = {
      frequency: 'ONE_TIME',
      methods: ['PIX'],
      products: [
        {
          externalId: input.product.externalId,
          name: input.product.name,
          quantity: input.product.quantity ?? 1,
          price: input.product.priceInCents,
          description: input.product.description ?? input.product.name,
        }
      ],
      returnUrl: input.returnUrl || 'https://iaparavendas.tech',
      completionUrl: input.completionUrl || 'https://crm.iaparavendas.tech',
      customerId: undefined,
      customer: {
        name: input.customer.name,
        cellphone: input.customer.cellphone.replace(/\D/g, ''),
        email: input.customer.email,
        taxId: input.customer.taxId ? input.customer.taxId.replace(/\D/g, '') : undefined,
      },
      metadata: input.metadata,
    };

    const response = await fetch(`${this.baseUrl}/billing/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`AbacatePay API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json() as {
      data: {
        id: string;
        url: string;
        status: string;
        amount: number;
        pix?: {
          code?: string;
          qrCode?: string;
        };
      };
    };

    return {
      billingId: data.data.id,
      url: data.data.url,
      status: (data.data.status as AbacateChargeOutput['status']) || 'PENDING',
      amount: data.data.amount,
      pixCopiaECola: data.data.pix?.code,
      pixQrCode: data.data.pix?.qrCode,
    };
  }
}
