import type { AccountType, TradeSide } from '@/domain/types';
import {
  findHeaderLineIndex,
  nullIfDash,
  zeroIfDash,
  convertSlashDateToIso,
  stripSurroundingQuotes,
} from '@/import/common';

// 仕様書6.2: CSV1行の解釈結果。Security解決前・重複判定前の中間表現
export interface DomesticHistoryRow {
  rowNumber: number; // 元CSVの行番号(1始まり、エラー表示用)
  tradeDate: string; // 'YYYY-MM-DD'(約定日)
  settlementDate: string; // 'YYYY-MM-DD'(受渡日)
  rawSecurityName: string; // 銘柄列の生値
  securityCode: string | null; // 銘柄コード。投信はnull(仕様書6.2)
  market: string | null; // 市場列。'--'/空はnull
  productKind: 'fund' | 'stock_or_etf'; // 取引列から判定
  side: TradeSide;
  isDistributionReinvestment: boolean; // 分配金再投資フラグ(買付として取得原価に算入)
  accountType: AccountType;
  taxCategory: string | null; // 課税列(非課税/申告/課税)。参考保持
  quantity: number;
  price: number; // 約定単価
  amount: number; // 受渡金額/決済損益(整数円。これを正とする)
}

export interface DomesticHistoryParseError {
  kind: 'unrecognized_file' | 'row_error';
  message: string;
  rowNumber?: number; // row_errorのみ
}

export interface DomesticHistoryParseResult {
  ok: boolean;
  rows: DomesticHistoryRow[];
  errors: DomesticHistoryParseError[];
}

type DomesticHistoryField =
  | 'tradeDate'
  | 'settlementDate'
  | 'rawSecurityName'
  | 'securityCode'
  | 'market'
  | 'tradeType'
  | 'expiry'
  | 'accountTypeRaw'
  | 'taxCategory'
  | 'quantity'
  | 'price'
  | 'fee'
  | 'tax'
  | 'amount';

// 仕様書6.5: 列マッピング定義の外部化。SBI側のフォーマット変更時はこの配列のみ修正すればよい。
// 実ファイル確認済み: 受渡日は仕様書の表記載順(2列目)ではなく、受渡金額の直前(13列目)に実在する
const DOMESTIC_HISTORY_COLUMNS: { header: string; field: DomesticHistoryField }[] = [
  { header: '約定日', field: 'tradeDate' },
  { header: '銘柄', field: 'rawSecurityName' },
  { header: '銘柄コード', field: 'securityCode' },
  { header: '市場', field: 'market' },
  { header: '取引', field: 'tradeType' },
  { header: '期限', field: 'expiry' },
  { header: '預り', field: 'accountTypeRaw' },
  { header: '課税', field: 'taxCategory' },
  { header: '約定数量', field: 'quantity' },
  { header: '約定単価', field: 'price' },
  { header: '手数料/諸経費等', field: 'fee' },
  { header: '税額', field: 'tax' },
  { header: '受渡日', field: 'settlementDate' },
  { header: '受渡金額/決済損益', field: 'amount' },
];

// 仕様書6.2: 取引列→商品種別+売買区分。分配金再投資は買付として取得原価に算入する
const TRADE_TYPE_MAP: Record<
  string,
  { side: TradeSide; productKind: 'fund' | 'stock_or_etf'; isDistributionReinvestment: boolean }
> = {
  株式現物買: { side: 'buy', productKind: 'stock_or_etf', isDistributionReinvestment: false },
  株式現物売: { side: 'sell', productKind: 'stock_or_etf', isDistributionReinvestment: false },
  投信金額買付: { side: 'buy', productKind: 'fund', isDistributionReinvestment: false },
  投信金額解約: { side: 'sell', productKind: 'fund', isDistributionReinvestment: false },
  分配金再投資: { side: 'buy', productKind: 'fund', isDistributionReinvestment: true },
};

// 仕様書6.2: 預り列(前後トリム後)→AccountType
const ACCOUNT_TYPE_MAP: Record<string, AccountType> = {
  'NISA(成)': 'nisa_growth',
  'NISA(つ)': 'nisa_tsumitate',
  特定: 'specific',
  旧NISA: 'old_nisa',
};

function buildRow(
  fields: Record<DomesticHistoryField, string>,
  rowNumber: number
): { row: DomesticHistoryRow } | { error: DomesticHistoryParseError } {
  const tradeDate = convertSlashDateToIso(fields.tradeDate);
  const settlementDate = convertSlashDateToIso(fields.settlementDate);
  if (!tradeDate || !settlementDate) {
    return {
      error: { kind: 'row_error', rowNumber, message: '約定日/受渡日の形式が不正です(YYYY/MM/DD)' },
    };
  }

  const tradeTypeInfo = TRADE_TYPE_MAP[fields.tradeType.trim()];
  if (!tradeTypeInfo) {
    return {
      error: { kind: 'row_error', rowNumber, message: `未知の取引区分です: ${fields.tradeType}` },
    };
  }

  const accountType = ACCOUNT_TYPE_MAP[fields.accountTypeRaw.trim()];
  if (!accountType) {
    return {
      error: { kind: 'row_error', rowNumber, message: `未知の預り区分です: ${fields.accountTypeRaw}` },
    };
  }

  // 仕様書6.2: 手数料/諸経費等・税額は観測値が常に'--'(ゼロ扱い)。Tradeにフィールドを持たないため
  // 非ゼロ値が来た場合は想定外としてrow_errorにする(サイレントな破棄を避ける)
  const fee = zeroIfDash(fields.fee);
  const tax = zeroIfDash(fields.tax);
  if (fee !== 0 || tax !== 0) {
    return {
      error: {
        kind: 'row_error',
        rowNumber,
        message: '手数料/諸経費等または税額が想定外の値です(仕様上は常に"--")',
      },
    };
  }

  return {
    row: {
      rowNumber,
      tradeDate,
      settlementDate,
      rawSecurityName: fields.rawSecurityName.trim(),
      securityCode: nullIfDash(fields.securityCode),
      market: nullIfDash(fields.market),
      productKind: tradeTypeInfo.productKind,
      side: tradeTypeInfo.side,
      isDistributionReinvestment: tradeTypeInfo.isDistributionReinvestment,
      accountType,
      taxCategory: nullIfDash(fields.taxCategory),
      quantity: zeroIfDash(fields.quantity),
      price: zeroIfDash(fields.price),
      amount: zeroIfDash(fields.amount),
    },
  };
}

// 仕様書6.2: 約定履歴照会CSV(国内)のパース。ヘッダー行は行位置に依存せず検出する
export function parseDomesticHistoryCsv(text: string): DomesticHistoryParseResult {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  const headerIndex = findHeaderLineIndex(lines, '約定日');
  if (headerIndex === -1) {
    return {
      ok: false,
      rows: [],
      errors: [
        {
          kind: 'unrecognized_file',
          message: '約定履歴照会CSVとして認識できませんでした(ヘッダー行が見つかりません)',
        },
      ],
    };
  }

  const headerCells = lines[headerIndex].split(',').map((cell) => stripSurroundingQuotes(cell));
  const expectedHeaders = DOMESTIC_HISTORY_COLUMNS.map((c) => c.header);
  const headerMatches =
    headerCells.length === expectedHeaders.length &&
    expectedHeaders.every((h, i) => headerCells[i] === h);
  if (!headerMatches) {
    return {
      ok: false,
      rows: [],
      errors: [
        {
          kind: 'unrecognized_file',
          message: '約定履歴照会CSVとして認識できませんでした(列構成が一致しません)',
        },
      ],
    };
  }

  const rows: DomesticHistoryRow[] = [];
  const errors: DomesticHistoryParseError[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const rowNumber = i + 1;
    const cells = line.split(',').map((cell) => stripSurroundingQuotes(cell));
    if (cells.length !== DOMESTIC_HISTORY_COLUMNS.length) {
      errors.push({ kind: 'row_error', rowNumber, message: `列数が一致しません(${cells.length}列)` });
      continue;
    }
    const fields = {} as Record<DomesticHistoryField, string>;
    DOMESTIC_HISTORY_COLUMNS.forEach((col, idx) => {
      fields[col.field] = cells[idx];
    });
    const result = buildRow(fields, rowNumber);
    if ('error' in result) {
      errors.push(result.error);
    } else {
      rows.push(result.row);
    }
  }

  return { ok: true, rows, errors };
}
