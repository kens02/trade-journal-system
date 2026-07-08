import { Suspense } from 'react';
import { JournalClient } from './JournalClient';

export default function JournalPage() {
  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold mb-4">ジャーナル</h1>
      <Suspense fallback={<p className="text-sm text-gray-500">読み込み中...</p>}>
        <JournalClient />
      </Suspense>
    </main>
  );
}
