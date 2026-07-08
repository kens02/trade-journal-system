import { describe, it, expect } from 'vitest';
import { computeFifoMatchesForGroup, groupTradesByKey, allocateByQuantity } from '@/domain/fifo';
import { holdingKey } from '@/domain/holdings';
import type { Trade, TradeMatch } from '@/domain/types';

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

describe('allocateByQuantity', () => {
  it('端数は累積差分により後続の消費に自然に寄る(合計は元金額と一致)', () => {
    // 100を3等分(33.33...)する例: 1株消費→2株消費の順で合計が100に一致する
    const a = allocateByQuantity(100, 3, 0, 1);
    const b = allocateByQuantity(100, 3, 1, 2);
    expect(a).toBe(33);
    expect(b).toBe(67);
    expect(a + b).toBe(100);
  });
});

describe('groupTradesByKey', () => {
  it('口座区分が異なれば別グループになる', () => {
    const trades = [
      makeTrade({ id: 't1', accountType: 'specific' }),
      makeTrade({ id: 't2', accountType: 'nisa_growth' }),
    ];
    const groups = groupTradesByKey(trades);
    expect(groups.size).toBe(2);
    expect(groups.get(holdingKey('sec-1', 'specific'))).toHaveLength(1);
    expect(groups.get(holdingKey('sec-1', 'nisa_growth'))).toHaveLength(1);
  });
});

describe('computeFifoMatchesForGroup', () => {
  it('1売却が複数買付に跨って按分され、按分合計が売却金額と一致する(端数含む)', () => {
    const trades: Trade[] = [
      makeTrade({
        id: 'buy1',
        side: 'buy',
        tradeDate: '2026-01-01',
        createdAt: '2026-01-01T00:00:00.000Z',
        quantity: 10,
        amount: 1000,
      }),
      makeTrade({
        id: 'buy2',
        side: 'buy',
        tradeDate: '2026-01-02',
        createdAt: '2026-01-02T00:00:00.000Z',
        quantity: 10,
        amount: 1030,
      }),
      makeTrade({
        id: 'sell1',
        side: 'sell',
        tradeDate: '2026-01-03',
        createdAt: '2026-01-03T00:00:00.000Z',
        quantity: 15,
        amount: 1650,
      }),
    ];

    const { matches, unresolvedSells } = computeFifoMatchesForGroup(trades, []);

    expect(unresolvedSells).toHaveLength(0);
    expect(matches).toHaveLength(2);

    const m1 = matches.find((m) => m.buyTradeId === 'buy1')!;
    const m2 = matches.find((m) => m.buyTradeId === 'buy2')!;
    expect(m1.quantity).toBe(10);
    expect(m1.realizedPnl).toBe(100); // 売却按分1100 - 買付按分1000
    expect(m2.quantity).toBe(5);
    expect(m2.realizedPnl).toBe(35); // 売却按分550 - 買付按分515

    // 按分合計=元金額の恒等性(完全消費されたsell1・buy1で成立)
    const sellAllocTotal = matches.reduce((sum, m) => sum + m.realizedPnl, 0) + 1000 + 515;
    expect(sellAllocTotal).toBe(1650);
    expect(m1.method).toBe('fifo_auto');
  });

  it('按分合計=元金額の恒等性(USD、1買付が複数売却に跨るケース)', () => {
    const trades: Trade[] = [
      makeTrade({
        id: 'buy1',
        side: 'buy',
        tradeDate: '2026-01-01',
        createdAt: '2026-01-01T00:00:00.000Z',
        quantity: 3,
        amount: 10000,
        currency: 'USD',
      }),
      makeTrade({
        id: 'sell1',
        side: 'sell',
        tradeDate: '2026-01-02',
        createdAt: '2026-01-02T00:00:00.000Z',
        quantity: 1,
        amount: 4000,
        currency: 'USD',
      }),
      makeTrade({
        id: 'sell2',
        side: 'sell',
        tradeDate: '2026-01-03',
        createdAt: '2026-01-03T00:00:00.000Z',
        quantity: 2,
        amount: 9000,
        currency: 'USD',
      }),
    ];

    const { matches, unresolvedSells } = computeFifoMatchesForGroup(trades, []);
    expect(unresolvedSells).toHaveLength(0);
    expect(matches).toHaveLength(2);

    // buy1(qty3, amount10000)は2件のsellに跨って完全消費される。
    // sell側の按分(実現損益+買付按分)を独立に計算し、buy按分の合計が元金額10000と一致することを検証する。
    const m1 = matches.find((m) => m.sellTradeId === 'sell1')!; // qty1, sellAlloc=4000
    const m2 = matches.find((m) => m.sellTradeId === 'sell2')!; // qty2, sellAlloc=9000
    const buyAlloc1 = 4000 - m1.realizedPnl;
    const buyAlloc2 = 9000 - m2.realizedPnl;
    expect(buyAlloc1 + buyAlloc2).toBe(10000);
    expect(m1.quantity + m2.quantity).toBe(3);
  });

  it('口座区分が異なる同一銘柄はグループが分かれるためマッチングされない', () => {
    const trades: Trade[] = [
      makeTrade({ id: 'buy1', side: 'buy', accountType: 'specific', quantity: 10, amount: 1000 }),
      makeTrade({ id: 'sell1', side: 'sell', accountType: 'nisa_growth', quantity: 10, amount: 1100 }),
    ];
    const groups = groupTradesByKey(trades);
    expect(groups.size).toBe(2);

    const specificGroup = groups.get(holdingKey('sec-1', 'specific'))!;
    const { matches, unresolvedSells } = computeFifoMatchesForGroup(specificGroup, []);
    expect(matches).toHaveLength(0);
    expect(unresolvedSells).toHaveLength(0); // このグループにsellがそもそも属さない
  });

  it('買付残が不足する売却は未解消警告として報告される', () => {
    const trades: Trade[] = [
      makeTrade({ id: 'buy1', side: 'buy', tradeDate: '2026-01-01', quantity: 5, amount: 500 }),
      makeTrade({ id: 'sell1', side: 'sell', tradeDate: '2026-01-02', quantity: 8, amount: 900 }),
    ];
    const { matches, unresolvedSells } = computeFifoMatchesForGroup(trades, []);
    expect(matches).toHaveLength(1);
    expect(matches[0].quantity).toBe(5);
    expect(unresolvedSells).toEqual([{ sellTradeId: 'sell1', unmatchedQuantity: 3 }]);
  });

  it('手動マッチ済み数量は自動マッチのプールから除外される', () => {
    const manualMatch: TradeMatch = {
      id: 'manual1',
      sellTradeId: 'sell-other',
      buyTradeId: 'buy1',
      quantity: 4,
      realizedPnl: 999,
      currency: 'JPY',
      method: 'manual',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const trades: Trade[] = [
      makeTrade({ id: 'buy1', side: 'buy', tradeDate: '2026-01-01', quantity: 10, amount: 1000 }),
      makeTrade({ id: 'sell1', side: 'sell', tradeDate: '2026-01-02', quantity: 6, amount: 660 }),
    ];
    const { matches, unresolvedSells } = computeFifoMatchesForGroup(trades, [manualMatch]);
    expect(unresolvedSells).toHaveLength(0);
    expect(matches).toHaveLength(1);
    expect(matches[0].quantity).toBe(6);
    // 自動プールはbuy1のうち6株分(1000*6/10=600)のみ。600と660の按分差益=60
    expect(matches[0].realizedPnl).toBe(60);
  });
});
