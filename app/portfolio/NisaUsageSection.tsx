'use client';

import { useState } from 'react';
import type { NisaUsage } from '@/domain/types';
import { setNisaUsage, deleteNisaUsage } from '@/db/repository';
import { formatJPY, parseJPYAmountAllowZero } from '@/domain/money';

interface Props {
  nisaUsages: NisaUsage[];
  onChanged: () => Promise<void>;
}

const FRAME_LABEL: Record<NisaUsage['frameType'], string> = {
  growth: '成長投資枠',
  tsumitate: 'つみたて投資枠',
};

function currentYear(): number {
  return new Date().getFullYear();
}

// implement-p3.md 8章: NISA枠(年・枠種別ごと)の利用額・年間上限額を手入力管理する。
// 年間上限額も制度改正に備えユーザーが編集できる設定値としてハードコードしない
export function NisaUsageSection({ nisaUsages, onChanged }: Props) {
  const [year, setYear] = useState(String(currentYear()));
  const [frameType, setFrameType] = useState<NisaUsage['frameType']>('growth');
  const [usedAmount, setUsedAmount] = useState('');
  const [annualLimit, setAnnualLimit] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedYear = Number(year);
    const parsedUsed = parseJPYAmountAllowZero(usedAmount);
    const parsedLimit = parseJPYAmountAllowZero(annualLimit);
    if (!Number.isFinite(parsedYear) || parsedUsed === null || parsedLimit === null) return;
    await setNisaUsage({ year: parsedYear, frameType, usedAmount: parsedUsed, annualLimit: parsedLimit });
    setUsedAmount('');
    setAnnualLimit('');
    await onChanged();
  }

  async function handleDelete(usage: NisaUsage) {
    if (!window.confirm(`${usage.year}年 ${FRAME_LABEL[usage.frameType]}の記録を削除しますか?`)) return;
    await deleteNisaUsage(usage.id);
    await onChanged();
  }

  const sorted = [...nisaUsages].sort((a, b) => b.year - a.year || a.frameType.localeCompare(b.frameType));

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">NISA枠管理</h2>
      <form onSubmit={handleSubmit} className="flex gap-4 items-end border rounded p-4 flex-wrap">
        <div>
          <label className="block text-sm font-medium">年</label>
          <input
            type="text"
            inputMode="numeric"
            className="border rounded px-2 py-1 w-20"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">枠種別</label>
          <select
            className="border rounded px-2 py-1"
            value={frameType}
            onChange={(e) => setFrameType(e.target.value as NisaUsage['frameType'])}
          >
            <option value="growth">成長投資枠</option>
            <option value="tsumitate">つみたて投資枠</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">利用額(円)</label>
          <input
            type="text"
            inputMode="numeric"
            className="border rounded px-2 py-1 w-28"
            value={usedAmount}
            onChange={(e) => setUsedAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">年間上限額(円)</label>
          <input
            type="text"
            inputMode="numeric"
            className="border rounded px-2 py-1 w-28"
            value={annualLimit}
            onChange={(e) => setAnnualLimit(e.target.value)}
          />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-1 rounded">
          登録・更新
        </button>
      </form>

      {sorted.length === 0 ? (
        <p className="text-sm text-gray-500">登録されたNISA枠はまだありません。</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">年</th>
              <th className="p-2">枠種別</th>
              <th className="p-2">利用額</th>
              <th className="p-2">年間上限額</th>
              <th className="p-2">残枠</th>
              <th className="p-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((usage) => (
              <tr key={usage.id} className="border-b">
                <td className="p-2">{usage.year}</td>
                <td className="p-2">{FRAME_LABEL[usage.frameType]}</td>
                <td className="p-2">{formatJPY(usage.usedAmount)}</td>
                <td className="p-2">{formatJPY(usage.annualLimit)}</td>
                <td className="p-2">{formatJPY(usage.annualLimit - usage.usedAmount)}</td>
                <td className="p-2">
                  <button type="button" className="text-red-600 underline" onClick={() => void handleDelete(usage)}>
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
