# trade-journal-system

株取引管理Webアプリ(個人投資家/SBI証券利用者向け)。トレードジャーナル・売買ルールのバージョン管理・ポートフォリオ/リバランス計算を統合する。

## Single Source of Truth

仕様は `docs/trade-journal-spec-v0.5.md`(v0.4を承認済みベースとし、v0.5はP2実装時に発見された記述誤り〈JournalEntryの遵守評価記載重複〉の訂正版。機能変更なし)。実装時は必ずこの仕様書を参照し、記載と矛盾する、または解釈の余地がある場合は推測で補完せず質問して停止する。

## 現在の実装フェーズ: P4完了(全フェーズ完了)

仕様書10章のフェーズ計画に対応し、`.claude/commands/implement-pX.md` 形式のコマンドファイルでフェーズごとに段階実装する運用(P1は`implement-p1.md`、P2は`implement-p2.md`、P3は`implement-p3.md`、P4は`implement-p4.md`でF0〜F6まで完了済み)。各コマンドは内部にF0〜Fnのサブフェーズと停止ポイントを持ち、フェーズ完了時に停止してユーザーのレビュー承認を得てから次フェーズへ進む運用とした。**実行中のコマンドファイルが定義するスコープ外の機能は、仕様書に記載があっても実装しない**(この一文はフェーズ非依存のため、以降のフェーズ移行時も書き換え不要)。

P4で実装した内容: 取引一覧・ジャーナル・保有一覧のCSVエクスポート(`domain/csv.ts`・`tradeCsv.ts`・`journalCsv.ts`・`holdingCsv.ts`)、ルールのMarkdownエクスポート(`domain/ruleMarkdown.ts`)、最終バックアップ日時表示・7日超過警告(`domain/backupStatus.ts`・`app/StatusBanner.tsx`)、Safari向け注意表示(`domain/safariDetection.ts`)、機密性(サーバー送信ゼロ)の明記、PWA化(`public/manifest.json`・`public/sw.js`、next-pwa等のライブラリは導入せず手書き実装)、非機能要件の性能検証(`db/performance.test.ts`、自動テストのみで実施。fake-indexeddb上の近似値である旨に注意)。

なお、JSONバックアップの復元(リストア)機能は本来P4スコープだが、ユーザー了承のうえP2完了後に前倒しで実装済み(`domain/backup.ts`・`db/repository.ts`の`restoreFromBackup`)。P3ではsectors/fxRates/targetAllocations/nisaUsages/cashBalancesの5テーブルを追加し、バックアップ/リストアの対象に含めている(`schemaVersion: 3`)。P4はこの前倒し実装済み範囲を重複実装せず、appMetaへの最終バックアップ日時記録のみを追加した(Dexieスキーマのversion自体は4のまま変更なし)。

仕様書10章のP4ゲート(リリース判定)は達成。株価API連携・リアルタイム株価取得は仕様書2.2節により対象外のまま(今後の新規フェーズの計画はなし)。

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
- コミット粒度はフェーズ単位以下とし、コミットメッセージ先頭に `[PX-Fx]`(例: `[P4-F2]`)を付ける

## P1 F0確定事項(implement-p1.md反映済み)

- ルールのMarkdownエクスポートはP1対象外(P2以降)
- DB初期化時に `navigator.storage.persist()` を呼び、結果(granted/denied)を appMeta に記録する(F1スコープ)。最終バックアップ日時表示・7日超過警告はP4に据え置き
- ルール削除は「廃止(status: retired への切替。ソフト、履歴・紐付け・集計は保持)」と「物理削除(紐付けが1件もない場合のみ、確認ダイアログを経てRule+全RuleVersionを同一トランザクションで削除。紐付けがあれば`RuleInUseError`でエラー表示し廃止の利用を案内)」の2方式を併用する

## P3確定事項(implement-p3.md反映済み。目標配分・リバランス関連の今後の変更時に参照)

- 目標配分(`TargetAllocation`)の階層で「現金」は、アセットクラスの`label`が`"現金"`と完全一致し、かつセクター子を持たない場合に`CashBalance`の評価額(JPY+USDをFxRateでJPY換算)と対応付ける(`domain/rebalance.ts`)
- セクター子を持たない現金以外のアセットクラス(例:「セクター未設定の国内株式」)は、現在評価額を対応付ける手段がないため常に0円固定とし、`unsupported`種別としてUI(`/portfolio`)で警告表示する
- リバランス計算(乖離額・乖離率・必要売買数量)のみ、通貨混在ポートフォリオを1つの比率で扱う必要があるためUSD/JPYレート(`FxRate`)でJPY換算する。F2(実現損益集計)・F4(セクター別配分)で確立した「通貨は合算しない」方針の例外であり、米国株の損益・集計自体はUSDのまま変更しない。レート未登録時はUSD建て資産・現金を除外し警告表示する(`fxRateMissing`)
- 金額入力フォームで0円が有効な値になり得るフィールド(`CashBalance.amount`・`NisaUsage.usedAmount`/`annualLimit`)は、取引金額用の`parseJPYAmount`/`parseUSDAmount`(0を無効値とする)ではなく`parseJPYAmountAllowZero`/`parseUSDAmountAllowZero`(`domain/money.ts`)を使うこと

## P4確定事項(implement-p4.md反映済み。エクスポート・PWA関連の今後の変更時に参照)

- CSV/Markdownエクスポートの金額列は生の整数値ではなく表示用フォーマット済み文字列(`formatJPY`/`formatUSD`)で出力する(取引一覧・保有一覧CSV)
- ルールのMarkdownエクスポートは常に最新バージョンのみを対象とする。履歴の個別バージョンエクスポートは対象外
- CSV生成は`domain/csv.ts`の共通ヘルパー(RFC4180準拠のフィールドエスケープ・BOM付与・ファイル名生成)を`tradeCsv.ts`・`journalCsv.ts`・`holdingCsv.ts`が利用する。`domain/sectorCsv.ts`(P3、列がシンプルでエスケープ不要)は据え置き、共通ヘルパーへの統合はしていない
- PWA化は`next-pwa`等のライブラリを使わず手書きのService Worker(`public/sw.js`)で実装している。`output: 'export'`はビルド時にファイル名(ハッシュ)を事前列挙できないため、プリキャッシュ方式ではなくランタイムキャッシュ方式(ページはネットワーク優先+キャッシュフォールバック、静的アセットはキャッシュ優先)を採用している
- 最終バックアップ日時は`appMeta`の`lastBackupAt`キー(`domain/backupStatus.ts`で一元管理)に記録し、`Header.tsx`の`handleBackup`成功時にカスタムイベント(`trade-journal:backup-completed`)で`app/StatusBanner.tsx`へ即時通知する
- 非機能要件の性能検証(`db/performance.test.ts`)は自動テスト(vitest+fake-indexeddb)のみで実施しており、実ブラウザのIndexedDB I/O・DOM描画の実測ではない近似値である点に注意
