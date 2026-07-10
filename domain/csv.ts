// 仕様書7章「Excel/CSVエクスポート」/ implement-p4.md 5章: 取引一覧・ジャーナル・保有一覧の
// CSV生成で共有するヘルパー。domain/sectorCsv.tsは自前フォーマットの列のみでエスケープ不要だったが、
// 本ファイルが扱う列(メモ・ジャーナル本文等)はカンマ・改行・二重引用符を含み得るため、
// RFC4180準拠の最小限のエスケープを行う

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// 先頭にBOMを付与し、Excelでの文字化けを防ぐ(仕様書7章)
export function buildCsvContent(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((cells) => cells.map(escapeCsvField).join(','));
  return '﻿' + lines.join('\r\n');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function buildCsvFilename(prefix: string, exportedAt: Date): string {
  const y = exportedAt.getFullYear();
  const m = pad2(exportedAt.getMonth() + 1);
  const d = pad2(exportedAt.getDate());
  const hh = pad2(exportedAt.getHours());
  const mm = pad2(exportedAt.getMinutes());
  return `${prefix}-${y}${m}${d}-${hh}${mm}.csv`;
}
