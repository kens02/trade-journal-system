'use client';

import { Fragment, useState } from 'react';
import type { Trade, Security, TradeRuleLink, TradeMatch, AccountType, Adherence } from '@/domain/types';
import { formatJPY, formatUSD } from '@/domain/money';

export interface RuleDisplay {
  ruleName: string;
  version: number;
}

export interface SetManualMatchInput {
  sellTradeId: string;
  buyTradeId: string;
  quantity: number;
  replaceMatchId?: string;
}

interface Props {
  trades: Trade[];
  securitiesById: Map<string, Security>;
  linksByTradeId: Map<string, TradeRuleLink>;
  ruleDisplayByVersionId: Map<string, RuleDisplay>;
  matchesBySellTradeId: Map<string, TradeMatch[]>;
  onEdit: (trade: Trade) => void;
  onDelete: (tradeId: string) => void;
  onSetManualMatch: (input: SetManualMatchInput) => Promise<void>;
  onDeleteManualMatch: (matchId: string) => Promise<void>;
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

const COLUMN_COUNT = 11;

function formatAmount(amount: number, currency: 'JPY' | 'USD'): string {
  return currency === 'JPY' ? formatJPY(amount) : formatUSD(amount);
}

// implement-p2.md 6.2: 売却に対するマッチ先買付の変更(候補=同グループ内の買付)と数量指定
function ManualMatchEditor({
  candidateBuys,
  initialBuyTradeId,
  initialQuantity,
  onSubmit,
  onCancel,
}: {
  candidateBuys: Trade[];
  initialBuyTradeId: string;
  initialQuantity: number;
  onSubmit: (input: { buyTradeId: string; quantity: number }) => Promise<void>;
  onCancel: () => void;
}) {
  const [buyTradeId, setBuyTradeId] = useState(initialBuyTradeId || candidateBuys[0]?.id || '');
  const [quantity, setQuantity] = useState(String(initialQuantity || ''));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    const qty = Number(quantity);
    if (!buyTradeId || !Number.isInteger(qty) || qty <= 0) {
      setError('買付と数量(1以上の整数)を指定してください。');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ buyTradeId, quantity: qty });
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        className="border rounded px-1 py-0.5"
        value={buyTradeId}
        onChange={(e) => setBuyTradeId(e.target.value)}
      >
        {candidateBuys.map((b) => (
          <option key={b.id} value={b.id}>
            {b.tradeDate}({b.quantity}株)
          </option>
        ))}
      </select>
      <input
        type="text"
        inputMode="numeric"
        className="border rounded px-1 py-0.5 w-16"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
      />
      <button
        type="button"
        className="text-blue-600 underline"
        onClick={handleSave}
        disabled={submitting}
      >
        保存
      </button>
      <button type="button" className="underline" onClick={onCancel}>
        キャンセル
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}

// implement-p1.md 5章画面A: 一覧は約定日降順
export function TradeList({
  trades,
  securitiesById,
  linksByTradeId,
  ruleDisplayByVersionId,
  matchesBySellTradeId,
  onEdit,
  onDelete,
  onSetManualMatch,
  onDeleteManualMatch,
}: Props) {
  const [expandedSellId, setExpandedSellId] = useState<string | null>(null);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);

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
          <th className="p-2">実現損益</th>
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

          // implement-p2.md 6.3: 売却行に実現損益を表示。未解消数量があれば警告を併記する
          const matches = trade.side === 'sell' ? (matchesBySellTradeId.get(trade.id) ?? []) : [];
          const matchedQty = matches.reduce((sum, m) => sum + m.quantity, 0);
          const realizedPnlTotal = matches.reduce((sum, m) => sum + m.realizedPnl, 0);
          const unmatchedQty = trade.side === 'sell' ? trade.quantity - matchedQty : 0;
          const isExpanded = expandedSellId === trade.id;

          const candidateBuys = trades
            .filter(
              (t) =>
                t.side === 'buy' && t.securityId === trade.securityId && t.accountType === trade.accountType
            )
            .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));

          return (
            <Fragment key={trade.id}>
              <tr className="border-b">
                <td className="p-2">{trade.tradeDate}</td>
                <td className="p-2">{security?.name ?? '(不明な銘柄)'}</td>
                <td className="p-2">{trade.side === 'buy' ? '買' : '売'}</td>
                <td className="p-2">{ACCOUNT_LABEL[trade.accountType]}</td>
                <td className="p-2">{trade.quantity}</td>
                <td className="p-2">{trade.price}</td>
                <td className="p-2">{formatAmount(trade.amount, trade.currency)}</td>
                <td className="p-2">
                  {trade.side === 'sell' ? (
                    <span className={realizedPnlTotal >= 0 ? 'text-green-700' : 'text-red-700'}>
                      {formatAmount(realizedPnlTotal, trade.currency)}
                    </span>
                  ) : (
                    '—'
                  )}
                  {unmatchedQty > 0 && (
                    <span className="ml-1 text-amber-600" title={`未解消数量: ${unmatchedQty}`}>
                      ⚠未解消{unmatchedQty}
                    </span>
                  )}
                </td>
                <td className="p-2">
                  {ruleDisplay ? `${ruleDisplay.ruleName} (v${ruleDisplay.version})` : 'ルールなし'}
                </td>
                <td className="p-2">{link ? ADHERENCE_LABEL[link.adherence] : '—'}</td>
                <td className="p-2 space-x-2 whitespace-nowrap">
                  <button type="button" className="text-blue-600 underline" onClick={() => onEdit(trade)}>
                    編集
                  </button>
                  {trade.side === 'sell' && (
                    <button
                      type="button"
                      className="text-gray-700 underline"
                      onClick={() => {
                        setExpandedSellId(isExpanded ? null : trade.id);
                        setEditingMatchId(null);
                      }}
                    >
                      マッチ内訳
                    </button>
                  )}
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
              {isExpanded && (
                <tr>
                  <td colSpan={COLUMN_COUNT} className="p-2 bg-gray-50">
                    {matches.length === 0 ? (
                      <p className="text-xs text-gray-500">マッチなし(未解消)。買付を登録すると自動的にマッチします。</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left">
                            <th className="p-1">買付日</th>
                            <th className="p-1">数量</th>
                            <th className="p-1">損益</th>
                            <th className="p-1">方式</th>
                            <th className="p-1">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matches.map((match) => {
                            const buyTrade = trades.find((t) => t.id === match.buyTradeId);
                            const isEditingThis = editingMatchId === match.id;
                            return (
                              <tr key={match.id} className="border-t">
                                {isEditingThis ? (
                                  <td colSpan={5} className="p-1">
                                    <ManualMatchEditor
                                      candidateBuys={candidateBuys}
                                      initialBuyTradeId={match.buyTradeId}
                                      initialQuantity={match.quantity}
                                      onCancel={() => setEditingMatchId(null)}
                                      onSubmit={async ({ buyTradeId, quantity }) => {
                                        await onSetManualMatch({
                                          sellTradeId: trade.id,
                                          buyTradeId,
                                          quantity,
                                          replaceMatchId: match.id,
                                        });
                                        setEditingMatchId(null);
                                      }}
                                    />
                                  </td>
                                ) : (
                                  <>
                                    <td className="p-1">{buyTrade?.tradeDate ?? '(不明)'}</td>
                                    <td className="p-1">{match.quantity}</td>
                                    <td className="p-1">{formatAmount(match.realizedPnl, match.currency)}</td>
                                    <td className="p-1">
                                      {match.method === 'manual' ? '手動' : '自動'}
                                    </td>
                                    <td className="p-1 space-x-2 whitespace-nowrap">
                                      <button
                                        type="button"
                                        className="text-blue-600 underline"
                                        onClick={() => setEditingMatchId(match.id)}
                                      >
                                        編集
                                      </button>
                                      {match.method === 'manual' && (
                                        <button
                                          type="button"
                                          className="text-red-600 underline"
                                          onClick={() => onDeleteManualMatch(match.id)}
                                        >
                                          手動マッチ解除
                                        </button>
                                      )}
                                    </td>
                                  </>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
