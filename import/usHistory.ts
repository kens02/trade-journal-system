import type { AccountType, TradeSide } from '@/domain/types';
import { parseUSDPrice, parseUSDAmount } from '@/domain/money';
import {
  findHeaderLineIndex,
  nullIfDash,
  convertSlashDateToIso,
  stripSurroundingQuotes,
} from '@/import/common';

// 仕様書6.4: CSV1行の解釈結果。Security解決前・重複判定前の中間表現
export interface UsHistoryRow {
  rowNumber: number;
  tradeDate: string; // 'YYYY-MM-DD'(国内約定日)
  settlementDate: string; // 'YYYY-MM-DD'(国内受渡日)
  rawSecurityName: string; // 銘柄列の生値(日本語カナ表記)
  ticker: string; // 銘柄コード列(ティッカー)
  // 仕様書6.4: 米国版は市場列が必ず値を持つ(国内版のDomesticHistoryRow.marketと異なりnull不可)
  market: string;
  orderType: string | null; // 注文種別(指値/成行)。参考保持のみ
  side: TradeSide;
  accountType: AccountType;
  quantity: number;
  price: number; // 約定単価(USD、素の数値。小数第4位まで)
  amount: number; // 受渡金額/決済損益(整数セント×100)
  impliedCost: number; // |数量×約定単価−受渡金額|の実効コスト参考値(整数セント)
}

export interface UsHistoryParseError {
  kind: 'unrecognized_file' | 'row_error';
  message: string;
  rowNumber?: number;
}

export interface UsHistoryParseResult {
  ok: boolean;
  rows: UsHistoryRow[];
  errors: UsHistoryParseError[];
}

type UsHistoryField =
  | 'tradeDate'
  | 'settlementDate'
  | 'rawSecurityName'
  | 'ticker'
  | 'market'
  | 'productKind'
  | 'orderType'
  | 'tradeType'
  | 'accountTypeRaw'
  | 'quantity'
  | 'price'
  | 'amount';

// 仕様書6.5: 列マッピング定義の外部化(12列)
const US_HISTORY_COLUMNS: { header: string; field: UsHistoryField }[] = [
  { header: '国内約定日', field: 'tradeDate' },
  { header: '国内受渡日', field: 'settlementDate' },
  { header: '銘柄', field: 'rawSecurityName' },
  { header: '銘柄コード', field: 'ticker' },
  { header: '市場', field: 'market' },
  { header: '商品区分', field: 'productKind' },
  { header: '注文種別', field: 'orderType' },
  { header: '取引', field: 'tradeType' },
  { header: '預り区分', field: 'accountTypeRaw' },
  { header: '約定数量', field: 'quantity' },
  { header: '約定単価', field: 'price' },
  { header: '受渡金額/決済損益', field: 'amount' },
];

// 仕様書6.4: 取引列→売買区分。国内版(6.2)と語彙が異なるため独立テーブルとして持つ
const US_TRADE_TYPE_MAP: Record<string, TradeSide> = {
  現買: 'buy',
  現売: 'sell',
};

// 仕様書6.4: 預り区分列→AccountType。国内版と異なり前後スペースなし、成長/つみたての別なし。
// 'NISA'は成長投資枠として扱う
const US_ACCOUNT_TYPE_MAP: Record<string, AccountType> = {
  NISA: 'nisa_growth',
  特定: 'specific',
  旧NISA: 'old_nisa',
};

// 仕様書6.4: "20.5100USD"/"104.49USD"形式(数値+通貨コードサフィックス)からサフィックスを除去する。
// 'USD'以外のサフィックスや数値部が不正な場合はnullを返す
function stripUsdSuffix(raw: string): string | null {
  const match = /^(\d+\.\d+)USD$/.exec(stripSurroundingQuotes(raw));
  return match ? match[1] : null;
}

// 仕様書6.4: |数量×約定単価−受渡金額|を実効コスト(手数料相当)として導出する。
// priceは素のUSD数値、amountは整数セントのため、quantity×priceを四捨五入でセント化してから比較する
function deriveImpliedCost(quantity: number, price: number, amountCents: number): number {
  const grossCents = Math.round(quantity * price * 100);
  return Math.abs(grossCents - amountCents);
}

function buildRow(
  fields: Record<UsHistoryField, string>,
  rowNumber: number
): { row: UsHistoryRow } | { error: UsHistoryParseError } {
  const tradeDate = convertSlashDateToIso(fields.tradeDate);
  const settlementDate = convertSlashDateToIso(fields.settlementDate);
  if (!tradeDate || !settlementDate) {
    return {
      error: { kind: 'row_error', rowNumber, message: '国内約定日/国内受渡日の形式が不正です(YYYY/MM/DD)' },
    };
  }

  const side = US_TRADE_TYPE_MAP[fields.tradeType.trim()];
  if (!side) {
    return { error: { kind: 'row_error', rowNumber, message: `未知の取引区分です: ${fields.tradeType}` } };
  }

  const accountType = US_ACCOUNT_TYPE_MAP[fields.accountTypeRaw.trim()];
  if (!accountType) {
    return {
      error: { kind: 'row_error', rowNumber, message: `未知の預り区分です: ${fields.accountTypeRaw}` },
    };
  }

  const priceRaw = stripUsdSuffix(fields.price);
  const price = priceRaw !== null ? parseUSDPrice(priceRaw) : null;
  if (price === null) {
    return {
      error: {
        kind: 'row_error',
        rowNumber,
        message: `約定単価が不正な形式です(例: 20.5100USD): ${fields.price}`,
      },
    };
  }

  const amountRaw = stripUsdSuffix(fields.amount);
  const amount = amountRaw !== null ? parseUSDAmount(amountRaw) : null;
  if (amount === null) {
    return {
      error: {
        kind: 'row_error',
        rowNumber,
        message: `受渡金額/決済損益が不正な形式です(例: 104.49USD): ${fields.amount}`,
      },
    };
  }

  const quantity = Number(fields.quantity.trim());
  if (!Number.isFinite(quantity)) {
    return { error: { kind: 'row_error', rowNumber, message: `約定数量が不正な値です: ${fields.quantity}` } };
  }

  return {
    row: {
      rowNumber,
      tradeDate,
      settlementDate,
      rawSecurityName: stripSurroundingQuotes(fields.rawSecurityName),
      ticker: stripSurroundingQuotes(fields.ticker),
      market: stripSurroundingQuotes(fields.market),
      orderType: nullIfDash(stripSurroundingQuotes(fields.orderType)),
      side,
      accountType,
      quantity,
      price,
      amount,
      impliedCost: deriveImpliedCost(quantity, price, amount),
    },
  };
}

// 仕様書6.4: 米国株式約定履歴CSVのパース。ヘッダー行は行位置に依存せず検出する
export function parseUsHistoryCsv(text: string): UsHistoryParseResult {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  const headerIndex = findHeaderLineIndex(lines, '国内約定日');
  if (headerIndex === -1) {
    return {
      ok: false,
      rows: [],
      errors: [
        {
          kind: 'unrecognized_file',
          message: '米国株式約定履歴CSVとして認識できませんでした(ヘッダー行が見つかりません)',
        },
      ],
    };
  }

  const headerCells = lines[headerIndex].split(',').map((cell) => stripSurroundingQuotes(cell));
  const expectedHeaders = US_HISTORY_COLUMNS.map((c) => c.header);
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
          message: '米国株式約定履歴CSVとして認識できませんでした(列構成が一致しません)',
        },
      ],
    };
  }

  const rows: UsHistoryRow[] = [];
  const errors: UsHistoryParseError[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const rowNumber = i + 1;
    const cells = line.split(',').map((cell) => stripSurroundingQuotes(cell));
    if (cells.length !== US_HISTORY_COLUMNS.length) {
      errors.push({ kind: 'row_error', rowNumber, message: `列数が一致しません(${cells.length}列)` });
      continue;
    }
    const fields = {} as Record<UsHistoryField, string>;
    US_HISTORY_COLUMNS.forEach((col, idx) => {
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
