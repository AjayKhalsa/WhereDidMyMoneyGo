import { contextLabel, DERIVED_CONTEXT_VALUES, makeContext } from "./contexts";
import type { Transaction, TransactionContext } from "./types";

/** Labels are portable contexts, so existing local storage, sync and exports work. */
export function normaliseTag(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function extractTags(input: string): {
  text: string;
  contexts: TransactionContext[];
} {
  const contexts: TransactionContext[] = [];
  const text = input.replace(
    /(^|\s)#([\p{L}\p{N}][\p{L}\p{M}\p{N}_-]*)/gu,
    (_match, space: string, raw: string) => {
      const value = normaliseTag(raw);
      if (!value) return space;
      if (!contexts.some((c) => c.value === value))
        contexts.push(makeContext(value));
      return space;
    },
  );
  return { text, contexts };
}

export function savedTags(transactions: Transaction[]): TransactionContext[] {
  const tags = new Map<string, TransactionContext>();
  for (const t of transactions)
    for (const c of t.contexts) {
      if (!DERIVED_CONTEXT_VALUES.has(c.value))
        tags.set(`${c.type}:${c.value}`, c);
    }
  return [...tags.values()].sort(
    (a, b) =>
      contextLabel(a.value).localeCompare(contextLabel(b.value)) ||
      a.type.localeCompare(b.type),
  );
}
