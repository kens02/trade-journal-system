import { describe, it, expect } from 'vitest';
import { validateTargetAllocationTotals, buildRebalancePlan } from '@/domain/rebalance';
import type { HoldingPosition } from '@/domain/holdings';
import type { Security, TargetAllocation, CashBalance } from '@/domain/types';

function makeSecurity(overrides: Partial<Security> & Pick<Security, 'id'>): Security {
  return {
    code: null,
    name: '銘柄',
    normalizedName: '銘柄',
    productType: 'jp_stock',
    currency: 'JPY',
    market: null,
    createdAt: '',
    aliases: [],
    sectorId: null,
    unitShareQuantity: null,
    ...overrides,
  };
}

function makePosition(overrides: Partial<HoldingPosition> & Pick<HoldingPosition, 'securityId'>): HoldingPosition {
  return {
    accountType: 'specific',
    quantity: 0,
    averageCostAmount: 0,
    currency: 'JPY',
    ...overrides,
  };
}

function makeAllocation(overrides: Partial<TargetAllocation> & Pick<TargetAllocation, 'id'>): TargetAllocation {
  return {
    label: '',
    level: 'asset_class',
    parentId: null,
    targetPercent: 0,
    sectorId: null,
    createdAt: '',
    ...overrides,
  };
}

describe('validateTargetAllocationTotals', () => {
  it('同一parentId配下の合計が100%であればエラーなし', () => {
    const allocations: TargetAllocation[] = [
      makeAllocation({ id: 'a1', label: '国内株式', targetPercent: 60 }),
      makeAllocation({ id: 'a2', label: '現金', targetPercent: 40 }),
      makeAllocation({ id: 's1', level: 'sector', parentId: 'a1', targetPercent: 100 }),
    ];
    expect(validateTargetAllocationTotals(allocations)).toHaveLength(0);
  });

  it('合計が100%でないグループをエラーとして報告する', () => {
    const allocations: TargetAllocation[] = [
      makeAllocation({ id: 'a1', label: '国内株式', targetPercent: 60 }),
      makeAllocation({ id: 'a2', label: '現金', targetPercent: 30 }),
    ];
    const errors = validateTargetAllocationTotals(allocations);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({ parentId: null, total: 90 });
  });

  it('子を持たないアセットクラスは検証対象外(グループが存在しない)', () => {
    const allocations: TargetAllocation[] = [makeAllocation({ id: 'a1', label: '現金', targetPercent: 100 })];
    expect(validateTargetAllocationTotals(allocations)).toHaveLength(0);
  });
});

describe('buildRebalancePlan', () => {
  it('セクター別の乖離額・乖離率を手計算通りに算出する', () => {
    // アセットクラス「国内株式」100% → セクター「情報通信」100%(実効100%)
    const allocations: TargetAllocation[] = [
      makeAllocation({ id: 'ac1', label: '国内株式', targetPercent: 100 }),
      makeAllocation({ id: 'sec1', level: 'sector', parentId: 'ac1', sectorId: 'sector-a', targetPercent: 100 }),
    ];
    const securities: Security[] = [makeSecurity({ id: 'security-1', sectorId: 'sector-a' })];
    const positions: HoldingPosition[] = [makePosition({ securityId: 'security-1', quantity: 10 })];
    const currentPriceBySecurityId = new Map([['security-1', 1000]]); // 評価額10,000円

    const plan = buildRebalancePlan({
      allocations,
      positions,
      currentPriceBySecurityId,
      securities,
      sectors: [],
      cashBalances: [],
      usdJpyRate: null,
      noSellMode: false,
    });

    expect(plan.totalPortfolioValueJpy).toBe(10000);
    expect(plan.leaves).toHaveLength(1);
    expect(plan.leaves[0].currentValueJpy).toBe(10000);
    expect(plan.leaves[0].effectiveTargetPercent).toBe(100);
    expect(plan.leaves[0].deviationAmountJpy).toBe(0);
    expect(plan.leaves[0].deviationPercent).toBe(0);
  });

  it('現金(ラベル一致・子なし)の評価額をCashBalanceから算出する', () => {
    const allocations: TargetAllocation[] = [
      makeAllocation({ id: 'ac1', label: '現金', targetPercent: 100 }),
    ];
    const cashBalances: CashBalance[] = [{ currency: 'JPY', amount: 30000, updatedAt: '' }];

    const plan = buildRebalancePlan({
      allocations,
      positions: [],
      currentPriceBySecurityId: new Map(),
      securities: [],
      sectors: [],
      cashBalances,
      usdJpyRate: null,
      noSellMode: false,
    });

    expect(plan.totalPortfolioValueJpy).toBe(30000);
    expect(plan.leaves[0]).toMatchObject({ kind: 'cash', currentValueJpy: 30000, currentPercent: 100 });
  });

  it('セクター子を持たない現金以外のアセットクラスは0円固定(unsupported)とする', () => {
    const allocations: TargetAllocation[] = [
      makeAllocation({ id: 'ac1', label: 'セクター未設定の国内株式', targetPercent: 100 }),
    ];
    const plan = buildRebalancePlan({
      allocations,
      positions: [],
      currentPriceBySecurityId: new Map(),
      securities: [],
      sectors: [],
      cashBalances: [],
      usdJpyRate: null,
      noSellMode: false,
    });
    expect(plan.leaves[0]).toMatchObject({ kind: 'unsupported', currentValueJpy: 0 });
  });

  it('必要買付数量を単元株数の倍数に切り上げて算出する', () => {
    const allocations: TargetAllocation[] = [
      makeAllocation({ id: 'ac1', label: '国内株式', targetPercent: 100 }),
      makeAllocation({ id: 'sec1', level: 'sector', parentId: 'ac1', sectorId: 'sector-a', targetPercent: 100 }),
    ];
    // 現在: 銘柄1(セクターA)10,000円のみ。目標100% = 全額このセクター。
    // 現金5,000円があるため総額15,000円、セクターAの目標は15,000円 → 不足5,000円(要買付)
    const securities: Security[] = [
      makeSecurity({ id: 'security-1', sectorId: 'sector-a', unitShareQuantity: 100 }),
    ];
    const positions: HoldingPosition[] = [makePosition({ securityId: 'security-1', quantity: 10 })];
    const currentPriceBySecurityId = new Map([['security-1', 1000]]);
    const cashBalances: CashBalance[] = [{ currency: 'JPY', amount: 5000, updatedAt: '' }];

    const plan = buildRebalancePlan({
      allocations,
      positions,
      currentPriceBySecurityId,
      securities,
      sectors: [],
      cashBalances,
      usdJpyRate: null,
      noSellMode: false,
    });

    const sectorLeaf = plan.leaves.find((l) => l.kind === 'sector')!;
    expect(sectorLeaf.deviationAmountJpy).toBe(-5000); // 10,000 - 15,000
    expect(sectorLeaf.actions).toHaveLength(1);
    // 概算数量 = 5,000円 / 1,000円 = 5株 → 単元株数100の倍数に切り上げ = 100株
    expect(sectorLeaf.actions[0]).toMatchObject({ side: 'buy', quantity: 100, securityId: 'security-1' });
  });

  it('ノーセルリバランスモードでは超過セクターの売却提案が出ない', () => {
    const allocations: TargetAllocation[] = [
      makeAllocation({ id: 'ac1', label: '国内株式', targetPercent: 50 }),
      makeAllocation({ id: 'ac2', label: '現金', targetPercent: 50 }),
      makeAllocation({ id: 'sec1', level: 'sector', parentId: 'ac1', sectorId: 'sector-a', targetPercent: 100 }),
    ];
    // セクターAが20,000円、現金0円 → 総額20,000円。目標: セクターA=50%(10,000円)、現金=50%(10,000円)
    // セクターAは10,000円超過(要売却)
    const securities: Security[] = [
      makeSecurity({ id: 'security-1', sectorId: 'sector-a', unitShareQuantity: 1 }),
    ];
    const positions: HoldingPosition[] = [makePosition({ securityId: 'security-1', quantity: 20 })];
    const currentPriceBySecurityId = new Map([['security-1', 1000]]);

    const planNoSell = buildRebalancePlan({
      allocations,
      positions,
      currentPriceBySecurityId,
      securities,
      sectors: [],
      cashBalances: [],
      usdJpyRate: null,
      noSellMode: true,
    });
    const sectorLeafNoSell = planNoSell.leaves.find((l) => l.kind === 'sector')!;
    expect(sectorLeafNoSell.deviationAmountJpy).toBe(10000);
    expect(sectorLeafNoSell.actions).toHaveLength(0);

    const planNormal = buildRebalancePlan({
      allocations,
      positions,
      currentPriceBySecurityId,
      securities,
      sectors: [],
      cashBalances: [],
      usdJpyRate: null,
      noSellMode: false,
    });
    const sectorLeafNormal = planNormal.leaves.find((l) => l.kind === 'sector')!;
    expect(sectorLeafNormal.actions).toHaveLength(1);
    expect(sectorLeafNormal.actions[0].side).toBe('sell');
  });

  it('USD建て資産はUSD/JPYレートで換算し、レート未登録時はfxRateMissingを立てる', () => {
    const allocations: TargetAllocation[] = [
      makeAllocation({ id: 'ac1', label: '米国株式', targetPercent: 100 }),
      makeAllocation({ id: 'sec1', level: 'sector', parentId: 'ac1', sectorId: 'sector-us', targetPercent: 100 }),
    ];
    const securities: Security[] = [
      makeSecurity({ id: 'security-us', sectorId: 'sector-us', currency: 'USD' }),
    ];
    const positions: HoldingPosition[] = [
      makePosition({ securityId: 'security-us', quantity: 10, currency: 'USD' }),
    ];
    const currentPriceBySecurityId = new Map([['security-us', 10000]]); // 100.00ドル(セント単位)

    const withoutRate = buildRebalancePlan({
      allocations,
      positions,
      currentPriceBySecurityId,
      securities,
      sectors: [],
      cashBalances: [],
      usdJpyRate: null,
      noSellMode: false,
    });
    expect(withoutRate.fxRateMissing).toBe(true);
    expect(withoutRate.totalPortfolioValueJpy).toBe(0);

    const withRate = buildRebalancePlan({
      allocations,
      positions,
      currentPriceBySecurityId,
      securities,
      sectors: [],
      cashBalances: [],
      usdJpyRate: 150,
      noSellMode: false,
    });
    // 10株 × 100.00ドル = 1,000ドル → ×150円 = 150,000円
    expect(withRate.fxRateMissing).toBe(false);
    expect(withRate.totalPortfolioValueJpy).toBe(150000);
  });
});
