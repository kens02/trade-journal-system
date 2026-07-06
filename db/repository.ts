import { db, type AppMetaRecord } from '@/db/schema';
import { normalizeName } from '@/domain/normalize';
import type {
  Security,
  Trade,
  Rule,
  RuleVersion,
  TradeRuleLink,
  Adherence,
} from '@/domain/types';

// implement-p1.md 4.4節: 書き込みはすべて本ファイル経由で行う(UIから直接Dexieを触らない)

// 仕様書4.4/画面B: 紐付けが存在するRuleの物理削除を拒否する際に投げるエラー
export class RuleInUseError extends Error {
  constructor(ruleId: string) {
    super(`Rule ${ruleId} は取引に紐付いているため削除できません。「廃止」を利用してください。`);
    this.name = 'RuleInUseError';
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
  input: Omit<Security, 'id' | 'normalizedName' | 'createdAt'>
): Promise<Security> {
  const security: Security = {
    ...input,
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
  return trade;
}

export async function updateTrade(
  id: string,
  patch: Partial<Omit<Trade, 'id' | 'createdAt'>>
): Promise<void> {
  await db.trades.update(id, { ...patch, updatedAt: nowIso() });
}

export async function getTrade(id: string): Promise<Trade | undefined> {
  return db.trades.get(id);
}

export async function listTrades(): Promise<Trade[]> {
  return db.trades.toArray();
}

// 仕様書4.4: Trade削除時は対応するTradeRuleLinkも同一トランザクションで削除する
export async function deleteTrade(id: string): Promise<void> {
  await db.transaction('rw', db.trades, db.tradeRuleLinks, async () => {
    await db.tradeRuleLinks.delete(id);
    await db.trades.delete(id);
  });
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
