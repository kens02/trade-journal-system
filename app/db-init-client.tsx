'use client';

import { useEffect } from 'react';
import { initializeApp } from '@/db/init';

// DB初期化(persist()呼び出し+appMeta記録)をクライアント初回マウント時に1回実行する非表示コンポーネント
export function DbInit() {
  useEffect(() => {
    void initializeApp();
  }, []);
  return null;
}
