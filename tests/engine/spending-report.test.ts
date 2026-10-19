import assert from "node:assert/strict";
import test from "node:test";
import { buildCategorySeed } from "@/lib/domain/categories";
import { makeContext } from "@/lib/domain/contexts";
import {
  spendingReport,
  type SpendingDimension,
  type SpendingFilter,
} from "@/lib/engine/spending-report";
import type { Transaction } from "@/lib/domain/types";
import {
  at,
  expense,
  income,
  investmentTxn,
  rs,
  transfer,
} from "../helpers/factories";

const categories = buildCategorySeed();
const options = {
  month: "2026-07-24",
  now: new Date(2026, 7, 10),
  cycleStartDay: 24,
  dimension: "category" as SpendingDimension,
};
const report = (
  rows: Transaction[],
  extra: SpendingFilter & { dimension?: SpendingDimension } = {},
) => spendingReport(rows, categories, { ...options, ...extra });

test("net totals exclude other financial movements and adjustments and retain exact source rows", () => {
  const purchase = expense({ amount: rs(1000), categoryId: "dining.lunch" });
  const refund = income({
    amount: rs(200),
    isRefund: true,
    categoryId: "dining.lunch",
  });
  const result = report([
    purchase,
    refund,
    income(),
    transfer(),
    investmentTxn(),
    expense({ categoryId: "adjustment" }),
  ]);
  assert.equal(result.current.gross, rs(1000));
  assert.equal(result.current.refunds, rs(200));
  assert.equal(result.current.net, rs(800));
  assert.equal(result.current.count, 1);
  assert.equal(result.current.average, rs(1000));
  assert.deepEqual(result.current.transactions, [purchase, refund]);
  assert.equal(
    result.buckets.reduce((sum, b) => sum + b.net, 0),
    result.current.net,
  );
});

test("current pay cycle compares the same elapsed dates and excludes future entries", () => {
  const result = report([
    expense({ date: at("2026-07-24"), amount: rs(300) }),
    expense({ date: at("2026-08-10"), amount: rs(200) }),
    expense({ date: at("2026-08-11"), amount: rs(999) }),
    expense({ date: at("2026-06-24"), amount: rs(100) }),
    expense({ date: at("2026-07-11"), amount: rs(150) }),
    expense({ date: at("2026-07-12"), amount: rs(999) }),
  ]);
  assert.equal(result.comparableDays, 18);
  assert.equal(result.current.net, rs(500));
  assert.equal(result.previous.net, rs(250));
  assert.equal(result.buckets[0]?.change, rs(250));
});

test("closed cycles compare full cycles", () => {
  const result = spendingReport(
    [
      expense({ date: at("2026-08-23"), amount: rs(300) }),
      expense({ date: at("2026-07-23"), amount: rs(200) }),
    ],
    categories,
    { ...options, now: new Date(2026, 8, 1) },
  );
  assert.equal(result.comparableDays, null);
  assert.equal(result.current.net, rs(300));
  assert.equal(result.previous.net, rs(200));
});

test("day-31 payday never includes next cycle's transactions from a shorter previous cycle", () => {
  const result = spendingReport(
    [
      expense({ date: at("2026-03-30"), amount: rs(300) }),
      expense({ date: at("2026-02-27"), amount: rs(200) }),
      expense({ date: at("2026-02-28"), amount: rs(900) }),
    ],
    categories,
    {
      ...options,
      month: "2026-02-28",
      now: new Date(2026, 2, 30),
      cycleStartDay: 31,
    },
  );
  assert.equal(result.current.net, rs(1200));
  assert.equal(result.previous.net, rs(200));
});

test("linked refunds use original category, merchant and tags but stay in their received cycle", () => {
  const purchase = expense({
    categoryId: "shopping.clothing",
    merchant: "Myntra",
    date: at("2026-06-01"),
    contexts: [makeContext("goa-trip")],
  });
  const refund = income({
    date: at("2026-08-01"),
    isRefund: true,
    reversesTransactionId: purchase.id,
    amount: rs(1200),
  });
  const result = report([purchase, refund], {
    groupId: "shopping",
    contexts: [makeContext("goa-trip")],
    dimension: "merchant",
  });
  assert.equal(result.current.net, -rs(1200));
  assert.equal(result.current.count, 0);
  assert.equal(result.buckets[0]?.label, "Myntra");
  assert.deepEqual(result.buckets[0]?.transactions, [refund]);
});

test("tag intersections respect dimension and deduplicate repeated tags", () => {
  const row = expense({
    categoryId: "dining.dinner",
    contexts: [
      makeContext("work", "PURPOSE"),
      makeContext("friends"),
      makeContext("friends"),
    ],
  });
  const filtered = report([row], { contexts: [makeContext("work", "PEOPLE")] });
  assert.equal(filtered.current.count, 0);
  const result = report([row], {
    contexts: [makeContext("work", "PURPOSE"), makeContext("friends")],
    dimension: "PEOPLE",
  });
  assert.equal(result.buckets[0]?.count, 1);
  assert.equal(result.current.count, 1);
});

test("overlapping tag buckets never inflate the selection total", () => {
  const result = report(
    [
      expense({ contexts: [makeContext("shared"), makeContext("impulse")] }),
      expense(),
    ],
    { dimension: "ATTRIBUTE" },
  );
  assert.equal(result.current.count, 2);
  assert.equal(result.buckets.length, 3);
  assert.equal(result.buckets.find((b) => b.id === "__untagged")?.count, 1);
  assert.equal(
    result.buckets.reduce((sum, b) => sum + b.count, 0),
    3,
  );
});

test("normalizes merchant aliases without inventing a merchant for missing data", () => {
  const result = report(
    [
      expense({ merchant: "Swiggy" }),
      expense({ merchant: "SWIGGY PVT LTD" }),
      expense({ description: "Dinner with friends" }),
    ],
    { dimension: "merchant" },
  );
  assert.equal(result.buckets.find((b) => b.id === "swiggy")?.count, 2);
  assert.equal(result.buckets.find((b) => b.id === "__unknown")?.count, 1);
});

test("missing and stale categories and derived-only tags are surfaced for enrichment", () => {
  const rows = [
    expense({ categoryId: undefined }),
    expense({ categoryId: "deleted", contexts: [makeContext("weekend")] }),
    expense({ categoryId: "dining", contexts: [makeContext("friends")] }),
  ];
  const result = report(rows);
  assert.equal(result.uncategorised.length, 2);
  assert.equal(result.untagged.length, 2);
  assert.equal(result.buckets.find((b) => b.id === "other")?.count, 2);
  assert.equal(report(rows, { groupId: "other" }).current.count, 2);
});

test("no comparison is invented for an empty previous period; previous-only buckets remain drillable", () => {
  assert.equal(report([expense()]).buckets[0]?.change, null);
  const result = report([
    expense({ date: at("2026-07-01"), categoryId: "dining" }),
  ]);
  assert.equal(result.buckets[0]?.net, 0);
  assert.equal(result.buckets[0]?.change, -rs(1000));
  assert.equal(result.buckets[0]?.previous.transactions.length, 1);
});

test("custom category parents are resolved from the stored category tree", () => {
  const result = spendingReport(
    [expense({ categoryId: "my-leaf" })],
    [
      ...categories,
      {
        id: "my-parent",
        name: "Pets",
        parentId: null,
        order: 20,
        system: false,
      },
      {
        id: "my-leaf",
        name: "Vet",
        parentId: "my-parent",
        order: 1,
        system: false,
      },
    ],
    { ...options, groupId: "my-parent" },
  );
  assert.equal(result.buckets[0]?.label, "Pets");
  assert.equal(result.current.count, 1);
});
