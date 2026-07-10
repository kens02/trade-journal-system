import { describe, it, expect } from 'vitest';
import { parseSectorCsv, buildSectorCsv } from '@/domain/sectorCsv';
import type { Sector } from '@/domain/types';

describe('parseSectorCsv', () => {
  it('ヘッダー+複数行を正しくパースする', () => {
    const csv = 'セクター名,表示順\n輸送用機器,1\n電気機器,2\n';
    const result = parseSectorCsv(csv);
    expect(result.ok).toBe(true);
    expect(result.rows).toEqual([
      { name: '輸送用機器', displayOrder: 1 },
      { name: '電気機器', displayOrder: 2 },
    ]);
    expect(result.errors).toHaveLength(0);
  });

  it('ヘッダーが想定と異なる場合はエラーを返す', () => {
    const csv = 'name,order\n輸送用機器,1\n';
    const result = parseSectorCsv(csv);
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toContain('ヘッダー行');
  });

  it('セクター名が空、表示順が整数でない行はエラーとして報告する', () => {
    const csv = 'セクター名,表示順\n,1\n電気機器,abc\n輸送用機器,3\n';
    const result = parseSectorCsv(csv);
    expect(result.ok).toBe(false);
    expect(result.rows).toEqual([{ name: '輸送用機器', displayOrder: 3 }]);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].rowNumber).toBe(1);
    expect(result.errors[1].rowNumber).toBe(2);
  });

  it('空文字列(ヘッダーすらない)はエラーを返す', () => {
    const result = parseSectorCsv('');
    expect(result.ok).toBe(false);
  });
});

describe('buildSectorCsv', () => {
  it('表示順昇順に並べ替え、先頭にBOMを付与したCSV文字列を返す', () => {
    const sectors: Sector[] = [
      { id: 's2', name: '電気機器', displayOrder: 2, createdAt: '' },
      { id: 's1', name: '輸送用機器', displayOrder: 1, createdAt: '' },
    ];
    const csv = buildSectorCsv(sectors);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe('﻿セクター名,表示順\r\n輸送用機器,1\r\n電気機器,2');
  });
});
