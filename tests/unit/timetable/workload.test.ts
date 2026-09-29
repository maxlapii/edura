import { describe, expect, it } from "vitest";
import { classifyUtilization, computeWorkload, WORKLOAD_THRESHOLDS } from "@/modules/timetable/workload";

const slot = (courseId: string, classId: string, subjectId: string) => ({ courseId, classId, subjectId });

describe("computeWorkload", () => {
  it("counts periods, classes and subjects and derives preparation time", () => {
    const w = computeWorkload({
      teachingSlots: [slot("a", "c1", "s1"), slot("a", "c1", "s1"), slot("b", "c2", "s1"), slot("c", "c3", "s2"), slot("c", "c3", "s2")],
      duties: [],
      substitutionPeriods: 0,
      meetingHours: 0,
      homeroomClasses: 0,
      leaveDays: 0,
      maxWeeklyPeriods: 25,
    });
    expect(w.teachingPeriods).toBe(5);
    expect(w.classes).toBe(3);
    expect(w.subjects).toBe(2);
    expect(w.preparationPeriods).toBe(1);
    expect(w.totalPeriods).toBe(6);
    expect(w.utilization).toBe(24);
    expect(w.level).toBe("UNDERUTILIZED");
  });

  it("converts meetings and duties into periods and adds homeroom time", () => {
    const w = computeWorkload({
      teachingSlots: Array.from({ length: 20 }, (_, i) => slot(`c${i % 4}`, `cl${i % 4}`, "s")),
      duties: [{ weeklyHours: 1.5 }, { weeklyHours: 0.75 }],
      substitutionPeriods: 2,
      meetingHours: 1.5,
      homeroomClasses: 1,
      leaveDays: 0,
      maxWeeklyPeriods: 25,
      periodMinutes: 45,
    });
    // 20 teaching + 4 prep + 2 subs + 2 meetings + 3 duties + 1 homeroom = 32
    expect(w.totalPeriods).toBe(32);
    expect(w.dutyHours).toBe(2.25);
    expect(w.utilization).toBe(128);
    expect(w.level).toBe("OVERLOADED");
  });

  it("respects an explicit preparation allowance and guards against max = 0", () => {
    const w = computeWorkload({ teachingSlots: [slot("a", "c", "s")], duties: [], substitutionPeriods: 0, meetingHours: 0, homeroomClasses: 0, leaveDays: 2, preparationPeriods: 5, maxWeeklyPeriods: 0 });
    expect(w.preparationPeriods).toBe(5);
    expect(w.leaveDays).toBe(2);
    expect(Number.isFinite(w.utilization)).toBe(true);
  });
});

describe("classifyUtilization", () => {
  it("maps utilization percentages onto levels", () => {
    expect(classifyUtilization(WORKLOAD_THRESHOLDS.underutilized - 0.1)).toBe("UNDERUTILIZED");
    expect(classifyUtilization(WORKLOAD_THRESHOLDS.underutilized)).toBe("NORMAL");
    expect(classifyUtilization(80)).toBe("NORMAL");
    expect(classifyUtilization(WORKLOAD_THRESHOLDS.high)).toBe("HIGH");
    expect(classifyUtilization(WORKLOAD_THRESHOLDS.overloaded)).toBe("OVERLOADED");
    expect(classifyUtilization(200)).toBe("OVERLOADED");
  });
});
