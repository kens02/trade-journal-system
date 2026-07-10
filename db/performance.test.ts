import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/schema';
import { listTrades, listJournalEntries, createSecurity } from '@/db/repository';
import { searchJournalEntries } from '@/domain/journalSearch';
import type { Trade, JournalEntry } from '@/domain/types';

// 仕様書8章「取引5,000件・ジャーナル3,000件規模で、一覧表示・全文検索が体感1秒以内」/
// implement-p4.md 8章(F0確認: 自動テストのみで検証)。
// fake-indexeddb上でのDexieクエリ+domain層の全文検索処理時間を閾値アサーションで検証する。
// 実ブラウザのIndexedDB I/O・DOM描画とは特性が異なる近似的な確認であり、この旨を完了報告に明記する
const TRADE_COUNT = 5000;
const JOURNAL_COUNT = 3000;
const THRESHOLD_MS = 1000;

beforeEach(async () => {
  await db.transaction(
    'rw',
    [db.securities, db.trades, db.journalEntries, db.tags, db.journalTags],
    async () => {
      await db.securities.clear();
      await db.trades.clear();
      await db.journalEntries.clear();
      await db.tags.clear();
      await db.journalTags.clear();
    }
  );
});

describe('性能検証(取引5,000件・ジャーナル3,000件規模)', () => {
  it('取引一覧の取得が閾値以内で完了する', async () => {
    const security = await createSecurity({
      code: '1301',
      name: '銘柄A',
      productType: 'jp_stock',
      currency: 'JPY',
    });
    // インポート・FIFOマッチング処理は対象外のため、Dexieへの直接bulkAddで
    // 「大量データが既に登録された状態からの一覧取得」を再現する
    const trades: Trade[] = Array.from({ length: TRADE_COUNT }, (_, i) => ({
      id: `trade-${i}`,
      tradeDate: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      securityId: security.id,
      side: i % 2 === 0 ? 'buy' : 'sell',
      accountType: 'specific',
      quantity: 100,
      price: 1000,
      amount: 100000,
      currency: 'JPY',
      note: `メモ${i}`,
      createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
      updatedAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
    }));
    await db.trades.bulkAdd(trades);

    const start = performance.now();
    const result = await listTrades();
    const elapsed = performance.now() - start;

    expect(result).toHaveLength(TRADE_COUNT);
    expect(elapsed).toBeLessThan(THRESHOLD_MS);
  });

  it('ジャーナル一覧取得+全文検索が閾値以内で完了する', async () => {
    const entries: JournalEntry[] = Array.from({ length: JOURNAL_COUNT }, (_, i) => ({
      id: `journal-${i}`,
      tradeId: null,
      entryDate: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      body: i === JOURNAL_COUNT - 1 ? '損切りルールを逸脱してしまった振り返り' : `振り返り本文${i}`,
      createdAt: '',
      updatedAt: '',
    }));
    await db.journalEntries.bulkAdd(entries);

    const start = performance.now();
    const loaded = await listJournalEntries();
    const searchResult = searchJournalEntries(loaded, new Map(), '損切り');
    const elapsed = performance.now() - start;

    expect(loaded).toHaveLength(JOURNAL_COUNT);
    expect(searchResult).toHaveLength(1);
    expect(elapsed).toBeLessThan(THRESHOLD_MS);
  });
});
