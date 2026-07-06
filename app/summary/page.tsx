import { SummaryClient } from './SummaryClient';

export default function SummaryPage() {
  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold mb-4">簡易集計</h1>
      <SummaryClient />
    </main>
  );
}
