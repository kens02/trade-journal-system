import { describe, it, expect } from 'vitest';
import { parseDomesticHistoryCsv } from '@/import/domesticHistory';
import { duplicateKey, sniffFileType } from '@/import/common';
import { DOMESTIC_HISTORY_SAMPLE_UTF8 } from '@/import/__fixtures__/domesticHistory';
import { UNRECOGNIZED_FILE_SAMPLE } from '@/import/__fixtures__/unrecognizedFile';

describe('parseDomesticHistoryCsv', () => {
  it('ヘッダー行を検出し、プリアンブルを無視して明細行のみ解釈する', () => {
    const result = parseDomesticHistoryCsv(DOMESTIC_HISTORY_SAMPLE_UTF8);
    expect(result.ok).toBe(true);
    // 明細8行中、語彙不一致1件がrow_errorになり、残り7行はパース成功する(重複判定はこの層では行わない)
    expect(result.rows).toHaveLength(7);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].kind).toBe('row_error');
  });

  it('株式現物買/売、投信金額買付、分配金再投資が正しくside/productKindにマッピングされる', () => {
    const result = parseDomesticHistoryCsv(DOMESTIC_HISTORY_SAMPLE_UTF8);
    const [buyStock, sellStock, buyFund, reinvest] = result.rows;

    expect(buyStock.side).toBe('buy');
    expect(buyStock.productKind).toBe('stock_or_etf');
    expect(buyStock.securityCode).toBe('1489');
    expect(buyStock.market).toBe('東証');
    expect(buyStock.accountType).toBe('specific');
    expect(buyStock.amount).toBe(218050);

    expect(sellStock.side).toBe('sell');

    expect(buyFund.side).toBe('buy');
    expect(buyFund.productKind).toBe('fund');
    expect(buyFund.securityCode).toBeNull(); // 投信はコードなし
    expect(buyFund.accountType).toBe('nisa_tsumitate');

    expect(reinvest.isDistributionReinvestment).toBe(true);
    expect(reinvest.side).toBe('buy');
  });

  it('東証(外)・NISA(成)・旧NISAの行も正しく解釈される', () => {
    const result = parseDomesticHistoryCsv(DOMESTIC_HISTORY_SAMPLE_UTF8);
    const growthRow = result.rows.find((r) => r.securityCode === '314A');
    const oldNisaRow = result.rows.find((r) => r.securityCode === '7267');
    expect(growthRow?.market).toBe('東証(外)');
    expect(growthRow?.accountType).toBe('nisa_growth');
    expect(oldNisaRow?.accountType).toBe('old_nisa');
  });

  it('未知の取引区分の行はrow_errorになり、他行のパースには影響しない', () => {
    const result = parseDomesticHistoryCsv(DOMESTIC_HISTORY_SAMPLE_UTF8);
    const error = result.errors.find((e) => e.kind === 'row_error');
    expect(error?.rowNumber).toBeDefined();
    expect(error?.message).toContain('未知の取引区分');
  });

  it('重複キーが同一約定日・銘柄・区分・数量・単価の行同士で一致する', () => {
    const result = parseDomesticHistoryCsv(DOMESTIC_HISTORY_SAMPLE_UTF8);
    const buyRows = result.rows.filter((r) => r.securityCode === '1489' && r.side === 'buy');
    expect(buyRows).toHaveLength(2); // 1行目と重複行

    const keys = buyRows.map((r) =>
      duplicateKey({
        tradeDate: r.tradeDate,
        securityIdentifier: r.securityCode ?? r.rawSecurityName,
        side: r.side,
        quantity: r.quantity,
        price: r.price,
      })
    );
    expect(keys[0]).toBe(keys[1]);

    const sellRow = result.rows.find((r) => r.securityCode === '1489' && r.side === 'sell')!;
    const sellKey = duplicateKey({
      tradeDate: sellRow.tradeDate,
      securityIdentifier: sellRow.securityCode ?? sellRow.rawSecurityName,
      side: sellRow.side,
      quantity: sellRow.quantity,
      price: sellRow.price,
    });
    expect(sellKey).not.toBe(keys[0]);
  });

  it('ヘッダー行が見つからない/一致しないファイルはunrecognized_fileになる', () => {
    const result = parseDomesticHistoryCsv(UNRECOGNIZED_FILE_SAMPLE);
    expect(result.ok).toBe(false);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].kind).toBe('unrecognized_file');
  });
});

describe('sniffFileType', () => {
  it('約定日で始まるヘッダーは国内履歴と判定する', () => {
    expect(sniffFileType(DOMESTIC_HISTORY_SAMPLE_UTF8)).toBe('domestic_history');
  });

  it('国内約定日で始まるヘッダーは米国履歴と判定する(F2では未対応エラーの分岐に使う)', () => {
    expect(sniffFileType(UNRECOGNIZED_FILE_SAMPLE)).toBe('us_history');
  });

  it('どちらでもない場合はunknownを返す', () => {
    expect(sniffFileType('foo,bar\n1,2')).toBe('unknown');
  });
});
