'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Security, Trade, Tag, JournalEntry, JournalTag } from '@/domain/types';
import {
  listSecurities,
  listTrades,
  listTags,
  listJournalEntries,
  listAllJournalTags,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  setJournalTagsForEntry,
  createTag,
  updateTag,
  deleteTag,
} from '@/db/repository';
import { searchJournalEntries } from '@/domain/journalSearch';
import { buildJournalCsv, buildJournalCsvFilename } from '@/domain/journalCsv';
import { JournalEntryForm, type JournalEntryFormSubmitPayload } from './JournalEntryForm';
import { JournalList } from './JournalList';
import { TagManager } from './TagManager';

export function JournalClient() {
  const searchParams = useSearchParams();
  const prefillTradeId = searchParams.get('tradeId');

  const [securities, setSecurities] = useState<Security[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [journalTags, setJournalTagsState] = useState<JournalTag[]>([]);
  const [editingEntry, setEditingEntry] = useState<{ entry: JournalEntry; tagIds: string[] } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const [securityRows, tradeRows, tagRows, entryRows, journalTagRows] = await Promise.all([
      listSecurities(),
      listTrades(),
      listTags(),
      listJournalEntries(),
      listAllJournalTags(),
    ]);
    setSecurities(securityRows);
    setTrades(tradeRows);
    setTags(tagRows);
    setEntries(entryRows);
    setJournalTagsState(journalTagRows);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const securitiesById = useMemo(() => new Map(securities.map((s) => [s.id, s])), [securities]);
  const tradesById = useMemo(() => new Map(trades.map((t) => [t.id, t])), [trades]);
  const tagsById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const tagsByEntryId = useMemo(() => {
    const map = new Map<string, Tag[]>();
    for (const link of journalTags) {
      const tag = tagsById.get(link.tagId);
      if (!tag) continue;
      const list = map.get(link.journalId);
      if (list) {
        list.push(tag);
      } else {
        map.set(link.journalId, [tag]);
      }
    }
    return map;
  }, [journalTags, tagsById]);

  const tagNamesByEntryId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [entryId, entryTags] of tagsByEntryId) {
      map.set(entryId, entryTags.map((t) => t.name));
    }
    return map;
  }, [tagsByEntryId]);

  const searchResults = useMemo(
    () => searchJournalEntries(entries, tagNamesByEntryId, searchQuery),
    [entries, tagNamesByEntryId, searchQuery]
  );

  const prefill = useMemo(() => {
    if (!prefillTradeId) return null;
    const trade = tradesById.get(prefillTradeId);
    if (!trade) return null;
    return { tradeId: trade.id, entryDate: trade.tradeDate };
  }, [prefillTradeId, tradesById]);

  async function handleCreate(payload: JournalEntryFormSubmitPayload) {
    const entry = await createJournalEntry({
      tradeId: payload.tradeId,
      entryDate: payload.entryDate,
      body: payload.body,
    });
    if (payload.tagIds.length > 0) {
      await setJournalTagsForEntry(entry.id, payload.tagIds);
    }
    await refresh();
  }

  async function handleUpdate(payload: JournalEntryFormSubmitPayload) {
    if (!editingEntry) return;
    await updateJournalEntry(editingEntry.entry.id, {
      body: payload.body,
      entryDate: payload.entryDate,
    });
    await setJournalTagsForEntry(editingEntry.entry.id, payload.tagIds);
    setEditingEntry(null);
    await refresh();
  }

  async function handleAutosaveBody(body: string) {
    if (!editingEntry) return;
    await updateJournalEntry(editingEntry.entry.id, { body });
    await refresh();
  }

  function handleEdit(entry: JournalEntry) {
    const tagIds = (tagsByEntryId.get(entry.id) ?? []).map((t) => t.id);
    setEditingEntry({ entry, tagIds });
  }

  async function handleDelete(entryId: string) {
    await deleteJournalEntry(entryId);
    if (editingEntry?.entry.id === entryId) {
      setEditingEntry(null);
    }
    await refresh();
  }

  async function handleCreateTag(input: { name: string; kind: 'free' }): Promise<Tag> {
    const tag = await createTag(input);
    await refresh();
    return tag;
  }

  async function handleRenameTag(tagId: string, name: string) {
    await updateTag(tagId, { name });
    await refresh();
  }

  async function handleDeleteTag(tagId: string) {
    await deleteTag(tagId);
    await refresh();
  }

  // implement-p4.md 5.1節: ジャーナルCSVエクスポート(BOM付きUTF-8)。検索絞り込みに関わらず全件を対象とする
  function handleExportCsv() {
    const csv = buildJournalCsv(entries, tradesById, securitiesById, tagsByEntryId);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = buildJournalCsvFilename(new Date());
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
      <JournalEntryForm
        key={editingEntry?.entry.id ?? `create-${prefillTradeId ?? ''}`}
        trades={trades}
        securitiesById={securitiesById}
        tags={tags}
        mode={editingEntry ? 'edit' : 'create'}
        initial={editingEntry}
        prefill={editingEntry ? null : prefill}
        onSubmit={editingEntry ? handleUpdate : handleCreate}
        onAutosaveBody={editingEntry ? handleAutosaveBody : undefined}
        onCreateTag={handleCreateTag}
        onCancel={() => setEditingEntry(null)}
      />

      <div>
        <button type="button" className="text-sm border rounded px-3 py-1" onClick={handleExportCsv}>
          CSVエクスポート
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">検索(本文・タグ名の部分一致)</label>
        <input
          type="text"
          className="border rounded px-2 py-1 w-full max-w-sm"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="キーワードを入力"
        />
      </div>

      <JournalList
        entries={searchResults}
        tradesById={tradesById}
        securitiesById={securitiesById}
        tagsByEntryId={tagsByEntryId}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <div>
        <h2 className="font-bold mb-2">タグ管理</h2>
        <TagManager tags={tags} onRename={handleRenameTag} onDelete={handleDeleteTag} />
      </div>
    </div>
  );
}
