"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { CONTEXT_DEFINITIONS, contextLabel } from "@/lib/domain/contexts";
import type { Account, TransactionContext } from "@/lib/domain/types";
import { makeContext } from "@/lib/domain/contexts";
import { useFinance } from "@/lib/hooks/use-finance";
import { cn } from "@/lib/utils";
import { SelectableChip } from "@/components/ui/primitives";
import { TextField } from "@/components/ui/fields";

/**
 * Category, context and account pickers.
 *
 * These are correction tools, not the primary path. The parser is expected to
 * get it right most of the time, so these are optimised for "change one
 * thing quickly" rather than for browsing a taxonomy (spec §39).
 */

export function CategoryPicker({
  value,
  onChange,
  className,
}: {
  value: string | undefined;
  onChange: (categoryId: string) => void;
  className?: string;
}) {
  const { categories } = useFinance();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const groups = categories.groups.map((group) => ({
      group,
      leaves: categories.leavesOf(group.id),
    }));
    if (!needle) return groups;
    return groups
      .map(({ group, leaves }) => ({
        group,
        leaves: leaves.filter(
          (leaf) =>
            leaf.name.toLowerCase().includes(needle) ||
            group.name.toLowerCase().includes(needle),
        ),
      }))
      .filter(({ leaves }) => leaves.length > 0);
  }, [categories, query]);

  return (
    <div className={cn("space-y-4", className)}>
      <TextField
        placeholder="Search categories"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        prefix={<Search className="h-4 w-4" strokeWidth={1.75} />}
        aria-label="Search categories"
      />

      <div className="space-y-5">
        {results.map(({ group, leaves }) => (
          <div key={group.id}>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-tertiary">
              {group.name}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {leaves.map((leaf) => (
                <SelectableChip
                  key={leaf.id}
                  selected={leaf.id === value}
                  onClick={() => onChange(leaf.id)}
                >
                  {leaf.id === value && (
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  )}
                  {leaf.name}
                </SelectableChip>
              ))}
            </div>
          </div>
        ))}
        {results.length === 0 && (
          <p className="py-4 text-center text-sm text-ink-tertiary">
            No category matches &ldquo;{query}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Context picker.
 *
 * Timestamp-derived contexts (weekend, late night) are shown as read-only
 * facts rather than toggles — they describe when the money was spent, and
 * letting someone untick "weekend" on a Saturday would just make the data
 * lie.
 */
export function ContextPicker({
  value,
  onChange,
  className,
}: {
  value: TransactionContext[];
  onChange: (contexts: TransactionContext[]) => void;
  className?: string;
}) {
  const selected = new Set(value.map((c) => c.value));
  const derived = value.filter(
    (c) => c.value === "weekend" || c.value === "late-night",
  );

  const toggle = (contextValue: string) => {
    const next = selected.has(contextValue)
      ? value.filter((c) => c.value !== contextValue)
      : [...value, makeContext(contextValue)];
    onChange(next);
  };

  const byType = {
    COMPANY: CONTEXT_DEFINITIONS.filter((c) => c.type === "COMPANY"),
    OCCASION: CONTEXT_DEFINITIONS.filter(
      (c) => c.type === "OCCASION" && c.value !== "weekend" && c.value !== "late-night",
    ),
    NATURE: CONTEXT_DEFINITIONS.filter((c) => c.type === "NATURE"),
  };

  const sections: { label: string; items: typeof CONTEXT_DEFINITIONS }[] = [
    { label: "Who with", items: byType.COMPANY },
    { label: "What it involved", items: byType.NATURE },
    { label: "Occasion", items: byType.OCCASION },
  ];

  return (
    <div className={cn("space-y-4", className)}>
      {sections.map((section) => (
        <div key={section.label}>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-tertiary">
            {section.label}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {section.items.map((definition) => (
              <SelectableChip
                key={definition.value}
                selected={selected.has(definition.value)}
                onClick={() => toggle(definition.value)}
                title={definition.description}
              >
                {definition.label}
              </SelectableChip>
            ))}
          </div>
        </div>
      ))}

      {derived.length > 0 && (
        <p className="text-[12.5px] text-ink-tertiary">
          Also tagged{" "}
          <span className="font-medium text-ink-secondary">
            {derived.map((c) => contextLabel(c.value)).join(" and ")}
          </span>{" "}
          from the date and time.
        </p>
      )}
    </div>
  );
}

export function AccountPicker({
  value,
  onChange,
  accounts,
  allowNone,
  className,
}: {
  value: string | undefined;
  onChange: (accountId: string | undefined) => void;
  accounts: Account[];
  allowNone?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {allowNone && (
        <SelectableChip selected={!value} onClick={() => onChange(undefined)}>
          Not set
        </SelectableChip>
      )}
      {accounts
        .filter((a) => a.isActive)
        .map((account) => (
          <SelectableChip
            key={account.id}
            selected={account.id === value}
            onClick={() => onChange(account.id)}
          >
            {account.name}
            {account.hint && (
              <span className="text-[11px] opacity-60">·{account.hint}</span>
            )}
          </SelectableChip>
        ))}
    </div>
  );
}
