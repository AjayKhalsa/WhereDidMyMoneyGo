"use client";

import { useState } from "react";
import { Brain } from "lucide-react";
import type { ClassificationRule } from "@/lib/domain/types";
import { sortRules } from "@/lib/engine/learning";
import { deleteRule, saveRule } from "@/lib/data/actions";
import { useFinance } from "@/lib/hooks/use-finance";
import { CategoryPicker, ContextPicker } from "@/components/pickers/pickers";
import { Button, Chip, EmptyState } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { contextLabel } from "@/lib/domain/contexts";
import { pluralise } from "@/lib/utils";

/**
 * What the app has learned about you (spec §14, §43).
 *
 * The parser silently rewrites what you type, which is only acceptable if you
 * can see the rules doing it and overrule them. Every row here was written by
 * one of your own corrections — this screen is the receipt.
 */

export function RulesPanel() {
  const { db, categories } = useFinance();
  const [editing, setEditing] = useState<ClassificationRule | null>(null);

  const rules = sortRules(db?.rules ?? []);

  if (rules.length === 0) {
    return (
      <EmptyState
        icon={<Brain className="h-5 w-5" strokeWidth={1.5} />}
        title="Nothing learned yet"
        description="When you correct a category the app remembers the word behind it, and stops guessing wrong. Those rules will appear here."
      />
    );
  }

  return (
    <>
      <p className="text-[13px] leading-relaxed text-ink-secondary">
        {rules.length} {pluralise(rules.length, "rule")} learned from your
        corrections. Rules always outrank the built-in vocabulary.
      </p>

      <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
        {rules.map((rule) => (
          <li key={rule.id}>
            <button
              type="button"
              onClick={() => setEditing(rule)}
              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-hover"
            >
              <span className="min-w-0">
                <span className="block truncate text-[14px] text-ink">
                  <span className="font-medium">
                    &ldquo;{rule.pattern}&rdquo;
                  </span>
                  <span className="text-ink-tertiary"> → </span>
                  {categories.pathOf(rule.categoryId)}
                </span>
                <span className="mt-0.5 block truncate text-[12.5px] text-ink-tertiary">
                  Applied {rule.timesApplied}{" "}
                  {pluralise(rule.timesApplied, "time")}
                  {rule.contexts.length > 0 &&
                    ` · tags ${rule.contexts.map((c) => contextLabel(c.value)).join(", ")}`}
                </span>
              </span>
              <Chip
                tone={
                  rule.confidence >= 0.85
                    ? "positive"
                    : rule.confidence >= 0.65
                      ? "neutral"
                      : "warning"
                }
              >
                {Math.round(rule.confidence * 100)}%
              </Chip>
            </button>
          </li>
        ))}
      </ul>

      <RuleSheet rule={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function RuleSheet({
  rule,
  onClose,
}: {
  rule: ClassificationRule | null;
  onClose: () => void;
}) {
  const { categories } = useFinance();
  const toast = useToast();
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? "");
  const [contexts, setContexts] = useState(rule?.contexts ?? []);

  const [lastId, setLastId] = useState(rule?.id);
  if (rule?.id !== lastId) {
    setLastId(rule?.id);
    setCategoryId(rule?.categoryId ?? "");
    setContexts(rule?.contexts ?? []);
  }

  async function handleSave() {
    if (!rule || !categoryId) return;
    // An edit here is a deliberate instruction, not a guess, so it goes in at
    // full confidence rather than being nudged.
    await saveRule({
      ...rule,
      categoryId,
      contexts,
      confidence: 0.98,
      updatedAt: new Date().toISOString(),
    });
    toast.show({
      tone: "success",
      title: "Rule updated",
      detail: `"${rule.pattern}" now means ${categories.pathOf(categoryId)}`,
    });
    onClose();
  }

  async function handleDelete() {
    if (!rule) return;
    await deleteRule(rule.id);
    toast.show({
      tone: "info",
      title: "Rule forgotten",
      detail: "The built-in vocabulary takes over again",
    });
    onClose();
  }

  return (
    <Sheet
      open={Boolean(rule)}
      onClose={onClose}
      title={rule ? `“${rule.pattern}”` : ""}
      description="What this word should mean when it shows up in an expense."
      size="md"
      footer={
        <div className="flex gap-2">
          <Button variant="danger" onClick={handleDelete}>
            Forget this
          </Button>
          <Button
            variant="primary"
            block
            onClick={handleSave}
            disabled={!categoryId}
          >
            Save rule
          </Button>
        </div>
      }
    >
      <div className="space-y-6 py-1">
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-secondary">
            Category
          </p>
          <CategoryPicker value={categoryId} onChange={setCategoryId} />
        </div>
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-secondary">
            Tags applied automatically
          </p>
          <ContextPicker value={contexts} onChange={setContexts} />
        </div>
      </div>
    </Sheet>
  );
}
