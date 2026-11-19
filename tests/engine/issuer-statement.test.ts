import assert from "node:assert/strict";
import test from "node:test";
import { summariseCreditCard } from "@/lib/engine/analytics";
import { validCardStatement } from "@/lib/domain/card-statement";
import { expense, makeCard, makeCardDetail, transfer, rs } from "../helpers/factories";

test("an issuer bill is separate from total outstanding, counts payments once, and expires next cycle", () => {
  const card = makeCard();
  const detail = makeCardDetail({ accountId: card.id, statementDay: 13, dueDay: 3,
    reportedStatement: { issuedOn: "2026-11-13", dueOn: "2026-12-03", amount: rs(1959), source: "Issuer app", recordedAt: "2026-11-19T12:00:00Z" } });
  const rows = [expense({ accountId: card.id, amount: rs(1995), date: "2026-11-06T00:00:00" }),
    transfer({ toAccountId: card.id, amount: rs(500), date: "2026-11-14T00:00:00" }),
    expense({ accountId: card.id, amount: rs(100), date: "2026-11-18T00:00:00" })];
  const before = JSON.stringify(rows);
  const now = summariseCreditCard(card, detail, rows, new Date(2026, 10, 19));
  assert.equal(now.outstanding, rs(1595)); assert.equal(now.lastStatement?.amount, rs(1959));
  assert.equal(now.lastStatement?.paidAmount, rs(500)); assert.equal(now.lastStatement?.source, "issuer");
  assert.equal(now.lastStatement?.dueDate.getDate(), 3); assert.equal(now.currentCycle.spent, rs(100));
  assert.equal(JSON.stringify(rows), before);
  assert.equal(summariseCreditCard(card, detail, rows, new Date(2026, 11, 14)).lastStatement?.source, "ledger");
  assert.notEqual(summariseCreditCard(card, detail, rows, new Date(2026, 10, 10)).lastStatement?.source, "issuer");
});

test("estimated bills include carried balances and subtract payments already made before closing", () => {
  const card = makeCard(), detail = makeCardDetail({ accountId: card.id, statementDay: 13, dueDay: 3 });
  const rows = [expense({ accountId: card.id, amount: rs(1000), date: "2026-09-20T00:00:00" }),
    expense({ accountId: card.id, amount: rs(200), date: "2026-11-01T00:00:00" }),
    transfer({ toAccountId: card.id, amount: rs(900), date: "2026-11-05T00:00:00" })];
  const statement = summariseCreditCard(card, detail, rows, new Date(2026, 10, 19)).lastStatement;
  assert.equal(statement?.spent, rs(200)); assert.equal(statement?.amount, rs(300)); assert.equal(statement?.paidInFull, false);
});

test("invalid issuer evidence is rejected", () => {
  const s = { issuedOn: "2026-11-13", dueOn: "2026-12-03", amount: 195900, source: "Bank", recordedAt: "2026-11-19T00:00:00Z" };
  assert.equal(validCardStatement(s), true);
  for (const extra of [{ amount: -1 }, { amount: 1.5 }, { dueOn: "2026-11-01" }, { issuedOn: "2026-02-31" }, { source: "" }]) assert.equal(validCardStatement({ ...s, ...extra }), false);
});
