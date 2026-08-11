import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { deriveRulePattern, learnFromEntry, sortRules } from "@/lib/engine/learning";
import { makeContext } from "@/lib/domain/contexts";

import { makeRule } from "../helpers/factories";

/**
 * The app should stop asking a question it has already been answered. The
 * risk is the opposite failure: learning the *wrong* word, so two unrelated
 * purchases fight over one rule and each correction breaks the other.
 */

describe("deriveRulePattern", () => {
  test("prefers a known merchant name", () => {
    assert.equal(deriveRulePattern("dinner at swiggy tonight"), "swiggy");
  });

  test("otherwise takes the longest meaningful word", () => {
    assert.equal(deriveRulePattern("bought groceries for the week"), "groceries");
  });

  test("never learns the app's own context vocabulary", () => {
    // "birthday", "work", "solo" describe who and why, not what. Letting one
    // become a pattern means an unrelated category silently overwrites it the
    // next time either gets corrected.
    assert.equal(deriveRulePattern("birthday"), null);
    assert.equal(deriveRulePattern("solo"), null);
    assert.equal(deriveRulePattern("with friends"), null);
  });

  test("still learns the merchant when context words are also present", () => {
    assert.equal(deriveRulePattern("swiggy for a birthday"), "swiggy");
  });

  test("ignores stop words, short words and bare numbers", () => {
    assert.equal(deriveRulePattern("at the 500"), null);
  });

  test("returns null rather than throwing on empty input", () => {
    assert.equal(deriveRulePattern(""), null);
    assert.equal(deriveRulePattern("   "), null);
  });
});

describe("learnFromEntry", () => {
  test("writes a new rule the first time a word is explained", () => {
    const [rule] = learnFromEntry(
      {
        description: "groceries from the market",
        categoryId: "essentials",
        contexts: [],
        wasCorrected: true,
      },
      [],
    );
    assert.equal(rule?.pattern, "groceries");
    assert.equal(rule?.categoryId, "essentials");
    assert.equal(rule?.timesApplied, 1);
  });

  test("learns nothing when there is no word worth keying on", () => {
    const out = learnFromEntry(
      { description: "birthday", categoryId: "dining", contexts: [], wasCorrected: true },
      [],
    );
    assert.deepEqual(out, []);
  });

  test("an unchallenged guess makes the rule more trusted", () => {
    const existing = makeRule({ pattern: "uber", categoryId: "transport", confidence: 0.6, timesApplied: 3 });
    const [updated] = learnFromEntry(
      {
        description: "uber to office",
        categoryId: "transport",
        contexts: [],
        matchedRuleId: existing.id,
        wasCorrected: false,
      },
      [existing],
    );
    assert.ok((updated?.confidence ?? 0) > 0.6);
    assert.equal(updated?.timesApplied, 4);
    assert.equal(updated?.id, existing.id, "the same rule, not a duplicate");
  });

  test("a correction rewrites the rule and knocks confidence down", () => {
    // One correction must not immediately become gospel.
    const existing = makeRule({ pattern: "uber", categoryId: "transport", confidence: 0.95, timesApplied: 9 });
    const [updated] = learnFromEntry(
      {
        description: "uber eats dinner",
        categoryId: "dining",
        contexts: [],
        matchedRuleId: existing.id,
        wasCorrected: true,
      },
      [existing],
    );
    assert.equal(updated?.categoryId, "dining");
    assert.ok((updated?.confidence ?? 1) < 0.95);
    assert.equal(updated?.timesApplied, 1, "trust restarts after a correction");
  });

  test("confidence never exceeds its ceiling however often it is confirmed", () => {
    let rules = [makeRule({ pattern: "uber", categoryId: "transport", confidence: 0.9 })];
    for (let i = 0; i < 20; i++) {
      rules = learnFromEntry(
        {
          description: "uber to office",
          categoryId: "transport",
          contexts: [],
          matchedRuleId: rules[0]?.id,
          wasCorrected: false,
        },
        rules,
      );
    }
    assert.ok((rules[0]?.confidence ?? 1) <= 0.98);
  });

  test("confidence never falls below the floor however often it is corrected", () => {
    let rules = [makeRule({ pattern: "uber", categoryId: "transport", confidence: 0.7 })];
    for (let i = 0; i < 10; i++) {
      rules = learnFromEntry(
        {
          description: "uber something",
          categoryId: `cat_${i}`,
          contexts: [],
          matchedRuleId: rules[0]?.id,
          wasCorrected: true,
        },
        rules,
      );
    }
    assert.ok((rules[0]?.confidence ?? 0) >= 0.6);
  });

  test("date-derived contexts are never stored on a rule", () => {
    // "weekend" is a property of when it happened, not of the merchant —
    // storing it would re-apply it to a Tuesday.
    const [rule] = learnFromEntry(
      {
        description: "groceries run",
        categoryId: "essentials",
        contexts: [makeContext("weekend"), makeContext("friends")],
        wasCorrected: true,
      },
      [],
    );
    const values = rule?.contexts.map((c) => c.value) ?? [];
    assert.ok(!values.includes("weekend"));
    assert.ok(values.includes("friends"));
  });

  test("an existing rule is found by pattern even without a matched id", () => {
    const existing = makeRule({ pattern: "groceries", categoryId: "essentials", timesApplied: 2 });
    const out = learnFromEntry(
      {
        description: "groceries run",
        categoryId: "essentials",
        contexts: [],
        wasCorrected: false,
      },
      [existing],
    );
    assert.equal(out.length, 1);
    assert.equal(out[0]?.id, existing.id, "must not create a second rule for the same word");
  });
});

describe("sortRules", () => {
  test("orders by how often applied, then confidence, then alphabetically", () => {
    const rules = [
      makeRule({ pattern: "b", timesApplied: 1, confidence: 0.9 }),
      makeRule({ pattern: "a", timesApplied: 9, confidence: 0.5 }),
      makeRule({ pattern: "c", timesApplied: 1, confidence: 0.95 }),
    ];
    assert.deepEqual(sortRules(rules).map((r) => r.pattern), ["a", "c", "b"]);
  });

  test("does not mutate the input", () => {
    const rules = [
      makeRule({ pattern: "b", timesApplied: 1 }),
      makeRule({ pattern: "a", timesApplied: 9 }),
    ];
    const before = rules.map((r) => r.pattern);
    sortRules(rules);
    assert.deepEqual(rules.map((r) => r.pattern), before);
  });
});
