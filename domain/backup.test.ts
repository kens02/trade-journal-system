import { describe, it, expect } from 'vitest';
import { buildBackupPayload, buildBackupFilename, parseBackupPayload, type BackupData } from '@/domain/backup';

const emptyData: BackupData = {
  securities: [],
  trades: [],
  rules: [],
  ruleVersions: [],
  tradeRuleLinks: [],
  tradeMatches: [],
  journalEntries: [],
  tags: [],
  journalTags: [],
  priceSnapshots: [],
  importBatches: [],
  sectors: [],
  fxRates: [],
  targetAllocations: [],
  nisaUsages: [],
  cashBalances: [],
  appMeta: [],
};

describe('buildBackupPayload', () => {
  it('schemaVersion 3とexportedAt、dataをそのまま包んだ形にする', () => {
    const payload = buildBackupPayload(emptyData, '2026-07-06T00:00:00.000Z');
    expect(payload).toEqual({
      schemaVersion: 3,
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

describe('parseBackupPayload', () => {
  it('v3形式のバックアップを正しく読み込める', () => {
    const raw = JSON.stringify(buildBackupPayload(emptyData, '2026-07-06T00:00:00.000Z'));
    const result = parseBackupPayload(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.schemaVersion).toBe(3);
      expect(result.payload.data).toEqual(emptyData);
    }
  });

  it('v1形式(P2・P3分のテーブルを含まない)は空配列で補完してv3形状に正規化する', () => {
    const v1Raw = JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      data: {
        securities: [{ id: 'sec-1' }],
        trades: [],
        rules: [],
        ruleVersions: [],
        tradeRuleLinks: [],
        appMeta: [],
      },
    });
    const result = parseBackupPayload(v1Raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.schemaVersion).toBe(3);
      expect(result.payload.data.securities).toEqual([{ id: 'sec-1' }]);
      expect(result.payload.data.tradeMatches).toEqual([]);
      expect(result.payload.data.journalEntries).toEqual([]);
      expect(result.payload.data.tags).toEqual([]);
      expect(result.payload.data.sectors).toEqual([]);
      expect(result.payload.data.targetAllocations).toEqual([]);
      expect(result.payload.data.cashBalances).toEqual([]);
    }
  });

  it('v2形式(P3分のテーブルを含まない)は空配列で補完してv3形状に正規化する', () => {
    const v2Raw = JSON.stringify({
      schemaVersion: 2,
      exportedAt: '2026-02-01T00:00:00.000Z',
      data: {
        securities: [],
        trades: [],
        rules: [],
        ruleVersions: [],
        tradeRuleLinks: [],
        tradeMatches: [{ id: 'match-1' }],
        journalEntries: [],
        tags: [],
        journalTags: [],
        priceSnapshots: [],
        importBatches: [],
        appMeta: [],
      },
    });
    const result = parseBackupPayload(v2Raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.schemaVersion).toBe(3);
      expect(result.payload.data.tradeMatches).toEqual([{ id: 'match-1' }]);
      expect(result.payload.data.sectors).toEqual([]);
      expect(result.payload.data.fxRates).toEqual([]);
      expect(result.payload.data.nisaUsages).toEqual([]);
    }
  });

  it('不正なJSON文字列はエラーになる', () => {
    const result = parseBackupPayload('{ this is not json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('JSON');
    }
  });

  it('対応していないschemaVersionはエラーになる', () => {
    const raw = JSON.stringify({ schemaVersion: 99, exportedAt: '2026-01-01T00:00:00.000Z', data: {} });
    const result = parseBackupPayload(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('schemaVersion');
    }
  });

  it('必須テーブルが配列でない場合はエラーになる', () => {
    const raw = JSON.stringify({
      schemaVersion: 3,
      exportedAt: '2026-01-01T00:00:00.000Z',
      data: { securities: 'not-an-array' },
    });
    const result = parseBackupPayload(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('securities');
    }
  });
});
