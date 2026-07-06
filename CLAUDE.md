# trade-journal-system

株取引管理Webアプリ(個人投資家/SBI証券利用者向け)。トレードジャーナル・売買ルールのバージョン管理・ポートフォリオ/リバランス計算を統合する。

## Single Source of Truth

仕様は `docs/trade-journal-spec-v0.4.md`(v0.4、要確認事項C1〜C8クローズ済み・承認済み)。実装時は必ずこの仕様書を参照し、記載と矛盾する、または解釈の余地がある場合は推測で補完せず質問して停止する。

## 現在の実装フェーズ: P2

仕様書10章のフェーズ計画に対応し、`.claude/commands/implement-pX.md` 形式のコマンドファイルでフェーズごとに段階実装する運用(P1は`implement-p1.md`で完了済み。現在はP2を`implement-p2.md`で実装中)。各コマンドは内部にF0〜Fnのサブフェーズと停止ポイントを持ち、フェーズ完了時に停止してユーザーのレビュー承認を得てから次フェーズへ進む。**実行中のコマンドファイルが定義するスコープ外の機能は、仕様書に記載があっても実装しない**(この一文はフェーズ非依存のため、P3・P4移行時も書き換え不要)。

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

## P1 F0確定事項(implement-p1.md反映済み)

- ルールのMarkdownエクスポートはP1対象外(P2以降)
- DB初期化時に `navigator.storage.persist()` を呼び、結果(granted/denied)を appMeta に記録する(F1スコープ)。最終バックアップ日時表示・7日超過警告はP4に据え置き
- ルール削除は「廃止(status: retired への切替。ソフト、履歴・紐付け・集計は保持)」と「物理削除(紐付けが1件もない場合のみ、確認ダイアログを経てRule+全RuleVersionを同一トランザクションで削除。紐付けがあれば`RuleInUseError`でエラー表示し廃止の利用を案内)」の2方式を併用する
