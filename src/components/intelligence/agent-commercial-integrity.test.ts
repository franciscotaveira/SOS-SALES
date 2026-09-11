import {describe,it,expect} from 'vitest';
import {moneyMinor} from '../../../apps/api/src/domain/sales-money';

describe('commercial editor integrity',()=>{
  it('uses exact Brazilian amounts across browser and runtime',()=>{
    expect(moneyMinor('R$ 1.234,56')).toBe(123456);
    expect(moneyMinor('12x 49,90')).toBeUndefined();
  });
});
