import { describe, it, expect } from 'vitest';
import { parseUsHistoryCsv } from '@/import/usHistory';
import { duplicateKey, sniffFileType } from '@/import/common';
import { US_HISTORY_SAMPLE_UTF8 } from '@/import/__fixtures__/usHistory';

describe('parseUsHistoryCsv', () => {
  it('ヘッダー行を検出し、プリアンブルを無視して明細行のみ解釈する(ダブルクォート除去含む)', () => {
    const result = parseUsHistoryCsv(US_HISTORY_SAMPLE_UTF8);
    expect(result.ok).toBe(true);
    // 明細5行中、語彙不一致1件がrow_errorになり、残り4行はパース成功する
    expect(result.rows).toHaveLength(4);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].kind).toBe('row_error');
  });

  it('現買/現売がbuy/sellにマッピングされ、金額がセント整数化される', () => {
    const result = parseUsHistoryCsv(US_HISTORY_SAMPLE_UTF8);
    const [buyRow, sellRow] = result.rows;

    expect(buyRow.side).toBe('buy');
    expect(buyRow.ticker).toBe('T');
    expect(buyRow.market).toBe('NYSE');
    expect(buyRow.accountType).toBe('specific');
    expect(buyRow.price).toBe(26.25);
    expect(buyRow.amount).toBe(10500); // 105.00USD -> 整数セント
    expect(buyRow.impliedCost).toBe(0); // 4 * 26.25 = 105.00と一致

    expect(sellRow.side).toBe('sell');
    expect(sellRow.amount).toBe(10449); // 104.49USD
    expect(sellRow.impliedCost).toBe(51); // |10500 - 10449|
  });

  it("預り区分'NISA'(単独)はnisa_growthとして扱われる", () => {
    const result = parseUsHistoryCsv(US_HISTORY_SAMPLE_UTF8);
    const nisaRow = result.rows.find((r) => r.ticker === 'SPYD');
    expect(nisaRow?.accountType).toBe('nisa_growth');
    expect(nisaRow?.market).toBe('NYSE Arca');
    expect(nisaRow?.impliedCost).toBe(0);
  });

  it('未知の取引区分の行はrow_errorになる', () => {
    const result = parseUsHistoryCsv(US_HISTORY_SAMPLE_UTF8);
    const error = result.errors.find((e) => e.kind === 'row_error');
    expect(error?.message).toContain('未知の取引区分');
  });

  it('重複キーが同一約定日・銘柄・区分・数量・単価の行同士で一致する', () => {
    const result = parseUsHistoryCsv(US_HISTORY_SAMPLE_UTF8);
    const buyRows = result.rows.filter((r) => r.ticker === 'T' && r.side === 'buy');
    expect(buyRows).toHaveLength(2);

    const keys = buyRows.map((r) =>
      duplicateKey({
        tradeDate: r.tradeDate,
        securityIdentifier: r.ticker,
        side: r.side,
        quantity: r.quantity,
        price: r.price,
      })
    );
    expect(keys[0]).toBe(keys[1]);
  });

  it('ヘッダー行が見つからない/一致しないファイルはunrecognized_fileになる', () => {
    const result = parseUsHistoryCsv('foo,bar\n1,2');
    expect(result.ok).toBe(false);
    expect(result.rows).toHaveLength(0);
  });

  it('国内約定履歴CSV(約定日ヘッダー)はus_historyのヘッダーとは一致しない', () => {
    const domesticShaped = [
      '約定履歴照会',
      '',
      '約定日,受渡日,銘柄,銘柄コード,市場,取引,期限,預り,課税,約定数量,約定単価,手数料/諸経費等,税額,受渡金額/決済損益',
      '2026/01/15,2026/01/17,テスト商事,1489,東証,株式現物買,--, 特定 ,課税,100,2180.5,--,--,218050',
    ].join('\n');
    const result = parseUsHistoryCsv(domesticShaped);
    expect(result.ok).toBe(false);
  });
});

describe('sniffFileType (us_history)', () => {
  it('国内約定日で始まるヘッダーは米国履歴と判定する', () => {
    expect(sniffFileType(US_HISTORY_SAMPLE_UTF8)).toBe('us_history');
  });
});
