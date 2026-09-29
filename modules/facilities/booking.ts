/**
 * Pure room-booking conflict detection. No I/O so it can be unit tested exhaustively.
 */
import { timesOverlap, toDateOnly } from "@/lib/utils/dates";

export interface BookingCandidate {
  id?: string | null;
  roomId: string;
  date: Date | string;
  startTime: string;
  endTime: string;
}

export interface ExistingBooking {
  id: string;
  roomId: string;
  date: Date | string;
  startTime: string;
  endTime: string;
  status?: string;
  purpose?: string | null;
}

/** A timetable slot (already filtered to the room + weekday) expressed as its period's time window. */
export interface TimetableWindow {
  periodStart: string;
  periodEnd: string;
  label?: string;
}

export interface BookingConflict {
  type: "BOOKING" | "TIMETABLE";
  message: string;
  bookingId?: string;
}

function sameDay(a: Date | string, b: Date | string): boolean {
  return toDateOnly(a).getTime() === toDateOnly(b).getTime();
}

/**
 * Returns every reason the candidate booking cannot be made:
 *  - another CONFIRMED booking of the same room on the same date overlapping in time
 *  - a timetable lesson scheduled in that room on that weekday overlapping in time
 */
export function bookingConflicts(
  candidate: BookingCandidate,
  existingBookings: ExistingBooking[],
  timetableSlotsForWeekday: TimetableWindow[],
): BookingConflict[] {
  const conflicts: BookingConflict[] = [];
  for (const b of existingBookings) {
    if (candidate.id && b.id === candidate.id) continue;
    if (b.roomId !== candidate.roomId) continue;
    if (b.status && b.status !== "CONFIRMED") continue;
    if (!sameDay(b.date, candidate.date)) continue;
    if (timesOverlap(candidate.startTime, candidate.endTime, b.startTime, b.endTime)) {
      conflicts.push({
        type: "BOOKING",
        bookingId: b.id,
        message: `Room is already booked ${b.startTime}–${b.endTime}${b.purpose ? ` (${b.purpose})` : ""}`,
      });
    }
  }
  for (const s of timetableSlotsForWeekday) {
    if (timesOverlap(candidate.startTime, candidate.endTime, s.periodStart, s.periodEnd)) {
      conflicts.push({
        type: "TIMETABLE",
        message: `A lesson is timetabled in this room ${s.periodStart}–${s.periodEnd}${s.label ? ` (${s.label})` : ""}`,
      });
    }
  }
  return conflicts;
}
