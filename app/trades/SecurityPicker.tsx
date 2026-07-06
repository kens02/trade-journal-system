'use client';

import { useMemo, useState } from 'react';
import type { Security, ProductType, Currency } from '@/domain/types';
import { normalizeName } from '@/domain/normalize';

// implement-p1.md 5章画面A: 既存銘柄のインクリメンタル検索+その場で新規登録
export type SecuritySelection =
  | { kind: 'existing'; securityId: string; currency: Currency }
  | {
      kind: 'new';
      draft: { name: string; code: string | null; productType: ProductType; currency: Currency };
    };

interface Props {
  securities: Security[];
  value: SecuritySelection | null;
  onChange: (value: SecuritySelection | null) => void;
}

export function SecurityPicker({ securities, value, onChange }: Props) {
  const [query, setQuery] = useState(() => {
    if (value?.kind === 'existing') {
      return securities.find((s) => s.id === value.securityId)?.name ?? '';
    }
    if (value?.kind === 'new') {
      return value.draft.name;
    }
    return '';
  });
  const [showNewForm, setShowNewForm] = useState(value?.kind === 'new');

  const matches = useMemo(() => {
    const key = normalizeName(query);
    if (key === '') return [];
    return securities.filter((s) => s.normalizedName.includes(key)).slice(0, 10);
  }, [query, securities]);

  function selectExisting(security: Security) {
    setQuery(security.name);
    setShowNewForm(false);
    onChange({ kind: 'existing', securityId: security.id, currency: security.currency });
  }

  function startNew() {
    setShowNewForm(true);
    onChange({
      kind: 'new',
      draft: { name: query, code: null, productType: 'jp_stock', currency: 'JPY' },
    });
  }

  function updateDraft(
    patch: Partial<{ name: string; code: string | null; productType: ProductType; currency: Currency }>
  ) {
    if (value?.kind !== 'new') return;
    onChange({ kind: 'new', draft: { ...value.draft, ...patch } });
  }

  const isExistingSelected = value?.kind === 'existing';

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">銘柄</label>
      <input
        type="text"
        className="w-full border rounded px-2 py-1"
        placeholder="銘柄名で検索"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setShowNewForm(false);
          onChange(null);
        }}
      />
      {!isExistingSelected && matches.length > 0 && (
        <ul className="border rounded divide-y">
          {matches.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="w-full text-left px-2 py-1 hover:bg-gray-100"
                onClick={() => selectExisting(s)}
              >
                {s.name} {s.code ? `(${s.code})` : ''} ・ {s.currency}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!isExistingSelected && query.trim() !== '' && !showNewForm && (
        <button type="button" className="text-sm text-blue-600 underline" onClick={startNew}>
          + 新規銘柄として登録
        </button>
      )}
      {showNewForm && value?.kind === 'new' && (
        <div className="border rounded p-2 space-y-2 bg-gray-50">
          <div>
            <label className="block text-xs">銘柄名</label>
            <input
              type="text"
              className="w-full border rounded px-2 py-1"
              value={value.draft.name}
              onChange={(e) => {
                setQuery(e.target.value);
                updateDraft({ name: e.target.value });
              }}
            />
          </div>
          <div>
            <label className="block text-xs">コード(任意、投信は空欄)</label>
            <input
              type="text"
              className="w-full border rounded px-2 py-1"
              value={value.draft.code ?? ''}
              onChange={(e) => updateDraft({ code: e.target.value === '' ? null : e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs">商品種別</label>
            <select
              className="w-full border rounded px-2 py-1"
              value={value.draft.productType}
              onChange={(e) => updateDraft({ productType: e.target.value as ProductType })}
            >
              <option value="jp_stock">国内株式</option>
              <option value="us_stock">米国株式</option>
              <option value="fund">投資信託</option>
              <option value="etf">ETF</option>
            </select>
          </div>
          <div>
            <label className="block text-xs">通貨</label>
            <select
              className="w-full border rounded px-2 py-1"
              value={value.draft.currency}
              onChange={(e) => updateDraft({ currency: e.target.value as Currency })}
            >
              <option value="JPY">JPY</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
