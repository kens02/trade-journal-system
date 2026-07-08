'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  listSecurities,
  listTrades,
  listRules,
  listAllRuleVersions,
  listAllTradeRuleLinks,
  listAppMeta,
} from '@/db/repository';
import { buildBackupPayload, buildBackupFilename } from '@/domain/backup';

// implement-p1.md 5章共通レイアウト: アプリ名+3画面へのナビゲーション+バックアップ(JSON)ボタン
export function Header() {
  const [exporting, setExporting] = useState(false);

  async function handleBackup() {
    setExporting(true);
    try {
      const [securities, trades, rules, ruleVersions, tradeRuleLinks, appMeta] = await Promise.all([
        listSecurities(),
        listTrades(),
        listRules(),
        listAllRuleVersions(),
        listAllTradeRuleLinks(),
        listAppMeta(),
      ]);
      const now = new Date();
      const payload = buildBackupPayload(
        { securities, trades, rules, ruleVersions, tradeRuleLinks, appMeta },
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
      <button
        type="button"
        onClick={handleBackup}
        disabled={exporting}
        className="text-sm border rounded px-3 py-1 disabled:opacity-50"
      >
        {exporting ? '書き出し中...' : 'バックアップ(JSON)'}
      </button>
    </header>
  );
}
