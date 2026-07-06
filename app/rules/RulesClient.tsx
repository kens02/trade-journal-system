'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Rule, RuleVersion } from '@/domain/types';
import {
  createRuleWithFirstVersion,
  createRuleVersion,
  listRules,
  listRuleVersions,
  retireRule,
  reactivateRule,
  deleteRuleHard,
  listTradeRuleLinksByRuleVersion,
  RuleInUseError,
} from '@/db/repository';
import { RuleForm, type RuleFormPayload } from './RuleForm';
import { RuleList, type RuleRow } from './RuleList';

interface RevisingState {
  ruleId: string;
  ruleName: string;
  latestVersion: RuleVersion;
  nonce: number;
}

export function RulesClient() {
  const [rows, setRows] = useState<RuleRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [revising, setRevising] = useState<RevisingState | null>(null);
  const [deleteError, setDeleteError] = useState<{ ruleId: string; message: string } | null>(null);

  const refresh = useCallback(async () => {
    const rules = await listRules();
    const nextRows: RuleRow[] = [];
    for (const rule of rules) {
      const versions = await listRuleVersions(rule.id);
      const linkGroups = await Promise.all(
        versions.map((v) => listTradeRuleLinksByRuleVersion(v.id))
      );
      const linkedTradeCount = linkGroups.reduce((sum, links) => sum + links.length, 0);
      nextRows.push({ rule, versions, linkedTradeCount });
    }
    setRows(nextRows);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleSubmit(payload: RuleFormPayload) {
    if (payload.mode === 'create') {
      await createRuleWithFirstVersion({ name: payload.name, sections: payload.sections });
    } else if (revising) {
      await createRuleVersion({
        ruleId: revising.ruleId,
        sections: payload.sections,
        revisionReason: payload.revisionReason,
      });
      setRevising(null);
    }
    await refresh();
  }

  function handleRevise(rule: Rule, latestVersion: RuleVersion) {
    setDeleteError(null);
    setRevising({ ruleId: rule.id, ruleName: rule.name, latestVersion, nonce: Date.now() });
  }

  async function handleToggleStatus(rule: Rule) {
    if (rule.status === 'active') {
      await retireRule(rule.id);
    } else {
      await reactivateRule(rule.id);
    }
    await refresh();
  }

  async function handleDelete(rule: Rule) {
    setDeleteError(null);
    try {
      await deleteRuleHard(rule.id);
      await refresh();
    } catch (error) {
      if (error instanceof RuleInUseError) {
        setDeleteError({
          ruleId: rule.id,
          message: '取引に紐付いているため削除できません。「廃止」を利用してください。',
        });
      } else {
        throw error;
      }
    }
  }

  if (!loaded) {
    return <p className="text-sm text-gray-500">読み込み中...</p>;
  }

  return (
    <div className="space-y-8">
      <RuleForm
        key={revising ? `revise-${revising.nonce}` : 'create'}
        mode={revising ? 'revise' : 'create'}
        ruleName={revising?.ruleName}
        initialSections={revising?.latestVersion.sections}
        onSubmit={handleSubmit}
        onCancel={() => setRevising(null)}
      />
      <RuleList
        rows={rows}
        onRevise={handleRevise}
        onToggleStatus={handleToggleStatus}
        onDelete={handleDelete}
        deleteError={deleteError}
      />
    </div>
  );
}
