import { describe, it, expect } from 'vitest';
import { searchJournalEntries } from '@/domain/journalSearch';
import type { JournalEntry } from '@/domain/types';

function makeEntry(overrides: Partial<JournalEntry> & Pick<JournalEntry, 'id'>): JournalEntry {
  return {
    tradeId: null,
    entryDate: '2026-01-01',
    body: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('searchJournalEntries', () => {
  it('空クエリは全件を返す', () => {
    const entries = [makeEntry({ id: 'e1', body: '本文A' }), makeEntry({ id: 'e2', body: '本文B' })];
    expect(searchJournalEntries(entries, new Map(), '  ')).toHaveLength(2);
  });

  it('本文の部分一致(全角/半角ゆれをNFKCで吸収)でヒットする', () => {
    const entries = [makeEntry({ id: 'e1', body: 'ﾄﾖﾀ自動車を利益確定した' })];
    // 半角カナ本文に対し全角カナで検索してもNFKC正規化により一致する
    expect(searchJournalEntries(entries, new Map(), 'トヨタ')).toHaveLength(1);
  });

  it('本文が一致しない場合は空配列になる', () => {
    const entries = [makeEntry({ id: 'e1', body: '無関係な内容' })];
    expect(searchJournalEntries(entries, new Map(), '該当なし')).toHaveLength(0);
  });

  it('タグ名の部分一致でもヒットする', () => {
    const entries = [makeEntry({ id: 'e1', body: '本文' }), makeEntry({ id: 'e2', body: '別の本文' })];
    const tagNamesByEntryId = new Map([['e2', ['焦り']]]);
    const result = searchJournalEntries(entries, tagNamesByEntryId, '焦り');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e2');
  });

  it('本文の空白は保持されるため、空白を挟んだ語同士は連結一致しない', () => {
    const entries = [makeEntry({ id: 'e1', body: 'a bc' })];
    expect(searchJournalEntries(entries, new Map(), 'abc')).toHaveLength(0);
  });
});
