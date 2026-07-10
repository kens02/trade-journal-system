---
description: 株取引管理アプリ P3(分析ダッシュボード拡充・ポートフォリオ&リバランス・セクター指標)を確定仕様書に基づき実装する
argument-hint: [仕様書パス(省略時: docs/trade-journal-spec-v0.5.md)]
---

# P3実装コマンド: 分析ダッシュボード拡充 + ポートフォリオ&リバランス(セクター指標含む)

## 1. あなたの役割と絶対条件

P1(`implement-p1.md`)・P2(`implement-p2.md`)と同一の絶対条件を引き継ぐ。

1. **仕様書がSingle Source of Truthである。** 対象仕様書: `$ARGUMENTS`(未指定時は `docs/trade-journal-spec-v0.5.md`)。特に**4.2節後半(集計軸)・4.4節(F3ポートフォリオ・リバランス)・5章(データモデル)**を精読すること
2. 本コマンドはP3スコープのみを実装する。P4(バックアップ/リストア一式・Excel/CSVエクスポート・ルールMarkdownエクスポート・PWA化・非機能要件の検証)は実装しない。ただしJSONバックアップの復元機能自体は既にP4前倒しで実装済みであり、本コマンドの対象外(現状維持)とする
3. 仕様と本コマンドの矛盾・解釈の余地がある場合は、実装せず質問して停止する
4. 各フェーズ末尾の停止ポイントで停止し、レビュー承認を待つ
5. **P1・P2の成果物を壊さない。** 既存のドメイン型・repository・画面A〜Eの受入基準はP3完了後も全項目維持されること(回帰確認を最終フェーズで行う)

## 2. 前提条件(F0で確認)

- P1(F0〜F4)・P2(F0〜F6)が完了し、受入基準を満たしたコードベースが存在する
- Dexieスキーマは version 3(securities / trades / rules / ruleVersions / tradeRuleLinks / tradeMatches / journalEntries / tags / journalTags / priceSnapshots / importBatches / appMeta)
- バックアップの復元(リストア)機能はP4前倒しで実装済み(`domain/backup.ts`の`BackupData`・`db/repository.ts`の`restoreFromBackup`)。P3で新設するテーブルは**この2ファイルにも追加**し、バックアップ/リストアの対象から漏らさないこと(P2完了時点の前例〈P2エンティティをバックアップ対象外のまま据え置いた〉を繰り返さない)
- CLAUDE.md のスコープ記述が「P3実装を許可」に更新されていること(未更新なら停止して報告)

## 3. P3スコープ定義

### 3.1 実装する(In)

- **S4拡充**: 分析ダッシュボード(仕様書4.2節の集計軸: ルール別勝率・期待値、遵守/逸脱別の成績比較、感情タグ別成績、銘柄別・月別損益)。既存の画面C(簡易集計 `/summary`)を拡張する形とし、新規ルートは作らない
- **セクターマスタ(Sector)**: CRUD+CSVインポート/エクスポート、Securityへのセクター紐付け(任意)
- **S5(ポートフォリオ・リバランス)**: 保有ポジションの自動算出(取得単価は移動平均を参考値として保持。実現損益の算出はP2のFIFOに一本化のまま変更しない)、セクター別配分の可視化
- **目標配分(TargetAllocation)**: アセットクラス階層+セクターレベルの目標比率管理(合計100%検証)
- **リバランス計算**: 目標配分との乖離額・乖離率の算出、必要売買数量の提示(単元株・口数考慮)、「売却なし・買付のみ」モード
- **為替レート(FxRate)**: 手動入力、JPY換算表示(表示目的のみ。米国株の損益・集計はUSDで閉じたまま)
- **NISA枠管理(NisaUsage)**: 年間利用額の手入力管理、リバランス提案時の枠内判定表示

### 3.2 実装しない(Out — P4以降)

- Excel/CSVエクスポート(取引一覧・ジャーナル・保有一覧)
- ルールのMarkdownエクスポート(`rule-{slug}-v{version}.md`)
- PWA化(Service Worker・オフラインキャッシュ)
- 最終バックアップ日時表示・7日超過警告
- Safari向け注意表示
- 非機能要件の性能検証(5,000件規模の負荷確認等)
- 株価API連携・リアルタイム株価取得(対象外は継続。現在値更新はポートフォリオCSV再インポートまたは手動入力のみ)

## 4. データ層仕様(Dexie version 4)

### 4.1 スキーママイグレーション

```typescript
db.version(4).stores({
  securities:   'id, code, normalizedName, market, [code+market], sectorId',
  trades:       'id, tradeDate, securityId, [securityId+accountType]',
  rules:        'id, status',
  ruleVersions: 'id, ruleId, [ruleId+version]',
  tradeRuleLinks: 'tradeId, ruleVersionId',
  tradeMatches: 'id, sellTradeId, buyTradeId',
  journalEntries: 'id, tradeId, entryDate',
  tags:         'id, normalizedName',
  journalTags:  '[journalId+tagId], tagId, journalId',
  priceSnapshots: 'id, securityId, [securityId+snapshotAt]',
  importBatches: 'id, importedAt',
  sectors:      'id, displayOrder',
  fxRates:      'id, currencyPair, [currencyPair+asOf]',
  targetAllocations: 'id, level, parentId',
  nisaUsages:   'id, [year+frameType]',
  cashBalances: 'currency',
  appMeta:      'key',
});
```

- **マイグレーション後、P1・P2で登録済みの全データが無傷で読めること**(F1の受入条件)
- 既存 Security 型にフィールドを追加:
  - `sectorId: string | null`(仕様書5.1の「セクター(sector_id、任意)」に対応。既存データはマイグレーションで null を設定)
  - `unitShareQuantity: number | null`(仕様書5.1の「単元株数」に対応。**F0で発見した記載漏れ**。CSVに含まれないため手動入力。株式・ETFのみ意味を持つ。既存データはマイグレーションで null を設定)

### 4.2 追加型定義

```typescript
interface Sector {
  id: string;
  name: string;
  displayOrder: number;
  createdAt: string;
}

// 通貨ペア手動入力レート。JPY換算は表示目的のみで精度を重視しない(仕様書4.4節C7決定)
interface FxRate {
  id: string;
  currencyPair: string; // 'USD/JPY' 形式
  rate: number;
  asOf: string;         // 'YYYY-MM-DD'。この日付以降の表示に適用する最新レートとして扱う
  createdAt: string;
}

// アセットクラス階層+セクターレベルの目標配分。同一parentId配下の合計は100%であること。
// F0確認: アセットクラス名は固定リストではなくユーザーの自由入力とする(labelは任意文字列)
interface TargetAllocation {
  id: string;
  label: string;
  level: 'asset_class' | 'sector';
  parentId: string | null; // asset_classはnull、sectorは所属するasset_classのTargetAllocation.idを親に持つ
  targetPercent: number;   // 0〜100
  sectorId: string | null; // level: 'sector' の場合のみSectorへの参照を持つ
  createdAt: string;
}

// NISA枠の年間利用額(手入力ベース)。
// F0確認: 年間上限額も制度改正に備えユーザーが編集できる設定値として年+枠種別ごとに保持する(ハードコードしない)
interface NisaUsage {
  id: string;
  year: number;
  frameType: 'growth' | 'tsumitate'; // 成長投資枠 / つみたて投資枠
  usedAmount: number;  // 整数円
  annualLimit: number; // 整数円。ユーザーが編集可能な年間上限額
  createdAt: string;
  updatedAt: string;
}

// F0確認: リバランス計算の母数に現金を含めるため新設(仕様書のアセットクラス例に「現金」が含まれるが、
// 現在のデータモデルには現金残高を記録するエンティティがなかったため追加)。通貨ごとに1レコード(currencyが主キー)
interface CashBalance {
  currency: Currency;
  amount: number; // JPY: 整数円 / USD: 整数セント
  updatedAt: string;
}
```

- `domain/backup.ts`の`BackupData`・`db/repository.ts`の`restoreFromBackup`に`sectors`/`fxRates`/`targetAllocations`/`nisaUsages`/`cashBalances`を追加し、バックアップ/リストアの対象に含める(2章参照)

## 5. 分析ダッシュボード実装要件(画面C拡充: `/summary`)

**集計ロジックは既存`domain/aggregate.ts`のパターン(純粋関数+ユニットテスト)を踏襲し拡張する。**

- ルール別勝率・期待値: TradeMatchの`realizedPnl`をルール(RuleVersion経由)単位で集計。勝率=勝ちトレード数/決済済トレード数、期待値=平均実現損益。通貨別に分ける(JPY/USDを合算しない)
- 遵守/逸脱別の成績比較: `TradeRuleLink.adherence`区分ごとの件数・勝率・平均損益
- 感情タグ別成績: エントリに付与された感情タグ(`Tag.kind === 'emotion'`)ごとの、紐付く取引の実現損益集計
- 銘柄別・月別損益: `Security`単位・`tradeDate`の年月単位でのグルーピング集計
- 既存の「ルール別・通貨別金額・遵守内訳」表示(P1由来)は維持し、上記を追加セクションとして拡充する。旧来の「P3で対応予定」注記(`app/summary/SummaryClient.tsx`)は本フェーズ完了時に除去する

## 6. セクター・ポートフォリオ実装要件

### 6.1 セクターマスタ(`/sectors`)

- 一覧・作成・改名・削除・表示順変更のCRUD(`app/rules/RuleList.tsx`のテーブル一覧パターンを踏襲)
- **セクター削除時の挙動(F0確認)**: 紐付くSecurity全件の`sectorId`をnullにカスケード更新してから削除する(確認ダイアログを経る。RuleのRuleInUseErrorのようなブロックはしない)
- **CSVインポート/エクスポート列定義(F0確認、推奨構成)**: `セクター名,表示順` の2列、UTF-8(BOM付き)、1行目ヘッダー必須。エクスポートは表示順昇順で出力する
- 銘柄編集画面(`app/trades/SecurityPicker.tsx`または銘柄管理UI)からセクターを選択・変更できるようにする

### 6.2 ポートフォリオ画面(`/portfolio`)

- 保有ポジション一覧: `domain/holdings.ts`の`computeHoldingQuantities`と同じグルーピング(`securityId + accountType`)で、**移動平均取得単価**を算出する純粋関数を追加する(F0確認: 口座区分ごとに別々に平均を算出する。参考値であり実現損益計算〈FIFO〉には使わない)
- 現在値: `PriceSnapshot`の最新値を使用(取込済みがなければ手動入力を促す)
- セクター別配分の可視化: 保有評価額をセクター単位に集計し、比率を表示。現金(`CashBalance`)も一つの区分として含める

## 7. リバランス実装要件

- 目標配分(`TargetAllocation`)の管理UI: アセットクラス(自由入力ラベル)→セクターの階層編集、同一階層内合計100%のバリデーション
- 現金(`CashBalance`)の手入力UI: 通貨ごとの残高を編集できるフォーム(`/portfolio`画面内)
- 乖離計算: 現在の評価額比率(現金含む)と目標比率の差(乖離額・乖離率)を算出する純粋関数を`domain/`に実装
- 必要売買数量の提示: 乖離額を解消するための概算数量を、銘柄の単元株数(`Security.unitShareQuantity`。株式・ETF)または最低申込単位(投信は口数、最小単位1口として扱う)を考慮して算出
- 「売却なし・買付のみ(ノーセルリバランス)」モード: 既存保有を売らず、追加購入のみで目標比率に近づける計算モードを切替可能にする

## 8. 為替・NISA枠実装要件

- 為替レート(`/portfolio`画面内、または専用セクション): 通貨ペア・レート・基準日を手動登録。ポートフォリオ画面のJPY換算表示(米国株評価額の円換算参考表示)に使用する。**米国株の損益・集計自体はUSDで閉じたまま変更しない**(P2までの実装方針を維持)
- NISA枠管理: 年・枠種別(成長/つみたて)ごとの利用額と年間上限額を手入力で登録・編集(F0確認: 上限額もユーザー編集可能な設定値とし、ハードコードしない)。リバランス提案時に「この銘柄をNISA成長枠で買う場合、残枠(上限額−利用額)内か」を表示する

## 9. 実装フェーズと停止ポイント

| フェーズ | 内容 | 完了条件 |
|---|---|---|
| F0 | 仕様書4.2後半・4.4・5章精読 → P1/P2コードベース調査 → 本コマンドとの突合 → 不明点列挙・回答反映(完了。CashBalance新設・unitShareQuantity追加・NisaUsage.annualLimit追加を反映済み) | 完了 |
| F1 | Dexie version 4 マイグレーション+型追加(Sector/FxRate/TargetAllocation/NisaUsage/CashBalance)+Security拡張(sectorId/unitShareQuantity)+repository拡張+backup.ts/restoreFromBackup対応 | P1/P2データ無損失の移行テスト緑 |
| F2 | 分析ダッシュボード拡充(画面C) | 受入基準 G群 を満たす |
| F3 | セクターマスタ管理(`/sectors`)+銘柄へのセクター紐付け | 受入基準 H群 を満たす |
| F4 | ポートフォリオ画面(保有ポジション+移動平均取得単価+セクター別配分可視化) | 受入基準 I群 を満たす |
| F5 | 目標配分管理+リバランス計算(乖離・必要売買数量・ノーセルモード) | 受入基準 J群 を満たす |
| F6 | 為替レート管理+JPY換算表示+NISA枠管理 | 受入基準 K群 を満たす |
| F7 | 総合検証: P1・P2受入基準の全項目回帰+P3共通群 | リグレッションなし |

完了報告の書式はP1コマンド7章と同一。

## 10. 受入基準

**G群(分析ダッシュボード)**
- [ ] ルール別勝率・期待値が手計算と一致する(JPY/USD別)
- [ ] 遵守/逸脱別の成績比較が正しい
- [ ] 感情タグ別成績が正しい
- [ ] 銘柄別・月別損益が正しい
- [ ] 集計ロジック(純粋関数)にユニットテストがある

**H群(セクター)**
- [ ] セクターの作成・改名・削除・表示順変更ができる
- [ ] 銘柄にセクターを紐付け・変更できる
- [ ] セクターマスタのCSVインポート/エクスポートができる

**I群(ポートフォリオ)**
- [ ] 保有ポジション(数量+口座区分ごとの移動平均取得単価)が取引記録から正しく算出される
- [ ] セクター別配分の比率表示(現金区分含む)が評価額の手計算と一致する
- [ ] 現金残高を通貨ごとに登録・編集できる

**J群(リバランス)**
- [ ] 目標配分(自由入力ラベルのアセットクラス→セクター階層)の合計100%バリデーションが機能する
- [ ] 乖離額・乖離率が手計算と一致する
- [ ] 必要売買数量が単元株数(`Security.unitShareQuantity`)・口数を考慮して算出される
- [ ] ノーセルリバランスモードで売却提案が出ない

**K群(為替・NISA枠)**
- [ ] 為替レートを手動登録でき、ポートフォリオのJPY換算表示に反映される
- [ ] 米国株の損益・集計がUSDのまま変わっていない(回帰確認)
- [ ] NISA枠の年間利用額・年間上限額を登録・編集でき、リバランス提案で残枠(上限−利用額)内判定が表示される

**共通群**
- [ ] P1・P2受入基準の全項目が引き続き満たされる(回帰確認)
- [ ] version 3 → 4 のマイグレーションでP1/P2データが無損失
- [ ] 新設テーブル(sectors/fxRates/targetAllocations/nisaUsages/cashBalances)がバックアップ/リストアの対象に含まれる
- [ ] 金額を浮動小数点で保持している箇所がない(新規追加分含む)
- [ ] `npm run build` が警告なしで成功する
- [ ] テスト用CSVフィクスチャ(セクターマスタ)は匿名化したダミーデータで作成する

## 11. コーディング規約(P1・P2から追加)

- P1・P2規約を踏襲(strict、`any`禁止、純粋関数分離、仕様書対応コメント、`[P3-Fx]`コミット)
- 集計・リバランス計算はすべて`domain/`配下の純粋関数とし、Dexie・Reactに依存させない
- 為替換算・移動平均取得単価は「参考値」であることをコードコメントとUI双方に明記し、実現損益(FIFO)と混同しない設計にする
