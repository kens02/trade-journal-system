'use client';

import type { ReconciliationWarning } from '@/import/portfolio';

const ACCOUNT_LABEL: Record<string, string> = {
  specific: '特定',
  nisa_growth: 'NISA(成長)',
  nisa_tsumitate: 'NISA(つみたて)',
  old_nisa: '旧NISA',
};

const FIELD_LABEL: Record<ReconciliationWarning['field'], string> = {
  evaluationAmount: '評価額',
  pnl: '含み損益',
};

export interface HoldingDiscrepancyDisplay {
  securityId: string;
  securityName: string;
  accountType: string;
  csvQuantity: number;
  computedQuantity: number;
  difference: number;
}

interface Props {
  reconciliationWarnings: ReconciliationWarning[];
  holdingDiscrepancies: HoldingDiscrepancyDisplay[];
}

// 仕様書6.3 L201-203・implement-p2.md 5.2節: 合計ブロック突合警告+保有数量差異レポート
export function PortfolioReconciliationReport({ reconciliationWarnings, holdingDiscrepancies }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold mb-2">合計ブロック突合</h2>
        {reconciliationWarnings.length === 0 ? (
          <p className="text-sm text-gray-500">すべてのセクションで明細合計と一致しました。</p>
        ) : (
          <ul className="text-sm text-red-600 list-disc pl-5">
            {reconciliationWarnings.map((w, i) => (
              <li key={i}>
                {w.sectionTitle}: {FIELD_LABEL[w.field]}が一致しません(明細合計 {w.computed} / CSV記載 {w.expected})
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="font-bold mb-2">保有数量差異レポート</h2>
        {holdingDiscrepancies.length === 0 ? (
          <p className="text-sm text-gray-500">取引記録から算出した保有数量とCSVの保有数量に差異はありません。</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">銘柄</th>
                <th className="p-2">口座</th>
                <th className="p-2">CSV保有数量</th>
                <th className="p-2">取引記録からの算出数量</th>
                <th className="p-2">差異</th>
              </tr>
            </thead>
            <tbody>
              {holdingDiscrepancies.map((d, i) => (
                <tr key={i} className="border-b">
                  <td className="p-2">{d.securityName}</td>
                  <td className="p-2">{ACCOUNT_LABEL[d.accountType] ?? d.accountType}</td>
                  <td className="p-2">{d.csvQuantity}</td>
                  <td className="p-2">{d.computedQuantity}</td>
                  <td className="p-2">{d.difference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
