import type { NisaUsage } from './types';

// implement-p3.md 8章: リバランス提案(買付)がNISA枠(年間上限額-利用額)内に収まるかを判定する。
// 該当年・枠種別のNisaUsageが未登録の場合は判定不能としてnullを返す(呼び出し側で「未登録」表示する)
export interface NisaFrameCheck {
  remainingAmount: number; // annualLimit - usedAmount(整数円。マイナスは既に超過)
  fitsWithinFrame: boolean;
}

export function checkNisaFrame(
  estimatedAmountJpy: number,
  year: number,
  frameType: NisaUsage['frameType'],
  nisaUsages: NisaUsage[]
): NisaFrameCheck | null {
  const usage = nisaUsages.find((u) => u.year === year && u.frameType === frameType);
  if (!usage) return null;
  const remainingAmount = usage.annualLimit - usage.usedAmount;
  return { remainingAmount, fitsWithinFrame: estimatedAmountJpy <= remainingAmount };
}
