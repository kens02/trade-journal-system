import Dexie from 'dexie';
import { describe, it, expect, afterEach } from 'vitest';
import { TradeJournalDB } from '@/db/schema';

const TEST_DB_NAME = 'trade-journal-migration-test';

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

afterEach(async () => {
  await Dexie.delete(TEST_DB_NAME);
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
