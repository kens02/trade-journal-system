import { TradesClient } from './TradesClient';

export default function TradesPage() {
  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold mb-4">取引入力・一覧</h1>
      <TradesClient />
    </main>
  );
}
