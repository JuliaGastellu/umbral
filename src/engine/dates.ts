/**
 * Plain calendar dates with full years. No time zones: a date is an ISO string
 * "YYYY-MM-DD" and arithmetic uses an integer day number (days since 1970-01-01).
 */

export type ISODate = string;

const MS_PER_DAY = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** Returns true when the string is a real calendar date. */
export function isValidISO(s: string | null | undefined): s is ISODate {
  if (!s) return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

/**
 * A date the planner accepts as a plan input. Browsers fill the year digit by digit
 * (0002, 0020, 0202, 2027), so a year outside the planning range is treated as still
 * being typed, never as a plan date.
 */
export const PLAN_YEARS: [number, number] = [2000, 2100];
export function isPlanDate(s: string | null | undefined): s is ISODate {
  if (!isValidISO(s)) return false;
  const y = +s.slice(0, 4);
  return y >= PLAN_YEARS[0] && y <= PLAN_YEARS[1];
}

export function parts(s: ISODate): { y: number; m: number; d: number } {
  const m = ISO_RE.exec(s);
  if (!m) throw new Error(`Invalid date: ${s}`);
  return { y: +m[1], m: +m[2], d: +m[3] };
}

export function toDay(s: ISODate): number {
  const { y, m, d } = parts(s);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromDay(n: number): ISODate {
  const dt = new Date(n * MS_PER_DAY);
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addDays(s: ISODate, n: number): ISODate {
  return fromDay(toDay(s) + n);
}

/** Calendar days from a to b (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return toDay(b) - toDay(a);
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return toDay(a) <= toDay(b) ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return toDay(a) >= toDay(b) ? a : b;
}

/**
 * Place a month-day on a given year. 29 February maps to 28 February in years
 * without it (documented rule for historical years).
 */
export function onYear(month: number, day: number, year: number): ISODate {
  const d = month === 2 && day === 29 && !isLeapYear(year) ? 28 : day;
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Map a scenario date to a historical year, keeping the year offset to an anchor. */
export function mapToYear(date: ISODate, anchorYear: number, targetYear: number): ISODate {
  const p = parts(date);
  return onYear(p.m, p.d, targetYear + (p.y - anchorYear));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthName(m: number): string {
  return MONTHS[m - 1];
}

/** "15 Mar" or "15 Mar 2027" */
export function fmtDate(s: ISODate, withYear = false): string {
  const { y, m, d } = parts(s);
  return withYear ? `${d} ${MONTHS[m - 1]} ${y}` : `${d} ${MONTHS[m - 1]}`;
}
