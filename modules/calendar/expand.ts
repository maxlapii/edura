import { datesBetween, dayOfWeek, toDateOnly } from "@/lib/utils/dates";

export type CalendarKind = "LESSON" | "MEETING" | "EVENT" | "ASSIGNMENT" | "LEAVE" | "SUBSTITUTION" | "HOLIDAY" | "TERM" | "EXAM";

export const CALENDAR_KINDS: readonly CalendarKind[] = ["LESSON", "MEETING", "EVENT", "ASSIGNMENT", "LEAVE", "SUBSTITUTION", "HOLIDAY", "TERM", "EXAM"];

export interface CalendarEntry {
  id: string;
  kind: CalendarKind;
  title: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  link: string | null;
  meta: Record<string, unknown>;
}

export interface WeeklySlot {
  id: string;
  /** ISO weekday: 1 = Monday … 7 = Sunday */
  dayOfWeek: number;
}

export interface ExpandedSlot<T extends WeeklySlot> {
  slot: T;
  /** Date-only (UTC midnight). */
  date: Date;
}

/**
 * Expands weekly timetable slots into one occurrence per matching date in the inclusive range.
 * Pure: no I/O. Output is ordered by date, then by input order.
 */
export function expandWeeklySlots<T extends WeeklySlot>(slots: T[], from: Date, to: Date): ExpandedSlot<T>[] {
  const out: ExpandedSlot<T>[] = [];
  if (slots.length === 0) return out;
  const byDay = new Map<number, T[]>();
  for (const slot of slots) {
    const list = byDay.get(slot.dayOfWeek) ?? [];
    list.push(slot);
    byDay.set(slot.dayOfWeek, list);
  }
  for (const date of datesBetween(from, to)) {
    const todays = byDay.get(dayOfWeek(date));
    if (!todays) continue;
    const d = toDateOnly(date);
    for (const slot of todays) out.push({ slot, date: d });
  }
  return out;
}

/** Combines a date-only Date with an "HH:MM" time into a UTC Date. Pure. */
export function combineDateAndTime(date: Date, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h || 0, m || 0));
}

/** Date-only key "YYYY-MM-DD" (UTC). Pure. */
export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** True when a whole-day/multi-day range [start, end] intersects [from, to] (inclusive). Pure. */
export function overlapsRange(start: Date, end: Date | null, from: Date, to: Date): boolean {
  const e = end ?? start;
  return start.getTime() <= to.getTime() && e.getTime() >= from.getTime();
}

/** Merges calendar entry lists into one list sorted by start, then all-day first, then kind, then title. Pure. */
export function mergeCalendar(...lists: CalendarEntry[][]): CalendarEntry[] {
  const seen = new Set<string>();
  const merged: CalendarEntry[] = [];
  for (const list of lists) {
    for (const entry of list) {
      const key = `${entry.kind}:${entry.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(entry);
    }
  }
  return merged.sort((a, b) => {
    const dt = a.start.getTime() - b.start.getTime();
    if (dt !== 0) return dt;
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.title.localeCompare(b.title);
  });
}

/** Filters entries by kind (no-op when `kinds` is empty/undefined). Pure. */
export function filterKinds(entries: CalendarEntry[], kinds?: string[] | null): CalendarEntry[] {
  if (!kinds || kinds.length === 0) return entries;
  const set = new Set(kinds);
  return entries.filter((e) => set.has(e.kind));
}
