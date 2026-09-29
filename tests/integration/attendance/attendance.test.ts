import { describe, expect, it } from "vitest";
import { createSchoolFixture, createStudent, prisma } from "../helpers";
import { classAttendanceSummary, openSession, pendingAttendanceForTeacher, recordAttendance, repeatedAbsenceStudents, studentAttendanceSummary } from "@/modules/attendance/service";
import { dayOfWeek, toDateOnly } from "@/lib/utils/dates";

const today = toDateOnly(new Date());
const daysAgo = (n: number) => new Date(today.getTime() - n * 86_400_000);

describe("attendance sessions", () => {
  it("openSession is idempotent and auto-picks the single timetable slot for that weekday", async () => {
    const f = await createSchoolFixture();
    const date = daysAgo(1);
    const first = await openSession(f.teacher.auth, { courseId: f.course.id, date, periodId: null, timetableSlotId: null });
    const expectedSlot = f.slots.find((s) => s.dayOfWeek === dayOfWeek(date))!;
    expect(first.session).toMatchObject({ courseId: f.course.id, periodId: f.periods[0].id, timetableSlotId: expectedSlot.id, status: "OPEN", recordedById: f.teacher.teacher.id });
    expect(first.roster.map((s) => s.id).sort()).toEqual(f.students.map((s) => s.student.id).sort());

    const again = await openSession(f.teacher.auth, { courseId: f.course.id, date, periodId: null, timetableSlotId: null });
    expect(again.session.id).toBe(first.session.id);
    const byPeriod = await openSession(f.admin, { courseId: f.course.id, date, periodId: f.periods[0].id, timetableSlotId: null });
    expect(byPeriod.session.id).toBe(first.session.id);
    expect(await prisma.attendanceSession.count({ where: { courseId: f.course.id } })).toBe(1);

    // A slot from another course is rejected.
    const otherCourse = await prisma.course.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, classId: f.cls.id, subjectId: f.otherSubject.id, teacherId: f.teacher.teacher.id } });
    await expect(openSession(f.teacher.auth, { courseId: otherCourse.id, date, periodId: null, timetableSlotId: expectedSlot.id })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    // With two lessons on that weekday nothing is auto-picked.
    await prisma.timetableSlot.create({ data: { schoolId: f.school.id, courseId: f.course.id, teacherId: f.teacher.teacher.id, classId: f.cls.id, periodId: f.periods[1].id, dayOfWeek: dayOfWeek(date) } });
    const ambiguous = await openSession(f.teacher.auth, { courseId: f.course.id, date, periodId: null, timetableSlotId: null });
    expect(ambiguous.session.id).not.toBe(first.session.id);
    expect(ambiguous.session).toMatchObject({ periodId: null, timetableSlotId: null });
  });

  it("recordAttendance with markAllPresent fills the roster, upserts on re-submit and marks the session SUBMITTED", async () => {
    const f = await createSchoolFixture();
    const [s0, s1, s2] = f.students.map((s) => s.student);
    const { session } = await openSession(f.teacher.auth, { courseId: f.course.id, date: today, periodId: null, timetableSlotId: null });
    const outsider = await createStudent(f.school.id, null, { withLogin: false });

    await expect(recordAttendance(f.teacher.auth, session.id, { markAllPresent: true, submit: true, records: [{ studentId: outsider.student.id, status: "ABSENT" }] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await prisma.attendanceRecord.count({ where: { sessionId: session.id } })).toBe(0);

    const submitted = await recordAttendance(f.teacher.auth, session.id, { markAllPresent: true, submit: true, records: [{ studentId: s0.id, status: "ABSENT", note: "sick" }, { studentId: s1.id, status: "LATE", minutesLate: 10 }] });
    expect(submitted.status).toBe("SUBMITTED");
    expect(submitted.submittedAt).toBeInstanceOf(Date);
    expect(submitted.recordedById).toBe(f.teacher.teacher.id);
    const status = (rows: { studentId: string; status: string }[]) => Object.fromEntries(rows.map((r) => [r.studentId, r.status]));
    expect(status(submitted.records)).toEqual({ [s0.id]: "ABSENT", [s1.id]: "LATE", [s2.id]: "PRESENT" });
    expect(submitted.records.find((r) => r.studentId === s1.id)?.minutesLate).toBe(10);
    expect(submitted.records.find((r) => r.studentId === s0.id)?.note).toBe("sick");
    expect(submitted.records.every((r) => r.date.getTime() === today.getTime())).toBe(true);

    const corrected = await recordAttendance(f.teacher.auth, session.id, { markAllPresent: true, submit: true, records: [{ studentId: s0.id, status: "EXCUSED" }] });
    expect(status(corrected.records)).toEqual({ [s0.id]: "EXCUSED", [s1.id]: "PRESENT", [s2.id]: "PRESENT" });
    expect(await prisma.attendanceRecord.count({ where: { sessionId: session.id } })).toBe(3);

    // Without markAllPresent only listed students are touched; without submit the session stays OPEN.
    const partial = await recordAttendance(f.teacher.auth, session.id, { markAllPresent: false, submit: false, records: [{ studentId: s2.id, status: "LATE" }] });
    expect(partial.status).toBe("OPEN");
    expect(status(partial.records)).toEqual({ [s0.id]: "EXCUSED", [s1.id]: "PRESENT", [s2.id]: "LATE" });
    expect(await prisma.auditLog.count({ where: { action: "attendance.record", entityId: session.id } })).toBe(3);
  });

  it("students, parents and teachers of other courses cannot record attendance", async () => {
    const f = await createSchoolFixture();
    const { session } = await openSession(f.teacher.auth, { courseId: f.course.id, date: today, periodId: null, timetableSlotId: null });
    const input = { markAllPresent: true, submit: true, records: [] };
    await expect(openSession(f.students[0].auth!, { courseId: f.course.id, date: today, periodId: null, timetableSlotId: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(openSession(f.guardian.auth, { courseId: f.course.id, date: today, periodId: null, timetableSlotId: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(recordAttendance(f.students[0].auth!, session.id, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(recordAttendance(f.guardian.auth, session.id, input)).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(openSession(f.teacher2.auth, { courseId: f.course.id, date: today, periodId: null, timetableSlotId: null })).rejects.toMatchObject({ code: "FORBIDDEN", message: /do not teach/ });
    await expect(recordAttendance(f.teacher2.auth, session.id, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.attendanceRecord.count()).toBe(0);

    // Administrators may record for any course; a teacher who is not the recorder cannot overwrite a submitted session.
    const byAdmin = await recordAttendance(f.admin, session.id, input);
    expect(byAdmin.status).toBe("SUBMITTED");
    expect(byAdmin.records).toHaveLength(3);
    await prisma.attendanceSession.update({ where: { id: session.id }, data: { recordedById: null } });
    await expect(recordAttendance(f.teacher.auth, session.id, input)).rejects.toMatchObject({ code: "FORBIDDEN", message: /already submitted/ });
  });
});

describe("attendance statistics", () => {
  async function threeDaysOfAbsences(f: Awaited<ReturnType<typeof createSchoolFixture>>) {
    const s0 = f.students[0].student.id;
    for (const n of [2, 1, 0]) {
      const { session } = await openSession(f.teacher.auth, { courseId: f.course.id, date: daysAgo(n), periodId: null, timetableSlotId: null });
      await recordAttendance(f.teacher.auth, session.id, { markAllPresent: true, submit: true, records: [{ studentId: s0, status: "ABSENT" }] });
    }
    // An unsubmitted (draft) session must not count.
    const { session } = await openSession(f.teacher.auth, { courseId: f.course.id, date: daysAgo(3), periodId: null, timetableSlotId: null });
    await recordAttendance(f.teacher.auth, session.id, { markAllPresent: true, submit: false, records: [{ studentId: s0, status: "ABSENT" }] });
  }

  it("studentAttendanceSummary computes rates and flags students at the threshold", async () => {
    const f = await createSchoolFixture();
    await threeDaysOfAbsences(f);
    const [s0, s1] = f.students.map((s) => s.student.id);

    const flagged = await studentAttendanceSummary(f.teacher.auth, s0);
    expect(flagged).toMatchObject({ studentId: s0, stats: { total: 3, absent: 3, present: 0, attendanceRate: 0, absenceRate: 100 }, recentAbsences: 3, threshold: 3, flagged: true });
    expect(flagged.records).toHaveLength(3);
    expect(flagged.records[0].session.course.subject.name).toBe("Mathematics");

    const fine = await studentAttendanceSummary(f.admin, s1);
    expect(fine).toMatchObject({ stats: { total: 3, present: 3, attendanceRate: 100, absenceRate: 0 }, recentAbsences: 0, flagged: false });

    // Students see their own, parents their children, nobody else.
    expect((await studentAttendanceSummary(f.students[0].auth!, s0)).flagged).toBe(true);
    expect((await studentAttendanceSummary(f.guardian.auth, s0)).recentAbsences).toBe(3);
    await expect(studentAttendanceSummary(f.students[0].auth!, s1)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(studentAttendanceSummary(f.guardian.auth, s1)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(studentAttendanceSummary(f.teacher2.auth, s0)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const range = await studentAttendanceSummary(f.admin, s0, { from: daysAgo(1) });
    expect(range.stats.total).toBe(2);
  });

  it("classAttendanceSummary aggregates per student and overall", async () => {
    const f = await createSchoolFixture();
    await threeDaysOfAbsences(f);
    const summary = await classAttendanceSummary(f.teacher.auth, f.cls.id);
    expect(summary).toMatchObject({ classId: f.cls.id, className: "10A", threshold: 3, windowDays: 30, overall: { total: 9, absent: 3, present: 6, attendanceRate: 66.7, absenceRate: 33.3 } });
    expect(summary.rows).toHaveLength(3);
    const row0 = summary.rows.find((r) => r.student.id === f.students[0].student.id)!;
    expect(row0).toMatchObject({ recentAbsences: 3, flagged: true, stats: { absent: 3 } });
    expect(summary.rows.filter((r) => r.flagged)).toHaveLength(1);

    await expect(classAttendanceSummary(f.teacher2.auth, f.cls.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(classAttendanceSummary(f.students[0].auth!, f.cls.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await classAttendanceSummary(f.admin, f.cls.id)).overall.total).toBe(9);
  });

  it("repeatedAbsenceStudents lists students at or above the threshold in the window", async () => {
    const f = await createSchoolFixture();
    expect(await repeatedAbsenceStudents(f.school.id)).toEqual([]);
    await threeDaysOfAbsences(f);
    const rows = await repeatedAbsenceStudents(f.school.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ absences: 3, student: { id: f.students[0].student.id, class: { name: "10A" } } });

    // Raising the threshold clears the list.
    await prisma.school.update({ where: { id: f.school.id }, data: { settings: { absenceThreshold: 4 } } });
    expect(await repeatedAbsenceStudents(f.school.id)).toEqual([]);
  });

  it("pendingAttendanceForTeacher shrinks after submission and follows substitutions", async () => {
    const f = await createSchoolFixture();
    const todaysSlot = f.slots.find((s) => s.dayOfWeek === dayOfWeek(today))!;
    expect((await pendingAttendanceForTeacher(f.teacher.teacher.id)).map((s) => s.id)).toEqual([todaysSlot.id]);
    expect(await pendingAttendanceForTeacher(f.teacher2.teacher.id)).toEqual([]);

    const { session } = await openSession(f.teacher.auth, { courseId: f.course.id, date: today, periodId: null, timetableSlotId: null });
    expect(session.timetableSlotId).toBe(todaysSlot.id);
    // Still pending while the session is only open.
    expect(await pendingAttendanceForTeacher(f.teacher.teacher.id)).toHaveLength(1);
    await recordAttendance(f.teacher.auth, session.id, { markAllPresent: true, submit: true, records: [] });
    expect(await pendingAttendanceForTeacher(f.teacher.teacher.id)).toEqual([]);

    // Tomorrow's lesson is pending again; when it is covered by teacher2 it moves to their list.
    const tomorrow = new Date(today.getTime() + 86_400_000);
    const tomorrowSlot = f.slots.find((s) => s.dayOfWeek === dayOfWeek(tomorrow))!;
    expect((await pendingAttendanceForTeacher(f.teacher.teacher.id, tomorrow)).map((s) => s.id)).toEqual([tomorrowSlot.id]);
    await prisma.substitution.create({ data: { schoolId: f.school.id, timetableSlotId: tomorrowSlot.id, date: tomorrow, absentTeacherId: f.teacher.teacher.id, substituteTeacherId: f.teacher2.teacher.id, status: "ASSIGNED" } });
    expect(await pendingAttendanceForTeacher(f.teacher.teacher.id, tomorrow)).toEqual([]);
    expect((await pendingAttendanceForTeacher(f.teacher2.teacher.id, tomorrow)).map((s) => s.id)).toEqual([tomorrowSlot.id]);
  });
});
