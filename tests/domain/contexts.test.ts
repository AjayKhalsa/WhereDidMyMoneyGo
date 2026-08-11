import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  CONTEXT_DEFINITIONS,
  DERIVED_CONTEXT_VALUES,
  DIMENSION_ORDER,
  contextDefinition,
  contextLabel,
  contextScopeFor,
  derivedContexts,
  hasContext,
  makeContext,
  normaliseContexts,
} from "@/lib/domain/contexts";

import { at } from "../helpers/factories";

/**
 * Contexts are the second dimension on a transaction: a dinner can be Dining
 * *and* Dating *and* Alcohol without being counted three times. The subtle
 * part is that the same word can be two different facts (PEOPLE:work vs
 * PURPOSE:work), which is why de-duplication is keyed on the pair.
 */

describe("the context vocabulary", () => {
  test("every value is unique", () => {
    const values = CONTEXT_DEFINITIONS.map((c) => c.value);
    assert.equal(new Set(values).size, values.length);
  });

  test("every definition sits in a known dimension", () => {
    for (const def of CONTEXT_DEFINITIONS) {
      assert.ok(DIMENSION_ORDER.includes(def.type), `${def.value} has type ${def.type}`);
    }
  });

  test("the derived values exist in the vocabulary", () => {
    for (const value of DERIVED_CONTEXT_VALUES) {
      assert.ok(contextDefinition(value), `${value} is not defined`);
    }
  });
});

describe("contextLabel", () => {
  test("uses the defined label when there is one", () => {
    const def = CONTEXT_DEFINITIONS[0];
    assert.ok(def);
    assert.equal(contextLabel(def.value), def.label);
  });

  test("humanises an unknown value rather than showing a raw key", () => {
    assert.equal(contextLabel("late-night-snack"), "Late night snack");
  });
});

describe("makeContext", () => {
  test("takes the dimension from the vocabulary by default", () => {
    const def = CONTEXT_DEFINITIONS[0];
    assert.ok(def);
    assert.equal(makeContext(def.value).type, def.type);
  });

  test("honours an explicit dimension override", () => {
    // The picker passes the dimension a value was actually shown under, so
    // "work" as a cab's PURPOSE stays distinct from "work" as lunch's PEOPLE.
    assert.equal(makeContext("work", "PURPOSE").type, "PURPOSE");
    assert.equal(makeContext("work", "PEOPLE").type, "PEOPLE");
  });

  test("falls back to ATTRIBUTE for a value with no definition", () => {
    assert.equal(makeContext("something-new").type, "ATTRIBUTE");
  });
});

describe("normaliseContexts", () => {
  test("drops an exact repeat", () => {
    const out = normaliseContexts([
      makeContext("alcohol"),
      makeContext("alcohol"),
    ]);
    assert.equal(out.length, 1);
  });

  test("keeps the same value under two different dimensions", () => {
    // "with a colleague, for work" is two facts that share a word.
    const out = normaliseContexts([
      makeContext("work", "PEOPLE"),
      makeContext("work", "PURPOSE"),
    ]);
    assert.equal(out.length, 2);
  });

  test("preserves first-seen order", () => {
    const out = normaliseContexts([
      makeContext("friends"),
      makeContext("alcohol"),
      makeContext("friends"),
    ]);
    assert.deepEqual(out.map((c) => c.value), ["friends", "alcohol"]);
  });
});

describe("hasContext", () => {
  test("matches on value regardless of dimension", () => {
    const contexts = [makeContext("work", "PURPOSE")];
    assert.ok(hasContext(contexts, "work"));
    assert.ok(!hasContext(contexts, "friends"));
  });
});

describe("derivedContexts", () => {
  test("tags Saturday and Sunday as weekend", () => {
    assert.ok(derivedContexts(at("2026-08-08", 13)).some((c) => c.value === "weekend"));
    assert.ok(derivedContexts(at("2026-08-09", 13)).some((c) => c.value === "weekend"));
  });

  test("leaves a weekday untagged", () => {
    assert.deepEqual(derivedContexts(at("2026-08-10", 13)), []);
  });

  test("late-night runs from 22:00 to 03:59 inclusive", () => {
    const isLate = (hour: number) =>
      derivedContexts(at("2026-08-10", hour)).some((c) => c.value === "late-night");
    assert.ok(!isLate(21));
    assert.ok(isLate(22));
    assert.ok(isLate(23));
    assert.ok(isLate(0));
    assert.ok(isLate(3));
    assert.ok(!isLate(4));
  });

  test("a late Saturday night earns both tags", () => {
    const values = derivedContexts(at("2026-08-08", 23)).map((c) => c.value);
    assert.deepEqual(values.sort(), ["late-night", "weekend"]);
  });
});

describe("contextScopeFor", () => {
  test("offers dimensions relevant to the category", () => {
    const dining = contextScopeFor("dining");
    const offered = Object.values(dining).flat();
    assert.ok(offered.length > 0, "dining should offer some context values");
  });

  test("returns a usable scope for an unknown category", () => {
    // Never throw on a category the scope table hasn't heard of — the picker
    // must still render.
    const scope = contextScopeFor("no-such-category");
    assert.equal(typeof scope, "object");
  });

  test("returns a usable scope when the category is undefined", () => {
    assert.equal(typeof contextScopeFor(undefined), "object");
  });

  test("every offered value exists in the vocabulary", () => {
    const known = new Set(CONTEXT_DEFINITIONS.map((c) => c.value));
    for (const categoryId of ["dining", "transport", "shopping", "bills", "other"]) {
      for (const value of Object.values(contextScopeFor(categoryId)).flat()) {
        assert.ok(known.has(value), `${categoryId} offers unknown context "${value}"`);
      }
    }
  });
});
