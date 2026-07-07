import { describe, it, expect } from 'vitest';
import { parsePortfolioCsv, computeHoldingDiscrepancies, matchPortfolioSecurity } from '@/import/portfolio';
import { sniffFileType } from '@/import/common';
import { PORTFOLIO_SAMPLE_UTF8 } from '@/import/__fixtures__/portfolio';
import type { Security } from '@/domain/types';

function makeSecurity(overrides: Partial<Security> & Pick<Security, 'id'>): Security {
  return {
    code: null,
    name: 'テスト',
    normalizedName: 'テスト',
    productType: 'jp_stock',
    currency: 'JPY',
    market: null,
    aliases: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('parsePortfolioCsv', () => {
  it('セクションタイトルから商品種別・口座区分を解釈し、明細行のみ抽出する', () => {
    const result = parsePortfolioCsv(PORTFOLIO_SAMPLE_UTF8);
    expect(result.ok).toBe(true);
    // 株式セクション2件(1件は数値不正でrow_error)+投信セクション2件 = 4件
    expect(result.rows).toHaveLength(4);
    expect(result.errors).toHaveLength(1);
  });

  it('株式/ETF行はコード+略称に分離され、口座区分がNISA成長として解釈される', () => {
    const result = parsePortfolioCsv(PORTFOLIO_SAMPLE_UTF8);
    const row = result.rows.find((r) => r.securityCode === '1489')!;
    expect(row.rawSecurityName).toBe('テスト商事');
    expect(row.productKind).toBe('stock_or_etf');
    expect(row.accountType).toBe('nisa_growth');
    expect(row.purchaseDate).toBe('2026-01-15');
  });

  it('投信行はコードなしでファンド名がそのまま使われ、口座区分がNISAつみたてになる', () => {
    const result = parsePortfolioCsv(PORTFOLIO_SAMPLE_UTF8);
    const row = result.rows.find((r) => r.rawSecurityName === 'テストファンド')!;
    expect(row.securityCode).toBeNull();
    expect(row.productKind).toBe('fund');
    expect(row.accountType).toBe('nisa_tsumitate');
    expect(row.purchaseDate).toBeNull(); // '----/--/--'
  });

  it('未登録の投信名も明細行としては解釈される(照合はUI層の責務)', () => {
    const result = parsePortfolioCsv(PORTFOLIO_SAMPLE_UTF8);
    const row = result.rows.find((r) => r.rawSecurityName === '未登録テストファンド');
    expect(row).toBeDefined();
  });

  it('数値が不正な明細行はrow_errorになり、他行のパースには影響しない', () => {
    const result = parsePortfolioCsv(PORTFOLIO_SAMPLE_UTF8);
    expect(result.errors[0].message).toContain('数値として不正');
  });

  it('合計ブロックと明細再計算値が一致するセクションは警告が出ない', () => {
    const result = parsePortfolioCsv(PORTFOLIO_SAMPLE_UTF8);
    const stockWarnings = result.reconciliationWarnings.filter((w) =>
      w.sectionTitle.startsWith('株式')
    );
    expect(stockWarnings).toHaveLength(0);
  });

  it('合計ブロックと明細再計算値が不一致のセクションは評価額・損益それぞれ警告が出る', () => {
    const result = parsePortfolioCsv(PORTFOLIO_SAMPLE_UTF8);
    const fundWarnings = result.reconciliationWarnings.filter((w) => w.sectionTitle.startsWith('投資信託'));
    expect(fundWarnings).toHaveLength(2);

    // 投信の評価額は数量×現在値÷10000(仕様書6.2の基準価額換算): 10500*12400/10000 + 5000*10100/10000 = 18070
    const evaluationWarning = fundWarnings.find((w) => w.field === 'evaluationAmount')!;
    expect(evaluationWarning.computed).toBeCloseTo(18070);
    expect(evaluationWarning.expected).toBe(99999);

    const pnlWarning = fundWarnings.find((w) => w.field === 'pnl')!;
    expect(pnlWarning.computed).toBeCloseTo(107.75);
    expect(pnlWarning.expected).toBe(999.0);
  });

  it('ポートフォリオ一覧のタイトル行が見つからないファイルはunrecognized_fileになる', () => {
    const result = parsePortfolioCsv('foo,bar\n1,2');
    expect(result.ok).toBe(false);
    expect(result.rows).toHaveLength(0);
  });
});

describe('sniffFileType (portfolio)', () => {
  it('ポートフォリオ一覧を含むファイルはportfolioと判定する', () => {
    expect(sniffFileType(PORTFOLIO_SAMPLE_UTF8)).toBe('portfolio');
  });
});

describe('matchPortfolioSecurity', () => {
  it('コードがあればコードのみで一致させる(市場は問わない)', () => {
    const securities = [makeSecurity({ id: 'sec-1', code: '1489', market: '東証' })];
    const matched = matchPortfolioSecurity({ securityCode: '1489', rawSecurityName: 'テスト商事' }, securities);
    expect(matched?.id).toBe('sec-1');
  });

  it('コードがない場合はnormalizedNameまたはエイリアスで一致させる', () => {
    const securities = [
      makeSecurity({ id: 'sec-2', code: null, name: 'テストファンド', normalizedName: 'テストファンド', aliases: ['テストF'] }),
    ];
    expect(
      matchPortfolioSecurity({ securityCode: null, rawSecurityName: 'テストファンド' }, securities)?.id
    ).toBe('sec-2');
    expect(matchPortfolioSecurity({ securityCode: null, rawSecurityName: 'テストF' }, securities)?.id).toBe(
      'sec-2'
    );
    expect(
      matchPortfolioSecurity({ securityCode: null, rawSecurityName: '未登録ファンド' }, securities)
    ).toBeUndefined();
  });
});

describe('computeHoldingDiscrepancies', () => {
  it('CSV保有数量と取引記録由来の保有数量が一致しない場合に差異を報告する', () => {
    const holdingQuantities = new Map<string, number>([['sec-1::specific', 90]]);
    const discrepancies = computeHoldingDiscrepancies(
      [{ resolvedSecurityId: 'sec-1', accountType: 'specific', quantity: 100 }],
      holdingQuantities
    );
    expect(discrepancies).toHaveLength(1);
    expect(discrepancies[0]).toEqual({
      securityId: 'sec-1',
      accountType: 'specific',
      csvQuantity: 100,
      computedQuantity: 90,
      difference: 10,
    });
  });

  it('一致する場合は差異を報告しない', () => {
    const holdingQuantities = new Map<string, number>([['sec-1::specific', 100]]);
    const discrepancies = computeHoldingDiscrepancies(
      [{ resolvedSecurityId: 'sec-1', accountType: 'specific', quantity: 100 }],
      holdingQuantities
    );
    expect(discrepancies).toHaveLength(0);
  });
});
