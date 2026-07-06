import { describe, it, expect } from 'vitest';
import { detectAndDecode } from '@/import/encoding';
import {
  DOMESTIC_HISTORY_SAMPLE_UTF8,
  encodeUtf8,
  encodeUtf8Bom,
  encodeShiftJis,
} from '@/import/__fixtures__/domesticHistory';

// 仕様書6.5・implement-p2.md D群: Shift-JISとUTF-8(BOM有無)の等価ファイルが同一結果になること
describe('detectAndDecode', () => {
  it('UTF-8(BOMなし)を判定し、内容が一致する', () => {
    const result = detectAndDecode(encodeUtf8(DOMESTIC_HISTORY_SAMPLE_UTF8));
    expect(result.encoding).toBe('utf-8');
    expect(result.text).toBe(DOMESTIC_HISTORY_SAMPLE_UTF8);
  });

  it('UTF-8(BOMあり)を判定し、BOMを除いた内容が一致する', () => {
    const result = detectAndDecode(encodeUtf8Bom(DOMESTIC_HISTORY_SAMPLE_UTF8));
    expect(result.encoding).toBe('utf-8-bom');
    expect(result.text).toBe(DOMESTIC_HISTORY_SAMPLE_UTF8);
  });

  it('Shift-JISを判定し、内容が一致する(3エンコーディングの等価性)', () => {
    const result = detectAndDecode(encodeShiftJis(DOMESTIC_HISTORY_SAMPLE_UTF8));
    expect(result.encoding).toBe('shift-jis');
    expect(result.text).toBe(DOMESTIC_HISTORY_SAMPLE_UTF8);
  });
});
