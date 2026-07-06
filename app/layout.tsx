import type { Metadata } from 'next';
import { DbInit } from '@/app/db-init-client';
import { Header } from '@/app/Header';
import './globals.css';

export const metadata: Metadata = {
  title: 'trade-journal-system',
  description: '株取引管理Webアプリ',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-white text-gray-900">
        <DbInit />
        <Header />
        {children}
      </body>
    </html>
  );
}
