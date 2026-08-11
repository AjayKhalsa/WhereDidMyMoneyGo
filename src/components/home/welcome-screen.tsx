"use client";

import { useState } from "react";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { parseAmountInput } from "@/lib/domain/money";
import type { AccountType } from "@/lib/domain/types";
import {
  recordCardStartingBalance,
  saveAccount,
  saveCreditCardDetail,
  saveIncomeSource,
  updateProfile,
} from "@/lib/data/actions";
import { replaceDatabase } from "@/lib/data/store";
import { createSeedDatabase } from "@/lib/data/seed";
import { useAddSheet } from "@/components/add/add-sheet-provider";
import { MoneyField, SelectField, TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { createId } from "@/lib/utils";

/**
 * First run (spec §36).
 *
 * An empty dashboard tells a new user nothing — but a dashboard built on
 * guesses is worse, because every number downstream inherits the guess. So
 * this asks for the three things the whole app is derived from, in the order
 * they matter: when you're paid and how much, what's actually in your
 * accounts today, and what you already owe on cards.
 *
 * Payday is not cosmetic. It becomes `cycleStartDay`, which decides where
 * every cycle boundary in the app falls; it used to be hardcoded to the 1st,
 * silently misfiling every transaction for anyone paid mid-month.
 *
 * Opening balance is the other trap, and the hint says so plainly: it is the
 * balance *before* your earliest imported transaction, not today's. Setting
 * it to today's balance and then importing history double-counts the history.
 *
 * Every step can be skipped — a half-filled snapshot still beats a fictional
 * one, and anything missed is editable later under Money.
 */

type Step = "pay" | "accounts" | "cards";

export function WelcomeScreen({ onDone }: { onDone: () => void }) {
  const { open } = useAddSheet();
  const toast = useToast();
  const [step, setStep] = useState<Step>("pay");

  // --- Step 1: you and your pay ------------------------------------------
  const [name, setName] = useState("");
  const [incomeText, setIncomeText] = useState("");
  const [deductionsText, setDeductionsText] = useState("");
  const [paydayText, setPayday] = useState("1");
  const [saving, setSaving] = useState(false);

  // --- Step 2: accounts ---------------------------------------------------
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState<AccountType>("BANK");
  const [accBalance, setAccBalance] = useState("");
  const [addedAccounts, setAddedAccounts] = useState<string[]>([]);

  // --- Step 3: cards ------------------------------------------------------
  const [cardName, setCardName] = useState("");
  const [cardLimit, setCardLimit] = useState("");
  const [statementDay, setStatementDay] = useState("25");
  const [dueDay, setDueDay] = useState("9");
  const [cardOwed, setCardOwed] = useState("");
  const [addedCards, setAddedCards] = useState<string[]>([]);

  const income = parseAmountInput(incomeText) ?? 0;

  async function handlePayStep() {
    if (income <= 0 || saving) return;
    setSaving(true);
    try {
      await saveIncomeSource({
        id: createId("inc"),
        name: "Salary",
        amount: income,
        recurring: true,
        dayOfMonth: clampDay(paydayText, 1),
        deductions: parseAmountInput(deductionsText) ?? 0,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      if (name.trim()) await updateProfile({ name: name.trim() });
      setStep("accounts");
    } finally {
      setSaving(false);
    }
  }

  async function addAccount() {
    if (!accName.trim()) return;
    await saveAccount({
      id: createId("acc"),
      name: accName.trim(),
      type: accType,
      openingBalance: parseAmountInput(accBalance) ?? 0,
      isActive: true,
      isDefault: addedAccounts.length === 0 && accType === "BANK",
      createdAt: new Date().toISOString(),
    });
    setAddedAccounts((current) => [...current, accName.trim()]);
    setAccName("");
    setAccBalance("");
  }

  async function addCard() {
    if (!cardName.trim()) return;
    const id = createId("acc");
    await saveAccount({
      id,
      name: cardName.trim(),
      type: "CREDIT_CARD",
      openingBalance: 0,
      isActive: true,
      isDefault: false,
      createdAt: new Date().toISOString(),
    });
    await saveCreditCardDetail({
      id: createId("cc"),
      accountId: id,
      statementDay: clampDay(statementDay, 25),
      dueDay: clampDay(dueDay, 9),
      creditLimit: parseAmountInput(cardLimit) ?? 0,
    });
    // Debt from before you started tracking has no transactions behind it,
    // so it is recorded the same way the Reconcile flow does it.
    const owed = parseAmountInput(cardOwed) ?? 0;
    if (owed > 0) {
      await recordCardStartingBalance({ cardAccountId: id, difference: owed });
    }
    setAddedCards((current) => [...current, cardName.trim()]);
    setCardName("");
    setCardLimit("");
    setCardOwed("");
  }

  async function finish() {
    await updateProfile({ onboarded: true });
    toast.show({
      tone: "success",
      title: "You're set up",
      detail: "Everything here is editable under Money",
    });
    onDone();
  }

  async function loadDemo() {
    await replaceDatabase(createSeedDatabase());
    toast.show({
      tone: "info",
      title: "Sample data loaded",
      detail: "Four months of realistic activity",
    });
    onDone();
  }

  return (
    <div className="mx-auto max-w-lg py-8 sm:py-16">
      <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
        {step === "pay"
          ? "Welcome"
          : step === "accounts"
            ? "Step 2 of 3"
            : "Step 3 of 3"}
      </p>

      {step === "pay" && (
        <>
          <h1 className="mt-3 text-[clamp(1.75rem,5vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-ink">
            Let&rsquo;s figure out where your money goes.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-secondary">
            Start with what comes in and when. Your payday sets the cycle
            everything else is measured against.
          </p>

          <div className="mt-8 space-y-4">
            <MoneyField
              label="Monthly income"
              value={incomeText}
              onChange={(e) => setIncomeText(e.target.value)}
              placeholder="155000"
              data-autofocus
            />
            <TextField
              label="Payday"
              hint="Day of the month you're paid. Your month runs from here, not the 1st."
              type="number"
              min={1}
              max={28}
              value={paydayText}
              onChange={(e) => setPayday(e.target.value)}
            />
            <MoneyField
              label="Monthly deductions"
              hint="Tax, PF and anything else taken before it reaches you. Optional."
              value={deductionsText}
              onChange={(e) => setDeductionsText(e.target.value)}
              placeholder="0"
            />
            <TextField
              label="What should I call you?"
              hint="Optional."
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="primary"
                size="lg"
                onClick={handlePayStep}
                disabled={income <= 0 || saving}
              >
                {saving ? "Saving…" : "Continue"}
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </Button>
              <Button
                size="lg"
                onClick={() => {
                  onDone();
                  open();
                }}
              >
                Add an expense instead
              </Button>
            </div>
          </div>
        </>
      )}

      {step === "accounts" && (
        <>
          <h1 className="mt-3 text-[clamp(1.5rem,4vw,2rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
            What&rsquo;s in your accounts?
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-secondary">
            Add each bank or cash account with the balance it started from.
            Without this, every balance in the app is off by whatever was
            already there.
          </p>

          <div className="mt-8 space-y-4">
            <TextField
              label="Account name"
              value={accName}
              onChange={(e) => setAccName(e.target.value)}
              placeholder="HDFC"
              data-autofocus
            />
            <SelectField
              label="Type"
              value={accType}
              onChange={(e) => setAccType(e.target.value as AccountType)}
            >
              <option value="BANK">Bank account</option>
              <option value="CASH">Cash</option>
            </SelectField>
            <MoneyField
              label="Opening balance"
              hint="The balance before your earliest transaction — not today's, if you're about to import history."
              value={accBalance}
              onChange={(e) => setAccBalance(e.target.value)}
              placeholder="0"
            />

            <AddedList items={addedAccounts} />

            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={addAccount} disabled={!accName.trim()}>
                Add account
              </Button>
              <Button variant="primary" size="lg" onClick={() => setStep("cards")}>
                {addedAccounts.length > 0 ? "Continue" : "Skip for now"}
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </Button>
            </div>
          </div>
        </>
      )}

      {step === "cards" && (
        <>
          <h1 className="mt-3 text-[clamp(1.5rem,4vw,2rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
            Any credit cards?
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-secondary">
            What you already owe is subtracted from what you can safely spend,
            so it&rsquo;s worth getting right up front.
          </p>

          <div className="mt-8 space-y-4">
            <TextField
              label="Card name"
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              placeholder="HSBC Travel One"
              data-autofocus
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
            <MoneyField
              label="Credit limit"
              value={cardLimit}
              onChange={(e) => setCardLimit(e.target.value)}
              placeholder="0"
            />
            <MoneyField
              label="Currently owed"
              hint="What the card's app shows right now, including anything from before you started tracking."
              value={cardOwed}
              onChange={(e) => setCardOwed(e.target.value)}
              placeholder="0"
            />

            <AddedList items={addedCards} />

            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={addCard} disabled={!cardName.trim()}>
                Add card
              </Button>
              <Button variant="primary" size="lg" onClick={finish}>
                {addedCards.length > 0 ? "Done" : "Skip for now"}
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </Button>
            </div>
          </div>
        </>
      )}

      {step === "pay" && (
        <div className="mt-10 rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-ink-tertiary" strokeWidth={1.75} />
            <h2 className="text-[14.5px] font-medium text-ink">
              Just want to look around?
            </h2>
          </div>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-secondary">
            Load four months of realistic sample data — income, investments,
            dining, dating, cabs and a credit card with a balance — so every
            screen has something to show. You can clear it from Settings at any
            time.
          </p>
          <Button className="mt-3.5" onClick={loadDemo}>
            Load sample data
          </Button>
        </div>
      )}
    </div>
  );
}

function AddedList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1.5 rounded-xl bg-surface-sunken p-3.5">
      {items.map((label) => (
        <li
          key={label}
          className="flex items-center gap-2 text-[13.5px] text-ink-secondary"
        >
          <Check className="h-3.5 w-3.5 text-positive" strokeWidth={2.25} />
          {label}
        </li>
      ))}
    </ul>
  );
}

/** Statement/due/payday all share the 1–28 range, for the same reason. */
function clampDay(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(28, Math.max(1, Math.round(parsed)));
}
