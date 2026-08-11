import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  UnreadableStatementError,
  parseFlexibleDMYDate,
} from "@/lib/import/statement-row";
import { parseStatementXls } from "@/lib/import/parse-statement-xls";
import { tryParseHdfcXls } from "@/lib/import/hdfc-xls-parser";
import { tryParseAxisXls } from "@/lib/import/axis-xls-parser";
import { tryParseIciciXls } from "@/lib/import/icici-xls-parser";
import type { ExtractedSheet } from "@/lib/import/xls-source";

import { rs } from "../helpers/factories";

/**
 * The import path is where the user's bad data originally came from, so it
 * gets the same scrutiny as the money engine. These parsers consume the
 * already-extracted string grid, so no binary fixture is needed — the
 * expected rows stay readable right next to the input.
 */

const sheet = (rows: string[][]): ExtractedSheet[] => [{ sheetName: "Sheet1", rows }];

describe("parseFlexibleDMYDate", () => {
  test("reads four-digit years with either separator", () => {
    assert.equal(parseFlexibleDMYDate("26/07/2026"), "2026-07-26");
    assert.equal(parseFlexibleDMYDate("16-05-2026"), "2026-05-16");
  });

  test("reads two-digit years, pivoting at 70", () => {
    assert.equal(parseFlexibleDMYDate("24/07/26"), "2026-07-24");
    assert.equal(parseFlexibleDMYDate("24/07/99"), "1999-07-24");
  });

  test("pads single-digit days and months", () => {
    assert.equal(parseFlexibleDMYDate("1/2/2026"), "2026-02-01");
  });

  test("is day-first, never month-first", () => {
    // The difference between 7 December and 12 July on every ambiguous row.
    assert.equal(parseFlexibleDMYDate("07/12/2026"), "2026-12-07");
  });

  test("tolerates surrounding whitespace", () => {
    assert.equal(parseFlexibleDMYDate("  26/07/2026  "), "2026-07-26");
  });

  test("rejects impossible and malformed dates", () => {
    assert.equal(parseFlexibleDMYDate("32/07/2026"), null);
    assert.equal(parseFlexibleDMYDate("26/13/2026"), null);
    assert.equal(parseFlexibleDMYDate("2026-07-26"), null);
    assert.equal(parseFlexibleDMYDate("Opening Balance"), null);
    assert.equal(parseFlexibleDMYDate(""), null);
  });
});

describe("HDFC XLS", () => {
  const rows = [
    ["HDFC BANK LTD", "", "", ""],
    ["Statement of account", "", "", ""],
    ["Date", "Narration", "Withdrawal Amt.", "Deposit Amt."],
    ["24/07/26", "UPI-SWIGGY-SWIGGY@HDFC-123456789012", "450.00", ""],
    ["25/07/26", "SALARY CREDIT", "", "2,50,000.00"],
  ];

  test("reads debits and credits into the shared row shape", () => {
    const out = tryParseHdfcXls(sheet(rows));
    assert.equal(out?.length, 2);
    assert.deepEqual(out?.[0], {
      date: "2026-07-24",
      narration: "UPI-SWIGGY-SWIGGY@HDFC-123456789012",
      withdrawal: rs(450),
      deposit: 0,
    });
    assert.equal(out?.[1]?.deposit, rs(250_000));
    assert.equal(out?.[1]?.withdrawal, 0);
  });

  test("skips preamble and any row that is not a transaction", () => {
    const noisy = [
      ...rows,
      ["", "", "", ""],
      ["Opening Balance", "", "", "1,740.00"],
      ["STATEMENT SUMMARY", "", "", ""],
    ];
    assert.equal(tryParseHdfcXls(sheet(noisy))?.length, 2);
  });

  test("rejects a row carrying both a debit and a credit", () => {
    // Exactly one side must be populated, or the direction is ambiguous.
    const ambiguous = [rows[2]!, ["24/07/26", "SOMETHING", "100.00", "200.00"]];
    assert.throws(() => tryParseHdfcXls(sheet(ambiguous)), UnreadableStatementError);
  });

  test("returns null for another bank's layout so the dispatcher moves on", () => {
    assert.equal(tryParseHdfcXls(sheet([["Tran Date", "Particulars", "DR", "CR"]])), null);
  });

  test("throws once its own header matched but nothing below validated", () => {
    // The bank is known at this point, so falling through to try another
    // bank's column names would only produce a more confusing failure.
    assert.throws(
      () => tryParseHdfcXls(sheet([rows[2]!, ["", "", "", ""]])),
      UnreadableStatementError,
    );
  });
});

describe("Axis XLS", () => {
  const rows = [
    ["Axis Bank", "", "", ""],
    ["Tran Date", "Particulars", "DR", "CR"],
    ["08-08-2026", "POS MAGNOLIA BAKERY", "1376.00", ""],
    ["09-08-2026", "NEFT-CR-REFUND", "", "500.00"],
  ];

  test("maps DR to withdrawal and CR to deposit", () => {
    const out = tryParseAxisXls(sheet(rows));
    assert.equal(out?.length, 2);
    assert.equal(out?.[0]?.withdrawal, rs(1376));
    assert.equal(out?.[0]?.deposit, 0);
    assert.equal(out?.[1]?.deposit, rs(500));
  });

  test("returns null for an HDFC sheet", () => {
    assert.equal(
      tryParseAxisXls(sheet([["Date", "Narration", "Withdrawal Amt.", "Deposit Amt."]])),
      null,
    );
  });
});

describe("ICICI XLS", () => {
  const rows = [
    ["Detailed Statement", "", "", ""],
    ["Transaction Date", "Transaction Remarks", "Withdrawal Amount (INR )", "Deposit Amount (INR )"],
    ["26/07/2026", "UPI/DR/123456/AMAZON", "1200.50", ""],
    ["27/07/2026", "INT.PD:01APR2026-30JUN2026", "", "36.00"],
  ];

  test("reads its own column names, including the (INR ) suffixes", () => {
    const out = tryParseIciciXls(sheet(rows));
    assert.equal(out?.length, 2);
    assert.equal(out?.[0]?.withdrawal, rs(1200.5), "paise must survive the round trip");
    assert.equal(out?.[1]?.deposit, rs(36));
  });
});

describe("parseStatementXls dispatch", () => {
  test("picks the right parser for each bank", () => {
    const hdfc = parseStatementXls(
      sheet([
        ["Date", "Narration", "Withdrawal Amt.", "Deposit Amt."],
        ["24/07/26", "SWIGGY", "450.00", ""],
      ]),
    );
    assert.equal(hdfc[0]?.narration, "SWIGGY");

    const axis = parseStatementXls(
      sheet([
        ["Tran Date", "Particulars", "DR", "CR"],
        ["08-08-2026", "MAGNOLIA", "1376.00", ""],
      ]),
    );
    assert.equal(axis[0]?.withdrawal, rs(1376));
  });

  test("an unrecognised layout reports what it saw rather than failing silently", () => {
    try {
      parseStatementXls(sheet([["Foo", "Bar"], ["1", "2"]]));
      assert.fail("should have thrown");
    } catch (error) {
      assert.ok(error instanceof UnreadableStatementError);
      assert.ok(error.diagnostics.length > 0, "diagnostics make this debuggable");
    }
  });

  test("an empty workbook throws rather than importing nothing quietly", () => {
    assert.throws(() => parseStatementXls([]), UnreadableStatementError);
  });
});
