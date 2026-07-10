'use client';

import type { RebalancePlan } from '@/domain/rebalance';
import { formatJPY, formatUSD } from '@/domain/money';
import type { Currency } from '@/domain/types';

function formatAmount(amount: number, currency: Currency): string {
  return currency === 'JPY' ? formatJPY(Math.round(amount)) : formatUSD(Math.round(amount));
}

const KIND_LABEL: Record<RebalancePlan['leaves'][number]['kind'], string> = {
  sector: 'セクター',
  cash: '現金',
  unsupported: '未対応(セクター未設定)',
};

interface Props {
  plan: RebalancePlan;
  hasAllocations: boolean;
  noSellMode: boolean;
  onToggleNoSellMode: (value: boolean) => void;
}

// implement-p3.md 7章: 目標配分との乖離額・乖離率、必要売買数量(単元株数・口数考慮)、
// ノーセルリバランスモードの切替を表示する
export function RebalanceSection({ plan, hasAllocations, noSellMode, onToggleNoSellMode }: Props) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">リバランス計算</h2>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={noSellMode}
          onChange={(e) => onToggleNoSellMode(e.target.checked)}
        />
        売却なし・買付のみ(ノーセルリバランス)
      </label>

      {plan.fxRateMissing && (
        <p className="text-sm text-amber-700">
          ※USD建ての資産・現金がありますが、為替レートが未登録のためJPY換算に含められませんでした。
        </p>
      )}

      {!hasAllocations ? (
        <p className="text-sm text-gray-500">目標配分が未登録のため、リバランス計算はできません。</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">区分</th>
              <th className="p-2">目標比率</th>
              <th className="p-2">現在比率</th>
              <th className="p-2">乖離額(JPY)</th>
              <th className="p-2">乖離率</th>
              <th className="p-2">必要売買数量</th>
            </tr>
          </thead>
          <tbody>
            {plan.leaves.map((leaf) => (
              <tr key={`${leaf.kind}:${leaf.sectorId ?? leaf.label}`} className="border-b align-top">
                <td className="p-2">
                  {leaf.label}
                  <span className="text-xs text-gray-500"> ({KIND_LABEL[leaf.kind]})</span>
                </td>
                <td className="p-2">{leaf.effectiveTargetPercent.toFixed(1)}%</td>
                <td className="p-2">{leaf.currentPercent.toFixed(1)}%</td>
                <td className="p-2">{formatJPY(Math.round(leaf.deviationAmountJpy))}</td>
                <td className="p-2">{leaf.deviationPercent.toFixed(1)}%</td>
                <td className="p-2">
                  {leaf.actions.length === 0 ? (
                    '—'
                  ) : (
                    <ul className="space-y-0.5">
                      {leaf.actions.map((action) => (
                        <li key={action.securityId}>
                          {action.side === 'buy' ? '買付' : '売却'} {action.securityName} {action.quantity}株/口(概算
                          {formatAmount(action.estimatedAmount, action.currency)})
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
