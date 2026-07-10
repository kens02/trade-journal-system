import type { Trade, Security, TradeRuleLink, TradeMatch, AccountType, Adherence } from './types';
import { formatJPY, formatUSD } from './money';
import { buildCsvContent, buildCsvFilename } from './csv';

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

function formatAmount(amount: number, currency: 'JPY' | 'USD'): string {
  return currency === 'JPY' ? formatJPY(amount) : formatUSD(amount);
}

const HEADER = [
  '約定日',
  '銘柄コード',
  '銘柄名',
  '口座区分',
  '売買',
  '数量',
  '単価',
  '受渡金額',
  '通貨',
  '実現損益',
  '適用ルール',
  'ルールバージョン',
  '遵守評価',
  'メモ',
];

export interface TradeCsvRuleDisplay {
  ruleName: string;
  version: number;
}

// implement-p4.md 5.1節(F0確認: 金額は表示用フォーマット済み文字列で出力)。
// app/trades/TradeList.tsxの表示項目に準拠したCSV生成
export function buildTradeCsv(
  trades: Trade[],
  securitiesById: Map<string, Security>,
  linksByTradeId: Map<string, TradeRuleLink>,
  ruleDisplayByVersionId: Map<string, TradeCsvRuleDisplay>,
  matchesBySellTradeId: Map<string, TradeMatch[]>
): string {
  const rows = trades.map((trade) => {
    const security = securitiesById.get(trade.securityId);
    const link = linksByTradeId.get(trade.id);
    const ruleDisplay = link ? ruleDisplayByVersionId.get(link.ruleVersionId) : undefined;
    const matches = trade.side === 'sell' ? (matchesBySellTradeId.get(trade.id) ?? []) : [];
    const realizedPnlTotal = matches.reduce((sum, m) => sum + m.realizedPnl, 0);

    return [
      trade.tradeDate,
      security?.code ?? '',
      security?.name ?? '(不明な銘柄)',
      ACCOUNT_LABEL[trade.accountType],
      trade.side === 'buy' ? '買' : '売',
      String(trade.quantity),
      String(trade.price),
      formatAmount(trade.amount, trade.currency),
      trade.currency,
      trade.side === 'sell' ? formatAmount(realizedPnlTotal, trade.currency) : '',
      ruleDisplay?.ruleName ?? '',
      ruleDisplay ? `v${ruleDisplay.version}` : '',
      link ? ADHERENCE_LABEL[link.adherence] : '',
      trade.note,
    ];
  });
  return buildCsvContent(HEADER, rows);
}

export function buildTradeCsvFilename(exportedAt: Date): string {
  return buildCsvFilename('trades', exportedAt);
}
