import assert from "node:assert/strict";
import test from "node:test";
import { extractXlsRows } from "@/lib/import/xls-source";
import { parseStatementXls } from "@/lib/import/parse-statement-xls";
import { tryParseAxisXls } from "@/lib/import/axis-xls-parser";
import { tryParseIciciXls } from "@/lib/import/icici-xls-parser";
import { parseFlexibleDMYDate, parseStatementBalance, UnreadableStatementError } from "@/lib/import/statement-row";

const sheet = (rows: string[][]) => [{ sheetName: "Statement", rows }];

test("Axis CSV preserves Indian dates and uses balances to repair reversed column headings", async () => {
  const file = new File(["Tran Date,PARTICULARS,DR,CR,BAL\n09-10-2026,Purchase,,200,800\n10-10-2026,Received,500,,1300\n11-10-2026,Bank fee,,30,1270"], "statement.csv");
  const rows = parseStatementXls(await extractXlsRows(file));
  assert.deepEqual(rows.map(r => [r.date, r.withdrawal, r.deposit, r.balance]), [
    ["2026-10-09", 20000, 0, 80000], ["2026-10-10", 0, 50000, 130000], ["2026-10-11", 3000, 0, 127000],
  ]);
});

test("a normal Axis export keeps its directions, including the first entry", () => {
  const rows = tryParseAxisXls(sheet([["Tran Date", "Particulars", "DR", "CR", "Balance"],
    ["09-10-2026", "Purchase", "200", "", "800"], ["10-10-2026", "Received", "", "500", "1300"]]));
  assert.equal(rows?.[0]?.withdrawal, 20000); assert.equal(rows?.[1]?.deposit, 50000);
});

test("inconsistent direction, balance gaps and invalid dated rows reject the entire file", () => {
  const header = ["Tran Date", "Particulars", "DR", "CR", "BAL"];
  for (const last of [["11-10-2026", "Fee", "", "30", "1270"], ["11-10-2026", "Fee", "30", "", "1200"],
    ["11-10-2026", "Fee", "30", "40", "1270"]]) {
    assert.throws(() => tryParseAxisXls(sheet([header, ["09-10-2026", "Purchase", "200", "", "800"],
      ["10-10-2026", "Received", "", "500", "1300"], last])), UnreadableStatementError);
  }
});

test("ICICI continuation lines retain the reference and the chain catches omitted rows", () => {
  const header = ["Transaction Date", "Transaction Remarks", "Withdrawal Amount", "Deposit Amount", "Balance"];
  const rows = [header, ["09/10/2026", "UPI/SHOP/BANK OF ", "80", "", "920"],
    ["", "INDIA/123456789012/ICIabc", "", "", ""], ["10/10/2026", "Fee", "10", "", "910"]];
  assert.equal(tryParseIciciXls(sheet(rows))?.[0]?.narration, "UPI/SHOP/BANK OF INDIA/123456789012/ICIabc");
  rows[3]![4] = "900";
  assert.throws(() => tryParseIciciXls(sheet(rows)), UnreadableStatementError);
  assert.equal(parseFlexibleDMYDate("31/02/2026"), null);
});

test("bank balance formats include dot-zero and overdrafts", () => {
  assert.equal(parseStatementBalance(" .00 "), 0);
  assert.equal(parseStatementBalance("-1,200.50"), -120050);
  assert.equal(parseStatementBalance(""), null);
});
