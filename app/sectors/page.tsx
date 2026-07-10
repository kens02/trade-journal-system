import { SectorsClient } from './SectorsClient';

export default function SectorsPage() {
  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold mb-4">セクター管理</h1>
      <SectorsClient />
    </main>
  );
}
