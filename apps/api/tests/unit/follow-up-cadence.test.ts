import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FOLLOW_UP_CADENCE,
  FollowUpCadenceConfig,
} from '../../src/infrastructure/ai/receptionist-system-prompt.js';
import { GhostingResurrectionEngine } from '../../src/application/services/ghosting-resurrection-engine.js';

describe('FollowUpCadence & GhostingResurrectionEngine', () => {
  const engine = new GhostingResurrectionEngine();

  it('provides the official 3-step cadence as system default', () => {
    expect(DEFAULT_FOLLOW_UP_CADENCE.enabled).toBe(true);
    expect(DEFAULT_FOLLOW_UP_CADENCE.steps).toHaveLength(3);

    const [step1, step2, step3] = DEFAULT_FOLLOW_UP_CADENCE.steps;
    expect(step1.delayHours).toBe(2);
    expect(step1.stepNumber).toBe(1);
    expect(step1.label).toContain('+2h');

    expect(step2.delayHours).toBe(24);
    expect(step2.stepNumber).toBe(2);
    expect(step2.label).toContain('+24h');

    expect(step3.delayHours).toBe(48);
    expect(step3.stepNumber).toBe(3);
    expect(step3.label).toContain('+48h');
  });

  it('maps active cadence step accurately by hours of silence', () => {
    // Menos de 1.6h (abaixo do limiar de 2h * 0.8) -> nenhum passo ativado ainda
    expect(engine.resolveActiveCadenceStep(DEFAULT_FOLLOW_UP_CADENCE, 1.2)).toBeNull();

    // 2.5h em silêncio -> Passo 1 (+2h: Prova visual)
    const stepAt2h = engine.resolveActiveCadenceStep(DEFAULT_FOLLOW_UP_CADENCE, 2.5);
    expect(stepAt2h).not.toBeNull();
    expect(stepAt2h?.stepNumber).toBe(1);
    expect(stepAt2h?.delayHours).toBe(2);

    // 25h em silêncio -> Passo 2 (+24h: Dúvidas / Checkout)
    const stepAt25h = engine.resolveActiveCadenceStep(DEFAULT_FOLLOW_UP_CADENCE, 25);
    expect(stepAt25h).not.toBeNull();
    expect(stepAt25h?.stepNumber).toBe(2);
    expect(stepAt25h?.delayHours).toBe(24);

    // 50h em silêncio -> Passo 3 (+48h: Break-up / Desapego)
    const stepAt50h = engine.resolveActiveCadenceStep(DEFAULT_FOLLOW_UP_CADENCE, 50);
    expect(stepAt50h).not.toBeNull();
    expect(stepAt50h?.stepNumber).toBe(3);
    expect(stepAt50h?.delayHours).toBe(48);
  });

  it('respects disabled cadence or disabled individual steps', () => {
    const disabledCadence: FollowUpCadenceConfig = {
      enabled: false,
      steps: DEFAULT_FOLLOW_UP_CADENCE.steps,
    };
    expect(engine.resolveActiveCadenceStep(disabledCadence, 25)).toBeNull();

    const partialCadence: FollowUpCadenceConfig = {
      enabled: true,
      steps: [
        { ...DEFAULT_FOLLOW_UP_CADENCE.steps[0], enabled: false }, // Passo 1 desligado
        DEFAULT_FOLLOW_UP_CADENCE.steps[1],                        // Passo 2 (24h) ativo
        DEFAULT_FOLLOW_UP_CADENCE.steps[2],                        // Passo 3 (48h) ativo
      ],
    };
    // Em 5h de silêncio, como o passo 1 (2h) está desativado, o lead não cai em nenhum passo até atingir o passo 2
    expect(engine.resolveActiveCadenceStep(partialCadence, 5)).toBeNull();
    // Em 26h, ativa o passo 2
    expect(engine.resolveActiveCadenceStep(partialCadence, 26)?.stepNumber).toBe(2);
  });

  it('supports custom cadence intervals per workspace (e.g. 1h, 12h, 36h)', () => {
    const customCadence: FollowUpCadenceConfig = {
      enabled: true,
      steps: [
        {
          stepNumber: 1,
          delayHours: 1,
          label: 'Toque Rápido 1h',
          goal: 'Checagem instantânea',
          copyPrompt: 'Checar se está online',
          executionMode: 'autonomous',
          enabled: true,
        },
        {
          stepNumber: 2,
          delayHours: 12,
          label: 'Toque Noturno 12h',
          goal: 'Segunda chamada',
          copyPrompt: 'Relembrar oferta',
          executionMode: 'supervised',
          enabled: true,
        },
      ],
    };

    const step1 = engine.resolveActiveCadenceStep(customCadence, 1.5);
    expect(step1?.stepNumber).toBe(1);
    expect(step1?.executionMode).toBe('autonomous');

    const step2 = engine.resolveActiveCadenceStep(customCadence, 15);
    expect(step2?.stepNumber).toBe(2);
    expect(step2?.executionMode).toBe('supervised');
  });
});
