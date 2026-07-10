import { PortfolioClient } from './PortfolioClient';

export default function PortfolioPage() {
  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold mb-4">ポートフォリオ</h1>
      <PortfolioClient />
    </main>
  );
}
