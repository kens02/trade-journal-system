'use client';

import { detectAndDecode } from '@/import/encoding';
import { sniffFileType, type CsvFileTypeSignature } from '@/import/common';

export interface FileReadResult {
  fileName: string;
  text: string;
  fileType: Exclude<CsvFileTypeSignature, 'unknown'>;
}

interface Props {
  label: string;
  acceptedTypes: Exclude<CsvFileTypeSignature, 'unknown'>[];
  onFileRead: (result: FileReadResult) => void;
  onUnsupportedFile: (message: string) => void;
}

// implement-p2.md 5.3節画面D: ファイル選択(ドラッグ&ドロップは実装しない)。
// acceptedTypesで許可するファイル種別を絞り、それ以外は明示的エラーにする
export function FileDropzone({ label, acceptedTypes, onFileRead, onUnsupportedFile }: Props) {
  async function handleFile(file: File) {
    const buffer = await file.arrayBuffer();
    const { text } = detectAndDecode(buffer);
    const fileType = sniffFileType(text);

    if (fileType !== 'unknown' && acceptedTypes.includes(fileType)) {
      onFileRead({ fileName: file.name, text, fileType });
      return;
    }

    if (fileType === 'unknown') {
      onUnsupportedFile(
        '約定履歴照会CSV/米国株式約定履歴CSV/ポートフォリオCSVのいずれとしても認識できませんでした。'
      );
      return;
    }

    onUnsupportedFile('この画面では未対応のファイル種別です。別の取込画面をご利用ください。');
  }

  return (
    <div className="border rounded p-4">
      <label className="block text-sm font-medium mb-2">{label}</label>
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
