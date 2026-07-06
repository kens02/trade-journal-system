'use client';

import { useEffect, useState } from 'react';
import type {
  Trade,
  TradeRuleLink,
  TradeSide,
  AccountType,
  Adherence,
  Currency,
  Security,
} from '@/domain/types';
import { SecurityPicker, type SecuritySelection } from './SecurityPicker';
import { parseJPYPrice, parseJPYAmount, parseUSDPrice, parseUSDAmount } from '@/domain/money';

export interface RuleOption {
  ruleId: string;
  ruleVersionId: string;
  label: string;
}

export interface TradeFormSubmitPayload {
  securitySelection: SecuritySelection;
  tradeDate: string;
  side: TradeSide;
  accountType: AccountType;
  quantity: number;
  price: number;
  amount: number;
  currency: Currency;
  note: string;
  ruleVersionId: string | null;
  adherence: Adherence | null;
}

interface Props {
  securities: Security[];
  ruleOptions: RuleOption[];
  mode: 'create' | 'edit';
  initial?: { trade: Trade; link: TradeRuleLink | null } | null;
  onSubmit: (payload: TradeFormSubmitPayload) => Promise<void>;
  onCancel?: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatAmountForInput(amount: number, currency: Currency): string {
  return currency === 'JPY' ? String(amount) : (amount / 100).toFixed(2);
}

const ACCOUNT_OPTIONS: { value: AccountType; label: string }[] = [
  { value: 'specific', label: '特定' },
  { value: 'nisa_growth', label: 'NISA(成長)' },
  { value: 'nisa_tsumitate', label: 'NISA(つみたて)' },
  { value: 'old_nisa', label: '旧NISA' },
];

// implement-p1.md 5章画面A: 入力フォーム。key指定によるTradeForm自体の再マウントで
// 編集対象切り替え時の初期値をuseStateの遅延初期化のみで安全に反映する(TradesClient側でkey付与)
export function TradeForm({ securities, ruleOptions, mode, initial, onSubmit, onCancel }: Props) {
  const [securitySelection, setSecuritySelection] = useState<SecuritySelection | null>(() => {
    if (!initial) return null;
    const security = securities.find((s) => s.id === initial.trade.securityId);
    return security
      ? { kind: 'existing', securityId: security.id, currency: security.currency }
      : null;
  });
  const [tradeDate, setTradeDate] = useState(() => initial?.trade.tradeDate ?? today());
  const [side, setSide] = useState<TradeSide>(() => initial?.trade.side ?? 'buy');
  const [accountType, setAccountType] = useState<AccountType | ''>(
    () => initial?.trade.accountType ?? ''
  );
  const [quantity, setQuantity] = useState(() => (initial ? String(initial.trade.quantity) : ''));
  const [price, setPrice] = useState(() => (initial ? String(initial.trade.price) : ''));
  const [amount, setAmount] = useState(() =>
    initial ? formatAmountForInput(initial.trade.amount, initial.trade.currency) : ''
  );
  const [amountTouched, setAmountTouched] = useState(() => Boolean(initial));
  const [ruleVersionId, setRuleVersionId] = useState(() => initial?.link?.ruleVersionId ?? '');
  const [adherence, setAdherence] = useState<Adherence | ''>(() => initial?.link?.adherence ?? '');
  const [note, setNote] = useState(() => initial?.trade.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setSecuritySelection(null);
    setTradeDate(today());
    setSide('buy');
    setAccountType('');
    setQuantity('');
    setPrice('');
    setAmount('');
    setAmountTouched(false);
    setRuleVersionId('');
    setAdherence('');
    setNote('');
    setErrors({});
  }

  const currency: Currency | null =
    securitySelection?.kind === 'existing'
      ? securitySelection.currency
      : securitySelection?.kind === 'new'
        ? securitySelection.draft.currency
        : null;

  // 仕様書4.3: 数量×単価を金額の初期提案とするが、ユーザーが金額欄を編集したら以後は上書きしない
  useEffect(() => {
    if (amountTouched || !currency) return;
    const qty = Number(quantity);
    const parsedPrice = currency === 'JPY' ? parseJPYPrice(price) : parseUSDPrice(price);
    if (!Number.isFinite(qty) || qty <= 0 || parsedPrice === null) return;
    const suggested = qty * parsedPrice;
    setAmount(currency === 'JPY' ? String(Math.round(suggested)) : suggested.toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantity, price, currency]);

  function validate(): { errors: Record<string, string>; parsed: TradeFormSubmitPayload | null } {
    const nextErrors: Record<string, string> = {};

    if (!securitySelection) {
      nextErrors.security = '銘柄を選択するか、新規銘柄情報を入力してください。';
    } else if (securitySelection.kind === 'new' && securitySelection.draft.name.trim() === '') {
      nextErrors.security = '新規銘柄の名称を入力してください。';
    }

    if (!tradeDate) {
      nextErrors.tradeDate = '約定日を入力してください。';
    }

    if (!accountType) {
      nextErrors.accountType = '口座区分を選択してください。';
    }

    if (!/^[1-9]\d*$/.test(quantity.trim())) {
      nextErrors.quantity = '数量は1以上の整数を入力してください。';
    }

    const resolvedCurrency: Currency = currency ?? 'JPY';
    const parsedPrice = resolvedCurrency === 'JPY' ? parseJPYPrice(price) : parseUSDPrice(price);
    if (parsedPrice === null) {
      nextErrors.price =
        resolvedCurrency === 'JPY'
          ? '単価は正の数値で入力してください(小数第1位まで)。'
          : '単価は正の数値で入力してください(小数第4位まで)。';
    }

    const parsedAmount =
      resolvedCurrency === 'JPY' ? parseJPYAmount(amount) : parseUSDAmount(amount);
    if (parsedAmount === null) {
      nextErrors.amount =
        resolvedCurrency === 'JPY'
          ? '受渡金額は正の整数円で入力してください。'
          : '受渡金額は正の数値で入力してください(小数第2位まで)。';
    }

    if (ruleVersionId && !adherence) {
      nextErrors.adherence = 'ルールを選択した場合は遵守評価が必須です。';
    }

    if (
      Object.keys(nextErrors).length > 0 ||
      !securitySelection ||
      parsedPrice === null ||
      parsedAmount === null
    ) {
      return { errors: nextErrors, parsed: null };
    }

    return {
      errors: {},
      parsed: {
        securitySelection,
        tradeDate,
        side,
        accountType: accountType as AccountType,
        quantity: Number(quantity),
        price: parsedPrice,
        amount: parsedAmount,
        currency: resolvedCurrency,
        note,
        ruleVersionId: ruleVersionId || null,
        adherence: ruleVersionId ? (adherence as Adherence) : null,
      },
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { errors: nextErrors, parsed } = validate();
    setErrors(nextErrors);
    if (!parsed) return;
    setSubmitting(true);
    try {
      await onSubmit(parsed);
      if (mode === 'create') {
        resetForm();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border rounded p-4">
      <h2 className="font-bold">{mode === 'create' ? '取引を登録' : '取引を編集'}</h2>

      <div>
        <label className="block text-sm font-medium">約定日</label>
        <input
          type="date"
          className="border rounded px-2 py-1"
          value={tradeDate}
          onChange={(e) => setTradeDate(e.target.value)}
        />
        {errors.tradeDate && <p className="text-sm text-red-600">{errors.tradeDate}</p>}
      </div>

      <div>
        <SecurityPicker
          securities={securities}
          value={securitySelection}
          onChange={setSecuritySelection}
        />
        {errors.security && <p className="text-sm text-red-600">{errors.security}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium">売買区分</label>
        <select
          className="border rounded px-2 py-1"
          value={side}
          onChange={(e) => setSide(e.target.value as TradeSide)}
        >
          <option value="buy">買</option>
          <option value="sell">売</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium">口座区分</label>
        <select
          className="border rounded px-2 py-1"
          value={accountType}
          onChange={(e) => setAccountType(e.target.value as AccountType)}
        >
          <option value="">選択してください</option>
          {ACCOUNT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {errors.accountType && <p className="text-sm text-red-600">{errors.accountType}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium">数量</label>
        <input
          type="text"
          inputMode="numeric"
          className="border rounded px-2 py-1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        {errors.quantity && <p className="text-sm text-red-600">{errors.quantity}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium">単価{currency ? `(${currency})` : ''}</label>
        <input
          type="text"
          inputMode="decimal"
          className="border rounded px-2 py-1"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          disabled={!currency}
        />
        {errors.price && <p className="text-sm text-red-600">{errors.price}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium">
          受渡金額{currency ? `(${currency})` : ''}
        </label>
        <input
          type="text"
          inputMode="decimal"
          className="border rounded px-2 py-1"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setAmountTouched(true);
          }}
          disabled={!currency}
        />
        {errors.amount && <p className="text-sm text-red-600">{errors.amount}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium">ルール紐付け(任意)</label>
        <select
          className="border rounded px-2 py-1"
          value={ruleVersionId}
          onChange={(e) => setRuleVersionId(e.target.value)}
        >
          <option value="">紐付けなし</option>
          {ruleOptions.map((opt) => (
            <option key={opt.ruleVersionId} value={opt.ruleVersionId}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {ruleVersionId && (
        <div>
          <label className="block text-sm font-medium">遵守評価</label>
          <select
            className="border rounded px-2 py-1"
            value={adherence}
            onChange={(e) => setAdherence(e.target.value as Adherence)}
          >
            <option value="">選択してください</option>
            <option value="followed">遵守</option>
            <option value="partial">一部逸脱</option>
            <option value="deviated">逸脱</option>
          </select>
          {errors.adherence && <p className="text-sm text-red-600">{errors.adherence}</p>}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium">一言メモ</label>
        <input
          type="text"
          className="border rounded px-2 py-1 w-full"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50"
          disabled={submitting}
        >
          {mode === 'create' ? '登録' : '更新'}
        </button>
        {mode === 'edit' && onCancel && (
          <button type="button" className="px-4 py-1 rounded border" onClick={onCancel}>
            キャンセル
          </button>
        )}
      </div>
    </form>
  );
}
