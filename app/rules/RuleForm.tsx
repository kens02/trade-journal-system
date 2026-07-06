'use client';

import { useState } from 'react';
import type { RuleVersion } from '@/domain/types';

export type RuleFormPayload =
  | { mode: 'create'; name: string; sections: RuleVersion['sections'] }
  | { mode: 'revise'; sections: RuleVersion['sections']; revisionReason: string };

interface Props {
  mode: 'create' | 'revise';
  ruleName?: string;
  initialSections?: RuleVersion['sections'];
  onSubmit: (payload: RuleFormPayload) => Promise<void>;
  onCancel?: () => void;
}

const SECTION_FIELDS: { key: keyof RuleVersion['sections']; label: string }[] = [
  { key: 'overview', label: '概要' },
  { key: 'entry', label: 'エントリー条件' },
  { key: 'exit', label: 'イグジット条件' },
  { key: 'exclusion', label: '除外条件' },
  { key: 'moneyManagement', label: '資金管理' },
];

const EMPTY_SECTIONS: RuleVersion['sections'] = {
  overview: '',
  entry: '',
  exit: '',
  exclusion: '',
  moneyManagement: '',
};

// implement-p1.md 5章画面B: 新規作成(名称+5セクション)/改訂(改訂理由必須)を同一フォームで扱う
export function RuleForm({ mode, ruleName, initialSections, onSubmit, onCancel }: Props) {
  const [name, setName] = useState('');
  const [sections, setSections] = useState<RuleVersion['sections']>(initialSections ?? EMPTY_SECTIONS);
  const [revisionReason, setRevisionReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function updateSection(key: keyof RuleVersion['sections'], value: string) {
    setSections((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (mode === 'create' && name.trim() === '') {
      nextErrors.name = 'ルール名を入力してください。';
    }
    if (mode === 'revise' && revisionReason.trim() === '') {
      nextErrors.revisionReason = '改訂理由を入力してください。';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      if (mode === 'create') {
        await onSubmit({ mode: 'create', name, sections });
        setName('');
        setSections(EMPTY_SECTIONS);
      } else {
        await onSubmit({ mode: 'revise', sections, revisionReason });
        setRevisionReason('');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border rounded p-4">
      <h2 className="font-bold">
        {mode === 'create' ? '新規ルール作成' : `ルール改訂: ${ruleName ?? ''}`}
      </h2>

      {mode === 'create' && (
        <div>
          <label className="block text-sm font-medium">ルール名</label>
          <input
            type="text"
            className="border rounded px-2 py-1 w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {errors.name && <p className="text-sm text-red-600">{errors.name}</p>}
        </div>
      )}

      {SECTION_FIELDS.map(({ key, label }) => (
        <div key={key}>
          <label className="block text-sm font-medium">{label}</label>
          <textarea
            className="border rounded px-2 py-1 w-full"
            rows={3}
            value={sections[key]}
            onChange={(e) => updateSection(key, e.target.value)}
          />
        </div>
      ))}

      {mode === 'revise' && (
        <div>
          <label className="block text-sm font-medium">改訂理由(必須)</label>
          <input
            type="text"
            className="border rounded px-2 py-1 w-full"
            value={revisionReason}
            onChange={(e) => setRevisionReason(e.target.value)}
          />
          {errors.revisionReason && <p className="text-sm text-red-600">{errors.revisionReason}</p>}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50"
          disabled={submitting}
        >
          {mode === 'create' ? '作成' : '改訂を保存'}
        </button>
        {mode === 'revise' && onCancel && (
          <button type="button" className="px-4 py-1 rounded border" onClick={onCancel}>
            キャンセル
          </button>
        )}
      </div>
    </form>
  );
}
