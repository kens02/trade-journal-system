import { describe, it, expect } from 'vitest';
import { computeHoldingQuantities, holdingKey } from '@/domain/holdings';
import type { Trade } from '@/domain/types';

function makeTrade(overrides: Partial<Trade> & Pick<Trade, 'id'>): Trade {
  return {
    tradeDate: '2026-01-01',
    securityId: 'sec-1',
    side: 'buy',
    accountType: 'specific',
    quantity: 1,
    price: 100,
    amount: 100,
    currency: 'JPY',
    note: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('computeHoldingQuantities', () => {
  it('買付は加算、売却は減算され、銘柄+口座区分単位でネットされる', () => {
    const trades: Trade[] = [
      makeTrade({ id: 't1', securityId: 'sec-1', accountType: 'specific', side: 'buy', quantity: 100 }),
      makeTrade({ id: 't2', securityId: 'sec-1', accountType: 'specific', side: 'sell', quantity: 30 }),
      makeTrade({ id: 't3', securityId: 'sec-1', accountType: 'nisa_growth', side: 'buy', quantity: 10 }),
      makeTrade({ id: 't4', securityId: 'sec-2', accountType: 'specific', side: 'buy', quantity: 5 }),
    ];

    const result = computeHoldingQuantities(trades);

    expect(result.get(holdingKey('sec-1', 'specific'))).toBe(70);
    expect(result.get(holdingKey('sec-1', 'nisa_growth'))).toBe(10);
    expect(result.get(holdingKey('sec-2', 'specific'))).toBe(5);
  });

  it('取引がない場合は空のMapを返す', () => {
    expect(computeHoldingQuantities([]).size).toBe(0);
  });
});
