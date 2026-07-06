'use client';

import { useMemo, useState } from 'react';
import type { Security, ProductType } from '@/domain/types';
import { normalizeName } from '@/domain/normalize';

export interface UnmatchedGroup {
  key: string; // rawSecurityName::securityCode::market
  rawSecurityName: string;
  securityCode: string | null;
  market: string | null;
  productKind: 'fund' | 'stock_or_etf';
  rowCount: number;
}

interface Props {
  groups: UnmatchedGroup[];
  securities: Security[];
  resolutions: Map<string, string>; // group.key -> 解決済みsecurityId
  onResolveExisting: (group: UnmatchedGroup, securityId: string) => void;
  onResolveNew: (
    group: UnmatchedGroup,
    draft: { name: string; code: string | null; productType: ProductType }
  ) => void;
}

// implement-p2.md 5.1節: 未照合銘柄を(rawSecurityName, securityCode, market)単位でグルーピングし、
// 既存銘柄への対応付け(エイリアス保存)または新規登録を選択させる
export function UnmatchedSecurityResolver({
  groups,
  securities,
  resolutions,
  onResolveExisting,
  onResolveNew,
}: Props) {
  const unresolved = groups.filter((g) => !resolutions.has(g.key));

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 border rounded p-4">
      <h2 className="font-bold">未照合銘柄の解決({groups.length - unresolved.length}/{groups.length}件解決済み)</h2>
      {groups.map((group) => (
        <GroupResolver
          key={group.key}
          group={group}
          securities={securities}
          resolved={resolutions.has(group.key)}
          onResolveExisting={(securityId) => onResolveExisting(group, securityId)}
          onResolveNew={(draft) => onResolveNew(group, draft)}
        />
      ))}
    </div>
  );
}

function GroupResolver({
  group,
  securities,
  resolved,
  onResolveExisting,
  onResolveNew,
}: {
  group: UnmatchedGroup;
  securities: Security[];
  resolved: boolean;
  onResolveExisting: (securityId: string) => void;
  onResolveNew: (draft: { name: string; code: string | null; productType: ProductType }) => void;
}) {
  const [query, setQuery] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [name, setName] = useState(group.rawSecurityName);
  const [code, setCode] = useState(group.securityCode ?? '');
  const [productType, setProductType] = useState<ProductType>(
    group.productKind === 'fund' ? 'fund' : 'jp_stock'
  );

  const matches = useMemo(() => {
    const key = normalizeName(query);
    if (key === '') return [];
    return securities.filter((s) => s.normalizedName.includes(key)).slice(0, 10);
  }, [query, securities]);

  if (resolved) {
    return (
      <div className="border rounded p-2 bg-green-50 text-sm">
        ✓ {group.rawSecurityName}
        {group.securityCode ? `(${group.securityCode})` : ''} — 解決済み({group.rowCount}行)
      </div>
    );
  }

  return (
    <div className="border rounded p-3 space-y-2">
      <p className="text-sm">
        <span className="font-medium">
          {group.rawSecurityName}
          {group.securityCode ? `(${group.securityCode})` : ''}
        </span>
        {group.market ? ` ・ ${group.market}` : ''} — 該当する銘柄が見つかりません({group.rowCount}行)
      </p>

      <div>
        <label className="block text-xs">既存銘柄を検索</label>
        <input
          type="text"
          className="w-full border rounded px-2 py-1 text-sm"
          placeholder="銘柄名で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {matches.length > 0 && (
          <ul className="border rounded divide-y mt-1">
            {matches.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100"
                  onClick={() => onResolveExisting(s.id)}
                >
                  {s.name} {s.code ? `(${s.code})` : ''} ・ {s.currency}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!showNewForm && (
        <button
          type="button"
          className="text-sm text-blue-600 underline"
          onClick={() => setShowNewForm(true)}
        >
          + 新規銘柄として登録
        </button>
      )}

      {showNewForm && (
        <div className="border rounded p-2 space-y-2 bg-gray-50">
          <div>
            <label className="block text-xs">銘柄名</label>
            <input
              type="text"
              className="w-full border rounded px-2 py-1 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs">コード(投信は空欄)</label>
            <input
              type="text"
              className="w-full border rounded px-2 py-1 text-sm"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs">商品種別</label>
            <select
              className="w-full border rounded px-2 py-1 text-sm"
              value={productType}
              onChange={(e) => setProductType(e.target.value as ProductType)}
            >
              <option value="jp_stock">国内株式</option>
              <option value="etf">ETF</option>
              <option value="fund">投資信託</option>
            </select>
          </div>
          <button
            type="button"
            className="bg-blue-600 text-white px-3 py-1 rounded text-sm"
            onClick={() => onResolveNew({ name, code: code === '' ? null : code, productType })}
          >
            この内容で新規登録
          </button>
        </div>
      )}
    </div>
  );
}
