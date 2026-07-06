import { RulesClient } from './RulesClient';

export default function RulesPage() {
  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold mb-4">ルール管理</h1>
      <RulesClient />
    </main>
  );
}
