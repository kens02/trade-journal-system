'use client';

import { useState } from 'react';
import type { FxRate } from '@/domain/types';
import { createFxRate } from '@/db/repository';

interface Props {
  fxRates: FxRate[];
  onChanged: () => Promise<void>;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// implement-p3.md 8章: 為替レート(USD/JPY)の手動登録。JPY換算は表示目的のみで精度を重視しない(C7決定)。
// 米国株の損益・集計自体はUSDで閉じたままこの画面では変更しない
export function FxRateSection({ fxRates, onChanged }: Props) {
  const [rate, setRate] = useState('');
  const [asOf, setAsOf] = useState(today());

  const sorted = [...fxRates].sort((a, b) => b.asOf.localeCompare(a.asOf));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedRate = Number(rate);
    if (!Number.isFinite(parsedRate) || parsedRate <= 0 || asOf === '') return;
    await createFxRate({ currencyPair: 'USD/JPY', rate: parsedRate, asOf });
    setRate('');
    await onChanged();
  }

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">為替レート(USD/JPY)</h2>
      <p className="text-xs text-gray-500">
        ※JPY換算は表示・リバランス計算用の参考値です。米国株の損益・集計はUSDのまま変わりません。
      </p>
      <form onSubmit={handleSubmit} className="flex gap-4 items-end border rounded p-4">
        <div>
          <label className="block text-sm font-medium">レート(1USD=?円)</label>
          <input
            type="text"
            inputMode="decimal"
            className="border rounded px-2 py-1 w-24"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">基準日</label>
          <input
            type="date"
            className="border rounded px-2 py-1"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
          />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-1 rounded">
          登録
        </button>
      </form>

      {sorted.length === 0 ? (
        <p className="text-sm text-gray-500">登録された為替レートはまだありません。</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">基準日</th>
              <th className="p-2">レート</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((fxRate) => (
              <tr key={fxRate.id} className="border-b">
                <td className="p-2">{fxRate.asOf}</td>
                <td className="p-2">{fxRate.rate.toFixed(2)}円</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
