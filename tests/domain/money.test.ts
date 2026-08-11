import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  formatDelta,
  formatMoney,
  formatMoneyCompact,
  formatMoneyPrecise,
  parseAmountInput,
  percentChange,
  percentOf,
  rupeesToPaise,
  sum,
  sumBy,
} from "@/lib/domain/money";

/**
 * Every figure in the app is integer paise, rounded exactly once at display.
 * These tests pin both halves: that parsing never introduces a float, and that
 * a "no baseline" case reports nothing rather than an invented infinity.
 */

describe("rupeesToPaise", () => {
  test("keeps money integral", () => {
    assert.equal(rupeesToPaise(2400), 240_000);
    assert.equal(rupeesToPaise(12.5), 1250);
  });

  test("rounds a float artefact rather than storing it", () => {
    // 0.1 + 0.2 territory: the result must be an integer number of paise.
    const paise = rupeesToPaise(58_845.3);
    assert.equal(paise, 5_884_530);
    assert.ok(Number.isInteger(paise));
  });
});

describe("parseAmountInput", () => {
  test("accepts plain, grouped and symboled input", () => {
    assert.equal(parseAmountInput("2400"), 240_000);
    assert.equal(parseAmountInput("2,400"), 240_000);
    assert.equal(parseAmountInput("₹2400"), 240_000);
    assert.equal(parseAmountInput(" ₹ 2,400 "), 240_000);
  });

  test("accepts decimals", () => {
    assert.equal(parseAmountInput("12.50"), 1250);
    assert.equal(parseAmountInput("58845.30"), 5_884_530);
  });

  test("expands k / l / cr suffixes, case-insensitively", () => {
    assert.equal(parseAmountInput("2.4k"), 240_000);
    assert.equal(parseAmountInput("1.5L"), 15_000_000);
    assert.equal(parseAmountInput("1cr"), 1_000_000_000);
  });

  test("returns null for blank or unparseable input", () => {
    // null, not 0 — the caller must be able to tell "nothing typed" from "₹0".
    assert.equal(parseAmountInput(""), null);
    assert.equal(parseAmountInput("   "), null);
    assert.equal(parseAmountInput("abc"), null);
    assert.equal(parseAmountInput("12.4.5"), null);
    assert.equal(parseAmountInput("-500"), null);
  });
});

describe("formatting", () => {
  test("formatMoney rounds to whole rupees", () => {
    assert.equal(formatMoney(123_456), "₹1,235");
    assert.equal(formatMoney(0), "₹0");
  });

  test("formatMoneyPrecise keeps paise", () => {
    assert.equal(formatMoneyPrecise(5_884_530), "₹58,845.30");
  });

  test("formatMoneyCompact uses Indian units and keeps the sign", () => {
    assert.equal(formatMoneyCompact(rupeesToPaise(47_320)), "₹47.3k");
    assert.equal(formatMoneyCompact(rupeesToPaise(160_000)), "₹1.6L");
    assert.equal(formatMoneyCompact(rupeesToPaise(20_000_000)), "₹2.0Cr");
    assert.equal(formatMoneyCompact(rupeesToPaise(-1500)), "-₹1.5k");
    assert.equal(formatMoneyCompact(rupeesToPaise(250)), "₹250");
  });
});

describe("percentages", () => {
  test("percentChange returns null when there is no baseline", () => {
    // The UI must say "no history yet" rather than show an infinite increase.
    assert.equal(percentChange(5000, 0), null);
    assert.equal(percentChange(5000, -100), null);
  });

  test("percentChange computes a real delta", () => {
    assert.equal(percentChange(150, 100), 50);
    assert.equal(percentChange(50, 100), -50);
  });

  test("percentOf guards a zero whole", () => {
    assert.equal(percentOf(500, 0), 0);
    assert.equal(percentOf(25, 100), 25);
  });

  test("formatDelta renders a true minus sign and drops noise", () => {
    assert.equal(formatDelta(75.4), "+75%");
    assert.equal(formatDelta(-12.2), "−12%");
    assert.equal(formatDelta(0.2), "0%");
    assert.equal(formatDelta(null), null);
    assert.equal(formatDelta(Infinity), null);
  });
});

describe("sum helpers", () => {
  test("sum of nothing is zero, not NaN", () => {
    assert.equal(sum([]), 0);
    assert.equal(sumBy([], (x: number) => x), 0);
  });

  test("adds without float drift", () => {
    assert.equal(sum([1_706_630, 617_595, 423_613]), 2_747_838);
    assert.equal(sumBy([{ a: 100 }, { a: 250 }], (x) => x.a), 350);
  });
});
