'use client';

import type { DomesticHistoryRow } from '@/import/domesticHistory';
import { formatJPY } from '@/domain/money';

export interface CollisionInfo {
  row: DomesticHistoryRow;
  existingCount: number; // 同一キーで既に存在する取引件数
}

interface Props {
  collisions: CollisionInfo[];
  decisions: Map<number, 'keep' | 'skip'>; // row.rowNumber -> 判断
  onDecide: (rowNumber: number, decision: 'keep' | 'skip') => void;
  onSkipAll: () => void;
}

// 仕様書6.2 L179・implement-p2.md 5.1節: 重複衝突は自動スキップせず、行ごとに取込可否を判断させる
export function DuplicateResolver({ collisions, decisions, onDecide, onSkipAll }: Props) {
  if (collisions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 border rounded p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">重複の可能性がある取引({collisions.length}件)</h2>
        <button type="button" className="text-sm underline" onClick={onSkipAll}>
          すべてスキップ
        </button>
      </div>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">約定日</th>
            <th className="p-2">銘柄</th>
            <th className="p-2">売買</th>
            <th className="p-2">数量</th>
            <th className="p-2">単価</th>
            <th className="p-2">受渡金額</th>
            <th className="p-2">既存件数</th>
            <th className="p-2">判断</th>
          </tr>
        </thead>
        <tbody>
          {collisions.map(({ row, existingCount }) => {
            const decision = decisions.get(row.rowNumber);
            return (
              <tr key={row.rowNumber} className="border-b">
                <td className="p-2">{row.tradeDate}</td>
                <td className="p-2">
                  {row.rawSecurityName}
                  {row.securityCode ? `(${row.securityCode})` : ''}
                </td>
                <td className="p-2">{row.side === 'buy' ? '買' : '売'}</td>
                <td className="p-2">{row.quantity}</td>
                <td className="p-2">{row.price}</td>
                <td className="p-2">{formatJPY(row.amount)}</td>
                <td className="p-2">{existingCount}</td>
                <td className="p-2 space-x-2 whitespace-nowrap">
                  <label className="text-xs">
                    <input
                      type="radio"
                      name={`decision-${row.rowNumber}`}
                      checked={decision === 'keep'}
                      onChange={() => onDecide(row.rowNumber, 'keep')}
                    />{' '}
                    取込む
                  </label>
                  <label className="text-xs">
                    <input
                      type="radio"
                      name={`decision-${row.rowNumber}`}
                      checked={decision === 'skip'}
                      onChange={() => onDecide(row.rowNumber, 'skip')}
                    />{' '}
                    スキップ
                  </label>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
