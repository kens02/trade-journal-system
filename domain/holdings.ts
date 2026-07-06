import type { Trade } from './types';

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
