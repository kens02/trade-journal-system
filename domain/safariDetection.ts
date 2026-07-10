// 仕様書8章「Safariは補助扱い...Safari利用時は画面上にこの制約を注意表示する」/ implement-p4.md 7章。
// Chrome/Edge/FirefoxもUser-AgentにSafari識別子を含むため、他エンジンの識別子が含まれないことも確認する
export function isSafariUserAgent(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  if (!ua.includes('safari')) return false;
  return !/chrome|chromium|crios|edg|opr|firefox|fxios|android/.test(ua);
}
