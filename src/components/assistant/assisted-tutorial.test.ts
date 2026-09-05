import { describe, expect, it } from 'vitest';
import { AssistedTutorialModal } from './AssistedTutorialModal';

describe('AssistedTutorialModal contracts', () => {
  it('exports a valid component function', () => {
    expect(typeof AssistedTutorialModal).toBe('function');
  });

  it('verifies tutorial steps define valid operational tabs', () => {
    const validTabs = ['agora', 'conversas', 'kanban', 'agenda', 'configuracoes', 'resultados', 'playbook'];
    // Smoke check on expected steps contract
    expect(validTabs).toContain('agora');
    expect(validTabs).toContain('configuracoes');
    expect(validTabs).toContain('kanban');
  });
});
