import { getAppMeta, setAppMeta, ensureEmotionTagsSeeded } from '@/db/repository';

const STORAGE_PERSISTED_KEY = 'storagePersisted';

// 仕様書3.2 / implement-p1.md 3.1節: DB初期化時にnavigator.storage.persist()を呼び、
// 結果(granted/denied)をappMetaに記録する。冪等(初回のみ呼ぶ)。
export async function initializeApp(): Promise<void> {
  const existing = await getAppMeta<boolean>(STORAGE_PERSISTED_KEY);
  if (existing === undefined) {
    const granted =
      typeof navigator !== 'undefined' && navigator.storage?.persist
        ? await navigator.storage.persist()
        : false;
    await setAppMeta(STORAGE_PERSISTED_KEY, granted);
  }

  // implement-p2.md 4.2節: 感情タグの初期シード。persist()呼び出しとは独立した冪等処理
  await ensureEmotionTagsSeeded();
}
