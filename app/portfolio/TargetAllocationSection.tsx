'use client';

import { useState } from 'react';
import type { Sector, TargetAllocation } from '@/domain/types';
import {
  createTargetAllocation,
  updateTargetAllocation,
  deleteTargetAllocation,
} from '@/db/repository';
import { validateTargetAllocationTotals } from '@/domain/rebalance';

interface Props {
  sectors: Sector[];
  allocations: TargetAllocation[];
  onChanged: () => Promise<void>;
}

// implement-p3.md 7章: 目標配分(アセットクラス自由入力ラベル→セクター)の階層管理UI。
// 同一階層内の合計100%バリデーションをvalidateTargetAllocationTotalsで検証し、エラーがあれば警告表示する
export function TargetAllocationSection({ sectors, allocations, onChanged }: Props) {
  const [newAssetClassLabel, setNewAssetClassLabel] = useState('');
  const [newAssetClassPercent, setNewAssetClassPercent] = useState('');
  const [newSectorDraft, setNewSectorDraft] = useState<Record<string, { sectorId: string; percent: string }>>({});

  const assetClasses = allocations.filter((a) => a.level === 'asset_class');
  const errors = validateTargetAllocationTotals(allocations);
  const errorByParentId = new Map(errors.map((e) => [e.parentId, e]));

  async function handleAddAssetClass(e: React.FormEvent) {
    e.preventDefault();
    const label = newAssetClassLabel.trim();
    const percent = Number(newAssetClassPercent);
    if (label === '' || !Number.isFinite(percent)) return;
    await createTargetAllocation({ label, level: 'asset_class', parentId: null, targetPercent: percent, sectorId: null });
    setNewAssetClassLabel('');
    setNewAssetClassPercent('');
    await onChanged();
  }

  async function handleAddSector(assetClassId: string) {
    const draft = newSectorDraft[assetClassId];
    if (!draft || draft.sectorId === '') return;
    const percent = Number(draft.percent);
    if (!Number.isFinite(percent)) return;
    const sector = sectors.find((s) => s.id === draft.sectorId);
    if (!sector) return;
    await createTargetAllocation({
      label: sector.name,
      level: 'sector',
      parentId: assetClassId,
      targetPercent: percent,
      sectorId: sector.id,
    });
    setNewSectorDraft((prev) => ({ ...prev, [assetClassId]: { sectorId: '', percent: '' } }));
    await onChanged();
  }

  async function handleUpdatePercent(allocation: TargetAllocation, value: string) {
    const percent = Number(value);
    if (!Number.isFinite(percent)) return;
    await updateTargetAllocation(allocation.id, { targetPercent: percent });
    await onChanged();
  }

  async function handleDelete(allocation: TargetAllocation) {
    const hasChildren = allocation.level === 'asset_class' && allocations.some((a) => a.parentId === allocation.id);
    const message = hasChildren
      ? `「${allocation.label}」を削除しますか?配下のセクター配分も削除されます。この操作は取り消せません。`
      : `「${allocation.label}」を削除しますか?この操作は取り消せません。`;
    if (!window.confirm(message)) return;
    await deleteTargetAllocation(allocation.id);
    await onChanged();
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold">目標配分</h2>

      {errorByParentId.has(null) && (
        <p className="text-sm text-red-600">
          アセットクラス全体の合計が100%ではありません(現在: {errorByParentId.get(null)?.total}%)。
        </p>
      )}

      <form onSubmit={handleAddAssetClass} className="flex gap-2 items-end border rounded p-4">
        <div>
          <label className="block text-sm font-medium">アセットクラス名</label>
          <input
            type="text"
            className="border rounded px-2 py-1"
            value={newAssetClassLabel}
            onChange={(e) => setNewAssetClassLabel(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">目標比率(%)</label>
          <input
            type="text"
            inputMode="decimal"
            className="border rounded px-2 py-1 w-20"
            value={newAssetClassPercent}
            onChange={(e) => setNewAssetClassPercent(e.target.value)}
          />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-1 rounded">
          アセットクラスを追加
        </button>
      </form>

      {assetClasses.length === 0 ? (
        <p className="text-sm text-gray-500">登録されたアセットクラスはまだありません。</p>
      ) : (
        <div className="space-y-4">
          {assetClasses.map((assetClass) => {
            const children = allocations.filter((a) => a.parentId === assetClass.id);
            const childError = errorByParentId.get(assetClass.id);
            const draft = newSectorDraft[assetClass.id] ?? { sectorId: '', percent: '' };
            const usedSectorIds = new Set(children.map((c) => c.sectorId));
            const availableSectors = sectors.filter((s) => !usedSectorIds.has(s.id));

            return (
              <div key={assetClass.id} className="border rounded p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{assetClass.label}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="border rounded px-2 py-0.5 w-16 text-sm"
                    defaultValue={assetClass.targetPercent}
                    onBlur={(e) => void handleUpdatePercent(assetClass, e.target.value)}
                  />
                  <span className="text-sm">%</span>
                  <button
                    type="button"
                    className="text-red-600 underline text-sm ml-auto"
                    onClick={() => void handleDelete(assetClass)}
                  >
                    削除
                  </button>
                </div>

                {childError && (
                  <p className="text-xs text-red-600">
                    このアセットクラス配下のセクター合計が100%ではありません(現在: {childError.total}%)。
                  </p>
                )}

                {children.length > 0 && (
                  <table className="w-full text-xs border-collapse">
                    <tbody>
                      {children.map((child) => (
                        <tr key={child.id} className="border-b">
                          <td className="p-1 pl-4">{child.label}</td>
                          <td className="p-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              className="border rounded px-2 py-0.5 w-16"
                              defaultValue={child.targetPercent}
                              onBlur={(e) => void handleUpdatePercent(child, e.target.value)}
                            />
                            %
                          </td>
                          <td className="p-1">
                            <button
                              type="button"
                              className="text-red-600 underline"
                              onClick={() => void handleDelete(child)}
                            >
                              削除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {availableSectors.length > 0 && (
                  <div className="flex gap-2 items-end pl-4">
                    <div>
                      <label className="block text-xs">セクターを追加</label>
                      <select
                        className="border rounded px-2 py-0.5 text-sm"
                        value={draft.sectorId}
                        onChange={(e) =>
                          setNewSectorDraft((prev) => ({
                            ...prev,
                            [assetClass.id]: { ...draft, sectorId: e.target.value },
                          }))
                        }
                      >
                        <option value="">選択してください</option>
                        {availableSectors.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="border rounded px-2 py-0.5 w-16 text-sm"
                      placeholder="%"
                      value={draft.percent}
                      onChange={(e) =>
                        setNewSectorDraft((prev) => ({ ...prev, [assetClass.id]: { ...draft, percent: e.target.value } }))
                      }
                    />
                    <button
                      type="button"
                      className="text-blue-600 underline text-sm"
                      onClick={() => void handleAddSector(assetClass.id)}
                    >
                      追加
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
