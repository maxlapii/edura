import { addDaysDateOnly, formatDate, toDateOnly, todayDateOnly } from "@/lib/utils/dates";

export type SearchParams = Record<string, string | string[] | undefined>;

/** First value of a query parameter. */
export function param(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Parses a `YYYY-MM-DD` query parameter into a date-only Date (today when missing/invalid). */
export function dateParam(sp: SearchParams, key = "date"): Date {
  const v = param(sp, key);
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) return toDateOnly(v);
  return todayDateOnly();
}

export function pageParam(sp: SearchParams): number {
  const n = Number(param(sp, "page"));
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function ymd(d: Date): string {
  return formatDate(d);
}

export function shiftDate(d: Date, days: number): string {
  return formatDate(addDaysDateOnly(d, days));
}

/** Builds a query string from defined values only. */
export function qs(values: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Days until a date (negative when in the past), based on date-only values. */
export function daysUntil(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  return Math.round((toDateOnly(d).getTime() - todayDateOnly().getTime()) / 86_400_000);
}

export function studentName(s: { firstName: string; lastName: string }): string {
  return `${s.firstName} ${s.lastName}`;
}

export type Attachment = { name: string; url: string };

export function asAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  return value.filter((a): a is Attachment => !!a && typeof a === "object" && typeof (a as Attachment).name === "string" && typeof (a as Attachment).url === "string");
}

/** Default due date for a new assignment: one week from now at 17:00 local time. */
export function defaultDueDate(): Date {
  const d = new Date(Date.now() + 7 * 86_400_000);
  d.setHours(17, 0, 0, 0);
  return d;
}
