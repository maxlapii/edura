import { describe, expect, it } from "vitest";
import { createOtherSchool, createSchoolFixture, prisma } from "../helpers";
import { createPeriod, createSlot, createSlots, deletePeriod, listPeriods, teacherDaySchedule, updatePeriod, updateSlot, weeklySchedule } from "@/modules/timetable/service";
import { dayOfWeek, toDateOnly } from "@/lib/utils/dates";

type Fixture = Awaited<ReturnType<typeof createSchoolFixture>>;

/** Second class "10B" with a History course taught by teacher2 and a Maths course taught by the fixture teacher. */
async function secondClass(f: Fixture) {
  const cls2 = await prisma.schoolClass.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, name: "10B" } });
  const history = await prisma.course.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, classId: cls2.id, subjectId: f.otherSubject.id, teacherId: f.teacher2.teacher.id } });
  const maths = await prisma.course.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, classId: cls2.id, subjectId: f.subject.id, teacherId: f.teacher.teacher.id } });
  return { cls2, history, maths };
}

describe("timetable slots", () => {
  it("createSlot reports teacher, class and room conflicts with the conflict type in details", async () => {
    const f = await createSchoolFixture();
    const { history, maths } = await secondClass(f);
    const p1 = f.periods[0].id;
    // Fixture: teacher / 10A / Room 1 occupy period 1 every day.
    const teacherClash = await createSlot(f.admin, { courseId: maths.id, dayOfWeek: 1, periodId: p1, roomId: null }).catch((e) => e);
    expect(teacherClash).toMatchObject({ code: "CONFLICT", status: 409, details: [{ type: "TEACHER", slotId: f.slots[0].id }] });

    const historyFor10A = await prisma.course.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, classId: f.cls.id, subjectId: f.otherSubject.id, teacherId: f.teacher2.teacher.id } });
    const classClash = await createSlot(f.admin, { courseId: historyFor10A.id, dayOfWeek: 1, periodId: p1, roomId: null }).catch((e) => e);
    expect(classClash).toMatchObject({ code: "CONFLICT", details: [{ type: "CLASS" }] });

    const roomClash = await createSlot(f.admin, { courseId: history.id, dayOfWeek: 1, periodId: p1, roomId: f.room.id }).catch((e) => e);
    expect(roomClash).toMatchObject({ code: "CONFLICT", details: [{ type: "ROOM" }] });

    // Several conflicts are reported together.
    const both = await createSlot(f.admin, { courseId: maths.id, dayOfWeek: 1, periodId: p1, roomId: f.room.id }).catch((e) => e);
    expect((both.details as { type: string }[]).map((c) => c.type).sort()).toEqual(["ROOM", "TEACHER"]);

    expect(await prisma.timetableSlot.count({ where: { schoolId: f.school.id } })).toBe(7);
    const ok = await createSlot(f.admin, { courseId: history.id, dayOfWeek: 1, periodId: f.periods[1].id, roomId: f.room.id });
    expect(ok).toMatchObject({ teacherId: f.teacher2.teacher.id, classId: history.classId, dayOfWeek: 1, periodId: f.periods[1].id, roomId: f.room.id });
    await expect(createSlot(f.teacher.auth, { courseId: history.id, dayOfWeek: 2, periodId: f.periods[1].id, roomId: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("validates that period and room belong to the course's school", async () => {
    const f = await createSchoolFixture();
    const other = await createOtherSchool();
    const foreignPeriod = await prisma.period.findFirstOrThrow({ where: { schoolId: other.school.id } });
    const foreignRoom = await prisma.room.create({ data: { schoolId: other.school.id, name: "X", code: "X" } });
    await expect(createSlot(f.admin, { courseId: f.course.id, dayOfWeek: 1, periodId: foreignPeriod.id, roomId: null })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(createSlot(f.admin, { courseId: f.course.id, dayOfWeek: 1, periodId: f.periods[2].id, roomId: foreignRoom.id })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("the database unique constraints are a backstop against duplicate slots", async () => {
    const f = await createSchoolFixture();
    const { history, maths } = await secondClass(f);
    const p1 = f.periods[0].id;
    const direct = (data: { courseId: string; teacherId: string; classId: string; roomId?: string | null }) =>
      prisma.timetableSlot.create({ data: { schoolId: f.school.id, periodId: p1, dayOfWeek: 1, ...data } }).catch((e) => e);
    // teacher duplicate
    expect(await direct({ courseId: maths.id, teacherId: f.teacher.teacher.id, classId: maths.classId })).toMatchObject({ code: "P2002" });
    // class duplicate
    expect(await direct({ courseId: history.id, teacherId: f.teacher2.teacher.id, classId: f.cls.id })).toMatchObject({ code: "P2002" });
    // room duplicate
    expect(await direct({ courseId: history.id, teacherId: f.teacher2.teacher.id, classId: history.classId, roomId: f.room.id })).toMatchObject({ code: "P2002" });
    expect(await prisma.timetableSlot.count({ where: { schoolId: f.school.id } })).toBe(7);
  });

  it("createSlots is atomic: a conflicting batch writes nothing and reports conflicts by index", async () => {
    const f = await createSchoolFixture();
    const { history, maths } = await secondClass(f);
    const p1 = f.periods[0].id;
    const p2 = f.periods[1].id;
    const bad = await createSlots(f.admin, [
      { courseId: history.id, dayOfWeek: 1, periodId: p2, roomId: null },
      { courseId: maths.id, dayOfWeek: 1, periodId: p1, roomId: null },
      { courseId: history.id, dayOfWeek: 2, periodId: p2, roomId: null },
      { courseId: history.id, dayOfWeek: 2, periodId: p2, roomId: null },
    ]).catch((e) => e);
    expect(bad).toMatchObject({ code: "CONFLICT" });
    const errors = bad.details as { index: number; conflicts: { type: string }[] }[];
    expect(errors.map((e) => e.index)).toEqual([1, 3]);
    expect(errors[0].conflicts.map((c) => c.type)).toEqual(["TEACHER"]);
    expect(errors[1].conflicts.map((c) => c.type).sort()).toEqual(["CLASS", "TEACHER"]);
    expect(await prisma.timetableSlot.count({ where: { schoolId: f.school.id } })).toBe(7);

    const good = await createSlots(f.admin, [
      { courseId: history.id, dayOfWeek: 1, periodId: p2, roomId: null },
      { courseId: maths.id, dayOfWeek: 1, periodId: f.periods[2].id, roomId: f.room.id },
    ]);
    expect(good).toEqual({ created: 2 });
    expect(await prisma.timetableSlot.count({ where: { schoolId: f.school.id } })).toBe(9);

    const other = await createOtherSchool();
    const foreignCourse = await prisma.course.create({ data: { schoolId: other.school.id, academicYearId: other.year.id, classId: other.cls.id, subjectId: (await prisma.subject.create({ data: { schoolId: other.school.id, name: "A", code: "A" } })).id, teacherId: other.teacher.teacher.id } });
    await expect(createSlots(f.admin, [{ courseId: foreignCourse.id, dayOfWeek: 3, periodId: p1, roomId: null }])).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("updateSlot excludes the slot itself from conflict detection but catches clashes with others", async () => {
    const f = await createSchoolFixture();
    const monday = f.slots[0];
    const sameTime = await updateSlot(f.admin, monday.id, { roomId: null });
    expect(sameTime).toMatchObject({ id: monday.id, dayOfWeek: 1, roomId: null });
    const backAgain = await updateSlot(f.admin, monday.id, { roomId: f.room.id });
    expect(backAgain.roomId).toBe(f.room.id);

    const moved = await updateSlot(f.admin, monday.id, { periodId: f.periods[3].id });
    expect(moved.periodId).toBe(f.periods[3].id);

    const clash = await updateSlot(f.admin, monday.id, { dayOfWeek: 2, periodId: f.periods[0].id }).catch((e) => e);
    expect(clash).toMatchObject({ code: "CONFLICT" });
    expect((clash.details as { type: string; slotId: string }[]).map((c) => c.type).sort()).toEqual(["CLASS", "ROOM", "TEACHER"]);
    expect((clash.details as { slotId: string }[]).every((c) => c.slotId === f.slots[1].id)).toBe(true);
    expect((await prisma.timetableSlot.findUniqueOrThrow({ where: { id: monday.id } })).dayOfWeek).toBe(1);
  });
});

describe("schedules", () => {
  it("weeklySchedule is scoped per role", async () => {
    const f = await createSchoolFixture();
    // 10B is taught by teacher2 only – the fixture teacher has no course there.
    const cls2 = await prisma.schoolClass.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, name: "10B" } });
    const history = await prisma.course.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, classId: cls2.id, subjectId: f.otherSubject.id, teacherId: f.teacher2.teacher.id } });
    const slot2 = await prisma.timetableSlot.create({ data: { schoolId: f.school.id, courseId: history.id, teacherId: f.teacher2.teacher.id, classId: cls2.id, periodId: f.periods[1].id, dayOfWeek: 1 } });

    // Teacher: own schedule only, even when asking for someone else.
    const own = await weeklySchedule(f.teacher.auth, {});
    expect(own).toHaveLength(7);
    expect(own.every((s) => s.teacherId === f.teacher.teacher.id)).toBe(true);
    await expect(weeklySchedule(f.teacher.auth, { teacherId: f.teacher2.teacher.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await weeklySchedule(f.teacher.auth, { classId: f.cls.id })).map((s) => s.classId)).toEqual(Array(7).fill(f.cls.id));
    await expect(weeklySchedule(f.teacher.auth, { classId: cls2.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await weeklySchedule(f.teacher.auth, { dayOfWeek: 3 })).map((s) => s.dayOfWeek)).toEqual([3]);

    // Student: always their own class, filters for other people are ignored.
    const student = await weeklySchedule(f.students[0].auth!, { teacherId: f.teacher2.teacher.id, classId: cls2.id });
    expect(student).toHaveLength(7);
    expect(student.every((s) => s.classId === f.cls.id)).toBe(true);

    // Parent: must name a class of a linked child.
    await expect(weeklySchedule(f.guardian.auth, {})).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(weeklySchedule(f.guardian.auth, { classId: cls2.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await weeklySchedule(f.guardian.auth, { classId: f.cls.id })).toHaveLength(7);

    // Admin: anything.
    expect((await weeklySchedule(f.admin, { teacherId: f.teacher2.teacher.id })).map((s) => s.id)).toEqual([slot2.id]);
    expect(await weeklySchedule(f.admin, { classId: cls2.id })).toHaveLength(1);
    expect(await weeklySchedule(f.admin, { roomId: f.room.id })).toHaveLength(7);
    expect(await weeklySchedule(f.admin, {})).toHaveLength(8);
    expect((await weeklySchedule(f.admin, {}))[0].course.class._count.students).toBe(3);
  });

  it("teacherDaySchedule shows substitution coverage for both the substitute and the absent teacher", async () => {
    const f = await createSchoolFixture();
    const date = toDateOnly(new Date("2026-10-07T00:00:00Z"));
    const dow = dayOfWeek(date);
    const slot = f.slots.find((s) => s.dayOfWeek === dow)!;
    await prisma.substitution.create({ data: { schoolId: f.school.id, timetableSlotId: slot.id, date, absentTeacherId: f.teacher.teacher.id, substituteTeacherId: f.teacher2.teacher.id, status: "ASSIGNED" } });

    const substitute = await teacherDaySchedule(f.teacher2.auth, f.teacher2.teacher.id, date);
    expect(substitute.dayOfWeek).toBe(dow);
    expect(substitute.lessons).toHaveLength(1);
    expect(substitute.lessons[0]).toMatchObject({ kind: "SUBSTITUTION", substitutionStatus: "ASSIGNED", slot: { id: slot.id }, coveringFor: { id: f.teacher.teacher.id } });

    const absent = await teacherDaySchedule(f.teacher.auth, f.teacher.teacher.id, date);
    expect(absent.lessons).toHaveLength(1);
    expect(absent.lessons[0]).toMatchObject({ kind: "OWN", substitutionStatus: "ASSIGNED", coveredBy: { id: f.teacher2.teacher.id } });

    // Another day has no coverage.
    const nextDay = await teacherDaySchedule(f.admin, f.teacher.teacher.id, new Date(date.getTime() + 86_400_000));
    expect(nextDay.lessons[0]).toMatchObject({ kind: "OWN", coveredBy: null, substitutionStatus: null });
    expect(await teacherDaySchedule(f.admin, f.teacher2.teacher.id, new Date(date.getTime() + 86_400_000))).toMatchObject({ lessons: [] });

    await expect(teacherDaySchedule(f.teacher2.auth, f.teacher.teacher.id, date)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(teacherDaySchedule(f.students[0].auth!, f.teacher.teacher.id, date)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("periods", () => {
  it("supports CRUD and blocks deletion of periods in use", async () => {
    const f = await createSchoolFixture();
    expect(await listPeriods(f.admin)).toHaveLength(8);
    expect(await listPeriods(f.teacher.auth)).toHaveLength(8);

    const p9 = await createPeriod(f.admin, { name: "Period 9", order: 9, startTime: "15:40", endTime: "16:25" });
    expect(p9).toMatchObject({ schoolId: f.school.id, order: 9 });
    await expect(createPeriod(f.teacher.auth, { name: "Nope", order: 10, startTime: "16:30", endTime: "17:00" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createPeriod(f.admin, { name: "Dup", order: 9, startTime: "16:30", endTime: "17:00" })).rejects.toMatchObject({ code: "P2002" });

    const renamed = await updatePeriod(f.admin, p9.id, { name: "After school" });
    expect(renamed.name).toBe("After school");

    await expect(deletePeriod(f.admin, f.periods[0].id)).rejects.toMatchObject({ code: "CONFLICT" });
    await deletePeriod(f.admin, p9.id);
    expect(await listPeriods(f.admin)).toHaveLength(8);

    const other = await createOtherSchool();
    await expect(updatePeriod(other.admin, f.periods[1].id, { name: "Hijack" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deletePeriod(other.admin, f.periods[1].id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
