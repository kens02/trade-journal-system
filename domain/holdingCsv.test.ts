import { describe, it, expect } from 'vitest';
import { buildHoldingCsv, buildHoldingCsvFilename } from '@/domain/holdingCsv';
import type { HoldingPosition } from '@/domain/holdings';
import type { Security, Sector } from '@/domain/types';

const security: Security = {
  id: 'sec-1',
  code: '1234',
  name: '銘柄A',
  normalizedName: '銘柄A',
  productType: 'jp_stock',
  currency: 'JPY',
  market: null,
  createdAt: '',
  aliases: [],
  sectorId: 'sector-1',
  unitShareQuantity: 100,
};

const sector: Sector = { id: 'sector-1', name: '輸送用機器', displayOrder: 1, createdAt: '' };

describe('buildHoldingCsv', () => {
  it('保有ポジションをセクター名付きでCSVに変換する', () => {
    const position: HoldingPosition = {
      securityId: 'sec-1',
      accountType: 'nisa_growth',
      quantity: 100,
      averageCostAmount: 1234,
      currency: 'JPY',
    };
    const csv = buildHoldingCsv(
      [position],
      new Map([['sec-1', security]]),
      new Map([['sector-1', sector]])
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe(
      '銘柄コード,銘柄名,口座区分,数量,平均取得単価,通貨,セクター\r\n1234,銘柄A,NISA(成長),100,"1,234円",JPY,輸送用機器'
    );
  });

  it('セクター未紐付けの場合は空欄になる', () => {
    const unsectored: Security = { ...security, sectorId: null };
    const position: HoldingPosition = {
      securityId: 'sec-1',
      accountType: 'specific',
      quantity: 5,
      averageCostAmount: 500,
      currency: 'JPY',
    };
    const csv = buildHoldingCsv([position], new Map([['sec-1', unsectored]]), new Map());
    expect(csv).toContain('特定,5,500円,JPY,');
  });
});

describe('buildHoldingCsvFilename', () => {
  it('holdings-YYYYMMDD-HHmm.csv 形式のファイル名を返す', () => {
    expect(buildHoldingCsvFilename(new Date(2026, 6, 10, 9, 5))).toBe('holdings-20260710-0905.csv');
  });
});
