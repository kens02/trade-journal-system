'use client';

import { useEffect, useRef, useState } from 'react';
import type { JournalEntry, Tag, Trade, Security } from '@/domain/types';
import { formatJPY, formatUSD } from '@/domain/money';

export interface JournalEntryFormSubmitPayload {
  tradeId: string | null;
  entryDate: string;
  body: string;
  tagIds: string[];
}

interface EditingInitial {
  entry: JournalEntry;
  tagIds: string[];
}

interface Prefill {
  tradeId: string;
  entryDate: string;
}

interface Props {
  trades: Trade[];
  securitiesById: Map<string, Security>;
  tags: Tag[];
  mode: 'create' | 'edit';
  initial?: EditingInitial | null;
  prefill?: Prefill | null;
  onSubmit: (payload: JournalEntryFormSubmitPayload) => Promise<void>;
  onAutosaveBody?: (body: string) => Promise<void>;
  onCreateTag: (input: { name: string; kind: 'free' }) => Promise<Tag>;
  onCancel?: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function tradeLabel(trade: Trade, securitiesById: Map<string, Security>): string {
  const security = securitiesById.get(trade.securityId);
  const amount = trade.currency === 'JPY' ? formatJPY(trade.amount) : formatUSD(trade.amount);
  return `${trade.tradeDate} ${security?.name ?? '(不明な銘柄)'} ${trade.side === 'buy' ? '買' : '売'} ${amount}`;
}

// implement-p2.md 7章画面E: エントリ作成・編集フォーム。
// 取引紐付け(取引一覧・詳細から遷移してprefillされる場合を含む)か日単位かを選択して作成し、
// 編集モードでは本文を編集停止2秒後に自動保存+明示保存の両方を提供する
export function JournalEntryForm({
  trades,
  securitiesById,
  tags,
  mode,
  initial,
  prefill,
  onSubmit,
  onAutosaveBody,
  onCreateTag,
  onCancel,
}: Props) {
  const [linkKind, setLinkKind] = useState<'trade' | 'day'>(() =>
    initial?.entry.tradeId || prefill ? 'trade' : 'day'
  );
  const [tradeId, setTradeId] = useState(() => initial?.entry.tradeId ?? prefill?.tradeId ?? '');
  const [entryDate, setEntryDate] = useState(() => initial?.entry.entryDate ?? prefill?.entryDate ?? today());
  const [body, setBody] = useState(() => initial?.entry.body ?? '');
  const [tagIds, setTagIds] = useState<string[]>(() => initial?.tagIds ?? []);
  const [newTagName, setNewTagName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstBodyRender = useRef(true);

  // implement-p2.md 7章: 編集モードのみ、本文の編集停止2秒後に自動保存する
  useEffect(() => {
    if (mode !== 'edit' || !onAutosaveBody) return;
    if (isFirstBodyRender.current) {
      isFirstBodyRender.current = false;
      return;
    }
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      setAutosaveStatus('saving');
      void onAutosaveBody(body).then(() => setAutosaveStatus('saved'));
    }, 2000);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, mode]);

  function toggleTag(tagId: string) {
    setTagIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
  }

  async function handleCreateTag() {
    const name = newTagName.trim();
    if (!name) return;
    const tag = await onCreateTag({ name, kind: 'free' });
    setTagIds((prev) => [...prev, tag.id]);
    setNewTagName('');
  }

  function validate(): { errors: Record<string, string>; parsed: JournalEntryFormSubmitPayload | null } {
    const nextErrors: Record<string, string> = {};
    if (linkKind === 'trade' && !tradeId) {
      nextErrors.tradeId = '取引を選択してください。';
    }
    if (linkKind === 'day' && !entryDate) {
      nextErrors.entryDate = '日付を入力してください。';
    }
    if (Object.keys(nextErrors).length > 0) {
      return { errors: nextErrors, parsed: null };
    }
    const resolvedTrade = linkKind === 'trade' ? trades.find((t) => t.id === tradeId) : undefined;
    return {
      errors: {},
      parsed: {
        tradeId: linkKind === 'trade' ? tradeId : null,
        entryDate: linkKind === 'trade' && resolvedTrade ? resolvedTrade.tradeDate : entryDate,
        body,
        tagIds,
      },
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { errors: nextErrors, parsed } = validate();
    setErrors(nextErrors);
    if (!parsed) return;
    setSubmitting(true);
    try {
      await onSubmit(parsed);
    } finally {
      setSubmitting(false);
    }
  }

  const emotionTags = tags.filter((t) => t.kind === 'emotion');
  const freeTags = tags.filter((t) => t.kind === 'free');
  const linkedTrade = mode === 'edit' ? trades.find((t) => t.id === initial?.entry.tradeId) : undefined;

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border rounded p-4">
      <h2 className="font-bold">{mode === 'create' ? 'エントリを作成' : 'エントリを編集'}</h2>

      {mode === 'edit' && initial?.entry.tradeId ? (
        <p className="text-sm text-gray-700">
          紐付け取引: {linkedTrade ? tradeLabel(linkedTrade, securitiesById) : '(不明な取引)'}
        </p>
      ) : mode === 'edit' ? (
        <div>
          <label className="block text-sm font-medium">日付</label>
          <input
            type="date"
            className="border rounded px-2 py-1"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
          />
        </div>
      ) : (
        <>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={linkKind === 'trade'}
                onChange={() => setLinkKind('trade')}
              />
              取引に紐付ける
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={linkKind === 'day'} onChange={() => setLinkKind('day')} />
              日付のみ指定
            </label>
          </div>

          {linkKind === 'trade' ? (
            <div>
              <label className="block text-sm font-medium">取引</label>
              <select
                className="border rounded px-2 py-1 w-full"
                value={tradeId}
                onChange={(e) => setTradeId(e.target.value)}
              >
                <option value="">選択してください</option>
                {[...trades]
                  .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {tradeLabel(t, securitiesById)}
                    </option>
                  ))}
              </select>
              {errors.tradeId && <p className="text-sm text-red-600">{errors.tradeId}</p>}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium">日付</label>
              <input
                type="date"
                className="border rounded px-2 py-1"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
              {errors.entryDate && <p className="text-sm text-red-600">{errors.entryDate}</p>}
            </div>
          )}
        </>
      )}

      <div>
        <label className="block text-sm font-medium">本文</label>
        <textarea
          className="border rounded px-2 py-1 w-full"
          rows={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {mode === 'edit' && (
          <p className="text-xs text-gray-500">
            {autosaveStatus === 'saving' && '自動保存中...'}
            {autosaveStatus === 'saved' && '自動保存しました'}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">タグ</label>
        <div>
          <p className="text-xs text-gray-500 mb-1">感情タグ</p>
          <div className="flex gap-3 flex-wrap text-sm">
            {emotionTags.map((tag) => (
              <label key={tag.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={tagIds.includes(tag.id)}
                  onChange={() => toggleTag(tag.id)}
                />
                {tag.name}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">自由タグ</p>
          <div className="flex gap-3 flex-wrap text-sm">
            {freeTags.map((tag) => (
              <label key={tag.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={tagIds.includes(tag.id)}
                  onChange={() => toggleTag(tag.id)}
                />
                {tag.name}
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              className="border rounded px-2 py-1 text-sm"
              placeholder="新規タグ名"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
            />
            <button
              type="button"
              className="text-sm text-blue-600 underline"
              onClick={handleCreateTag}
            >
              + 追加
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50"
          disabled={submitting}
        >
          {mode === 'create' ? '登録' : '更新'}
        </button>
        {mode === 'edit' && onCancel && (
          <button type="button" className="px-4 py-1 rounded border" onClick={onCancel}>
            キャンセル
          </button>
        )}
      </div>
    </form>
  );
}
