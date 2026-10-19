import assert from "node:assert/strict";
import test from "node:test";
import { buildCategorySeed } from "@/lib/domain/categories";
import { normaliseTag, extractTags, savedTags } from "@/lib/domain/tags";
import { makeContext } from "@/lib/domain/contexts";
import { parseExpenseInput } from "@/lib/engine/parser";
import { learnFromEntry } from "@/lib/engine/learning";
import { parseSearchQuery, filterTransactions } from "@/lib/engine/search";
import { expense, makeRule, rs } from "../helpers/factories";

test("custom labels normalize consistently and support non-Latin names", () => {
  assert.equal(normaliseTag(" #Goa Trip__2026! "), "goa-trip-2026");
  assert.equal(normaliseTag("घर खर्च"), "घर-खर्च");
  assert.equal(extractTags("450 lunch #घर-खर्च").contexts[0]?.value, "घर-खर्च");
  assert.equal(normaliseTag("!!!"), "");
  assert.ok(normaliseTag("a".repeat(100)).length <= 48);
  assert.equal(extractTags("#goa-trip #goa-trip").contexts.length, 1);
});

test("hashtags neither change the amount, transaction type nor category", () => {
  const result = parseExpenseInput("450 swiggy lunch #salary #2026 #goa-trip");
  assert.equal(result.amount, rs(450));
  assert.equal(result.type, "EXPENSE");
  assert.equal(result.categoryId, "dining.lunch");
  assert.ok(result.contexts.some((c) => c.value === "goa-trip"));
  assert.ok(!result.description.includes("goa-trip"));
});

test("built-in hashtags use the built-in dimension; timestamp facts cannot be authored", () => {
  const result = parseExpenseInput("450 dinner #friends #weekend #late-night", {
    date: new Date(2026, 7, 10, 12),
  });
  assert.ok(
    result.contexts.some((c) => c.value === "friends" && c.type === "PEOPLE"),
  );
  assert.ok(
    !result.contexts.some(
      (c) => c.value === "weekend" || c.value === "late-night",
    ),
  );
});

test("hashtag search intersects labels and works for labels absent from description", () => {
  const row = expense({
    contexts: [makeContext("goa-trip"), makeContext("friends")],
  });
  const parsed = parseSearchQuery("#goa-trip #friends", {
    categories: buildCategorySeed(),
    accounts: [],
    now: new Date(),
    cycleStartDay: 1,
  });
  assert.equal(parsed.filter.text, undefined);
  assert.deepEqual(filterTransactions([row, expense()], parsed.filter), [row]);
  assert.deepEqual(
    parseSearchQuery("#weekend", {
      categories: [],
      accounts: [],
      now: new Date(),
      cycleStartDay: 1,
    }).filter.contexts,
    ["weekend"],
  );
});

test("saved labels preserve dimensions and omit automatic time tags", () => {
  const tags = savedTags([
    expense({
      contexts: [
        makeContext("work", "PEOPLE"),
        makeContext("work", "PURPOSE"),
        makeContext("weekend"),
      ],
    }),
  ]);
  assert.equal(tags.length, 2);
});

test("explicit expense type refines a broad learned category", () => {
  const result = parseExpenseInput("450 swiggy lunch", {
    rules: [makeRule({ pattern: "swiggy", categoryId: "dining" })],
  });
  assert.equal(result.categoryId, "dining.lunch");
});

test("today's explicit meal overrides the previous meal learned for that merchant", () => {
  const result = parseExpenseInput("450 swiggy dinner", {
    rules: [makeRule({ pattern: "swiggy", categoryId: "dining.lunch" })],
  });
  assert.equal(result.categoryId, "dining.dinner");
  const mapped = parseExpenseInput("450 swiggy dinner", {
    rules: [makeRule({ pattern: "swiggy", categoryId: "bills" })],
  });
  assert.equal(
    mapped.categoryId,
    "bills",
    "user corrections across financial buckets still win",
  );
});

test("explicit phrase rules match word boundaries and outrank shorter rules", () => {
  const rule = makeRule({ pattern: "uber eats", categoryId: "dining" });
  assert.equal(
    parseExpenseInput("450 uber eats", { rules: [makeRule(), rule] })
      .matchedRuleId,
    rule.id,
  );
  assert.notEqual(
    parseExpenseInput("450 uber eatsomething", { rules: [rule] }).matchedRuleId,
    rule.id,
  );
});

test("payee-specific correction outranks a stronger generic mapping", () => {
  const scoped = makeRule({
    pattern: "swiggy",
    categoryId: "essentials",
    confidence: 0.6,
    learningEvidence: {
      source: "manual-correction",
      merchantKey: "swiggy",
      support: 1,
      exampleIds: [],
    },
  });
  assert.equal(
    parseExpenseInput("450 swiggy", {
      rules: [
        makeRule({ pattern: "swiggy", categoryId: "dining", confidence: 0.98 }),
        scoped,
      ],
    }).categoryId,
    "essentials",
  );
});

test("corrections never rewrite another payee's scoped rule with the same token", () => {
  const scoped = makeRule({
    pattern: "corner",
    categoryId: "dining",
    learningEvidence: {
      source: "manual-correction",
      merchantKey: "corner cafe",
      support: 1,
      exampleIds: [],
    },
  });
  const learned = learnFromEntry(
    {
      description: "corner shop",
      merchant: "corner shop",
      categoryId: "shopping",
      contexts: [],
      wasCorrected: true,
      matchedRuleId: scoped.id,
    },
    [scoped],
  );
  assert.notEqual(learned[0]?.id, scoped.id);
  assert.equal(scoped.categoryId, "dining");
});

test("one purchase's personal labels don't propagate through automatic learning", () => {
  const rules = learnFromEntry(
    {
      description: "uber",
      categoryId: "transport.cab",
      contexts: [
        makeContext("work", "PURPOSE"),
        makeContext("birthday"),
        makeContext("goa-trip"),
      ],
      wasCorrected: true,
    },
    [],
  );
  assert.deepEqual(rules[0]?.contexts, []);
  assert.ok(
    !parseExpenseInput("200 uber", { rules }).contexts.some((c) =>
      ["birthday", "goa-trip", "work"].includes(c.value),
    ),
  );
});
