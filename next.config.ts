import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // 仕様書3.1 / コマンド2章: サーバーサイド処理・API Route禁止のため静的エクスポート
  output: 'export',
  // 静的エクスポートではnext/imageの最適化(サーバー機能)が使えないため無効化
  images: { unoptimized: true },
  // 静的ホスティング(npx serve等)でのルーティングの一貫性のため
  trailingSlash: true,
  // ホームディレクトリ直下の無関係なlockfileをワークスペースルートと誤検出するのを防ぐ
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
