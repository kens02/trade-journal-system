import type { Trade, TradeRuleLink, RuleVersion, Rule, Currency, Adherence } from './types';

export interface AdherenceBreakdown {
  followed: number;
  partial: number;
  deviated: number;
}

export interface CurrencyAmountTotals {
  buy: number;
  sell: number;
}

export type AmountByCurrency = Record<Currency, CurrencyAmountTotals>;

interface TradeCounts {
  tradeCount: number;
  buyCount: number;
  sellCount: number;
}

export interface VersionSummary extends TradeCounts {
  ruleVersionId: string;
  version: number;
  amountByCurrency: AmountByCurrency;
  adherence: AdherenceBreakdown;
}

export interface RuleSummary extends TradeCounts {
  ruleId: string;
  ruleName: string;
  amountByCurrency: AmountByCurrency;
  adherence: AdherenceBreakdown;
  versions: VersionSummary[];
}

export interface NoRuleSummary extends TradeCounts {
  amountByCurrency: AmountByCurrency;
}

export interface SummaryResult {
  rules: RuleSummary[];
  noRule: NoRuleSummary;
}

function emptyAmountByCurrency(): AmountByCurrency {
  return { JPY: { buy: 0, sell: 0 }, USD: { buy: 0, sell: 0 } };
}

function emptyAdherence(): AdherenceBreakdown {
  return { followed: 0, partial: 0, deviated: 0 };
}

function addTrade(
  totals: TradeCounts & { amountByCurrency: AmountByCurrency },
  trade: Trade
): void {
  totals.tradeCount += 1;
  if (trade.side === 'buy') {
    totals.buyCount += 1;
    totals.amountByCurrency[trade.currency].buy += trade.amount;
  } else {
    totals.sellCount += 1;
    totals.amountByCurrency[trade.currency].sell += trade.amount;
  }
}

function addAdherence(
  totals: { adherence: AdherenceBreakdown },
  adherence: Adherence
): void {
  totals.adherence[adherence] += 1;
}

// implement-p1.md 5章画面C: ルール別(RuleVersion単位の内訳を展開可能)の簡易集計。
// 遵守評価はTradeRuleLinkがある取引のみ集計対象(ルールなし取引には遵守評価が存在しない)
export function aggregateTrades(
  trades: Trade[],
  links: TradeRuleLink[],
  ruleVersions: RuleVersion[],
  rules: Rule[]
): SummaryResult {
  const linkByTradeId = new Map(links.map((l) => [l.tradeId, l]));
  const versionById = new Map(ruleVersions.map((v) => [v.id, v]));

  const ruleSummaries = new Map<string, RuleSummary>();
  const versionSummaries = new Map<string, VersionSummary>();

  for (const rule of rules) {
    ruleSummaries.set(rule.id, {
      ruleId: rule.id,
      ruleName: rule.name,
      tradeCount: 0,
      buyCount: 0,
      sellCount: 0,
      amountByCurrency: emptyAmountByCurrency(),
      adherence: emptyAdherence(),
      versions: [],
    });
  }
  for (const version of ruleVersions) {
    versionSummaries.set(version.id, {
      ruleVersionId: version.id,
      version: version.version,
      tradeCount: 0,
      buyCount: 0,
      sellCount: 0,
      amountByCurrency: emptyAmountByCurrency(),
      adherence: emptyAdherence(),
    });
  }

  const noRule: NoRuleSummary = {
    tradeCount: 0,
    buyCount: 0,
    sellCount: 0,
    amountByCurrency: emptyAmountByCurrency(),
  };

  for (const trade of trades) {
    const link = linkByTradeId.get(trade.id);
    const version = link ? versionById.get(link.ruleVersionId) : undefined;
    const ruleSummary = version ? ruleSummaries.get(version.ruleId) : undefined;
    const versionSummary = version ? versionSummaries.get(version.id) : undefined;

    if (!link || !version || !ruleSummary || !versionSummary) {
      // 紐付けなし、またはRuleVersion/Ruleが既に存在しない参照切れは「ルールなし」に集計する
      addTrade(noRule, trade);
      continue;
    }

    addTrade(ruleSummary, trade);
    addTrade(versionSummary, trade);
    addAdherence(ruleSummary, link.adherence);
    addAdherence(versionSummary, link.adherence);
  }

  const rulesResult: RuleSummary[] = rules.map((rule) => {
    const summary = ruleSummaries.get(rule.id) as RuleSummary;
    const versions = ruleVersions
      .filter((v) => v.ruleId === rule.id)
      .sort((a, b) => a.version - b.version)
      .map((v) => versionSummaries.get(v.id) as VersionSummary);
    return { ...summary, versions };
  });

  return { rules: rulesResult, noRule };
}
