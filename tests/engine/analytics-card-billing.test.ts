import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { summariseCardBilling, summariseCreditCard } from "@/lib/engine/analytics";
import { daysBetween } from "@/lib/domain/dates";

import {
  at,
  expense,
  makeAccount,
  makeCard,
  makeCardDetail,
  rs,
  transfer,
} from "../helpers/factories";

/**
 * A card's billing cycle is independent of the personal pay cycle, and its
 * boundary was wrong twice before it was right.
 *
 * Ground truth is the user's real HSBC Travel One card: statement day 25, due
 * day 9. Their real statement dated 25 Jul totalled ₹58,845.30 and was paid
 * in full by a BBPS payment of exactly that amount — which proves a statement
 * dated the 25th covers charges only up to the 24th. The 25th itself is the
 * first day of the next cycle.
 */

const NOW = new Date(2026, 7, 10); // 10 Aug 2026
const card = makeCard({ name: "HSBC Travel One" });
const detail = makeCardDetail({ accountId: card.id, statementDay: 25, dueDay: 9 });
const bank = makeAccount();

/** A charge on the card, dated. */
const charge = (date: string, amount: number) =>
  expense({ accountId: card.id, amount: rs(amount), date: at(date) });

describe("summariseCardBilling — the real HSBC numbers", () => {
  const history = [
    charge("2026-06-29", 5898.82),
    charge("2026-07-07", 10_055.08),
    charge("2026-07-24", 4715.4),
    charge("2026-07-25", 2597.4), // dated the statement day itself
  ];

  test("the closed statement runs 25 Jun to 24 Jul", () => {
    const { lastStatement } = summariseCardBilling(card, detail, history, NOW);
    assert.ok(lastStatement);
    assert.equal(lastStatement.start.getMonth(), 5);
    assert.equal(lastStatement.start.getDate(), 25);
    assert.equal(lastStatement.end.getMonth(), 6);
    assert.equal(lastStatement.end.getDate(), 24);
  });

  test("a charge dated on the statement day belongs to the NEXT cycle", () => {
    // This single day is the whole batch-5 bug: including it inflated the
    // statement to ₹61,442.70 against a real bill of ₹58,845.30.
    const { lastStatement, currentCycle } = summariseCardBilling(
      card,
      detail,
      history,
      NOW,
    );
    assert.ok(lastStatement);
    assert.equal(lastStatement.spent, rs(5898.82 + 10_055.08 + 4715.4));
    assert.equal(currentCycle.spent, rs(2597.4));
  });

  test("the current cycle runs 25 Jul to 24 Aug", () => {
    const { currentCycle } = summariseCardBilling(card, detail, history, NOW);
    assert.equal(currentCycle.start.getMonth(), 6);
    assert.equal(currentCycle.start.getDate(), 25);
    assert.equal(currentCycle.end.getMonth(), 7);
    assert.equal(currentCycle.end.getDate(), 24);
  });

  test("adjacent cycles are contiguous — no gap, no double-counted day", () => {
    const { lastStatement, currentCycle } = summariseCardBilling(
      card,
      detail,
      history,
      NOW,
    );
    assert.ok(lastStatement);
    assert.equal(daysBetween(lastStatement.end, currentCycle.start), 1);
  });

  test("the due date is the 9th of the following month", () => {
    const { lastStatement } = summariseCardBilling(card, detail, history, NOW);
    assert.ok(lastStatement);
    assert.equal(lastStatement.dueDate.getMonth(), 7);
    assert.equal(lastStatement.dueDate.getDate(), 9);
  });
});

describe("paidInFull", () => {
  const history = [charge("2026-07-01", 58_845.3)];
  const payment = (amount: number) =>
    transfer({
      accountId: bank.id,
      toAccountId: card.id,
      amount: rs(amount),
      date: at("2026-07-27"),
    });

  test("an exact payment settles the statement", () => {
    const { lastStatement } = summariseCardBilling(
      card,
      detail,
      [...history, payment(58_845.3)],
      NOW,
    );
    assert.ok(lastStatement?.paidInFull);
  });

  test("a sub-rupee shortfall is rounding residue, not a debt", () => {
    // Hand-entered charges get rounded to the rupee; without tolerance a bill
    // short by ₹0.70 rendered an alarming — and wrong — "Overdue" chip.
    const { lastStatement } = summariseCardBilling(
      card,
      detail,
      [...history, payment(58_844.6)],
      NOW,
    );
    assert.ok(lastStatement?.paidInFull);
  });

  test("a real underpayment is still flagged", () => {
    const { lastStatement } = summariseCardBilling(
      card,
      detail,
      [...history, payment(58_795.3)], // ₹50 short
      NOW,
    );
    assert.ok(lastStatement);
    assert.equal(lastStatement.paidInFull, false);
  });

  test("an unpaid statement is not paid in full", () => {
    const { lastStatement } = summariseCardBilling(card, detail, history, NOW);
    assert.ok(lastStatement);
    assert.equal(lastStatement.paidInFull, false);
    assert.equal(lastStatement.paidAmount, 0);
  });

  test("a payment made before the statement closed does not count toward it", () => {
    // Payments are counted from the statement's close onward — money paid
    // mid-cycle settled the *previous* bill.
    const early = transfer({
      accountId: bank.id,
      toAccountId: card.id,
      amount: rs(58_845.3),
      date: at("2026-07-10"),
    });
    const { lastStatement } = summariseCardBilling(card, detail, [...history, early], NOW);
    assert.ok(lastStatement);
    assert.equal(lastStatement.paidAmount, 0);
  });
});

describe("summariseCardBilling — edge cases", () => {
  test("no statement is fabricated for a card with no prior activity", () => {
    const fresh = makeCard({ name: "New card" });
    const freshDetail = makeCardDetail({ accountId: fresh.id, statementDay: 25, dueDay: 9 });
    const rows = [expense({ accountId: fresh.id, amount: rs(500), date: at("2026-08-01") })];
    const { lastStatement, currentCycle } = summariseCardBilling(
      fresh,
      freshDetail,
      rows,
      NOW,
    );
    assert.equal(lastStatement, null);
    assert.equal(currentCycle.spent, rs(500));
  });

  test("a card with no detail falls back to calendar months", () => {
    const { currentCycle, lastStatement } = summariseCardBilling(card, undefined, [], NOW);
    assert.equal(currentCycle.start.getDate(), 1);
    assert.equal(currentCycle.start.getMonth(), 7);
    assert.equal(lastStatement, null, "no statement without a known statement day");
  });

  test("current-cycle spend stops at now, not at the cycle's future end", () => {
    // "Spent so far", never a figure that quietly includes a future-dated row.
    const rows = [charge("2026-07-26", 1000), charge("2026-08-20", 9999)];
    const { currentCycle } = summariseCardBilling(card, detail, rows, NOW);
    assert.equal(currentCycle.spent, rs(1000));
  });

  test("a statement day of 1 still produces contiguous cycles", () => {
    const first = makeCardDetail({ accountId: card.id, statementDay: 1, dueDay: 18 });
    const { currentCycle, lastStatement } = summariseCardBilling(
      card,
      first,
      [charge("2026-07-05", 1000)],
      NOW,
    );
    assert.equal(currentCycle.start.getDate(), 1);
    assert.ok(lastStatement);
    assert.equal(daysBetween(lastStatement.end, currentCycle.start), 1);
  });

  test("a statement day of 28 survives February", () => {
    const late = makeCardDetail({ accountId: card.id, statementDay: 28, dueDay: 15 });
    const febNow = new Date(2026, 2, 5); // 5 Mar 2026
    const { currentCycle, lastStatement } = summariseCardBilling(
      card,
      late,
      [charge("2026-02-01", 1000)],
      febNow,
    );
    assert.equal(currentCycle.start.getDate(), 28);
    assert.equal(currentCycle.start.getMonth(), 1);
    assert.ok(lastStatement);
    assert.equal(daysBetween(lastStatement.end, currentCycle.start), 1);
  });
});

describe("summariseCreditCard", () => {
  const rows = [charge("2026-07-01", 20_000), charge("2026-07-26", 2595)];

  test("outstanding is a lifetime figure, independent of the cycle", () => {
    const summary = summariseCreditCard(card, detail, rows, NOW);
    assert.equal(summary.outstanding, rs(22_595));
    assert.equal(summary.currentCycle.spent, rs(2595));
  });

  test("utilisation is a percentage of the credit limit", () => {
    const summary = summariseCreditCard(
      card,
      makeCardDetail({ accountId: card.id, statementDay: 25, dueDay: 9, creditLimit: rs(100_000) }),
      [charge("2026-07-01", 25_000)],
      NOW,
    );
    assert.equal(summary.utilisation, 25);
  });

  test("utilisation is null without a limit rather than dividing by zero", () => {
    const noLimit = makeCardDetail({ accountId: card.id, creditLimit: 0 });
    assert.equal(summariseCreditCard(card, noLimit, rows, NOW).utilisation, null);
  });

  test("daysUntilDue goes negative once a due date has passed", () => {
    // A real due date can pass unpaid; the UI needs to be able to say Overdue.
    const late = new Date(2026, 7, 15); // 15 Aug, past the 9 Aug due date
    const summary = summariseCreditCard(card, detail, rows, late);
    assert.ok(summary.daysUntilDue !== null && summary.daysUntilDue < 0);
  });

  test("a card with no statement has no due date at all", () => {
    const fresh = makeCard();
    const summary = summariseCreditCard(fresh, undefined, [], NOW);
    assert.equal(summary.dueDate, null);
    assert.equal(summary.daysUntilDue, null);
  });
});
