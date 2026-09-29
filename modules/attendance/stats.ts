/** Pure attendance calculations. */
export type Status = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export interface AttendanceStats {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  /** (present + late) / total, excused days count as neither present nor absent. */
  attendanceRate: number;
  absenceRate: number;
}

export function computeAttendanceStats(records: Array<{ status: Status }>): AttendanceStats {
  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
  for (const r of records) counts[r.status]++;
  const total = records.length;
  const countable = total - counts.EXCUSED;
  const attended = counts.PRESENT + counts.LATE;
  const attendanceRate = countable === 0 ? 100 : Number(((attended / countable) * 100).toFixed(1));
  const absenceRate = countable === 0 ? 0 : Number(((counts.ABSENT / countable) * 100).toFixed(1));
  return { total, present: counts.PRESENT, absent: counts.ABSENT, late: counts.LATE, excused: counts.EXCUSED, attendanceRate, absenceRate };
}

/** Counts absences within the trailing window ending at `asOf`. */
export function countRecentAbsences(records: Array<{ status: Status; date: Date }>, asOf: Date, windowDays: number): number {
  const from = new Date(asOf.getTime() - (windowDays - 1) * 86_400_000);
  return records.filter((r) => r.status === "ABSENT" && r.date >= from && r.date <= asOf).length;
}

/** True when the number of absences in the window reaches the threshold. */
export function hasRepeatedAbsence(records: Array<{ status: Status; date: Date }>, asOf: Date, threshold: number, windowDays: number): boolean {
  return countRecentAbsences(records, asOf, windowDays) >= threshold;
}

/** Consecutive absent days counting backwards from the latest record. */
export function consecutiveAbsences(records: Array<{ status: Status; date: Date }>): number {
  const sorted = [...records].sort((a, b) => b.date.getTime() - a.date.getTime());
  let n = 0;
  for (const r of sorted) {
    if (r.status === "ABSENT") n++;
    else break;
  }
  return n;
}
