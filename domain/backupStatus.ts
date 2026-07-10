// 仕様書3.2節「起動時に最終バックアップ日時を表示し、一定期間(既定: 7日)を超過していたら警告」/
// implement-p4.md 7章に対応する純粋関数。appMetaのキー名も本ファイルで一元管理する

export const LAST_BACKUP_AT_KEY = 'lastBackupAt';

const DEFAULT_WARNING_THRESHOLD_DAYS = 7;

export interface BackupStatus {
  lastBackupAt: string | null;
  overdue: boolean; // lastBackupAtが未記録(バックアップ未実施)の場合もtrueとする
}

export function computeBackupStatus(
  lastBackupAt: string | null,
  now: Date,
  thresholdDays: number = DEFAULT_WARNING_THRESHOLD_DAYS
): BackupStatus {
  if (lastBackupAt === null) {
    return { lastBackupAt: null, overdue: true };
  }
  const elapsedMs = now.getTime() - new Date(lastBackupAt).getTime();
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
  return { lastBackupAt, overdue: elapsedMs > thresholdMs };
}
