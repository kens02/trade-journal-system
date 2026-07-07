'use client';

import { useState } from 'react';
import type { ProductType, Security, Currency, TradeSide, AccountType } from '@/domain/types';
import {
  listSecurities,
  createSecurity,
  addSecurityAlias,
  listTrades,
  createTrade,
  createImportBatch,
} from '@/db/repository';
import { parseDomesticHistoryCsv, type DomesticHistoryRow } from '@/import/domesticHistory';
import { parseUsHistoryCsv, type UsHistoryRow } from '@/import/usHistory';
import { duplicateKey, matchSecurity } from '@/import/common';
import { FileDropzone, type FileReadResult } from './FileDropzone';
import { ImportPreviewTable } from './ImportPreviewTable';
import { UnmatchedSecurityResolver, type UnmatchedGroup } from './UnmatchedSecurityResolver';
import { DuplicateResolver, type CollisionInfo } from './DuplicateResolver';
import { ImportSummary } from './ImportSummary';

// implement-p2.md F3: DomesticHistoryRow/UsHistoryRowの共通部分を取引取込ウィザードで
// 一元的に扱うための橋渡し型。ファイル種別ごとの差異(投信再投資フラグ/実効コスト等)は
// 吸収し、以降のウィザードロジック(照合・重複判定・コミット)を共通化する
export interface TradeImportableRow {
  rowNumber: number;
  tradeDate: string;
  rawSecurityName: string;
  securityCode: string | null;
  market: string | null;
  side: TradeSide;
  accountType: AccountType;
  quantity: number;
  price: number;
  amount: number;
  currency: Currency;
  impliedCost?: number;
  note: string;
  defaultProductType: ProductType;
}

function domesticRowToImportable(row: DomesticHistoryRow): TradeImportableRow {
  return {
    rowNumber: row.rowNumber,
    tradeDate: row.tradeDate,
    rawSecurityName: row.rawSecurityName,
    securityCode: row.securityCode,
    market: row.market,
    side: row.side,
    accountType: row.accountType,
    quantity: row.quantity,
    price: row.price,
    amount: row.amount,
    currency: 'JPY',
    note: row.isDistributionReinvestment ? '分配金再投資(CSV取込)' : '',
    defaultProductType: row.productKind === 'fund' ? 'fund' : 'jp_stock',
  };
}

function usRowToImportable(row: UsHistoryRow): TradeImportableRow {
  return {
    rowNumber: row.rowNumber,
    tradeDate: row.tradeDate,
    rawSecurityName: row.rawSecurityName,
    securityCode: row.ticker,
    market: row.market,
    side: row.side,
    accountType: row.accountType,
    quantity: row.quantity,
    price: row.price,
    amount: row.amount,
    currency: 'USD',
    impliedCost: row.impliedCost,
    note: '',
    defaultProductType: 'us_stock',
  };
}

interface ParseErrorLike {
  rowNumber?: number;
  message: string;
}

interface ResolvedRow extends TradeImportableRow {
  resolvedSecurityId: string;
}

type FileType = 'domestic_history' | 'us_history';

type Step =
  | { kind: 'select' }
  | { kind: 'error'; message: string }
  | { kind: 'preview'; fileType: FileType; fileName: string; rows: TradeImportableRow[]; parseErrors: ParseErrorLike[] }
  | {
      kind: 'resolve_securities';
      fileType: FileType;
      fileName: string;
      rows: TradeImportableRow[];
      parseErrors: ParseErrorLike[];
      securities: Security[];
      matchedByRowNumber: Map<number, string>;
      groups: UnmatchedGroup[];
      resolutions: Map<string, string>;
    }
  | {
      kind: 'resolve_duplicates';
      fileType: FileType;
      fileName: string;
      resolvedRows: ResolvedRow[];
      parseErrors: ParseErrorLike[];
      collisions: CollisionInfo[];
      decisions: Map<number, 'keep' | 'skip'>;
    }
  | { kind: 'committing' }
  | {
      kind: 'summary';
      imported: number;
      skipped: number;
      error: number;
      errorRows: { rowNumber: number; reason: string }[];
    };

function groupKeyOf(row: TradeImportableRow): string {
  return `${row.rawSecurityName}::${row.securityCode ?? ''}::${row.market ?? ''}`;
}

// implement-p2.md 5.3節画面D: 取引を生成する取込(約定履歴照会CSV・米国株式約定履歴CSV)のウィザード
export function TradeImportClient() {
  const [step, setStep] = useState<Step>({ kind: 'select' });

  function reset() {
    setStep({ kind: 'select' });
  }

  function handleFileRead({ fileName, text, fileType }: FileReadResult) {
    if (fileType === 'domestic_history') {
      const result = parseDomesticHistoryCsv(text);
      if (!result.ok) {
        setStep({ kind: 'error', message: result.errors[0]?.message ?? '不明なエラーです' });
        return;
      }
      setStep({
        kind: 'preview',
        fileType,
        fileName,
        rows: result.rows.map(domesticRowToImportable),
        parseErrors: result.errors,
      });
      return;
    }

    const result = parseUsHistoryCsv(text);
    if (!result.ok) {
      setStep({ kind: 'error', message: result.errors[0]?.message ?? '不明なエラーです' });
      return;
    }
    setStep({
      kind: 'preview',
      fileType: 'us_history',
      fileName,
      rows: result.rows.map(usRowToImportable),
      parseErrors: result.errors,
    });
  }

  async function proceedFromPreview(
    fileType: FileType,
    fileName: string,
    rows: TradeImportableRow[],
    parseErrors: ParseErrorLike[]
  ) {
    const securities = await listSecurities();
    const matchedByRowNumber = new Map<number, string>();
    const unmatchedGroupsByKey = new Map<string, UnmatchedGroup>();

    for (const row of rows) {
      const matched = matchSecurity(row, securities);
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
          market: row.market,
          productKind: row.defaultProductType === 'fund' ? 'fund' : 'stock_or_etf',
          rowCount: 1,
          defaultProductType: row.defaultProductType,
        });
      }
    }

    const groups = Array.from(unmatchedGroupsByKey.values());
    if (groups.length === 0) {
      await proceedToDuplicateCheck(fileType, fileName, rows, parseErrors, matchedByRowNumber, new Map());
      return;
    }

    setStep({
      kind: 'resolve_securities',
      fileType,
      fileName,
      rows,
      parseErrors,
      securities,
      matchedByRowNumber,
      groups,
      resolutions: new Map(),
    });
  }

  async function handleResolveExisting(
    fileType: FileType,
    fileName: string,
    rows: TradeImportableRow[],
    parseErrors: ParseErrorLike[],
    securities: Security[],
    matchedByRowNumber: Map<number, string>,
    groups: UnmatchedGroup[],
    resolutions: Map<string, string>,
    group: UnmatchedGroup,
    securityId: string
  ) {
    // 投信名の表記ゆれ等をエイリアスとして保存し、次回以降の自動照合に備える(仕様書6.3)
    if (group.securityCode === null) {
      await addSecurityAlias(securityId, group.rawSecurityName);
    }
    const nextResolutions = new Map(resolutions);
    nextResolutions.set(group.key, securityId);
    await advanceOrStayOnSecurityResolution(
      fileType,
      fileName,
      rows,
      parseErrors,
      securities,
      matchedByRowNumber,
      groups,
      nextResolutions
    );
  }

  async function handleResolveNew(
    fileType: FileType,
    fileName: string,
    rows: TradeImportableRow[],
    parseErrors: ParseErrorLike[],
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
      currency: fileType === 'us_history' ? 'USD' : 'JPY',
      market: group.market,
    });
    const nextResolutions = new Map(resolutions);
    nextResolutions.set(group.key, created.id);
    await advanceOrStayOnSecurityResolution(
      fileType,
      fileName,
      rows,
      parseErrors,
      [...securities, created],
      matchedByRowNumber,
      groups,
      nextResolutions
    );
  }

  async function advanceOrStayOnSecurityResolution(
    fileType: FileType,
    fileName: string,
    rows: TradeImportableRow[],
    parseErrors: ParseErrorLike[],
    securities: Security[],
    matchedByRowNumber: Map<number, string>,
    groups: UnmatchedGroup[],
    resolutions: Map<string, string>
  ) {
    if (resolutions.size < groups.length) {
      setStep({
        kind: 'resolve_securities',
        fileType,
        fileName,
        rows,
        parseErrors,
        securities,
        matchedByRowNumber,
        groups,
        resolutions,
      });
      return;
    }
    await proceedToDuplicateCheck(fileType, fileName, rows, parseErrors, matchedByRowNumber, resolutions);
  }

  // 全Security解決後、既存Tradeとの重複キー突合を行う(仕様書6.2/6.4)
  async function proceedToDuplicateCheck(
    fileType: FileType,
    fileName: string,
    rows: TradeImportableRow[],
    parseErrors: ParseErrorLike[],
    matchedByRowNumber: Map<number, string>,
    resolutions: Map<string, string>
  ) {
    const resolvedRows: ResolvedRow[] = rows.map((row) => {
      const securityId = matchedByRowNumber.get(row.rowNumber) ?? resolutions.get(groupKeyOf(row));
      if (!securityId) {
        throw new Error('内部エラー: 銘柄解決に失敗した行があります');
      }
      return { ...row, resolvedSecurityId: securityId };
    });

    const existingTrades = await listTrades();
    const existingKeyCounts = new Map<string, number>();
    for (const trade of existingTrades) {
      const key = duplicateKey({
        tradeDate: trade.tradeDate,
        securityIdentifier: trade.securityId,
        side: trade.side,
        quantity: trade.quantity,
        price: trade.price,
      });
      existingKeyCounts.set(key, (existingKeyCounts.get(key) ?? 0) + 1);
    }

    const collisions: CollisionInfo[] = [];
    for (const row of resolvedRows) {
      const key = duplicateKey({
        tradeDate: row.tradeDate,
        securityIdentifier: row.resolvedSecurityId,
        side: row.side,
        quantity: row.quantity,
        price: row.price,
      });
      const existingCount = existingKeyCounts.get(key) ?? 0;
      if (existingCount > 0) {
        collisions.push({ row, existingCount });
      }
    }

    if (collisions.length === 0) {
      await commitImport(fileType, fileName, resolvedRows, parseErrors, new Map());
      return;
    }

    setStep({ kind: 'resolve_duplicates', fileType, fileName, resolvedRows, parseErrors, collisions, decisions: new Map() });
  }

  async function commitImport(
    fileType: FileType,
    fileName: string,
    resolvedRows: ResolvedRow[],
    parseErrors: ParseErrorLike[],
    decisions: Map<number, 'keep' | 'skip'>
  ) {
    setStep({ kind: 'committing' });

    const acceptedRows = resolvedRows.filter((row) => decisions.get(row.rowNumber) !== 'skip');
    const skippedCount = resolvedRows.length - acceptedRows.length;

    const batch = await createImportBatch({
      fileType,
      fileName,
      counts: { imported: acceptedRows.length, skipped: skippedCount, error: parseErrors.length },
    });

    for (const row of acceptedRows) {
      await createTrade({
        tradeDate: row.tradeDate,
        securityId: row.resolvedSecurityId,
        side: row.side,
        accountType: row.accountType,
        quantity: row.quantity,
        price: row.price,
        amount: row.amount,
        currency: row.currency,
        note: row.note,
        impliedCost: row.impliedCost,
        source: { kind: 'csv', batchId: batch.id },
      });
    }

    setStep({
      kind: 'summary',
      imported: acceptedRows.length,
      skipped: skippedCount,
      error: parseErrors.length,
      errorRows: parseErrors.map((e) => ({ rowNumber: e.rowNumber ?? 0, reason: e.message })),
    });
  }

  if (step.kind === 'select') {
    return (
      <FileDropzone
        label="約定履歴照会CSV(SaveFile_*.csv)または米国株式約定履歴CSV(PaymentRecords_*.csv)を選択"
        acceptedTypes={['domestic_history', 'us_history']}
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
    return (
      <div className="space-y-4">
        <ImportPreviewTable rows={step.rows} errors={step.parseErrors} />
        <div className="flex gap-2">
          <button
            type="button"
            className="bg-blue-600 text-white px-4 py-1 rounded"
            onClick={() => void proceedFromPreview(step.fileType, step.fileName, step.rows, step.parseErrors)}
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
              step.fileType,
              step.fileName,
              step.rows,
              step.parseErrors,
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
              step.fileType,
              step.fileName,
              step.rows,
              step.parseErrors,
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
            void proceedToDuplicateCheck(
              step.fileType,
              step.fileName,
              step.rows,
              step.parseErrors,
              step.matchedByRowNumber,
              step.resolutions
            )
          }
        >
          次へ
        </button>
      </div>
    );
  }

  if (step.kind === 'resolve_duplicates') {
    const allDecided = step.collisions.every((c) => step.decisions.has(c.row.rowNumber));
    return (
      <div className="space-y-4">
        <DuplicateResolver
          collisions={step.collisions}
          decisions={step.decisions}
          onDecide={(rowNumber, decision) => {
            const next = new Map(step.decisions);
            next.set(rowNumber, decision);
            setStep({ ...step, decisions: next });
          }}
          onSkipAll={() => {
            const next = new Map(step.decisions);
            step.collisions.forEach((c) => next.set(c.row.rowNumber, 'skip'));
            setStep({ ...step, decisions: next });
          }}
        />
        <button
          type="button"
          className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50"
          disabled={!allDecided}
          onClick={() => void commitImport(step.fileType, step.fileName, step.resolvedRows, step.parseErrors, step.decisions)}
        >
          取込実行
        </button>
      </div>
    );
  }

  if (step.kind === 'committing') {
    return <p className="text-sm text-gray-500">取込中...</p>;
  }

  return (
    <div className="space-y-4">
      <ImportSummary
        imported={step.imported}
        skipped={step.skipped}
        error={step.error}
        errorRows={step.errorRows}
      />
      <button type="button" className="text-sm underline" onClick={reset}>
        別のファイルを取込む
      </button>
    </div>
  );
}
