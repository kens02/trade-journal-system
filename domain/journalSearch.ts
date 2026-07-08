import type { JournalEntry } from './types';

// implement-p2.md 7章: 全文検索は本文+タグ名を対象にNFKC正規化した部分一致とする。
// domain/normalize.tsのnormalizeName(空白除去)は銘柄名等の識別子キー生成が目的であり、
// 長文の本文でこれを使うと語間の空白が失われ単語境界を越えた誤マッチが起きるため、
// 検索専用にNFKCのみを行う正規化を用いる
function normalizeForSearch(raw: string): string {
  return raw.normalize('NFKC');
}

// tagNamesByEntryId: JournalEntry.idごとに付与されているタグ名(生の文字列)の一覧
export function searchJournalEntries(
  entries: JournalEntry[],
  tagNamesByEntryId: Map<string, string[]>,
  query: string
): JournalEntry[] {
  const key = normalizeForSearch(query.trim());
  if (key === '') return entries;

  return entries.filter((entry) => {
    if (normalizeForSearch(entry.body).includes(key)) return true;
    const tagNames = tagNamesByEntryId.get(entry.id) ?? [];
    return tagNames.some((name) => normalizeForSearch(name).includes(key));
  });
}
