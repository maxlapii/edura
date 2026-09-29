import { format, parseISO } from "date-fns";

const DAY_MS = 86_400_000;

/** ISO day of week computed in UTC: 1 = Monday … 7 = Sunday. Date-only values are stored as UTC midnight. */
export function dayOfWeek(date: Date): number {
  const d = date.getUTCDay();
  return d === 0 ? 7 : d;
}

/** Returns a date-only (UTC midnight) Date suitable for @db.Date columns. */
export function toDateOnly(input: Date | string): Date {
  const d = typeof input === "string" ? (input.length === 10 ? new Date(`${input}T00:00:00.000Z`) : parseISO(input)) : input;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Formats a date-only value as YYYY-MM-DD (UTC based, so @db.Date values never shift). */
export function formatDate(d: Date | string): string {
  return toDateOnly(d).toISOString().slice(0, 10);
}

/** Formats a timestamp for display in the server's local time. */
export function formatDateTime(d: Date | string): string {
  return format(typeof d === "string" ? parseISO(d) : d, "yyyy-MM-dd HH:mm");
}

/** Inclusive list of date-only values between start and end. */
export function datesBetween(start: Date, end: Date): Date[] {
  const s = toDateOnly(start).getTime();
  const e = toDateOnly(end).getTime();
  const out: Date[] = [];
  for (let t = s; t <= e; t += DAY_MS) out.push(new Date(t));
  return out;
}

/** Number of calendar days in an inclusive range (0 when inverted). */
export function inclusiveDays(start: Date, end: Date): number {
  const n = Math.round((toDateOnly(end).getTime() - toDateOnly(start).getTime()) / DAY_MS) + 1;
  return n < 0 ? 0 : n;
}

/** Number of working days (Mon–Fri) in an inclusive range. */
export function workingDays(start: Date, end: Date): number {
  return datesBetween(start, end).filter((d) => dayOfWeek(d) <= 5).length;
}

export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() <= bEnd.getTime() && aEnd.getTime() >= bStart.getTime();
}

/** "08:00" -> minutes since midnight */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}

export function todayDateOnly(): Date {
  return toDateOnly(new Date());
}

export function addDaysDateOnly(d: Date, n: number): Date {
  return new Date(toDateOnly(d).getTime() + n * DAY_MS);
}
