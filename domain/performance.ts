import type {
  Trade,
  TradeMatch,
  TradeRuleLink,
  RuleVersion,
  Rule,
  Currency,
  Adherence,
  JournalEntry,
  JournalTag,
  Tag,
  Security,
} from './types';

// 仕様書4.2「集計軸: ルール別勝率・期待値、遵守/逸脱別の成績比較、感情タグ別成績、銘柄別・月別損益」に対応。
// 実現損益(TradeMatch.realizedPnl)は売却取引(sellTradeId)側に帰属するため、
// 本ファイルの集計はすべて「決済済み取引(売却)」を単位とする。買付取引はここでは対象にしない
// (買付単独では実現損益が発生しないため、勝率・期待値の計算対象になり得ない)。

export interface CurrencyPerformance {
  count: number; // 決済済み取引件数
  winCount: number; // realizedPnl > 0 の件数
  winRate: number; // 0〜1。count===0の場合は0
  totalPnl: number;
  expectedValue: number; // = totalPnl / count(期待値)。count===0の場合は0
}

export type PerformanceByCurrency = Record<Currency, CurrencyPerformance>;

interface Accumulator {
  count: number;
  winCount: number;
  totalPnl: number;
}

function emptyAccumulator(): Accumulator {
  return { count: 0, winCount: 0, totalPnl: 0 };
}

function emptyAccumulatorByCurrency(): Record<Currency, Accumulator> {
  return { JPY: emptyAccumulator(), USD: emptyAccumulator() };
}

function finalize(acc: Accumulator): CurrencyPerformance {
  return {
    count: acc.count,
    winCount: acc.winCount,
    winRate: acc.count > 0 ? acc.winCount / acc.count : 0,
    totalPnl: acc.totalPnl,
    expectedValue: acc.count > 0 ? acc.totalPnl / acc.count : 0,
  };
}

function finalizeByCurrency(acc: Record<Currency, Accumulator>): PerformanceByCurrency {
  return { JPY: finalize(acc.JPY), USD: finalize(acc.USD) };
}

function addClosedTrade(acc: Record<Currency, Accumulator>, currency: Currency, pnl: number): void {
  const target = acc[currency];
  target.count += 1;
  target.totalPnl += pnl;
  if (pnl > 0) {
    target.winCount += 1;
  }
}

interface ClosedTrade {
  pnl: number;
  currency: Currency;
}

// 決済済み取引(売却)単位で実現損益を合算する。同一売却取引が複数マッチ(分割約定・複数買付消費)に
// またがる場合でも、勝率・期待値は「取引単位」で判定するため合算してから1件として扱う
function computeClosedTradesBySellTradeId(matches: TradeMatch[]): Map<string, ClosedTrade> {
  const result = new Map<string, ClosedTrade>();
  for (const match of matches) {
    const existing = result.get(match.sellTradeId);
    if (existing) {
      existing.pnl += match.realizedPnl;
    } else {
      result.set(match.sellTradeId, { pnl: match.realizedPnl, currency: match.currency });
    }
  }
  return result;
}

// ---- ルール別勝率・期待値 ----

export interface RulePerformance {
  ruleId: string;
  ruleName: string;
  performance: PerformanceByCurrency;
}

export interface NoRulePerformance {
  performance: PerformanceByCurrency;
}

export interface RulePerformanceResult {
  rules: RulePerformance[];
  noRule: NoRulePerformance;
}

// 決済済み取引(売却)に付与された遵守評価(TradeRuleLink、売却取引側)からルールを特定する。
// 売却取引にルール紐付けがない場合は「ルールなし」に集計する
export function aggregateRulePerformance(
  matches: TradeMatch[],
  links: TradeRuleLink[],
  ruleVersions: RuleVersion[],
  rules: Rule[]
): RulePerformanceResult {
  const closedTrades = computeClosedTradesBySellTradeId(matches);
  const linkByTradeId = new Map(links.map((l) => [l.tradeId, l]));
  const versionById = new Map(ruleVersions.map((v) => [v.id, v]));

  const ruleAccByRuleId = new Map<string, Record<Currency, Accumulator>>();
  for (const rule of rules) {
    ruleAccByRuleId.set(rule.id, emptyAccumulatorByCurrency());
  }
  const noRuleAcc = emptyAccumulatorByCurrency();

  for (const [sellTradeId, closed] of closedTrades) {
    const link = linkByTradeId.get(sellTradeId);
    const version = link ? versionById.get(link.ruleVersionId) : undefined;
    const ruleAcc = version ? ruleAccByRuleId.get(version.ruleId) : undefined;
    if (!link || !version || !ruleAcc) {
      addClosedTrade(noRuleAcc, closed.currency, closed.pnl);
      continue;
    }
    addClosedTrade(ruleAcc, closed.currency, closed.pnl);
  }

  return {
    rules: rules.map((rule) => ({
      ruleId: rule.id,
      ruleName: rule.name,
      performance: finalizeByCurrency(ruleAccByRuleId.get(rule.id) as Record<Currency, Accumulator>),
    })),
    noRule: { performance: finalizeByCurrency(noRuleAcc) },
  };
}

// ---- 遵守/逸脱別の成績比較 ----

export type AdherencePerformanceResult = Record<Adherence, PerformanceByCurrency>;

export function aggregateAdherencePerformance(
  matches: TradeMatch[],
  links: TradeRuleLink[]
): AdherencePerformanceResult {
  const closedTrades = computeClosedTradesBySellTradeId(matches);
  const linkByTradeId = new Map(links.map((l) => [l.tradeId, l]));

  const acc: Record<Adherence, Record<Currency, Accumulator>> = {
    followed: emptyAccumulatorByCurrency(),
    partial: emptyAccumulatorByCurrency(),
    deviated: emptyAccumulatorByCurrency(),
  };

  for (const [sellTradeId, closed] of closedTrades) {
    const link = linkByTradeId.get(sellTradeId);
    if (!link) continue; // 遵守評価がない決済済み取引は本集計の対象外
    addClosedTrade(acc[link.adherence], closed.currency, closed.pnl);
  }

  return {
    followed: finalizeByCurrency(acc.followed),
    partial: finalizeByCurrency(acc.partial),
    deviated: finalizeByCurrency(acc.deviated),
  };
}

// ---- 感情タグ別成績 ----

export interface TagPerformance {
  tagId: string;
  tagName: string;
  performance: PerformanceByCurrency;
}

// エントリに付与された感情タグ(Tag.kind === 'emotion')ごとに、紐付く取引(JournalEntry.tradeId)の
// 実現損益を集計する。日単位エントリ(tradeId === null)は紐付く取引がないため対象外。
// 1エントリに複数の感情タグが付与されている場合、その取引の損益は各タグにそれぞれ計上する
export function aggregateEmotionTagPerformance(
  matches: TradeMatch[],
  journalEntries: JournalEntry[],
  journalTags: JournalTag[],
  tags: Tag[]
): TagPerformance[] {
  const closedTrades = computeClosedTradesBySellTradeId(matches);
  const emotionTags = tags.filter((t) => t.kind === 'emotion');
  const accByTagId = new Map<string, Record<Currency, Accumulator>>();
  for (const tag of emotionTags) {
    accByTagId.set(tag.id, emptyAccumulatorByCurrency());
  }

  const tagIdsByJournalId = new Map<string, string[]>();
  for (const jt of journalTags) {
    const list = tagIdsByJournalId.get(jt.journalId);
    if (list) {
      list.push(jt.tagId);
    } else {
      tagIdsByJournalId.set(jt.journalId, [jt.tagId]);
    }
  }

  for (const entry of journalEntries) {
    if (!entry.tradeId) continue;
    const closed = closedTrades.get(entry.tradeId);
    if (!closed) continue; // 決済(売却)取引でなければ実現損益がない
    const tagIds = tagIdsByJournalId.get(entry.id) ?? [];
    for (const tagId of tagIds) {
      const acc = accByTagId.get(tagId);
      if (!acc) continue; // 感情タグ以外(自由タグ)は対象外
      addClosedTrade(acc, closed.currency, closed.pnl);
    }
  }

  return emotionTags.map((tag) => ({
    tagId: tag.id,
    tagName: tag.name,
    performance: finalizeByCurrency(accByTagId.get(tag.id) as Record<Currency, Accumulator>),
  }));
}

// ---- 銘柄別損益 ----

export interface SecurityPerformance {
  securityId: string;
  securityName: string;
  performance: PerformanceByCurrency;
}

// 決済済み取引が1件以上ある銘柄のみを結果に含める
export function aggregateSecurityPerformance(
  matches: TradeMatch[],
  trades: Trade[],
  securities: Security[]
): SecurityPerformance[] {
  const closedTrades = computeClosedTradesBySellTradeId(matches);
  const tradeById = new Map(trades.map((t) => [t.id, t]));
  const securityById = new Map(securities.map((s) => [s.id, s]));

  const accBySecurityId = new Map<string, Record<Currency, Accumulator>>();
  for (const [sellTradeId, closed] of closedTrades) {
    const trade = tradeById.get(sellTradeId);
    if (!trade) continue;
    let acc = accBySecurityId.get(trade.securityId);
    if (!acc) {
      acc = emptyAccumulatorByCurrency();
      accBySecurityId.set(trade.securityId, acc);
    }
    addClosedTrade(acc, closed.currency, closed.pnl);
  }

  return [...accBySecurityId.entries()].map(([securityId, acc]) => ({
    securityId,
    securityName: securityById.get(securityId)?.name ?? '(不明な銘柄)',
    performance: finalizeByCurrency(acc),
  }));
}

// ---- 月別損益 ----

export interface MonthlyPerformance {
  yearMonth: string; // 'YYYY-MM'。決済(売却)取引のtradeDateを基準とする
  performance: PerformanceByCurrency;
}

export function aggregateMonthlyPerformance(
  matches: TradeMatch[],
  trades: Trade[]
): MonthlyPerformance[] {
  const closedTrades = computeClosedTradesBySellTradeId(matches);
  const tradeById = new Map(trades.map((t) => [t.id, t]));

  const accByYearMonth = new Map<string, Record<Currency, Accumulator>>();
  for (const [sellTradeId, closed] of closedTrades) {
    const trade = tradeById.get(sellTradeId);
    if (!trade) continue;
    const yearMonth = trade.tradeDate.slice(0, 7);
    let acc = accByYearMonth.get(yearMonth);
    if (!acc) {
      acc = emptyAccumulatorByCurrency();
      accByYearMonth.set(yearMonth, acc);
    }
    addClosedTrade(acc, closed.currency, closed.pnl);
  }

  return [...accByYearMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([yearMonth, acc]) => ({ yearMonth, performance: finalizeByCurrency(acc) }));
}
