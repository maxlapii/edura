import { describe, expect, it } from "vitest";
import { findConflicts, findConflictsInSet, sameTime, type SlotLike } from "@/modules/timetable/conflicts";

const base: SlotLike = { id: "s1", teacherId: "t1", classId: "c1", roomId: "r1", dayOfWeek: 1, periodId: "p1" };

describe("timetable conflicts", () => {
  it("sameTime compares day and period", () => {
    expect(sameTime(base, { dayOfWeek: 1, periodId: "p1" })).toBe(true);
    expect(sameTime(base, { dayOfWeek: 2, periodId: "p1" })).toBe(false);
    expect(sameTime(base, { dayOfWeek: 1, periodId: "p2" })).toBe(false);
  });

  it("detects a teacher double booking", () => {
    const c = findConflicts([base], { teacherId: "t1", classId: "c2", roomId: "r2", dayOfWeek: 1, periodId: "p1" });
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ type: "TEACHER", slotId: "s1" });
  });

  it("detects class and room conflicts", () => {
    const c = findConflicts([base], { teacherId: "t2", classId: "c1", roomId: "r1", dayOfWeek: 1, periodId: "p1" });
    expect(c.map((x) => x.type).sort()).toEqual(["CLASS", "ROOM"]);
  });

  it("reports all three conflict types at once", () => {
    expect(findConflicts([base], { ...base, id: undefined }).map((x) => x.type).sort()).toEqual(["CLASS", "ROOM", "TEACHER"]);
  });

  it("ignores different times and rooms without ids", () => {
    expect(findConflicts([base], { teacherId: "t1", classId: "c1", roomId: "r1", dayOfWeek: 1, periodId: "p2" })).toEqual([]);
    expect(findConflicts([{ ...base, roomId: null }], { teacherId: "t2", classId: "c2", roomId: null, dayOfWeek: 1, periodId: "p1" })).toEqual([]);
    expect(findConflicts([base], { teacherId: "t2", classId: "c2", roomId: undefined, dayOfWeek: 1, periodId: "p1" })).toEqual([]);
  });

  it("excludes the candidate itself when updating", () => {
    expect(findConflicts([base], { ...base })).toEqual([]);
    expect(findConflicts([base, { ...base, id: "s2", teacherId: "t9", classId: "c9", roomId: "r9" }], { ...base, dayOfWeek: 1 })).toEqual([]);
  });

  it("validates a whole set, reporting earlier indices as the conflicting slot", () => {
    const set: SlotLike[] = [
      { teacherId: "t1", classId: "c1", roomId: null, dayOfWeek: 1, periodId: "p1" },
      { teacherId: "t1", classId: "c2", roomId: null, dayOfWeek: 1, periodId: "p1" },
      { teacherId: "t2", classId: "c3", roomId: null, dayOfWeek: 2, periodId: "p1" },
    ];
    const problems = findConflictsInSet(set);
    expect(problems).toHaveLength(1);
    expect(problems[0].index).toBe(1);
    expect(problems[0].conflicts[0].type).toBe("TEACHER");
    expect(findConflictsInSet([])).toEqual([]);
  });
});
