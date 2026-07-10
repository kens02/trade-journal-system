import type { HoldingPosition } from './holdings';
import type { Security, Sector, AccountType } from './types';
import { formatJPY, formatUSD } from './money';
import { buildCsvContent, buildCsvFilename } from './csv';

const ACCOUNT_LABEL: Record<AccountType, string> = {
  specific: '特定',
  nisa_growth: 'NISA(成長)',
  nisa_tsumitate: 'NISA(つみたて)',
  old_nisa: '旧NISA',
};

const HEADER = ['銘柄コード', '銘柄名', '口座区分', '数量', '平均取得単価', '通貨', 'セクター'];

// implement-p4.md 5.1節: app/portfolio/PortfolioClient.tsxの保有ポジション表示項目に準拠したCSV生成。
// 平均取得単価はimplement-p3.md 6.2節で確定した参考値(移動平均)であり、実現損益(FIFO)とは無関係
export function buildHoldingCsv(
  positions: HoldingPosition[],
  securitiesById: Map<string, Security>,
  sectorsById: Map<string, Sector>
): string {
  const rows = positions.map((position) => {
    const security = securitiesById.get(position.securityId);
    const sector = security?.sectorId ? sectorsById.get(security.sectorId) : undefined;
    return [
      security?.code ?? '',
      security?.name ?? '(不明な銘柄)',
      ACCOUNT_LABEL[position.accountType],
      String(position.quantity),
      position.currency === 'JPY'
        ? formatJPY(position.averageCostAmount)
        : formatUSD(position.averageCostAmount),
      position.currency,
      sector?.name ?? '',
    ];
  });
  return buildCsvContent(HEADER, rows);
}

export function buildHoldingCsvFilename(exportedAt: Date): string {
  return buildCsvFilename('holdings', exportedAt);
}
