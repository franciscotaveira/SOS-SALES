import { afterEach, describe, expect, it, vi } from 'vitest';
import { MultimodalVisionAnalyzer } from '../../src/infrastructure/ai/multimodal-vision-analyzer.js';

describe('MultimodalVisionAnalyzer safety normalization', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('never turns an OCR image into proof of PIX settlement', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        category: 'pix_receipt',
        confidence: 1.4,
        extractedData: { amountMinor: 15000, estimatedPriceMinor: 18000, isPaymentValid: true },
        suggestedAction: 'confirm_payment_and_close',
        operatorDraftReply: 'Pagamento confirmado.',
      }) } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    const result = await new MultimodalVisionAnalyzer('sk-or-test').analyzeImage('data:image/jpeg;base64,abc');

    expect(result.category).toBe('pix_receipt');
    expect(result.confidence).toBe(1);
    expect(result.extractedData.amountMinor).toBe(15000);
    expect(result.extractedData.estimatedPriceMinor).toBeUndefined();
    expect(result.extractedData.isPaymentValid).toBeUndefined();
    expect(result.suggestedAction).toBe('verify_payment_manually');
    expect(result.requiresManualVerification).toBe(true);
  });

  it('drops model-estimated prices from visual service suggestions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        category: 'style_reference',
        confidence: 0.8,
        extractedData: { estimatedPriceMinor: 9900, styleType: 'corte' },
        suggestedAction: 'quote_and_schedule_service',
        operatorDraftReply: 'Vou confirmar o serviço no catálogo.',
      }) } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    const result = await new MultimodalVisionAnalyzer('sk-or-test').analyzeImage('https://example.test/image.jpg');

    expect(result.suggestedAction).toBe('quote_and_schedule_service');
    expect(result.extractedData.estimatedPriceMinor).toBeUndefined();
    expect(result.extractedData.styleType).toBe('corte');
  });
});
