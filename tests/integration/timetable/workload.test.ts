import { describe, expect, it } from "vitest";
import { asUser, createSchoolFixture, prisma } from "../helpers";
import { schoolWorkload, teacherWorkload } from "@/modules/timetable/service";
import { createDepartment } from "@/modules/departments/service";
import { toDateOnly } from "@/lib/utils/dates";

describe("teacher workload", () => {
  it("aggregates teaching slots, duties, meetings, substitutions, homeroom and leave for the reference week", async () => {
    const f = await createSchoolFixture();
    const referenceDate = new Date("2026-10-07T12:00:00Z");
    const day = toDateOnly(referenceDate);

    await prisma.teacherDuty.create({ data: { schoolId: f.school.id, teacherId: f.teacher.teacher.id, name: "Yard duty", weeklyHours: 1.5 } });
    const meeting = await prisma.meeting.create({ data: { schoolId: f.school.id, title: "Staff meeting", organizerUserId: f.admin.id, startsAt: referenceDate, endsAt: new Date(referenceDate.getTime() + 3_600_000) } });
    await prisma.meetingParticipant.create({ data: { meetingId: meeting.id, userId: f.teacher.user.id } });
    const cancelled = await prisma.meeting.create({ data: { schoolId: f.school.id, title: "Cancelled", status: "CANCELLED", organizerUserId: f.admin.id, startsAt: referenceDate, endsAt: new Date(referenceDate.getTime() + 7_200_000) } });
    await prisma.meetingParticipant.create({ data: { meetingId: cancelled.id, userId: f.teacher.user.id } });

    // teacher covers one of teacher2's lessons this week
    const cls2 = await prisma.schoolClass.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, name: "10B" } });
    const course2 = await prisma.course.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, classId: cls2.id, subjectId: f.otherSubject.id, teacherId: f.teacher2.teacher.id } });
    const slot2 = await prisma.timetableSlot.create({ data: { schoolId: f.school.id, courseId: course2.id, teacherId: f.teacher2.teacher.id, classId: cls2.id, periodId: f.periods[1].id, dayOfWeek: 3 } });
    await prisma.substitution.create({ data: { schoolId: f.school.id, timetableSlotId: slot2.id, date: day, absentTeacherId: f.teacher2.teacher.id, substituteTeacherId: f.teacher.teacher.id, status: "ASSIGNED" } });
    // a substitution in a different week does not count
    await prisma.substitution.create({ data: { schoolId: f.school.id, timetableSlotId: slot2.id, date: new Date(day.getTime() + 21 * 86_400_000), absentTeacherId: f.teacher2.teacher.id, substituteTeacherId: f.teacher.teacher.id, status: "ASSIGNED" } });

    await prisma.leaveRequest.create({ data: { schoolId: f.school.id, requesterUserId: f.teacher.user.id, teacherId: f.teacher.teacher.id, status: "APPROVED", startDate: day, endDate: new Date(day.getTime() + 86_400_000) } });

    const w = await teacherWorkload(f.admin, f.teacher.teacher.id, referenceDate);
    expect(w).toMatchObject({
      teacherId: f.teacher.teacher.id,
      name: "Teacher One",
      departmentId: f.department.id,
      teachingPeriods: 7,
      classes: 1,
      subjects: 1,
      preparationPeriods: 1,
      substitutionPeriods: 1,
      meetingHours: 1,
      dutyHours: 1.5,
      homeroomClasses: 1,
      leaveDays: 2,
      maxWeeklyPeriods: 25,
      level: "UNDERUTILIZED",
    });
    // 7 teaching + 1 prep + 1 substitution + 1h meeting (1.33 periods) + 1.5h duty (2 periods) + 1 homeroom
    expect(w.totalPeriods).toBeCloseTo(13.3, 1);
    expect(w.utilization).toBeCloseTo(53.3, 1);

    // Teachers may view their own workload but not a colleague's.
    expect((await teacherWorkload(f.teacher.auth, f.teacher.teacher.id, referenceDate)).teachingPeriods).toBe(7);
    await expect(teacherWorkload(f.teacher2.auth, f.teacher.teacher.id, referenceDate)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(teacherWorkload(f.students[0].auth!, f.teacher.teacher.id, referenceDate)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const idle = await teacherWorkload(f.admin, f.teacher2.teacher.id, referenceDate);
    expect(idle).toMatchObject({ teachingPeriods: 1, substitutionPeriods: 0, totalPeriods: 1, level: "UNDERUTILIZED" });
  });

  it("classifies a heavily loaded teacher as OVERLOADED", async () => {
    const f = await createSchoolFixture();
    await prisma.teacher.update({ where: { id: f.teacher.teacher.id }, data: { maxWeeklyPeriods: 8 } });
    const w = await teacherWorkload(f.admin, f.teacher.teacher.id);
    // 7 teaching + 1 prep + 1 homeroom = 9 of 8
    expect(w).toMatchObject({ totalPeriods: 9, maxWeeklyPeriods: 8, utilization: 112.5, level: "OVERLOADED" });
  });
});

describe("school workload", () => {
  it("is forbidden for teachers, school-wide for admins and department-scoped for department heads", async () => {
    const f = await createSchoolFixture();
    await expect(schoolWorkload(f.teacher.auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(schoolWorkload(f.students[0].auth!)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const all = await schoolWorkload(f.admin);
    expect(all.map((r) => r.teacherId).sort()).toEqual([f.teacher.teacher.id, f.teacher2.teacher.id].sort());
    expect(all.find((r) => r.teacherId === f.teacher.teacher.id)?.teachingPeriods).toBe(7);

    // Inactive teachers are excluded.
    await prisma.teacher.update({ where: { id: f.teacher2.teacher.id }, data: { status: "INACTIVE" } });
    expect((await schoolWorkload(f.principal)).map((r) => r.teacherId)).toEqual([f.teacher.teacher.id]);
    await prisma.teacher.update({ where: { id: f.teacher2.teacher.id }, data: { status: "ACTIVE" } });

    // teacher2 becomes head of a new Science department; they only see their own department.
    await createDepartment(f.admin, { name: "Science", code: "SCI", headTeacherId: f.teacher2.teacher.id, description: null });
    const head = await asUser(f.teacher2.user.id);
    expect(head.role).toBe("DEPARTMENT_HEAD");
    const scoped = await schoolWorkload(head);
    expect(scoped.map((r) => r.teacherId)).toEqual([f.teacher2.teacher.id]);
  });
});
