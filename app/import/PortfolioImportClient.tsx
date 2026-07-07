'use client';

import { useState } from 'react';
import type { ProductType, Security } from '@/domain/types';
import { listSecurities, createSecurity, addSecurityAlias, listTrades, createImportBatch, createPriceSnapshot } from '@/db/repository';
import { computeHoldingQuantities } from '@/domain/holdings';
import {
  parsePortfolioCsv,
  matchPortfolioSecurity,
  computeHoldingDiscrepancies,
  type PortfolioDetailRow,
  type ReconciliationWarning,
} from '@/import/portfolio';
import { FileDropzone, type FileReadResult } from './FileDropzone';
import { UnmatchedSecurityResolver, type UnmatchedGroup } from './UnmatchedSecurityResolver';
import { ImportSummary } from './ImportSummary';
import { PortfolioReconciliationReport, type HoldingDiscrepancyDisplay } from './PortfolioReconciliationReport';

const ACCOUNT_LABEL: Record<string, string> = {
  specific: '特定',
  nisa_growth: 'NISA(成長)',
  nisa_tsumitate: 'NISA(つみたて)',
  old_nisa: '旧NISA',
};

interface ResolvedRow extends PortfolioDetailRow {
  resolvedSecurityId: string;
}

type Step =
  | { kind: 'select' }
  | { kind: 'error'; message: string }
  | { kind: 'preview'; fileName: string; rows: PortfolioDetailRow[]; reconciliationWarnings: ReconciliationWarning[] }
  | {
      kind: 'resolve_securities';
      fileName: string;
      rows: PortfolioDetailRow[];
      reconciliationWarnings: ReconciliationWarning[];
      securities: Security[];
      matchedByRowNumber: Map<number, string>;
      groups: UnmatchedGroup[];
      resolutions: Map<string, string>;
    }
  | { kind: 'committing' }
  | {
      kind: 'summary';
      imported: number;
      reconciliationWarnings: ReconciliationWarning[];
      holdingDiscrepancies: HoldingDiscrepancyDisplay[];
    };

function groupKeyOf(row: PortfolioDetailRow): string {
  return `${row.rawSecurityName}::${row.securityCode ?? ''}`;
}

// implement-p2.md 5.3節画面D: ポートフォリオCSVのウィザード。Tradeを作らずPriceSnapshotを作成する
// ため、重複判定ステップは持たない(取引取込ウィザードとは構造的に異なるためTradeImportClientとは
// 別コンポーネントとする)
export function PortfolioImportClient() {
  const [step, setStep] = useState<Step>({ kind: 'select' });

  function reset() {
    setStep({ kind: 'select' });
  }

  function handleFileRead({ fileName, text }: FileReadResult) {
    const result = parsePortfolioCsv(text);
    if (!result.ok) {
      setStep({ kind: 'error', message: result.errors[0]?.message ?? '不明なエラーです' });
      return;
    }
    setStep({
      kind: 'preview',
      fileName,
      rows: result.rows,
      reconciliationWarnings: result.reconciliationWarnings,
    });
  }

  async function proceedFromPreview(
    fileName: string,
    rows: PortfolioDetailRow[],
    reconciliationWarnings: ReconciliationWarning[]
  ) {
    const securities = await listSecurities();
    const matchedByRowNumber = new Map<number, string>();
    const unmatchedGroupsByKey = new Map<string, UnmatchedGroup>();

    for (const row of rows) {
      const matched = matchPortfolioSecurity(row, securities);
      if (matched) {
        matchedByRowNumber.set(row.rowNumber, matched.id);
        continue;
      }
      const key = groupKeyOf(row);
      const existing = unmatchedGroupsByKey.get(key);
      if (existing) {
        existing.rowCount += 1;
      } else {
        unmatchedGroupsByKey.set(key, {
          key,
          rawSecurityName: row.rawSecurityName,
          securityCode: row.securityCode,
          market: null, // ポートフォリオCSVには市場列がない(表示専用の欠損値)
          productKind: row.productKind,
          rowCount: 1,
          defaultProductType: row.productKind === 'fund' ? 'fund' : 'jp_stock',
        });
      }
    }

    const groups = Array.from(unmatchedGroupsByKey.values());
    if (groups.length === 0) {
      await commitImport(fileName, rows, reconciliationWarnings, matchedByRowNumber, new Map());
      return;
    }

    setStep({
      kind: 'resolve_securities',
      fileName,
      rows,
      reconciliationWarnings,
      securities,
      matchedByRowNumber,
      groups,
      resolutions: new Map(),
    });
  }

  async function handleResolveExisting(
    fileName: string,
    rows: PortfolioDetailRow[],
    reconciliationWarnings: ReconciliationWarning[],
    securities: Security[],
    matchedByRowNumber: Map<number, string>,
    groups: UnmatchedGroup[],
    resolutions: Map<string, string>,
    group: UnmatchedGroup,
    securityId: string
  ) {
    if (group.securityCode === null) {
      await addSecurityAlias(securityId, group.rawSecurityName);
    }
    const nextResolutions = new Map(resolutions);
    nextResolutions.set(group.key, securityId);
    await advanceOrCommit(fileName, rows, reconciliationWarnings, securities, matchedByRowNumber, groups, nextResolutions);
  }

  async function handleResolveNew(
    fileName: string,
    rows: PortfolioDetailRow[],
    reconciliationWarnings: ReconciliationWarning[],
    securities: Security[],
    matchedByRowNumber: Map<number, string>,
    groups: UnmatchedGroup[],
    resolutions: Map<string, string>,
    group: UnmatchedGroup,
    draft: { name: string; code: string | null; productType: ProductType }
  ) {
    const created = await createSecurity({
      name: draft.name,
      code: draft.code,
      productType: draft.productType,
      currency: 'JPY', // ポートフォリオCSVは国内保有のみを対象とする(F3スコープ)
      market: null,
    });
    const nextResolutions = new Map(resolutions);
    nextResolutions.set(group.key, created.id);
    await advanceOrCommit(
      fileName,
      rows,
      reconciliationWarnings,
      [...securities, created],
      matchedByRowNumber,
      groups,
      nextResolutions
    );
  }

  async function advanceOrCommit(
    fileName: string,
    rows: PortfolioDetailRow[],
    reconciliationWarnings: ReconciliationWarning[],
    securities: Security[],
    matchedByRowNumber: Map<number, string>,
    groups: UnmatchedGroup[],
    resolutions: Map<string, string>
  ) {
    if (resolutions.size < groups.length) {
      setStep({
        kind: 'resolve_securities',
        fileName,
        rows,
        reconciliationWarnings,
        securities,
        matchedByRowNumber,
        groups,
        resolutions,
      });
      return;
    }
    await commitImport(fileName, rows, reconciliationWarnings, matchedByRowNumber, resolutions);
  }

  async function commitImport(
    fileName: string,
    rows: PortfolioDetailRow[],
    reconciliationWarnings: ReconciliationWarning[],
    matchedByRowNumber: Map<number, string>,
    resolutions: Map<string, string>
  ) {
    setStep({ kind: 'committing' });

    const resolvedRows: ResolvedRow[] = rows.map((row) => {
      const securityId = matchedByRowNumber.get(row.rowNumber) ?? resolutions.get(groupKeyOf(row));
      if (!securityId) {
        throw new Error('内部エラー: 銘柄解決に失敗した行があります');
      }
      return { ...row, resolvedSecurityId: securityId };
    });

    const batch = await createImportBatch({
      fileType: 'portfolio',
      fileName,
      counts: { imported: resolvedRows.length, skipped: 0, error: 0 },
    });

    const snapshotAt = new Date().toISOString().slice(0, 10);
    for (const row of resolvedRows) {
      await createPriceSnapshot({
        securityId: row.resolvedSecurityId,
        snapshotAt,
        price: row.currentPrice,
        quantity: row.quantity,
        currency: 'JPY',
        batchId: batch.id,
      });
    }

    // 仕様書6.3 L203: 取引記録由来の保有数量とCSV保有数量の差異レポート
    const existingTrades = await listTrades();
    const holdingQuantities = computeHoldingQuantities(existingTrades);
    const securities = await listSecurities();
    const securityNameById = new Map(securities.map((s) => [s.id, s.name]));
    const discrepancies = computeHoldingDiscrepancies(
      resolvedRows.map((r) => ({
        resolvedSecurityId: r.resolvedSecurityId,
        accountType: r.accountType,
        quantity: r.quantity,
      })),
      holdingQuantities
    ).map((d) => ({
      securityId: d.securityId,
      securityName: securityNameById.get(d.securityId) ?? '(不明な銘柄)',
      accountType: d.accountType,
      csvQuantity: d.csvQuantity,
      computedQuantity: d.computedQuantity,
      difference: d.difference,
    }));

    setStep({
      kind: 'summary',
      imported: resolvedRows.length,
      reconciliationWarnings,
      holdingDiscrepancies: discrepancies,
    });
  }

  if (step.kind === 'select') {
    return (
      <FileDropzone
        label="ポートフォリオCSV(ポートフォリオ_YYYYMMDD.csv)を選択"
        acceptedTypes={['portfolio']}
        onFileRead={handleFileRead}
        onUnsupportedFile={(message) => setStep({ kind: 'error', message })}
      />
    );
  }

  if (step.kind === 'error') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">{step.message}</p>
        <button type="button" className="text-sm underline" onClick={reset}>
          別のファイルを選び直す
        </button>
      </div>
    );
  }

  if (step.kind === 'preview') {
    const preview = step.rows.slice(0, 20);
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          {step.rows.length}行を解釈しました(先頭{preview.length}行を表示)。
        </p>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">銘柄</th>
              <th className="p-2">口座</th>
              <th className="p-2">数量</th>
              <th className="p-2">取得単価</th>
              <th className="p-2">現在値</th>
              <th className="p-2">損益</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((row) => (
              <tr key={row.rowNumber} className="border-b">
                <td className="p-2">
                  {row.rawSecurityName}
                  {row.securityCode ? `(${row.securityCode})` : ''}
                </td>
                <td className="p-2">{ACCOUNT_LABEL[row.accountType]}</td>
                <td className="p-2">{row.quantity}</td>
                <td className="p-2">{row.acquisitionPrice}</td>
                <td className="p-2">{row.currentPrice}</td>
                <td className="p-2">{row.pnl}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-2">
          <button
            type="button"
            className="bg-blue-600 text-white px-4 py-1 rounded"
            onClick={() => void proceedFromPreview(step.fileName, step.rows, step.reconciliationWarnings)}
          >
            次へ
          </button>
          <button type="button" className="px-4 py-1 rounded border" onClick={reset}>
            キャンセル
          </button>
        </div>
      </div>
    );
  }

  if (step.kind === 'resolve_securities') {
    const allResolved = step.resolutions.size >= step.groups.length;
    return (
      <div className="space-y-4">
        <UnmatchedSecurityResolver
          groups={step.groups}
          securities={step.securities}
          resolutions={step.resolutions}
          onResolveExisting={(group, securityId) =>
            void handleResolveExisting(
              step.fileName,
              step.rows,
              step.reconciliationWarnings,
              step.securities,
              step.matchedByRowNumber,
              step.groups,
              step.resolutions,
              group,
              securityId
            )
          }
          onResolveNew={(group, draft) =>
            void handleResolveNew(
              step.fileName,
              step.rows,
              step.reconciliationWarnings,
              step.securities,
              step.matchedByRowNumber,
              step.groups,
              step.resolutions,
              group,
              draft
            )
          }
        />
        <button
          type="button"
          className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50"
          disabled={!allResolved}
          onClick={() =>
            void advanceOrCommit(
              step.fileName,
              step.rows,
              step.reconciliationWarnings,
              step.securities,
              step.matchedByRowNumber,
              step.groups,
              step.resolutions
            )
          }
        >
          次へ
        </button>
      </div>
    );
  }

  if (step.kind === 'committing') {
    return <p className="text-sm text-gray-500">取込中...</p>;
  }

  return (
    <div className="space-y-4">
      <ImportSummary imported={step.imported} skipped={0} error={0} errorRows={[]} />
      <PortfolioReconciliationReport
        reconciliationWarnings={step.reconciliationWarnings}
        holdingDiscrepancies={step.holdingDiscrepancies}
      />
      <button type="button" className="text-sm underline" onClick={reset}>
        別のファイルを取込む
      </button>
    </div>
  );
}
