"use client";

import { useState } from "react";
import { formatFullDate } from "@/lib/domain/dates";
import { formatMoney, parseAmountInput, percentOf } from "@/lib/domain/money";
import type { Goal } from "@/lib/domain/types";
import { contributeToGoal, deleteGoal, saveGoal } from "@/lib/data/actions";
import { useFinance } from "@/lib/hooks/use-finance";
import { projectGoal } from "@/lib/engine/goals";
import { Amount } from "@/components/ui/amount";
import { ProgressTrack } from "@/components/ui/charts";
import { MoneyField, TextField } from "@/components/ui/fields";
import { Button, Card } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

/**
 * A savings goal (spec §27).
 *
 * Projections only appear when the data supports them. A goal with no monthly
 * contribution and no surplus gets no cheerful "you'll get there by March" —
 * inventing an encouraging date would make every other number less
 * believable.
 */

export function GoalCard({ goal }: { goal: Goal }) {
  const [editing, setEditing] = useState(false);
  const { safeToSpend, groupBreakdown } = useFinance();

  const progress = percentOf(goal.currentAmount, goal.targetAmount);
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  const complete = remaining === 0;

  const projection = projectGoal(goal, {
    projectedSurplus: safeToSpend.projectedSurplus,
    topCategory: groupBreakdown[0],
  });

  return (
    <>
      <Card
        interactive
        className="cursor-pointer p-4"
        onClick={() => setEditing(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setEditing(true);
          }
        }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[14.5px] font-medium text-ink">
            {goal.name}
          </span>
          <span className="shrink-0 text-[12.5px] text-ink-tertiary tnum">
            {Math.round(progress)}%
          </span>
        </div>

        <div className="mt-2.5">
          <ProgressTrack
            value={progress}
            tone={complete ? "positive" : "accent"}
            height="h-1.5"
          />
        </div>

        <div className="mt-2.5 flex items-baseline justify-between gap-3">
          <span className="text-[13px] text-ink-secondary tnum">
            {formatMoney(goal.currentAmount)} of {formatMoney(goal.targetAmount)}
          </span>
          {goal.targetDate && (
            <span className="shrink-0 text-[12px] text-ink-tertiary">
              by {formatFullDate(goal.targetDate)}
            </span>
          )}
        </div>

        {projection && (
          <p className="mt-2.5 border-t border-line pt-2.5 text-[12.5px] leading-relaxed text-ink-secondary">
            {projection}
          </p>
        )}
      </Card>

      <GoalEditSheet
        goal={goal}
        open={editing}
        onClose={() => setEditing(false)}
      />
    </>
  );
}

export function GoalEditSheet({
  goal,
  open,
  onClose,
}: {
  goal: Goal;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState(String(goal.targetAmount / 100));
  const [current, setCurrent] = useState(String(goal.currentAmount / 100));
  const [monthly, setMonthly] = useState(
    goal.monthlyContribution ? String(goal.monthlyContribution / 100) : "",
  );
  const [targetDate, setTargetDate] = useState(goal.targetDate ?? "");
  const [topUp, setTopUp] = useState("");

  async function handleSave() {
    await saveGoal({
      ...goal,
      name: name.trim() || goal.name,
      targetAmount: parseAmountInput(target) ?? goal.targetAmount,
      currentAmount: parseAmountInput(current) ?? goal.currentAmount,
      monthlyContribution: parseAmountInput(monthly) ?? 0,
      targetDate: targetDate || undefined,
    });
    toast.show({ tone: "success", title: "Goal updated" });
    onClose();
  }

  async function handleTopUp() {
    const amount = parseAmountInput(topUp);
    if (!amount || amount <= 0) return;
    await contributeToGoal(goal.id, amount);
    toast.show({
      tone: "success",
      title: `${formatMoney(amount)} added to ${goal.name}`,
    });
    setTopUp("");
    onClose();
  }

  async function handleDelete() {
    await deleteGoal(goal.id);
    toast.show({ tone: "info", title: "Goal removed" });
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={goal.name}
      size="sm"
      footer={
        <div className="flex gap-2">
          <Button variant="danger" onClick={handleDelete}>
            Delete
          </Button>
          <Button variant="primary" block onClick={handleSave}>
            Save changes
          </Button>
        </div>
      }
    >
      <div className="space-y-5 py-1">
        <div className="rounded-xl bg-surface-sunken p-4">
          <p className="text-[12.5px] text-ink-secondary">Saved so far</p>
          <div className="mt-1 flex items-baseline gap-2">
            <Amount value={goal.currentAmount} size="lg" />
            <span className="text-[13px] text-ink-tertiary">
              of {formatMoney(goal.targetAmount)}
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            <MoneyField
              value={topUp}
              onChange={(e) => setTopUp(e.target.value)}
              placeholder="Add money"
              aria-label={`Add money to ${goal.name}`}
              wrapperClassName="flex-1"
            />
            <Button
              onClick={handleTopUp}
              disabled={!parseAmountInput(topUp)}
              className="h-11 shrink-0"
            >
              Add
            </Button>
          </div>
        </div>

        <TextField
          label="Goal name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <MoneyField
          label="Target amount"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <MoneyField
          label="Currently saved"
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
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
      </div>
    </Sheet>
  );
}
