/**
 * Shared output shape and error type for every bank-specific statement
 * parser (PDF or XLS). `build-drafts.ts` and the rest of the import
 * pipeline only ever see this — never a bank's raw layout.
 */

import type { Paise } from "@/lib/domain/types";

export interface StatementRow {
  /** "YYYY-MM-DD" */
  date: string;
  narration: string;
  withdrawal: Paise;
  deposit: Paise;
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
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}
