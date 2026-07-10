'use client';

import { Fragment, useEffect, useState } from 'react';
import {
  listTrades,
  listRules,
  listAllRuleVersions,
  listAllTradeRuleLinks,
  listAllTradeMatches,
  listSecurities,
  listJournalEntries,
  listAllJournalTags,
  listTags,
} from '@/db/repository';
import {
  aggregateTrades,
  type SummaryResult,
  type RuleSummary,
  type VersionSummary,
  type NoRuleSummary,
  type AmountByCurrency,
} from '@/domain/aggregate';
import {
  aggregateRulePerformance,
  aggregateAdherencePerformance,
  aggregateEmotionTagPerformance,
  aggregateSecurityPerformance,
  aggregateMonthlyPerformance,
  type RulePerformanceResult,
  type AdherencePerformanceResult,
  type TagPerformance,
  type SecurityPerformance,
  type MonthlyPerformance,
  type PerformanceByCurrency,
} from '@/domain/performance';
import { formatJPY, formatUSD } from '@/domain/money';

const ADHERENCE_LABEL = { followed: '遵守', partial: '一部逸脱', deviated: '逸脱' } as const;

// 仕様書4.2の集計軸(ルール別勝率・期待値/遵守評価別/感情タグ別/銘柄別・月別損益)は
// 実現損益(FIFO)を通貨(JPY/USD)ごとに分けて表示する。合算はしない
function formatPerformanceByCurrency(performance: PerformanceByCurrency): string {
  const lines: string[] = [];
  if (performance.JPY.count > 0) {
    lines.push(
      `JPY ${performance.JPY.count}件 勝率${(performance.JPY.winRate * 100).toFixed(0)}% 期待値${formatJPY(
        Math.round(performance.JPY.expectedValue)
      )}`
    );
  }
  if (performance.USD.count > 0) {
    lines.push(
      `USD ${performance.USD.count}件 勝率${(performance.USD.winRate * 100).toFixed(0)}% 期待値${formatUSD(
        Math.round(performance.USD.expectedValue)
      )}`
    );
  }
  return lines.length > 0 ? lines.join(' / ') : '−';
}

function formatAmountByCurrency(amountByCurrency: AmountByCurrency): string {
  const lines: string[] = [];
  if (amountByCurrency.JPY.buy > 0 || amountByCurrency.JPY.sell > 0) {
    lines.push(`JPY 買${formatJPY(amountByCurrency.JPY.buy)} / 売${formatJPY(amountByCurrency.JPY.sell)}`);
  }
  if (amountByCurrency.USD.buy > 0 || amountByCurrency.USD.sell > 0) {
    lines.push(`USD 買${formatUSD(amountByCurrency.USD.buy)} / 売${formatUSD(amountByCurrency.USD.sell)}`);
  }
  return lines.length > 0 ? lines.join(' / ') : '−';
}

function formatAdherence(adherence: { followed: number; partial: number; deviated: number }): string {
  return `遵守${adherence.followed} / 一部逸脱${adherence.partial} / 逸脱${adherence.deviated}`;
}

// implement-p1.md 5章画面C: ルール別(RuleVersion単位の内訳を展開可能)の簡易集計+ルールなし行
// implement-p3.md 5章: 実現損益ベースの分析ダッシュボード(ルール別勝率・期待値/遵守評価別/感情タグ別/銘柄別・月別損益)を追加
export function SummaryClient() {
  const [result, setResult] = useState<SummaryResult | null>(null);
  const [rulePerformance, setRulePerformance] = useState<RulePerformanceResult | null>(null);
  const [adherencePerformance, setAdherencePerformance] = useState<AdherencePerformanceResult | null>(null);
  const [tagPerformance, setTagPerformance] = useState<TagPerformance[] | null>(null);
  const [securityPerformance, setSecurityPerformance] = useState<SecurityPerformance[] | null>(null);
  const [monthlyPerformance, setMonthlyPerformance] = useState<MonthlyPerformance[] | null>(null);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [trades, rules, ruleVersions, links, matches, securities, journalEntries, journalTags, tags] =
        await Promise.all([
          listTrades(),
          listRules(),
          listAllRuleVersions(),
          listAllTradeRuleLinks(),
          listAllTradeMatches(),
          listSecurities(),
          listJournalEntries(),
          listAllJournalTags(),
          listTags(),
        ]);
      setResult(aggregateTrades(trades, links, ruleVersions, rules));
      setRulePerformance(aggregateRulePerformance(matches, links, ruleVersions, rules));
      setAdherencePerformance(aggregateAdherencePerformance(matches, links));
      setTagPerformance(aggregateEmotionTagPerformance(matches, journalEntries, journalTags, tags));
      setSecurityPerformance(aggregateSecurityPerformance(matches, trades, securities));
      setMonthlyPerformance(aggregateMonthlyPerformance(matches, trades));
    })();
  }, []);

  if (
    !result ||
    !rulePerformance ||
    !adherencePerformance ||
    !tagPerformance ||
    !securityPerformance ||
    !monthlyPerformance
  ) {
    return <p className="text-sm text-gray-500">読み込み中...</p>;
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="text-lg font-bold">ルール別・通貨別金額・遵守内訳</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">ルール</th>
              <th className="p-2">件数(買/売)</th>
              <th className="p-2">通貨別金額</th>
              <th className="p-2">遵守評価内訳</th>
              <th className="p-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {result.rules.map((rule) => (
              <RuleRows
                key={rule.ruleId}
                rule={rule}
                expanded={expandedRuleId === rule.ruleId}
                onToggle={() =>
                  setExpandedRuleId(expandedRuleId === rule.ruleId ? null : rule.ruleId)
                }
              />
            ))}
            <NoRuleRow noRule={result.noRule} />
          </tbody>
        </table>
      </section>

      <RulePerformanceSection result={rulePerformance} />
      <AdherencePerformanceSection result={adherencePerformance} />
      <TagPerformanceSection tags={tagPerformance} />
      <SecurityPerformanceSection securities={securityPerformance} />
      <MonthlyPerformanceSection months={monthlyPerformance} />
    </div>
  );
}

// implement-p3.md 5章: ルール別勝率・期待値(実現損益ベース。決済済み〈売却〉取引を単位とする)
function RulePerformanceSection({ result }: { result: RulePerformanceResult }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">ルール別勝率・期待値</h2>
      <p className="text-xs text-gray-500">
        ※決済(売却)取引に付与されたルール・遵守評価を基準に集計します。通貨(JPY/USD)は合算しません。
      </p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">ルール</th>
            <th className="p-2">成績</th>
          </tr>
        </thead>
        <tbody>
          {result.rules.map((rule) => (
            <tr key={rule.ruleId} className="border-b">
              <td className="p-2">{rule.ruleName}</td>
              <td className="p-2">{formatPerformanceByCurrency(rule.performance)}</td>
            </tr>
          ))}
          <tr className="border-b">
            <td className="p-2">ルールなし</td>
            <td className="p-2">{formatPerformanceByCurrency(result.noRule.performance)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

// implement-p3.md 5章: 遵守/逸脱別の成績比較
function AdherencePerformanceSection({ result }: { result: AdherencePerformanceResult }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">遵守/逸脱別の成績比較</h2>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">遵守評価</th>
            <th className="p-2">成績</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(ADHERENCE_LABEL) as (keyof typeof ADHERENCE_LABEL)[]).map((key) => (
            <tr key={key} className="border-b">
              <td className="p-2">{ADHERENCE_LABEL[key]}</td>
              <td className="p-2">{formatPerformanceByCurrency(result[key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// implement-p3.md 5章: 感情タグ別成績(取引単位エントリに付与された感情タグのみ対象)
function TagPerformanceSection({ tags }: { tags: TagPerformance[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">感情タグ別成績</h2>
      {tags.length === 0 ? (
        <p className="text-sm text-gray-500">感情タグが登録されていません。</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">感情タグ</th>
              <th className="p-2">成績</th>
            </tr>
          </thead>
          <tbody>
            {tags.map((tag) => (
              <tr key={tag.tagId} className="border-b">
                <td className="p-2">{tag.tagName}</td>
                <td className="p-2">{formatPerformanceByCurrency(tag.performance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// implement-p3.md 5章: 銘柄別損益(決済済み取引がある銘柄のみ)
function SecurityPerformanceSection({ securities }: { securities: SecurityPerformance[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">銘柄別損益</h2>
      {securities.length === 0 ? (
        <p className="text-sm text-gray-500">決済済みの取引がありません。</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">銘柄</th>
              <th className="p-2">成績</th>
            </tr>
          </thead>
          <tbody>
            {securities.map((security) => (
              <tr key={security.securityId} className="border-b">
                <td className="p-2">{security.securityName}</td>
                <td className="p-2">{formatPerformanceByCurrency(security.performance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// implement-p3.md 5章: 月別損益(決済〈売却〉取引の約定日基準)
function MonthlyPerformanceSection({ months }: { months: MonthlyPerformance[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">月別損益</h2>
      {months.length === 0 ? (
        <p className="text-sm text-gray-500">決済済みの取引がありません。</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">年月</th>
              <th className="p-2">成績</th>
            </tr>
          </thead>
          <tbody>
            {months.map((month) => (
              <tr key={month.yearMonth} className="border-b">
                <td className="p-2">{month.yearMonth}</td>
                <td className="p-2">{formatPerformanceByCurrency(month.performance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function RuleRows({
  rule,
  expanded,
  onToggle,
}: {
  rule: RuleSummary;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Fragment>
      <tr className="border-b">
        <td className="p-2">{rule.ruleName}</td>
        <td className="p-2">
          {rule.tradeCount}件({rule.buyCount}/{rule.sellCount})
        </td>
        <td className="p-2">{formatAmountByCurrency(rule.amountByCurrency)}</td>
        <td className="p-2">{formatAdherence(rule.adherence)}</td>
        <td className="p-2">
          <button type="button" className="text-gray-700 underline" onClick={onToggle}>
            {expanded ? '折りたたむ' : 'version別に展開'}
          </button>
        </td>
      </tr>
      {expanded &&
        rule.versions.map((version) => <VersionRow key={version.ruleVersionId} version={version} />)}
    </Fragment>
  );
}

function VersionRow({ version }: { version: VersionSummary }) {
  return (
    <tr className="border-b bg-gray-50 text-xs">
      <td className="p-2 pl-6">v{version.version}</td>
      <td className="p-2">
        {version.tradeCount}件({version.buyCount}/{version.sellCount})
      </td>
      <td className="p-2">{formatAmountByCurrency(version.amountByCurrency)}</td>
      <td className="p-2">{formatAdherence(version.adherence)}</td>
      <td className="p-2" />
    </tr>
  );
}

function NoRuleRow({ noRule }: { noRule: NoRuleSummary }) {
  return (
    <tr className="border-b">
      <td className="p-2">ルールなし</td>
      <td className="p-2">
        {noRule.tradeCount}件({noRule.buyCount}/{noRule.sellCount})
      </td>
      <td className="p-2">{formatAmountByCurrency(noRule.amountByCurrency)}</td>
      <td className="p-2">−</td>
      <td className="p-2" />
    </tr>
  );
}
