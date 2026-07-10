import { describe, it, expect } from 'vitest';
import { buildTradeCsv, buildTradeCsvFilename } from '@/domain/tradeCsv';
import type { Trade, Security, TradeRuleLink, TradeMatch } from '@/domain/types';

const security: Security = {
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
};

function makeTrade(overrides: Partial<Trade> & Pick<Trade, 'id' | 'side'>): Trade {
  return {
    tradeDate: '2026-07-01',
    securityId: 'sec-1',
    accountType: 'specific',
    quantity: 10,
    price: 1000,
    amount: 10000,
    currency: 'JPY',
    note: '',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('buildTradeCsv', () => {
  it('取引をヘッダー+行のCSVに変換する(実現損益・ルール・遵守評価を含む)', () => {
    const sellTrade = makeTrade({ id: 'sell-1', side: 'sell', note: 'メモ,カンマ入り' });
    const buyTrade = makeTrade({ id: 'buy-1', side: 'buy' });
    const link: TradeRuleLink = {
      tradeId: 'sell-1',
      ruleVersionId: 'v1',
      adherence: 'followed',
      createdAt: '',
    };
    const matches: TradeMatch[] = [
      {
        id: 'm1',
        sellTradeId: 'sell-1',
        buyTradeId: 'buy-1',
        quantity: 10,
        realizedPnl: 1500,
        currency: 'JPY',
        method: 'fifo_auto',
        createdAt: '',
      },
    ];

    const csv = buildTradeCsv(
      [sellTrade, buyTrade],
      new Map([['sec-1', security]]),
      new Map([['sell-1', link]]),
      new Map([['v1', { ruleName: 'ルールA', version: 2 }]]),
      new Map([['sell-1', matches]])
    );

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe(
      '約定日,銘柄コード,銘柄名,口座区分,売買,数量,単価,受渡金額,通貨,実現損益,適用ルール,ルールバージョン,遵守評価,メモ'
    );
    expect(lines[1]).toBe(
      '2026-07-01,1234,銘柄A,特定,売,10,1000,"10,000円",JPY,"1,500円",ルールA,v2,遵守,"メモ,カンマ入り"'
    );
    expect(lines[2]).toBe('2026-07-01,1234,銘柄A,特定,買,10,1000,"10,000円",JPY,,,,,');
  });

  it('銘柄が見つからない場合は「(不明な銘柄)」を出力する', () => {
    const trade = makeTrade({ id: 't1', side: 'buy', securityId: 'unknown' });
    const csv = buildTradeCsv([trade], new Map(), new Map(), new Map(), new Map());
    expect(csv).toContain('(不明な銘柄)');
  });
});

describe('buildTradeCsvFilename', () => {
  it('trades-YYYYMMDD-HHmm.csv 形式のファイル名を返す', () => {
    expect(buildTradeCsvFilename(new Date(2026, 6, 10, 9, 5))).toBe('trades-20260710-0905.csv');
  });
});
