'use client';

import { Fragment, useEffect, useState } from 'react';
import { listTrades, listRules, listAllRuleVersions, listAllTradeRuleLinks } from '@/db/repository';
import {
  aggregateTrades,
  type SummaryResult,
  type RuleSummary,
  type VersionSummary,
  type NoRuleSummary,
  type AmountByCurrency,
} from '@/domain/aggregate';
import { formatJPY, formatUSD } from '@/domain/money';

const ADHERENCE_LABEL = { followed: '遵守', partial: '一部逸脱', deviated: '逸脱' } as const;

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
export function SummaryClient() {
  const [result, setResult] = useState<SummaryResult | null>(null);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [trades, rules, ruleVersions, links] = await Promise.all([
        listTrades(),
        listRules(),
        listAllRuleVersions(),
        listAllTradeRuleLinks(),
      ]);
      setResult(aggregateTrades(trades, links, ruleVersions, rules));
    })();
  }, []);

  if (!result) {
    return <p className="text-sm text-gray-500">読み込み中...</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        ※実現損益・勝率のルール別集計はP3(分析ダッシュボード拡充)で対応予定です。個別取引の実現損益は取引一覧(画面A)を参照してください。
      </p>
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
    </div>
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
