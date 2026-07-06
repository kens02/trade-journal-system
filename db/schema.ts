import Dexie, { type Table } from 'dexie';
import type { Security, Trade, Rule, RuleVersion, TradeRuleLink } from '@/domain/types';

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
  appMeta!: Table<AppMetaRecord, string>;

  constructor() {
    super('trade-journal');
    // implement-p1.md 4.1節: P2以降の拡張はDexieのversion管理で行うため、P1で余分なテーブルは作らない
    this.version(1).stores({
      securities: 'id, code, normalizedName',
      trades: 'id, tradeDate, securityId',
      rules: 'id, status',
      ruleVersions: 'id, ruleId, [ruleId+version]',
      tradeRuleLinks: 'tradeId, ruleVersionId',
      appMeta: 'key',
    });
  }
}

export const db = new TradeJournalDB();
