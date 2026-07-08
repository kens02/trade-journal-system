'use client';

import { useState } from 'react';
import type { Tag } from '@/domain/types';

interface Props {
  tags: Tag[];
  onRename: (tagId: string, name: string) => void;
  onDelete: (tagId: string) => void;
}

const KIND_LABEL: Record<Tag['kind'], string> = {
  emotion: '感情',
  free: '自由',
};

// implement-p2.md 7章: タグマスタ管理(改名・削除)
export function TagManager({ tags, onRename, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  if (tags.length === 0) {
    return <p className="text-sm text-gray-500">登録されたタグはまだありません。</p>;
  }

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b text-left">
          <th className="p-2">タグ名</th>
          <th className="p-2">種別</th>
          <th className="p-2">操作</th>
        </tr>
      </thead>
      <tbody>
        {tags.map((tag) => (
          <tr key={tag.id} className="border-b">
            <td className="p-2">
              {editingId === tag.id ? (
                <input
                  type="text"
                  className="border rounded px-2 py-0.5"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                />
              ) : (
                tag.name
              )}
            </td>
            <td className="p-2">{KIND_LABEL[tag.kind]}</td>
            <td className="p-2 space-x-2 whitespace-nowrap">
              {editingId === tag.id ? (
                <>
                  <button
                    type="button"
                    className="text-blue-600 underline"
                    onClick={() => {
                      if (draftName.trim()) {
                        onRename(tag.id, draftName.trim());
                      }
                      setEditingId(null);
                    }}
                  >
                    保存
                  </button>
                  <button type="button" className="underline" onClick={() => setEditingId(null)}>
                    キャンセル
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="text-blue-600 underline"
                    onClick={() => {
                      setEditingId(tag.id);
                      setDraftName(tag.name);
                    }}
                  >
                    改名
                  </button>
                  <button
                    type="button"
                    className="text-red-600 underline"
                    onClick={() => {
                      if (window.confirm(`タグ「${tag.name}」を削除しますか?付与済みエントリからも解除されます。`)) {
                        onDelete(tag.id);
                      }
                    }}
                  >
                    削除
                  </button>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
