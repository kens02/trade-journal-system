import { describe, it, expect } from 'vitest';
import { buildJournalCsv, buildJournalCsvFilename } from '@/domain/journalCsv';
import type { JournalEntry, Trade, Security, Tag } from '@/domain/types';

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

const trade: Trade = {
  id: 'trade-1',
  tradeDate: '2026-07-01',
  securityId: 'sec-1',
  side: 'buy',
  accountType: 'specific',
  quantity: 10,
  price: 1000,
  amount: 10000,
  currency: 'JPY',
  note: '',
  createdAt: '',
  updatedAt: '',
};

describe('buildJournalCsv', () => {
  it('取引単位エントリは銘柄・売買・金額・タグを併記し、本文の改行を1セルに保持する', () => {
    const entry: JournalEntry = {
      id: 'j1',
      tradeId: 'trade-1',
      entryDate: '2026-07-01',
      body: '1行目\n2行目',
      createdAt: '',
      updatedAt: '',
    };
    const tag: Tag = { id: 'tag-1', name: '確信', normalizedName: '確信', kind: 'emotion', createdAt: '' };

    const csv = buildJournalCsv(
      [entry],
      new Map([['trade-1', trade]]),
      new Map([['sec-1', security]]),
      new Map([['j1', [tag]]])
    );

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const body = csv.slice(1);
    expect(body).toBe('日付,種別,銘柄名,売買,金額,タグ,本文\r\n2026-07-01,取引単位,銘柄A,買,"10,000円",確信,"1行目\n2行目"');
  });

  it('日単位エントリ(tradeIdなし)は銘柄・売買・金額が空欄になる', () => {
    const entry: JournalEntry = {
      id: 'j2',
      tradeId: null,
      entryDate: '2026-07-02',
      body: '振り返り',
      createdAt: '',
      updatedAt: '',
    };
    const csv = buildJournalCsv([entry], new Map(), new Map(), new Map());
    expect(csv).toContain('2026-07-02,日単位,,,,,振り返り');
  });
});

describe('buildJournalCsvFilename', () => {
  it('journal-YYYYMMDD-HHmm.csv 形式のファイル名を返す', () => {
    expect(buildJournalCsvFilename(new Date(2026, 6, 10, 9, 5))).toBe('journal-20260710-0905.csv');
  });
});
