import type { Account } from "@/lib/domain/types";
import type { Token } from "./parser";

/**
 * Resolves account-name mentions in free text against the user's *live*
 * accounts (spec extension: transfer & credit-card-payment parsing).
 *
 * Deliberately not a static lexicon table like `MERCHANTS` — account names
 * are per-user data, not a shared vocabulary. And deliberately narrow in
 * how it's used: this only ever gets called from specific phrase shapes in
 * `parser.ts` (transfer, card-payment), never as a generic "any account
 * name anywhere in the text" resolver — a stray bank name inside an
 * unrelated expense should never be auto-matched.
 */

export interface AccountHit {
  account: Account;
  tokenIndex: number;
  matchedWord: string;
}

/**
 * Words that never anchor a match on their own — "card" or "bank" appearing
 * in a phrase says nothing about *which* account, only real name words do.
 * They still count toward the specificity score below, which is what lets
 * "paid HDFC card" resolve to "HDFC Credit Card" over "HDFC Bank" even
 * though both share the "hdfc" word.
 */
const GENERIC_WORDS = new Set([
  "bank",
  "account",
  "card",
  "credit",
  "savings",
  "current",
]);

function candidateWords(account: Account): string[] {
  return [...new Set(account.name.toLowerCase().split(/\s+/).filter(Boolean))];
}

/** How many of an account's own name-words actually appear in the phrase. */
function specificity(account: Account, phraseWords: string[]): number {
  return candidateWords(account).filter((w) => phraseWords.includes(w)).length;
}

export function matchAccountMentions(
  tokens: Token[],
  accounts: Account[],
): AccountHit[] {
  const active = accounts.filter((a) => a.isActive);
  if (active.length === 0) return [];
  const phraseWords = tokens.map((t) => t.clean);

  const byTokenIndex = new Map<
    number,
    { account: Account; matchedWord: string; score: number }[]
  >();

  tokens.forEach((token, tokenIndex) => {
    // A token can only anchor a match if it's a specific, non-generic word —
    // never resolve an account purely because the phrase says "card".
    if (token.clean.length < 3 || GENERIC_WORDS.has(token.clean)) return;
    for (const account of active) {
      if (!candidateWords(account).includes(token.clean)) continue;
      const list = byTokenIndex.get(tokenIndex) ?? [];
      list.push({
        account,
        matchedWord: token.clean,
        score: specificity(account, phraseWords),
      });
      byTokenIndex.set(tokenIndex, list);
    }
  });

  const hits: AccountHit[] = [];
  for (const [tokenIndex, candidates] of byTokenIndex) {
    const maxScore = Math.max(...candidates.map((c) => c.score));
    const winners = candidates.filter((c) => c.score === maxScore);
    const uniqueWinners = new Map(winners.map((w) => [w.account.id, w]));

    if (uniqueWinners.size === 1) {
      const winner = [...uniqueWinners.values()][0]!;
      hits.push({
        account: winner.account,
        tokenIndex,
        matchedWord: winner.matchedWord,
      });
      continue;
    }

    // Still tied on specificity — e.g. "HDFC Bank" and "HDFC Credit Card"
    // both scoring 1 on a bare "hdfc" mention with no "card"/"paid" nearby
    // to break the tie. Default to the single non-card account when there
    // is exactly one: plain "X to Y" language ordinarily means a spendable
    // account, not a card payment (which has its own "paid ... card" shape
    // handled separately and would already have broken this tie via score).
    const nonCard = [...uniqueWinners.values()].filter(
      (w) => w.account.type !== "CREDIT_CARD",
    );
    if (nonCard.length === 1) {
      hits.push({
        account: nonCard[0]!.account,
        tokenIndex,
        matchedWord: nonCard[0]!.matchedWord,
      });
    }
    // Otherwise genuinely ambiguous (two banks, or two cards) — drop it and
    // let AccountPicker be the resolution path, same as today.
  }

  return hits;
}
