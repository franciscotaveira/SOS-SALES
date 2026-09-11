import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {moneyMinor} from '../../../apps/api/src/domain/sales-money';

describe('commercial editor integrity',()=>{
  it('uses exact Brazilian amounts across browser and runtime',()=>{
    expect(moneyMinor('R$ 1.234,56')).toBe(123456);
    expect(moneyMinor('12x 49,90')).toBeUndefined();
  });
});


describe('simulator failure integrity',()=>{
  it('never substitutes fabricated offers or latency for a failed API request',()=>{
    const source=readFileSync(new URL('./QaSimulatorView.tsx',import.meta.url),'utf8');
    const handler=source.split('const handleSendCustomMessage =')[1].split('const handleAddDirective =')[0];
    const failure=handler.split('} catch (err) {')[1].split('} finally {')[0];
    expect(failure).not.toContain('analyzeConversationDossier');
    expect(failure).not.toContain('setCustomChatHistory');
    expect(failure).not.toContain('latencyMs');
    expect(failure).toContain('setError');

    expect(source).not.toContain('handleSaveAllConfig');
    expect(source).not.toContain('defaultReply');
    expect(source).not.toContain('handleLoadEkoPreset');
    expect(source).toContain('key={props.currentWorkspace?.id');
  });
});
