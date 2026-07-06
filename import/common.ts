import type { Security, TradeSide } from '@/domain/types';
import { normalizeName } from '@/domain/normalize';

export type CsvFileTypeSignature = 'domestic_history' | 'us_history' | 'portfolio' | 'unknown';

// 仕様書6.4 L207: 全フィールドがダブルクォート囲み。フィールド内カンマがない前提のため、
// 単純split後に前後の"を除去するだけで足りる(RFC4180準拠のクォート内カンマ解除は不要)
export function stripSurroundingQuotes(cell: string): string {
  const trimmed = cell.trim();
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1)
    : trimmed;
}

function firstCell(line: string): string {
  return stripSurroundingQuotes((line.split(',')[0] ?? '').trim());
}

// 仕様書6.1・implement-p2.md 5.3節: ヘッダー行の先頭セルでファイル種別を自動判定する。
// F2では国内履歴を認識し、米国株式/ポートフォリオは明示的に「未対応」として区別する(F3で本対応)
export function sniffFileType(text: string): CsvFileTypeSignature {
  const lines = text.split('\n');
  if (lines.some((l) => firstCell(l) === '約定日')) return 'domestic_history';
  if (lines.some((l) => firstCell(l) === '国内約定日')) return 'us_history';
  if (lines.some((l) => l.includes('ポートフォリオ一覧'))) return 'portfolio';
  return 'unknown';
}

// 仕様書6.5: ヘッダー行は先頭セルの値で検出する(行位置に依存しない)
export function findHeaderLineIndex(lines: string[], expectedFirstCell: string): number {
  return lines.findIndex((l) => firstCell(l) === expectedFirstCell);
}

// 仕様書6.2 L175: '--'/空文字はnullとして扱う
export function nullIfDash(cell: string): string | null {
  const trimmed = cell.trim();
  return trimmed === '' || trimmed === '--' ? null : trimmed;
}

// 仕様書6.2 L175: '--'/空文字の数値項目はゼロとして扱う
export function zeroIfDash(cell: string): number {
  const trimmed = cell.trim();
  return trimmed === '' || trimmed === '--' ? 0 : Number(trimmed);
}

// 仕様書6.2/6.4: 'YYYY/MM/DD'形式の日付を'YYYY-MM-DD'へ変換する(国内・米国両CSVで共通)
export function convertSlashDateToIso(value: string): string | null {
  const match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

// 仕様書6.2 L179: 重複判定キー(約定日+銘柄識別子+取引区分+数量+単価)。
// 銘柄識別子は解決済みのsecurityIdを用いる(手動入力由来・CSV由来を問わず既存Tradeと比較できるため)
export function duplicateKey(input: {
  tradeDate: string;
  securityIdentifier: string;
  side: TradeSide;
  quantity: number;
  price: number;
}): string {
  return [input.tradeDate, input.securityIdentifier, input.side, input.quantity, input.price].join('|');
}

// implement-p2.md 5.1節: コードあり銘柄は(code, market)一致、投信はnormalizedName(エイリアス含む)一致で照合する
export function matchSecurity(
  row: { securityCode: string | null; market: string | null; rawSecurityName: string },
  securities: Security[]
): Security | undefined {
  if (row.securityCode !== null) {
    return securities.find((s) => s.code === row.securityCode && s.market === row.market);
  }
  const key = normalizeName(row.rawSecurityName);
  return securities.find(
    (s) => s.normalizedName === key || s.aliases.some((alias) => normalizeName(alias) === key)
  );
}
