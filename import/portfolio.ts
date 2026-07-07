import type { AccountType, Security } from '@/domain/types';
import { convertSlashDateToIso } from '@/import/common';
import { normalizeName } from '@/domain/normalize';
import { holdingKey } from '@/domain/holdings';

// 仕様書6.3: ポートフォリオCSV明細1行の解釈結果。Security解決前の中間表現
export interface PortfolioDetailRow {
  rowNumber: number;
  sectionTitle: string;
  productKind: 'fund' | 'stock_or_etf';
  accountType: AccountType;
  rawSecurityName: string; // 投信: ファンド名そのもの。株式/ETF: コード分離後の略称
  securityCode: string | null; // 株式/ETF: 先頭トークン。投信はnull
  purchaseDate: string | null; // 'YYYY-MM-DD'。'----/--/--'等はnull
  quantity: number;
  acquisitionPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
}

export interface PortfolioParseError {
  kind: 'unrecognized_file' | 'row_error';
  message: string;
  rowNumber?: number;
}

// 仕様書6.3 L201-202: 明細再計算値と合計ブロックの突合不一致
export interface ReconciliationWarning {
  sectionTitle: string;
  field: 'quantity' | 'pnl';
  expected: number; // 合計ブロックの値
  computed: number; // 明細行からの再計算値
}

export interface PortfolioParseResult {
  ok: boolean;
  rows: PortfolioDetailRow[];
  errors: PortfolioParseError[];
  reconciliationWarnings: ReconciliationWarning[];
}

// 仕様書6.3 L184: 各行末尾に余分なカンマ(空列)がある。末尾の空セルを1つ除去する
// (ポートフォリオCSV固有の癖のため、他CSV共通のimport/common.tsではなくこのファイルに置く)
function splitPortfolioLine(line: string): string[] {
  const cells = line.split(',');
  if (cells.length > 0 && cells[cells.length - 1].trim() === '') {
    return cells.slice(0, -1);
  }
  return cells;
}

interface SectionTitleInfo {
  productKind: 'fund' | 'stock_or_etf';
  accountType: AccountType;
}

// 仕様書6.3 L188: セクションタイトル例「株式(現物/NISA預り(成長投資枠))」「投資信託(金額/NISA預り(つみたて投資枠))」
const SECTION_PRODUCT_MAP: Record<string, 'fund' | 'stock_or_etf'> = {
  株式: 'stock_or_etf',
  投資信託: 'fund',
};

const SECTION_ACCOUNT_MAP: { pattern: RegExp; accountType: AccountType }[] = [
  { pattern: /NISA預り\(成長投資枠\)/, accountType: 'nisa_growth' },
  { pattern: /NISA預り\(つみたて投資枠\)/, accountType: 'nisa_tsumitate' },
  { pattern: /旧NISA/, accountType: 'old_nisa' },
  { pattern: /特定/, accountType: 'specific' },
];

function parseSectionTitle(title: string): SectionTitleInfo | null {
  const productToken = Object.keys(SECTION_PRODUCT_MAP).find((k) => title.startsWith(k));
  if (!productToken) return null;
  const productKind = SECTION_PRODUCT_MAP[productToken];
  const accountMatch = SECTION_ACCOUNT_MAP.find((m) => m.pattern.test(title));
  if (!accountMatch) return null;
  return { productKind, accountType: accountMatch.accountType };
}

const DETAIL_HEADER_FIRST_CELL = '銘柄(コード)';
const TOTAL_MARKER = '合計';
const GRAND_TOTAL_MARKER = '総合計';

function parseDetailRow(
  cells: string[],
  rowNumber: number,
  sectionTitle: string,
  productKind: 'fund' | 'stock_or_etf',
  accountType: AccountType
): { row: PortfolioDetailRow } | { error: PortfolioParseError } {
  if (cells.length !== 7) {
    return { error: { kind: 'row_error', rowNumber, message: `列数が一致しません(${cells.length}列)` } };
  }

  const [nameCell, purchaseDateCell, quantityCell, acquisitionCell, currentCell, pnlCell, pnlPercentCell] =
    cells;

  // 仕様書6.3 L194: 株式・ETFは「7267 ホンダ」形式(コード+半角スペース+略称)。投信はコードなし
  const spaceIndex = nameCell.indexOf(' ');
  const securityCode = spaceIndex > 0 ? nameCell.slice(0, spaceIndex) : null;
  const rawSecurityName = spaceIndex > 0 ? nameCell.slice(spaceIndex + 1).trim() : nameCell.trim();

  const purchaseDate = convertSlashDateToIso(purchaseDateCell); // '----/--/--'はnullになる(仕様書6.3 L197)
  const quantity = Number(quantityCell.trim());
  const acquisitionPrice = Number(acquisitionCell.trim());
  const currentPrice = Number(currentCell.trim());
  const pnl = Number(pnlCell.trim());
  const pnlPercent = Number(pnlPercentCell.trim());

  if (
    !Number.isFinite(quantity) ||
    !Number.isFinite(acquisitionPrice) ||
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(pnl) ||
    !Number.isFinite(pnlPercent)
  ) {
    return { error: { kind: 'row_error', rowNumber, message: '数量/単価/損益のいずれかが数値として不正です' } };
  }

  return {
    row: {
      rowNumber,
      sectionTitle,
      productKind,
      accountType,
      rawSecurityName,
      securityCode,
      purchaseDate,
      quantity,
      acquisitionPrice,
      currentPrice,
      pnl,
      pnlPercent,
    },
  };
}

type ParseState = 'seeking_section' | 'seeking_detail_header' | 'in_details';

// 仕様書6.3: ポートフォリオCSV(マルチセクション形式)のパース。
// セクションタイトル行→明細ヘッダー行→明細行群→合計ブロック(タイトル行+ヘッダー行+値1行)の
// 繰り返しを単純な状態遷移で解釈する。合計ブロックのタイトル行の文言は仕様書に厳密な例示がないため
// 「先頭セルが'合計'」という構造的な判定で代用している(実ファイルでの確認が必要な暫定実装)
export function parsePortfolioCsv(text: string): PortfolioParseResult {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));

  if (!lines.some((l) => l.includes('ポートフォリオ一覧'))) {
    return {
      ok: false,
      rows: [],
      errors: [
        { kind: 'unrecognized_file', message: 'ポートフォリオCSVとして認識できませんでした(タイトル行が見つかりません)' },
      ],
      reconciliationWarnings: [],
    };
  }

  const rows: PortfolioDetailRow[] = [];
  const errors: PortfolioParseError[] = [];
  const reconciliationWarnings: ReconciliationWarning[] = [];

  let state: ParseState = 'seeking_section';
  let currentTitle = '';
  let currentInfo: SectionTitleInfo | null = null;
  let sectionDetails: PortfolioDetailRow[] = [];

  function flushReconciliation(totalQuantity: number | null, totalPnl: number | null) {
    if (totalQuantity !== null) {
      const computed = sectionDetails.reduce((sum, d) => sum + d.quantity, 0);
      if (Math.abs(computed - totalQuantity) > 0) {
        reconciliationWarnings.push({
          sectionTitle: currentTitle,
          field: 'quantity',
          expected: totalQuantity,
          computed,
        });
      }
    }
    if (totalPnl !== null) {
      const computed = sectionDetails.reduce((sum, d) => sum + d.pnl, 0);
      // 仕様に明示的な許容値の記載なし。小数第2位の丸め誤差を吸収する実用上の閾値
      if (Math.abs(computed - totalPnl) > 0.01) {
        reconciliationWarnings.push({
          sectionTitle: currentTitle,
          field: 'pnl',
          expected: totalPnl,
          computed,
        });
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const rowNumber = i + 1;
    const cells = splitPortfolioLine(line);
    const firstCell = (cells[0] ?? '').trim();

    if (state === 'seeking_section') {
      const info = parseSectionTitle(firstCell);
      if (info) {
        currentTitle = firstCell;
        currentInfo = info;
        sectionDetails = [];
        state = 'seeking_detail_header';
      }
      continue;
    }

    if (state === 'seeking_detail_header') {
      if (firstCell === DETAIL_HEADER_FIRST_CELL) {
        state = 'in_details';
      }
      continue;
    }

    // state === 'in_details'
    if (firstCell === TOTAL_MARKER) {
      // 合計ブロック: タイトル行(このline)+ヘッダー行(次行、内容は検証しない)+値1行(その次)
      const valueLine = lines[i + 2];
      if (valueLine !== undefined) {
        const valueCells = splitPortfolioLine(valueLine.replace(/\r$/, ''));
        const totalQuantityRaw = valueCells[2]?.trim();
        const totalPnlRaw = valueCells[5]?.trim();
        const totalQuantity = totalQuantityRaw ? Number(totalQuantityRaw) : null;
        const totalPnl = totalPnlRaw ? Number(totalPnlRaw) : null;
        flushReconciliation(
          totalQuantity !== null && Number.isFinite(totalQuantity) ? totalQuantity : null,
          totalPnl !== null && Number.isFinite(totalPnl) ? totalPnl : null
        );
      }
      rows.push(...sectionDetails);
      i += 2; // ヘッダー行・値行を読み飛ばす
      state = 'seeking_section';
      continue;
    }

    if (firstCell.includes(GRAND_TOTAL_MARKER)) {
      break;
    }

    if (currentInfo) {
      const result = parseDetailRow(cells, rowNumber, currentTitle, currentInfo.productKind, currentInfo.accountType);
      if ('error' in result) {
        errors.push(result.error);
      } else {
        sectionDetails.push(result.row);
      }
    }
  }

  return { ok: true, rows, errors, reconciliationWarnings };
}

// 仕様書6.3: ポートフォリオCSVの銘柄(コード)列には市場情報がないため、コードのみで一致させる
// (国内株の運用上、同一コードが複数市場に存在するケースは想定しない)。投信はnormalizedName
// (エイリアス含む)一致で照合する
export function matchPortfolioSecurity(
  row: { securityCode: string | null; rawSecurityName: string },
  securities: Security[]
): Security | undefined {
  if (row.securityCode !== null) {
    return securities.find((s) => s.code === row.securityCode);
  }
  const key = normalizeName(row.rawSecurityName);
  return securities.find(
    (s) => s.normalizedName === key || s.aliases.some((alias) => normalizeName(alias) === key)
  );
}

// 仕様書6.3 L203: 取引記録由来の保有数量とCSV保有数量の差異レポート
export interface HoldingDiscrepancy {
  securityId: string;
  accountType: AccountType;
  csvQuantity: number;
  computedQuantity: number;
  difference: number; // csvQuantity - computedQuantity
}

export function computeHoldingDiscrepancies(
  resolvedRows: { resolvedSecurityId: string; accountType: AccountType; quantity: number }[],
  holdingQuantities: Map<string, number>
): HoldingDiscrepancy[] {
  const discrepancies: HoldingDiscrepancy[] = [];
  for (const row of resolvedRows) {
    const key = holdingKey(row.resolvedSecurityId, row.accountType);
    const computed = holdingQuantities.get(key) ?? 0;
    if (computed !== row.quantity) {
      discrepancies.push({
        securityId: row.resolvedSecurityId,
        accountType: row.accountType,
        csvQuantity: row.quantity,
        computedQuantity: computed,
        difference: row.quantity - computed,
      });
    }
  }
  return discrepancies;
}
