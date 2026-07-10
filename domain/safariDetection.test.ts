import { describe, it, expect } from 'vitest';
import { isSafariUserAgent } from '@/domain/safariDetection';

const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const EDGE_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const CHROME_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1';
const FIREFOX_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0';

describe('isSafariUserAgent', () => {
  it('Safari(Mac/iOS)をtrueと判定する', () => {
    expect(isSafariUserAgent(SAFARI_MAC)).toBe(true);
    expect(isSafariUserAgent(SAFARI_IOS)).toBe(true);
  });

  it('UAにSafari識別子を含む他エンジン(Chrome/Edge/Android Chrome/Chrome for iOS)はfalseと判定する', () => {
    expect(isSafariUserAgent(CHROME_MAC)).toBe(false);
    expect(isSafariUserAgent(EDGE_WIN)).toBe(false);
    expect(isSafariUserAgent(CHROME_ANDROID)).toBe(false);
    expect(isSafariUserAgent(CHROME_IOS)).toBe(false);
  });

  it('Safari識別子を含まないブラウザ(Firefox)はfalseと判定する', () => {
    expect(isSafariUserAgent(FIREFOX_MAC)).toBe(false);
  });
});
