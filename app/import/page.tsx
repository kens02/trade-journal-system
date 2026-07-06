import { ImportClient } from './ImportClient';

export default function ImportPage() {
  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold mb-4">CSVインポート</h1>
      <ImportClient />
    </main>
  );
}
