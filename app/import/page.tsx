import { TradeImportClient } from './TradeImportClient';
import { PortfolioImportClient } from './PortfolioImportClient';

export default function ImportPage() {
  return (
    <main className="p-8 max-w-4xl mx-auto space-y-10">
      <div>
        <h1 className="text-xl font-bold mb-4">CSVインポート(取引履歴)</h1>
        <TradeImportClient />
      </div>
      <div>
        <h1 className="text-xl font-bold mb-4">CSVインポート(ポートフォリオ)</h1>
        <PortfolioImportClient />
      </div>
    </main>
  );
}
