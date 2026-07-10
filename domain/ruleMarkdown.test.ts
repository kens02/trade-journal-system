import { describe, it, expect } from 'vitest';
import { slugifyRuleName, buildRuleMarkdown, buildRuleMarkdownFilename } from '@/domain/ruleMarkdown';
import type { Rule, RuleVersion } from '@/domain/types';

describe('slugifyRuleName', () => {
  it('空白・記号をハイフンに置換する', () => {
    expect(slugifyRuleName('ブレイクアウト 順張り戦略')).toBe('ブレイクアウト-順張り戦略');
  });

  it('ファイル名に使えない記号をハイフンに置換し前後のハイフンを除去する', () => {
    expect(slugifyRuleName('A/B:テスト*戦略?')).toBe('A-B-テスト-戦略');
  });

  it('全角記号もNFKC正規化後に処理される', () => {
    expect(slugifyRuleName('　前後空白あり　')).toBe('前後空白あり');
  });
});

const rule: Rule = { id: 'rule-1', name: 'ブレイクアウト戦略', status: 'active', createdAt: '' };
const version: RuleVersion = {
  id: 'v2',
  ruleId: 'rule-1',
  version: 2,
  sections: {
    overview: '概要テキスト',
    entry: 'エントリー条件テキスト',
    exit: '',
    exclusion: '除外条件テキスト',
    moneyManagement: '資金管理テキスト',
  },
  revisionReason: '損切りルールを明確化',
  createdAt: '2026-07-01T00:00:00.000Z',
};

describe('buildRuleMarkdown', () => {
  it('ルール名・メタ情報・全セクションを含むMarkdownを生成する(未記入セクションは(未記入))', () => {
    const md = buildRuleMarkdown(rule, version);
    expect(md).toContain('# ブレイクアウト戦略');
    expect(md).toContain('- バージョン: v2');
    expect(md).toContain('- 状態: 有効');
    expect(md).toContain('- 改訂理由: 損切りルールを明確化');
    expect(md).toContain('## 概要\n\n概要テキスト');
    expect(md).toContain('## エントリー条件\n\nエントリー条件テキスト');
    expect(md).toContain('## イグジット条件\n\n(未記入)');
    expect(md).toContain('## 除外条件\n\n除外条件テキスト');
    expect(md).toContain('## 資金管理\n\n資金管理テキスト');
  });

  it('初版(revisionReasonが空)の場合は「(初版)」と表示する', () => {
    const firstVersion: RuleVersion = { ...version, version: 1, revisionReason: '' };
    const md = buildRuleMarkdown(rule, firstVersion);
    expect(md).toContain('- 改訂理由: (初版)');
  });
});

describe('buildRuleMarkdownFilename', () => {
  it('rule-{slug}-v{version}.md 形式のファイル名を返す', () => {
    expect(buildRuleMarkdownFilename(rule, version)).toBe('rule-ブレイクアウト戦略-v2.md');
  });
});
