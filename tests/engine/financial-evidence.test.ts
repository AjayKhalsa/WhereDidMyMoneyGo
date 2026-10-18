import assert from "node:assert/strict";
import test from "node:test";
import { netWorth, liquidBalance, valueInvestments } from "@/lib/engine/analytics";
import { balanceAt, balanceVerification, ledgerFingerprint } from "@/lib/engine/reconciliation";
import { expense, income, makeAccount, makeCard, makeInvestment, transfer, rs, at } from "../helpers/factories";

test("card overpayment is an asset, while spendable bank cash stays separate", () => {
  const bank = makeAccount({ openingBalance: rs(1000) });
  const card = makeCard();
  const rows = [expense({ accountId: card.id, amount: rs(100) }),
    transfer({ accountId: bank.id, toAccountId: card.id, amount: rs(150) })];
  assert.equal(liquidBalance([bank, card], rows), rs(850));
  assert.equal(netWorth([bank, card], rows, [], [], new Date()), rs(900));
  assert.equal(balanceAt(card, rows, "2099-01-01"), rs(-50));
});

test("linked redemption raises cash and lowers the marked portfolio by the same amount", () => {
  const bank = makeAccount({ openingBalance: 0 });
  const origin = makeAccount({ type: "INVESTMENT" });
  const holding = makeInvestment({ currentValue: rs(10000), valuedAt: at("2026-07-01") });
  const redemption = transfer({ accountId: origin.id, toAccountId: bank.id,
    investmentId: holding.id, amount: rs(2000), date: at("2026-10-01") });
  const now = new Date("2026-10-18");
  assert.equal(valueInvestments([holding], [redemption], now)[0]!.value, rs(8000));
  assert.equal(netWorth([bank, origin], [redemption], [holding], [], now), rs(10000));
  assert.equal(valueInvestments([holding], [{ ...redemption, investmentId: undefined }], now)[0]!.value, rs(10000));
  assert.equal(valueInvestments([{ ...holding, valuedAt: at("2026-10-02") }], [redemption], now)[0]!.value, rs(10000));
});

test("checkpoint becomes stale after backdated changes, even when amounts cancel", () => {
  const bank = makeAccount({ openingBalance: rs(100), openingBalanceAsOf: "2026-07-01" });
  const checkpoint = { balance: rs(100), asOf: "2026-10-18", source: "Statement",
    recordedAt: at("2026-10-18"), fingerprint: ledgerFingerprint(bank, [], "2026-10-18"), status: "verified" as const };
  const verified = { ...bank, reconciliation: checkpoint };
  assert.equal(balanceVerification(verified, []).status, "verified");
  const debit = expense({ accountId: bank.id, amount: rs(1), date: at("2026-10-01") });
  assert.equal(balanceVerification(verified, [debit]).status, "stale");
  assert.equal(balanceVerification(verified, [debit, income({ accountId: bank.id, amount: rs(1), date: debit.date })]).status, "stale");
  assert.equal(balanceVerification(verified, [{ ...debit, date: at("2026-10-19") }]).status, "verified");
  assert.equal(balanceVerification(verified, [{ ...debit, date: at("2026-06-30") }]).predatesOpening, true);
});

test("manual categories and notes do not invalidate accounting evidence", () => {
  const bank = makeAccount();
  const row = expense({ accountId: bank.id, date: at("2026-10-01") });
  assert.equal(ledgerFingerprint(bank, [row], "2026-10-18"), ledgerFingerprint(bank,
    [{ ...row, description: "My corrected merchant", categoryId: "gifts", notes: "Keep this" }], "2026-10-18"));
});
