import { describe, expect, it } from "vitest";
import { computeAttendanceStats, consecutiveAbsences, countRecentAbsences, hasRepeatedAbsence } from "@/modules/attendance/stats";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("computeAttendanceStats", () => {
  it("counts each status and computes rates excluding excused", () => {
    const s = computeAttendanceStats([{ status: "PRESENT" }, { status: "PRESENT" }, { status: "LATE" }, { status: "ABSENT" }, { status: "EXCUSED" }]);
    expect(s).toEqual({ total: 5, present: 2, absent: 1, late: 1, excused: 1, attendanceRate: 75, absenceRate: 25 });
  });
  it("treats no records as 100% attendance", () => {
    expect(computeAttendanceStats([])).toMatchObject({ total: 0, attendanceRate: 100, absenceRate: 0 });
    expect(computeAttendanceStats([{ status: "EXCUSED" }])).toMatchObject({ total: 1, attendanceRate: 100, absenceRate: 0 });
  });
});

describe("repeated absence detection", () => {
  const records = [
    { status: "ABSENT" as const, date: d("2026-09-01") },
    { status: "ABSENT" as const, date: d("2026-09-10") },
    { status: "PRESENT" as const, date: d("2026-09-11") },
    { status: "ABSENT" as const, date: d("2026-09-20") },
    { status: "ABSENT" as const, date: d("2026-09-28") },
  ];
  it("counts absences inside the trailing window only", () => {
    expect(countRecentAbsences(records, d("2026-09-28"), 30)).toBe(4);
    expect(countRecentAbsences(records, d("2026-09-28"), 10)).toBe(2);
    expect(countRecentAbsences(records, d("2026-09-28"), 1)).toBe(1);
    expect(countRecentAbsences(records, d("2026-09-15"), 30)).toBe(2);
  });
  it("flags when the threshold is reached", () => {
    expect(hasRepeatedAbsence(records, d("2026-09-28"), 3, 30)).toBe(true);
    expect(hasRepeatedAbsence(records, d("2026-09-28"), 3, 10)).toBe(false);
    expect(hasRepeatedAbsence([], d("2026-09-28"), 1, 30)).toBe(false);
  });
  it("counts consecutive absences from the latest record backwards", () => {
    expect(consecutiveAbsences(records)).toBe(2);
    expect(consecutiveAbsences([{ status: "PRESENT", date: d("2026-09-28") }, ...records])).toBe(0);
    expect(consecutiveAbsences([])).toBe(0);
  });
});
