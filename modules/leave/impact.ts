import { datesBetween, dayOfWeek, toDateOnly } from "@/lib/utils/dates";

/** Pure: the timetable slots hit by a leave range (weekly slots × dates in range). */
export function affectedSlotDates(slots: Array<{ id: string; dayOfWeek: number }>, startDate: Date, endDate: Date) {
  const out: Array<{ slotId: string; date: Date }> = [];
  for (const date of datesBetween(startDate, endDate)) {
    const dow = dayOfWeek(date);
    for (const slot of slots) if (slot.dayOfWeek === dow) out.push({ slotId: slot.id, date: toDateOnly(date) });
  }
  return out;
}

/** Pure: whether a candidate leave overlaps any existing (pending/approved) leave. */
export function overlapsExistingLeave(candidate: { startDate: Date; endDate: Date }, existing: Array<{ startDate: Date; endDate: Date; status: string }>): boolean {
  return existing.some((l) => (l.status === "PENDING" || l.status === "APPROVED") && l.startDate <= candidate.endDate && l.endDate >= candidate.startDate);
}
