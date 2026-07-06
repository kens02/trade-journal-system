// 仕様書6.2/6.3: 銘柄名称の照合はNFKC正規化+空白除去したキーで行う
export function normalizeName(raw: string): string {
  return raw.normalize('NFKC').replace(/\s+/g, '');
}
