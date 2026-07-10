'use client';

import { Fragment, useState } from 'react';
import type { Rule, RuleVersion } from '@/domain/types';

export interface RuleRow {
  rule: Rule;
  versions: RuleVersion[]; // version昇順
  linkedTradeCount: number;
}

interface Props {
  rows: RuleRow[];
  onRevise: (rule: Rule, latestVersion: RuleVersion) => void;
  onToggleStatus: (rule: Rule) => void;
  onDelete: (rule: Rule) => void;
  onExportMarkdown: (rule: Rule, latestVersion: RuleVersion) => void;
  deleteError: { ruleId: string; message: string } | null;
}

const SECTION_LABELS: { key: keyof RuleVersion['sections']; label: string }[] = [
  { key: 'overview', label: '概要' },
  { key: 'entry', label: 'エントリー条件' },
  { key: 'exit', label: 'イグジット条件' },
  { key: 'exclusion', label: '除外条件' },
  { key: 'moneyManagement', label: '資金管理' },
];

// implement-p1.md 5章画面B: 一覧(ルール名/状態/最新version/紐付く取引件数)+改訂/廃止/再有効化/物理削除/履歴表示
export function RuleList({ rows, onRevise, onToggleStatus, onDelete, onExportMarkdown, deleteError }: Props) {
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [selectedVersionByRule, setSelectedVersionByRule] = useState<Record<string, number>>({});

  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">登録されたルールはまだありません。</p>;
  }

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b text-left">
          <th className="p-2">ルール名</th>
          <th className="p-2">状態</th>
          <th className="p-2">最新version</th>
          <th className="p-2">紐付く取引件数</th>
          <th className="p-2">操作</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ rule, versions, linkedTradeCount }) => {
          const latest = versions.at(-1);
          const isExpanded = expandedRuleId === rule.id;
          const selectedVersionNumber = selectedVersionByRule[rule.id] ?? latest?.version ?? 1;
          const selectedVersion = versions.find((v) => v.version === selectedVersionNumber) ?? latest;
          return (
            <Fragment key={rule.id}>
              <tr className="border-b">
                <td className="p-2">{rule.name}</td>
                <td className="p-2">{rule.status === 'active' ? '有効' : '廃止'}</td>
                <td className="p-2">v{latest?.version ?? '-'}</td>
                <td className="p-2">{linkedTradeCount}</td>
                <td className="p-2 space-x-2 whitespace-nowrap">
                  <button
                    type="button"
                    className="text-blue-600 underline"
                    onClick={() => latest && onRevise(rule, latest)}
                  >
                    改訂
                  </button>
                  <button
                    type="button"
                    className="text-gray-700 underline"
                    onClick={() => setExpandedRuleId(isExpanded ? null : rule.id)}
                  >
                    履歴
                  </button>
                  <button
                    type="button"
                    className="text-gray-700 underline"
                    onClick={() => latest && onExportMarkdown(rule, latest)}
                  >
                    Markdown出力
                  </button>
                  <button type="button" className="text-amber-700 underline" onClick={() => onToggleStatus(rule)}>
                    {rule.status === 'active' ? '廃止' : '再有効化'}
                  </button>
                  <button
                    type="button"
                    className="text-red-600 underline"
                    onClick={() => {
                      if (window.confirm(`ルール「${rule.name}」を物理削除しますか?この操作は取り消せません。`)) {
                        onDelete(rule);
                      }
                    }}
                  >
                    削除
                  </button>
                </td>
              </tr>
              {deleteError?.ruleId === rule.id && (
                <tr>
                  <td colSpan={5} className="p-2 text-sm text-red-600 bg-red-50">
                    {deleteError.message}
                  </td>
                </tr>
              )}
              {isExpanded && (
                <tr>
                  <td colSpan={5} className="p-2 bg-gray-50">
                    <div className="flex gap-2 mb-2">
                      {versions.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          className={`px-2 py-0.5 rounded border text-xs ${
                            v.version === selectedVersionNumber ? 'bg-blue-600 text-white' : ''
                          }`}
                          onClick={() =>
                            setSelectedVersionByRule((prev) => ({ ...prev, [rule.id]: v.version }))
                          }
                        >
                          v{v.version}
                        </button>
                      ))}
                    </div>
                    {selectedVersion && (
                      <div className="space-y-1 text-xs">
                        {selectedVersion.revisionReason && (
                          <p>
                            <span className="font-medium">改訂理由: </span>
                            {selectedVersion.revisionReason}
                          </p>
                        )}
                        {SECTION_LABELS.map(({ key, label }) => (
                          <p key={key}>
                            <span className="font-medium">{label}: </span>
                            {selectedVersion.sections[key] || '(未記入)'}
                          </p>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
