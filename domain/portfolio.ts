import type { HoldingPosition } from './holdings';
import type { Security, Sector, CashBalance, Currency } from './types';

// implement-p3.md 6.2節: セクター別配分の内訳1行。現金は独立したkindで表現し、
// セクター未設定の銘柄は'no_sector'として集約する(実在しないダミーのSector idを作らないため)
export type SectorAllocationEntryKind = 'sector' | 'no_sector' | 'cash';

export interface SectorAllocationEntry {
  kind: SectorAllocationEntryKind;
  sectorId: string | null; // kind === 'sector' の場合のみ値を持つ
  label: string;
  evaluationAmount: number; // 通貨単位(JPY: 整数円、USD: 整数セント)
  percent: number; // 0〜100。合計評価額が0の場合は0
}

export interface SectorAllocationResult {
  entries: SectorAllocationEntry[]; // evaluationAmount降順
  totalAmount: number;
}

// implement-p3.md 6.2節: 保有評価額(数量×現在値)をセクター単位に集計し、比率を算出する。
// 現金(CashBalance)も一つの区分として含める。通貨(JPY/USD)は合算しない
// (仕様書4.4 C7決定・domain/aggregate.ts等で既に確立している通貨分離の方針を踏襲)。
// currentPriceBySecurityIdに現在値がない銘柄は評価額不明のため集計対象外とする(呼び出し側で警告表示する)
export function computeSectorAllocation(
  positions: HoldingPosition[],
  currentPriceBySecurityId: Map<string, number>,
  securities: Security[],
  sectors: Sector[],
  cashBalance: CashBalance | undefined,
  currency: Currency
): SectorAllocationResult {
  const securityById = new Map(securities.map((s) => [s.id, s]));
  const sectorById = new Map(sectors.map((s) => [s.id, s]));

  interface Accumulator {
    kind: SectorAllocationEntryKind;
    sectorId: string | null;
    label: string;
    amount: number;
  }
  const byKey = new Map<string, Accumulator>();

  function addAmount(kind: SectorAllocationEntryKind, sectorId: string | null, label: string, amount: number) {
    const key = `${kind}:${sectorId ?? ''}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.amount += amount;
    } else {
      byKey.set(key, { kind, sectorId, label, amount });
    }
  }

  for (const position of positions) {
    if (position.currency !== currency) continue;
    const security = securityById.get(position.securityId);
    if (!security) continue;
    const currentPrice = currentPriceBySecurityId.get(position.securityId);
    if (currentPrice === undefined) continue;
    const evaluationAmount = Math.round(position.quantity * currentPrice);
    if (security.sectorId) {
      const sector = sectorById.get(security.sectorId);
      if (sector) {
        addAmount('sector', sector.id, sector.name, evaluationAmount);
        continue;
      }
    }
    addAmount('no_sector', null, 'セクター未設定', evaluationAmount);
  }

  if (cashBalance && cashBalance.amount > 0) {
    addAmount('cash', null, '現金', cashBalance.amount);
  }

  const totalAmount = [...byKey.values()].reduce((sum, e) => sum + e.amount, 0);
  const entries: SectorAllocationEntry[] = [...byKey.values()]
    .map((e) => ({
      kind: e.kind,
      sectorId: e.sectorId,
      label: e.label,
      evaluationAmount: e.amount,
      percent: totalAmount > 0 ? (e.amount / totalAmount) * 100 : 0,
    }))
    .sort((a, b) => b.evaluationAmount - a.evaluationAmount);

  return { entries, totalAmount };
}
