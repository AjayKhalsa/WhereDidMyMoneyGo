/**
 * Shared output shape and error type for every bank-specific statement
 * parser (PDF or XLS). `build-drafts.ts` and the rest of the import
 * pipeline only ever see this — never a bank's raw layout.
 */

import type { Paise } from "@/lib/domain/types";
import { parseAmountInput } from "@/lib/domain/money";

export function parseStatementBalance(raw: string): Paise | null {
  const text = raw.replace(/[₹,\s]/g, "");
  const negative = text.startsWith("-");
  const magnitude = text.replace(/^-/, "").replace(/^\./, "0.");
  const amount = parseAmountInput(magnitude);
  return amount === null ? null : negative ? -amount : amount;
}

export interface StatementRow {
  /** "YYYY-MM-DD" */
  date: string;
  narration: string;
  withdrawal: Paise;
  deposit: Paise;
  /** Bank-issued UTR/RRN/reference, when explicitly present in its own column. */
  reference?: string;
  /** Closing balance immediately after this statement entry. */
  balance?: Paise;
}

export class UnreadableStatementError extends Error {
  constructor(
    readonly failureRate: number,
    /** Raw diagnostic lines — for diagnosing why detection failed. */
    readonly diagnostics: string[] = [],
  ) {
    super(
      "Couldn't read this statement confidently — the layout doesn't match what was expected.",
    );
    this.name = "UnreadableStatementError";
  }
}

/** "24/07/26", "26/07/2026", "16-05-2026" — day-month-year with either separator, 2 or 4 digit year. */
export function parseFlexibleDMYDate(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const yearRaw = match[3]!;
  let year = Number(yearRaw);
  if (yearRaw.length === 2) year += year < 70 ? 2000 : 1900;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (new Date(Date.UTC(year, month, 0)).getUTCDate() < day) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Check the whole chain before offering any rows for import. Some Axis CSV
 * exports put credits under DR and debits under CR; balances establish the
 * direction independently of those labels, including the first entry. */
export function validateStatementBalances(rows: StatementRow[], bank: string, allowReversed = false): StatementRow[] {
  let orientation: number | undefined;
  for (let i = 1; i < rows.length; i++) {
    const previous = rows[i - 1]!, current = rows[i]!;
    if (previous.balance === undefined || current.balance === undefined) continue;
    const delta = current.balance - previous.balance;
    const signed = current.deposit - current.withdrawal;
    const direction = delta === signed ? 1 : delta === -signed ? -1 : 0;
    if (current.date < previous.date || !direction || (!allowReversed && direction !== 1) ||
      (orientation !== undefined && orientation !== direction)) {
      throw new UnreadableStatementError(1, [`${bank}: running balance does not reconcile at entry ${i + 1}. No entries were imported.`]);
    }
    orientation = direction;
  }
  if (allowReversed && rows.some(row => row.balance !== undefined) && orientation === undefined) {
    throw new UnreadableStatementError(1, [`${bank}: not enough consecutive balances to verify debit/credit direction.`]);
  }
  return orientation === -1 ? rows.map(row => ({ ...row, withdrawal: row.deposit, deposit: row.withdrawal })) : rows;
}
