import { describe, it, expect } from 'vitest';
import { buildCsvContent, buildCsvFilename } from '@/domain/csv';

describe('buildCsvContent', () => {
  it('先頭にBOMを付与しCRLF区切りで結合する', () => {
    const csv = buildCsvContent(['a', 'b'], [['1', '2']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe('﻿a,b\r\n1,2');
  });

  it('カンマ・改行・二重引用符を含むフィールドをダブルクォートでエスケープする', () => {
    const csv = buildCsvContent(['col'], [['a,b'], ['line1\nline2'], ['say "hi"']]);
    expect(csv).toBe('﻿col\r\n"a,b"\r\n"line1\nline2"\r\n"say ""hi"""');
  });
});

describe('buildCsvFilename', () => {
  it('prefix-YYYYMMDD-HHmm.csv 形式のファイル名を返す', () => {
    const filename = buildCsvFilename('trades', new Date(2026, 6, 10, 9, 5));
    expect(filename).toBe('trades-20260710-0905.csv');
  });
});
