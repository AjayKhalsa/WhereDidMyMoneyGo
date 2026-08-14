"use client";

import { useState } from "react";
import { CreditCard as CreditCardIcon } from "lucide-react";
import { formatDayMonth } from "@/lib/domain/dates";
import { useMoneyText } from "@/lib/hooks/use-privacy";
import { parseAmountInput } from "@/lib/domain/money";
import type { CreditCardSummary } from "@/lib/engine/analytics";
import { payCreditCard } from "@/lib/data/actions";
import { useFinance } from "@/lib/hooks/use-finance";
import { Amount } from "@/components/ui/amount";
import { ProgressTrack } from "@/components/ui/charts";
import { MoneyField } from "@/components/ui/fields";
import { Button, Card, Chip } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { AccountPicker } from "@/components/pickers/pickers";
import { TransactionList } from "@/components/transactions/transaction-list";
import { cn } from "@/lib/utils";

/**
 * Credit card summary and payment (spec §17, §18).
 *
 * The copy here does real work. "You've already spent this money" is the
 * sentence that stops someone treating their bank balance as spendable when
 * a third of it belongs to the card.
 *
 * Paying the card records a TRANSFER. It reduces the outstanding balance and
 * changes nothing about this month's spending total, because every purchase
 * behind that balance was already counted the day it happened.
 */

export function CreditCardCard({
  summary,
  compact,
}: {
  summary: CreditCardSummary;
  compact?: boolean;
}) {
  const money = useMoneyText();
  const [detailOpen, setDetailOpen] = useState(false);
  const { daysUntilDue, outstanding, creditBalance, currentCycle, lastStatement, utilisation } =
    summary;

  // Tracks the *last statement* specifically, not the lifetime outstanding
  // figure — a card can carry old debt from a past statement while this
  // one's already settled, and vice versa.
  const owesOnLastStatement = daysUntilDue !== null && !lastStatement?.paidInFull;
  const overdue = owesOnLastStatement && daysUntilDue! < 0;
  const urgent = owesOnLastStatement && daysUntilDue! >= 0 && daysUntilDue! <= 5;

  return (
    <>
      <Card className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <CreditCardIcon
              className="h-4 w-4 text-ink-tertiary"
              strokeWidth={1.75}
            />
            <span className="text-[13px] font-medium text-ink-secondary">
              {summary.account.name}
            </span>
          </div>
          {owesOnLastStatement && (
            <Chip tone={overdue ? "danger" : urgent ? "warning" : "neutral"}>
              {overdue
                ? "Overdue"
                : daysUntilDue === 0
                  ? "Due today"
                  : `Due in ${daysUntilDue} ${daysUntilDue === 1 ? "day" : "days"}`}
            </Chip>
          )}
        </div>

        <div className="mt-3">
          <Amount
            value={creditBalance > 0 ? creditBalance : outstanding}
            size="xl"
            className={creditBalance > 0 ? "text-positive" : undefined}
          />
          <p className="mt-1 text-[13px] text-ink-secondary">
            {creditBalance > 0 ? "Credit" : "Outstanding"}
          </p>
        </div>

        {outstanding > 0 && (
          <p className="mt-2.5 text-[13px] leading-relaxed text-ink-secondary">
            You&rsquo;ve already spent this money — it just hasn&rsquo;t left
            your account yet.
          </p>
        )}

        {creditBalance > 0 && (
          <p className="mt-2.5 text-[13px] leading-relaxed text-ink-secondary">
            You&rsquo;ve paid more than you owe — this comes off what you charge
            next.
          </p>
        )}

        {!compact && utilisation !== null && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[12.5px] text-ink-secondary">
                Credit used
              </span>
              <span className="text-[12.5px] text-ink-tertiary tnum">
                {utilisation.toFixed(0)}%
              </span>
            </div>
            <ProgressTrack
              value={utilisation}
              tone={utilisation > 60 ? "warning" : "accent"}
              height="h-1"
            />
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3.5">
          <div>
            <p className="text-[12px] text-ink-tertiary">This cycle</p>
            <p className="text-[14px] font-medium text-ink tnum">
              {money(currentCycle.spent)}
            </p>
          </div>
          <Button size="sm" onClick={() => setDetailOpen(true)}>
            View card
          </Button>
        </div>
      </Card>

      <CreditCardDetailSheet
        summary={summary}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </>
  );
}

function CreditCardDetailSheet({
  summary,
  open,
  onClose,
}: {
  summary: CreditCardSummary;
  open: boolean;
  onClose: () => void;
}) {
  const money = useMoneyText();
  const { db } = useFinance();
  const toast = useToast();
  const [amountText, setAmountText] = useState("");
  const [fromAccountId, setFromAccountId] = useState<string | undefined>(
    () => db?.accounts.find((a) => a.type === "BANK")?.id,
  );
  const [paying, setPaying] = useState(false);

  // A card's activity belongs to its own statement cycle, not whichever
  // calendar month happens to be selected elsewhere in the app — someone
  // checking their card on the 2nd still wants to see the spending building
  // up to the statement due later this week, not last month's cleared one.
  const { start: cycleStart, end: cycleEnd } = summary.currentCycle;
  const cardRows = (db?.transactions ?? []).filter((t) => {
    if (t.accountId !== summary.account.id && t.toAccountId !== summary.account.id) {
      return false;
    }
    const date = new Date(t.date);
    return date >= cycleStart && date <= cycleEnd;
  });

  const amount = parseAmountInput(amountText) ?? 0;
  const canPay = amount > 0 && Boolean(fromAccountId) && !paying;

  async function handlePay() {
    if (!canPay || !fromAccountId) return;
    setPaying(true);
    try {
      await payCreditCard({
        cardAccountId: summary.account.id,
        fromAccountId,
        amount,
      });
      toast.show({
        tone: "success",
        title: `${money(amount)} paid`,
        detail: "Recorded as a transfer — not new spending",
      });
      setAmountText("");
      onClose();
    } catch (error) {
      toast.show({
        tone: "error",
        title: "Couldn't record that payment",
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPaying(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={summary.account.name}
      description={
        summary.detail
          ? `Statement on the ${ordinal(summary.detail.statementDay)}, due on the ${ordinal(summary.detail.dueDay)}`
          : undefined
      }
      size="lg"
    >
      <div className="space-y-6 py-1">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {summary.creditBalance > 0 ? (
            <Figure label="Credit" value={summary.creditBalance} emphasis tone="positive" />
          ) : (
            <Figure label="Outstanding" value={summary.outstanding} emphasis />
          )}
          <Figure label="Spent this cycle" value={summary.currentCycle.spent} />
          {summary.detail && (
            <Figure label="Credit limit" value={summary.detail.creditLimit} />
          )}
        </div>

        {summary.lastStatement && (
          <section className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[14px] font-medium text-ink">Last statement</h3>
              <span className="text-[12px] text-ink-tertiary tnum">
                {formatDayMonth(summary.lastStatement.start)} –{" "}
                {formatDayMonth(summary.lastStatement.end)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <Figure label="Statement amount" value={summary.lastStatement.spent} emphasis />
              <Figure
                label="Paid so far"
                value={Math.min(summary.lastStatement.paidAmount, summary.lastStatement.spent)}
                tone={summary.lastStatement.paidInFull ? "positive" : undefined}
              />
            </div>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-secondary">
              {summary.lastStatement.paidInFull
                ? `Paid in full — due ${formatDayMonth(summary.lastStatement.dueDate)}.`
                : `Due ${formatDayMonth(summary.lastStatement.dueDate)}.`}
            </p>
          </section>
        )}

        {summary.outstanding > 0 && (
          <section className="rounded-xl border border-line bg-surface p-4">
            <h3 className="text-[14px] font-medium text-ink">Pay this card</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-secondary">
              Recorded as a transfer between your accounts. Your spending total
              will not change — those purchases were counted when you made them.
            </p>

            <div className="mt-3.5 space-y-3">
              <MoneyField
                label="Amount"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder={String(Math.round(summary.outstanding / 100))}
              />
              <div className="space-y-1.5">
                <p className="text-[13px] font-medium text-ink-secondary">
                  Paying from
                </p>
                <AccountPicker
                  accounts={(db?.accounts ?? []).filter(
                    (a) => a.type === "BANK" || a.type === "CASH",
                  )}
                  value={fromAccountId}
                  onChange={setFromAccountId}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  onClick={handlePay}
                  disabled={!canPay}
                  className="flex-1"
                >
                  {paying ? "Recording…" : `Pay ${amount > 0 ? money(amount) : ""}`}
                </Button>
                <Button
                  onClick={() =>
                    setAmountText(String(Math.round(summary.outstanding / 100)))
                  }
                >
                  Pay full
                </Button>
              </div>
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-2 flex items-baseline justify-between gap-3 px-2.5">
            <span className="text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-tertiary">
              Activity this cycle
            </span>
            <span className="text-[12px] text-ink-tertiary tnum">
              {formatDayMonth(cycleStart)} – {formatDayMonth(cycleEnd)}
            </span>
          </h3>
          <TransactionList
            transactions={cardRows}
            showTime
            emptyTitle="Nothing on this card yet"
          />
        </section>
      </div>
    </Sheet>
  );
}

function Figure({
  label,
  value,
  emphasis,
  tone,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
  tone?: "positive";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[12.5px] text-ink-secondary">{label}</p>
      <div className="mt-1">
        <Amount
          value={value}
          size={emphasis ? "lg" : "md"}
          className={cn(
            tone === "positive" ? "text-positive" : !emphasis && "text-ink-secondary",
          )}
        />
      </div>
    </div>
  );
}

function ordinal(day: number): string {
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  return `${day}${suffix}`;
}
