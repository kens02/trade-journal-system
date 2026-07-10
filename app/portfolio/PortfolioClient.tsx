'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Security,
  Sector,
  PriceSnapshot,
  CashBalance,
  Currency,
  AccountType,
  TargetAllocation,
  FxRate,
  NisaUsage,
} from '@/domain/types';
import {
  listTrades,
  listSecurities,
  listSectors,
  listPriceSnapshots,
  listCashBalances,
  createPriceSnapshot,
  setCashBalance,
  listTargetAllocations,
  listFxRates,
  listNisaUsages,
} from '@/db/repository';
import { computeAverageCostPositions, type HoldingPosition } from '@/domain/holdings';
import { computeSectorAllocation } from '@/domain/portfolio';
import { buildRebalancePlan } from '@/domain/rebalance';
import {
  formatJPY,
  formatUSD,
  parseJPYAmount,
  parseUSDAmount,
  parseJPYAmountAllowZero,
  parseUSDAmountAllowZero,
} from '@/domain/money';
import { TargetAllocationSection } from './TargetAllocationSection';
import { RebalanceSection } from './RebalanceSection';
import { FxRateSection } from './FxRateSection';
import { NisaUsageSection } from './NisaUsageSection';

const ACCOUNT_LABEL: Record<AccountType, string> = {
  specific: '特定',
  nisa_growth: 'NISA(成長)',
  nisa_tsumitate: 'NISA(つみたて)',
  old_nisa: '旧NISA',
};

function formatAmount(amount: number, currency: Currency): string {
  return currency === 'JPY' ? formatJPY(Math.round(amount)) : formatUSD(Math.round(amount));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// implement-p3.md 6.2節: 保有ポジション(数量+口座区分ごとの移動平均取得単価。参考値でありFIFOの実現損益とは別)
// +現在値(PriceSnapshot最新値、未登録は手動入力)+セクター別配分(現金含む、通貨は分離)を表示する
export function PortfolioClient() {
  const [securities, setSecurities] = useState<Security[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [priceSnapshots, setPriceSnapshots] = useState<PriceSnapshot[]>([]);
  const [cashBalances, setCashBalances] = useState<CashBalance[]>([]);
  const [positions, setPositions] = useState<HoldingPosition[]>([]);
  const [targetAllocations, setTargetAllocations] = useState<TargetAllocation[]>([]);
  const [fxRates, setFxRates] = useState<FxRate[]>([]);
  const [nisaUsages, setNisaUsages] = useState<NisaUsage[]>([]);
  const [noSellMode, setNoSellMode] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [manualPriceDraft, setManualPriceDraft] = useState<Record<string, string>>({});
  const [cashDraft, setCashDraft] = useState<{ jpy: string; usd: string }>({ jpy: '', usd: '' });

  const refresh = useCallback(async () => {
    const [trades, securityRows, sectorRows, snapshotRows, cashRows, allocationRows, fxRateRows, nisaRows] =
      await Promise.all([
        listTrades(),
        listSecurities(),
        listSectors(),
        listPriceSnapshots(),
        listCashBalances(),
        listTargetAllocations(),
        listFxRates(),
        listNisaUsages(),
      ]);
    setSecurities(securityRows);
    setSectors(sectorRows);
    setPriceSnapshots(snapshotRows);
    setCashBalances(cashRows);
    setPositions(computeAverageCostPositions(trades));
    setTargetAllocations(allocationRows);
    setFxRates(fxRateRows);
    setNisaUsages(nisaRows);
    setCashDraft({
      jpy: String(cashRows.find((c) => c.currency === 'JPY')?.amount ?? 0),
      usd: ((cashRows.find((c) => c.currency === 'USD')?.amount ?? 0) / 100).toFixed(2),
    });
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const securityById = useMemo(() => new Map(securities.map((s) => [s.id, s])), [securities]);

  // 仕様書6.3・implement-p3.md 6.2節: 銘柄ごとの最新PriceSnapshot(snapshotAt降順の先頭)を現在値とする
  const currentPriceBySecurityId = useMemo(() => {
    const latestBySecurityId = new Map<string, PriceSnapshot>();
    for (const snapshot of priceSnapshots) {
      const existing = latestBySecurityId.get(snapshot.securityId);
      if (!existing || snapshot.snapshotAt > existing.snapshotAt) {
        latestBySecurityId.set(snapshot.securityId, snapshot);
      }
    }
    const map = new Map<string, number>();
    for (const [securityId, snapshot] of latestBySecurityId) {
      map.set(securityId, snapshot.price);
    }
    return map;
  }, [priceSnapshots]);

  async function handleSetManualPrice(security: Security, positionQuantity: number) {
    const raw = manualPriceDraft[security.id] ?? '';
    const parsed = security.currency === 'JPY' ? parseJPYAmount(raw) : parseUSDAmount(raw);
    if (parsed === null) return;
    await createPriceSnapshot({
      securityId: security.id,
      snapshotAt: today(),
      price: parsed,
      quantity: positionQuantity,
      currency: security.currency,
      batchId: 'manual',
    });
    setManualPriceDraft((prev) => ({ ...prev, [security.id]: '' }));
    await refresh();
  }

  async function handleSaveCash(e: React.FormEvent) {
    e.preventDefault();
    const jpyAmount = parseJPYAmountAllowZero(cashDraft.jpy || '0');
    const usdAmount = parseUSDAmountAllowZero(cashDraft.usd || '0');
    if (jpyAmount !== null) {
      await setCashBalance({ currency: 'JPY', amount: jpyAmount });
    }
    if (usdAmount !== null) {
      await setCashBalance({ currency: 'USD', amount: usdAmount });
    }
    await refresh();
  }

  if (!loaded) {
    return <p className="text-sm text-gray-500">読み込み中...</p>;
  }

  const jpyCash = cashBalances.find((c) => c.currency === 'JPY');
  const usdCash = cashBalances.find((c) => c.currency === 'USD');
  const jpyAllocation = computeSectorAllocation(
    positions,
    currentPriceBySecurityId,
    securities,
    sectors,
    jpyCash,
    'JPY'
  );
  const usdAllocation = computeSectorAllocation(
    positions,
    currentPriceBySecurityId,
    securities,
    sectors,
    usdCash,
    'USD'
  );

  // implement-p3.md 7章: リバランス計算(通貨混在を1つの比率で扱う)のみUSD/JPYレートで換算する。
  // 8章のFX管理画面(F6)実装前でも、repositoryに登録済みのレートがあれば利用できるようasOf最新のものを使う
  const latestUsdJpyRate = fxRates
    .filter((r) => r.currencyPair === 'USD/JPY')
    .sort((a, b) => b.asOf.localeCompare(a.asOf))[0]?.rate;
  const rebalancePlan = buildRebalancePlan({
    allocations: targetAllocations,
    positions,
    currentPriceBySecurityId,
    securities,
    sectors,
    cashBalances,
    usdJpyRate: latestUsdJpyRate ?? null,
    noSellMode,
  });

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="text-lg font-bold">保有ポジション</h2>
        <p className="text-xs text-gray-500">
          ※取得単価は移動平均による参考値です。実現損益(FIFO)の計算には使用していません。
        </p>
        {positions.length === 0 ? (
          <p className="text-sm text-gray-500">保有ポジションはありません。</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">銘柄</th>
                <th className="p-2">口座区分</th>
                <th className="p-2">数量</th>
                <th className="p-2">平均取得単価</th>
                <th className="p-2">現在値</th>
                <th className="p-2">評価額</th>
                <th className="p-2">JPY換算(参考)</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => {
                const security = securityById.get(position.securityId);
                const currentPrice = currentPriceBySecurityId.get(position.securityId);
                const evaluationAmount =
                  currentPrice !== undefined ? position.quantity * currentPrice : null;
                const evaluationAmountJpy =
                  position.currency === 'USD' && evaluationAmount !== null && latestUsdJpyRate !== undefined
                    ? Math.round((evaluationAmount / 100) * latestUsdJpyRate)
                    : null;
                return (
                  <tr key={`${position.securityId}::${position.accountType}`} className="border-b">
                    <td className="p-2">{security?.name ?? '(不明な銘柄)'}</td>
                    <td className="p-2">{ACCOUNT_LABEL[position.accountType]}</td>
                    <td className="p-2">{position.quantity}</td>
                    <td className="p-2">
                      {formatAmount(position.averageCostAmount, position.currency)}/株
                    </td>
                    <td className="p-2">
                      {currentPrice !== undefined ? (
                        formatAmount(currentPrice, position.currency)
                      ) : security ? (
                        <div className="flex gap-1 items-center">
                          <input
                            type="text"
                            className="border rounded px-1 py-0.5 w-24"
                            placeholder={position.currency === 'JPY' ? '例: 1500' : '例: 150.25'}
                            value={manualPriceDraft[security.id] ?? ''}
                            onChange={(e) =>
                              setManualPriceDraft((prev) => ({ ...prev, [security.id]: e.target.value }))
                            }
                          />
                          <button
                            type="button"
                            className="text-blue-600 underline text-xs"
                            onClick={() => void handleSetManualPrice(security, position.quantity)}
                          >
                            設定
                          </button>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-2">
                      {evaluationAmount !== null ? formatAmount(evaluationAmount, position.currency) : '未登録'}
                    </td>
                    <td className="p-2 text-gray-500">
                      {position.currency === 'JPY'
                        ? '—'
                        : evaluationAmountJpy !== null
                          ? formatJPY(evaluationAmountJpy)
                          : '為替レート未登録'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">現金残高</h2>
        <form onSubmit={handleSaveCash} className="flex gap-4 items-end border rounded p-4">
          <div>
            <label className="block text-sm font-medium">JPY(円)</label>
            <input
              type="text"
              className="border rounded px-2 py-1"
              value={cashDraft.jpy}
              onChange={(e) => setCashDraft((prev) => ({ ...prev, jpy: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium">USD(ドル)</label>
            <input
              type="text"
              className="border rounded px-2 py-1"
              value={cashDraft.usd}
              onChange={(e) => setCashDraft((prev) => ({ ...prev, usd: e.target.value }))}
            />
          </div>
          <button type="submit" className="bg-blue-600 text-white px-4 py-1 rounded">
            保存
          </button>
        </form>
      </section>

      <SectorAllocationSection title="セクター別配分(JPY)" allocation={jpyAllocation} currency="JPY" />
      <SectorAllocationSection title="セクター別配分(USD)" allocation={usdAllocation} currency="USD" />

      <FxRateSection fxRates={fxRates} onChanged={refresh} />
      <NisaUsageSection nisaUsages={nisaUsages} onChanged={refresh} />

      <TargetAllocationSection sectors={sectors} allocations={targetAllocations} onChanged={refresh} />
      <RebalanceSection
        plan={rebalancePlan}
        hasAllocations={targetAllocations.length > 0}
        noSellMode={noSellMode}
        onToggleNoSellMode={setNoSellMode}
        nisaUsages={nisaUsages}
        rebalanceYear={new Date().getFullYear()}
      />
    </div>
  );
}

function SectorAllocationSection({
  title,
  allocation,
  currency,
}: {
  title: string;
  allocation: ReturnType<typeof computeSectorAllocation>;
  currency: Currency;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">{title}</h2>
      {allocation.entries.length === 0 ? (
        <p className="text-sm text-gray-500">評価額を算出できる保有・現金がありません。</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">区分</th>
              <th className="p-2">評価額</th>
              <th className="p-2">比率</th>
            </tr>
          </thead>
          <tbody>
            {allocation.entries.map((entry) => (
              <tr key={`${entry.kind}:${entry.sectorId ?? entry.label}`} className="border-b">
                <td className="p-2">{entry.label}</td>
                <td className="p-2">{formatAmount(entry.evaluationAmount, currency)}</td>
                <td className="p-2">{entry.percent.toFixed(1)}%</td>
              </tr>
            ))}
            <tr className="font-medium">
              <td className="p-2">合計</td>
              <td className="p-2">{formatAmount(allocation.totalAmount, currency)}</td>
              <td className="p-2">100.0%</td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
