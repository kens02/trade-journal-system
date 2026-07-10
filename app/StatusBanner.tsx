'use client';

import { useEffect, useState } from 'react';
import { getAppMeta } from '@/db/repository';
import { computeBackupStatus, LAST_BACKUP_AT_KEY, type BackupStatus } from '@/domain/backupStatus';
import { isSafariUserAgent } from '@/domain/safariDetection';
import { BACKUP_COMPLETED_EVENT } from './Header';

// implement-p4.md 7章: 機密性の明記(仕様書8章)・最終バックアップ日時表示+7日超過警告(仕様書3.2節)・
// Safari利用時の注意表示(仕様書8章)を全画面共通で表示する
export function StatusBanner() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [isSafari, setIsSafari] = useState(false);

  useEffect(() => {
    async function loadStatus() {
      const lastBackupAt = (await getAppMeta<string>(LAST_BACKUP_AT_KEY)) ?? null;
      setStatus(computeBackupStatus(lastBackupAt, new Date()));
    }
    void loadStatus();
    window.addEventListener(BACKUP_COMPLETED_EVENT, loadStatus);
    return () => window.removeEventListener(BACKUP_COMPLETED_EVENT, loadStatus);
  }, []);

  useEffect(() => {
    setIsSafari(typeof navigator !== 'undefined' && isSafariUserAgent(navigator.userAgent));
  }, []);

  return (
    <div className="border-b bg-gray-50 px-4 py-1 text-xs space-y-0.5">
      <p className="text-gray-500">
        本アプリはサーバーへデータを送信しません。外部APIコールも行わず、全データは端末内のIndexedDBにのみ保存されます。
      </p>
      {status && (
        <p className={status.overdue ? 'text-red-600 font-medium' : 'text-gray-500'}>
          {status.lastBackupAt
            ? `最終バックアップ: ${new Date(status.lastBackupAt).toLocaleString('ja-JP')}`
            : 'まだバックアップが実行されていません。'}
          {status.overdue &&
            '(7日以上経過しています。上部の「バックアップ(JSON)」から取得してください)'}
        </p>
      )}
      {isSafari && (
        <p className="text-amber-700">
          Safariをご利用中です。ITP(Intelligent Tracking
          Prevention)によりストレージが自動削除される場合があります。主対象はChrome/Edgeのため、Safariでは閲覧・軽微な入力用途にとどめ、定期的にJSONバックアップを取得してください。
        </p>
      )}
    </div>
  );
}
