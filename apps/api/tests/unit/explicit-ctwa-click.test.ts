import {expect,it} from 'vitest';
import {explicitCtwaClick} from '../../src/infrastructure/channels/meta/explicit-ctwa-click.js';
it('preserves an explicit click from the provider envelope',()=>{
  expect(explicitCtwaClick({payload:{referral:{ctwa_clid:'original-click'}}})).toBe('original-click');
  expect(explicitCtwaClick({payload:{_data:{ctwaContext:{ctwa_clid:'original-click'}}}})).toBe('original-click');
});
it('does not infer click IDs from signals or user supplied text',()=>{
  expect(explicitCtwaClick({payload:{body:'ctwa_clid=fake',_data:{ctwaContext:{ctwaSignals:'encoded',conversionData:'encoded'}}}})).toBeNull();
  expect(explicitCtwaClick({referral:{ctwa_clid:{value:'fake'}}})).toBeNull();
});
