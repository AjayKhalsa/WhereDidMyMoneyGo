"use client";

import { useState } from "react";
import { Plus, Target } from "lucide-react";
import { formatMoney, parseAmountInput } from "@/lib/domain/money";
import type { Goal } from "@/lib/domain/types";
import { saveGoal } from "@/lib/data/actions";
import { goalAllocations } from "@/lib/engine/safe-to-spend";
import { useFinance } from "@/lib/hooks/use-finance";
import { Amount } from "@/components/ui/amount";
import { MoneyField, TextField } from "@/components/ui/fields";
import { Button, EmptyState } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { createId, pluralise } from "@/lib/utils";
import { GoalCard } from "./goal-card";

/**
 * Savings goals (spec §27).
 *
 * A goal with a monthly contribution is a claim on this month's income, so it
 * is subtracted from safe-to-spend before you are told what you can spend.
 * That is stated here rather than buried, because money you did not know was
 * being held back is indistinguishable from money that went missing.
 */

export function GoalsPanel() {
  const { db, month, cycleStartDay } = useFinance();
  const [creating, setCreating] = useState(false);

  const goals = db?.goals ?? [];
  const earmarked = goalAllocations(goals, db?.transactions ?? [], month, cycleStartDay);
  const funded = goals.filter((g) => g.currentAmount >= g.targetAmount).length;

  if (goals.length === 0) {
    return (
      <>
        <EmptyState
          icon={<Target className="h-5 w-5" strokeWidth={1.5} />}
          title="No goals yet"
          description="A goal is just a number with a deadline. Set one and the app will hold money back for it each month before telling you what's safe to spend."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" strokeWidth={2} />
              Create a goal
            </Button>
          }
        />
        <NewGoalSheet open={creating} onClose={() => setCreating(false)} />
      </>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {goals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} />
        ))}
      </div>

      {earmarked > 0 && (
        <div className="rounded-xl bg-surface-sunken p-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-ink-secondary">
              Set aside each month
            </span>
            <Amount value={earmarked} size="md" />
          </div>
          <p className="mt-1 text-[12px] text-ink-tertiary">
            Held back from safe-to-spend across{" "}
            {goals.filter((g) => g.monthlyContribution > 0).length}{" "}
            {pluralise(
              goals.filter((g) => g.monthlyContribution > 0).length,
              "goal",
            )}
            {funded > 0 && ` · ${funded} already fully funded`}.
          </p>
        </div>
      )}

      <Button size="sm" onClick={() => setCreating(true)}>
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        Add a goal
      </Button>

      <NewGoalSheet open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

/**
 * Creating a goal.
 *
 * Separate from `GoalEditSheet` because the two are different jobs: editing
 * shows progress and a top-up field, which are meaningless before the goal
 * exists. This asks for the four things a goal actually needs and nothing
 * else.
 */
function NewGoalSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [monthly, setMonthly] = useState("");
  const [targetDate, setTargetDate] = useState("");

  function reset() {
    setName("");
    setTarget("");
    setCurrent("");
    setMonthly("");
    setTargetDate("");
  }

  const targetAmount = parseAmountInput(target) ?? 0;
  const canSave = name.trim().length > 0 && targetAmount > 0;

  async function handleSave() {
    if (!canSave) return;
    const goal: Goal = {
      id: createId("goal"),
      name: name.trim(),
      targetAmount,
      currentAmount: parseAmountInput(current) ?? 0,
      monthlyContribution: parseAmountInput(monthly) ?? 0,
      targetDate: targetDate || undefined,
      createdAt: new Date().toISOString(),
    };
    await saveGoal(goal);
    toast.show({
      tone: "success",
      title: `${goal.name} created`,
      detail: `Target ${formatMoney(goal.targetAmount)}`,
    });
    reset();
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="New goal"
      description="Something you're saving toward — a trip, a laptop, an emergency fund."
      size="sm"
      footer={
        <Button variant="primary" block onClick={handleSave} disabled={!canSave}>
          Create goal
        </Button>
      }
    >
      <div className="space-y-4 py-1">
        <TextField
          label="What are you saving for?"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Japan trip"
          data-autofocus
        />
        <MoneyField
          label="Target amount"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="200000"
        />
        <MoneyField
          label="Already saved"
          hint="Leave blank if you're starting from zero."
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <MoneyField
          label="Monthly contribution"
          hint="Held back from safe-to-spend each month. Leave blank to fund it from whatever's left over."
          value={monthly}
          onChange={(e) => setMonthly(e.target.value)}
        />
        <TextField
          label="Target date"
          type="date"
          hint="Optional. Only used to pace the goal, never to nag."
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
      </div>
    </Sheet>
  );
}
