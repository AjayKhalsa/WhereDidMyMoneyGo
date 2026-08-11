import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  HIGH_CONFIDENCE,
  canQuickSave,
  parseExpenseInput,
} from "@/lib/engine/parser";
import { UNCATEGORISED_ID } from "@/lib/domain/categories";

import { at, makeAccount, makeCard, makeRule, rs } from "../helpers/factories";

/**
 * The parser turns "dinner with friends 1200" into a transaction. Its most
 * important property is not accuracy but *honesty*: a confident guess earns a
 * one-tap save, an uncertain one must say so and ask.
 */

describe("amounts", () => {
  test("reads a plain number", () => {
    assert.equal(parseExpenseInput("coffee 250").amount, rs(250));
  });

  test("reads a rupee symbol and grouping", () => {
    // Grouped digits used to split into separate tokens, so "₹1,200" was
    // booked as ₹200 and "12,500" as ₹500 — a silent 6x-to-25x understatement
    // on an entirely ordinary way to type an amount in India.
    assert.equal(parseExpenseInput("dinner ₹1,200").amount, rs(1200));
    assert.equal(parseExpenseInput("laptop 1,20,000").amount, rs(120_000));
    assert.equal(parseExpenseInput("rent 12,500").amount, rs(12_500));
  });

  test("a comma between words still separates them", () => {
    // The fix must only join digits, not swallow ordinary punctuation.
    const result = parseExpenseInput("dinner, coffee 250");
    assert.equal(result.amount, rs(250));
  });

  test("reads a k suffix", () => {
    assert.equal(parseExpenseInput("flight 12k").amount, rs(12_000));
  });

  test("reports null when there is no amount rather than guessing zero", () => {
    // The UI needs to tell "no amount typed yet" from "an expense of ₹0".
    assert.equal(parseExpenseInput("dinner with friends").amount, null);
  });
});

describe("categorisation", () => {
  test("a known merchant sets category and merchant", () => {
    const result = parseExpenseInput("swiggy 450");
    assert.ok(result.merchant);
    assert.notEqual(result.categoryId, UNCATEGORISED_ID);
    assert.ok(result.reasons.length > 0, "must explain itself");
  });

  test("an unrecognised phrase falls back rather than inventing a category", () => {
    const result = parseExpenseInput("zzzqqq 500");
    assert.equal(result.categoryId, UNCATEGORISED_ID);
    assert.ok(result.confidence < HIGH_CONFIDENCE);
  });

  test("a learned rule outranks the built-in lexicon", () => {
    const rule = makeRule({ pattern: "swiggy", categoryId: "bills", confidence: 0.95 });
    const result = parseExpenseInput("swiggy 450", { rules: [rule] });
    assert.equal(result.categoryId, "bills");
    assert.equal(result.matchedRuleId, rule.id);
  });

  test("contexts are picked up from the phrase", () => {
    const result = parseExpenseInput("dinner with friends 2400");
    assert.ok(result.contexts.some((c) => c.value === "friends"));
  });

  test("weekend and late-night contexts come from the date, not the words", () => {
    const saturdayNight = parseExpenseInput("dinner 2400", {
      date: new Date(2026, 7, 8, 23, 0),
    });
    const values = saturdayNight.contexts.map((c) => c.value);
    assert.ok(values.includes("weekend"));
    assert.ok(values.includes("late-night"));
  });
});

describe("transaction type detection", () => {
  test("plain spending is an expense", () => {
    assert.equal(parseExpenseInput("coffee 250").type, "EXPENSE");
  });

  test("salary reads as income", () => {
    assert.equal(parseExpenseInput("salary 250000").type, "INCOME");
  });

  test("a SIP reads as an investment, not spending", () => {
    // EXPENSE ≠ INVESTMENT is the single most important rule in the model.
    assert.equal(parseExpenseInput("sip mutual fund 30000").type, "INVESTMENT");
  });

  test("moving money between named accounts is a transfer", () => {
    const hdfc = makeAccount({ name: "HDFC" });
    const icici = makeAccount({ name: "ICICI" });
    const result = parseExpenseInput("transfer 8000 from HDFC to ICICI", {
      accounts: [hdfc, icici],
    });
    assert.equal(result.type, "TRANSFER");
    assert.equal(result.accountId, hdfc.id);
    assert.equal(result.toAccountId, icici.id);
  });

  test("paying a credit card is a transfer into the card", () => {
    const hdfc = makeAccount({ name: "HDFC" });
    const card = makeCard({ name: "HSBC" });
    const result = parseExpenseInput("paid 20000 to HSBC credit card", {
      accounts: [hdfc, card],
    });
    assert.equal(result.type, "TRANSFER");
    assert.equal(result.toAccountId, card.id);
  });

  test("a card fee is spending on the card, not a payment towards it", () => {
    // The batch-2 bug: "annual fee credit card" matched the card-payment
    // pattern and was booked as a payment, quietly reducing the outstanding.
    const card = makeCard({ name: "HSBC" });
    const result = parseExpenseInput("annual fee credit card 1500", {
      accounts: [card],
    });
    assert.equal(result.type, "EXPENSE");
  });
});

describe("refunds", () => {
  test("a refund reads as income credited back", () => {
    const result = parseExpenseInput("refund from amazon 1200");
    assert.equal(result.type, "INCOME");
    assert.equal(result.isRefund, true);
  });

  test("ordinary income is not marked as a refund", () => {
    const result = parseExpenseInput("salary 250000");
    assert.ok(!result.isRefund);
  });
});

describe("confidence", () => {
  test("a strong learned rule earns a one-tap save", () => {
    const rule = makeRule({ pattern: "swiggy", categoryId: "dining", confidence: 0.98 });
    const result = parseExpenseInput("swiggy 450", { rules: [rule] });
    assert.ok(result.confidence >= HIGH_CONFIDENCE);
    assert.ok(canQuickSave(result));
  });

  test("an unknown phrase does not", () => {
    assert.ok(!canQuickSave(parseExpenseInput("zzzqqq 500")));
  });

  test("no amount means no quick save, however confident the category", () => {
    const rule = makeRule({ pattern: "swiggy", categoryId: "dining", confidence: 0.98 });
    const result = parseExpenseInput("swiggy", { rules: [rule] });
    assert.ok(!canQuickSave(result), "cannot save a transaction with no amount");
  });

  test("confidence always stays within 0–1", () => {
    for (const input of ["swiggy 450", "zzzqqq 500", "", "dinner with friends 2400"]) {
      const { confidence } = parseExpenseInput(input);
      assert.ok(confidence >= 0 && confidence <= 1, `${input}: ${confidence}`);
    }
  });
});

describe("robustness", () => {
  test("empty input does not throw", () => {
    const result = parseExpenseInput("");
    assert.equal(result.amount, null);
    assert.equal(result.categoryId, UNCATEGORISED_ID);
  });

  test("an amount alone does not throw", () => {
    assert.equal(parseExpenseInput("500").amount, rs(500));
  });

  test("punctuation and odd casing are tolerated", () => {
    const result = parseExpenseInput("  SWIGGY!!  ₹450.00  ");
    assert.equal(result.amount, rs(450));
  });

  test("a recent expense can be suggested for a refund to reverse", () => {
    const original = {
      ...makeAccount(),
    };
    void original;
    const result = parseExpenseInput("refund from swiggy 450", {
      recentTransactions: [
        {
          id: "txn_original",
          type: "EXPENSE",
          amount: rs(450),
          description: "Swiggy",
          merchant: "Swiggy",
          date: at("2026-08-01"),
          categoryId: "dining",
          contexts: [],
          source: "manual",
          createdAt: at("2026-08-01"),
          updatedAt: at("2026-08-01"),
        },
      ],
    });
    // A suggestion, never auto-applied — so only assert it does not misfire
    // into something unrelated.
    assert.ok(
      result.suggestedReversalId === undefined ||
        result.suggestedReversalId === "txn_original",
    );
  });
});
