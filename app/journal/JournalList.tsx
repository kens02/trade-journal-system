'use client';

import type { JournalEntry, Tag, Trade, Security } from '@/domain/types';
import { formatJPY, formatUSD } from '@/domain/money';

interface Props {
  entries: JournalEntry[];
  tradesById: Map<string, Trade>;
  securitiesById: Map<string, Security>;
  tagsByEntryId: Map<string, Tag[]>;
  onEdit: (entry: JournalEntry) => void;
  onDelete: (entryId: string) => void;
}

// implement-p2.md 7章画面E: 一覧は日付降順。取引紐付きエントリは銘柄・売買・金額を併記
export function JournalList({ entries, tradesById, securitiesById, tagsByEntryId, onEdit, onDelete }: Props) {
  const sorted = [...entries].sort((a, b) => b.entryDate.localeCompare(a.entryDate));

  if (sorted.length === 0) {
    return <p className="text-sm text-gray-500">該当するエントリはありません。</p>;
  }

  return (
    <ul className="space-y-3">
      {sorted.map((entry) => {
        const trade = entry.tradeId ? tradesById.get(entry.tradeId) : undefined;
        const security = trade ? securitiesById.get(trade.securityId) : undefined;
        const tags = tagsByEntryId.get(entry.id) ?? [];
        return (
          <li key={entry.id} className="border rounded p-3 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm">
                <span className="font-medium">{entry.entryDate}</span>
                {trade && (
                  <span className="ml-2 text-gray-700">
                    {security?.name ?? '(不明な銘柄)'} ・ {trade.side === 'buy' ? '買' : '売'} ・{' '}
                    {trade.currency === 'JPY' ? formatJPY(trade.amount) : formatUSD(trade.amount)}
                  </span>
                )}
              </div>
              <div className="space-x-2 whitespace-nowrap text-sm">
                <button type="button" className="text-blue-600 underline" onClick={() => onEdit(entry)}>
                  編集
                </button>
                <button
                  type="button"
                  className="text-red-600 underline"
                  onClick={() => {
                    if (window.confirm('このエントリを削除しますか?')) {
                      onDelete(entry.id);
                    }
                  }}
                >
                  削除
                </button>
              </div>
            </div>
            {tags.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {tags.map((tag) => (
                  <span key={tag.id} className="text-xs bg-gray-100 rounded px-2 py-0.5">
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
            <p className="text-sm whitespace-pre-wrap">{entry.body}</p>
          </li>
        );
      })}
    </ul>
  );
}
