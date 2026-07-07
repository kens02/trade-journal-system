'use client';

import type { TradeImportableRow } from './TradeImportClient';
import { formatJPY, formatUSD } from '@/domain/money';

const ACCOUNT_LABEL: Record<string, string> = {
  specific: '特定',
  nisa_growth: 'NISA(成長)',
  nisa_tsumitate: 'NISA(つみたて)',
  old_nisa: '旧NISA',
};

interface Props {
  rows: TradeImportableRow[];
  errors: { rowNumber?: number; message: string }[];
}

// implement-p2.md 5.3節画面D: 先頭20行のプレビュー表示
export function ImportPreviewTable({ rows, errors }: Props) {
  const preview = rows.slice(0, 20);

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600">
        {rows.length}行を解釈しました(先頭{preview.length}行を表示)。
        {errors.length > 0 && ` エラー${errors.length}件`}
      </p>
      {errors.length > 0 && (
        <ul className="text-sm text-red-600 list-disc pl-5">
          {errors.map((e, i) => (
            <li key={i}>
              {e.rowNumber ? `${e.rowNumber}行目: ` : ''}
              {e.message}
            </li>
          ))}
        </ul>
      )}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">約定日</th>
            <th className="p-2">銘柄</th>
            <th className="p-2">売買</th>
            <th className="p-2">口座</th>
            <th className="p-2">数量</th>
            <th className="p-2">単価</th>
            <th className="p-2">受渡金額</th>
          </tr>
        </thead>
        <tbody>
          {preview.map((row) => (
            <tr key={row.rowNumber} className="border-b">
              <td className="p-2">{row.tradeDate}</td>
              <td className="p-2">
                {row.rawSecurityName}
                {row.securityCode ? `(${row.securityCode})` : ''}
              </td>
              <td className="p-2">{row.side === 'buy' ? '買' : '売'}</td>
              <td className="p-2">{ACCOUNT_LABEL[row.accountType]}</td>
              <td className="p-2">{row.quantity}</td>
              <td className="p-2">{row.price}</td>
              <td className="p-2">
                {row.currency === 'JPY' ? formatJPY(row.amount) : formatUSD(row.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
