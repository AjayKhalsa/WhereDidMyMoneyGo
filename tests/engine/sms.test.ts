import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { looksLikeBankSms, parseBankSms } from "@/lib/engine/sms";

import { makeAccount, makeCard, rs } from "../helpers/factories";

/**
 * Bank SMS reading.
 *
 * Both messages below are real, pasted verbatim from the user's phone. They
 * are the specification: the generic parser booked the first as
 * ₹9,14,06,12,68,002 (the fraud-report phone number) and the second as
 * ₹1,27,87,67,82,741 (the UPI reference), because it takes the largest
 * number it can find. Every assertion here exists to keep a number that is
 * not the amount from ever being chosen again.
 */

const NYKAA =
  "HSBC creditcard xxxxx6934 used at nykaa e retail limi for INR 4452.00 on 14/08/26.Limit Rs 597950.60 Due Rs 7049.40.Report fraud on +914061268002";

const ZOMATO = `Sent Rs.743.46
From HDFC Bank A/C *7900
To Zomato
On 14/08/26
Ref 127876782741
Not You?
Call 18002586161/SMS BLOCK UPI to 7308080808`;

describe("looksLikeBankSms", () => {
  test("recognises both real messages", () => {
    assert.ok(looksLikeBankSms(NYKAA));
    assert.ok(looksLikeBankSms(ZOMATO));
  });

  test("leaves ordinary typing alone", () => {
    // These must keep going through the normal parser untouched.
    assert.ok(!looksLikeBankSms("2400 dinner with friends"));
    assert.ok(!looksLikeBankSms("rs 500 lunch"));
    assert.ok(!looksLikeBankSms("₹1,200 swiggy"));
    assert.ok(!looksLikeBankSms(""));
    assert.ok(!looksLikeBankSms("coffee"));
  });

  test("an amount alone is not enough, and nor is bank wording alone", () => {
    // Two independent signals are required.
    assert.ok(!looksLikeBankSms("Rs 5000 for the thing I bought yesterday"));
    assert.ok(
      !looksLikeBankSms("my a/c number changed, remind me to update it later"),
    );
  });
});

describe("the HSBC card alert", () => {
  const card = makeCard({ name: "HSBC Travel One", hint: "6934" });
  const bank = makeAccount({ name: "HDFC", hint: "7900" });
  const read = parseBankSms(NYKAA, [card, bank]);

  test("takes the transaction amount, not the limit, due or helpline", () => {
    assert.ok(read);
    assert.equal(read.amount, rs(4452));
  });

  test("never picks the fraud-report phone number", () => {
    // 914061268002 → ₹9,14,06,12,68,002, the original bug.
    assert.notEqual(read?.amount, 91_406_126_800_200);
  });

  test("never picks the credit limit or the amount due", () => {
    assert.notEqual(read?.amount, rs(597_950.6));
    assert.notEqual(read?.amount, rs(7049.4));
  });

  test("reads it as money out", () => {
    assert.equal(read?.type, "EXPENSE");
    assert.ok(!read?.isRefund);
  });

  test("reads the merchant without the corporate tail", () => {
    assert.match(read?.merchant ?? "", /nykaa/i);
    assert.ok(!/limi|retail/i.test(read?.merchant ?? ""), read?.merchant);
  });

  test("takes the date from the message rather than today", () => {
    assert.equal(read?.date, "2026-08-14");
  });

  test("books it against the card matching the last four digits", () => {
    assert.equal(read?.accountId, card.id);
  });

  test("explains itself", () => {
    assert.ok((read?.reasons.length ?? 0) > 0);
    assert.ok(read?.reasons.every((r) => r.length > 0));
  });
});

describe("the HDFC UPI alert", () => {
  const bank = makeAccount({ name: "HDFC Bank", hint: "7900" });
  const read = parseBankSms(ZOMATO, [bank]);

  test("takes the sent amount, to the paisa", () => {
    assert.ok(read);
    assert.equal(read.amount, rs(743.46));
  });

  test("never picks the reference number or either helpline", () => {
    assert.notEqual(read?.amount, 12_787_678_274_100); // Ref 127876782741
    assert.notEqual(read?.amount, 1_800_258_616_100); // 18002586161
    assert.notEqual(read?.amount, 730_808_080_800); // 7308080808
  });

  test("reads it as money out, to Zomato", () => {
    assert.equal(read?.type, "EXPENSE");
    assert.match(read?.merchant ?? "", /zomato/i);
  });

  test("takes the date and the account", () => {
    assert.equal(read?.date, "2026-08-14");
    assert.equal(read?.accountId, bank.id);
  });
});

describe("other shapes", () => {
  test("a credit reads as money in", () => {
    const read = parseBankSms(
      "Your A/C XXXXX1234 is credited with INR 250000.00 on 24/08/26 by salary. Avl Bal INR 312000.00",
      [],
    );
    assert.equal(read?.type, "INCOME");
    assert.equal(read?.amount, rs(250_000));
    assert.ok(!read?.isRefund);
  });

  test("a refund reads as money in, flagged as a refund", () => {
    const read = parseBankSms(
      "Rs 1299.00 refunded to your HDFC Bank Card xx4455 on 14/08/26 by Amazon. Not You? Call 18002586161",
      [],
    );
    assert.equal(read?.type, "INCOME");
    assert.equal(read?.isRefund, true);
  });

  test("a card fee is spending on the card, not a bill payment", () => {
    // Same distinction narration.ts already makes for statement rows.
    const read = parseBankSms(
      "Annual fee of Rs 1500.00 debited from your HSBC creditcard xxxxx6934 on 14/08/26. Avl Lmt Rs 500000",
      [],
    );
    assert.equal(read?.type, "EXPENSE");
    assert.equal(read?.amount, rs(1500));
  });

  test("an unmatched last-four leaves the account unset rather than guessing", () => {
    const other = makeAccount({ name: "ICICI", hint: "1111" });
    assert.equal(parseBankSms(NYKAA, [other])?.accountId, undefined);
  });

  test("an account with no hint recorded is never matched", () => {
    const noHint = makeCard({ name: "HSBC Travel One" });
    assert.equal(parseBankSms(NYKAA, [noHint])?.accountId, undefined);
  });

  test("returns null for anything that is not a bank message", () => {
    assert.equal(parseBankSms("2400 dinner with friends", []), null);
    assert.equal(parseBankSms("", []), null);
  });

  test("grouped digits in the amount survive", () => {
    const read = parseBankSms(
      "Your A/C XXXXX1234 is debited with INR 1,20,000.00 on 14/08/26. Avl Bal INR 5,000.00",
      [],
    );
    assert.equal(read?.amount, rs(120_000));
  });
});
