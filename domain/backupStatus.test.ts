import { describe, it, expect } from 'vitest';
import { computeBackupStatus } from '@/domain/backupStatus';

describe('computeBackupStatus', () => {
  it('lastBackupAtがnull(未実施)の場合はoverdue:trueを返す', () => {
    const result = computeBackupStatus(null, new Date('2026-07-10T00:00:00.000Z'));
    expect(result).toEqual({ lastBackupAt: null, overdue: true });
  });

  it('7日以内であればoverdue:falseを返す', () => {
    const result = computeBackupStatus(
      '2026-07-05T00:00:00.000Z',
      new Date('2026-07-10T00:00:00.000Z')
    );
    expect(result.overdue).toBe(false);
  });

  it('7日を超過していればoverdue:trueを返す', () => {
    const result = computeBackupStatus(
      '2026-07-01T00:00:00.000Z',
      new Date('2026-07-10T00:00:00.000Z')
    );
    expect(result.overdue).toBe(true);
  });

  it('境界値(ちょうどthresholdDays)はoverdue:falseとする', () => {
    const result = computeBackupStatus(
      '2026-07-03T00:00:00.000Z',
      new Date('2026-07-10T00:00:00.000Z'),
      7
    );
    expect(result.overdue).toBe(false);
  });
});
