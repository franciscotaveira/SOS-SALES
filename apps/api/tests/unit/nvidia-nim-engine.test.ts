import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NVIDIA_MODEL_TIERS,
  NvidiaNimEngine,
} from '../../src/infrastructure/ai/nvidia-nim-engine.js';

describe('NVIDIA NIM commercial model contract', () => {
  beforeEach(() => {
    vi.stubEnv('NVIDIA_API_KEY', 'nvapi-test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Resposta final' } }],
      model: NVIDIA_MODEL_TIERS.FAST,
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
  });

  it('uses a currently available Nemotron endpoint for the fast tier', async () => {
    expect(NVIDIA_MODEL_TIERS.FAST).toBe('nvidia/nemotron-3.5-lightning-30b-a3b');
    expect(NVIDIA_MODEL_TIERS.NEMOTRON).toBe('nvidia/nemotron-3.5-lightning-30b-a3b');
  });

  it('disables reasoning traces for customer-facing Nemotron responses', async () => {
    const engine = new NvidiaNimEngine(undefined, 'https://nvidia.test/v1', undefined, 1000);
    const result = await engine.generateChatCompletion([
      { role: 'system', content: 'Responda somente com a resposta final.' },
      { role: 'user', content: 'Quanto custa?' },
    ], { tier: 'fast', maxTokens: 40 });

    expect(result.content).toBe('Resposta final');
    const [, init] = vi.mocked(fetch).mock.calls[0] || [];
    const payload = JSON.parse(String(init?.body));
    expect(payload.model).toBe('nvidia/nemotron-3.5-lightning-30b-a3b');
    expect(payload.chat_template_kwargs).toEqual({ enable_thinking: false });
  });
});

