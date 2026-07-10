import type { AccountType, Currency, Trade } from './types';

// 仕様書6.3 L203: 取引記録(Trade)から銘柄+口座区分単位の保有数量を算出する純粋関数。
// ポートフォリオCSV突合専用ではなく、将来のポートフォリオ画面でも再利用可能な一般的な派生計算のため
// import/ではなくdomain/に置く
export function holdingKey(securityId: string, accountType: string): string {
  return `${securityId}::${accountType}`;
}

export function computeHoldingQuantities(trades: Trade[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const trade of trades) {
    const key = holdingKey(trade.securityId, trade.accountType);
    const delta = trade.side === 'buy' ? trade.quantity : -trade.quantity;
    result.set(key, (result.get(key) ?? 0) + delta);
  }
  return result;
}

function compareByDateThenCreated(a: Trade, b: Trade): number {
  const dateCompare = a.tradeDate.localeCompare(b.tradeDate);
  if (dateCompare !== 0) return dateCompare;
  return a.createdAt.localeCompare(b.createdAt);
}

// implement-p3.md 6.2節(F0確認): 移動平均取得単価は口座区分ごとに別々に算出する参考値であり、
// 実現損益の算出(FIFO、domain/fifo.ts)には使わない。買付で加重平均を更新し、売却では
// 平均単価を変えずに数量・原価プールを比例して減らす(数量が尽きたら原価プールもリセットする)
export interface HoldingPosition {
  securityId: string;
  accountType: AccountType;
  quantity: number;
  // 1株(口)あたりの平均取得原価。Trade.amountと同じ単位(JPY: 整数円、USD: 整数セント)の参考値のため
  // 四捨五入して保持する(Trade.priceのような入力値ではなく表示専用の算出値)
  averageCostAmount: number;
  currency: Currency;
}

export function computeAverageCostPositions(trades: Trade[]): HoldingPosition[] {
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

  const positions: HoldingPosition[] = [];
  for (const [key, groupTrades] of groups) {
    const sorted = [...groupTrades].sort(compareByDateThenCreated);
    let quantity = 0;
    let costBasis = 0; // 原価プール(amount単位)
    for (const trade of sorted) {
      if (trade.side === 'buy') {
        quantity += trade.quantity;
        costBasis += trade.amount;
      } else {
        const avgPerUnit = quantity > 0 ? costBasis / quantity : 0;
        quantity -= trade.quantity;
        costBasis -= avgPerUnit * trade.quantity;
        if (quantity <= 0) {
          quantity = Math.max(quantity, 0);
          costBasis = 0;
        }
      }
    }
    if (quantity > 0) {
      const separatorIndex = key.lastIndexOf('::');
      const securityId = key.slice(0, separatorIndex);
      const accountType = key.slice(separatorIndex + 2) as AccountType;
      positions.push({
        securityId,
        accountType,
        quantity,
        averageCostAmount: Math.round(costBasis / quantity),
        currency: sorted[0].currency,
      });
    }
  }
  return positions;
}
