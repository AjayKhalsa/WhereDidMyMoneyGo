import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  ACTIVITIES,
  CONTEXT_KEYWORDS,
  MERCHANTS,
  STOP_WORDS,
} from "@/lib/engine/lexicon";
import { buildCategorySeed } from "@/lib/domain/categories";
import { CONTEXT_DEFINITIONS } from "@/lib/domain/contexts";
import { levenshteinDistance } from "@/lib/engine/fuzzy-match";
import { cleanBankNarration } from "@/lib/engine/narration";
import { matchAccountMentions } from "@/lib/engine/account-match";

import { makeAccount, makeCard } from "../helpers/factories";

/**
 * The lexicon is ~137 merchants and ~50 activities of hand-maintained data.
 * It never throws when it rots — a typo'd category id just quietly routes
 * spending into a bucket that does not exist. These structural checks are
 * cheap and catch exactly that.
 */

const categoryIds = new Set(buildCategorySeed().map((c) => c.id));
const contextValues = new Set(CONTEXT_DEFINITIONS.map((c) => c.value));

describe("merchant lexicon", () => {
  test("every merchant routes to a category that exists", () => {
    for (const m of MERCHANTS) {
      assert.ok(categoryIds.has(m.categoryId), `${m.name} → unknown "${m.categoryId}"`);
    }
  });

  test("every merchant context exists in the vocabulary", () => {
    for (const m of MERCHANTS) {
      for (const value of m.contexts ?? []) {
        assert.ok(contextValues.has(value), `${m.name} → unknown context "${value}"`);
      }
    }
  });

  test("aliases are lowercase, since matching lowercases the input", () => {
    for (const m of MERCHANTS) {
      for (const alias of m.aliases) {
        assert.equal(alias, alias.toLowerCase(), `${m.name}: "${alias}"`);
      }
    }
  });

  test("no alias is claimed by two different merchants", () => {
    // A duplicate silently makes one of them unreachable — whichever loses
    // the linear scan.
    const seen = new Map<string, string>();
    for (const m of MERCHANTS) {
      for (const alias of m.aliases) {
        const owner = seen.get(alias);
        assert.equal(owner, undefined, `"${alias}" claimed by both ${owner} and ${m.name}`);
        seen.set(alias, m.name);
      }
    }
  });

  test("no alias is also a stop word", () => {
    // A stop word is stripped before matching, so such an alias can never fire.
    for (const m of MERCHANTS) {
      for (const alias of m.aliases) {
        assert.ok(!STOP_WORDS.has(alias), `${m.name}: "${alias}" is a stop word`);
      }
    }
  });

  test("every merchant has at least one alias", () => {
    for (const m of MERCHANTS) {
      assert.ok(m.aliases.length > 0, `${m.name} can never be matched`);
    }
  });
});

describe("activity lexicon", () => {
  test("every activity routes to a category that exists", () => {
    for (const a of ACTIVITIES) {
      assert.ok(categoryIds.has(a.categoryId), `"${a.keywords[0]}" → unknown "${a.categoryId}"`);
    }
  });

  test("every activity context exists in the vocabulary", () => {
    for (const a of ACTIVITIES) {
      for (const value of a.contexts ?? []) {
        assert.ok(contextValues.has(value), `"${a.keywords[0]}" → unknown context "${value}"`);
      }
    }
  });

  test("keywords are lowercase and non-empty", () => {
    for (const a of ACTIVITIES) {
      assert.ok(a.keywords.length > 0);
      for (const k of a.keywords) assert.equal(k, k.toLowerCase());
    }
  });
});

describe("context keywords", () => {
  test("every keyword maps to a context that exists", () => {
    for (const entry of CONTEXT_KEYWORDS) {
      assert.ok(contextValues.has(entry.context), `unknown context "${entry.context}"`);
    }
  });
});

describe("levenshteinDistance", () => {
  test("is zero for identical strings", () => {
    assert.equal(levenshteinDistance("swiggy", "swiggy"), 0);
  });

  test("counts single-character edits", () => {
    assert.equal(levenshteinDistance("swiggy", "swigy"), 1);
    assert.equal(levenshteinDistance("uber", "ubar"), 1);
  });

  test("is symmetric", () => {
    assert.equal(
      levenshteinDistance("zomato", "zomat"),
      levenshteinDistance("zomat", "zomato"),
    );
  });

  test("handles an empty string as the full length of the other", () => {
    assert.equal(levenshteinDistance("", "uber"), 4);
    assert.equal(levenshteinDistance("", ""), 0);
  });
});

describe("cleanBankNarration", () => {
  test("strips UPI rail noise down to the merchant", () => {
    const { cleaned } = cleanBankNarration("UPI-DISTRICT DINING-DISTRICTDINING@HDFC-123456789012");
    assert.match(cleaned, /district/i);
    assert.match(cleaned, /dining/i);
    assert.ok(!cleaned.includes("@"));
    assert.ok(!/\d{10,}/.test(cleaned));
  });

  test("canonicalises a bank interest credit", () => {
    const result = cleanBankNarration("INT.PD:01APR2026-30JUN2026");
    assert.equal(result.cleaned, "interest");
    assert.equal(result.typeHint, "INCOME");
  });

  test("types a credit-card bill payment as a transfer", () => {
    assert.equal(cleanBankNarration("CRED CLUB CREDIT CARD PAYMENT").typeHint, "TRANSFER");
  });

  test("a card fee is not a card payment", () => {
    // Spending against the card, not money moving towards it.
    assert.equal(cleanBankNarration("ANNUAL FEE-CREDIT CARD").typeHint, undefined);
    assert.equal(cleanBankNarration("LATE PAYMENT PENALTY-CREDIT CARD").typeHint, undefined);
  });

  test("an ACH SIP mandate reads as an investment", () => {
    assert.equal(cleanBankNarration("ACH-HDFC MUTUAL FUND SIP-FOLIO123").typeHint, "INVESTMENT");
  });

  test("strips IFSC codes", () => {
    const { cleaned } = cleanBankNarration("NEFT-BARB0VJSBXX-RENT PAYMENT");
    assert.ok(!/barb0vjsbxx/i.test(cleaned));
    assert.match(cleaned, /rent/i);
  });

  test("never returns an empty string", () => {
    // Falls back to the original rather than handing the parser nothing.
    assert.ok(cleanBankNarration("UPI-").cleaned.length > 0);
    assert.ok(cleanBankNarration("123456789012").cleaned.length > 0);
  });

  test("an ordinary narration passes through readable", () => {
    assert.match(cleanBankNarration("SWIGGY BANGALORE").cleaned, /swiggy/i);
  });
});

describe("matchAccountMentions", () => {
  const hdfcBank = makeAccount({ name: "HDFC Bank" });
  const hdfcCard = makeCard({ name: "HDFC Credit Card" });
  const icici = makeAccount({ name: "ICICI" });

  /** It consumes the parser's tokens, never raw text. */
  const tokens = (phrase: string) =>
    phrase
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((raw) => ({ raw, clean: raw }));

  test("finds an account named in the phrase", () => {
    const hits = matchAccountMentions(tokens("transfer to icici"), [hdfcBank, icici]);
    assert.ok(hits.some((h) => h.account.id === icici.id));
  });

  test("does not match an account that was not mentioned", () => {
    const hits = matchAccountMentions(tokens("transfer to icici"), [hdfcBank, icici]);
    assert.ok(!hits.some((h) => h.account.id === hdfcBank.id));
  });

  test("returns nothing for a phrase with no account names", () => {
    assert.deepEqual(matchAccountMentions(tokens("dinner with friends"), [hdfcBank, icici]), []);
  });

  test("the more specific name wins when two accounts share a word", () => {
    // "paid HDFC card" must resolve to the card, not the bank, even though
    // both contain "hdfc".
    const hits = matchAccountMentions(tokens("paid hdfc card"), [hdfcBank, hdfcCard]);
    assert.equal(hits[0]?.account.id, hdfcCard.id);
  });

  test("a generic word alone never anchors a match", () => {
    // "card" says nothing about *which* account.
    assert.deepEqual(matchAccountMentions(tokens("paid the card"), [hdfcBank]), []);
  });
});
