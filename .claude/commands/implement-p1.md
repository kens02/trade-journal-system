---
description: 株取引管理アプリ P1(縦串スモールスタート)を確定仕様書に基づき実装する
argument-hint: [仕様書パス(省略時: docs/trade-journal-spec-v0.4.md)]
---

# P1実装コマンド: 縦串スモールスタート(取引手動入力 → ルール紐付け → 簡易集計)

## 1. あなたの役割と絶対条件

あなたは本プロジェクトの実装担当エンジニアである。以下を厳守すること。

1. **仕様書がSingle Source of Truthである。** 対象仕様書: `$ARGUMENTS`(未指定時は `docs/trade-journal-spec-v0.4.md`)。実装前に必ず全文を読むこと
2. **本コマンドはP1スコープのみを実装する。** 仕様書に記載があってもP1スコープ外(後述)の機能は実装しない。先回り実装は仕様のドリフトを生むため禁止
3. **仕様と本コマンドの記述が矛盾する場合、または仕様に解釈の余地がある場合は、実装せずに質問して停止する。** 推測で補完しない
4. **各フェーズ末尾の停止ポイントで必ず作業を止め、ユーザーのレビュー承認を得てから次フェーズへ進む**
5. 生成したコードはすべて人間のレビュー対象のドラフトである。「動くこと」だけでなく「仕様との対応が読み取れること」を優先する

## 2. 技術スタック(変更禁止)

| 項目 | 指定 |
|---|---|
| フレームワーク | Next.js(App Router)+ TypeScript(strict) |
| ビルド | `output: 'export'` による静的エクスポート(サーバーサイド処理・API Route禁止) |
| 永続化 | IndexedDB(Dexie.js使用)。localStorage / sessionStorage は使用禁止 |
| スタイル | Tailwind CSS |
| テスト | Vitest(ドメインロジックのユニットテストのみ) |
| デプロイ想定 | Vercel Hobby(ただしP1ではデプロイ設定まで行わない。ローカル `npm run build && npx serve out` で検証) |
| UI言語 | 日本語 |

## 3. P1スコープ定義

### 3.1 実装する(In)

- **S1(一部)**: 取引の手動入力・一覧・編集・削除
- **S3(最小)**: 売買ルールの作成、イミュータブルなバージョン改訂、一覧・詳細表示
- **S4(最小)**: ルール別の簡易集計(件数・金額・遵守状況ベース)
- 取引⇔ルール版の紐付け+遵守評価の記録
- 全データのJSONエクスポート(バックアップの最小形。ダウンロードのみ)

### 3.2 実装しない(Out — P2以降)

- CSVインポート全種(約定履歴・ポートフォリオ・米国株式)
- FIFO損益マッチング、実現損益・勝率の算出
- ジャーナル長文・感情タグ、全文検索
- ポートフォリオ・リバランス・セクターマスタ・NISA枠管理
- JSONインポート(リストア)、PWA化、Safari向け注意表示
- 為替レート管理(P1ではUSD取引はUSDのまま表示するのみ)

## 4. データ層仕様

### 4.1 Dexieスキーマ(version 1)

DB名: `trade-journal`。以下のテーブルを定義する。**P2以降の拡張はDexieのversion管理で行う前提のため、P1で余分なテーブルを作らない。**

```typescript
// db/schema.ts
db.version(1).stores({
  securities:   'id, code, normalizedName',
  trades:       'id, tradeDate, securityId',
  rules:        'id, status',
  ruleVersions: 'id, ruleId, [ruleId+version]',
  tradeRuleLinks: 'tradeId, ruleVersionId',
  appMeta:      'key',
});
```

### 4.2 型定義(ドメイン)

```typescript
// domain/types.ts — 仕様書5章に対応。フィールド追加・削除は不可
type ProductType = 'jp_stock' | 'us_stock' | 'fund' | 'etf';
type Currency = 'JPY' | 'USD';
type TradeSide = 'buy' | 'sell';
type AccountType = 'specific' | 'nisa_growth' | 'nisa_tsumitate' | 'old_nisa';
type Adherence = 'followed' | 'partial' | 'deviated'; // 遵守/一部逸脱/逸脱

interface Security {
  id: string;              // UUID(crypto.randomUUID)
  code: string | null;     // 国内4桁英数字 or ティッカー。投信はnull
  name: string;
  normalizedName: string;  // NFKC正規化+空白除去(照合キー。保存時に自動生成)
  productType: ProductType;
  currency: Currency;
  createdAt: string;       // ISO 8601
}

interface Trade {
  id: string;
  tradeDate: string;       // 'YYYY-MM-DD'
  securityId: string;
  side: TradeSide;
  accountType: AccountType;
  quantity: number;        // 株数 or 口数(整数)
  price: number;           // 約定単価。JPYは小数1位まで、USDは小数4位まで許容
  amount: number;          // 受渡金額。JPY: 整数円 / USD: 整数セント(×100)で保持
  currency: Currency;
  note: string;            // 一言メモ(任意)
  createdAt: string;
  updatedAt: string;
}

interface Rule {
  id: string;
  name: string;
  status: 'active' | 'retired';
  createdAt: string;
}

interface RuleVersion {
  id: string;
  ruleId: string;
  version: number;          // 1起点の連番
  sections: {
    overview: string;       // 概要
    entry: string;          // エントリー条件
    exit: string;           // イグジット条件
    exclusion: string;      // 除外条件
    moneyManagement: string;// 資金管理
  };
  revisionReason: string;   // version >= 2 で必須
  createdAt: string;
  // 注意: 本レコードは作成後いかなる更新もしない(イミュータブル)
}

interface TradeRuleLink {
  tradeId: string;          // 主キー(取引1件につきルール紐付けは最大1件)
  ruleVersionId: string;
  adherence: Adherence;
  createdAt: string;
}
```

### 4.3 金額の取り扱い(厳守)

- **JPYの amount は整数(円)、USDの amount は整数(セント=1/100 USD)で保持**し、表示層でのみフォーマットする。浮動小数点で金額を保持・加算しない
- 入力フォームでは「数量×単価」を amount の初期値として提案するが、**ユーザーが確定した受渡金額を正とする**(仕様書6.2/6.4の「受渡金額を正とする」原則に対応)
- 表示: JPYは `1,234円`、USDは `12.34 USD`。通貨をまたぐ合算はしない(通貨別に集計を分ける)

### 4.4 データ操作規約

- 書き込みはすべて `db/repository.ts` に集約した関数経由で行う(UIから直接Dexieを触らない)
- RuleVersion の更新・削除関数は**作らない**(イミュータブル保証をコードレベルで担保)
- Trade削除時は対応する TradeRuleLink も同一トランザクションで削除する
- RuleVersion に紐付く TradeRuleLink が存在する場合、その Rule の削除は禁止(エラー表示)

## 5. 画面仕様(3画面+共通)

### 共通レイアウト
- ヘッダーにアプリ名と3画面へのナビゲーション、右端に「バックアップ(JSON)」ボタン
- バックアップボタン: 全テーブルの内容を `{ schemaVersion: 1, exportedAt: ISO文字列, data: {...} }` 形式のJSONでダウンロードする(ファイル名 `trade-journal-backup-YYYYMMDD-HHmm.json`)

### 画面A: 取引入力・一覧(`/trades`)
- 入力フォーム: 約定日(既定=今日)/ 銘柄(既存銘柄のインクリメンタル検索+その場で新規登録: name, code, productType, currency)/ 売買区分 / 口座区分 / 数量 / 単価 / 受渡金額(数量×単価を初期提案)/ ルール紐付け(任意: active な Rule の最新 RuleVersion から選択)/ 遵守評価(ルール選択時のみ必須)/ 一言メモ
- 一覧: 約定日降順。列=約定日・銘柄・売買・口座・数量・単価・受渡金額(通貨付き)・適用ルール(名称+version)・遵守評価。編集・削除操作あり
- バリデーション: 数量は正の整数、単価・金額は正の数、約定日は必須。エラーは項目ごとに日本語表示

### 画面B: ルール管理(`/rules`)
- 一覧: ルール名・状態・最新version・紐付く取引件数
- 新規作成: 名称+5セクション(概要/エントリー/イグジット/除外/資金管理)を入力し、version 1 として保存
- 改訂: 既存の最新versionの内容をコピーした編集フォームを開き、**改訂理由(必須)**を添えて新versionとして保存。旧versionは変更不可のまま履歴表示(version間の全文表示切替)
- 取引からの参照有無に関わらず、versionは編集・削除できないことをUI上も徹底する

### 画面C: 簡易集計(`/summary`)
- ルール別(RuleVersion単位の内訳を展開可能)に以下を表示:
  - 取引件数(買付/売却の内訳)
  - 通貨別の買付金額合計・売却金額合計
  - 遵守評価の内訳(遵守/一部逸脱/逸脱の件数)
- ルール未紐付けの取引は「ルールなし」行として同様に集計
- ※実現損益・勝率はP2(FIFOマッチング)まで表示しない。画面上にその旨を注記する

## 6. 実装フェーズと停止ポイント

各フェーズ完了時に「完了報告(7章の書式)」を出力して**停止**し、ユーザーの承認を待つこと。

| フェーズ | 内容 | 完了条件 |
|---|---|---|
| F0 | 仕様書読込 → 本コマンドとの突合 → 不明点・矛盾の列挙(なければ「なし」と明言) | ユーザーが疑問点への回答 or 着手承認 |
| F1 | プロジェクト雛形(Next.js静的エクスポート設定、Tailwind、Vitest)+ドメイン型+Dexieスキーマ+repository | `npm run build` 成功、repositoryのユニットテスト緑 |
| F2 | 画面A(取引入力・一覧)+銘柄インライン登録 | 受入基準 A群 を満たす |
| F3 | 画面B(ルール管理・バージョン改訂) | 受入基準 B群 を満たす |
| F4 | 画面C(簡易集計)+JSONエクスポート+全体通し確認 | 受入基準 C群・共通群 を満たす |

## 7. 完了報告の書式(各フェーズ共通)

```
## Fx 完了報告
- 実装したファイル一覧(パス+1行説明)
- 仕様書の対応セクション(例: 4.2, 5.1)
- 受入基準の自己チェック結果(チェックリスト形式)
- 未解決事項・次フェーズへの申し送り
- 動作確認手順(ユーザーが手元で再現できるコマンドと操作手順)
```

## 8. 受入基準

**A群(取引)**
- [ ] 新規銘柄をその場で登録しながら取引を1件保存できる
- [ ] 保存した取引が一覧に約定日降順で表示される
- [ ] JPY取引とUSD取引を登録でき、金額表示の書式が通貨に応じて切り替わる
- [ ] 取引の編集・削除ができ、削除時にルール紐付けも消える
- [ ] ブラウザをリロードしてもデータが保持される(IndexedDB永続化)

**B群(ルール)**
- [ ] 5セクションを持つルールを作成できる(version 1)
- [ ] 改訂理由を入力して version 2 を作成でき、version 1 の内容が変化していない
- [ ] 取引入力フォームで最新versionを選択して紐付けでき、遵守評価が保存される
- [ ] 取引が紐付いたルールを削除しようとするとエラーになる

**C群(集計)**
- [ ] ルール別・version別の件数/通貨別金額/遵守内訳が正しい(手計算と一致)
- [ ] ルール未紐付け取引が「ルールなし」に集計される
- [ ] 集計ロジック(純粋関数)にユニットテストがあり、JPY/USD混在・遵守区分混在のケースを含む

**共通群**
- [ ] JSONエクスポートで全テーブルのデータがダウンロードでき、スキーマバージョンが含まれる
- [ ] `npm run build`(静的エクスポート)が警告なしで成功する
- [ ] localStorage / sessionStorage を使用していない(grepで確認)
- [ ] 金額を浮動小数点で保持している箇所がない(amount系はすべて整数)

## 9. コーディング規約

- TypeScript strict。`any` 禁止。ドメイン型は `domain/types.ts` のみに定義
- 集計・正規化(NFKC)・金額フォーマットは純粋関数として `domain/` 配下に置き、UIから分離する
- コメントは「仕様書の対応箇所」を示す形式で書く(例: `// 仕様書6.2: 受渡金額を正とする`)
- コミット粒度はフェーズ単位以下とし、コミットメッセージ先頭に `[P1-Fx]` を付ける
