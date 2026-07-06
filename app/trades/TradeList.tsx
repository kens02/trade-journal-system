'use client';

import type { Trade, Security, TradeRuleLink, AccountType, Adherence } from '@/domain/types';
import { formatJPY, formatUSD } from '@/domain/money';

export interface RuleDisplay {
  ruleName: string;
  version: number;
}

interface Props {
  trades: Trade[];
  securitiesById: Map<string, Security>;
  linksByTradeId: Map<string, TradeRuleLink>;
  ruleDisplayByVersionId: Map<string, RuleDisplay>;
  onEdit: (trade: Trade) => void;
  onDelete: (tradeId: string) => void;
}

const ACCOUNT_LABEL: Record<AccountType, string> = {
  specific: '特定',
  nisa_growth: 'NISA(成長)',
  nisa_tsumitate: 'NISA(つみたて)',
  old_nisa: '旧NISA',
};

const ADHERENCE_LABEL: Record<Adherence, string> = {
  followed: '遵守',
  partial: '一部逸脱',
  deviated: '逸脱',
};

// implement-p1.md 5章画面A: 一覧は約定日降順
export function TradeList({
  trades,
  securitiesById,
  linksByTradeId,
  ruleDisplayByVersionId,
  onEdit,
  onDelete,
}: Props) {
  const sorted = [...trades].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));

  if (sorted.length === 0) {
    return <p className="text-sm text-gray-500">登録された取引はまだありません。</p>;
  }

  return (
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
          <th className="p-2">適用ルール</th>
          <th className="p-2">遵守評価</th>
          <th className="p-2">操作</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((trade) => {
          const security = securitiesById.get(trade.securityId);
          const link = linksByTradeId.get(trade.id);
          const ruleDisplay = link ? ruleDisplayByVersionId.get(link.ruleVersionId) : undefined;
          return (
            <tr key={trade.id} className="border-b">
              <td className="p-2">{trade.tradeDate}</td>
              <td className="p-2">{security?.name ?? '(不明な銘柄)'}</td>
              <td className="p-2">{trade.side === 'buy' ? '買' : '売'}</td>
              <td className="p-2">{ACCOUNT_LABEL[trade.accountType]}</td>
              <td className="p-2">{trade.quantity}</td>
              <td className="p-2">{trade.price}</td>
              <td className="p-2">
                {trade.currency === 'JPY' ? formatJPY(trade.amount) : formatUSD(trade.amount)}
              </td>
              <td className="p-2">
                {ruleDisplay ? `${ruleDisplay.ruleName} (v${ruleDisplay.version})` : 'ルールなし'}
              </td>
              <td className="p-2">{link ? ADHERENCE_LABEL[link.adherence] : '—'}</td>
              <td className="p-2 space-x-2 whitespace-nowrap">
                <button type="button" className="text-blue-600 underline" onClick={() => onEdit(trade)}>
                  編集
                </button>
                <button
                  type="button"
                  className="text-red-600 underline"
                  onClick={() => {
                    if (window.confirm('この取引を削除しますか?')) {
                      onDelete(trade.id);
                    }
                  }}
                >
                  削除
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
