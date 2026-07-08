'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import {
  listSecurities,
  listTrades,
  listRules,
  listAllRuleVersions,
  listAllTradeRuleLinks,
  listAllTradeMatches,
  listJournalEntries,
  listTags,
  listAllJournalTags,
  listPriceSnapshots,
  listImportBatches,
  listAppMeta,
  restoreFromBackup,
} from '@/db/repository';
import { buildBackupPayload, buildBackupFilename, parseBackupPayload } from '@/domain/backup';

// implement-p1.md 5章共通レイアウト: アプリ名+画面ナビゲーション+バックアップ(JSON)ボタン。
// P4前倒しで復元(JSON)ボタンも追加(全置換方式)
export function Header() {
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleBackup() {
    setExporting(true);
    try {
      const [
        securities,
        trades,
        rules,
        ruleVersions,
        tradeRuleLinks,
        tradeMatches,
        journalEntries,
        tags,
        journalTags,
        priceSnapshots,
        importBatches,
        appMeta,
      ] = await Promise.all([
        listSecurities(),
        listTrades(),
        listRules(),
        listAllRuleVersions(),
        listAllTradeRuleLinks(),
        listAllTradeMatches(),
        listJournalEntries(),
        listTags(),
        listAllJournalTags(),
        listPriceSnapshots(),
        listImportBatches(),
        listAppMeta(),
      ]);
      const now = new Date();
      const payload = buildBackupPayload(
        {
          securities,
          trades,
          rules,
          ruleVersions,
          tradeRuleLinks,
          tradeMatches,
          journalEntries,
          tags,
          journalTags,
          priceSnapshots,
          importBatches,
          appMeta,
        },
        now.toISOString()
      );
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = buildBackupFilename(now);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function handleRestoreFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // 同じファイルを再選択してもonChangeが発火するようにする
    if (!file) return;

    setRestoreError(null);
    const text = await file.text();
    const result = parseBackupPayload(text);
    if (!result.ok) {
      setRestoreError(result.error);
      return;
    }

    const confirmed = window.confirm(
      '現在の全データを削除し、選択したバックアップの内容に置き換えます。この操作は取り消せません。実行しますか?'
    );
    if (!confirmed) return;

    setRestoring(true);
    try {
      await restoreFromBackup(result.payload.data);
      window.location.reload();
    } finally {
      setRestoring(false);
    }
  }

  return (
    <header className="border-b p-4 flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-4">
        <Link href="/" className="font-bold">
          trade-journal-system
        </Link>
        <nav className="flex gap-3 text-sm">
          <Link href="/trades" className="text-blue-600 underline">
            取引
          </Link>
          <Link href="/rules" className="text-blue-600 underline">
            ルール
          </Link>
          <Link href="/summary" className="text-blue-600 underline">
            集計
          </Link>
          <Link href="/import" className="text-blue-600 underline">
            インポート
          </Link>
          <Link href="/journal" className="text-blue-600 underline">
            ジャーナル
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-2">
        {restoreError && <p className="text-sm text-red-600">{restoreError}</p>}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={restoring}
          className="text-sm border rounded px-3 py-1 disabled:opacity-50"
        >
          {restoring ? '復元中...' : '復元(JSON)'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => void handleRestoreFileSelected(e)}
        />
        <button
          type="button"
          onClick={handleBackup}
          disabled={exporting}
          className="text-sm border rounded px-3 py-1 disabled:opacity-50"
        >
          {exporting ? '書き出し中...' : 'バックアップ(JSON)'}
        </button>
      </div>
    </header>
  );
}
