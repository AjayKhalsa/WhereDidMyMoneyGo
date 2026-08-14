"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { formatFullDate } from "@/lib/domain/dates";
import { useMoneyText } from "@/lib/hooks/use-privacy";
import { parseAmountInput } from "@/lib/domain/money";
import type { Account, AccountType } from "@/lib/domain/types";
import {
  accountBalance,
  creditCardCreditBalance,
  creditCardOutstanding,
} from "@/lib/engine/analytics";
import {
  deleteAccount,
  recordBalanceAdjustment,
  recordCardStartingBalance,
  saveAccount,
  saveCreditCardDetail,
} from "@/lib/data/actions";
import { useFinance } from "@/lib/hooks/use-finance";
import { Amount } from "@/components/ui/amount";
import { MoneyField, SelectField, TextField } from "@/components/ui/fields";
import { Button, Chip, SelectableChip } from "@/components/ui/primitives";
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
  // Bumped on every "Add account" click so AccountSheet remounts with fresh
  // state — its own lastId tracking only catches switching between two
  // *existing* accounts, not two consecutive new-account sessions (both
  // have account?.id === undefined), which let fields like isDefault leak
  // from one new account into the next.
  const [creationNonce, setCreationNonce] = useState(0);

  const accounts = db?.accounts ?? [];
  const transactions = db?.transactions ?? [];

  return (
    <>
      <div className="-mx-3">
        {accounts.map((account) => {
          const isCard = account.type === "CREDIT_CARD";
          const creditBalance = isCard
            ? creditCardCreditBalance(transactions, account.id)
            : 0;
          const value = isCard
            ? creditBalance > 0
              ? creditBalance
              : creditCardOutstanding(transactions, account.id)
            : accountBalance(account, transactions);

          return (
            <MoneyRow
              key={account.id}
              label={account.name}
              sublabel={
                isCard
                  ? creditBalance > 0
                    ? "Credit"
                    : "Outstanding"
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
                  className={
                    isCard && creditBalance > 0
                      ? "text-positive"
                      : isCard && value > 0
                        ? "text-warning"
                        : undefined
                  }
                />
              }
            />
          );
        })}
      </div>

      <Button
        size="sm"
        onClick={() => {
          setCreationNonce((n) => n + 1);
          setCreating(true);
        }}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        Add account
      </Button>

      <AccountSheet
        key={editing ? editing.id : `new-${creationNonce}`}
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
  const money = useMoneyText();
  const { db } = useFinance();
  const toast = useToast();
  const detail = db?.creditCards.find((c) => c.accountId === account?.id);

  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "BANK");
  const [balance, setBalance] = useState(
    account ? String(account.openingBalance / 100) : "",
  );
  const [hint, setHint] = useState(account?.hint ?? "");
  const [isDefault, setIsDefault] = useState(account?.isDefault ?? false);
  const [limit, setLimit] = useState(
    detail ? String(detail.creditLimit / 100) : "",
  );
  const [statementDay, setStatementDay] = useState(
    String(detail?.statementDay ?? 20),
  );
  const [dueDay, setDueDay] = useState(String(detail?.dueDay ?? 15));
  const [reconciling, setReconciling] = useState(false);
  const [actualBalanceText, setActualBalanceText] = useState("");

  // Re-seed local state whenever a different account is opened.
  const [lastId, setLastId] = useState(account?.id);
  if (account?.id !== lastId) {
    setLastId(account?.id);
    setName(account?.name ?? "");
    setType(account?.type ?? "BANK");
    setBalance(account ? String(account.openingBalance / 100) : "");
    setHint(account?.hint ?? "");
    setIsDefault(account?.isDefault ?? false);
    setLimit(detail ? String(detail.creditLimit / 100) : "");
    setStatementDay(String(detail?.statementDay ?? 20));
    setDueDay(String(detail?.dueDay ?? 15));
    setReconciling(false);
    setActualBalanceText("");
  }

  // Looked up live (not just the `account` prop) so "Last reconciled" and
  // the balance figure stay fresh immediately after recording an
  // adjustment, without needing to close and reopen the sheet.
  const liveAccount = db?.accounts.find((a) => a.id === account?.id) ?? account;
  const isCardAccount = liveAccount?.type === "CREDIT_CARD";
  // A card has no openingBalance — its outstanding is entirely derived from
  // charge/payment transactions — so "what the app currently thinks" means
  // creditCardOutstanding here, not accountBalance (which doesn't net card
  // payments correctly; see its own doc comment).
  const expectedBalance = liveAccount
    ? isCardAccount
      ? creditCardOutstanding(db?.transactions ?? [], liveAccount.id)
      : accountBalance(liveAccount, db?.transactions ?? [])
    : 0;
  const actualBalance = parseAmountInput(actualBalanceText);
  const difference =
    actualBalance !== null ? actualBalance - expectedBalance : null;

  async function handleMarkReconciled() {
    if (!liveAccount) return;
    await saveAccount({
      ...liveAccount,
      lastReconciledAt: new Date().toISOString(),
    });
    toast.show({ tone: "success", title: "Account reconciled" });
    setReconciling(false);
    setActualBalanceText("");
  }

  async function handleRecordAdjustment() {
    if (!liveAccount || difference === null || difference === 0) return;
    if (isCardAccount) {
      await recordCardStartingBalance({
        cardAccountId: liveAccount.id,
        difference,
      });
    } else {
      await recordBalanceAdjustment({
        accountId: liveAccount.id,
        difference,
      });
    }
    toast.show({
      tone: "success",
      title: `${difference > 0 ? "+" : "−"}${money(Math.abs(difference))} recorded`,
      detail: isCardAccount ? "Starting balance" : "Balance adjustment",
    });
    setReconciling(false);
    setActualBalanceText("");
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
      isDefault,
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

        <div className="space-y-1.5">
          <p className="text-[13px] font-medium text-ink-secondary">
            Default for new expenses
          </p>
          <SelectableChip selected={isDefault} onClick={() => setIsDefault((v) => !v)}>
            {isDefault ? "Pre-selected as “Paid with”" : "Not the default"}
          </SelectableChip>
          <p className="text-[12.5px] text-ink-tertiary">
            Only one account can be the default — setting this one clears it
            from any other account.
          </p>
        </div>

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

        {liveAccount &&
          (liveAccount.type === "BANK" ||
            liveAccount.type === "CASH" ||
            liveAccount.type === "CREDIT_CARD") && (
          <div className="space-y-3 rounded-xl bg-surface-sunken p-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[12.5px] text-ink-secondary">
                {isCardAccount ? "Current outstanding" : "Current balance"}
              </p>
              <span className="font-medium text-ink-secondary tnum text-[13px]">
                {money(expectedBalance)}
              </span>
            </div>
            <p className="text-[12px] text-ink-tertiary">
              {liveAccount.lastReconciledAt
                ? `Last reconciled ${formatFullDate(liveAccount.lastReconciledAt)}`
                : isCardAccount
                  ? "Never reconciled against the real card"
                  : "Never reconciled against the real account"}
            </p>

            {!reconciling ? (
              <Button size="sm" onClick={() => setReconciling(true)}>
                Reconcile
              </Button>
            ) : (
              <div className="space-y-2.5 border-t border-line pt-3">
                <MoneyField
                  label={isCardAccount ? "Actual outstanding" : "Actual balance"}
                  hint={
                    isCardAccount
                      ? "What your card's app or last statement says you currently owe — including any debt from before you started tracking it here."
                      : "What your bank or wallet actually shows right now."
                  }
                  value={actualBalanceText}
                  onChange={(e) => setActualBalanceText(e.target.value)}
                  data-autofocus
                />
                {actualBalance !== null && (
                  <p className="text-[12.5px] text-ink-secondary">
                    {difference === 0
                      ? "Matches — nothing to record."
                      : `Difference: ${difference! > 0 ? "+" : "−"}${money(Math.abs(difference!))}`}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="quiet"
                    onClick={() => {
                      setReconciling(false);
                      setActualBalanceText("");
                    }}
                  >
                    Cancel
                  </Button>
                  {actualBalance !== null && difference === 0 && (
                    <Button size="sm" variant="primary" onClick={handleMarkReconciled}>
                      Mark reconciled
                    </Button>
                  )}
                  {actualBalance !== null && difference !== 0 && (
                    <Button size="sm" variant="primary" onClick={handleRecordAdjustment}>
                      Record {difference! > 0 ? "+" : "−"}
                      {money(Math.abs(difference!))}
                    </Button>
                  )}
                </div>
                {actualBalance !== null && difference !== 0 && (
                  <p className="text-[12px] leading-relaxed text-ink-tertiary">
                    If you know which transaction is missing, wrong, or
                    duplicated, it&rsquo;s usually better to go fix that
                    directly instead — Cancel here and edit it from
                    Transactions.
                  </p>
                )}
              </div>
            )}
          </div>
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
