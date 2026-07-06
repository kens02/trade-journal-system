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
