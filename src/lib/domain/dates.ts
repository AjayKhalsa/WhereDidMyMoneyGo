/**
 * Date helpers.
 *
 * Everything is local wall-clock. A person's financial month is the month
 * they're standing in, not a UTC boundary, so we deliberately avoid
 * timezone conversion and work with local Date parts throughout.
 */

/**
 * "2026-08-24" — the key every monthly aggregate is bucketed under. It's the
 * cycle's *start date*, not necessarily the calendar month it's usually
 * named after. `cycleStartDay=1` (the default everywhere) makes this always
 * "YYYY-MM-01" — a plain calendar month, byte-for-byte what this key format
 * meant before pay-cycle support existed.
 */
export type MonthKey = string;

/** Calendar days in a given (year, 0-based monthIndex). */
export function daysInCalendarMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Clamps `day` into a valid day for (year, monthIndex) and returns that Date. */
export function clampToMonth(year: number, monthIndex: number, day: number): Date {
  const lastDay = daysInCalendarMonth(year, monthIndex);
  return new Date(year, monthIndex, Math.min(Math.max(1, day), lastDay));
}

/**
 * The next date `day`-of-month occurs on or after `from`. Time-of-day on
 * `from` is ignored (normalised to midnight first), so a caller can pass an
 * `endOfMonth()`-shaped Date — which carries 23:59:59.999 — without that
 * pushing the result out a spurious month.
 */
export function nextDayOnOrAfter(day: number, from: Date): Date {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const thisMonth = clampToMonth(start.getFullYear(), start.getMonth(), day);
  if (thisMonth >= start) return thisMonth;
  return clampToMonth(start.getFullYear(), start.getMonth() + 1, day);
}

function toKey(year: number, monthIndex: number, day: number): MonthKey {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

/**
 * Which pay cycle `date` falls in, as the cycle's start date.
 *
 * A date on or after `cycleStartDay` (of its own month) belongs to the cycle
 * that starts *this* calendar month; a date before it belongs to the cycle
 * that started the *previous* calendar month. `cycleStartDay` is clamped to
 * each candidate month's own length before comparing — a start day of 29-31
 * landing in a shorter month (February) would otherwise misattribute dates
 * and let a cycle silently swallow extra days from the next one.
 */
export function monthKey(date: Date | string, cycleStartDay = 1): MonthKey {
  const d = typeof date === "string" ? new Date(date) : date;
  const year = d.getFullYear();
  const monthIndex = d.getMonth();
  const clampedThisMonth = Math.min(cycleStartDay, daysInCalendarMonth(year, monthIndex));

  if (d.getDate() >= clampedThisMonth) {
    return toKey(year, monthIndex, clampedThisMonth);
  }
  const prevMonthIndex = (monthIndex - 1 + 12) % 12;
  const prevYear = monthIndex === 0 ? year - 1 : year;
  const clampedPrevMonth = Math.min(cycleStartDay, daysInCalendarMonth(prevYear, prevMonthIndex));
  return toKey(prevYear, prevMonthIndex, clampedPrevMonth);
}

export function monthKeyToDate(key: MonthKey): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addMonths(key: MonthKey, delta: number, cycleStartDay = 1): MonthKey {
  const d = monthKeyToDate(key);
  // Normalise year/month first (Date handles overflow correctly), then
  // re-clamp to cycleStartDay for the target month — using the passed-in
  // cycleStartDay rather than `d`'s own (possibly already-clamped) day, so a
  // cycle that started on a clamped day (e.g. Feb 28 for a day-30 cycle)
  // still lands on day 30 once it shifts into a month long enough for it.
  const target = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  const shifted = clampToMonth(target.getFullYear(), target.getMonth(), cycleStartDay);
  return toKey(shifted.getFullYear(), shifted.getMonth(), shifted.getDate());
}

/** The N month keys ending at (and excluding) `key`, oldest first. */
export function previousMonths(key: MonthKey, count: number, cycleStartDay = 1): MonthKey[] {
  const out: MonthKey[] = [];
  for (let i = count; i >= 1; i--) out.push(addMonths(key, -i, cycleStartDay));
  return out;
}

/** Length of the cycle starting at `key`, in days. */
export function daysInMonth(key: MonthKey, cycleStartDay = 1): number {
  return daysBetween(monthKeyToDate(key), monthKeyToDate(addMonths(key, 1, cycleStartDay)));
}

export function isSameMonth(date: Date | string, key: MonthKey, cycleStartDay = 1): boolean {
  return monthKey(date, cycleStartDay) === key;
}

export function startOfMonth(key: MonthKey): Date {
  return monthKeyToDate(key);
}

export function endOfMonth(key: MonthKey, cycleStartDay = 1): Date {
  const nextStart = monthKeyToDate(addMonths(key, 1, cycleStartDay));
  return new Date(
    nextStart.getFullYear(),
    nextStart.getMonth(),
    nextStart.getDate() - 1,
    23,
    59,
    59,
    999,
  );
}

/**
 * Days left in the cycle *including today*, because today's allowance has
 * not been spent yet at the moment we compute it.
 */
export function remainingDaysInMonth(now: Date, key: MonthKey, cycleStartDay = 1): number {
  const total = daysInMonth(key, cycleStartDay);
  if (monthKey(now, cycleStartDay) !== key) {
    // Looking at a past cycle: nothing remains. A future cycle: all of it.
    return now > endOfMonth(key, cycleStartDay) ? 0 : total;
  }
  const elapsed = daysBetween(monthKeyToDate(key), now);
  return Math.max(1, total - elapsed);
}

export function elapsedDaysInMonth(now: Date, key: MonthKey, cycleStartDay = 1): number {
  if (monthKey(now, cycleStartDay) !== key) {
    return now > endOfMonth(key, cycleStartDay) ? daysInMonth(key, cycleStartDay) : 0;
  }
  return daysBetween(monthKeyToDate(key), now) + 1;
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

/**
 * The label for a whole cycle: a plain month name when `cycleStartDay` is 1
 * (unchanged from before pay cycles existed), otherwise a date range — a
 * cycle that straddles two calendar months has no single unambiguous name.
 */
export function formatMonthLabel(key: MonthKey, cycleStartDay = 1): string {
  if (cycleStartDay === 1) return formatMonthWithYear(key);
  const start = monthKeyToDate(key);
  const end = endOfMonth(key, cycleStartDay);
  return `${formatDayMonth(start)} – ${formatDayMonth(end)}`;
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
