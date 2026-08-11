"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { daysBetween } from "@/lib/domain/dates";
import { formatMoney, parseAmountInput } from "@/lib/domain/money";
import type { Investment, InvestmentKind } from "@/lib/domain/types";
import {
  investmentContributions,
  investmentRate,
  portfolioValue,
  valueInvestments,
} from "@/lib/engine/analytics";
import {
  addInvestmentContribution,
  deleteInvestment,
  saveInvestment,
} from "@/lib/data/actions";
import { useFinance } from "@/lib/hooks/use-finance";
import { Amount } from "@/components/ui/amount";
import { ProgressTrack } from "@/components/ui/charts";
import { MoneyField, SelectField, TextField } from "@/components/ui/fields";
import { Button, Chip } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { AccountPicker } from "@/components/pickers/pickers";
import { createId } from "@/lib/utils";
import { MoneyRow } from "./disclosure-panel";

/**
 * Investments (spec §20).
 *
 * Contributions come from your own transactions and are always exact. Value
 * cannot be — there is no price feed — so it is whatever you last typed in,
 * shown with how long ago that was. Gain is never entered, only derived
 * (`value − contributed`), so the two can't drift apart, and an investment
 * you've never valued simply reports its contributions.
 */

const KINDS: { value: InvestmentKind; label: string }[] = [
  { value: "MUTUAL_FUND", label: "Mutual fund" },
  { value: "PPF", label: "PPF" },
  { value: "FD", label: "Fixed deposit" },
  { value: "STOCKS", label: "Stocks" },
  { value: "NPS", label: "NPS" },
  { value: "GOLD", label: "Gold" },
  { value: "OTHER", label: "Other" },
];

export function InvestmentsPanel() {
  const { db, month, cycleStartDay, totals, now } = useFinance();
  const [editing, setEditing] = useState<Investment | null>(null);
  const [creating, setCreating] = useState(false);
  const [contributing, setContributing] = useState<Investment | null>(null);

  const breakdown = investmentContributions(
    db?.investments ?? [],
    db?.transactions ?? [],
    month,
    cycleStartDay,
  );
  const valuations = valueInvestments(
    db?.investments ?? [],
    db?.transactions ?? [],
    now,
  );
  const portfolio = portfolioValue(
    db?.investments ?? [],
    db?.transactions ?? [],
    now,
  );
  const totalContributed = valuations
    .filter((v) => v.investment.isActive)
    .reduce((acc, v) => acc + v.contributed, 0);
  const totalGain = portfolio - totalContributed;

  const rate = investmentRate(totals);

  return (
    <>
      <div className="-mx-3">
        {breakdown.map(({ investment, planned }) => {
          const valuation = valuations.find(
            (v) => v.investment.id === investment.id,
          );
          const contributed = valuation?.contributed ?? 0;
          const gain = valuation?.gain ?? 0;
          const valued = valuation?.valuedAt !== null;
          return (
            <MoneyRow
              key={investment.id}
              label={investment.name}
              sublabel={
                valued
                  ? `${formatMoney(contributed)} in · ${gain >= 0 ? "+" : "−"}${formatMoney(Math.abs(gain))} ${gain >= 0 ? "gain" : "loss"}`
                  : planned > 0
                    ? `${formatMoney(planned)}/month planned · value not set`
                    : "Value not set"
              }
              onClick={() => setEditing(investment)}
              value={
                <Amount
                  value={valuation?.value ?? contributed}
                  size="sm"
                  className={
                    valued && gain > 0
                      ? "text-positive"
                      : valued && gain < 0
                        ? "text-warning"
                        : undefined
                  }
                />
              }
            />
          );
        })}
      </div>

      {portfolio > 0 && (
        <div className="rounded-xl bg-surface-sunken p-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-ink-secondary">
              Portfolio value
            </span>
            <Amount value={portfolio} size="md" />
          </div>
          <p className="mt-1.5 text-[12.5px] text-ink-tertiary">
            {formatMoney(totalContributed)} contributed
            {totalGain !== 0 && (
              <>
                {" "}· {totalGain > 0 ? "up" : "down"}{" "}
                {formatMoney(Math.abs(totalGain))}
              </>
            )}
            . Anything you haven&rsquo;t valued counts at what you put in.
          </p>
        </div>
      )}

      {totals.invested > 0 && (
        <div className="rounded-xl bg-surface-sunken p-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-ink-secondary">
              Invested this month
            </span>
            <Amount value={totals.invested} size="md" />
          </div>
          {totals.income > 0 && (
            <>
              <div className="mt-2.5">
                <ProgressTrack
                  value={Math.min(100, (rate / 40) * 100)}
                  tone={rate >= 20 ? "positive" : "accent"}
                  height="h-1"
                />
              </div>
              <p className="mt-1.5 text-[12.5px] text-ink-tertiary">
                {rate.toFixed(1)}% of income
                {rate >= 20
                  ? " — comfortably above the 20% most people aim for."
                  : " — 20% is a common target."}
              </p>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          Add investment
        </Button>
        {breakdown.length > 0 && (
          <Button
            size="sm"
            onClick={() => setContributing(breakdown[0]!.investment)}
          >
            Record a contribution
          </Button>
        )}
      </div>

      <p className="text-[12.5px] leading-relaxed text-ink-tertiary">
        Money moved into investments is never counted as spending — it&rsquo;s
        still yours, just somewhere else.
      </p>

      <InvestmentSheet
        investment={editing}
        open={Boolean(editing) || creating}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
      <ContributionSheet
        investment={contributing}
        onClose={() => setContributing(null)}
      />
    </>
  );
}

function InvestmentSheet({
  investment,
  open,
  onClose,
}: {
  investment: Investment | null;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(investment?.name ?? "");
  const [kind, setKind] = useState<InvestmentKind>(
    investment?.kind ?? "MUTUAL_FUND",
  );
  const [monthly, setMonthly] = useState(
    investment ? String(investment.monthlyContribution / 100) : "",
  );
  const [worth, setWorth] = useState(
    investment?.currentValue !== undefined
      ? String(investment.currentValue / 100)
      : "",
  );

  const [lastId, setLastId] = useState(investment?.id);
  if (investment?.id !== lastId) {
    setLastId(investment?.id);
    setName(investment?.name ?? "");
    setKind(investment?.kind ?? "MUTUAL_FUND");
    setMonthly(investment ? String(investment.monthlyContribution / 100) : "");
    setWorth(
      investment?.currentValue !== undefined
        ? String(investment.currentValue / 100)
        : "",
    );
  }

  // Only re-stamp `valuedAt` when the figure actually changed — otherwise
  // saving an unrelated edit (a rename) would silently make a months-old
  // valuation look freshly checked.
  const enteredWorth = parseAmountInput(worth);
  const worthChanged = enteredWorth !== null && enteredWorth !== investment?.currentValue;

  async function handleSave() {
    if (!name.trim()) return;
    await saveInvestment({
      id: investment?.id ?? createId("inv"),
      name: name.trim(),
      kind,
      monthlyContribution: parseAmountInput(monthly) ?? 0,
      isActive: true,
      createdAt: investment?.createdAt ?? new Date().toISOString(),
      currentValue: enteredWorth ?? investment?.currentValue,
      valuedAt: worthChanged
        ? new Date().toISOString()
        : investment?.valuedAt,
    });
    toast.show({ tone: "success", title: "Investment saved" });
    onClose();
  }

  async function handleDelete() {
    if (!investment) return;
    await deleteInvestment(investment.id);
    toast.show({ tone: "info", title: "Investment removed" });
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={investment ? investment.name : "Add investment"}
      size="sm"
      footer={
        <div className="flex gap-2">
          {investment && (
            <Button variant="danger" onClick={handleDelete}>
              Delete
            </Button>
          )}
          <Button variant="primary" block onClick={handleSave} disabled={!name.trim()}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        <TextField
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mutual Funds"
          data-autofocus
        />
        <SelectField
          label="Type"
          value={kind}
          onChange={(e) => setKind(e.target.value as InvestmentKind)}
        >
          {KINDS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <MoneyField
          label="Planned monthly contribution"
          hint="Held back from safe-to-spend until it's actually paid."
          value={monthly}
          onChange={(e) => setMonthly(e.target.value)}
          placeholder="30000"
        />
        <MoneyField
          label="What's it worth now?"
          hint={valuedHint(investment)}
          value={worth}
          onChange={(e) => setWorth(e.target.value)}
          placeholder="Leave blank to count it at what you put in"
        />
      </div>
    </Sheet>
  );
}

/** Explains how stale the stored valuation is, in plain words. */
function valuedHint(investment: Investment | null): string {
  if (!investment?.valuedAt) {
    return "Optional. Update it whenever you check — contributions you log after today are added on top automatically.";
  }
  const days = daysBetween(new Date(investment.valuedAt), new Date());
  const when =
    days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  return `Last valued ${when}. Contributions since then are already counted on top.`;
}

function ContributionSheet({
  investment,
  onClose,
}: {
  investment: Investment | null;
  onClose: () => void;
}) {
  const { db } = useFinance();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [selected, setSelected] = useState<string | undefined>(investment?.id);
  const [fromAccountId, setFromAccountId] = useState<string | undefined>(
    () => db?.accounts.find((a) => a.type === "BANK")?.id,
  );

  const [lastId, setLastId] = useState(investment?.id);
  if (investment?.id !== lastId) {
    setLastId(investment?.id);
    setSelected(investment?.id);
    setAmount(
      investment?.monthlyContribution
        ? String(investment.monthlyContribution / 100)
        : "",
    );
  }

  const value = parseAmountInput(amount) ?? 0;
  const investments = (db?.investments ?? []).filter((i) => i.isActive);

  async function handleSave() {
    if (value <= 0 || !selected) return;
    await addInvestmentContribution({
      investmentId: selected,
      amount: value,
      fromAccountId,
    });
    toast.show({
      tone: "success",
      title: `${formatMoney(value)} invested`,
      detail: "Not counted as spending",
    });
    onClose();
  }

  return (
    <Sheet
      open={Boolean(investment)}
      onClose={onClose}
      title="Record a contribution"
      size="sm"
      footer={
        <Button
          variant="primary"
          block
          onClick={handleSave}
          disabled={value <= 0 || !selected}
        >
          Save {value > 0 ? formatMoney(value) : ""}
        </Button>
      }
    >
      <div className="space-y-4 py-1">
        <MoneyField
          label="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          data-autofocus
        />
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium text-ink-secondary">Into</p>
          <div className="flex flex-wrap gap-1.5">
            {investments.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelected(option.id)}
                className="focus:outline-none"
              >
                <Chip tone={selected === option.id ? "accent" : "neutral"}>
                  {option.name}
                </Chip>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium text-ink-secondary">From</p>
          <AccountPicker
            accounts={(db?.accounts ?? []).filter(
              (a) => a.type === "BANK" || a.type === "CASH",
            )}
            value={fromAccountId}
            onChange={setFromAccountId}
          />
        </div>
      </div>
    </Sheet>
  );
}
