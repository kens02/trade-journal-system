import type { JournalEntry, Trade, Security, Tag } from './types';
import { formatJPY, formatUSD } from './money';
import { buildCsvContent, buildCsvFilename } from './csv';

const HEADER = ['日付', '種別', '銘柄名', '売買', '金額', 'タグ', '本文'];

// implement-p4.md 5.1節: app/journal/JournalList.tsxの表示項目に準拠したCSV生成。
// タグは複数付与され得るため「; 」区切りで1セルに連結する
export function buildJournalCsv(
  entries: JournalEntry[],
  tradesById: Map<string, Trade>,
  securitiesById: Map<string, Security>,
  tagsByEntryId: Map<string, Tag[]>
): string {
  const rows = entries.map((entry) => {
    const trade = entry.tradeId ? tradesById.get(entry.tradeId) : undefined;
    const security = trade ? securitiesById.get(trade.securityId) : undefined;
    const tags = tagsByEntryId.get(entry.id) ?? [];
    return [
      entry.entryDate,
      entry.tradeId ? '取引単位' : '日単位',
      security?.name ?? '',
      trade ? (trade.side === 'buy' ? '買' : '売') : '',
      trade ? (trade.currency === 'JPY' ? formatJPY(trade.amount) : formatUSD(trade.amount)) : '',
      tags.map((t) => t.name).join('; '),
      entry.body,
    ];
  });
  return buildCsvContent(HEADER, rows);
}

export function buildJournalCsvFilename(exportedAt: Date): string {
  return buildCsvFilename('journal', exportedAt);
}
