import { parseAmountInput } from "@/lib/domain/money";
import type { Paise } from "@/lib/domain/types";
import type { ExtractedPage, PositionedText, Row } from "./pdf-text";

/**
 * HDFC savings-account statement layout -> structured rows.
 *
 * Bank-specific by design — a different bank's PDF is a different table
 * layout, so this is not meant to generalise. `build-drafts.ts` is where
 * bank-agnostic logic (narration cleanup, transaction drafting) picks up
 * from this module's output.
 *
 * Column boundaries come from the header row's own position on each page,
 * not hardcoded pixel values — page margins can drift slightly between
 * pages of the same statement, so each page's header is authoritative for
 * that page.
 */

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
    /** First few raw row texts from page 1 — for diagnosing why detection failed. */
    readonly sampleRows: string[] = [],
  ) {
    super(
      "Couldn't read this statement confidently — the layout doesn't match what was expected.",
    );
    this.name = "UnreadableStatementError";
  }
}

type ColumnKey =
  | "date"
  | "narration"
  | "chqRef"
  | "valueDt"
  | "withdrawal"
  | "deposit"
  | "closing";

/** Left-to-right order in a genuine HDFC statement table. */
const COLUMN_ORDER: ColumnKey[] = [
  "date",
  "narration",
  "chqRef",
  "valueDt",
  "withdrawal",
  "deposit",
  "closing",
];

/** Right-aligned numeric columns — assign by right edge, not left edge. */
const NUMERIC_COLUMNS = new Set<ColumnKey>(["withdrawal", "deposit", "closing"]);

const HEADER_KEYWORDS: { key: ColumnKey; match: (lower: string) => boolean }[] = [
  { key: "date", match: (t) => t === "date" },
  { key: "narration", match: (t) => t === "narration" },
  { key: "chqRef", match: (t) => t.includes("chq") || t.includes("ref") },
  { key: "valueDt", match: (t) => t.includes("value") },
  { key: "withdrawal", match: (t) => t.includes("withdrawal") },
  { key: "deposit", match: (t) => t.includes("deposit") },
  { key: "closing", match: (t) => t.includes("closing") },
];

const FOOTER_MARKERS = [
  "hdfc bank limited",
  "registered office",
  "contents of this statement",
  "state bank branch gstin",
  "computer generated",
  "this is a system generated",
];

/** Rows in this % or more failing validation means the layout wasn't read correctly. */
const VALIDATION_FAILURE_THRESHOLD = 0.15;

/**
 * PDFs frequently split one visual word into several text items (font
 * kerning / text-run boundaries), e.g. "Narration" arriving as "Narr" +
 * "ation". Matching keywords per-item would miss that entirely, so header
 * cells are merged into "words" by x-gap first — items sitting close enough
 * together that there's no real space between them count as one word,
 * regardless of how the PDF happened to chunk them.
 */
const WORD_GAP_THRESHOLD = 2;

interface WordGroup {
  text: string;
  x: number;
  xEnd: number;
}

function groupIntoWords(row: Row): WordGroup[] {
  const sorted = [...row].sort((a, b) => a.x - b.x);
  const groups: WordGroup[] = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (last && item.x - last.xEnd <= WORD_GAP_THRESHOLD) {
      last.text += item.text;
      last.xEnd = item.xEnd;
    } else {
      groups.push({ text: item.text, x: item.x, xEnd: item.xEnd });
    }
  }
  return groups;
}

function findHeaderRow(page: ExtractedPage): Row | null {
  for (const row of page.rows) {
    const words = groupIntoWords(row).map((w) => w.text.toLowerCase());
    const has = (keyword: string) => words.some((w) => w.includes(keyword));
    if (has("narration") && has("withdrawal") && has("deposit")) {
      return row;
    }
  }
  return null;
}

function findAnchors(headerRow: Row): Partial<Record<ColumnKey, PositionedText>> {
  const anchors: Partial<Record<ColumnKey, PositionedText>> = {};
  for (const group of groupIntoWords(headerRow)) {
    const text = group.text.trim().toLowerCase();
    for (const { key, match } of HEADER_KEYWORDS) {
      if (anchors[key]) continue;
      if (match(text)) {
        // Anchor on the word group's own extent, not a single fragment's —
        // downstream zone-building needs the true left/right edge of the
        // whole label, e.g. all of "Withdrawal" not just "With".
        anchors[key] = { text: group.text, x: group.x, xEnd: group.xEnd, y: headerRow[0]?.y ?? 0 };
        break;
      }
    }
  }
  return anchors;
}

interface ColumnZone {
  key: ColumnKey;
  left: number;
  right: number;
}

/** Zones are contiguous x-ranges between adjacent header anchors, not single points. */
function buildZones(anchors: Partial<Record<ColumnKey, PositionedText>>): ColumnZone[] {
  const present = COLUMN_ORDER.map((key) => ({ key, item: anchors[key] }))
    .filter((e): e is { key: ColumnKey; item: PositionedText } => Boolean(e.item))
    .sort((a, b) => a.item.x - b.item.x);

  const zones: ColumnZone[] = [];
  for (let i = 0; i < present.length; i++) {
    const cur = present[i]!;
    const next = present[i + 1];
    const left = i === 0 ? -Infinity : zones[i - 1]!.right;
    const right = next ? (cur.item.xEnd + next.item.x) / 2 : Infinity;
    zones.push({ key: cur.key, left, right });
  }
  return zones;
}

function zoneAt(zones: ColumnZone[], x: number): ColumnZone | undefined {
  return zones.find((z) => x >= z.left && x < z.right);
}

/**
 * Numeric columns (Withdrawal/Deposit/Closing) are right-aligned and sit
 * close together, so a short number's left edge can drift toward the wrong
 * neighbour while its right edge stays anchored to the true column — assign
 * those three by right edge, everything else by left edge.
 */
function assignColumn(zones: ColumnZone[], item: PositionedText): ColumnKey | undefined {
  const byLeft = zoneAt(zones, item.x);
  if (byLeft && NUMERIC_COLUMNS.has(byLeft.key)) {
    return (zoneAt(zones, item.xEnd) ?? byLeft).key;
  }
  return byLeft?.key;
}

function rowToColumns(zones: ColumnZone[], row: Row): Partial<Record<ColumnKey, string>> {
  const grouped: Partial<Record<ColumnKey, string[]>> = {};
  for (const item of row) {
    const key = assignColumn(zones, item);
    if (!key) continue;
    (grouped[key] ??= []).push(item.text);
  }
  const out: Partial<Record<ColumnKey, string>> = {};
  for (const key of Object.keys(grouped) as ColumnKey[]) {
    out[key] = grouped[key]!.join(" ").trim();
  }
  return out;
}

function parseStatementDate(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
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

function looksLikeFooter(row: Row): boolean {
  const lower = row
    .map((i) => i.text)
    .join(" ")
    .toLowerCase();
  return FOOTER_MARKERS.some((marker) => lower.includes(marker));
}

interface Candidate {
  date: string | null;
  narration: string;
  withdrawal: Paise | null;
  deposit: Paise | null;
}

export function parseHdfcStatement(pages: ExtractedPage[]): StatementRow[] {
  const candidates: Candidate[] = [];
  // Diagnostic-only: the first page's raw rows, kept in case nothing parses
  // so the failure is debuggable instead of a bare "didn't work."
  const sampleRows = (pages[0]?.rows ?? [])
    .slice(0, 20)
    .map((row) => row.map((i) => i.text).join(" | "));
  let anyHeaderFound = false;

  for (const page of pages) {
    const headerRow = findHeaderRow(page);
    if (!headerRow) continue; // page has no transaction table (cover/footer page)
    anyHeaderFound = true;
    const anchors = findAnchors(headerRow);
    if (!anchors.narration || !anchors.withdrawal || !anchors.deposit) continue;
    const zones = buildZones(anchors);

    let inTable = false;
    let reachedFooter = false;

    for (const row of page.rows) {
      if (row === headerRow) {
        inTable = true;
        continue;
      }
      if (!inTable || reachedFooter) continue;
      if (looksLikeFooter(row)) {
        reachedFooter = true;
        continue;
      }

      const cols = rowToColumns(zones, row);
      const date = cols.date ? parseStatementDate(cols.date) : null;
      const withdrawal = cols.withdrawal ? parseAmountInput(cols.withdrawal) : null;
      const deposit = cols.deposit ? parseAmountInput(cols.deposit) : null;
      const hasExactlyOneAmount =
        ((withdrawal ?? 0) > 0) !== ((deposit ?? 0) > 0);

      if (date && hasExactlyOneAmount) {
        candidates.push({ date, narration: cols.narration ?? "", withdrawal, deposit });
        continue;
      }

      // A row with no date/amount but real narration text is a wrapped
      // continuation of the previous transaction's narration.
      const last = candidates[candidates.length - 1];
      if (last && cols.narration) {
        last.narration = `${last.narration} ${cols.narration}`.trim();
      }
    }
  }

  if (candidates.length === 0) {
    const detail = anyHeaderFound
      ? "found the header row but no data rows validated"
      : "never found a row containing narration/withdrawal/deposit headers";
    throw new UnreadableStatementError(1, [`(${detail})`, ...sampleRows]);
  }

  const valid = candidates.filter(
    (c): c is Candidate & { date: string; withdrawal: Paise; deposit: Paise } =>
      Boolean(c.date) &&
      c.narration.trim().length > 0 &&
      ((c.withdrawal ?? 0) > 0) !== ((c.deposit ?? 0) > 0),
  );

  const failureRate = 1 - valid.length / candidates.length;
  if (failureRate > VALIDATION_FAILURE_THRESHOLD) {
    throw new UnreadableStatementError(failureRate, sampleRows);
  }

  return valid.map((c) => ({
    date: c.date,
    narration: c.narration.trim(),
    withdrawal: c.withdrawal ?? 0,
    deposit: c.deposit ?? 0,
  }));
}
