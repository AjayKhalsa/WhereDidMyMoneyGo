"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { formatMonthShort, previousMonths } from "@/lib/domain/dates";
import { formatMoney, parseAmountInput } from "@/lib/domain/money";
import type { IncomeSource } from "@/lib/domain/types";
import { monthTotals } from "@/lib/engine/analytics";
import {
  addIncome,
  deleteIncomeSource,
  saveIncomeSource,
} from "@/lib/data/actions";
import { expectedMonthlyIncome } from "@/lib/engine/safe-to-spend";
import { useFinance } from "@/lib/hooks/use-finance";
import { Amount } from "@/components/ui/amount";
import { MoneyField, TextField } from "@/components/ui/fields";
import { Button, Chip, Divider } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { AccountPicker } from "@/components/pickers/pickers";
import { createId } from "@/lib/utils";
import { MoneyRow } from "./disclosure-panel";

/**
 * Income (spec §19).
 *
 * Salary is modelled as a standing arrangement rather than a transaction you
 * have to remember to log — it recurs, and it has deductions that never reach
 * your account. Showing gross, deductions and net separately is what makes
 * "available income" an honest number rather than an optimistic one.
 */

export function IncomePanel() {
  const { db, month } = useFinance();
  const [editing, setEditing] = useState<IncomeSource | null>(null);
  const [creating, setCreating] = useState(false);
  const [oneOff, setOneOff] = useState(false);

  const sources = db?.incomeSources ?? [];
  const transactions = db?.transactions ?? [];
  const recurring = sources.filter((s) => s.recurring);

  const history = [...previousMonths(month, 5), month].map((m) => ({
    key: m,
    amount: monthTotals(transactions, m).income,
  }));

  return (
    <>
      <div className="-mx-3">
        {recurring.map((source) => (
          <MoneyRow
            key={source.id}
            label={source.name}
            sublabel={`Recurring monthly${source.deductions > 0 ? ` · ${formatMoney(source.deductions)} deducted` : ""}`}
            onClick={() => setEditing(source)}
            value={<Amount value={source.amount} size="sm" />}
          />
        ))}
      </div>

      {recurring.length > 0 && (
        <div className="rounded-xl bg-surface-sunken p-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-ink-secondary">
              Available each month
            </span>
            <Amount value={expectedMonthlyIncome(sources)} size="md" />
          </div>
          <p className="mt-1 text-[12px] text-ink-tertiary">
            After deductions. This is what safe-to-spend plans against.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          Add income source
        </Button>
        <Button size="sm" onClick={() => setOneOff(true)}>
          Record a one-off
        </Button>
      </div>

      {history.some((h) => h.amount > 0) && (
        <>
          <Divider />
          <div>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-tertiary">
              Recent months
            </p>
            <ul className="space-y-1.5">
              {history
                .slice()
                .reverse()
                .map((entry) => (
                  <li
                    key={entry.key}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="text-[13.5px] text-ink-secondary">
                      {formatMonthShort(entry.key)}
                    </span>
                    <span className="text-[13.5px] font-medium text-ink tnum">
                      {formatMoney(entry.amount)}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        </>
      )}

      <IncomeSourceSheet
        source={editing}
        open={Boolean(editing) || creating}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
      <OneOffIncomeSheet open={oneOff} onClose={() => setOneOff(false)} />
    </>
  );
}

function IncomeSourceSheet({
  source,
  open,
  onClose,
}: {
  source: IncomeSource | null;
  open: boolean;
  onClose: () => void;
}) {
  const { db } = useFinance();
  const toast = useToast();

  const [name, setName] = useState(source?.name ?? "Salary");
  const [amount, setAmount] = useState(
    source ? String(source.amount / 100) : "",
  );
  const [deductions, setDeductions] = useState(
    source?.deductions ? String(source.deductions / 100) : "",
  );
  const [day, setDay] = useState(String(source?.dayOfMonth ?? 1));
  const [accountId, setAccountId] = useState(source?.accountId);

  const [lastId, setLastId] = useState(source?.id);
  if (source?.id !== lastId) {
    setLastId(source?.id);
    setName(source?.name ?? "Salary");
    setAmount(source ? String(source.amount / 100) : "");
    setDeductions(source?.deductions ? String(source.deductions / 100) : "");
    setDay(String(source?.dayOfMonth ?? 1));
    setAccountId(source?.accountId);
  }

  const gross = parseAmountInput(amount) ?? 0;
  const cut = parseAmountInput(deductions) ?? 0;

  async function handleSave() {
    if (gross <= 0) return;
    await saveIncomeSource({
      id: source?.id ?? createId("inc"),
      name: name.trim() || "Income",
      amount: gross,
      recurring: true,
      dayOfMonth: Math.min(28, Math.max(1, Number(day) || 1)),
      deductions: cut,
      accountId,
      isActive: true,
      createdAt: source?.createdAt ?? new Date().toISOString(),
    });
    toast.show({ tone: "success", title: "Income saved" });
    onClose();
  }

  async function handleDelete() {
    if (!source) return;
    await deleteIncomeSource(source.id);
    toast.show({ tone: "info", title: "Income source removed" });
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={source ? source.name : "Add income source"}
      size="sm"
      footer={
        <div className="flex gap-2">
          {source && (
            <Button variant="danger" onClick={handleDelete}>
              Delete
            </Button>
          )}
          <Button variant="primary" block onClick={handleSave} disabled={gross <= 0}>
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
          data-autofocus
        />
        <MoneyField
          label="Gross monthly amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="155000"
        />
        <MoneyField
          label="Deductions"
          hint="Tax, PF, anything taken before it reaches you."
          value={deductions}
          onChange={(e) => setDeductions(e.target.value)}
          placeholder="0"
        />
        <TextField
          label="Paid on day"
          type="number"
          min={1}
          max={28}
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium text-ink-secondary">Paid into</p>
          <AccountPicker
            accounts={(db?.accounts ?? []).filter((a) => a.type !== "CREDIT_CARD")}
            value={accountId}
            onChange={setAccountId}
            allowNone
          />
        </div>

        {gross > 0 && (
          <div className="rounded-xl bg-surface-sunken p-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-ink-secondary">
                Reaches your account
              </span>
              <Amount value={Math.max(0, gross - cut)} size="md" />
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

const ONE_OFF_KINDS = ["Bonus", "Freelance", "Refund", "Gift", "Other"];

function OneOffIncomeSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { db } = useFinance();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("Bonus");
  const [accountId, setAccountId] = useState<string | undefined>(
    () => db?.accounts.find((a) => a.type === "BANK")?.id,
  );

  const value = parseAmountInput(amount) ?? 0;

  async function handleSave() {
    if (value <= 0) return;
    await addIncome({ amount: value, description: label, accountId });
    toast.show({
      tone: "success",
      title: `${formatMoney(value)} recorded`,
      detail: label,
    });
    setAmount("");
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Record income"
      description="A bonus, refund or anything else that isn't your salary"
      size="sm"
      footer={
        <Button variant="primary" block onClick={handleSave} disabled={value <= 0}>
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
          <p className="text-[13px] font-medium text-ink-secondary">What was it?</p>
          <div className="flex flex-wrap gap-1.5">
            {ONE_OFF_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setLabel(kind)}
                className="focus:outline-none"
              >
                <Chip tone={label === kind ? "accent" : "neutral"}>{kind}</Chip>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium text-ink-secondary">Paid into</p>
          <AccountPicker
            accounts={(db?.accounts ?? []).filter((a) => a.type !== "CREDIT_CARD")}
            value={accountId}
            onChange={setAccountId}
          />
        </div>
      </div>
    </Sheet>
  );
}
