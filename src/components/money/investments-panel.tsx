"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { formatMoney, parseAmountInput } from "@/lib/domain/money";
import type { Investment, InvestmentKind } from "@/lib/domain/types";
import {
  investmentContributions,
  investmentRate,
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
 * V1 tracks contributions, not portfolio value. That is a deliberate scope
 * decision: "how much am I actually putting away each month?" is answerable
 * from your own data and useful immediately, whereas live valuations need
 * price feeds and would make the number less trustworthy, not more.
 *
 * `Investment.currentValue` exists in the model as the hook for V2.
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
  const { db, month, totals } = useFinance();
  const [editing, setEditing] = useState<Investment | null>(null);
  const [creating, setCreating] = useState(false);
  const [contributing, setContributing] = useState<Investment | null>(null);

  const breakdown = investmentContributions(
    db?.investments ?? [],
    db?.transactions ?? [],
    month,
  );

  const rate = investmentRate(totals);

  return (
    <>
      <div className="-mx-3">
        {breakdown.map(({ investment, contributed, planned }) => {
          const shortfall = planned - contributed;
          return (
            <MoneyRow
              key={investment.id}
              label={investment.name}
              sublabel={
                planned > 0
                  ? shortfall > 0
                    ? `${formatMoney(shortfall)} still due this month`
                    : `Plan met · ${formatMoney(planned)}/month`
                  : "No monthly plan set"
              }
              onClick={() => setEditing(investment)}
              value={<Amount value={contributed} size="sm" />}
            />
          );
        })}
      </div>

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

  const [lastId, setLastId] = useState(investment?.id);
  if (investment?.id !== lastId) {
    setLastId(investment?.id);
    setName(investment?.name ?? "");
    setKind(investment?.kind ?? "MUTUAL_FUND");
    setMonthly(investment ? String(investment.monthlyContribution / 100) : "");
  }

  async function handleSave() {
    if (!name.trim()) return;
    await saveInvestment({
      id: investment?.id ?? createId("inv"),
      name: name.trim(),
      kind,
      monthlyContribution: parseAmountInput(monthly) ?? 0,
      isActive: true,
      createdAt: investment?.createdAt ?? new Date().toISOString(),
      currentValue: investment?.currentValue,
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
      </div>
    </Sheet>
  );
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
