import { describe, it, expect } from 'vitest';
import { parsePortfolioCsv, computeHoldingDiscrepancies } from '@/import/portfolio';
import { sniffFileType } from '@/import/common';
import { PORTFOLIO_SAMPLE_UTF8 } from '@/import/__fixtures__/portfolio';

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

  it('合計ブロックと明細再計算値が不一致のセクションは数量・損益それぞれ警告が出る', () => {
    const result = parsePortfolioCsv(PORTFOLIO_SAMPLE_UTF8);
    const fundWarnings = result.reconciliationWarnings.filter((w) => w.sectionTitle.startsWith('投資信託'));
    expect(fundWarnings).toHaveLength(2);

    const quantityWarning = fundWarnings.find((w) => w.field === 'quantity')!;
    expect(quantityWarning.computed).toBe(15500);
    expect(quantityWarning.expected).toBe(16000);

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
