import { parseAmountInput } from "@/lib/domain/money";
import { parseFlexibleDMYDate, parseStatementBalance, UnreadableStatementError, validateStatementBalances, type StatementRow } from "./statement-row";
import type { ExtractedSheet } from "./xls-source";

/** ICICI's "Detailed Statement" export ("OpTransactionHistory..."). */

function norm(cell: string): string {
  return cell.trim().toLowerCase();
}

function findHeaderRow(sheet: ExtractedSheet): { row: string[]; index: number } | null {
  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i]!;
    const cells = row.map(norm);
    if (
      cells.includes("transaction date") &&
      cells.includes("transaction remarks") &&
      cells.some((c) => c.includes("withdrawal")) &&
      cells.some((c) => c.includes("deposit"))
    ) {
      return { row, index: i };
    }
  }
  return null;
}

export function tryParseIciciXls(sheets: ExtractedSheet[]): StatementRow[] | null {
  for (const sheet of sheets) {
    const header = findHeaderRow(sheet);
    if (!header) continue;

    const cells = header.row.map(norm);
    const dateIdx = cells.indexOf("transaction date");
    const narrationIdx = cells.indexOf("transaction remarks");
    const withdrawalIdx = cells.findIndex((c) => c.includes("withdrawal"));
    const depositIdx = cells.findIndex((c) => c.includes("deposit"));
    const balanceIdx = cells.findIndex(c => c.includes("balance"));
    const referenceIdx = cells.findIndex((c) => /reference|utr|rrn/.test(c));

    const out: StatementRow[] = [];
    for (let i = header.index + 1; i < sheet.rows.length; i++) {
      const row = sheet.rows[i]!;
      const date = parseFlexibleDMYDate(row[dateIdx] ?? "");
      const narration = (row[narrationIdx] ?? "").trim();
      const withdrawal = parseAmountInput(row[withdrawalIdx] ?? "") ?? 0;
      const deposit = parseAmountInput(row[depositIdx] ?? "") ?? 0;
      const hasExactlyOneAmount = (withdrawal > 0) !== (deposit > 0);
      const balance = balanceIdx >= 0 ? parseStatementBalance(row[balanceIdx] ?? "") : null;
      if ((!date && /^\d/.test(row[dateIdx]?.trim() ?? "") && (withdrawal > 0 || deposit > 0)) ||
        (date && (!narration || !hasExactlyOneAmount || (balanceIdx >= 0 && balance === null)))) {
        throw new UnreadableStatementError(1, [`ICICI: invalid transaction at row ${i + 1}.`]);
      }

      if (date && narration && hasExactlyOneAmount) {
        out.push({ date, narration, withdrawal, deposit, ...(balance !== null ? { balance } : {}),
          ...(referenceIdx >= 0 && row[referenceIdx]?.trim() ? { reference: row[referenceIdx]!.trim() } : {}) });
      } else if (!row[dateIdx]?.trim() && narration && out.length &&
        row.every((cell, index) => index === narrationIdx || !cell.trim())) {
        // ICICI wraps long UPI narrations onto a separate physical row.
        // The continuation often contains the RRN used to prevent duplicates.
        out[out.length - 1]!.narration += " " + narration;
      }
    }

    if (out.length === 0) {
      throw new UnreadableStatementError(1, [
        `ICICI header matched on sheet "${sheet.sheetName}" row ${header.index}, but no data row below it validated.`,
        `Header row: ${header.row.join(" | ")}`,
      ]);
    }
    return validateStatementBalances(out, "ICICI");
  }
  return null;
}
