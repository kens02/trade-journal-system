// テストフィクスチャ生成専用のエンコーディングヘルパー(3ファイル種別で共通利用)。
// iconv-lite は本ファイル専用。本番コードはimport/encoding.tsのTextDecoderのみを使用しランタイム依存はない
// (TextEncoderはUTF-8専用でShift-JISへのエンコードができないため、フィクスチャ生成にのみiconv-liteが必要)
import iconv from 'iconv-lite';

export function encodeUtf8(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

export function encodeUtf8Bom(text: string): ArrayBuffer {
  const body = new TextEncoder().encode(text);
  const withBom = new Uint8Array(3 + body.length);
  withBom.set([0xef, 0xbb, 0xbf], 0);
  withBom.set(body, 3);
  return withBom.buffer;
}

export function encodeShiftJis(text: string): ArrayBuffer {
  const encoded = iconv.encode(text, 'shift_jis');
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
}
