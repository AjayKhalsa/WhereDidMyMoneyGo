"use client";

import { Search, X } from "lucide-react";
import { CONTEXT_DEFINITIONS } from "@/lib/domain/contexts";
import { endOfMonth, monthKey, monthKeyToDate, toDateInputValue } from "@/lib/domain/dates";
import type { TransactionType } from "@/lib/domain/types";
import type { ParsedTerm, TransactionFilter } from "@/lib/engine/search";
import { useFinance } from "@/lib/hooks/use-finance";
import { SelectField, TextField } from "@/components/ui/fields";
import { Chip, TextAction } from "@/components/ui/primitives";

/**
 * Search and filters for the transactions screen (spec §30).
 *
 * Two ways in, on purpose. Typing a question is faster once you know what you
 * want ("dining above 2000 in july"); the dropdowns are for browsing when you
 * don't. What the search box understood is echoed back as chips, so a query
 * that quietly failed to parse is visible rather than mysterious.
 */

export type RangePreset = "month" | "quarter" | "year" | "all";

const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "quarter", label: "3 months" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
];

/** Turns a preset into concrete date bounds. "All time" has none. */
export function rangeToFilter(
  preset: RangePreset,
  now: Date,
  cycleStartDay = 1,
): Pick<TransactionFilter, "from" | "to"> {
  if (preset === "all") return {};
  if (preset === "year") {
    return {
      from: toDateInputValue(new Date(now.getFullYear(), 0, 1)),
      to: toDateInputValue(new Date(now.getFullYear(), 11, 31)),
    };
  }
  const monthsBack = preset === "quarter" ? 2 : 0;
  const thisCycle = monthKey(now, cycleStartDay);
  const startKey =
    monthsBack === 0
      ? thisCycle
      : monthKey(
          new Date(now.getFullYear(), now.getMonth() - monthsBack, 1),
          cycleStartDay,
        );
  return {
    from: toDateInputValue(monthKeyToDate(startKey)),
    to: toDateInputValue(endOfMonth(thisCycle, cycleStartDay)),
  };
}

const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: "EXPENSE", label: "Expenses" },
  { value: "INCOME", label: "Income" },
  { value: "TRANSFER", label: "Transfers" },
  { value: "INVESTMENT", label: "Investments" },
];

export interface FilterBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  /** Only the dropdown-driven parts of the filter. */
  filter: TransactionFilter;
  onFilterChange: (filter: TransactionFilter) => void;
  range: RangePreset;
  onRangeChange: (range: RangePreset) => void;
  /** What the typed query was understood to mean. */
  terms: ParsedTerm[];
  onClear: () => void;
  hasFilters: boolean;
}

export function FilterBar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  range,
  onRangeChange,
  terms,
  onClear,
  hasFilters,
}: FilterBarProps) {
  const { db, categories } = useFinance();

  // A query term overrides the matching dropdown, so the dropdown is disabled
  // rather than left showing a value that isn't being applied.
  const overridden = new Set(terms.map((t) => t.kind));

  const set = (changes: Partial<TransactionFilter>) =>
    onFilterChange({ ...filter, ...changes });

  return (
    <div className="space-y-3">
      <div className="relative">
        <TextField
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Try “dining above 2000”, “uber in july”, “credit card”"
          prefix={<Search className="h-4 w-4" strokeWidth={1.75} />}
          aria-label="Search transactions"
          className={query ? "pr-10" : undefined}
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-tertiary transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
          >
            <X className="h-4 w-4" strokeWidth={1.9} />
          </button>
        )}
      </div>

      {terms.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-ink-tertiary">Reading that as</span>
          {terms.map((term) => (
            <Chip
              key={`${term.kind}-${term.label}`}
              tone={term.kind === "text" ? "neutral" : "accent"}
            >
              {term.label}
            </Chip>
          ))}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          label="Type"
          value={filter.types?.[0] ?? ""}
          disabled={overridden.has("type")}
          onChange={(e) =>
            set({
              types: e.target.value
                ? [e.target.value as TransactionType]
                : undefined,
            })
          }
        >
          <option value="">Everything</option>
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Category"
          value={filter.groupIds?.[0] ?? ""}
          disabled={overridden.has("category")}
          onChange={(e) =>
            set({ groupIds: e.target.value ? [e.target.value] : undefined })
          }
        >
          <option value="">All categories</option>
          {categories.groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Context"
          value={filter.contexts?.[0] ?? ""}
          disabled={overridden.has("context")}
          onChange={(e) =>
            set({ contexts: e.target.value ? [e.target.value] : undefined })
          }
        >
          <option value="">Any context</option>
          {CONTEXT_DEFINITIONS.map((definition) => (
            <option key={definition.value} value={definition.value}>
              {definition.label}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Account"
          value={filter.accountIds?.[0] ?? ""}
          disabled={overridden.has("account")}
          onChange={(e) =>
            set({ accountIds: e.target.value ? [e.target.value] : undefined })
          }
        >
          <option value="">Any account</option>
          {(db?.accounts ?? []).map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <div
            role="radiogroup"
            aria-label="Date range"
            className="flex flex-wrap gap-1.5"
          >
            {RANGE_OPTIONS.map((option) => {
              const selected = option.value === range;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={overridden.has("date")}
                  onClick={() => onRangeChange(option.value)}
                  className="focus:outline-none disabled:opacity-40"
                >
                  <Chip tone={selected ? "accent" : "neutral"}>
                    {option.label}
                  </Chip>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => set({ needsReview: !filter.needsReview || undefined })}
            className="focus:outline-none"
          >
            <Chip tone={filter.needsReview ? "accent" : "neutral"}>
              Needs review
            </Chip>
          </button>
        </div>

        {hasFilters && (
          <TextAction onClick={onClear}>
            <X className="h-3.5 w-3.5" strokeWidth={2} />
            Clear all
          </TextAction>
        )}
      </div>
    </div>
  );
}
