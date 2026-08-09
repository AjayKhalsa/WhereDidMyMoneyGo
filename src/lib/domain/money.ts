import type { Paise } from "./types";

/**
 * All money in this app is stored as integer paise.
 *
 * Floating point rupees would drift the moment we start averaging three
 * months of spending and dividing by remaining days. Every figure the user
 * sees is derived from integer arithmetic and rounded exactly once, here.
 */

export const PAISE_PER_RUPEE = 100;

export function rupeesToPaise(rupees: number): Paise {
  return Math.round(rupees * PAISE_PER_RUPEE);
}

export function paiseToRupees(paise: Paise): number {
  return paise / PAISE_PER_RUPEE;
}

const INR_WHOLE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const INR_PRECISE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PLAIN_WHOLE = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

/** "₹47,320" — the default presentation everywhere in the UI. */
export function formatMoney(paise: Paise): string {
  return INR_WHOLE.format(Math.round(paiseToRupees(paise)));
}

/** "₹47,320.50" — only where exactness matters, e.g. editing. */
export function formatMoneyPrecise(paise: Paise): string {
  return INR_PRECISE.format(paiseToRupees(paise));
}

/** "47,320" — when the ₹ glyph is rendered separately at a different size. */
export function formatAmountOnly(paise: Paise): string {
  return PLAIN_WHOLE.format(Math.round(paiseToRupees(paise)));
}

/** "₹1.6L" / "₹47.3k" — for dense contexts like axis labels. */
export function formatMoneyCompact(paise: Paise): string {
  const rupees = Math.abs(paiseToRupees(paise));
  const sign = paise < 0 ? "-" : "";
  if (rupees >= 10_000_000) return `${sign}₹${(rupees / 10_000_000).toFixed(1)}Cr`;
  if (rupees >= 100_000) return `${sign}₹${(rupees / 100_000).toFixed(1)}L`;
  if (rupees >= 1_000) return `${sign}₹${(rupees / 1_000).toFixed(1)}k`;
  return `${sign}₹${Math.round(rupees)}`;
}

/** "+75%" / "−12%". Returns null when a baseline of zero makes it meaningless. */
export function formatDelta(pct: number | null): string | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  const rounded = Math.round(pct);
  if (rounded === 0) return "0%";
  return rounded > 0 ? `+${rounded}%` : `−${Math.abs(rounded)}%`;
}

/**
 * Percent change from `base` to `current`.
 * Returns null when there is no baseline to compare against — the UI should
 * say "no history yet" rather than invent an infinite increase.
 */
export function percentChange(current: number, base: number): number | null {
  if (base <= 0) return null;
  return ((current - base) / base) * 100;
}

export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return (part / whole) * 100;
}

/** Parses "2400", "2,400", "₹2400", "2.4k", "1.5L" into paise. */
export function parseAmountInput(raw: string): Paise | null {
  const cleaned = raw.replace(/[₹,\s]/g, "").toLowerCase();
  if (!cleaned) return null;
  const match = /^(\d+(?:\.\d+)?)(k|l|cr)?$/.exec(cleaned);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const multiplier =
    match[2] === "k"
      ? 1_000
      : match[2] === "l"
        ? 100_000
        : match[2] === "cr"
          ? 10_000_000
          : 1;
  return rupeesToPaise(value * multiplier);
}

export function sum(values: number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export function sumBy<T>(items: T[], select: (item: T) => number): number {
  let total = 0;
  for (const item of items) total += select(item);
  return total;
}
