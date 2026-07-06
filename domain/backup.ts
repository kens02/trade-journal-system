import type { Security, Trade, Rule, RuleVersion, TradeRuleLink } from './types';

export interface BackupAppMetaRecord {
  key: string;
  value: unknown;
}

export interface BackupData {
  securities: Security[];
  trades: Trade[];
  rules: Rule[];
  ruleVersions: RuleVersion[];
  tradeRuleLinks: TradeRuleLink[];
  appMeta: BackupAppMetaRecord[];
}

export interface BackupPayload {
  schemaVersion: 1;
  exportedAt: string;
  data: BackupData;
}

// implement-p1.md 5章共通レイアウト: 全テーブルをJSON1ファイルでバックアップ(スキーマバージョン付き)
export function buildBackupPayload(data: BackupData, exportedAt: string): BackupPayload {
  return { schemaVersion: 1, exportedAt, data };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// implement-p1.md 5章共通レイアウト: ファイル名 trade-journal-backup-YYYYMMDD-HHmm.json
export function buildBackupFilename(exportedAt: Date): string {
  const y = exportedAt.getFullYear();
  const m = pad2(exportedAt.getMonth() + 1);
  const d = pad2(exportedAt.getDate());
  const hh = pad2(exportedAt.getHours());
  const mm = pad2(exportedAt.getMinutes());
  return `trade-journal-backup-${y}${m}${d}-${hh}${mm}.json`;
}
