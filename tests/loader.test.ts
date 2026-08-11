import assert from "node:assert/strict";
import test from "node:test";

// Guards the resolver itself, not the app: `@/` aliases and extensionless
// relative imports are the two forms plain Node cannot resolve, and every
// other test file in this suite depends on both working.
import { formatMoney } from "@/lib/domain/money";
import { creditCardOutstanding } from "@/lib/engine/analytics";

test("resolves the @/ path alias", () => {
  assert.equal(formatMoney(123456), "₹1,235");
});

test("resolves extensionless relative imports inside src/", () => {
  // analytics.ts reaches for "./lexicon", "@/lib/domain/types" and friends;
  // importing it at all proves the whole graph resolved.
  assert.equal(typeof creditCardOutstanding, "function");
});
