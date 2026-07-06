// 仕様書4.3(実装コマンド): 金額フォーマットは純粋関数として表示層から分離する

// amountYen: JPY整数円
export function formatJPY(amountYen: number): string {
  return `${amountYen.toLocaleString('ja-JP')}円`;
}

// amountCents: USD整数セント(1/100 USD)
export function formatUSD(amountCents: number): string {
  return `${(amountCents / 100).toFixed(2)} USD`;
}
