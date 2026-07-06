// 仕様書4.3(実装コマンド): 金額フォーマットは純粋関数として表示層から分離する

// amountYen: JPY整数円
export function formatJPY(amountYen: number): string {
  return `${amountYen.toLocaleString('ja-JP')}円`;
}

// amountCents: USD整数セント(1/100 USD)
export function formatUSD(amountCents: number): string {
  return `${(amountCents / 100).toFixed(2)} USD`;
}

// 仕様書4.3: 単価はJPYで小数第1位まで、受渡金額(JPY)は整数円。
// フォーム入力文字列を検証・変換する純粋関数群。不正な入力はnullを返す(呼び出し側でエラー表示)。
function parseDecimalString(input: string, maxDecimalDigits: number): number | null {
  const trimmed = input.trim();
  const pattern =
    maxDecimalDigits === 0
      ? /^\d+$/
      : new RegExp(`^\\d+(\\.\\d{1,${maxDecimalDigits}})?$`);
  if (!pattern.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

// JPY単価: 小数第1位まで許容。Trade.priceにそのまま格納する値を返す
export function parseJPYPrice(input: string): number | null {
  return parseDecimalString(input, 1);
}

// JPY受渡金額: 整数円のみ許容。Trade.amountにそのまま格納する値を返す
export function parseJPYAmount(input: string): number | null {
  return parseDecimalString(input, 0);
}

// USD単価: 小数第4位まで許容。Trade.priceにそのまま格納する値を返す
export function parseUSDPrice(input: string): number | null {
  return parseDecimalString(input, 4);
}

// USD受渡金額: 小数第2位まで許容し、整数セント(×100)に変換してTrade.amountへ格納する
export function parseUSDAmount(input: string): number | null {
  const dollars = parseDecimalString(input, 2);
  if (dollars === null) {
    return null;
  }
  return Math.round(dollars * 100);
}
