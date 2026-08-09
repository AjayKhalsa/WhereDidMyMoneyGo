/**
 * Date helpers.
 *
 * Everything is local wall-clock. A person's financial month is the month
 * they're standing in, not a UTC boundary, so we deliberately avoid
 * timezone conversion and work with local Date parts throughout.
 */

/** "2026-08" — the key every monthly aggregate is bucketed under. */
export type MonthKey = string;

export function monthKey(date: Date | string): MonthKey {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthKeyToDate(key: MonthKey): Date {
  const [y, m] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, 1);
}

export function addMonths(key: MonthKey, delta: number): MonthKey {
  const d = monthKeyToDate(key);
  d.setMonth(d.getMonth() + delta);
  return monthKey(d);
}

/** The N month keys ending at (and excluding) `key`, oldest first. */
export function previousMonths(key: MonthKey, count: number): MonthKey[] {
  const out: MonthKey[] = [];
  for (let i = count; i >= 1; i--) out.push(addMonths(key, -i));
  return out;
}

export function daysInMonth(key: MonthKey): number {
  const d = monthKeyToDate(key);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function isSameMonth(date: Date | string, key: MonthKey): boolean {
  return monthKey(date) === key;
}

export function startOfMonth(key: MonthKey): Date {
  return monthKeyToDate(key);
}

export function endOfMonth(key: MonthKey): Date {
  const d = monthKeyToDate(key);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Days left in the month *including today*, because today's allowance has
 * not been spent yet at the moment we compute it.
 */
export function remainingDaysInMonth(now: Date, key: MonthKey): number {
  const total = daysInMonth(key);
  if (monthKey(now) !== key) {
    // Looking at a past month: nothing remains. A future month: all of it.
    return now > endOfMonth(key) ? 0 : total;
  }
  return Math.max(1, total - now.getDate() + 1);
}

export function elapsedDaysInMonth(now: Date, key: MonthKey): number {
  if (monthKey(now) !== key) {
    return now > endOfMonth(key) ? daysInMonth(key) : 0;
  }
  return now.getDate();
}

const MONTH_LONG = new Intl.DateTimeFormat("en-IN", { month: "long" });
const MONTH_SHORT = new Intl.DateTimeFormat("en-IN", { month: "short" });
const DAY_MONTH = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
});
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const WEEKDAY_LONG = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const TIME = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatMonthLong(key: MonthKey): string {
  return MONTH_LONG.format(monthKeyToDate(key));
}

export function formatMonthShort(key: MonthKey): string {
  return MONTH_SHORT.format(monthKeyToDate(key));
}

export function formatMonthWithYear(key: MonthKey): string {
  const d = monthKeyToDate(key);
  return `${MONTH_LONG.format(d)} ${d.getFullYear()}`;
}

export function formatDayMonth(date: Date | string): string {
  return DAY_MONTH.format(typeof date === "string" ? new Date(date) : date);
}

export function formatFullDate(date: Date | string): string {
  return DAY_MONTH_YEAR.format(typeof date === "string" ? new Date(date) : date);
}

export function formatTime(date: Date | string): string {
  return TIME.format(typeof date === "string" ? new Date(date) : date);
}

/** "Today" / "Yesterday" / "Saturday, 2 August" — for grouping headers. */
export function formatRelativeDay(date: Date | string, now = new Date()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round(
    (todayStart.getTime() - dayStart.getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays === -1) return "Tomorrow";
  return WEEKDAY_LONG.format(d);
}

/** Local ISO-ish string with no timezone suffix: "2026-08-09T20:15:00". */
export function toLocalISO(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** "2026-08-09" — for <input type="date"> round-tripping. */
export function toDateInputValue(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isWeekend(date: Date | string): boolean {
  const day = (typeof date === "string" ? new Date(date) : date).getDay();
  return day === 0 || day === 6;
}

export function dayKey(date: Date | string): string {
  return toDateInputValue(date);
}

/** Whole days from `from` to `to`, rounded toward zero. Negative if past. */
export function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function greetingFor(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
