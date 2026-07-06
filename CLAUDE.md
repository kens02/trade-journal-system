# trade-journal-system

株取引管理Webアプリ(個人投資家/SBI証券利用者向け)。トレードジャーナル・売買ルールのバージョン管理・ポートフォリオ/リバランス計算を統合する。

## Single Source of Truth

仕様は `docs/trade-journal-spec-v0.4.md`(v0.4、要確認事項C1〜C8クローズ済み・承認済み)。実装時は必ずこの仕様書を参照し、記載と矛盾する、または解釈の余地がある場合は推測で補完せず質問して停止する。

## 現在のフェーズ: P1(縦串スモールスタート)

仕様書10章のフェーズ計画における P1(取引手動入力 → ルール紐付け → 簡易集計)を実装中。`/implement-p1` コマンド(`.claude/commands/implement-p1.md`)で F0〜F4 の各フェーズを段階実装する。各フェーズ完了時に停止し、ユーザーのレビュー承認を得てから次フェーズへ進む運用。P1スコープ外(CSVインポート、FIFO損益マッチング、ジャーナル長文、ポートフォリオ/リバランス等)は仕様書に記載があっても実装しない。

## 技術スタック(変更禁止)

| 項目 | 指定 |
|---|---|
| フレームワーク | Next.js(App Router)+ TypeScript(strict) |
| ビルド | `output: 'export'` による静的エクスポート(サーバーサイド処理・API Route禁止) |
| 永続化 | IndexedDB(Dexie.js)。localStorage / sessionStorage は使用禁止 |
| スタイル | Tailwind CSS |
| テスト | Vitest(ドメインロジックのユニットテストのみ) |
| デプロイ想定 | Vercel Hobby(ローカルでは `npm run build && npx serve out` で検証) |
| UI言語 | 日本語 |

## コーディング規約

- TypeScript strict。`any` 禁止。ドメイン型は `domain/types.ts` のみに定義
- 金額(amount)は浮動小数点で保持しない。JPYは整数円、USDは整数セント(×100)で保持し、表示層でのみフォーマットする
- 集計・正規化(NFKC)・金額フォーマットは純粋関数として `domain/` 配下に置き、UIから分離する
- 書き込みは `db/repository.ts` に集約する(UIから直接Dexieを触らない)
- コメントは仕様書の対応箇所を示す形式で書く(例: `// 仕様書6.2: 受渡金額を正とする`)
- コミット粒度はフェーズ単位以下とし、コミットメッセージ先頭に `[P1-Fx]` を付ける
