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
    db.appMeta,
    async () => {
      await db.securities.clear();
      await db.trades.clear();
      await db.rules.clear();
      await db.ruleVersions.clear();
      await db.tradeRuleLinks.clear();
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
