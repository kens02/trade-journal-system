import type {
  Security,
  Trade,
  Rule,
  RuleVersion,
  TradeRuleLink,
  TradeMatch,
  JournalEntry,
  Tag,
  JournalTag,
  PriceSnapshot,
  ImportBatch,
  Sector,
  FxRate,
  TargetAllocation,
  NisaUsage,
  CashBalance,
} from './types';

export interface BackupAppMetaRecord {
  key: string;
  value: unknown;
}

// implement-p1.md 5章共通レイアウト。P4前倒し(リストア機能追加)でP2エンティティを、
// implement-p3.md 4.1節でP3エンティティを追加し、バックアップが現在の全テーブルを反映するようにした
export interface BackupData {
  securities: Security[];
  trades: Trade[];
  rules: Rule[];
  ruleVersions: RuleVersion[];
  tradeRuleLinks: TradeRuleLink[];
  tradeMatches: TradeMatch[];
  journalEntries: JournalEntry[];
  tags: Tag[];
  journalTags: JournalTag[];
  priceSnapshots: PriceSnapshot[];
  importBatches: ImportBatch[];
  sectors: Sector[];
  fxRates: FxRate[];
  targetAllocations: TargetAllocation[];
  nisaUsages: NisaUsage[];
  cashBalances: CashBalance[];
  appMeta: BackupAppMetaRecord[];
}

// schemaVersion 3: P3エンティティ(sectors/fxRates/targetAllocations/nisaUsages/cashBalances)追加により
// バックアップファイルの形状が変わったため3に上げた。
// parseBackupPayloadはschemaVersion 1(P1時点)・2(P2時点)のファイルも読み込める
export interface BackupPayload {
  schemaVersion: 3;
  exportedAt: string;
  data: BackupData;
}

export function buildBackupPayload(data: BackupData, exportedAt: string): BackupPayload {
  return { schemaVersion: 3, exportedAt, data };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// implement-p1.md 5章共通レイアウト: ファイル名 trade-journal-backup-YYYYMMDD-HHmm.json
export function buildBackupFilename(exportedAt: Date): string {
  const y = exportedAt.getFullYear();
  const m = pad2(exportedAt.getMonth() + 1);
  const d = pad2(exportedAt.getDate());
  const hh = pad2(exportedAt.getHours());
  const mm = pad2(exportedAt.getMinutes());
  return `trade-journal-backup-${y}${m}${d}-${hh}${mm}.json`;
}

export type ParseBackupResult = { ok: true; payload: BackupPayload } | { ok: false; error: string };

// v1(P1時点)のバックアップに必ず含まれるテーブル。これらが揃わないファイルは形式不正として扱う
const REQUIRED_KEYS = ['securities', 'trades', 'rules', 'ruleVersions', 'tradeRuleLinks', 'appMeta'] as const;

// リストア機能: アップロードされたバックアップJSONの構文・形状を検証する純粋関数。
// v1/v2ファイル(P2/P3分のテーブルを含まない)はそれらを空配列で補完し、常にv3形状で返す
export function parseBackupPayload(raw: string): ParseBackupResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'JSONとして読み込めませんでした。ファイルが破損している可能性があります。' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'バックアップファイルの形式が不正です。' };
  }
  const candidate = parsed as Record<string, unknown>;

  if (candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2 && candidate.schemaVersion !== 3) {
    return {
      ok: false,
      error: `対応していないバックアップ形式です(schemaVersion: ${String(candidate.schemaVersion)})。`,
    };
  }
  if (typeof candidate.exportedAt !== 'string') {
    return { ok: false, error: 'バックアップファイルの形式が不正です(exportedAtがありません)。' };
  }
  if (typeof candidate.data !== 'object' || candidate.data === null) {
    return { ok: false, error: 'バックアップファイルの形式が不正です(dataがありません)。' };
  }
  const data = candidate.data as Record<string, unknown>;

  for (const key of REQUIRED_KEYS) {
    if (!Array.isArray(data[key])) {
      return { ok: false, error: `バックアップファイルの形式が不正です(${key}が配列ではありません)。` };
    }
  }

  const normalized: BackupData = {
    securities: data.securities as Security[],
    trades: data.trades as Trade[],
    rules: data.rules as Rule[],
    ruleVersions: data.ruleVersions as RuleVersion[],
    tradeRuleLinks: data.tradeRuleLinks as TradeRuleLink[],
    tradeMatches: Array.isArray(data.tradeMatches) ? (data.tradeMatches as TradeMatch[]) : [],
    journalEntries: Array.isArray(data.journalEntries) ? (data.journalEntries as JournalEntry[]) : [],
    tags: Array.isArray(data.tags) ? (data.tags as Tag[]) : [],
    journalTags: Array.isArray(data.journalTags) ? (data.journalTags as JournalTag[]) : [],
    priceSnapshots: Array.isArray(data.priceSnapshots) ? (data.priceSnapshots as PriceSnapshot[]) : [],
    importBatches: Array.isArray(data.importBatches) ? (data.importBatches as ImportBatch[]) : [],
    sectors: Array.isArray(data.sectors) ? (data.sectors as Sector[]) : [],
    fxRates: Array.isArray(data.fxRates) ? (data.fxRates as FxRate[]) : [],
    targetAllocations: Array.isArray(data.targetAllocations) ? (data.targetAllocations as TargetAllocation[]) : [],
    nisaUsages: Array.isArray(data.nisaUsages) ? (data.nisaUsages as NisaUsage[]) : [],
    cashBalances: Array.isArray(data.cashBalances) ? (data.cashBalances as CashBalance[]) : [],
    appMeta: data.appMeta as BackupAppMetaRecord[],
  };

  return {
    ok: true,
    payload: { schemaVersion: 3, exportedAt: candidate.exportedAt, data: normalized },
  };
}
