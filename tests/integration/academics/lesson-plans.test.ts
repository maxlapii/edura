import { describe, expect, it } from "vitest";
import { createSchoolFixture, prisma } from "../helpers";
import { copyLessonPlan, createLessonPlan, createLessonPlanSchema, curriculumProgress, deleteLessonPlan, getLessonPlan, listLessonPlans, updateLessonPlan } from "@/modules/lessonPlans";

const plan = (courseId: string, o: Record<string, unknown> = {}) => createLessonPlanSchema.parse({ courseId, title: "Intro to fractions", date: "2026-10-01", objectives: "Understand halves", ...o });

describe("lesson plans", () => {
  it("create → update → complete sets completedAt; reverting clears it", async () => {
    const f = await createSchoolFixture();
    const created = await createLessonPlan(f.teacher.auth, plan(f.course.id, { timetableSlotId: f.slots[0].id }));
    expect(created).toMatchObject({ status: "DRAFT", teacherId: f.teacher.teacher.id, courseId: f.course.id, schoolId: f.school.id, completedAt: null, timetableSlotId: f.slots[0].id });
    expect(created.date?.toISOString().slice(0, 10)).toBe("2026-10-01");

    const ready = await updateLessonPlan(f.teacher.auth, created.id, { status: "READY", activities: "Pizza slicing" });
    expect(ready).toMatchObject({ status: "READY", activities: "Pizza slicing", completedAt: null });
    const done = await updateLessonPlan(f.teacher.auth, created.id, { status: "COMPLETED" });
    expect(done.status).toBe("COMPLETED");
    expect(done.completedAt).toBeInstanceOf(Date);
    const doneAt = done.completedAt!.getTime();
    // completing again keeps the original timestamp
    expect((await updateLessonPlan(f.teacher.auth, created.id, { status: "COMPLETED", notes: "went well" })).completedAt?.getTime()).toBe(doneAt);
    expect((await updateLessonPlan(f.teacher.auth, created.id, { status: "DRAFT" })).completedAt).toBeNull();

    // only the owner (or admin) may edit / delete
    await expect(updateLessonPlan(f.teacher2.auth, created.id, { title: "hijack" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteLessonPlan(f.teacher2.auth, created.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await updateLessonPlan(f.admin, created.id, { title: "Admin edit" });
    expect((await getLessonPlan(f.teacher.auth, created.id)).title).toBe("Admin edit");
    await deleteLessonPlan(f.teacher.auth, created.id);
    expect(await prisma.lessonPlan.count()).toBe(0);
  });

  it("copies into another course the teacher teaches, but not into a course they do not teach", async () => {
    const f = await createSchoolFixture();
    const ownOther = await prisma.course.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, classId: f.cls.id, subjectId: f.otherSubject.id, teacherId: f.teacher.teacher.id } });
    const otherClass = await prisma.schoolClass.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, name: "10B" } });
    const notMine = await prisma.course.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, classId: otherClass.id, subjectId: f.subject.id, teacherId: f.teacher2.teacher.id } });

    const source = await createLessonPlan(f.teacher.auth, plan(f.course.id, { status: "COMPLETED", notes: "private notes", materials: "worksheet" }));
    const copy = await copyLessonPlan(f.teacher.auth, source.id, { courseId: ownOther.id, date: new Date("2026-10-08T00:00:00Z") });
    expect(copy).toMatchObject({ courseId: ownOther.id, teacherId: f.teacher.teacher.id, title: "Intro to fractions (copy)", status: "DRAFT", objectives: "Understand halves", materials: "worksheet", notes: null, completedAt: null });
    expect(copy.id).not.toBe(source.id);
    expect(copy.date?.toISOString().slice(0, 10)).toBe("2026-10-08");

    await expect(copyLessonPlan(f.teacher.auth, source.id, { courseId: notMine.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.lessonPlan.count({ where: { courseId: notMine.id } })).toBe(0);
    // creating directly for a course not taught is also refused
    await expect(createLessonPlan(f.teacher.auth, plan(notMine.id))).rejects.toMatchObject({ code: "FORBIDDEN" });
    // teacher2 cannot copy teacher's plan into their own course either (source belongs to another course)
    const stolen = await copyLessonPlan(f.teacher2.auth, source.id, { courseId: notMine.id });
    expect(stolen.teacherId).toBe(f.teacher2.teacher.id);
  });

  it("listLessonPlans is scoped to own plans for teachers and school-wide for admins", async () => {
    const f = await createSchoolFixture();
    const otherClass = await prisma.schoolClass.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, name: "10B" } });
    const course2 = await prisma.course.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, classId: otherClass.id, subjectId: f.subject.id, teacherId: f.teacher2.teacher.id } });
    const p1 = await createLessonPlan(f.teacher.auth, plan(f.course.id, { title: "T1 plan" }));
    const p2 = await createLessonPlan(f.teacher2.auth, plan(course2.id, { title: "T2 plan", status: "READY" }));

    expect((await listLessonPlans(f.teacher.auth)).map((p) => p.id)).toEqual([p1.id]);
    expect((await listLessonPlans(f.teacher2.auth)).map((p) => p.id)).toEqual([p2.id]);
    // a teacher asking for another teacher's plans still only gets their own
    expect((await listLessonPlans(f.teacher.auth, { teacherId: f.teacher2.teacher.id })).map((p) => p.id)).toEqual([p1.id]);
    expect(new Set((await listLessonPlans(f.admin)).map((p) => p.id))).toEqual(new Set([p1.id, p2.id]));
    expect((await listLessonPlans(f.admin, { teacherId: f.teacher2.teacher.id })).map((p) => p.id)).toEqual([p2.id]);
    expect((await listLessonPlans(f.admin, { status: "READY" })).map((p) => p.id)).toEqual([p2.id]);
    expect((await listLessonPlans(f.admin, { courseId: f.course.id })).map((p) => p.id)).toEqual([p1.id]);
    // students have no lesson_plans:read
    await expect(listLessonPlans(f.students[0].auth!)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("curriculumProgress reports completion percentages per course", async () => {
    const f = await createSchoolFixture();
    expect(await curriculumProgress(f.teacher.auth, f.course.id)).toEqual({ courseId: f.course.id, DRAFT: 0, READY: 0, COMPLETED: 0, total: 0, completionRate: 0 });
    await createLessonPlan(f.teacher.auth, plan(f.course.id, { status: "COMPLETED" }));
    await createLessonPlan(f.teacher.auth, plan(f.course.id, { status: "COMPLETED" }));
    await createLessonPlan(f.teacher.auth, plan(f.course.id, { status: "READY" }));
    await createLessonPlan(f.teacher.auth, plan(f.course.id));
    await createLessonPlan(f.teacher.auth, plan(f.course.id));
    await createLessonPlan(f.teacher.auth, plan(f.course.id));
    expect(await curriculumProgress(f.admin, f.course.id)).toEqual({ courseId: f.course.id, DRAFT: 3, READY: 1, COMPLETED: 2, total: 6, completionRate: 33.3 });
    await expect(curriculumProgress(f.teacher2.auth, f.course.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a linked timetable slot must belong to the course", async () => {
    const f = await createSchoolFixture();
    const ownOther = await prisma.course.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, classId: f.cls.id, subjectId: f.otherSubject.id, teacherId: f.teacher.teacher.id } });
    const foreignSlot = await prisma.timetableSlot.create({ data: { schoolId: f.school.id, courseId: ownOther.id, teacherId: f.teacher.teacher.id, classId: f.cls.id, periodId: f.periods[1].id, dayOfWeek: 1 } });
    await expect(createLessonPlan(f.teacher.auth, plan(f.course.id, { timetableSlotId: foreignSlot.id }))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(createLessonPlan(f.teacher.auth, plan(f.course.id, { timetableSlotId: "does-not-exist" }))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const ok = await createLessonPlan(f.teacher.auth, plan(ownOther.id, { timetableSlotId: foreignSlot.id }));
    expect(ok.timetableSlot?.id).toBe(foreignSlot.id);
    expect(ok.timetableSlot?.period.id).toBe(f.periods[1].id);
  });
});
