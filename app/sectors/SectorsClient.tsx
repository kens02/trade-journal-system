'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Sector, Security } from '@/domain/types';
import { createSector, updateSector, deleteSector, listSectors, listSecurities, updateSecurity } from '@/db/repository';
import { parseSectorCsv, buildSectorCsv, buildSectorCsvFilename, type SectorCsvRow } from '@/domain/sectorCsv';
import { detectAndDecode } from '@/import/encoding';

// implement-p3.md 6.1節: セクターマスタのCRUD(作成・改名・表示順変更・削除)+CSVインポート/エクスポート+銘柄への紐付け
export function SectorsClient() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [securities, setSecurities] = useState<Security[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [importPreview, setImportPreview] = useState<{ rows: SectorCsvRow[]; errors: string[] } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [sectorRows, securityRows] = await Promise.all([listSectors(), listSecurities()]);
    setSectors([...sectorRows].sort((a, b) => a.displayOrder - b.displayOrder));
    setSecurities(securityRows);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (name === '') return;
    const nextOrder = sectors.reduce((max, s) => Math.max(max, s.displayOrder), 0) + 1;
    await createSector({ name, displayOrder: nextOrder });
    setNewName('');
    await refresh();
  }

  function startRename(sector: Sector) {
    setRenamingId(sector.id);
    setRenameValue(sector.name);
  }

  async function submitRename(sector: Sector) {
    const name = renameValue.trim();
    if (name !== '' && name !== sector.name) {
      await updateSector(sector.id, { name });
      await refresh();
    }
    setRenamingId(null);
  }

  // implement-p3.md 6.1節: 表示順を隣接するセクターと入れ替える(上/下ボタン)
  async function moveSector(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sectors.length) return;
    const current = sectors[index];
    const target = sectors[targetIndex];
    await Promise.all([
      updateSector(current.id, { displayOrder: target.displayOrder }),
      updateSector(target.id, { displayOrder: current.displayOrder }),
    ]);
    await refresh();
  }

  async function handleDelete(sector: Sector) {
    const linkedCount = securities.filter((s) => s.sectorId === sector.id).length;
    const message =
      linkedCount > 0
        ? `セクター「${sector.name}」を削除しますか?紐付く${linkedCount}件の銘柄はセクターなしになります。この操作は取り消せません。`
        : `セクター「${sector.name}」を削除しますか?この操作は取り消せません。`;
    if (!window.confirm(message)) return;
    await deleteSector(sector.id);
    await refresh();
  }

  async function handleSecuritySectorChange(securityId: string, sectorId: string) {
    await updateSecurity(securityId, { sectorId: sectorId === '' ? null : sectorId });
    await refresh();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const { text } = detectAndDecode(buffer);
    const result = parseSectorCsv(text);
    setImportPreview({
      rows: result.rows,
      errors: result.errors.map((err) => `${err.rowNumber}行目: ${err.message}`),
    });
  }

  async function handleConfirmImport() {
    if (!importPreview || importPreview.rows.length === 0) return;
    for (const row of importPreview.rows) {
      await createSector({ name: row.name, displayOrder: row.displayOrder });
    }
    setImportPreview(null);
    await refresh();
  }

  function handleExport() {
    const csv = buildSectorCsv(sectors);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = buildSectorCsvFilename(new Date());
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  if (!loaded) {
    return <p className="text-sm text-gray-500">読み込み中...</p>;
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-lg font-bold">セクター一覧</h2>

        <form onSubmit={handleCreate} className="flex gap-2 items-end border rounded p-4">
          <div>
            <label className="block text-sm font-medium">セクター名</label>
            <input
              type="text"
              className="border rounded px-2 py-1"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <button type="submit" className="bg-blue-600 text-white px-4 py-1 rounded">
            作成
          </button>
        </form>

        <div className="flex gap-2">
          <button type="button" className="text-sm border rounded px-3 py-1" onClick={() => fileInputRef.current?.click()}>
            CSVインポート
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => void handleFileSelected(e)}
          />
          <button type="button" className="text-sm border rounded px-3 py-1" onClick={handleExport}>
            CSVエクスポート
          </button>
        </div>

        {importPreview && (
          <div className="border rounded p-4 bg-gray-50 space-y-2">
            <p className="text-sm">
              取込対象: {importPreview.rows.length}件
              {importPreview.errors.length > 0 && `(エラー: ${importPreview.errors.length}行)`}
            </p>
            {importPreview.errors.length > 0 && (
              <ul className="text-xs text-red-600 list-disc pl-4">
                {importPreview.errors.map((message, i) => (
                  <li key={i}>{message}</li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="bg-blue-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
                disabled={importPreview.rows.length === 0}
                onClick={() => void handleConfirmImport()}
              >
                取り込む
              </button>
              <button type="button" className="text-sm border rounded px-3 py-1" onClick={() => setImportPreview(null)}>
                キャンセル
              </button>
            </div>
          </div>
        )}

        {sectors.length === 0 ? (
          <p className="text-sm text-gray-500">登録されたセクターはまだありません。</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">表示順</th>
                <th className="p-2">セクター名</th>
                <th className="p-2">紐付く銘柄数</th>
                <th className="p-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {sectors.map((sector, index) => (
                <tr key={sector.id} className="border-b">
                  <td className="p-2">{sector.displayOrder}</td>
                  <td className="p-2">
                    {renamingId === sector.id ? (
                      <input
                        type="text"
                        autoFocus
                        className="border rounded px-2 py-1"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => void submitRename(sector)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void submitRename(sector);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                      />
                    ) : (
                      sector.name
                    )}
                  </td>
                  <td className="p-2">{securities.filter((s) => s.sectorId === sector.id).length}</td>
                  <td className="p-2 space-x-2 whitespace-nowrap">
                    <button type="button" className="text-blue-600 underline" onClick={() => startRename(sector)}>
                      改名
                    </button>
                    <button
                      type="button"
                      className="text-gray-700 underline disabled:opacity-30"
                      disabled={index === 0}
                      onClick={() => void moveSector(index, -1)}
                    >
                      上へ
                    </button>
                    <button
                      type="button"
                      className="text-gray-700 underline disabled:opacity-30"
                      disabled={index === sectors.length - 1}
                      onClick={() => void moveSector(index, 1)}
                    >
                      下へ
                    </button>
                    <button type="button" className="text-red-600 underline" onClick={() => void handleDelete(sector)}>
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">銘柄へのセクター紐付け</h2>
        {securities.length === 0 ? (
          <p className="text-sm text-gray-500">登録された銘柄はまだありません。</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">銘柄</th>
                <th className="p-2">セクター</th>
              </tr>
            </thead>
            <tbody>
              {securities.map((security) => (
                <tr key={security.id} className="border-b">
                  <td className="p-2">
                    {security.name}
                    {security.code ? ` (${security.code})` : ''}
                  </td>
                  <td className="p-2">
                    <select
                      className="border rounded px-2 py-1"
                      value={security.sectorId ?? ''}
                      onChange={(e) => void handleSecuritySectorChange(security.id, e.target.value)}
                    >
                      <option value="">未設定</option>
                      {sectors.map((sector) => (
                        <option key={sector.id} value={sector.id}>
                          {sector.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
