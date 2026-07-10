import type { Metadata, Viewport } from 'next';
import { DbInit } from '@/app/db-init-client';
import { Header } from '@/app/Header';
import { StatusBanner } from '@/app/StatusBanner';
import { PwaRegister } from '@/app/pwa-register-client';
import './globals.css';

// implement-p4.md 6章: PWA化(Web App Manifest+ホーム画面追加対応)
export const metadata: Metadata = {
  title: 'trade-journal-system',
  description: '株取引管理Webアプリ',
  manifest: '/manifest.json',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-white text-gray-900">
        <DbInit />
        <PwaRegister />
        <Header />
        <StatusBanner />
        {children}
      </body>
    </html>
  );
}
