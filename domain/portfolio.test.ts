import { describe, it, expect } from 'vitest';
import { computeSectorAllocation } from '@/domain/portfolio';
import type { HoldingPosition } from '@/domain/holdings';
import type { Security, Sector, CashBalance } from '@/domain/types';

function makeSecurity(overrides: Partial<Security> & Pick<Security, 'id'>): Security {
  return {
    code: null,
    name: '銘柄',
    normalizedName: '銘柄',
    productType: 'jp_stock',
    currency: 'JPY',
    market: null,
    createdAt: '',
    aliases: [],
    sectorId: null,
    unitShareQuantity: null,
    ...overrides,
  };
}

function makePosition(overrides: Partial<HoldingPosition> & Pick<HoldingPosition, 'securityId'>): HoldingPosition {
  return {
    accountType: 'specific',
    quantity: 0,
    averageCostAmount: 0,
    currency: 'JPY',
    ...overrides,
  };
}

describe('computeSectorAllocation', () => {
  it('セクター単位・現金を含めて評価額と比率を算出する(通貨は分離)', () => {
    const sectorA: Sector = { id: 'sec-a', name: '輸送用機器', displayOrder: 1, createdAt: '' };
    const securities: Security[] = [
      makeSecurity({ id: 'security-1', sectorId: 'sec-a' }),
      makeSecurity({ id: 'security-2', sectorId: null }),
    ];
    const positions: HoldingPosition[] = [
      makePosition({ securityId: 'security-1', quantity: 10 }), // 現在値1000円 → 10,000円
      makePosition({ securityId: 'security-2', quantity: 5 }), // 現在値2000円 → 10,000円(セクター未設定)
    ];
    const currentPriceBySecurityId = new Map([
      ['security-1', 1000],
      ['security-2', 2000],
    ]);
    const cashBalance: CashBalance = { currency: 'JPY', amount: 5000, updatedAt: '' };

    const result = computeSectorAllocation(
      positions,
      currentPriceBySecurityId,
      securities,
      [sectorA],
      cashBalance,
      'JPY'
    );

    expect(result.totalAmount).toBe(25000);
    expect(result.entries).toEqual([
      { kind: 'sector', sectorId: 'sec-a', label: '輸送用機器', evaluationAmount: 10000, percent: 40 },
      { kind: 'no_sector', sectorId: null, label: 'セクター未設定', evaluationAmount: 10000, percent: 40 },
      { kind: 'cash', sectorId: null, label: '現金', evaluationAmount: 5000, percent: 20 },
    ]);
  });

  it('現在値未登録の銘柄は集計対象外とする', () => {
    const securities: Security[] = [makeSecurity({ id: 'security-1' })];
    const positions: HoldingPosition[] = [makePosition({ securityId: 'security-1', quantity: 10 })];

    const result = computeSectorAllocation(positions, new Map(), securities, [], undefined, 'JPY');

    expect(result.totalAmount).toBe(0);
    expect(result.entries).toHaveLength(0);
  });

  it('通貨が異なるポジションは集計対象外とする', () => {
    const securities: Security[] = [makeSecurity({ id: 'security-1', currency: 'USD' })];
    const positions: HoldingPosition[] = [
      makePosition({ securityId: 'security-1', quantity: 10, currency: 'USD' }),
    ];
    const currentPriceBySecurityId = new Map([['security-1', 100]]);

    const result = computeSectorAllocation(
      positions,
      currentPriceBySecurityId,
      securities,
      [],
      undefined,
      'JPY'
    );

    expect(result.totalAmount).toBe(0);
  });
});
