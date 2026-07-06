// 仕様書5章 / implement-p1.md 4.2節に対応。フィールド追加・削除は不可
export type ProductType = 'jp_stock' | 'us_stock' | 'fund' | 'etf';
export type Currency = 'JPY' | 'USD';
export type TradeSide = 'buy' | 'sell';
export type AccountType = 'specific' | 'nisa_growth' | 'nisa_tsumitate' | 'old_nisa';
export type Adherence = 'followed' | 'partial' | 'deviated'; // 遵守/一部逸脱/逸脱

export interface Security {
  id: string; // UUID(crypto.randomUUID)
  code: string | null; // 国内4桁英数字 or ティッカー。投信はnull
  name: string;
  normalizedName: string; // NFKC正規化+空白除去(照合キー。保存時に自動生成)
  productType: ProductType;
  currency: Currency;
  // 仕様書5.1「市場区分」/ implement-p2.md 4.1節: CSV取込時に市場列(東証/NYSE/NASDAQ等)から設定。
  // 手動入力・投信はnull可。コードあり銘柄の一意性は(code, market)の組、投信はnormalizedNameで判定する
  market: string | null;
  createdAt: string; // ISO 8601
}

export interface Trade {
  id: string;
  tradeDate: string; // 'YYYY-MM-DD'
  securityId: string;
  side: TradeSide;
  accountType: AccountType;
  quantity: number; // 株数 or 口数(整数)
  price: number; // 約定単価。JPYは小数1位まで、USDは小数4位まで許容
  amount: number; // 受渡金額。JPY: 整数円 / USD: 整数セント(×100)で保持
  currency: Currency;
  note: string; // 一言メモ(任意)
  createdAt: string;
  updatedAt: string;
  // implement-p2.md 4.1節: 手動入力は従来通り(undefined)。CSV取込行にはbatchIdを付与しトレーサビリティを確保する
  source?: { kind: 'manual' | 'csv'; batchId?: string };
  // implement-p2.md 5.2節: 米国株式CSVのみ設定。|数量×単価−受渡金額|の参考値(手数料相当)
  impliedCost?: number;
}

export interface Rule {
  id: string;
  name: string;
  status: 'active' | 'retired';
  createdAt: string;
}

export interface RuleVersion {
  id: string;
  ruleId: string;
  version: number; // 1起点の連番
  sections: {
    overview: string; // 概要
    entry: string; // エントリー条件
    exit: string; // イグジット条件
    exclusion: string; // 除外条件
    moneyManagement: string; // 資金管理
  };
  revisionReason: string; // version >= 2 で必須
  createdAt: string;
  // 注意: 本レコードは作成後いかなる更新もしない(イミュータブル)
}

export interface TradeRuleLink {
  tradeId: string; // 主キー(取引1件につきルール紐付けは最大1件)
  ruleVersionId: string;
  adherence: Adherence;
  createdAt: string;
}

// 仕様書5.1/5.3・implement-p2.md 4.2/6章: FIFO損益マッチング(自動+手動)
export interface TradeMatch {
  id: string;
  sellTradeId: string;
  buyTradeId: string;
  quantity: number; // このマッチで消費した数量(整数)
  realizedPnl: number; // 実現損益。JPY: 整数円 / USD: 整数セント
  currency: Currency;
  method: 'fifo_auto' | 'manual';
  createdAt: string;
}

// 仕様書4.2・5.1・implement-p2.md 4.2/7章: ジャーナル(取引単位/日単位)
export interface JournalEntry {
  id: string;
  tradeId: string | null; // nullの場合は日単位エントリ
  entryDate: string; // 'YYYY-MM-DD'(日単位の対象日。取引単位でも約定日を複製保持)
  body: string; // 長文(数千字想定)
  createdAt: string;
  updatedAt: string;
  // 注意: 遵守評価はTradeRuleLink.adherenceに一元化し、本エンティティには持たせない(仕様書v0.5で訂正)
}

// implement-p2.md 4.2節: JournalEntryとTagの関連(join table)
export interface JournalTag {
  journalId: string;
  tagId: string;
  createdAt: string;
}

// 仕様書4.2・implement-p2.md 4.2節: 感情タグ・自由タグのマスタ
export interface Tag {
  id: string;
  name: string;
  normalizedName: string; // NFKC正規化(重複防止キー)
  kind: 'emotion' | 'free';
  createdAt: string;
}

// 仕様書6.3・implement-p2.md 4.2節: ポートフォリオCSV由来の現在値・保有数量(突合検証用)
export interface PriceSnapshot {
  id: string;
  securityId: string;
  snapshotAt: string; // ポートフォリオCSVの取得日(ファイル名 or ユーザー入力)
  price: number; // 現在値。投信は1万口あたり基準価額。JPY整数 or 小数1位、USDはセント
  quantity: number; // CSV上の保有数量(突合検証用)
  currency: Currency;
  batchId: string;
}

// 仕様書6.5・implement-p2.md 4.2節: CSV取込結果の履歴(取込単位のトレーサビリティ)
export interface ImportBatch {
  id: string;
  fileType: 'domestic_history' | 'us_history' | 'portfolio';
  fileName: string;
  importedAt: string;
  counts: { imported: number; skipped: number; error: number };
}
