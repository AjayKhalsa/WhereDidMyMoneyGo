"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { formatMoney, parseAmountInput } from "@/lib/domain/money";
import type { Account, AccountType } from "@/lib/domain/types";
import { accountBalance, creditCardOutstanding } from "@/lib/engine/analytics";
import { deleteAccount, saveAccount, saveCreditCardDetail } from "@/lib/data/actions";
import { useFinance } from "@/lib/hooks/use-finance";
import { Amount } from "@/components/ui/amount";
import { MoneyField, SelectField, TextField } from "@/components/ui/fields";
import { Button, Chip } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { createId } from "@/lib/utils";
import { MoneyRow } from "./disclosure-panel";

/**
 * Accounts (spec §16).
 *
 * Bank and cash accounts show a balance. Credit cards deliberately do not —
 * a card has an *outstanding*, and displaying a negative balance next to a
 * positive one invites exactly the mental accounting error this app exists to
 * prevent.
 */

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "BANK", label: "Bank account" },
  { value: "CASH", label: "Cash" },
  { value: "CREDIT_CARD", label: "Credit card" },
];

export function AccountsPanel() {
  const { db } = useFinance();
  const [editing, setEditing] = useState<Account | null>(null);
  const [creating, setCreating] = useState(false);

  const accounts = db?.accounts ?? [];
  const transactions = db?.transactions ?? [];

  return (
    <>
      <div className="-mx-3">
        {accounts.map((account) => {
          const isCard = account.type === "CREDIT_CARD";
          const value = isCard
            ? creditCardOutstanding(transactions, account.id)
            : accountBalance(account, transactions);

          return (
            <MoneyRow
              key={account.id}
              label={account.name}
              sublabel={
                isCard
                  ? "Outstanding"
                  : account.hint
                    ? `•••• ${account.hint}`
                    : undefined
              }
              onClick={() => setEditing(account)}
              meta={
                isCard ? <Chip tone="warning">Card</Chip> : undefined
              }
              value={
                <Amount
                  value={value}
                  size="sm"
                  signed
                  className={isCard && value > 0 ? "text-warning" : undefined}
                />
              }
            />
          );
        })}
      </div>

      <Button size="sm" onClick={() => setCreating(true)}>
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        Add account
      </Button>

      <AccountSheet
        account={editing}
        open={Boolean(editing) || creating}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    </>
  );
}

function AccountSheet({
  account,
  open,
  onClose,
}: {
  account: Account | null;
  open: boolean;
  onClose: () => void;
}) {
  const { db } = useFinance();
  const toast = useToast();
  const detail = db?.creditCards.find((c) => c.accountId === account?.id);

  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "BANK");
  const [balance, setBalance] = useState(
    account ? String(account.openingBalance / 100) : "",
  );
  const [hint, setHint] = useState(account?.hint ?? "");
  const [limit, setLimit] = useState(
    detail ? String(detail.creditLimit / 100) : "",
  );
  const [statementDay, setStatementDay] = useState(
    String(detail?.statementDay ?? 20),
  );
  const [dueDay, setDueDay] = useState(String(detail?.dueDay ?? 15));

  // Re-seed local state whenever a different account is opened.
  const [lastId, setLastId] = useState(account?.id);
  if (account?.id !== lastId) {
    setLastId(account?.id);
    setName(account?.name ?? "");
    setType(account?.type ?? "BANK");
    setBalance(account ? String(account.openingBalance / 100) : "");
    setHint(account?.hint ?? "");
    setLimit(detail ? String(detail.creditLimit / 100) : "");
    setStatementDay(String(detail?.statementDay ?? 20));
    setDueDay(String(detail?.dueDay ?? 15));
  }

  async function handleSave() {
    if (!name.trim()) return;
    const id = account?.id ?? createId("acc");
    await saveAccount({
      id,
      name: name.trim(),
      type,
      openingBalance: parseAmountInput(balance) ?? 0,
      isActive: account?.isActive ?? true,
      hint: hint.trim() || undefined,
      createdAt: account?.createdAt ?? new Date().toISOString(),
    });

    if (type === "CREDIT_CARD") {
      await saveCreditCardDetail({
        id: detail?.id ?? createId("cc"),
        accountId: id,
        statementDay: clampDay(statementDay, 20),
        dueDay: clampDay(dueDay, 15),
        creditLimit: parseAmountInput(limit) ?? 0,
      });
    }

    toast.show({ tone: "success", title: account ? "Account updated" : "Account added" });
    onClose();
  }

  async function handleDelete() {
    if (!account) return;
    await deleteAccount(account.id);
    toast.show({
      tone: "info",
      title: "Account removed",
      detail: "Its transactions were kept and simply unlinked",
    });
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={account ? account.name : "New account"}
      size="sm"
      footer={
        <div className="flex gap-2">
          {account && (
            <Button variant="danger" onClick={handleDelete}>
              Delete
            </Button>
          )}
          <Button variant="primary" block onClick={handleSave} disabled={!name.trim()}>
            {account ? "Save changes" : "Add account"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        <TextField
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="HDFC Bank"
          data-autofocus
        />
        <SelectField
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as AccountType)}
        >
          {ACCOUNT_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>

        {type !== "CREDIT_CARD" && (
          <MoneyField
            label="Opening balance"
            hint="Where this account started. Transactions adjust it from there."
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
        )}

        <TextField
          label="Last 4 digits"
          hint="Optional, just to tell accounts apart."
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          maxLength={4}
        />

        {type === "CREDIT_CARD" && (
          <>
            <MoneyField
              label="Credit limit"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Statement day"
                type="number"
                min={1}
                max={28}
                value={statementDay}
                onChange={(e) => setStatementDay(e.target.value)}
              />
              <TextField
                label="Due day"
                type="number"
                min={1}
                max={28}
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />
            </div>
            <p className="text-[12.5px] leading-relaxed text-ink-tertiary">
              The outstanding balance is worked out from your transactions, not
              entered by hand. Paying the card records a transfer — it never
              adds to your spending.
            </p>
          </>
        )}

        {account && account.type !== "CREDIT_CARD" && (
          <p className="text-[12.5px] text-ink-tertiary">
            Current balance:{" "}
            <span className="font-medium text-ink-secondary tnum">
              {formatMoney(
                accountBalance(account, db?.transactions ?? []),
              )}
            </span>
          </p>
        )}
      </div>
    </Sheet>
  );
}

function clampDay(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(28, Math.max(1, Math.round(parsed)));
}
