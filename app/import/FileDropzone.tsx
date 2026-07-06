'use client';

import { detectAndDecode } from '@/import/encoding';
import { sniffFileType } from '@/import/common';

export interface FileReadResult {
  fileName: string;
  text: string;
}

interface Props {
  onFileRead: (result: FileReadResult) => void;
  onUnsupportedFile: (message: string) => void;
}

// implement-p2.md 5.3節画面D: ファイル選択(ドラッグ&ドロップはF2では実装しない)
export function FileDropzone({ onFileRead, onUnsupportedFile }: Props) {
  async function handleFile(file: File) {
    const buffer = await file.arrayBuffer();
    const { text } = detectAndDecode(buffer);
    const fileType = sniffFileType(text);

    if (fileType === 'domestic_history') {
      onFileRead({ fileName: file.name, text });
    } else if (fileType === 'us_history' || fileType === 'portfolio') {
      onUnsupportedFile('米国株式CSV/ポートフォリオCSVはまだ未対応です(今後のフェーズで対応予定)。');
    } else {
      onUnsupportedFile('約定履歴照会CSVとして認識できませんでした(ヘッダー行が見つかりません)。');
    }
  }

  return (
    <div className="border rounded p-4">
      <label className="block text-sm font-medium mb-2">
        約定履歴照会CSV(SaveFile_*.csv)を選択
      </label>
      <input
        type="file"
        accept=".csv"
        className="block text-sm"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
