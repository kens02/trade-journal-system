import type { Metadata } from 'next';
import { DbInit } from '@/app/db-init-client';
import './globals.css';

export const metadata: Metadata = {
  title: 'trade-journal-system',
  description: '株取引管理Webアプリ',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <DbInit />
        {children}
      </body>
    </html>
  );
}
