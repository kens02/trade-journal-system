import Dexie from 'dexie';
import { describe, it, expect, afterEach } from 'vitest';
import { TradeJournalDB } from '@/db/schema';

const TEST_DB_NAME = 'trade-journal-migration-test';
const TEST_DB_NAME_V2 = 'trade-journal-migration-test-v2';
const TEST_DB_NAME_V3 = 'trade-journal-migration-test-v3';

// P1時点(version 1)のスキーマをそのまま再現した最小Dexieクラス。
// 「既にversion 1でデータが入っているブラウザ」を模し、実際のアップグレード経路を検証する
class LegacyDB extends Dexie {
  constructor() {
    super(TEST_DB_NAME);
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

// P2-F1時点(version 2、aliases導入前)のスキーマを再現。実ブラウザで既にF1検証済みの状態を模す
class V2OnlyDB extends Dexie {
  constructor() {
    super(TEST_DB_NAME_V2);
    this.version(2).stores({
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
    });
  }
}

// P2完了時点(version 3、sectorId/unitShareQuantity導入前)のスキーマを再現。実ブラウザで既に検証済みの状態を模す
class V3OnlyDB extends Dexie {
  constructor() {
    super(TEST_DB_NAME_V3);
    this.version(3).stores({
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
    });
  }
}

afterEach(async () => {
  await Dexie.delete(TEST_DB_NAME);
  await Dexie.delete(TEST_DB_NAME_V2);
  await Dexie.delete(TEST_DB_NAME_V3);
});

// implement-p2.md 4.1節/F1受入条件: P1データがversion 2移行後も無損失で読めること
describe('v1 -> v2 マイグレーション', () => {
  it('P1で登録済みの全データが無傷で読め、Securityのmarketがnullで補完される', async () => {
    const legacy = new LegacyDB();
    await legacy.open();

    await legacy.table('securities').add({
      id: 'sec-1',
      code: '1489',
      name: 'テスト銘柄',
      normalizedName: 'テスト銘柄',
      productType: 'jp_stock',
      currency: 'JPY',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await legacy.table('trades').add({
      id: 'trade-1',
      tradeDate: '2026-01-01',
      securityId: 'sec-1',
      side: 'buy',
      accountType: 'specific',
      quantity: 100,
      price: 1000,
      amount: 100000,
      currency: 'JPY',
      note: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await legacy.table('rules').add({
      id: 'rule-1',
      name: 'P1ルール',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await legacy.table('ruleVersions').add({
      id: 'rv-1',
      ruleId: 'rule-1',
      version: 1,
      sections: { overview: '', entry: '', exit: '', exclusion: '', moneyManagement: '' },
      revisionReason: '',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await legacy.table('tradeRuleLinks').add({
      tradeId: 'trade-1',
      ruleVersionId: 'rv-1',
      adherence: 'followed',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await legacy.table('appMeta').add({ key: 'storagePersisted', value: true });

    legacy.close();

    const upgraded = new TradeJournalDB(TEST_DB_NAME);
    await upgraded.open();

    const security = await upgraded.securities.get('sec-1');
    expect(security?.code).toBe('1489');
    expect(security?.market).toBeNull(); // P1データはmarket未設定 -> nullで補完
    expect(security?.aliases).toEqual([]); // P1データはaliases未設定 -> 空配列で補完

    const trade = await upgraded.trades.get('trade-1');
    expect(trade?.amount).toBe(100000);

    const rule = await upgraded.rules.get('rule-1');
    expect(rule?.name).toBe('P1ルール');

    const ruleVersion = await upgraded.ruleVersions.get('rv-1');
    expect(ruleVersion?.version).toBe(1);

    const link = await upgraded.tradeRuleLinks.get('trade-1');
    expect(link?.adherence).toBe('followed');

    const appMeta = await upgraded.appMeta.get('storagePersisted');
    expect(appMeta?.value).toBe(true);

    // P2で追加されたテーブルが空の状態で問題なく使える
    expect(await upgraded.tradeMatches.toArray()).toEqual([]);
    expect(await upgraded.journalEntries.toArray()).toEqual([]);
    expect(await upgraded.tags.toArray()).toEqual([]);
    expect(await upgraded.journalTags.toArray()).toEqual([]);
    expect(await upgraded.priceSnapshots.toArray()).toEqual([]);
    expect(await upgraded.importBatches.toArray()).toEqual([]);

    upgraded.close();
  });
});

// implement-p2.md 5.1節: F1で既にversion 2まで進んだ環境(実ブラウザ検証済み)でもaliasesが無損失で補完されること
describe('v2 -> v3 マイグレーション', () => {
  it('F1時点(version 2)のSecurityにaliasesが空配列で補完される', async () => {
    const v2db = new V2OnlyDB();
    await v2db.open();

    await v2db.table('securities').add({
      id: 'sec-2',
      code: 'T',
      name: 'AT&T',
      normalizedName: 'AT&T',
      productType: 'us_stock',
      currency: 'USD',
      market: 'NYSE',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    v2db.close();

    const upgraded = new TradeJournalDB(TEST_DB_NAME_V2);
    await upgraded.open();

    const security = await upgraded.securities.get('sec-2');
    expect(security?.market).toBe('NYSE'); // version 2で設定済みの値は保持される
    expect(security?.aliases).toEqual([]); // version 3アップグレードで補完される

    upgraded.close();
  });
});

// implement-p3.md 4.1節: P2完了時点(version 3)のデータがversion 4移行後も無損失で読めること
describe('v3 -> v4 マイグレーション', () => {
  it('P2時点(version 3)のSecurityにsectorId/unitShareQuantityがnullで補完され、新設テーブルが空で使える', async () => {
    const v3db = new V3OnlyDB();
    await v3db.open();

    await v3db.table('securities').add({
      id: 'sec-3',
      code: '1489',
      name: 'テスト銘柄',
      normalizedName: 'テスト銘柄',
      productType: 'jp_stock',
      currency: 'JPY',
      market: '東証',
      aliases: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await v3db.table('tradeMatches').add({
      id: 'match-1',
      sellTradeId: 'trade-sell',
      buyTradeId: 'trade-buy',
      quantity: 10,
      realizedPnl: 500,
      currency: 'JPY',
      method: 'fifo_auto',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    v3db.close();

    const upgraded = new TradeJournalDB(TEST_DB_NAME_V3);
    await upgraded.open();

    const security = await upgraded.securities.get('sec-3');
    expect(security?.market).toBe('東証'); // version 3で設定済みの値は保持される
    expect(security?.sectorId).toBeNull(); // version 4アップグレードで補完される
    expect(security?.unitShareQuantity).toBeNull(); // version 4アップグレードで補完される

    const match = await upgraded.tradeMatches.get('match-1');
    expect(match?.realizedPnl).toBe(500); // P2データが無損失

    // P3で追加されたテーブルが空の状態で問題なく使える
    expect(await upgraded.sectors.toArray()).toEqual([]);
    expect(await upgraded.fxRates.toArray()).toEqual([]);
    expect(await upgraded.targetAllocations.toArray()).toEqual([]);
    expect(await upgraded.nisaUsages.toArray()).toEqual([]);
    expect(await upgraded.cashBalances.toArray()).toEqual([]);

    upgraded.close();
  });
});
