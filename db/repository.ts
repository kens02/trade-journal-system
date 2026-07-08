import { db, type AppMetaRecord } from '@/db/schema';
import { normalizeName } from '@/domain/normalize';
import { computeFifoMatchesForGroup, allocateByQuantity } from '@/domain/fifo';
import type {
  Security,
  Trade,
  Rule,
  RuleVersion,
  TradeRuleLink,
  Adherence,
  ImportBatch,
  PriceSnapshot,
  TradeMatch,
} from '@/domain/types';

// implement-p1.md 4.4節: 書き込みはすべて本ファイル経由で行う(UIから直接Dexieを触らない)

// 仕様書4.4/画面B: 紐付けが存在するRuleの物理削除を拒否する際に投げるエラー
export class RuleInUseError extends Error {
  constructor(ruleId: string) {
    super(`Rule ${ruleId} は取引に紐付いているため削除できません。「廃止」を利用してください。`);
    this.name = 'RuleInUseError';
  }
}

// implement-p2.md 6.2: 手動マッチの数量指定が買付/売却の残数量を超える場合に投げるエラー
export class InsufficientQuantityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientQuantityError';
  }
}

function newId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---- Security ----

export async function createSecurity(
  // implement-p2.md 4.1/5.1節: market/aliasesはP1由来の呼び出し元(手動入力)との互換のためoptional化し、
  // 未指定はそれぞれnull/空配列とする
  input: Omit<Security, 'id' | 'normalizedName' | 'createdAt' | 'market' | 'aliases'> & {
    market?: string | null;
    aliases?: string[];
  }
): Promise<Security> {
  const security: Security = {
    ...input,
    market: input.market ?? null,
    aliases: input.aliases ?? [],
    id: newId(),
    normalizedName: normalizeName(input.name),
    createdAt: nowIso(),
  };
  await db.securities.add(security);
  return security;
}

export async function updateSecurity(
  id: string,
  patch: Partial<Omit<Security, 'id' | 'normalizedName' | 'createdAt'>>
): Promise<void> {
  const update: Partial<Security> = { ...patch };
  if (patch.name !== undefined) {
    update.normalizedName = normalizeName(patch.name);
  }
  await db.securities.update(id, update);
}

export async function getSecurity(id: string): Promise<Security | undefined> {
  return db.securities.get(id);
}

// 仕様書6.3・implement-p2.md 5.1節: CSV未照合銘柄の解決で確定したエイリアスを追加する(重複追加は無視)
export async function addSecurityAlias(securityId: string, rawName: string): Promise<void> {
  const security = await getSecurity(securityId);
  if (!security) return;
  if (security.aliases.includes(rawName)) return;
  await db.securities.update(securityId, { aliases: [...security.aliases, rawName] });
}

export async function listSecurities(): Promise<Security[]> {
  return db.securities.toArray();
}

// ---- Trade ----

export async function createTrade(
  input: Omit<Trade, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Trade> {
  const timestamp = nowIso();
  const trade: Trade = {
    ...input,
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.trades.add(trade);
  // implement-p2.md 6.1: 取引追加後、影響を受けたグループ(securityId+accountType)のfifo_autoのみ再計算する
  await recomputeFifoForGroup(trade.securityId, trade.accountType);
  return trade;
}

export async function updateTrade(
  id: string,
  patch: Partial<Omit<Trade, 'id' | 'createdAt'>>
): Promise<void> {
  const before = await db.trades.get(id);
  await db.trades.update(id, { ...patch, updatedAt: nowIso() });
  const after = await db.trades.get(id);
  if (!after) return;
  await recomputeFifoForGroup(after.securityId, after.accountType);
  // 銘柄・口座区分が変わった場合は旧グループも再計算する(取引が抜けたことによる影響を反映)
  if (before && (before.securityId !== after.securityId || before.accountType !== after.accountType)) {
    await recomputeFifoForGroup(before.securityId, before.accountType);
  }
}

export async function getTrade(id: string): Promise<Trade | undefined> {
  return db.trades.get(id);
}

export async function listTrades(): Promise<Trade[]> {
  return db.trades.toArray();
}

// 仕様書4.4: Trade削除時は対応するTradeRuleLinkも同一トランザクションで削除する
// implement-p2.md 6.1: 削除される取引に紐づくTradeMatch(manual含む)も同一トランザクションで削除し、
// 削除後にグループのfifo_autoを再計算する
export async function deleteTrade(id: string): Promise<void> {
  const trade = await db.trades.get(id);
  const relatedMatches = await getTradeMatchesForTrade(id);
  await db.transaction('rw', db.trades, db.tradeRuleLinks, db.tradeMatches, async () => {
    await db.tradeRuleLinks.delete(id);
    if (relatedMatches.length > 0) {
      await db.tradeMatches.bulkDelete(relatedMatches.map((m) => m.id));
    }
    await db.trades.delete(id);
  });
  if (trade) {
    await recomputeFifoForGroup(trade.securityId, trade.accountType);
  }
}

// ---- TradeMatch(FIFO損益マッチング) ----

export async function getTradeMatchesForTrade(tradeId: string): Promise<TradeMatch[]> {
  const [asSell, asBuy] = await Promise.all([
    db.tradeMatches.where('sellTradeId').equals(tradeId).toArray(),
    db.tradeMatches.where('buyTradeId').equals(tradeId).toArray(),
  ]);
  return [...asSell, ...asBuy];
}

export async function listAllTradeMatches(): Promise<TradeMatch[]> {
  return db.tradeMatches.toArray();
}

// implement-p2.md 6.1: 指定グループ(securityId+accountType)のfifo_autoマッチのみを破棄・再計算する。
// manualマッチは一切変更しない
async function recomputeFifoForGroup(securityId: string, accountType: string): Promise<void> {
  const groupTrades = await db.trades
    .where('[securityId+accountType]')
    .equals([securityId, accountType])
    .toArray();
  const tradeIds = groupTrades.map((t) => t.id);
  const [bySell, byBuy] = await Promise.all([
    db.tradeMatches.where('sellTradeId').anyOf(tradeIds).toArray(),
    db.tradeMatches.where('buyTradeId').anyOf(tradeIds).toArray(),
  ]);
  const relevantMatchesById = new Map<string, TradeMatch>();
  for (const m of [...bySell, ...byBuy]) relevantMatchesById.set(m.id, m);
  const relevantMatches = [...relevantMatchesById.values()];

  const manualMatches = relevantMatches.filter((m) => m.method === 'manual');
  const existingAutoMatchIds = relevantMatches.filter((m) => m.method === 'fifo_auto').map((m) => m.id);

  const { matches } = computeFifoMatchesForGroup(groupTrades, manualMatches);

  await db.transaction('rw', db.tradeMatches, async () => {
    if (existingAutoMatchIds.length > 0) {
      await db.tradeMatches.bulkDelete(existingAutoMatchIds);
    }
    if (matches.length > 0) {
      await db.tradeMatches.bulkAdd(matches);
    }
  });
}

// implement-p2.md 6.2: 売却に対するマッチ先買付の変更(手動修正)。
// replaceMatchIdを指定すると、その既存マッチ(自動/手動いずれも可)を削除したうえで新規manualマッチを作成する。
// 数量は買付/売却それぞれの既存manualマッチ控除後の残数量以内でなければならない(超過はInsufficientQuantityError)
export async function setManualMatch(input: {
  sellTradeId: string;
  buyTradeId: string;
  quantity: number;
  replaceMatchId?: string;
}): Promise<TradeMatch> {
  const [sell, buy] = await Promise.all([db.trades.get(input.sellTradeId), db.trades.get(input.buyTradeId)]);
  if (!sell || !buy) {
    throw new Error('指定された取引が見つかりません。');
  }
  if (sell.securityId !== buy.securityId || sell.accountType !== buy.accountType) {
    throw new Error('売却と買付は同一銘柄・同一口座区分である必要があります。');
  }
  if (input.quantity <= 0) {
    throw new Error('数量は1以上を指定してください。');
  }

  const match = await db.transaction('rw', db.tradeMatches, async () => {
    if (input.replaceMatchId) {
      await db.tradeMatches.delete(input.replaceMatchId);
    }

    const [buyManualMatches, sellManualMatches] = await Promise.all([
      db.tradeMatches
        .where('buyTradeId')
        .equals(buy.id)
        .filter((m) => m.method === 'manual')
        .toArray(),
      db.tradeMatches
        .where('sellTradeId')
        .equals(sell.id)
        .filter((m) => m.method === 'manual')
        .toArray(),
    ]);
    const buyManualQty = buyManualMatches.reduce((sum, m) => sum + m.quantity, 0);
    const sellManualQty = sellManualMatches.reduce((sum, m) => sum + m.quantity, 0);

    if (buyManualQty + input.quantity > buy.quantity) {
      throw new InsufficientQuantityError(
        `買付の残数量(${buy.quantity - buyManualQty})を超える数量は指定できません。`
      );
    }
    if (sellManualQty + input.quantity > sell.quantity) {
      throw new InsufficientQuantityError(
        `売却の残数量(${sell.quantity - sellManualQty})を超える数量は指定できません。`
      );
    }

    const buyAlloc = allocateByQuantity(buy.amount, buy.quantity, buyManualQty, input.quantity);
    const sellAlloc = allocateByQuantity(sell.amount, sell.quantity, sellManualQty, input.quantity);

    const newMatch: TradeMatch = {
      id: newId(),
      sellTradeId: sell.id,
      buyTradeId: buy.id,
      quantity: input.quantity,
      realizedPnl: sellAlloc - buyAlloc,
      currency: sell.currency,
      method: 'manual',
      createdAt: nowIso(),
    };
    await db.tradeMatches.add(newMatch);
    return newMatch;
  });

  // manualマッチが確定した分だけ自動マッチのプールが変わるため、グループ全体を再計算する
  await recomputeFifoForGroup(sell.securityId, sell.accountType);
  return match;
}

// implement-p2.md 6.2: 手動マッチの削除。空いた数量は次の再計算で自動マッチが埋める
export async function deleteManualMatch(matchId: string): Promise<void> {
  const match = await db.tradeMatches.get(matchId);
  if (!match) return;
  const buy = await db.trades.get(match.buyTradeId);
  await db.tradeMatches.delete(matchId);
  if (buy) {
    await recomputeFifoForGroup(buy.securityId, buy.accountType);
  }
}

// ---- Rule / RuleVersion ----

export async function createRuleWithFirstVersion(input: {
  name: string;
  sections: RuleVersion['sections'];
}): Promise<{ rule: Rule; version: RuleVersion }> {
  const timestamp = nowIso();
  const rule: Rule = {
    id: newId(),
    name: input.name,
    status: 'active',
    createdAt: timestamp,
  };
  const version: RuleVersion = {
    id: newId(),
    ruleId: rule.id,
    version: 1,
    sections: input.sections,
    revisionReason: '',
    createdAt: timestamp,
  };
  await db.transaction('rw', db.rules, db.ruleVersions, async () => {
    await db.rules.add(rule);
    await db.ruleVersions.add(version);
  });
  return { rule, version };
}

export async function getRule(id: string): Promise<Rule | undefined> {
  return db.rules.get(id);
}

export async function listRules(): Promise<Rule[]> {
  return db.rules.toArray();
}

export async function retireRule(id: string): Promise<void> {
  await db.rules.update(id, { status: 'retired' });
}

export async function reactivateRule(id: string): Promise<void> {
  await db.rules.update(id, { status: 'active' });
}

// 仕様書4.4/画面B: 紐付けが1件もない場合のみRule+全RuleVersionを削除する。1件でもあればエラー
export async function deleteRuleHard(id: string): Promise<void> {
  await db.transaction(
    'rw',
    db.rules,
    db.ruleVersions,
    db.tradeRuleLinks,
    async () => {
      const versions = await db.ruleVersions.where('ruleId').equals(id).toArray();
      const versionIds = versions.map((v) => v.id);
      const linkCount =
        versionIds.length === 0
          ? 0
          : await db.tradeRuleLinks.where('ruleVersionId').anyOf(versionIds).count();
      if (linkCount > 0) {
        throw new RuleInUseError(id);
      }
      await db.ruleVersions.where('ruleId').equals(id).delete();
      await db.rules.delete(id);
    }
  );
}

// implement-p1.md 5章画面B: version>=2では改訂理由が必須。version番号は連番採番。作成後は不変
export async function createRuleVersion(input: {
  ruleId: string;
  sections: RuleVersion['sections'];
  revisionReason: string;
}): Promise<RuleVersion> {
  const existing = await db.ruleVersions.where('ruleId').equals(input.ruleId).toArray();
  const nextVersion = existing.reduce((max, v) => Math.max(max, v.version), 0) + 1;
  if (nextVersion >= 2 && input.revisionReason.trim() === '') {
    throw new Error('version 2以降の作成には改訂理由が必須です。');
  }
  const version: RuleVersion = {
    id: newId(),
    ruleId: input.ruleId,
    version: nextVersion,
    sections: input.sections,
    revisionReason: input.revisionReason,
    createdAt: nowIso(),
  };
  await db.ruleVersions.add(version);
  return version;
}

export async function getRuleVersion(id: string): Promise<RuleVersion | undefined> {
  return db.ruleVersions.get(id);
}

export async function listRuleVersions(ruleId: string): Promise<RuleVersion[]> {
  const versions = await db.ruleVersions.where('ruleId').equals(ruleId).toArray();
  return versions.sort((a, b) => a.version - b.version);
}

export async function getLatestRuleVersion(ruleId: string): Promise<RuleVersion | undefined> {
  const versions = await listRuleVersions(ruleId);
  return versions.at(-1);
}

// 画面C(集計)・バックアップで全ルール横断のRuleVersionが必要になるため追加
export async function listAllRuleVersions(): Promise<RuleVersion[]> {
  return db.ruleVersions.toArray();
}

// ---- TradeRuleLink ----

// tradeIdが主キーのためupsert(1取引につき紐付けは最大1件)
export async function setTradeRuleLink(input: {
  tradeId: string;
  ruleVersionId: string;
  adherence: Adherence;
}): Promise<TradeRuleLink> {
  const link: TradeRuleLink = {
    tradeId: input.tradeId,
    ruleVersionId: input.ruleVersionId,
    adherence: input.adherence,
    createdAt: nowIso(),
  };
  await db.tradeRuleLinks.put(link);
  return link;
}

export async function getTradeRuleLink(tradeId: string): Promise<TradeRuleLink | undefined> {
  return db.tradeRuleLinks.get(tradeId);
}

export async function deleteTradeRuleLink(tradeId: string): Promise<void> {
  await db.tradeRuleLinks.delete(tradeId);
}

export async function listTradeRuleLinksByRuleVersion(
  ruleVersionId: string
): Promise<TradeRuleLink[]> {
  return db.tradeRuleLinks.where('ruleVersionId').equals(ruleVersionId).toArray();
}

// 画面C(集計)・バックアップで全取引横断のTradeRuleLinkが必要になるため追加
export async function listAllTradeRuleLinks(): Promise<TradeRuleLink[]> {
  return db.tradeRuleLinks.toArray();
}

// ---- appMeta ----

export async function getAppMeta<T = unknown>(key: string): Promise<T | undefined> {
  const record = await db.appMeta.get(key);
  return record?.value as T | undefined;
}

export async function setAppMeta<T = unknown>(key: string, value: T): Promise<void> {
  await db.appMeta.put({ key, value });
}

// implement-p1.md 5章共通レイアウト: バックアップJSONに含める全appMetaレコード
export async function listAppMeta(): Promise<AppMetaRecord[]> {
  return db.appMeta.toArray();
}

// ---- ImportBatch ----

// 仕様書6.5・implement-p2.md 5.1節: CSV取込結果を取込単位で永続化する
export async function createImportBatch(
  input: Omit<ImportBatch, 'id' | 'importedAt'>
): Promise<ImportBatch> {
  const batch: ImportBatch = {
    ...input,
    id: newId(),
    importedAt: nowIso(),
  };
  await db.importBatches.add(batch);
  return batch;
}

export async function listImportBatches(): Promise<ImportBatch[]> {
  return db.importBatches.toArray();
}

// ---- PriceSnapshot ----

// 仕様書6.3・implement-p2.md 4.2節: ポートフォリオCSV取込時の明細行をPriceSnapshotとして永続化する
export async function createPriceSnapshot(input: Omit<PriceSnapshot, 'id'>): Promise<PriceSnapshot> {
  const snapshot: PriceSnapshot = { ...input, id: newId() };
  await db.priceSnapshots.add(snapshot);
  return snapshot;
}

export async function listPriceSnapshots(): Promise<PriceSnapshot[]> {
  return db.priceSnapshots.toArray();
}
