import type { Trade, TradeMatch } from './types';
import { holdingKey } from './holdings';

// implement-p2.md 6.1: グルーピングキーはsecurityId+accountType。domain/holdings.tsのholdingKeyを再利用する。
// 口座区分をまたぐマッチングは行わない(NISAの売却が特定口座の買付を消費することは制度上あり得ないため)。
// この決定は仕様書に明記がないため、根拠としてここに記載する。

export interface UnresolvedSell {
  sellTradeId: string;
  unmatchedQuantity: number; // 買付残が不足し解消できなかった数量
}

export interface FifoRecomputeResult {
  matches: TradeMatch[]; // method: 'fifo_auto' のみ。呼び出し側で既存のfifo_autoと差し替える
  unresolvedSells: UnresolvedSell[];
}

function newMatchId(): string {
  return crypto.randomUUID();
}

function compareTrades(a: Trade, b: Trade): number {
  const dateCompare = a.tradeDate.localeCompare(b.tradeDate);
  if (dateCompare !== 0) return dateCompare;
  return a.createdAt.localeCompare(b.createdAt);
}

// 仕様書6.1: 按分は数量比で行い、端数(円/セント)は最後のマッチに寄せる(按分合計=元金額を保証)。
// 取引の消費(cumQtyBefore→cumQtyBefore+matchQty)を累積の差分として計算することで、
// 過去に確定した配分(手動マッチ含む)を後から変えずに、複数マッチへの端数寄せを実現する。
export function allocateByQuantity(
  poolAmount: number,
  poolQuantity: number,
  cumQtyBefore: number,
  matchQty: number
): number {
  if (poolQuantity === 0) return 0;
  const before = Math.floor((poolAmount * cumQtyBefore) / poolQuantity);
  const after = Math.floor((poolAmount * (cumQtyBefore + matchQty)) / poolQuantity);
  return after - before;
}

// implement-p2.md 6.1: 同一グループ(securityId+accountType)ごとに取引をまとめる。
// 口座区分が異なれば別グループとなり、FIFOマッチングは互いに影響しない。
export function groupTradesByKey(trades: Trade[]): Map<string, Trade[]> {
  const groups = new Map<string, Trade[]>();
  for (const trade of trades) {
    const key = holdingKey(trade.securityId, trade.accountType);
    const list = groups.get(key);
    if (list) {
      list.push(trade);
    } else {
      groups.set(key, [trade]);
    }
  }
  return groups;
}

function sumManualQuantity(
  matches: TradeMatch[],
  tradeIdField: 'buyTradeId' | 'sellTradeId',
  tradeId: string
): number {
  return matches
    .filter((m) => m.method === 'manual' && m[tradeIdField] === tradeId)
    .reduce((sum, m) => sum + m.quantity, 0);
}

interface BuyState {
  trade: Trade;
  remainingQty: number; // 自動マッチプール内の残数量
  autoPoolQty: number; // 自動マッチプールの全体数量(= 初期のremainingQty)
  autoAmountBase: number; // 自動マッチプールに割り当てられる金額
  consumedSoFar: number; // 自動マッチプール内で既に消費した数量
}

// implement-p2.md 6.1: 同一グループの取引を受け取りfifo_autoマッチを再計算する純粋関数。
// groupTradesは呼び出し側で同一グループ(securityId+accountType)に絞り込み済みであること(本関数はグルーピングしない)。
// manualMatchesはこのグループに属する既存のmethod:'manual'マッチのみを渡すこと。
// 手動マッチ済み数量は自動マッチのプールから除外し(自動マッチはmanualマッチを一切変更しない)、
// 残数量に対してのみ約定日昇順(同日はcreatedAt昇順)でFIFO消費する。
export function computeFifoMatchesForGroup(
  groupTrades: Trade[],
  manualMatches: TradeMatch[]
): FifoRecomputeResult {
  const sorted = [...groupTrades].sort(compareTrades);
  const buys = sorted.filter((t) => t.side === 'buy');
  const sells = sorted.filter((t) => t.side === 'sell');

  const buyQueue: BuyState[] = buys.map((trade) => {
    const manualQty = sumManualQuantity(manualMatches, 'buyTradeId', trade.id);
    const autoPoolQty = trade.quantity - manualQty;
    return {
      trade,
      remainingQty: autoPoolQty,
      autoPoolQty,
      autoAmountBase: Math.round((trade.amount * autoPoolQty) / trade.quantity),
      consumedSoFar: 0,
    };
  });

  const matches: TradeMatch[] = [];
  const unresolvedSells: UnresolvedSell[] = [];
  const now = new Date().toISOString();

  for (const sell of sells) {
    const manualQty = sumManualQuantity(manualMatches, 'sellTradeId', sell.id);
    const sellAutoPoolQty = sell.quantity - manualQty;
    const sellAutoAmountBase = Math.round((sell.amount * sellAutoPoolQty) / sell.quantity);
    let sellConsumedSoFar = 0;
    let sellRemaining = sellAutoPoolQty;

    for (const buyState of buyQueue) {
      if (sellRemaining <= 0) break;
      if (buyState.remainingQty <= 0) continue;

      const matchQty = Math.min(sellRemaining, buyState.remainingQty);

      const buyAlloc = allocateByQuantity(
        buyState.autoAmountBase,
        buyState.autoPoolQty,
        buyState.consumedSoFar,
        matchQty
      );
      const sellAlloc = allocateByQuantity(sellAutoAmountBase, sellAutoPoolQty, sellConsumedSoFar, matchQty);

      matches.push({
        id: newMatchId(),
        sellTradeId: sell.id,
        buyTradeId: buyState.trade.id,
        quantity: matchQty,
        realizedPnl: sellAlloc - buyAlloc,
        currency: sell.currency,
        method: 'fifo_auto',
        createdAt: now,
      });

      buyState.consumedSoFar += matchQty;
      buyState.remainingQty -= matchQty;
      sellConsumedSoFar += matchQty;
      sellRemaining -= matchQty;
    }

    if (sellRemaining > 0) {
      unresolvedSells.push({ sellTradeId: sell.id, unmatchedQuantity: sellRemaining });
    }
  }

  return { matches, unresolvedSells };
}
