import { describe, it, expect } from 'vitest';
import {
  aggregateRulePerformance,
  aggregateAdherencePerformance,
  aggregateEmotionTagPerformance,
  aggregateSecurityPerformance,
  aggregateMonthlyPerformance,
} from '@/domain/performance';
import type {
  Trade,
  TradeMatch,
  TradeRuleLink,
  RuleVersion,
  Rule,
  JournalEntry,
  JournalTag,
  Tag,
  Security,
} from '@/domain/types';

function makeTrade(overrides: Partial<Trade> & Pick<Trade, 'id'>): Trade {
  return {
    tradeDate: '2026-07-01',
    securityId: 'sec-1',
    side: 'sell',
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

function makeMatch(overrides: Partial<TradeMatch> & Pick<TradeMatch, 'id' | 'sellTradeId'>): TradeMatch {
  return {
    buyTradeId: 'buy-1',
    quantity: 1,
    realizedPnl: 0,
    currency: 'JPY',
    method: 'fifo_auto',
    createdAt: '2026-07-01T00:00:00.000Z',
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

describe('aggregateRulePerformance', () => {
  it('売却取引に紐付いたルールごとに勝率・期待値を算出する(JPY/USD別・ルールなしも集計)', () => {
    // sell-1: 2マッチ合算で+3000(勝ち)、ルールA紐付け
    const matches: TradeMatch[] = [
      makeMatch({ id: 'm1', sellTradeId: 'sell-1', realizedPnl: 2000, currency: 'JPY' }),
      makeMatch({ id: 'm2', sellTradeId: 'sell-1', realizedPnl: 1000, currency: 'JPY' }),
      // sell-2: -500(負け)、ルールA紐付け
      makeMatch({ id: 'm3', sellTradeId: 'sell-2', realizedPnl: -500, currency: 'JPY' }),
      // sell-3: USDで+100、ルールなし
      makeMatch({ id: 'm4', sellTradeId: 'sell-3', realizedPnl: 100, currency: 'USD' }),
    ];
    const links: TradeRuleLink[] = [
      { tradeId: 'sell-1', ruleVersionId: 'v1', adherence: 'followed', createdAt: '' },
      { tradeId: 'sell-2', ruleVersionId: 'v1', adherence: 'deviated', createdAt: '' },
    ];

    const result = aggregateRulePerformance(matches, links, [v1], [rule]);

    const ruleA = result.rules[0];
    expect(ruleA.performance.JPY.count).toBe(2);
    expect(ruleA.performance.JPY.winCount).toBe(1);
    expect(ruleA.performance.JPY.winRate).toBeCloseTo(0.5);
    expect(ruleA.performance.JPY.totalPnl).toBe(2500);
    expect(ruleA.performance.JPY.expectedValue).toBe(1250);
    expect(ruleA.performance.USD.count).toBe(0);

    expect(result.noRule.performance.USD.count).toBe(1);
    expect(result.noRule.performance.USD.winCount).toBe(1);
    expect(result.noRule.performance.USD.totalPnl).toBe(100);
  });

  it('取引が0件でも全ルールを0件の成績で返す', () => {
    const result = aggregateRulePerformance([], [], [v1], [rule]);
    expect(result.rules[0].performance.JPY).toEqual({
      count: 0,
      winCount: 0,
      winRate: 0,
      totalPnl: 0,
      expectedValue: 0,
    });
  });
});

describe('aggregateAdherencePerformance', () => {
  it('遵守評価区分ごとに件数・勝率・平均損益を算出する', () => {
    const matches: TradeMatch[] = [
      makeMatch({ id: 'm1', sellTradeId: 'sell-1', realizedPnl: 1000, currency: 'JPY' }),
      makeMatch({ id: 'm2', sellTradeId: 'sell-2', realizedPnl: -1000, currency: 'JPY' }),
      makeMatch({ id: 'm3', sellTradeId: 'sell-3', realizedPnl: 500, currency: 'JPY' }),
    ];
    const links: TradeRuleLink[] = [
      { tradeId: 'sell-1', ruleVersionId: 'v1', adherence: 'followed', createdAt: '' },
      { tradeId: 'sell-2', ruleVersionId: 'v1', adherence: 'followed', createdAt: '' },
      { tradeId: 'sell-3', ruleVersionId: 'v1', adherence: 'deviated', createdAt: '' },
      // sell-4は紐付けなしのため対象外
    ];

    const result = aggregateAdherencePerformance(matches, links);

    expect(result.followed.JPY.count).toBe(2);
    expect(result.followed.JPY.winCount).toBe(1);
    expect(result.followed.JPY.totalPnl).toBe(0);
    expect(result.deviated.JPY.count).toBe(1);
    expect(result.deviated.JPY.winCount).toBe(1);
    expect(result.partial.JPY.count).toBe(0);
  });
});

describe('aggregateEmotionTagPerformance', () => {
  it('取引単位エントリに付与された感情タグごとに損益を集計し、日単位エントリ・自由タグは対象外とする', () => {
    const matches: TradeMatch[] = [
      makeMatch({ id: 'm1', sellTradeId: 'sell-1', realizedPnl: 1000, currency: 'JPY' }),
      makeMatch({ id: 'm2', sellTradeId: 'sell-2', realizedPnl: -300, currency: 'JPY' }),
    ];
    const emotionTag: Tag = { id: 'tag-fear', name: '焦り', normalizedName: '焦り', kind: 'emotion', createdAt: '' };
    const freeTag: Tag = { id: 'tag-free', name: '自由メモ', normalizedName: '自由メモ', kind: 'free', createdAt: '' };
    const entries: JournalEntry[] = [
      { id: 'j1', tradeId: 'sell-1', entryDate: '2026-07-01', body: '', createdAt: '', updatedAt: '' },
      { id: 'j2', tradeId: 'sell-2', entryDate: '2026-07-02', body: '', createdAt: '', updatedAt: '' },
      { id: 'j3', tradeId: null, entryDate: '2026-07-03', body: '', createdAt: '', updatedAt: '' },
    ];
    const journalTags: JournalTag[] = [
      { journalId: 'j1', tagId: 'tag-fear', createdAt: '' },
      { journalId: 'j2', tagId: 'tag-fear', createdAt: '' },
      { journalId: 'j2', tagId: 'tag-free', createdAt: '' },
      { journalId: 'j3', tagId: 'tag-fear', createdAt: '' },
    ];

    const result = aggregateEmotionTagPerformance(matches, entries, journalTags, [emotionTag, freeTag]);

    expect(result).toHaveLength(1);
    expect(result[0].tagId).toBe('tag-fear');
    expect(result[0].performance.JPY.count).toBe(2);
    expect(result[0].performance.JPY.totalPnl).toBe(700);
  });
});

describe('aggregateSecurityPerformance', () => {
  it('銘柄ごとに決済済み取引の損益を集計する', () => {
    const trades: Trade[] = [
      makeTrade({ id: 'sell-1', securityId: 'sec-1' }),
      makeTrade({ id: 'sell-2', securityId: 'sec-2' }),
    ];
    const matches: TradeMatch[] = [
      makeMatch({ id: 'm1', sellTradeId: 'sell-1', realizedPnl: 1000, currency: 'JPY' }),
      makeMatch({ id: 'm2', sellTradeId: 'sell-2', realizedPnl: -200, currency: 'JPY' }),
    ];
    const securities: Security[] = [
      {
        id: 'sec-1',
        code: '1234',
        name: '銘柄A',
        normalizedName: '銘柄A',
        productType: 'jp_stock',
        currency: 'JPY',
        market: null,
        createdAt: '',
        aliases: [],
        sectorId: null,
        unitShareQuantity: null,
      },
    ];

    const result = aggregateSecurityPerformance(matches, trades, securities);

    expect(result).toHaveLength(2);
    const secA = result.find((r) => r.securityId === 'sec-1')!;
    expect(secA.securityName).toBe('銘柄A');
    expect(secA.performance.JPY.totalPnl).toBe(1000);
    const secB = result.find((r) => r.securityId === 'sec-2')!;
    expect(secB.securityName).toBe('(不明な銘柄)');
    expect(secB.performance.JPY.totalPnl).toBe(-200);
  });
});

describe('aggregateMonthlyPerformance', () => {
  it('決済(売却)取引の約定日の年月ごとに損益を集計し昇順で返す', () => {
    const trades: Trade[] = [
      makeTrade({ id: 'sell-1', tradeDate: '2026-07-15' }),
      makeTrade({ id: 'sell-2', tradeDate: '2026-06-01' }),
      makeTrade({ id: 'sell-3', tradeDate: '2026-07-20' }),
    ];
    const matches: TradeMatch[] = [
      makeMatch({ id: 'm1', sellTradeId: 'sell-1', realizedPnl: 1000, currency: 'JPY' }),
      makeMatch({ id: 'm2', sellTradeId: 'sell-2', realizedPnl: 500, currency: 'JPY' }),
      makeMatch({ id: 'm3', sellTradeId: 'sell-3', realizedPnl: -300, currency: 'JPY' }),
    ];

    const result = aggregateMonthlyPerformance(matches, trades);

    expect(result.map((r) => r.yearMonth)).toEqual(['2026-06', '2026-07']);
    expect(result[0].performance.JPY.totalPnl).toBe(500);
    expect(result[1].performance.JPY.totalPnl).toBe(700);
    expect(result[1].performance.JPY.count).toBe(2);
  });
});
