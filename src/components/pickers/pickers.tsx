"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import {
  contextDefinition,
  contextLabel,
  contextScopeFor,
  DIMENSION_LABELS,
  DIMENSION_ORDER,
  makeContext,
} from "@/lib/domain/contexts";
import type { Account, ContextType, Person, TransactionContext } from "@/lib/domain/types";
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
    if (!needle) return categories.groups;
    return categories.groups.filter((c) => c.name.toLowerCase().includes(needle));
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

      <div className="flex flex-wrap gap-1.5">
        {results.map((category) => (
          <SelectableChip
            key={category.id}
            selected={category.id === value}
            onClick={() => onChange(category.id)}
          >
            {category.id === value && (
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            )}
            {category.name}
          </SelectableChip>
        ))}
      </div>
      {results.length === 0 && (
        <p className="py-4 text-center text-sm text-ink-tertiary">
          No category matches &ldquo;{query}&rdquo;
        </p>
      )}
    </div>
  );
}

/**
 * Type picker — step two, only shown when the chosen category actually has
 * children. Includes an explicit "Skip" option: a category alone is a
 * perfectly valid, complete answer (spec: don't make every field mandatory).
 */
export function TypePicker({
  categoryId,
  value,
  onChange,
  className,
}: {
  /** The parent (top-level) category id whose children to offer. */
  categoryId: string;
  value: string | undefined;
  onChange: (categoryId: string) => void;
  className?: string;
}) {
  const { categories } = useFinance();
  const types = categories.leavesOf(categoryId);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap gap-1.5">
        {types.map((type) => (
          <SelectableChip
            key={type.id}
            selected={type.id === value}
            onClick={() => onChange(type.id)}
          >
            {type.id === value && (
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            )}
            {type.name}
          </SelectableChip>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange(categoryId)}
        className="text-[13px] font-medium text-ink-tertiary underline-offset-2 hover:text-ink-secondary hover:underline"
      >
        Skip — just {categories.nameOf(categoryId)}
      </button>
    </div>
  );
}

/**
 * Context picker.
 *
 * Only offers context values relevant to the given category/type — see
 * `contextScopeFor` in `contexts.ts`. Not a universal taxonomy dumped on
 * every transaction: a flight has no use for "Alcohol", a cab ride has no
 * use for "Birthday".
 *
 * Timestamp-derived contexts (weekend, late night) are shown as read-only
 * facts rather than toggles — they describe when the money was spent, and
 * letting someone untick "weekend" on a Saturday would just make the data
 * lie.
 */
export function ContextPicker({
  value,
  onChange,
  categoryId,
  className,
}: {
  value: TransactionContext[];
  onChange: (contexts: TransactionContext[]) => void;
  /** Scopes which context values are offered. Omit for the generic default. */
  categoryId?: string;
  className?: string;
}) {
  // Keyed by (type, value): the same value can be selected under two
  // different dimensions at once (e.g. "work" as both Purpose and Who with)
  // and toggling one must never clear the other.
  const selected = new Set(value.map((c) => `${c.type}:${c.value}`));
  const derived = value.filter(
    (c) => c.value === "weekend" || c.value === "late-night",
  );

  const toggle = (contextValue: string, type: ContextType) => {
    const key = `${type}:${contextValue}`;
    const next = selected.has(key)
      ? value.filter((c) => `${c.type}:${c.value}` !== key)
      : [...value, makeContext(contextValue, type)];
    onChange(next);
  };

  const scope = contextScopeFor(categoryId);
  const sections = DIMENSION_ORDER.map((type) => ({
    type,
    label: DIMENSION_LABELS[type],
    values: scope[type] ?? [],
  })).filter((section) => section.values.length > 0);

  return (
    <div className={cn("space-y-4", className)}>
      {sections.map((section) => (
        <div key={section.type}>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-tertiary">
            {section.label}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {section.values.map((contextValue) => {
              const definition = contextDefinition(contextValue);
              return (
                <SelectableChip
                  key={contextValue}
                  selected={selected.has(`${section.type}:${contextValue}`)}
                  onClick={() => toggle(contextValue, section.type)}
                  title={definition?.description}
                >
                  {definition?.label ?? contextLabel(contextValue)}
                </SelectableChip>
              );
            })}
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

/** Multi-select roster of people to split an expense with. */
export function PersonPicker({
  value,
  onChange,
  people,
  className,
}: {
  value: string[];
  onChange: (personIds: string[]) => void;
  people: Person[];
  className?: string;
}) {
  const selected = new Set(value);

  const toggle = (personId: string) => {
    const next = selected.has(personId)
      ? value.filter((id) => id !== personId)
      : [...value, personId];
    onChange(next);
  };

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {people
        .filter((p) => p.isActive)
        .map((person) => (
          <SelectableChip
            key={person.id}
            selected={selected.has(person.id)}
            onClick={() => toggle(person.id)}
          >
            {selected.has(person.id) && (
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            )}
            {person.name}
          </SelectableChip>
        ))}
      {people.filter((p) => p.isActive).length === 0 && (
        <p className="text-sm text-ink-tertiary">
          No people yet — add one from Money.
        </p>
      )}
    </div>
  );
}
