'use client';

import { useEffect, useState } from 'react';
import type { ImportBatch } from '@/domain/types';
import { listImportBatches } from '@/db/repository';

const FILE_TYPE_LABEL: Record<ImportBatch['fileType'], string> = {
  domestic_history: '約定履歴照会(国内)',
  us_history: '米国株式約定履歴',
  portfolio: 'ポートフォリオ',
};

interface Props {
  imported: number;
  skipped: number;
  error: number;
  errorRows: { rowNumber: number; reason: string }[];
}

// implement-p2.md 5.3節画面D: 取込結果サマリー+取込履歴一覧
export function ImportSummary({ imported, skipped, error, errorRows }: Props) {
  const [batches, setBatches] = useState<ImportBatch[] | null>(null);

  useEffect(() => {
    void listImportBatches().then((list) => {
      setBatches([...list].sort((a, b) => b.importedAt.localeCompare(a.importedAt)));
    });
  }, [imported]);

  return (
    <div className="space-y-6">
      <div className="border rounded p-4 space-y-2">
        <h2 className="font-bold">取込結果</h2>
        <p className="text-sm">
          取込 {imported}件 / スキップ {skipped}件 / エラー {error}件
        </p>
        {errorRows.length > 0 && (
          <ul className="text-sm text-red-600 list-disc pl-5">
            {errorRows.map((e, i) => (
              <li key={i}>
                {e.rowNumber}行目: {e.reason}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="font-bold mb-2">取込履歴</h2>
        {!batches ? (
          <p className="text-sm text-gray-500">読み込み中...</p>
        ) : batches.length === 0 ? (
          <p className="text-sm text-gray-500">取込履歴はまだありません。</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">取込日時</th>
                <th className="p-2">ファイル名</th>
                <th className="p-2">種別</th>
                <th className="p-2">取込/スキップ/エラー</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-b">
                  <td className="p-2">{new Date(b.importedAt).toLocaleString('ja-JP')}</td>
                  <td className="p-2">{b.fileName}</td>
                  <td className="p-2">{FILE_TYPE_LABEL[b.fileType]}</td>
                  <td className="p-2">
                    {b.counts.imported} / {b.counts.skipped} / {b.counts.error}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
