import type { HoldingPosition } from './holdings';
import type { Security, Sector, CashBalance, TargetAllocation, Currency } from './types';

// implement-p3.md 7章: 目標配分(アセットクラス→セクター)の管理・乖離計算・必要売買数量・
// ノーセルリバランスモードを実装する純粋関数群。
//
// F0確認事項(ユーザー回答):
// - 「現金」はアセットクラスのlabelが完全一致する文字列("現金")かつセクター子を持たない場合に、
//   CashBalance(JPY+USD。USDはFxRateでJPY換算)の評価額と対応付ける
// - セクター子を持たないアセットクラス(現金以外)は現在評価額を対応付ける手段がないため、
//   常に0円固定として扱い、呼び出し側で警告表示する('unsupported')
//
// 目標配分はネスト構造(同一parentId配下の合計が100%になる制約)のため、セクター葉の
// ポートフォリオ全体に対する実効目標比率は「親アセットクラスの比率 × セクター自身の比率」で算出する。
// 通貨(JPY/USD)混在のポートフォリオを1つの比率で扱う必要があるため、本計算のみ例外的にUSD建て
// 資産をFxRate(USD/JPY)でJPY換算する(F2/F4で確立した「通貨は合算しない」方針とは異なる、
// リバランス計算固有の要件)

export type RebalanceLeafKind = 'sector' | 'cash' | 'unsupported';

export interface RebalanceAction {
  securityId: string;
  securityName: string;
  side: 'buy' | 'sell';
  quantity: number; // 単元株数/口数の倍数に丸めた概算数量
  estimatedAmount: number; // 概算金額(証券自身の通貨のamount単位。JPY: 整数円、USD: 整数セント)
  currency: Currency;
}

export interface RebalanceLeaf {
  label: string;
  kind: RebalanceLeafKind;
  sectorId: string | null;
  effectiveTargetPercent: number; // ポートフォリオ全体に対する実効目標比率(0〜100)
  currentValueJpy: number; // JPY換算評価額(整数円)
  currentPercent: number; // ポートフォリオ全体に対する現在比率(0〜100)
  deviationAmountJpy: number; // currentValueJpy - 目標評価額(JPY)。正は超過(要売却)、負は不足(要買付)
  deviationPercent: number; // currentPercent - effectiveTargetPercent
  actions: RebalanceAction[];
}

export interface RebalancePlan {
  totalPortfolioValueJpy: number;
  fxRateMissing: boolean; // USD建て資産・現金があるのに為替レートが未登録で換算できなかった
  leaves: RebalanceLeaf[];
}

export interface AllocationValidationError {
  parentId: string | null; // null: アセットクラス(トップ)グループ
  total: number; // 実際の合計(%)
}

// implement-p3.md 7章: 同一parentId配下(アセットクラス全体、または各アセットクラス配下のセクター群)の
// targetPercent合計が100%であることを検証する。子を持たないアセットクラスはグループが存在しないため対象外
export function validateTargetAllocationTotals(allocations: TargetAllocation[]): AllocationValidationError[] {
  const totalsByParent = new Map<string | null, number>();
  for (const allocation of allocations) {
    totalsByParent.set(allocation.parentId, (totalsByParent.get(allocation.parentId) ?? 0) + allocation.targetPercent);
  }
  const errors: AllocationValidationError[] = [];
  for (const [parentId, total] of totalsByParent) {
    if (Math.abs(total - 100) > 0.01) {
      errors.push({ parentId, total });
    }
  }
  return errors;
}

// USD金額(amount単位=セント)をJPY(整数円)に換算する。レート未登録ならnullを返す
function toJpy(amountUnits: number, currency: Currency, usdJpyRate: number | null): number | null {
  if (currency === 'JPY') return amountUnits;
  if (usdJpyRate === null) return null;
  return Math.round((amountUnits / 100) * usdJpyRate);
}

// 投信は口数(最小単位1口)。株式/ETFはSecurity.unitShareQuantityが未設定なら1単位として扱う
function unitSizeFor(security: Security): number {
  if (security.productType === 'fund') return 1;
  return security.unitShareQuantity && security.unitShareQuantity > 0 ? security.unitShareQuantity : 1;
}

export function buildRebalancePlan(input: {
  allocations: TargetAllocation[];
  positions: HoldingPosition[];
  currentPriceBySecurityId: Map<string, number>;
  securities: Security[];
  sectors: Sector[];
  cashBalances: CashBalance[];
  usdJpyRate: number | null;
  noSellMode: boolean;
}): RebalancePlan {
  const { allocations, positions, currentPriceBySecurityId, securities, cashBalances, usdJpyRate, noSellMode } =
    input;
  const securityById = new Map(securities.map((s) => [s.id, s]));

  let fxRateMissing = false;
  function convert(amountUnits: number, currency: Currency): number | null {
    const jpy = toJpy(amountUnits, currency, usdJpyRate);
    if (jpy === null) fxRateMissing = true;
    return jpy;
  }

  // 各ポジションの評価額(JPY換算)。セクター別集計・ポートフォリオ全体合計の両方で使う
  interface PositionValuation {
    position: HoldingPosition;
    security: Security;
    evaluationAmountOwnCurrency: number; // amount単位(JPY円/USDセント)
    evaluationAmountJpy: number | null;
  }
  const valuations: PositionValuation[] = [];
  for (const position of positions) {
    const security = securityById.get(position.securityId);
    if (!security) continue;
    const currentPrice = currentPriceBySecurityId.get(position.securityId);
    if (currentPrice === undefined) continue;
    const evaluationAmountOwnCurrency = Math.round(position.quantity * currentPrice);
    valuations.push({
      position,
      security,
      evaluationAmountOwnCurrency,
      evaluationAmountJpy: convert(evaluationAmountOwnCurrency, position.currency),
    });
  }

  const cashJpyByCurrency = new Map<Currency, number>();
  for (const cash of cashBalances) {
    const jpy = convert(cash.amount, cash.currency);
    if (jpy !== null) {
      cashJpyByCurrency.set(cash.currency, jpy);
    }
  }
  const totalCashJpy = [...cashJpyByCurrency.values()].reduce((sum, v) => sum + v, 0);

  const totalPortfolioValueJpy =
    valuations.reduce((sum, v) => sum + (v.evaluationAmountJpy ?? 0), 0) + totalCashJpy;

  const assetClasses = allocations.filter((a) => a.level === 'asset_class');
  const leaves: RebalanceLeaf[] = [];

  for (const assetClass of assetClasses) {
    const children = allocations.filter((a) => a.parentId === assetClass.id);

    if (children.length === 0) {
      if (assetClass.label === '現金') {
        leaves.push(
          buildLeaf({
            label: '現金',
            kind: 'cash',
            sectorId: null,
            effectiveTargetPercent: assetClass.targetPercent,
            currentValueJpy: totalCashJpy,
            totalPortfolioValueJpy,
            actions: [],
          })
        );
      } else {
        // F0確認: セクター子を持たない現金以外のアセットクラスは現在評価額を対応付けられないため0円固定
        leaves.push(
          buildLeaf({
            label: assetClass.label,
            kind: 'unsupported',
            sectorId: null,
            effectiveTargetPercent: assetClass.targetPercent,
            currentValueJpy: 0,
            totalPortfolioValueJpy,
            actions: [],
          })
        );
      }
      continue;
    }

    for (const sectorAllocation of children) {
      const sectorId = sectorAllocation.sectorId;
      const matchedValuations = valuations.filter((v) => v.security.sectorId === sectorId);
      const currentValueJpy = matchedValuations.reduce((sum, v) => sum + (v.evaluationAmountJpy ?? 0), 0);
      const effectiveTargetPercent = (assetClass.targetPercent / 100) * (sectorAllocation.targetPercent / 100) * 100;

      const deviationAmountJpy = currentValueJpy - (effectiveTargetPercent / 100) * totalPortfolioValueJpy;
      const actions = buildSectorActions({
        deviationAmountJpy,
        matchedValuations,
        noSellMode,
        currentPriceBySecurityId,
      });

      leaves.push(
        buildLeaf({
          label: sectorAllocation.label,
          kind: 'sector',
          sectorId,
          effectiveTargetPercent,
          currentValueJpy,
          totalPortfolioValueJpy,
          actions,
        })
      );
    }
  }

  return { totalPortfolioValueJpy, fxRateMissing, leaves };
}

function buildLeaf(input: {
  label: string;
  kind: RebalanceLeafKind;
  sectorId: string | null;
  effectiveTargetPercent: number;
  currentValueJpy: number;
  totalPortfolioValueJpy: number;
  actions: RebalanceAction[];
}): RebalanceLeaf {
  const { label, kind, sectorId, effectiveTargetPercent, currentValueJpy, totalPortfolioValueJpy, actions } = input;
  const currentPercent = totalPortfolioValueJpy > 0 ? (currentValueJpy / totalPortfolioValueJpy) * 100 : 0;
  const targetValueJpy = (effectiveTargetPercent / 100) * totalPortfolioValueJpy;
  return {
    label,
    kind,
    sectorId,
    effectiveTargetPercent,
    currentValueJpy,
    currentPercent,
    deviationAmountJpy: currentValueJpy - targetValueJpy,
    deviationPercent: currentPercent - effectiveTargetPercent,
    actions,
  };
}

// implement-p3.md 7章: セクター内で乖離額を解消するための概算数量を、現在保有している銘柄に
// 評価額比例で配分して算出する。まだ保有していない銘柄への新規買付提案は行わない(配分の根拠がないため)
function buildSectorActions(input: {
  deviationAmountJpy: number;
  matchedValuations: {
    position: HoldingPosition;
    security: Security;
    evaluationAmountOwnCurrency: number;
    evaluationAmountJpy: number | null;
  }[];
  noSellMode: boolean;
  currentPriceBySecurityId: Map<string, number>;
}): RebalanceAction[] {
  const { deviationAmountJpy, matchedValuations, noSellMode, currentPriceBySecurityId } = input;

  const side: 'buy' | 'sell' = deviationAmountJpy < 0 ? 'buy' : 'sell';
  if (side === 'sell' && noSellMode) return []; // ノーセルモードでは売却提案を出さない
  if (Math.abs(deviationAmountJpy) < 1) return []; // 乖離が実質ゼロなら提案不要

  const eligible = matchedValuations.filter((v) => v.evaluationAmountJpy !== null && v.evaluationAmountJpy > 0);
  const eligibleTotalJpy = eligible.reduce((sum, v) => sum + (v.evaluationAmountJpy as number), 0);
  if (eligibleTotalJpy === 0) return []; // 保有銘柄がなく配分の根拠がないため提案しない

  const targetAmountJpy = Math.abs(deviationAmountJpy);
  const actions: RebalanceAction[] = [];

  for (const valuation of eligible) {
    const { security, position, evaluationAmountJpy, evaluationAmountOwnCurrency } = valuation;
    const shareJpy = targetAmountJpy * ((evaluationAmountJpy as number) / eligibleTotalJpy);
    const currentPrice = currentPriceBySecurityId.get(security.id);
    if (!currentPrice || currentPrice <= 0) continue;

    // JPY換算の配分額を、その銘柄自身の通貨(amount単位)に戻す
    const shareOwnCurrency =
      security.currency === 'JPY'
        ? shareJpy
        : (shareJpy / (evaluationAmountJpy as number)) * evaluationAmountOwnCurrency;

    const rawQuantity = shareOwnCurrency / currentPrice;
    const unit = unitSizeFor(security);

    let quantity: number;
    if (side === 'buy') {
      quantity = Math.ceil(rawQuantity / unit) * unit;
    } else {
      const maxSellableQuantity = Math.floor(position.quantity / unit) * unit;
      quantity = Math.min(Math.floor(rawQuantity / unit) * unit, maxSellableQuantity);
    }
    if (quantity <= 0) continue;

    actions.push({
      securityId: security.id,
      securityName: security.name,
      side,
      quantity,
      estimatedAmount: Math.round(quantity * currentPrice),
      currency: security.currency,
    });
  }

  return actions;
}
