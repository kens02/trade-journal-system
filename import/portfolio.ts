import type { AccountType, Security } from '@/domain/types';
import { convertSlashDateToIso, stripSurroundingQuotes } from '@/import/common';
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

// 仕様書6.3 L201-202: 明細再計算値と合計ブロックの突合不一致。
// 実ファイル確認済み: 合計ブロックの値行は「評価額,含み損益,含み損益(%),前日比,前日比(%)」の5列であり、
// 数量の合計は含まれない(明細ヘッダーの7列とは異なる列構成)。evaluationAmountは
// 株式/ETF: 数量×現在値、投信: 数量×現在値÷10000(仕様書6.2の基準価額換算に準拠)で算出する
export interface ReconciliationWarning {
  sectionTitle: string;
  field: 'pnl' | 'evaluationAmount';
  expected: number; // 合計ブロックの値
  computed: number; // 明細行からの再計算値
}

export interface PortfolioParseResult {
  ok: boolean;
  rows: PortfolioDetailRow[];
  errors: PortfolioParseError[];
  reconciliationWarnings: ReconciliationWarning[];
}

// 仕様書6.3 L184: 各行末尾に余分なカンマ(空列)がある。末尾の空セルを1つ除去し、
// 各セルのダブルクォート囲み(実ファイルで銘柄名・買付日等に確認済み)を除去する
// (ポートフォリオCSV固有の癖のため、他CSV共通のimport/common.tsではなくこのファイルに置く)
function splitPortfolioLine(line: string): string[] {
  const cells = line.split(',').map((cell) => stripSurroundingQuotes(cell));
  if (cells.length > 0 && cells[cells.length - 1].trim() === '') {
    return cells.slice(0, -1);
  }
  return cells;
}

interface SectionTitleInfo {
  productKind: 'fund' | 'stock_or_etf';
  accountType: AccountType;
}

// 仕様書6.3 L188: セクションタイトル例「株式（現物/NISA預り（成長投資枠））」「投資信託（金額/NISA預り（つみたて投資枠））」。
// 実ファイル確認済み: セクションタイトル行は全角括弧(（）)を使用する(合計ブロックのタイトル行は半角括弧のため区別する)
const SECTION_PRODUCT_MAP: Record<string, 'fund' | 'stock_or_etf'> = {
  株式: 'stock_or_etf',
  投資信託: 'fund',
};

const SECTION_ACCOUNT_MAP: { pattern: RegExp; accountType: AccountType }[] = [
  { pattern: /NISA預り（成長投資枠）/, accountType: 'nisa_growth' },
  { pattern: /NISA預り（つみたて投資枠）/, accountType: 'nisa_tsumitate' },
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

// 実ファイル確認済み: 明細ヘッダーの先頭セルは株式/ETFセクションでは「銘柄（コード）」、
// 投信セクションでは「ファンド名」(全角括弧)
const DETAIL_HEADER_FIRST_CELLS = ['銘柄（コード）', 'ファンド名'];
// 実ファイル確認済み: 合計ブロックのタイトル行は「株式(現物/NISA預り(成長投資枠))合計」のように
// 半角括弧+セクション名を含む長い文字列で、末尾が「合計」で終わる(セクションタイトルの全角括弧とは異なる)
const GRAND_TOTAL_MARKER = '総合計';

function isTotalBlockTitle(cell: string): boolean {
  return cell.endsWith('合計');
}

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

// 投信は1万口あたり基準価額のため、評価額は数量×現在値÷10000で換算する(仕様書6.2/6.3準拠)
function evaluationAmountOf(row: PortfolioDetailRow): number {
  return row.productKind === 'fund'
    ? (row.quantity * row.currentPrice) / 10000
    : row.quantity * row.currentPrice;
}

// 仕様書6.3: ポートフォリオCSV(マルチセクション形式)のパース。
// セクションタイトル行→明細ヘッダー行→明細行群→合計ブロック(タイトル行+ヘッダー行+値1行)の
// 繰り返しを単純な状態遷移で解釈する。合計ブロックの値行は「評価額,含み損益,含み損益(%),前日比,前日比(%)」の
// 5列(実ファイルで確認済み。明細ヘッダーの7列とは異なる)
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

  function flushReconciliation(totalEvaluationAmount: number | null, totalPnl: number | null) {
    // 仕様に明示的な許容値の記載なし。四捨五入・複数行合算の丸め誤差を吸収する実用上の閾値
    const TOLERANCE = 1;
    if (totalEvaluationAmount !== null) {
      const computed = sectionDetails.reduce((sum, d) => sum + evaluationAmountOf(d), 0);
      if (Math.abs(computed - totalEvaluationAmount) > TOLERANCE) {
        reconciliationWarnings.push({
          sectionTitle: currentTitle,
          field: 'evaluationAmount',
          expected: totalEvaluationAmount,
          computed,
        });
      }
    }
    if (totalPnl !== null) {
      const computed = sectionDetails.reduce((sum, d) => sum + d.pnl, 0);
      if (Math.abs(computed - totalPnl) > TOLERANCE) {
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
      if (firstCell.includes(GRAND_TOTAL_MARKER)) {
        break; // 総合計ブロックに到達したら全セクション読了
      }
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
      if (DETAIL_HEADER_FIRST_CELLS.includes(firstCell)) {
        state = 'in_details';
      }
      continue;
    }

    // state === 'in_details'
    if (isTotalBlockTitle(firstCell)) {
      // 合計ブロック: タイトル行(このline)+ヘッダー行(次行、内容は検証しない)+値1行(その次)。
      // 値行は「評価額,含み損益,含み損益(%),前日比,前日比(%)」の5列(実ファイル確認済み)
      const valueLine = lines[i + 2];
      if (valueLine !== undefined) {
        const valueCells = splitPortfolioLine(valueLine.replace(/\r$/, ''));
        const totalEvaluationRaw = valueCells[0]?.trim();
        const totalPnlRaw = valueCells[1]?.trim();
        const totalEvaluation = totalEvaluationRaw ? Number(totalEvaluationRaw) : null;
        const totalPnl = totalPnlRaw ? Number(totalPnlRaw) : null;
        flushReconciliation(
          totalEvaluation !== null && Number.isFinite(totalEvaluation) ? totalEvaluation : null,
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
