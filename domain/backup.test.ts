import { describe, it, expect } from 'vitest';
import { buildBackupPayload, buildBackupFilename, type BackupData } from '@/domain/backup';

const emptyData: BackupData = {
  securities: [],
  trades: [],
  rules: [],
  ruleVersions: [],
  tradeRuleLinks: [],
  appMeta: [],
};

describe('buildBackupPayload', () => {
  it('schemaVersion 1とexportedAt、dataをそのまま包んだ形にする', () => {
    const payload = buildBackupPayload(emptyData, '2026-07-06T00:00:00.000Z');
    expect(payload).toEqual({
      schemaVersion: 1,
      exportedAt: '2026-07-06T00:00:00.000Z',
      data: emptyData,
    });
  });
});

describe('buildBackupFilename', () => {
  it('月/日/時/分が2桁の場合、そのまま連結される', () => {
    const filename = buildBackupFilename(new Date(2026, 6, 6, 16, 45));
    expect(filename).toBe('trade-journal-backup-20260706-1645.json');
  });

  it('月/日/時/分が1桁の場合、ゼロ埋めされる', () => {
    const filename = buildBackupFilename(new Date(2026, 0, 5, 9, 3));
    expect(filename).toBe('trade-journal-backup-20260105-0903.json');
  });
});
