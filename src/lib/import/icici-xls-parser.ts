import { parseAmountInput } from "@/lib/domain/money";
import { parseFlexibleDMYDate, UnreadableStatementError, type StatementRow } from "./statement-row";
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

    const out: StatementRow[] = [];
    for (let i = header.index + 1; i < sheet.rows.length; i++) {
      const row = sheet.rows[i]!;
      const date = parseFlexibleDMYDate(row[dateIdx] ?? "");
      const narration = (row[narrationIdx] ?? "").trim();
      const withdrawal = parseAmountInput(row[withdrawalIdx] ?? "") ?? 0;
      const deposit = parseAmountInput(row[depositIdx] ?? "") ?? 0;
      const hasExactlyOneAmount = (withdrawal > 0) !== (deposit > 0);

      if (date && narration && hasExactlyOneAmount) {
        out.push({ date, narration, withdrawal, deposit });
      }
    }

    if (out.length === 0) {
      throw new UnreadableStatementError(1, [
        `ICICI header matched on sheet "${sheet.sheetName}" row ${header.index}, but no data row below it validated.`,
        `Header row: ${header.row.join(" | ")}`,
      ]);
    }
    return out;
  }
  return null;
}
