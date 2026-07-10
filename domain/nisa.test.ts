import { describe, it, expect } from 'vitest';
import { checkNisaFrame } from '@/domain/nisa';
import type { NisaUsage } from '@/domain/types';

function makeUsage(overrides: Partial<NisaUsage> & Pick<NisaUsage, 'year' | 'frameType'>): NisaUsage {
  return {
    id: 'usage-1',
    usedAmount: 0,
    annualLimit: 0,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('checkNisaFrame', () => {
  it('残枠内であればfitsWithinFrame=trueを返す', () => {
    const usages: NisaUsage[] = [
      makeUsage({ year: 2026, frameType: 'growth', usedAmount: 1000000, annualLimit: 2400000 }),
    ];
    const result = checkNisaFrame(500000, 2026, 'growth', usages);
    expect(result).toEqual({ remainingAmount: 1400000, fitsWithinFrame: true });
  });

  it('残枠を超える場合はfitsWithinFrame=falseを返す', () => {
    const usages: NisaUsage[] = [
      makeUsage({ year: 2026, frameType: 'growth', usedAmount: 2000000, annualLimit: 2400000 }),
    ];
    const result = checkNisaFrame(500000, 2026, 'growth', usages);
    expect(result).toEqual({ remainingAmount: 400000, fitsWithinFrame: false });
  });

  it('該当年・枠種別のNisaUsageが未登録ならnullを返す', () => {
    expect(checkNisaFrame(100, 2026, 'tsumitate', [])).toBeNull();
  });
});
