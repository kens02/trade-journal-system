'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Security, Trade, TradeRuleLink } from '@/domain/types';
import {
  createSecurity,
  createTrade,
  updateTrade,
  deleteTrade,
  listSecurities,
  listTrades,
  listRules,
  listRuleVersions,
  setTradeRuleLink,
  deleteTradeRuleLink,
  getTradeRuleLink,
} from '@/db/repository';
import { TradeForm, type TradeFormSubmitPayload, type RuleOption } from './TradeForm';
import { TradeList, type RuleDisplay } from './TradeList';

export function TradesClient() {
  const [securities, setSecurities] = useState<Security[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [ruleOptions, setRuleOptions] = useState<RuleOption[]>([]);
  const [ruleDisplayByVersionId, setRuleDisplayByVersionId] = useState<
    Map<string, RuleDisplay>
  >(new Map());
  const [linksByTradeId, setLinksByTradeId] = useState<Map<string, TradeRuleLink>>(new Map());
  const [editingTrade, setEditingTrade] = useState<{ trade: Trade; link: TradeRuleLink | null } | null>(
    null
  );
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const [securityRows, tradeRows, rules] = await Promise.all([
      listSecurities(),
      listTrades(),
      listRules(),
    ]);
    setSecurities(securityRows);
    setTrades(tradeRows);

    // implement-p1.md 5章画面A: activeなRuleの最新RuleVersionのみ選択肢にする。
    // 表示用マップは廃止(retired)ルールの過去の紐付けも正しく表示できるよう全ルール分作る
    const options: RuleOption[] = [];
    const displayMap = new Map<string, RuleDisplay>();
    for (const rule of rules) {
      const versions = await listRuleVersions(rule.id);
      for (const version of versions) {
        displayMap.set(version.id, { ruleName: rule.name, version: version.version });
      }
      if (rule.status === 'active') {
        const latest = versions.at(-1);
        if (latest) {
          options.push({
            ruleId: rule.id,
            ruleVersionId: latest.id,
            label: `${rule.name} (v${latest.version})`,
          });
        }
      }
    }
    setRuleOptions(options);
    setRuleDisplayByVersionId(displayMap);

    const links = await Promise.all(tradeRows.map((t) => getTradeRuleLink(t.id)));
    const linkMap = new Map<string, TradeRuleLink>();
    tradeRows.forEach((t, i) => {
      const link = links[i];
      if (link) linkMap.set(t.id, link);
    });
    setLinksByTradeId(linkMap);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleSubmit(payload: TradeFormSubmitPayload) {
    let securityId: string;
    if (payload.securitySelection.kind === 'existing') {
      securityId = payload.securitySelection.securityId;
    } else {
      const created = await createSecurity(payload.securitySelection.draft);
      securityId = created.id;
    }

    if (editingTrade) {
      await updateTrade(editingTrade.trade.id, {
        tradeDate: payload.tradeDate,
        securityId,
        side: payload.side,
        accountType: payload.accountType,
        quantity: payload.quantity,
        price: payload.price,
        amount: payload.amount,
        currency: payload.currency,
        note: payload.note,
      });
      if (payload.ruleVersionId && payload.adherence) {
        await setTradeRuleLink({
          tradeId: editingTrade.trade.id,
          ruleVersionId: payload.ruleVersionId,
          adherence: payload.adherence,
        });
      } else {
        await deleteTradeRuleLink(editingTrade.trade.id);
      }
      setEditingTrade(null);
    } else {
      const trade = await createTrade({
        tradeDate: payload.tradeDate,
        securityId,
        side: payload.side,
        accountType: payload.accountType,
        quantity: payload.quantity,
        price: payload.price,
        amount: payload.amount,
        currency: payload.currency,
        note: payload.note,
      });
      if (payload.ruleVersionId && payload.adherence) {
        await setTradeRuleLink({
          tradeId: trade.id,
          ruleVersionId: payload.ruleVersionId,
          adherence: payload.adherence,
        });
      }
    }

    await refresh();
  }

  async function handleEdit(trade: Trade) {
    const link = (await getTradeRuleLink(trade.id)) ?? null;
    setEditingTrade({ trade, link });
  }

  async function handleDelete(tradeId: string) {
    await deleteTrade(tradeId);
    if (editingTrade?.trade.id === tradeId) {
      setEditingTrade(null);
    }
    await refresh();
  }

  if (!loaded) {
    return <p className="text-sm text-gray-500">読み込み中...</p>;
  }

  const securitiesById = new Map(securities.map((s) => [s.id, s]));

  return (
    <div className="space-y-8">
      <TradeForm
        key={editingTrade?.trade.id ?? 'create'}
        securities={securities}
        ruleOptions={ruleOptions}
        mode={editingTrade ? 'edit' : 'create'}
        initial={editingTrade}
        onSubmit={handleSubmit}
        onCancel={() => setEditingTrade(null)}
      />
      <TradeList
        trades={trades}
        securitiesById={securitiesById}
        linksByTradeId={linksByTradeId}
        ruleDisplayByVersionId={ruleDisplayByVersionId}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  );
}
