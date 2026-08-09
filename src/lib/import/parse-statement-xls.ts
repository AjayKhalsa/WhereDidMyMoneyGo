import { UnreadableStatementError, type StatementRow } from "./statement-row";
import type { ExtractedSheet } from "./xls-source";
import { tryParseHdfcXls } from "./hdfc-xls-parser";
import { tryParseIciciXls } from "./icici-xls-parser";
import { tryParseAxisXls } from "./axis-xls-parser";

/**
 * Tries each known bank's XLS layout in turn. A parser returns `null` when
 * the sheet just isn't shaped like its bank (so the next one gets a turn),
 * but throws `UnreadableStatementError` once it recognises its own header
 * but can't validate any data below it — at that point the bank is known,
 * so falling through to try a different bank's column names would only
 * produce a more confusing failure.
 */
const PARSERS = [tryParseHdfcXls, tryParseIciciXls, tryParseAxisXls];

export function parseStatementXls(sheets: ExtractedSheet[]): StatementRow[] {
  for (const parser of PARSERS) {
    const result = parser(sheets);
    if (result) return result;
  }
  throw new UnreadableStatementError(1, [
    "Couldn't recognise this as an HDFC, ICICI, or Axis statement export.",
    ...sheets.map((s) => `Sheet "${s.sheetName}" row 0: ${(s.rows[0] ?? []).join(" | ")}`),
  ]);
}
