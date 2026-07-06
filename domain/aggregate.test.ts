import { describe, it, expect } from 'vitest';
import { aggregateTrades } from '@/domain/aggregate';
import type { Trade, TradeRuleLink, RuleVersion, Rule } from '@/domain/types';

function makeTrade(overrides: Partial<Trade> & Pick<Trade, 'id'>): Trade {
  return {
    tradeDate: '2026-07-01',
    securityId: 'sec-1',
    side: 'buy',
    accountType: 'specific',
    quantity: 1,
    price: 100,
    amount: 100,
    currency: 'JPY',
    note: '',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

const rule: Rule = { id: 'rule-a', name: 'ルールA', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' };
const versionSections = { overview: '', entry: '', exit: '', exclusion: '', moneyManagement: '' };
const v1: RuleVersion = {
  id: 'v1',
  ruleId: 'rule-a',
  version: 1,
  sections: versionSections,
  revisionReason: '',
  createdAt: '2026-01-01T00:00:00.000Z',
};
const v2: RuleVersion = {
  id: 'v2',
  ruleId: 'rule-a',
  version: 2,
  sections: versionSections,
  revisionReason: '改訂',
  createdAt: '2026-02-01T00:00:00.000Z',
};

describe('aggregateTrades', () => {
  it('JPY/USD混在・買/売混在・遵守区分混在・複数バージョン・ルールなしを正しく集計する', () => {
    const t1 = makeTrade({ id: 't1', side: 'buy', currency: 'JPY', amount: 100000 });
    const t2 = makeTrade({ id: 't2', side: 'sell', currency: 'JPY', amount: 50000 });
    const t3 = makeTrade({ id: 't3', side: 'buy', currency: 'USD', amount: 10000 });
    const t4 = makeTrade({ id: 't4', side: 'buy', currency: 'JPY', amount: 20000 });
    const t5 = makeTrade({ id: 't5', side: 'sell', currency: 'USD', amount: 5000 });

    const links: TradeRuleLink[] = [
      { tradeId: 't1', ruleVersionId: 'v1', adherence: 'followed', createdAt: '' },
      { tradeId: 't2', ruleVersionId: 'v1', adherence: 'partial', createdAt: '' },
      { tradeId: 't3', ruleVersionId: 'v2', adherence: 'deviated', createdAt: '' },
      // t4, t5 は紐付けなし
    ];

    const result = aggregateTrades([t1, t2, t3, t4, t5], links, [v1, v2], [rule]);

    expect(result.rules).toHaveLength(1);
    const ruleSummary = result.rules[0];
    expect(ruleSummary.ruleName).toBe('ルールA');
    expect(ruleSummary.tradeCount).toBe(3);
    expect(ruleSummary.buyCount).toBe(2);
    expect(ruleSummary.sellCount).toBe(1);
    expect(ruleSummary.amountByCurrency.JPY).toEqual({ buy: 100000, sell: 50000 });
    expect(ruleSummary.amountByCurrency.USD).toEqual({ buy: 10000, sell: 0 });
    expect(ruleSummary.adherence).toEqual({ followed: 1, partial: 1, deviated: 1 });

    expect(ruleSummary.versions).toHaveLength(2);
    const v1Summary = ruleSummary.versions.find((v) => v.version === 1)!;
    expect(v1Summary.tradeCount).toBe(2);
    expect(v1Summary.buyCount).toBe(1);
    expect(v1Summary.sellCount).toBe(1);
    expect(v1Summary.amountByCurrency.JPY).toEqual({ buy: 100000, sell: 50000 });
    expect(v1Summary.amountByCurrency.USD).toEqual({ buy: 0, sell: 0 });
    expect(v1Summary.adherence).toEqual({ followed: 1, partial: 1, deviated: 0 });

    const v2Summary = ruleSummary.versions.find((v) => v.version === 2)!;
    expect(v2Summary.tradeCount).toBe(1);
    expect(v2Summary.buyCount).toBe(1);
    expect(v2Summary.amountByCurrency.USD).toEqual({ buy: 10000, sell: 0 });
    expect(v2Summary.adherence).toEqual({ followed: 0, partial: 0, deviated: 1 });

    expect(result.noRule.tradeCount).toBe(2);
    expect(result.noRule.buyCount).toBe(1);
    expect(result.noRule.sellCount).toBe(1);
    expect(result.noRule.amountByCurrency.JPY).toEqual({ buy: 20000, sell: 0 });
    expect(result.noRule.amountByCurrency.USD).toEqual({ buy: 0, sell: 5000 });
  });

  it('取引が0件でもルール一覧はversionsを含め空の集計値で返る', () => {
    const result = aggregateTrades([], [], [v1, v2], [rule]);
    expect(result.rules[0].tradeCount).toBe(0);
    expect(result.rules[0].versions).toHaveLength(2);
    expect(result.rules[0].versions[0].tradeCount).toBe(0);
    expect(result.noRule.tradeCount).toBe(0);
  });
});
