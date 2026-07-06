import Dexie, { type Table } from 'dexie';
import type {
  Security,
  Trade,
  Rule,
  RuleVersion,
  TradeRuleLink,
  TradeMatch,
  JournalEntry,
  JournalTag,
  Tag,
  PriceSnapshot,
  ImportBatch,
} from '@/domain/types';

// appMetaはドメイン型に含まれない運用メタ情報専用テーブル(key-valueの汎用形)
export interface AppMetaRecord {
  key: string;
  value: unknown;
}

export class TradeJournalDB extends Dexie {
  securities!: Table<Security, string>;
  trades!: Table<Trade, string>;
  rules!: Table<Rule, string>;
  ruleVersions!: Table<RuleVersion, string>;
  tradeRuleLinks!: Table<TradeRuleLink, string>;
  tradeMatches!: Table<TradeMatch, string>;
  journalEntries!: Table<JournalEntry, string>;
  tags!: Table<Tag, string>;
  journalTags!: Table<JournalTag, [string, string]>;
  priceSnapshots!: Table<PriceSnapshot, string>;
  importBatches!: Table<ImportBatch, string>;
  appMeta!: Table<AppMetaRecord, string>;

  // dbNameはテスト(マイグレーション検証)で別名DBを使うためのみ指定可能。本番は既定値を使う
  constructor(dbName = 'trade-journal') {
    super(dbName);
    // implement-p1.md 4.1節: P1時点のスキーマ(そのまま維持し、version(2)へのアップグレード経路を確保する)
    this.version(1).stores({
      securities: 'id, code, normalizedName',
      trades: 'id, tradeDate, securityId',
      rules: 'id, status',
      ruleVersions: 'id, ruleId, [ruleId+version]',
      tradeRuleLinks: 'tradeId, ruleVersionId',
      appMeta: 'key',
    });

    // implement-p2.md 4.1節: CSVインポート・FIFO・ジャーナル用テーブルを追加
    this.version(2)
      .stores({
        securities: 'id, code, normalizedName, market, [code+market]',
        trades: 'id, tradeDate, securityId, [securityId+accountType]',
        rules: 'id, status',
        ruleVersions: 'id, ruleId, [ruleId+version]',
        tradeRuleLinks: 'tradeId, ruleVersionId',
        tradeMatches: 'id, sellTradeId, buyTradeId',
        journalEntries: 'id, tradeId, entryDate',
        tags: 'id, normalizedName',
        journalTags: '[journalId+tagId], tagId, journalId',
        priceSnapshots: 'id, securityId, [securityId+snapshotAt]',
        importBatches: 'id, importedAt',
        appMeta: 'key',
      })
      .upgrade(async (tx) => {
        // implement-p2.md 4.1節: 既存Securityのmarketをnullで補完(P1データの無損失移行)
        await tx
          .table('securities')
          .toCollection()
          .modify((security) => {
            if (security.market === undefined) {
              security.market = null;
            }
          });
      });

    // implement-p2.md 5.1節: Security.aliases追加。version(2)は実ブラウザで検証済みのため
    // 書き換えず、version(3)を新規に切って既存データへのバックフィルを行う
    this.version(3)
      .stores({
        securities: 'id, code, normalizedName, market, [code+market]',
        trades: 'id, tradeDate, securityId, [securityId+accountType]',
        rules: 'id, status',
        ruleVersions: 'id, ruleId, [ruleId+version]',
        tradeRuleLinks: 'tradeId, ruleVersionId',
        tradeMatches: 'id, sellTradeId, buyTradeId',
        journalEntries: 'id, tradeId, entryDate',
        tags: 'id, normalizedName',
        journalTags: '[journalId+tagId], tagId, journalId',
        priceSnapshots: 'id, securityId, [securityId+snapshotAt]',
        importBatches: 'id, importedAt',
        appMeta: 'key',
      })
      .upgrade(async (tx) => {
        await tx
          .table('securities')
          .toCollection()
          .modify((security) => {
            if (security.aliases === undefined) {
              security.aliases = [];
            }
          });
      });
  }
}

export const db = new TradeJournalDB();
