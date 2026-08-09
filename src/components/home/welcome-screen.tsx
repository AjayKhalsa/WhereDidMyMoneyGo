"use client";

import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { rupeesToPaise, parseAmountInput } from "@/lib/domain/money";
import { saveIncomeSource, updateProfile } from "@/lib/data/actions";
import { replaceDatabase } from "@/lib/data/store";
import { createSeedDatabase } from "@/lib/data/seed";
import { useAddSheet } from "@/components/add/add-sheet-provider";
import { MoneyField, TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { createId } from "@/lib/utils";

/**
 * First run (spec §36).
 *
 * An empty dashboard tells a new user nothing, so this screen does two jobs:
 * it asks for the single piece of information the whole app is built on
 * (monthly income), and it offers a fully populated demo so the product can
 * be understood before any data is entered.
 */

export function WelcomeScreen() {
  const { open } = useAddSheet();
  const toast = useToast();
  const [name, setName] = useState("");
  const [incomeText, setIncomeText] = useState("");
  const [deductionsText, setDeductionsText] = useState("");
  const [saving, setSaving] = useState(false);

  const income = parseAmountInput(incomeText) ?? 0;

  async function handleStart() {
    if (income <= 0 || saving) return;
    setSaving(true);
    try {
      await saveIncomeSource({
        id: createId("inc"),
        name: "Salary",
        amount: income,
        recurring: true,
        dayOfMonth: 1,
        deductions: parseAmountInput(deductionsText) ?? 0,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      if (name.trim()) await updateProfile({ name: name.trim() });
      await updateProfile({ onboarded: true });
      toast.show({
        tone: "success",
        title: "Income saved",
        detail: "Now add your first expense",
      });
    } finally {
      setSaving(false);
    }
  }

  async function loadDemo() {
    await replaceDatabase(createSeedDatabase());
    toast.show({
      tone: "info",
      title: "Sample data loaded",
      detail: "Four months of realistic activity",
    });
  }

  return (
    <div className="mx-auto max-w-lg py-8 sm:py-16">
      <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
        Welcome
      </p>
      <h1 className="mt-3 text-[clamp(1.75rem,5vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-ink">
        Let&rsquo;s figure out where your money goes.
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-secondary">
        Start with what comes in each month. Everything else — what&rsquo;s safe
        to spend, what&rsquo;s already committed, where it all went — is worked
        out from there.
      </p>

      <div className="mt-8 space-y-4">
        <MoneyField
          label="Monthly income"
          value={incomeText}
          onChange={(e) => setIncomeText(e.target.value)}
          placeholder="155000"
          data-autofocus
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
            onClick={handleStart}
            disabled={income <= 0 || saving}
          >
            {saving ? "Saving…" : "Add income"}
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </Button>
          <Button size="lg" onClick={() => open()}>
            Add an expense instead
          </Button>
        </div>
      </div>

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
    </div>
  );
}
