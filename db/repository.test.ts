import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/schema';
import * as repo from '@/db/repository';

beforeEach(async () => {
  await db.transaction(
    'rw',
    db.securities,
    db.trades,
    db.rules,
    db.ruleVersions,
    db.tradeRuleLinks,
    db.tradeMatches,
    db.journalEntries,
    db.tags,
    db.journalTags,
    db.priceSnapshots,
    db.importBatches,
    db.appMeta,
    async () => {
      await db.securities.clear();
      await db.trades.clear();
      await db.rules.clear();
      await db.ruleVersions.clear();
      await db.tradeRuleLinks.clear();
      await db.tradeMatches.clear();
      await db.journalEntries.clear();
      await db.tags.clear();
      await db.journalTags.clear();
      await db.priceSnapshots.clear();
      await db.importBatches.clear();
      await db.appMeta.clear();
    }
  );
});

describe('Security', () => {
  it('作成→取得のラウンドトリップとnormalizedNameのNFKC正規化+空白除去', async () => {
    const security = await repo.createSecurity({
      code: '1489',
      name: 'ﾄﾖﾀ　自動車', // 半角カナ+全角スペースを含む
      productType: 'jp_stock',
      currency: 'JPY',
    });
    const fetched = await repo.getSecurity(security.id);
    expect(fetched).toEqual(security);
    expect(fetched?.normalizedName).toBe('トヨタ自動車');
  });

  it('marketを省略するとnullで作成され(P1互換)、指定時はその値が保存される', async () => {
    const withoutMarket = await repo.createSecurity({
      code: '1489',
      name: 'テスト銘柄A',
      productType: 'jp_stock',
      currency: 'JPY',
    });
    expect(withoutMarket.market).toBeNull();

    const withMarket = await repo.createSecurity({
      code: 'T',
      name: 'AT&T',
      productType: 'us_stock',
      currency: 'USD',
      market: 'NYSE',
    });
    expect(withMarket.market).toBe('NYSE');
  });
});

describe('Trade', () => {
  it('作成・取得・更新・一覧のラウンドトリップ', async () => {
    const security = await repo.createSecurity({
      code: '1489',
      name: 'テスト銘柄',
      productType: 'jp_stock',
      currency: 'JPY',
    });
    const trade = await repo.createTrade({
      tradeDate: '2026-07-01',
      securityId: security.id,
      side: 'buy',
      accountType: 'specific',
      quantity: 100,
      price: 2000,
      amount: 200000,
      currency: 'JPY',
      note: '',
    });
    expect(await repo.getTrade(trade.id)).toEqual(trade);

    await new Promise((resolve) => setTimeout(resolve, 2));
    await repo.updateTrade(trade.id, { quantity: 200 });
    const updated = await repo.getTrade(trade.id);
    expect(updated?.quantity).toBe(200);
    expect(updated?.createdAt).toBe(trade.createdAt);
    expect(updated?.updatedAt).not.toBe(trade.updatedAt);

    expect(await repo.listTrades()).toHaveLength(1);
  });

  it('削除時に対応するTradeRuleLinkも同一トランザクションで削除される', async () => {
    const security = await repo.createSecurity({
      code: '1489',
      name: 'テスト銘柄',
      productType: 'jp_stock',
      currency: 'JPY',
    });
    const trade = await repo.createTrade({
      tradeDate: '2026-07-01',
      securityId: security.id,
      side: 'buy',
      accountType: 'specific',
      quantity: 100,
      price: 2000,
      amount: 200000,
      currency: 'JPY',
      note: '',
    });
    const { version } = await repo.createRuleWithFirstVersion({
      name: 'テストルール',
      sections: { overview: '', entry: '', exit: '', exclusion: '', moneyManagement: '' },
    });
    await repo.setTradeRuleLink({
      tradeId: trade.id,
      ruleVersionId: version.id,
      adherence: 'followed',
    });

    await repo.deleteTrade(trade.id);

    expect(await repo.getTrade(trade.id)).toBeUndefined();
    expect(await repo.getTradeRuleLink(trade.id)).toBeUndefined();
  });
});

describe('Rule / RuleVersion', () => {
  it('紐付けが存在するRuleをdeleteRuleHardするとRuleInUseErrorがthrowされ何も削除されない', async () => {
    const { rule, version } = await repo.createRuleWithFirstVersion({
      name: 'テストルール',
      sections: { overview: '', entry: '', exit: '', exclusion: '', moneyManagement: '' },
    });
    await repo.setTradeRuleLink({
      tradeId: 'dummy-trade-id',
      ruleVersionId: version.id,
      adherence: 'followed',
    });

    await expect(repo.deleteRuleHard(rule.id)).rejects.toThrow(repo.RuleInUseError);
    expect(await repo.getRule(rule.id)).toBeDefined();
    expect(await repo.getRuleVersion(version.id)).toBeDefined();
  });

  it('紐付けがゼロのRuleはdeleteRuleHardでRule+全RuleVersionが削除される', async () => {
    const { rule, version } = await repo.createRuleWithFirstVersion({
      name: 'テストルール',
      sections: { overview: '', entry: '', exit: '', exclusion: '', moneyManagement: '' },
    });
    const v2 = await repo.createRuleVersion({
      ruleId: rule.id,
      sections: { overview: 'v2', entry: '', exit: '', exclusion: '', moneyManagement: '' },
      revisionReason: '改訂理由',
    });

    await repo.deleteRuleHard(rule.id);

    expect(await repo.getRule(rule.id)).toBeUndefined();
    expect(await repo.getRuleVersion(version.id)).toBeUndefined();
    expect(await repo.getRuleVersion(v2.id)).toBeUndefined();
  });

  it('retireRule→reactivateRuleでstatusが切り替わる', async () => {
    const { rule } = await repo.createRuleWithFirstVersion({
      name: 'テストルール',
      sections: { overview: '', entry: '', exit: '', exclusion: '', moneyManagement: '' },
    });
    expect((await repo.getRule(rule.id))?.status).toBe('active');

    await repo.retireRule(rule.id);
    expect((await repo.getRule(rule.id))?.status).toBe('retired');

    await repo.reactivateRule(rule.id);
    expect((await repo.getRule(rule.id))?.status).toBe('active');
  });

  it('createRuleVersionはversionを連番採番し、version>=2で改訂理由が必須で、旧versionは不変', async () => {
    const { rule, version: v1 } = await repo.createRuleWithFirstVersion({
      name: 'テストルール',
      sections: { overview: 'v1', entry: '', exit: '', exclusion: '', moneyManagement: '' },
    });
    expect(v1.version).toBe(1);

    await expect(
      repo.createRuleVersion({
        ruleId: rule.id,
        sections: { overview: 'v2', entry: '', exit: '', exclusion: '', moneyManagement: '' },
        revisionReason: '',
      })
    ).rejects.toThrow();

    const v2 = await repo.createRuleVersion({
      ruleId: rule.id,
      sections: { overview: 'v2', entry: '', exit: '', exclusion: '', moneyManagement: '' },
      revisionReason: '方針変更のため',
    });
    expect(v2.version).toBe(2);

    const v1Reloaded = await repo.getRuleVersion(v1.id);
    expect(v1Reloaded?.sections.overview).toBe('v1');
  });
});

describe('TradeRuleLink', () => {
  it('同一tradeIdへの再設定は上書きされ、1取引につき最大1件になる', async () => {
    const { version: versionA } = await repo.createRuleWithFirstVersion({
      name: 'ルールA',
      sections: { overview: '', entry: '', exit: '', exclusion: '', moneyManagement: '' },
    });
    const { version: versionB } = await repo.createRuleWithFirstVersion({
      name: 'ルールB',
      sections: { overview: '', entry: '', exit: '', exclusion: '', moneyManagement: '' },
    });

    await repo.setTradeRuleLink({
      tradeId: 'trade-1',
      ruleVersionId: versionA.id,
      adherence: 'followed',
    });
    await repo.setTradeRuleLink({
      tradeId: 'trade-1',
      ruleVersionId: versionB.id,
      adherence: 'deviated',
    });

    const link = await repo.getTradeRuleLink('trade-1');
    expect(link?.ruleVersionId).toBe(versionB.id);
    expect(await db.tradeRuleLinks.count()).toBe(1);
  });
});

describe('appMeta', () => {
  it('setAppMeta/getAppMetaで値の読み書きができ、未設定キーはundefinedを返す', async () => {
    expect(await repo.getAppMeta('storagePersisted')).toBeUndefined();
    await repo.setAppMeta('storagePersisted', true);
    expect(await repo.getAppMeta<boolean>('storagePersisted')).toBe(true);
  });
});

describe('Security alias', () => {
  it('addSecurityAliasでaliasesに追加され、同じ値の再追加は無視される', async () => {
    const security = await repo.createSecurity({
      code: null,
      name: 'テストファンド',
      productType: 'fund',
      currency: 'JPY',
    });
    expect(security.aliases).toEqual([]);

    await repo.addSecurityAlias(security.id, 'テストファンド(略称)');
    await repo.addSecurityAlias(security.id, 'テストファンド(略称)'); // 重複追加は無視

    const updated = await repo.getSecurity(security.id);
    expect(updated?.aliases).toEqual(['テストファンド(略称)']);
  });
});

describe('ImportBatch', () => {
  it('createImportBatch/listImportBatchesで取込結果を作成・一覧取得できる', async () => {
    const batch = await repo.createImportBatch({
      fileType: 'domestic_history',
      fileName: 'SaveFile_test.csv',
      counts: { imported: 5, skipped: 1, error: 0 },
    });
    expect(batch.id).toBeDefined();
    expect(batch.importedAt).toBeDefined();

    const list = await repo.listImportBatches();
    expect(list).toHaveLength(1);
    expect(list[0].fileName).toBe('SaveFile_test.csv');
    expect(list[0].counts).toEqual({ imported: 5, skipped: 1, error: 0 });
  });
});

describe('TradeMatch (FIFO)', () => {
  async function setupSecurity() {
    return repo.createSecurity({
      code: '1489',
      name: 'テスト銘柄',
      productType: 'jp_stock',
      currency: 'JPY',
    });
  }

  it('取引作成後、自動でfifo_autoマッチが生成され実現損益が計算される', async () => {
    const security = await setupSecurity();
    const buy = await repo.createTrade({
      tradeDate: '2026-01-01',
      securityId: security.id,
      side: 'buy',
      accountType: 'specific',
      quantity: 10,
      price: 100,
      amount: 1000,
      currency: 'JPY',
      note: '',
    });
    const sell = await repo.createTrade({
      tradeDate: '2026-01-02',
      securityId: security.id,
      side: 'sell',
      accountType: 'specific',
      quantity: 10,
      price: 110,
      amount: 1100,
      currency: 'JPY',
      note: '',
    });

    const matches = await repo.getTradeMatchesForTrade(sell.id);
    expect(matches).toHaveLength(1);
    expect(matches[0].buyTradeId).toBe(buy.id);
    expect(matches[0].realizedPnl).toBe(100);
    expect(matches[0].method).toBe('fifo_auto');
  });

  it('口座区分が異なる同一銘柄の売却は買付とマッチングされない', async () => {
    const security = await setupSecurity();
    await repo.createTrade({
      tradeDate: '2026-01-01',
      securityId: security.id,
      side: 'buy',
      accountType: 'specific',
      quantity: 10,
      price: 100,
      amount: 1000,
      currency: 'JPY',
      note: '',
    });
    const sell = await repo.createTrade({
      tradeDate: '2026-01-02',
      securityId: security.id,
      side: 'sell',
      accountType: 'nisa_growth',
      quantity: 10,
      price: 110,
      amount: 1100,
      currency: 'JPY',
      note: '',
    });

    expect(await repo.getTradeMatchesForTrade(sell.id)).toHaveLength(0);
  });

  it('setManualMatchで手動マッチを作成でき、自動再計算後も値が保持される', async () => {
    const security = await setupSecurity();
    const buy1 = await repo.createTrade({
      tradeDate: '2026-01-01',
      securityId: security.id,
      side: 'buy',
      accountType: 'specific',
      quantity: 10,
      price: 100,
      amount: 1000,
      currency: 'JPY',
      note: '',
    });
    const buy2 = await repo.createTrade({
      tradeDate: '2026-01-02',
      securityId: security.id,
      side: 'buy',
      accountType: 'specific',
      quantity: 10,
      price: 105,
      amount: 1050,
      currency: 'JPY',
      note: '',
    });
    const sell = await repo.createTrade({
      tradeDate: '2026-01-03',
      securityId: security.id,
      side: 'sell',
      accountType: 'specific',
      quantity: 10,
      price: 110,
      amount: 1100,
      currency: 'JPY',
      note: '',
    });

    // 自動ではbuy1(先入れ)から10株マッチするはずだが、手動でbuy2から5株に変更する
    const autoMatches = await repo.getTradeMatchesForTrade(sell.id);
    const manual = await repo.setManualMatch({
      sellTradeId: sell.id,
      buyTradeId: buy2.id,
      quantity: 5,
      replaceMatchId: autoMatches[0].id,
    });
    expect(manual.method).toBe('manual');

    // 別の取引を追加編集して同グループの再計算をトリガーしても、手動マッチのrealizedPnlは変わらない
    const buy3 = await repo.createTrade({
      tradeDate: '2026-01-04',
      securityId: security.id,
      side: 'buy',
      accountType: 'specific',
      quantity: 5,
      price: 90,
      amount: 450,
      currency: 'JPY',
      note: '',
    });
    await repo.updateTrade(buy3.id, { note: '再計算トリガー用' });

    const matchesAfter = await repo.getTradeMatchesForTrade(sell.id);
    const manualAfter = matchesAfter.find((m) => m.id === manual.id)!;
    expect(manualAfter.realizedPnl).toBe(manual.realizedPnl);
    expect(manualAfter.method).toBe('manual');

    // 残り5株分はfifo_autoで自動的に埋まっているはず(buy1から)
    const autoAfter = matchesAfter.filter((m) => m.method === 'fifo_auto');
    expect(autoAfter).toHaveLength(1);
    expect(autoAfter[0].buyTradeId).toBe(buy1.id);
    expect(autoAfter[0].quantity).toBe(5);
  });

  it('残数量を超えるsetManualMatchはInsufficientQuantityErrorになる', async () => {
    const security = await setupSecurity();
    const buy = await repo.createTrade({
      tradeDate: '2026-01-01',
      securityId: security.id,
      side: 'buy',
      accountType: 'specific',
      quantity: 5,
      price: 100,
      amount: 500,
      currency: 'JPY',
      note: '',
    });
    const sell = await repo.createTrade({
      tradeDate: '2026-01-02',
      securityId: security.id,
      side: 'sell',
      accountType: 'specific',
      quantity: 5,
      price: 110,
      amount: 550,
      currency: 'JPY',
      note: '',
    });

    await expect(
      repo.setManualMatch({ sellTradeId: sell.id, buyTradeId: buy.id, quantity: 6 })
    ).rejects.toThrow(repo.InsufficientQuantityError);
  });

  it('買付不足の売却はマッチ0件のまま(未解消)で、期首買付を追加すると解消される', async () => {
    const security = await setupSecurity();
    const sell = await repo.createTrade({
      tradeDate: '2026-01-02',
      securityId: security.id,
      side: 'sell',
      accountType: 'specific',
      quantity: 10,
      price: 110,
      amount: 1100,
      currency: 'JPY',
      note: '',
    });
    expect(await repo.getTradeMatchesForTrade(sell.id)).toHaveLength(0);

    // 期首残高相当の買付を後から手動登録(約定日は売却より前)
    await repo.createTrade({
      tradeDate: '2025-12-01',
      securityId: security.id,
      side: 'buy',
      accountType: 'specific',
      quantity: 10,
      price: 90,
      amount: 900,
      currency: 'JPY',
      note: '期首残高',
    });

    const matches = await repo.getTradeMatchesForTrade(sell.id);
    expect(matches).toHaveLength(1);
    expect(matches[0].quantity).toBe(10);
  });

  it('取引削除時に紐づくTradeMatchも削除され、グループが再計算される', async () => {
    const security = await setupSecurity();
    const buy = await repo.createTrade({
      tradeDate: '2026-01-01',
      securityId: security.id,
      side: 'buy',
      accountType: 'specific',
      quantity: 10,
      price: 100,
      amount: 1000,
      currency: 'JPY',
      note: '',
    });
    const sell = await repo.createTrade({
      tradeDate: '2026-01-02',
      securityId: security.id,
      side: 'sell',
      accountType: 'specific',
      quantity: 10,
      price: 110,
      amount: 1100,
      currency: 'JPY',
      note: '',
    });
    expect(await repo.getTradeMatchesForTrade(sell.id)).toHaveLength(1);

    await repo.deleteTrade(buy.id);

    expect(await repo.getTradeMatchesForTrade(sell.id)).toHaveLength(0);
  });
});

describe('PriceSnapshot', () => {
  it('createPriceSnapshot/listPriceSnapshotsで作成・一覧取得できる', async () => {
    const snapshot = await repo.createPriceSnapshot({
      securityId: 'sec-1',
      snapshotAt: '2026-07-06',
      price: 2200,
      quantity: 100,
      currency: 'JPY',
      batchId: 'batch-1',
    });
    expect(snapshot.id).toBeDefined();

    const list = await repo.listPriceSnapshots();
    expect(list).toHaveLength(1);
    expect(list[0].securityId).toBe('sec-1');
    expect(list[0].quantity).toBe(100);
  });
});
