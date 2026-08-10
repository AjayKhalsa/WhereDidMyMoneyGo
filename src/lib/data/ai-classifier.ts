import { makeContext } from "@/lib/domain/contexts";
import type { TransactionContext } from "@/lib/domain/types";
import { HIGH_CONFIDENCE, type ParseResult } from "@/lib/engine/parser";
import { UNCATEGORISED_ID } from "@/lib/domain/categories";

/**
 * Client side of the classifier fallback.
 *
 * This is the only network call in the entry path, and it is deliberately
 * *optional* in every sense: the deterministic result is already on screen
 * before this is invoked, a failure is swallowed silently, and the app is
 * fully usable with no API key configured at all.
 *
 * Lives in the data layer rather than the engine because the engine is pure
 * by rule — no IO, so it stays synchronous and testable.
 */

export interface Suggestion {
  categoryId: string;
  contexts: TransactionContext[];
  merchant?: string;
  /** Short plain-language explanation, shown next to the suggestion. */
  reason: string;
}

/**
 * Whether a parse is weak enough to be worth a second opinion.
 *
 * Two cases only: we landed on Uncategorised (the parser recognised nothing),
 * or confidence is genuinely low. Anything a learned rule matched is left
 * alone — the user already taught us that one, and overruling it with a model
 * would undo the whole point of the learning store.
 */
export function shouldAskForHelp(parse: ParseResult): boolean {
  if (parse.matchedRuleId) return false;
  if (parse.amount === null) return false;
  return parse.categoryId === UNCATEGORISED_ID || parse.confidence < 0.5;
}

/**
 * Asks the server route for a category.
 *
 * Returns null for every failure mode — no key configured, offline, timeout,
 * a hallucinated category id. The caller keeps the deterministic guess and the
 * user is never shown an error for a feature they did not ask for.
 */
export async function suggestClassification(
  text: string,
  signal?: AbortSignal,
): Promise<Suggestion | null> {
  try {
    const response = await fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      categoryId?: string;
      contexts?: string[];
      merchant?: string;
      reason?: string;
    };
    if (!data.categoryId) return null;

    return {
      categoryId: data.categoryId,
      contexts: (data.contexts ?? []).map((value) => makeContext(value)),
      merchant: data.merchant,
      reason: data.reason ?? "Suggested by the assistant",
    };
  } catch {
    return null;
  }
}

/** True once the deterministic parser is confident enough to save in one tap. */
export function isConfident(parse: ParseResult): boolean {
  return parse.confidence >= HIGH_CONFIDENCE;
}
