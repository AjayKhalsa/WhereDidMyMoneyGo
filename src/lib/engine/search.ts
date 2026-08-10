import { groupIdOf, UNCATEGORISED_ID } from "@/lib/domain/categories";
import { CONTEXT_DEFINITIONS } from "@/lib/domain/contexts";
import {
  addMonths,
  endOfMonth,
  monthKey,
  monthKeyToDate,
  toDateInputValue,
  type MonthKey,
} from "@/lib/domain/dates";
import { formatMoney, parseAmountInput } from "@/lib/domain/money";
import type {
  Account,
  Category,
  Paise,
  Transaction,
  TransactionType,
} from "@/lib/domain/types";
import { total } from "./analytics";
import { STOP_WORDS } from "./lexicon";

/**
 * Transaction search and filtering (spec §29, §30).
 *
 * The search box is deliberately not a fuzzy text match over descriptions.
 * People ask questions — "dining above 2000", "uber in july", "credit card" —
 * and each of those is a *structured* query hiding inside a sentence. Parsing
 * it into real filters is what makes the result summary trustworthy: we can
 * say "July dating spend · ₹7,450 · 8 transactions" precisely because we know
 * which parts of the query were understood.
 *
 * Anything not recognised falls through to free text rather than being
 * silently dropped, so an unmatched word narrows the results instead of being
 * ignored.
 */

export interface TransactionFilter {
  /** Free text matched against description, merchant and notes. */
  text?: string;
  groupIds?: string[];
  categoryIds?: string[];
  contexts?: string[];
  accountIds?: string[];
  types?: TransactionType[];
  minAmount?: Paise;
  maxAmount?: Paise;
  /** Inclusive ISO date bounds, "2026-07-01" style. */
  from?: string;
  to?: string;
  /** Expenses the parser/AI never resolved a real category for. */
  needsReview?: boolean;
}

export type TermKind =
  | "amount"
  | "date"
  | "category"
  | "context"
  | "account"
  | "type"
  | "text";

/** One thing the parser understood, surfaced so the UI can show its working. */
export interface ParsedTerm {
  kind: TermKind;
  label: string;
}

export interface ParsedQuery {
  filter: TransactionFilter;
  terms: ParsedTerm[];
}

export interface SearchContext {
  categories: Category[];
  accounts: Account[];
  /** Anchors relative phrases like "last month". */
  now: Date;
  /** Same pay-cycle boundary Home/Insights/Safe-to-spend use for "this month". */
  cycleStartDay: number;
}

const MONTH_NAMES = [
  ["january", "jan"],
  ["february", "feb"],
  ["march", "mar"],
  ["april", "apr"],
  ["may"],
  ["june", "jun"],
  ["july", "jul"],
  ["august", "aug"],
  ["september", "sep", "sept"],
  ["october", "oct"],
  ["november", "nov"],
  ["december", "dec"],
];

const TYPE_WORDS: { words: string[]; type: TransactionType; label: string }[] = [
  { words: ["income", "salary", "credited"], type: "INCOME", label: "Income" },
  { words: ["investment", "invested", "sip"], type: "INVESTMENT", label: "Investments" },
  { words: ["transfer", "transfers", "payment to card"], type: "TRANSFER", label: "Transfers" },
  { words: ["expense", "expenses", "spending", "spend", "spent"], type: "EXPENSE", label: "Expenses" },
];

/**
 * Words too generic to identify an account on their own.
 * "card" alone should mean *every* credit card, not the first one whose name
 * happens to contain the word.
 */
/**
 * Words people use to phrase a question rather than to name a thing.
 *
 * Extends the parser's own stop list with the interrogatives that only ever
 * show up in a search box — "how much did I spend on cabs" should search for
 * cabs, not for the word "much".
 */
const QUERY_FILLER = new Set([
  ...STOP_WORDS,
  "how",
  "much",
  "many",
  "what",
  "where",
  "when",
  "did",
  "do",
  "does",
  "show",
  "find",
  "all",
  "any",
  "this",
  "that",
  "than",
  "then",
  "over",
  "under",
  "above",
  "below",
  "between",
  "during",
  "last",
  "past",
]);

const GENERIC_ACCOUNT_WORDS = new Set([
  "bank",
  "card",
  "credit",
  "cash",
  "account",
  "savings",
  "the",
]);

/** Removes the first occurrence of `phrase`, collapsing leftover whitespace. */
function consume(haystack: string, phrase: string): string {
  const index = haystack.indexOf(phrase);
  if (index === -1) return haystack;
  return (
    haystack.slice(0, index) + " " + haystack.slice(index + phrase.length)
  ).replace(/\s+/g, " ");
}

function dayBounds(start: Date, end: Date): { from: string; to: string } {
  return { from: toDateInputValue(start), to: toDateInputValue(end) };
}

function monthBounds(
  key: MonthKey,
  cycleStartDay: number,
): { from: string; to: string } {
  const start = monthKeyToDate(key);
  const end = endOfMonth(key, cycleStartDay);
  return dayBounds(start, end);
}

/**
 * Turns a typed question into filters.
 *
 * Phrases are consumed longest-first so "credit card" is not eaten by "card",
 * and a two-word category name is not broken up by a single-word match.
 */
export function parseSearchQuery(
  raw: string,
  context: SearchContext,
): ParsedQuery {
  const filter: TransactionFilter = {};
  const terms: ParsedTerm[] = [];
  let rest = ` ${raw.toLowerCase().trim()} `.replace(/\s+/g, " ");

  if (!raw.trim()) return { filter, terms };

  // --- Amounts: "above 2000", "under 500", "> 1.5k" ------------------------
  const above =
    /\b(?:above|over|more than|greater than|at least|>=?)\s*₹?\s*([\d,.]+\s*[kl]?)/i.exec(
      rest,
    );
  if (above?.[1]) {
    const amount = parseAmountInput(above[1]);
    if (amount) {
      filter.minAmount = amount;
      terms.push({ kind: "amount", label: `Above ${formatMoney(amount)}` });
      rest = consume(rest, above[0]);
    }
  }

  const below =
    /\b(?:below|under|less than|at most|<=?)\s*₹?\s*([\d,.]+\s*[kl]?)/i.exec(rest);
  if (below?.[1]) {
    const amount = parseAmountInput(below[1]);
    if (amount) {
      filter.maxAmount = amount;
      terms.push({ kind: "amount", label: `Under ${formatMoney(amount)}` });
      rest = consume(rest, below[0]);
    }
  }

  // --- Dates ---------------------------------------------------------------
  const { now, cycleStartDay } = context;
  const relative: { phrase: string; label: string; range: () => { from: string; to: string } }[] =
    [
      {
        phrase: "this month",
        label: "This month",
        range: () => monthBounds(monthKey(now, cycleStartDay), cycleStartDay),
      },
      {
        phrase: "last month",
        label: "Last month",
        range: () =>
          monthBounds(
            addMonths(monthKey(now, cycleStartDay), -1, cycleStartDay),
            cycleStartDay,
          ),
      },
      {
        phrase: "this year",
        label: "This year",
        range: () =>
          dayBounds(
            new Date(now.getFullYear(), 0, 1),
            new Date(now.getFullYear(), 11, 31),
          ),
      },
      {
        phrase: "last year",
        label: "Last year",
        range: () =>
          dayBounds(
            new Date(now.getFullYear() - 1, 0, 1),
            new Date(now.getFullYear() - 1, 11, 31),
          ),
      },
      {
        phrase: "today",
        label: "Today",
        range: () => dayBounds(now, now),
      },
      {
        phrase: "yesterday",
        label: "Yesterday",
        range: () => {
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
          return dayBounds(d, d);
        },
      },
      {
        phrase: "this week",
        label: "This week",
        range: () => {
          const start = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() - now.getDay(),
          );
          const end = new Date(
            start.getFullYear(),
            start.getMonth(),
            start.getDate() + 6,
          );
          return dayBounds(start, end);
        },
      },
    ];

  let dateMatched = false;
  for (const option of relative) {
    if (!rest.includes(` ${option.phrase} `)) continue;
    const range = option.range();
    filter.from = range.from;
    filter.to = range.to;
    terms.push({ kind: "date", label: option.label });
    rest = consume(rest, option.phrase);
    dateMatched = true;
    break;
  }

  // A bare month name means the most recent one that has already happened —
  // asking about "july" in August means the July that just ended, not a July
  // eleven months away.
  if (!dateMatched) {
    for (let index = 0; index < MONTH_NAMES.length; index++) {
      const aliases = MONTH_NAMES[index]!;
      const hit = aliases.find((alias) => rest.includes(` ${alias} `));
      if (!hit) continue;
      const year =
        index > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
      const key = monthKey(new Date(year, index, 1), cycleStartDay);
      const range = monthBounds(key, cycleStartDay);
      filter.from = range.from;
      filter.to = range.to;
      terms.push({
        kind: "date",
        label: `${aliases[0]![0]!.toUpperCase()}${aliases[0]!.slice(1)} ${year}`,
      });
      rest = consume(rest, hit);
      break;
    }
  }

  // --- Accounts ------------------------------------------------------------
  // Generic words first: "credit card" should mean every card you own.
  const cardAccounts = context.accounts.filter((a) => a.type === "CREDIT_CARD");
  if (
    cardAccounts.length > 0 &&
    (rest.includes(" credit card ") || rest.includes(" card "))
  ) {
    filter.accountIds = cardAccounts.map((a) => a.id);
    terms.push({ kind: "account", label: "Credit cards" });
    rest = consume(rest, rest.includes(" credit card ") ? "credit card" : "card");
  } else {
    const named = context.accounts.find(
      (account) =>
        rest.includes(` ${account.name.toLowerCase()} `) ||
        account.name
          .toLowerCase()
          .split(/\s+/)
          .some(
            (word) =>
              word.length >= 4 &&
              !GENERIC_ACCOUNT_WORDS.has(word) &&
              rest.includes(` ${word} `),
          ),
    );
    if (named) {
      filter.accountIds = [named.id];
      terms.push({ kind: "account", label: named.name });
      const lower = named.name.toLowerCase();
      rest = rest.includes(` ${lower} `)
        ? consume(rest, lower)
        : consume(
            rest,
            lower
              .split(/\s+/)
              .find(
                (word) =>
                  word.length >= 4 &&
                  !GENERIC_ACCOUNT_WORDS.has(word) &&
                  rest.includes(` ${word} `),
              ) ?? "",
          );
    }
  }

  // --- Categories ----------------------------------------------------------
  // Longest name first, so "group dinners" wins over "dinners".
  const sortedCategories = [...context.categories].sort(
    (a, b) => b.name.length - a.name.length,
  );
  for (const category of sortedCategories) {
    const name = category.name.toLowerCase();
    if (name.length < 3 || !rest.includes(` ${name} `)) continue;
    if (category.parentId === null) {
      filter.groupIds = [...(filter.groupIds ?? []), category.id];
    } else {
      filter.categoryIds = [...(filter.categoryIds ?? []), category.id];
    }
    terms.push({ kind: "category", label: category.name });
    rest = consume(rest, name);
    break;
  }

  // --- Contexts ------------------------------------------------------------
  for (const definition of CONTEXT_DEFINITIONS) {
    const label = definition.label.toLowerCase();
    const hit = rest.includes(` ${definition.value} `)
      ? definition.value
      : rest.includes(` ${label} `)
        ? label
        : null;
    if (!hit) continue;
    filter.contexts = [...(filter.contexts ?? []), definition.value];
    terms.push({ kind: "context", label: definition.label });
    rest = consume(rest, hit);
  }

  // --- Transaction type ----------------------------------------------------
  for (const option of TYPE_WORDS) {
    const hit = option.words.find((word) => rest.includes(` ${word} `));
    if (!hit) continue;
    filter.types = [option.type];
    terms.push({ kind: "type", label: option.label });
    rest = consume(rest, hit);
    break;
  }

  // --- Whatever is left ----------------------------------------------------
  // Filler words are dropped rather than searched. "uber in july" must not
  // also require the description to contain "in" — that silently excludes
  // rows for a word the user only typed to make the sentence read properly.
  const leftover = rest
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 1 && !QUERY_FILLER.has(word))
    .join(" ");
  if (leftover) {
    filter.text = leftover;
    terms.push({ kind: "text", label: `"${leftover}"` });
  }

  return { filter, terms };
}

function matchesText(transaction: Transaction, needle: string): boolean {
  const haystack = [
    transaction.description,
    transaction.merchant ?? "",
    transaction.notes ?? "",
  ]
    .join(" ")
    .toLowerCase();
  // Every word must appear, so "uber office" narrows rather than widens.
  return needle
    .split(/\s+/)
    .every((word) => !word || haystack.includes(word));
}

export function filterTransactions(
  transactions: Transaction[],
  filter: TransactionFilter,
): Transaction[] {
  return transactions.filter((t) => {
    if (filter.types && !filter.types.includes(t.type)) return false;
    if (filter.minAmount !== undefined && t.amount < filter.minAmount) return false;
    if (filter.maxAmount !== undefined && t.amount > filter.maxAmount) return false;

    // Dates are compared as "YYYY-MM-DD" prefixes; the stored value is local
    // wall-clock ISO, so string comparison is both correct and cheap.
    const day = t.date.slice(0, 10);
    if (filter.from && day < filter.from) return false;
    if (filter.to && day > filter.to) return false;

    if (filter.accountIds?.length) {
      const hit =
        (t.accountId && filter.accountIds.includes(t.accountId)) ||
        (t.toAccountId && filter.accountIds.includes(t.toAccountId));
      if (!hit) return false;
    }

    if (filter.groupIds?.length) {
      if (!t.categoryId) return false;
      if (!filter.groupIds.includes(groupIdOf(t.categoryId))) return false;
    }

    if (filter.categoryIds?.length) {
      if (!t.categoryId || !filter.categoryIds.includes(t.categoryId)) return false;
    }

    if (filter.contexts?.length) {
      const values = new Set(t.contexts.map((c) => c.value));
      if (!filter.contexts.every((value) => values.has(value))) return false;
    }

    if (filter.text && !matchesText(t, filter.text)) return false;

    if (
      filter.needsReview &&
      !(t.type === "EXPENSE" && t.categoryId === UNCATEGORISED_ID)
    ) {
      return false;
    }

    return true;
  });
}

export interface SearchSummary {
  count: number;
  /** EXPENSE rows only — a salary in the results must not read as spending. */
  spent: Paise;
  expenseCount: number;
  averageExpense: Paise;
  income: Paise;
  moved: Paise;
  largest: Transaction | undefined;
}

export function summariseResults(rows: Transaction[]): SearchSummary {
  const expenses = rows.filter((t) => t.type === "EXPENSE");
  const spent = total(expenses);
  return {
    count: rows.length,
    spent,
    expenseCount: expenses.length,
    averageExpense: expenses.length ? Math.round(spent / expenses.length) : 0,
    income: total(rows.filter((t) => t.type === "INCOME")),
    moved: total(
      rows.filter((t) => t.type === "TRANSFER" || t.type === "INVESTMENT"),
    ),
    largest: expenses.reduce<Transaction | undefined>(
      (best, t) => (!best || t.amount > best.amount ? t : best),
      undefined,
    ),
  };
}

export function isFilterEmpty(filter: TransactionFilter): boolean {
  return (
    !filter.text &&
    !filter.groupIds?.length &&
    !filter.categoryIds?.length &&
    !filter.contexts?.length &&
    !filter.accountIds?.length &&
    !filter.types?.length &&
    filter.minAmount === undefined &&
    filter.maxAmount === undefined &&
    !filter.from &&
    !filter.to &&
    !filter.needsReview
  );
}

/** Merges the typed query over the filter-bar selections. Query wins. */
export function mergeFilters(
  base: TransactionFilter,
  overlay: TransactionFilter,
): TransactionFilter {
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(overlay).filter(([, value]) =>
        Array.isArray(value) ? value.length > 0 : value !== undefined,
      ),
    ),
  };
}
