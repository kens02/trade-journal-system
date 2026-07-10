import type { Sector } from './types';

// implement-p3.md 6.1節(F0確認): セクターマスタCSV列定義「セクター名,表示順」の2列、
// UTF-8(BOM付き)、1行目ヘッダー必須。SBI証券CSV(import/配下)とは無関係の自前フォーマットのため
// domain/に置く(Dexie・Reactに依存しない純粋関数)

export interface SectorCsvRow {
  name: string;
  displayOrder: number;
}

export interface SectorCsvRowError {
  rowNumber: number; // ヘッダーを除いた1起点のデータ行番号。ヘッダー不正時は0
  message: string;
}

export interface SectorCsvParseResult {
  ok: boolean;
  rows: SectorCsvRow[];
  errors: SectorCsvRowError[];
}

const HEADER_CELLS = ['セクター名', '表示順'];

export function parseSectorCsv(text: string): SectorCsvParseResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) {
    return { ok: false, rows: [], errors: [{ rowNumber: 0, message: 'ヘッダー行がありません。' }] };
  }

  const headerCells = lines[0].split(',').map((c) => c.trim());
  if (headerCells[0] !== HEADER_CELLS[0] || headerCells[1] !== HEADER_CELLS[1]) {
    return {
      ok: false,
      rows: [],
      errors: [
        {
          rowNumber: 0,
          message: `ヘッダー行が想定と異なります(期待値: ${HEADER_CELLS.join(',')})。`,
        },
      ],
    };
  }

  const rows: SectorCsvRow[] = [];
  const errors: SectorCsvRowError[] = [];
  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i;
    const cells = lines[i].split(',').map((c) => c.trim());
    const name = cells[0] ?? '';
    const displayOrderRaw = cells[1] ?? '';
    if (name === '') {
      errors.push({ rowNumber, message: 'セクター名が空です。' });
      continue;
    }
    if (!/^-?\d+$/.test(displayOrderRaw)) {
      errors.push({ rowNumber, message: `表示順が整数ではありません(値: "${displayOrderRaw}")。` });
      continue;
    }
    rows.push({ name, displayOrder: Number(displayOrderRaw) });
  }

  return { ok: errors.length === 0, rows, errors };
}

// エクスポートは表示順昇順。先頭にBOM文字を含めた文字列を返す(Excel等での文字化け防止)
export function buildSectorCsv(sectors: Sector[]): string {
  const sorted = [...sectors].sort((a, b) => a.displayOrder - b.displayOrder);
  const lines = [HEADER_CELLS.join(','), ...sorted.map((s) => `${s.name},${s.displayOrder}`)];
  return '﻿' + lines.join('\r\n');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function buildSectorCsvFilename(exportedAt: Date): string {
  const y = exportedAt.getFullYear();
  const m = pad2(exportedAt.getMonth() + 1);
  const d = pad2(exportedAt.getDate());
  const hh = pad2(exportedAt.getHours());
  const mm = pad2(exportedAt.getMinutes());
  return `sectors-${y}${m}${d}-${hh}${mm}.csv`;
}
