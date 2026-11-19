import { parseAmountInput } from "@/lib/domain/money";
import { parseFlexibleDMYDate, parseStatementBalance, UnreadableStatementError, validateStatementBalances, type StatementRow } from "./statement-row";
import type { ExtractedSheet } from "./xls-source";

/**
 * HDFC's "Excel" statement export — a real spreadsheet, not a scanned
 * table, so this is just column lookup by header name. No x/y coordinate
 * reconstruction needed (contrast `hdfc-parser.ts`, the PDF path).
 */

function norm(cell: string): string {
  return cell.trim().toLowerCase();
}

function findHeaderRow(sheet: ExtractedSheet): { row: string[]; index: number } | null {
  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i]!;
    const cells = row.map(norm);
    if (
      cells.includes("date") &&
      cells.includes("narration") &&
      cells.some((c) => c.includes("withdrawal")) &&
      cells.some((c) => c.includes("deposit"))
    ) {
      return { row, index: i };
    }
  }
  return null;
}

/** Returns null (not an error) when this sheet isn't HDFC-shaped, so the dispatcher can try another bank. */
export function tryParseHdfcXls(sheets: ExtractedSheet[]): StatementRow[] | null {
  for (const sheet of sheets) {
    const header = findHeaderRow(sheet);
    if (!header) continue;

    const cells = header.row.map(norm);
    const dateIdx = cells.indexOf("date");
    const narrationIdx = cells.indexOf("narration");
    const withdrawalIdx = cells.findIndex((c) => c.includes("withdrawal"));
    const depositIdx = cells.findIndex((c) => c.includes("deposit"));
    const balanceIdx = cells.findIndex(c => c.includes("balance"));
    const referenceIdx = cells.findIndex((c) => /chq.*ref|reference|utr|rrn/.test(c));

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
        throw new UnreadableStatementError(1, [`HDFC: invalid transaction at row ${i + 1}.`]);
      }

      if (date && narration && hasExactlyOneAmount) {
        out.push({ date, narration, withdrawal, deposit, ...(balance !== null ? { balance } : {}),
          ...(referenceIdx >= 0 && row[referenceIdx]?.trim() ? { reference: row[referenceIdx]!.trim() } : {}) });
      }
    }

    if (out.length === 0) {
      throw new UnreadableStatementError(1, [
        `HDFC header matched on sheet "${sheet.sheetName}" row ${header.index}, but no data row below it validated (date + narration + exactly one of withdrawal/deposit).`,
        `Header row: ${header.row.join(" | ")}`,
      ]);
    }
    return validateStatementBalances(out, "HDFC");
  }
  return null;
}
