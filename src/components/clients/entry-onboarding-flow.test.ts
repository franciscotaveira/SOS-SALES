import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('entry-plan workspace onboarding', () => {
  it('defaults new client accounts to the official Meta connection path', () => {
    const source = read('./AgencyClientsManager.tsx');

    expect(source).toContain("provider: 'waba'");
    expect(source).toContain('WAHA só aparece se for necessário como alternativa técnica.');
    expect(source).not.toContain("setNewProvider");
  });

  it('takes the user to channel configuration after creating a workspace', () => {
    const source = read('../../App.tsx');

    expect(source).toContain("await handleSelectWorkspace(createdWs);");
    expect(source).toContain("setActiveTab('configuracoes');");
  });
});
