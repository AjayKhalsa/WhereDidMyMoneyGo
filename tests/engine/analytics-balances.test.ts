import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  accountBalance,
  creditCardCreditBalance,
  creditCardOutstanding,
  liquidBalance,
  totalCommitted,
} from "@/lib/engine/analytics";

import {
  at,
  expense,
  income,
  investmentTxn,
  makeAccount,
  makeCard,
  rs,
  transfer,
} from "../helpers/factories";

/**
 * Balances are where wrong signs hide: nothing throws, the number is simply
 * off, and it stays off until someone reconciles against a real statement.
 * Each of the four ways money can touch a card is pinned separately, because
 * they are four separate branches that have each been wrong at some point.
 */

describe("accountBalance", () => {
  const bank = makeAccount({ name: "HDFC", openingBalance: rs(10_000) });

  test("starts at the opening balance", () => {
    assert.equal(accountBalance(bank, []), rs(10_000));
  });

  test("income adds, expense subtracts", () => {
    const rows = [
      income({ accountId: bank.id, amount: rs(5000) }),
      expense({ accountId: bank.id, amount: rs(2000) }),
    ];
    assert.equal(accountBalance(bank, rows), rs(13_000));
  });

  test("a transfer out subtracts and a transfer in adds", () => {
    const other = makeAccount({ name: "ICICI", openingBalance: 0 });
    const move = transfer({
      accountId: bank.id,
      toAccountId: other.id,
      amount: rs(8000),
    });
    assert.equal(accountBalance(bank, [move]), rs(2000));
    assert.equal(accountBalance(other, [move]), rs(8000));
  });

  test("an investment leaves the account without being spending", () => {
    const sip = investmentTxn({ accountId: bank.id, amount: rs(3000) });
    assert.equal(accountBalance(bank, [sip]), rs(7000));
  });

  test("a balance can go negative and must not be clamped", () => {
    // Clamping here silently hid an overdrawn account behind a cheerful ₹0.
    const empty = makeAccount({ openingBalance: 0 });
    const rows = [expense({ accountId: empty.id, amount: rs(500) })];
    assert.equal(accountBalance(empty, rows), rs(-500));
  });

  test("a reconciliation adjustment still moves the balance", () => {
    // Excluded from Income/Spent, but it must move real cash — that is the
    // entire purpose of an adjustment.
    const rows = [
      income({ accountId: bank.id, amount: rs(1500), categoryId: "adjustment" }),
    ];
    assert.equal(accountBalance(bank, rows), rs(11_500));
  });

  test("ignores transactions belonging to other accounts", () => {
    const elsewhere = makeAccount();
    const rows = [expense({ accountId: elsewhere.id, amount: rs(9999) })];
    assert.equal(accountBalance(bank, rows), rs(10_000));
  });
});

describe("liquidBalance", () => {
  test("sums bank and cash, excluding cards and inactive accounts", () => {
    const accounts = [
      makeAccount({ name: "HDFC", type: "BANK", openingBalance: rs(17_066) }),
      makeAccount({ name: "Wallet", type: "CASH", openingBalance: rs(2000) }),
      makeCard({ openingBalance: rs(999_999) }),
      makeAccount({ name: "Closed", type: "BANK", openingBalance: rs(50_000), isActive: false }),
    ];
    assert.equal(liquidBalance(accounts, []), rs(19_066));
  });

  test("a negative account drags the total down rather than being dropped", () => {
    const accounts = [
      makeAccount({ name: "A", openingBalance: rs(5000) }),
      makeAccount({ name: "B", openingBalance: rs(-2000) }),
    ];
    assert.equal(liquidBalance(accounts, []), rs(3000));
  });
});

describe("credit card balances", () => {
  const card = makeCard();
  const bank = makeAccount();

  test("a charge on the card increases what's owed", () => {
    const rows = [expense({ accountId: card.id, amount: rs(1000) })];
    assert.equal(creditCardOutstanding(rows, card.id), rs(1000));
  });

  test("a transfer into the card pays it down", () => {
    const rows = [
      expense({ accountId: card.id, amount: rs(1000) }),
      transfer({ accountId: bank.id, toAccountId: card.id, amount: rs(400) }),
    ];
    assert.equal(creditCardOutstanding(rows, card.id), rs(600));
  });

  test("a transfer out of the card is a cash advance and increases the debt", () => {
    const rows = [transfer({ accountId: card.id, toAccountId: bank.id, amount: rs(5000) })];
    assert.equal(creditCardOutstanding(rows, card.id), rs(5000));
  });

  test("a refund credited to the card reduces what's owed", () => {
    const rows = [
      expense({ accountId: card.id, amount: rs(2000) }),
      income({ accountId: card.id, amount: rs(500), isRefund: true }),
    ];
    assert.equal(creditCardOutstanding(rows, card.id), rs(1500));
  });

  test("non-refund income on a card is not treated as a payment", () => {
    const rows = [
      expense({ accountId: card.id, amount: rs(2000) }),
      income({ accountId: card.id, amount: rs(500) }),
    ];
    assert.equal(creditCardOutstanding(rows, card.id), rs(2000));
  });

  test("overpaying shows as a credit, not a negative outstanding", () => {
    const rows = [
      expense({ accountId: card.id, amount: rs(1000) }),
      transfer({ accountId: bank.id, toAccountId: card.id, amount: rs(1500) }),
    ];
    assert.equal(creditCardOutstanding(rows, card.id), 0);
    assert.equal(creditCardCreditBalance(rows, card.id), rs(500));
  });

  test("outstanding and credit are mutually exclusive", () => {
    const owed = [expense({ accountId: card.id, amount: rs(1000) })];
    assert.equal(creditCardCreditBalance(owed, card.id), 0);
    assert.equal(creditCardOutstanding(owed, card.id), rs(1000));
  });

  test("paying a card in full leaves nothing owed and nothing credited", () => {
    const rows = [
      expense({ accountId: card.id, amount: rs(58_845.3) }),
      transfer({ accountId: bank.id, toAccountId: card.id, amount: rs(58_845.3) }),
    ];
    assert.equal(creditCardOutstanding(rows, card.id), 0);
    assert.equal(creditCardCreditBalance(rows, card.id), 0);
  });

  test("paying a card moves cash out of the bank exactly once", () => {
    // The invariant behind "paying a card leaves Safe to spend unchanged":
    // one payment, one debit, one reduction in debt.
    const funded = makeAccount({ openingBalance: rs(20_000) });
    const rows = [
      expense({ accountId: card.id, amount: rs(5000) }),
      transfer({ accountId: funded.id, toAccountId: card.id, amount: rs(5000) }),
    ];
    assert.equal(accountBalance(funded, rows), rs(15_000));
    assert.equal(creditCardOutstanding(rows, card.id), 0);
  });
});

describe("totalCommitted", () => {
  test("sums outstanding across active cards only", () => {
    const a = makeCard({ name: "HSBC" });
    const b = makeCard({ name: "Axis" });
    const closed = makeCard({ name: "Old", isActive: false });
    const rows = [
      expense({ accountId: a.id, amount: rs(19_301) }),
      expense({ accountId: b.id, amount: rs(2000) }),
      expense({ accountId: closed.id, amount: rs(90_000) }),
    ];
    assert.equal(totalCommitted([a, b, closed], rows), rs(21_301));
  });

  test("a card sitting on a credit contributes nothing rather than a negative", () => {
    const card = makeCard();
    const bank = makeAccount();
    const rows = [transfer({ accountId: bank.id, toAccountId: card.id, amount: rs(500) })];
    assert.equal(totalCommitted([card], rows), 0);
  });

  test("dates are irrelevant — this is a lifetime figure", () => {
    const card = makeCard();
    const rows = [
      expense({ accountId: card.id, amount: rs(1000), date: at("2024-01-01") }),
      expense({ accountId: card.id, amount: rs(1000), date: at("2026-08-01") }),
    ];
    assert.equal(totalCommitted([card], rows), rs(2000));
  });
});
