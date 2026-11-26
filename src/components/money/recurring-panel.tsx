"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { formatDayMonth, formatFullDate } from "@/lib/domain/dates";
import { monthTransactions } from "@/lib/engine/analytics";
import { transactionOccurredBy } from "@/lib/domain/transaction-time";
import { useMoneyText } from "@/lib/hooks/use-privacy";
import { parseAmountInput } from "@/lib/domain/money";
import type {
  RecurringFrequency,
  RecurringTransaction,
} from "@/lib/domain/types";
import {
  isLiveMonth,
  monthlyRecurringTotal,
  priceDrift,
  recurringStatuses,
  type RecurringStatus,
} from "@/lib/engine/recurring";
import { detectRecurringCandidates, type RecurringCandidate } from "@/lib/engine/recurring-detection";
import {
  deleteRecurring,
  saveRecurring,
} from "@/lib/data/actions";
import { useFinance } from "@/lib/hooks/use-finance";
import { Amount } from "@/components/ui/amount";
import { MoneyField, SelectField, TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import {TransactionList} from '@/components/transactions/transaction-list';
import {SubscriptionOverview} from './subscription-overview';
import {subscriptionCategory} from '@/lib/engine/subscription-overview';
import { useToast } from "@/components/ui/toast";
import { AccountPicker, CategoryPicker } from "@/components/pickers/pickers";
import { createId, pluralise } from "@/lib/utils";

/**
 * Recurring bills and subscriptions (spec §18).
 *
 * These are the charges you have already agreed to, so safe-to-spend holds
 * them back before offering you anything. The panel's job is to make that
 * withholding legible: what is committed, when it lands, and what the whole
 * arrangement costs per month once weekly and yearly bills are converted to
 * the same footing.
 */

const SubscriptionPaymentSheet = dynamic(() => import("./subscription-payment-sheet").then(m => m.SubscriptionPaymentSheet));

const FREQUENCIES: { value: RecurringFrequency; label: string }[] = [
  { value: "MONTHLY", label: "Every month" },
  { value: "WEEKLY", label: "Every week" },
  { value: "YEARLY", label: "Every year" },
];

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function RecurringPanel() {
  const money = useMoneyText();
  const { db, month, now, cycleStartDay } = useFinance();
  const [editing, setEditing] = useState<RecurringTransaction | null>(null);
  const [creating, setCreating] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [payingId,setPayingId]=useState<string|null>(null);
  const [viewingId,setViewingId]=useState<string|null>(null);

  const rules = db?.recurring ?? [];
  const statuses = recurringStatuses(rules, db?.transactions ?? [], month, now, cycleStartDay);
  const periodRows=monthTransactions(db?.transactions??[],month,cycleStartDay).filter(t=>transactionOccurredBy(t,now));
  const viewing=statuses.find(s=>s.rule.id===viewingId)??null;
  const viewingRows=[...new Map([...viewing?.payments??[],...viewing?.possiblePayments??[],...periodRows.filter(t=>t.recurringId===viewingId)].map(t=>[t.id,t])).values()];
  const monthlyTotal = monthlyRecurringTotal(rules);
  const activeCount = rules.filter((r) => r.isActive).length;
  const live = isLiveMonth(month, now, cycleStartDay);

  const candidates = useMemo(
    () =>
      detectRecurringCandidates(db?.transactions ?? [], rules, now).filter(
        (c) => !dismissed.has(c.key),
      ),
    [db?.transactions, rules, now, dismissed],
  );

  const otherCandidates=candidates.filter(candidate=>!subscriptionCategory(candidate.categoryId,db?.categories??[]));

  function openCandidate(candidate: RecurringCandidate) {
    setEditing({
      id: createId("rec"),
      description: candidate.occurrences[0]!.description,
      amount: candidate.suggestedAmount,
      frequency: candidate.suggestedFrequency,
      dayOfPeriod: candidate.suggestedDayOfPeriod,
      categoryId: candidate.categoryId,
      accountId: candidate.accountId,
      type: "EXPENSE",
      merchant: candidate.merchant,
      isActive: true,
      createdAt: new Date().toISOString(),
    });
  }

  return (
    <>
      <SubscriptionOverview onEditRule={setEditing} onCandidate={openCandidate} dismissed={dismissed} onDismiss={key=>setDismissed(previous=>new Set(previous).add(key))}/>
      {otherCandidates.length > 0 && (
        <div className="-mx-3 space-y-2 px-3">
          {otherCandidates.map((candidate) => (
            <div
              key={candidate.key}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/25 bg-accent-soft/50 p-3"
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-ink">
                  {candidate.occurrences[0]!.description} looks recurring
                </span>
                <span className="mt-0.5 block text-[12px] text-ink-secondary">
                  {candidate.occurrences.length} times, ~{money(candidate.suggestedAmount)}{" "}
                  every {candidate.suggestedFrequency === "WEEKLY" ? "week" : "month"} — last on{" "}
                  {formatFullDate(candidate.occurrences[0]!.date)}
                </span>
              </span>
              <span className="flex shrink-0 gap-1.5">
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() =>
                    setDismissed((prev) => new Set(prev).add(candidate.key))
                  }
                >
                  No
                </Button>
                <Button size="sm" variant="primary" onClick={() => openCandidate(candidate)}>
                  Add as recurring
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="-mx-3">
        {statuses.map((status) => (
          <RecurringRow
            key={status.rule.id}
            status={status}
            live={live}
            onEdit={() => setEditing(status.rule)}
            onInspect={()=>setViewingId(status.rule.id)}
            onPay={()=>setPayingId(status.rule.id)}
            lastRecordedDate={periodRows.filter(t=>t.recurringId===status.rule.id).map(t=>t.date).sort().at(-1)}
          />
        ))}
      </div>
      {payingId&&<SubscriptionPaymentSheet ruleId={payingId} onClose={()=>setPayingId(null)}/>}
      <Sheet open={!!viewing} onClose={()=>setViewingId(null)} title="Recorded payments" description={viewing?.rule.description}>
       <div className="space-y-3 py-2"><p className="text-xs text-ink-secondary">{viewing?.possiblePayments.length?'Possible existing payments need review. Check these before adding another charge or changing a schedule.':'Payments recognised by their saved link or by a unique merchant, account, amount and scheduled date match.'}</p><TransactionList transactions={viewingRows} showTime showDayTotals={false}/></div>
      </Sheet>

      {monthlyTotal > 0 && (
        <div className="rounded-xl bg-surface-sunken p-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-ink-secondary">
              Committed every month
            </span>
            <Amount value={monthlyTotal} size="md" />
          </div>
          <p className="mt-1 text-[12px] text-ink-tertiary">
            {activeCount} active {pluralise(activeCount, "bill")}. Weekly and
            yearly charges are shown at their monthly equivalent.
          </p>
        </div>
      )}

      <Button size="sm" onClick={() => setCreating(true)}>
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        Add a bill
      </Button>

      <RecurringSheet
        rule={editing}
        open={Boolean(editing) || creating}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    </>
  );
}

/**
 * One bill.
 *
 * Deliberately not a `MoneyRow`: "Mark paid" is a second action on the same
 * line, and a button inside a button is invalid markup that breaks keyboard
 * navigation. So the row is a container with two real controls in it.
 *
 * "Mark paid" only appears on the month you are actually living in — offering
 * to record a June charge while browsing March would file it against the wrong
 * period without ever saying so.
 */
function RecurringRow({
  status,
  live,
  onEdit,
  onInspect,
  onPay,
  lastRecordedDate,
}: {
  status: RecurringStatus;
  live: boolean;
  onEdit: () => void;
  onInspect:()=>void;
  onPay:()=>void;
  lastRecordedDate?:string;
}) {
  const money = useMoneyText();
  const { rule, nextDate, daysUntil, paidThisMonth } = status;
  const drift = priceDrift(status);

  const sublabel = !rule.isActive
    ? "Paused"
    : status.overlappingRuleIds.length>0 ? 'Possible duplicate schedule — review'
    : status.possiblePayments.length>0 ? 'Possible payment already recorded'
    : paidThisMonth
      ? status.recognisedCount>0 ? "Existing payment recognised" : "Paid this month"
      : lastRecordedDate ? `Recorded ${formatDayMonth(new Date(lastRecordedDate))} · next scheduled ${formatDayMonth(nextDate)}`
      : status.paidCount>0 ? `${status.paidCount} of ${status.occurrenceCount} payments recorded`
      : daysUntil < 0
        ? `Overdue since ${formatDayMonth(nextDate)}`
        : daysUntil === 0
          ? "Due today"
          : daysUntil === 1
            ? "Due tomorrow"
            : `Due ${formatDayMonth(nextDate)}`;

  return (
    <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-surface-hover">
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block truncate text-[14.5px] font-medium text-ink">
          {rule.description}
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-ink-tertiary">
          {sublabel}
          {drift && ` · was ${money(drift.previous)} last time`}
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-3">
        {(status.paidCount>0||status.possiblePayments.length>0||lastRecordedDate)&&(
          <Button size="sm" variant="quiet" onClick={onInspect} aria-label="View recorded payments" className="h-11 px-2 text-[12px]">
            <Check className="h-3 w-3" strokeWidth={2.5} />
            {paidThisMonth?'Paid':lastRecordedDate?'Recorded':status.possiblePayments.length?'Review':'View'}
          </Button>
        )}
        {!paidThisMonth&&!status.possiblePayments.length&&live && rule.isActive ? (
          <Button
            size="sm"
            variant="quiet"
            onClick={onPay}
            className="h-11 px-2.5 text-[12px]"
          >
            Add / link
          </Button>
        ) : null}
        <Amount
          value={rule.amount}
          size="sm"
          className={!rule.isActive ? "text-ink-tertiary" : undefined}
        />
      </div>
    </div>
  );
}

function RecurringSheet({
  rule,
  open,
  onClose,
}: {
  rule: RecurringTransaction | null;
  open: boolean;
  onClose: () => void;
}) {
  const { db, categories } = useFinance();
  const toast = useToast();

  const [description, setDescription] = useState(rule?.description ?? "");
  const [amount, setAmount] = useState(rule ? String(rule.amount / 100) : "");
  const [frequency, setFrequency] = useState<RecurringFrequency>(
    rule?.frequency ?? "MONTHLY",
  );
  const [day, setDay] = useState(String(rule?.dayOfPeriod ?? 1));
  const [categoryId, setCategoryId] = useState(
    rule?.categoryId ?? "bills",
  );
  const [accountId, setAccountId] = useState(rule?.accountId);
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);
  const [pickingCategory, setPickingCategory] = useState(false);

  // Re-seed local state whenever a different bill is opened.
  const [lastId, setLastId] = useState(rule?.id);
  if (rule?.id !== lastId) {
    setLastId(rule?.id);
    setDescription(rule?.description ?? "");
    setAmount(rule ? String(rule.amount / 100) : "");
    setFrequency(rule?.frequency ?? "MONTHLY");
    setDay(String(rule?.dayOfPeriod ?? 1));
    setCategoryId(rule?.categoryId ?? "bills");
    setAccountId(rule?.accountId);
    setIsActive(rule?.isActive ?? true);
    setPickingCategory(false);
  }

  const value = parseAmountInput(amount) ?? 0;
  // A candidate opened from "Add as recurring" carries a full, non-null
  // `rule` (so the sheet prefills), but it isn't in the store yet — only a
  // rule that already exists in `db.recurring` is a real edit.
  const isPersisted = Boolean(rule && db?.recurring.some((r) => r.id === rule.id));

  async function handleSave() {
    if (!description.trim() || value <= 0) return;
    await saveRecurring({
      id: rule?.id ?? createId("rec"),
      description: description.trim(),
      amount: value,
      frequency,
      dayOfPeriod: clampPeriod(day, frequency),
      categoryId,
      accountId,
      type: "EXPENSE",
      merchant: rule?.merchant,
      isActive,
      createdAt: rule?.createdAt ?? new Date().toISOString(),
    });
    toast.show({ tone: "success", title: isPersisted ? "Bill updated" : "Bill added" });
    onClose();
  }

  async function handleDelete() {
    if (!rule) return;
    await deleteRecurring(rule.id);
    toast.show({
      tone: "info",
      title: "Bill removed",
      detail: "Charges already recorded were kept",
    });
    onClose();
  }

  if (pickingCategory) {
    return (
      <Sheet
        open={open}
        onClose={() => setPickingCategory(false)}
        title="Category"
        size="sm"
      >
        <CategoryPicker
          value={categoryId}
          onChange={(id) => {
            setCategoryId(id);
            setPickingCategory(false);
          }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={rule ? rule.description : "Add a bill"}
      description="Anything that charges you on a schedule — rent, mobile, subscriptions."
      size="sm"
      footer={
        <div className="flex gap-2">
          {isPersisted && (
            <Button variant="danger" onClick={handleDelete}>
              Delete
            </Button>
          )}
          <Button
            variant="primary"
            block
            onClick={handleSave}
            disabled={!description.trim() || value <= 0}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        <TextField
          label="What is it?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Netflix"
          data-autofocus
        />
        <MoneyField
          label="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="649"
        />
        <SelectField
          label="How often"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
        >
          {FREQUENCIES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>

        {frequency === "WEEKLY" ? (
          <SelectField
            label="Charged on"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          >
            {WEEKDAYS.map((label, index) => (
              <option key={label} value={index}>
                {label}
              </option>
            ))}
          </SelectField>
        ) : (
          <TextField
            label="Charged on day"
            type="number"
            min={1}
            max={31}
            value={day}
            onChange={(e) => setDay(e.target.value)}
            hint={
              frequency === "YEARLY"
                ? "In the same month you added it."
                : "Months that are too short fall back to the last day."
            }
          />
        )}

        <div className="space-y-1.5">
          <p className="text-[13px] font-medium text-ink-secondary">Category</p>
          <Button size="sm" onClick={() => setPickingCategory(true)}>
            {categories.pathOf(categoryId)}
          </Button>
        </div>

        <div className="space-y-1.5">
          <p className="text-[13px] font-medium text-ink-secondary">Paid from</p>
          <AccountPicker
            accounts={db?.accounts ?? []}
            value={accountId}
            onChange={setAccountId}
            allowNone
          />
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-surface-sunken p-3.5">
          <input
            type="checkbox"
            checked={!isActive}
            onChange={(e) => setIsActive(!e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
          />
          <span>
            <span className="block text-[13.5px] font-medium text-ink">
              Pause this bill
            </span>
            <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-tertiary">
              Stops it being held back from safe-to-spend, without losing the
              history.
            </span>
          </span>
        </label>
      </div>
    </Sheet>
  );
}

/** Weekly rules index days 0–6; monthly and yearly ones index 1–31. */
function clampPeriod(value: string, frequency: RecurringFrequency): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return frequency === "WEEKLY" ? 1 : 1;
  if (frequency === "WEEKLY") return Math.min(6, Math.max(0, parsed));
  return Math.min(31, Math.max(1, parsed));
}
