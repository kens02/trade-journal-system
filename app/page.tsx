import Link from 'next/link';

export default function Home() {
  return (
    <main className="p-8 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">trade-journal-system</h1>
      <p>
        <Link href="/trades" className="text-blue-600 underline">
          取引を記録する →
        </Link>
      </p>
      <p className="text-sm text-gray-500">
        ルール管理・簡易集計画面は未実装です(今後のフェーズで追加予定)。
      </p>
    </main>
  );
}
