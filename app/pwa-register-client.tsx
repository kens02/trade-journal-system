'use client';

import { useEffect } from 'react';

// implement-p4.md 6章: 手書きService Worker(public/sw.js)をクライアント初回マウント時に登録する
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // 登録失敗時もアプリ自体は通常のオンライン動作を継続できるため握りつぶす
      });
    }
  }, []);
  return null;
}
