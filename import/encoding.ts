// 仕様書6.5: 文字コード自動判定(Shift-JIS / BOM付きUTF-8 / UTF-8の3種)
export type DetectedEncoding = 'utf-8-bom' | 'utf-8' | 'shift-jis';

export interface EncodingDetectionResult {
  encoding: DetectedEncoding;
  text: string;
}

const UTF8_BOM = [0xef, 0xbb, 0xbf];

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 3 && bytes[0] === UTF8_BOM[0] && bytes[1] === UTF8_BOM[1] && bytes[2] === UTF8_BOM[2]
  );
}

// 仕様書6.5: Shift-JIS(CP932)/BOM付きUTF-8/UTF-8を判定して読み込む。
// 実ファイルはShift-JIS確定(仕様書6.2/6.4)だが、Excel等で再保存されたUTF-8も受け入れる
export function detectAndDecode(bytes: ArrayBuffer): EncodingDetectionResult {
  const view = new Uint8Array(bytes);

  if (hasUtf8Bom(view)) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(view.subarray(3));
    return { encoding: 'utf-8-bom', text };
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(view);
    return { encoding: 'utf-8', text };
  } catch {
    // 厳密UTF-8として不正な場合はShift-JISとみなす(仕様書6.2/6.4で実ファイルがSJIS確定のため)
    const text = new TextDecoder('shift-jis', { fatal: false }).decode(view);
    return { encoding: 'shift-jis', text };
  }
}
