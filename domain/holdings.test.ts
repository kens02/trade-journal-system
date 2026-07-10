import { describe, it, expect } from 'vitest';
import { computeHoldingQuantities, computeAverageCostPositions, holdingKey } from '@/domain/holdings';
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

describe('computeAverageCostPositions', () => {
  it('複数回買付時は加重平均を算出し、売却では平均単価を変えず数量のみ減らす', () => {
    const trades: Trade[] = [
      // 100株を1,000円で買付(原価100,000円)
      makeTrade({
        id: 't1',
        tradeDate: '2026-01-01',
        side: 'buy',
        quantity: 100,
        price: 1000,
        amount: 100000,
      }),
      // 100株を1,200円で買付(原価120,000円)→ 200株, 平均単価1,100円
      makeTrade({
        id: 't2',
        tradeDate: '2026-01-02',
        side: 'buy',
        quantity: 100,
        price: 1200,
        amount: 120000,
      }),
      // 50株売却。平均単価(1,100円)は変わらず、残数量150株・原価165,000円
      makeTrade({
        id: 't3',
        tradeDate: '2026-01-03',
        side: 'sell',
        quantity: 50,
        price: 1500,
        amount: 75000,
      }),
    ];

    const positions = computeAverageCostPositions(trades);

    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      securityId: 'sec-1',
      accountType: 'specific',
      quantity: 150,
      averageCostAmount: 1100,
      currency: 'JPY',
    });
  });

  it('口座区分ごとに別々の移動平均を算出する', () => {
    const trades: Trade[] = [
      makeTrade({ id: 't1', accountType: 'specific', side: 'buy', quantity: 10, amount: 10000 }),
      makeTrade({ id: 't2', accountType: 'nisa_growth', side: 'buy', quantity: 10, amount: 20000 }),
    ];

    const positions = computeAverageCostPositions(trades);

    const specific = positions.find((p) => p.accountType === 'specific')!;
    const nisa = positions.find((p) => p.accountType === 'nisa_growth')!;
    expect(specific.averageCostAmount).toBe(1000);
    expect(nisa.averageCostAmount).toBe(2000);
  });

  it('全数量を売却しきった銘柄は結果に含めない', () => {
    const trades: Trade[] = [
      makeTrade({ id: 't1', side: 'buy', quantity: 10, amount: 10000 }),
      makeTrade({ id: 't2', tradeDate: '2026-01-02', side: 'sell', quantity: 10, amount: 12000 }),
    ];

    expect(computeAverageCostPositions(trades)).toHaveLength(0);
  });
});
