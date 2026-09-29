import { describe, expect, it } from "vitest";
import { api, asUser, createOtherSchool, createSchoolFixture, createUser, prisma, signIn } from "../helpers";
import { getTeacher, listTeachers, updateTeacher } from "@/modules/teachers/service";
import { getStudent, listStudents, updateStudent } from "@/modules/students/service";
import { assignStudentsToClass, createCourse, getClass, getCourse, listClasses, updateClass, updateCourse } from "@/modules/classes/service";
import { createSlot, deleteSlot, updateSlot, weeklySchedule } from "@/modules/timetable/service";
import { getSession, recordAttendance } from "@/modules/attendance/service";
import { GET as getStudentRoute } from "@/app/api/students/[id]/route";
import { GET as listTeachersRoute } from "@/app/api/teachers/route";
import { toDateOnly } from "@/lib/utils/dates";

/** Two schools plus a course, slot and attendance session inside school B. */
async function twoSchools() {
  const a = await createSchoolFixture();
  const b = await createOtherSchool();
  const subjectB = await prisma.subject.create({ data: { schoolId: b.school.id, name: "Art", code: "ART" } });
  const periodB = await prisma.period.findFirstOrThrow({ where: { schoolId: b.school.id } });
  const courseB = await prisma.course.create({ data: { schoolId: b.school.id, academicYearId: b.year.id, classId: b.cls.id, subjectId: subjectB.id, teacherId: b.teacher.teacher.id } });
  const slotB = await prisma.timetableSlot.create({ data: { schoolId: b.school.id, courseId: courseB.id, teacherId: b.teacher.teacher.id, classId: b.cls.id, periodId: periodB.id, dayOfWeek: 1 } });
  const sessionB = await prisma.attendanceSession.create({ data: { schoolId: b.school.id, courseId: courseB.id, date: toDateOnly(new Date()), periodId: periodB.id, timetableSlotId: slotB.id } });
  return { a, b, subjectB, periodB, courseB, slotB, sessionB };
}

describe("tenant isolation", () => {
  it("school A's admin cannot read or update school B's teacher, student, class or course", async () => {
    const { a, b, courseB } = await twoSchools();
    const forbidden = { code: "FORBIDDEN", status: 403 };
    await expect(getTeacher(a.admin, b.teacher.teacher.id)).rejects.toMatchObject(forbidden);
    await expect(updateTeacher(a.admin, b.teacher.teacher.id, { bio: "hijacked" })).rejects.toMatchObject(forbidden);
    await expect(getStudent(a.admin, b.student.student.id)).rejects.toMatchObject(forbidden);
    await expect(updateStudent(a.admin, b.student.student.id, { firstName: "Hijacked" })).rejects.toMatchObject(forbidden);
    await expect(getClass(a.admin, b.cls.id)).rejects.toMatchObject(forbidden);
    await expect(updateClass(a.admin, b.cls.id, { name: "Hijacked" })).rejects.toMatchObject(forbidden);
    await expect(getCourse(a.admin, courseB.id)).rejects.toMatchObject(forbidden);
    await expect(updateCourse(a.admin, courseB.id, { name: "Hijacked" })).rejects.toMatchObject(forbidden);
    await expect(getCourse(a.teacher.auth, courseB.id)).rejects.toMatchObject(forbidden);

    expect((await prisma.teacher.findUniqueOrThrow({ where: { id: b.teacher.teacher.id } })).bio).toBeNull();
    expect((await prisma.student.findUniqueOrThrow({ where: { id: b.student.student.id } })).firstName).toBe("Student");
    expect((await prisma.schoolClass.findUniqueOrThrow({ where: { id: b.cls.id } })).name).toBe("9Z");
    expect(await prisma.auditLog.count({ where: { schoolId: b.school.id, userId: a.admin.id } })).toBe(0);
  });

  it("school A's admin cannot touch school B's timetable slots or attendance sessions", async () => {
    const { a, b, courseB, slotB, sessionB } = await twoSchools();
    await expect(updateSlot(a.admin, slotB.id, { dayOfWeek: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteSlot(a.admin, slotB.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createSlot(a.admin, { courseId: courseB.id, dayOfWeek: 3, periodId: a.periods[0].id, roomId: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.timetableSlot.count({ where: { schoolId: b.school.id } })).toBe(1);
    expect((await prisma.timetableSlot.findUniqueOrThrow({ where: { id: slotB.id } })).dayOfWeek).toBe(1);

    await expect(getSession(a.admin, sessionB.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(recordAttendance(a.admin, sessionB.id, { markAllPresent: true, submit: true, records: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.attendanceRecord.count({ where: { sessionId: sessionB.id } })).toBe(0);
    expect((await prisma.attendanceSession.findUniqueOrThrow({ where: { id: sessionB.id } })).status).toBe("OPEN");

    // Schedules never leak across schools either.
    expect((await weeklySchedule(a.admin, {})).every((s) => s.schoolId === a.school.id)).toBe(true);
    await expect(weeklySchedule(b.admin, { teacherId: a.teacher.teacher.id })).resolves.toEqual([]);
  });

  it("list endpoints for school A never include school B rows and reject an explicit foreign schoolId", async () => {
    const { a, b } = await twoSchools();
    const page = { page: 1, pageSize: 100 };
    const teachers = await listTeachers(a.admin, page);
    expect(teachers.total).toBe(2);
    expect(teachers.items.every((t) => t.schoolId === a.school.id)).toBe(true);
    expect(teachers.items.map((t) => t.id)).not.toContain(b.teacher.teacher.id);

    const students = await listStudents(a.admin, page);
    expect(students.total).toBe(3);
    expect(students.items.map((s) => s.id)).not.toContain(b.student.student.id);

    const classes = await listClasses(a.admin, page);
    expect(classes.total).toBe(1);
    expect(classes.items.map((c) => c.id)).toEqual([a.cls.id]);

    await expect(listTeachers(a.admin, { ...page, schoolId: b.school.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listStudents(a.admin, { ...page, schoolId: b.school.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listClasses(a.admin, { ...page, schoolId: b.school.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // listTeachersSchema has no schoolId field, so the route strips the foreign schoolId and still
    // only returns the caller's own school (no leak either way).
    const viaRoute = await api(listTeachersRoute, { cookie: await signIn(a.adminUser.email), query: { schoolId: b.school.id } });
    expect(viaRoute.status).toBe(200);
    const routeItems = (viaRoute.data as { items: { id: string; schoolId: string }[] }).items;
    expect(routeItems).toHaveLength(2);
    expect(routeItems.every((t) => t.schoolId === a.school.id)).toBe(true);
    expect(routeItems.map((t) => t.id)).not.toContain(b.teacher.teacher.id);
  });

  it("cross-school references are rejected as validation errors", async () => {
    const { a, b, subjectB } = await twoSchools();
    await expect(createCourse(a.admin, { classId: a.cls.id, subjectId: subjectB.id, teacherId: a.teacher2.teacher.id, name: null })).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 422 });
    await expect(createCourse(a.admin, { classId: a.cls.id, subjectId: a.otherSubject.id, teacherId: b.teacher.teacher.id, name: null })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(assignStudentsToClass(a.admin, a.cls.id, [b.student.student.id])).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(assignStudentsToClass(a.admin, a.cls.id, [a.students[0].student.id, b.student.student.id])).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect((await prisma.student.findUniqueOrThrow({ where: { id: b.student.student.id } })).classId).toBe(b.cls.id);
    expect(await prisma.course.count({ where: { schoolId: a.school.id } })).toBe(1);
  });

  it("GET /api/students/[id] for school B's student as school A's admin returns 403", async () => {
    const { a, b } = await twoSchools();
    const cookie = await signIn(a.adminUser.email);
    const foreign = await api(getStudentRoute, { cookie, params: { id: b.student.student.id } });
    expect(foreign.status).toBe(403);
    expect(foreign.error?.code).toBe("FORBIDDEN");
    const own = await api(getStudentRoute, { cookie, params: { id: a.students[0].student.id } });
    expect(own.status).toBe(200);
    expect(own.data).toMatchObject({ id: a.students[0].student.id, schoolId: a.school.id });
    const asB = await api(getStudentRoute, { cookie: await signIn(b.teacher.user.email), params: { id: a.students[0].student.id } });
    expect(asB.status).toBe(403);
  });

  it("SUPER_ADMIN can list either school with an explicit schoolId but must name one", async () => {
    const { a, b } = await twoSchools();
    const superAdmin = await asUser((await createUser("SUPER_ADMIN", null)).id);
    const page = { page: 1, pageSize: 100 };
    expect((await listTeachers(superAdmin, { ...page, schoolId: a.school.id })).items.map((t) => t.id).sort()).toEqual([a.teacher.teacher.id, a.teacher2.teacher.id].sort());
    expect((await listTeachers(superAdmin, { ...page, schoolId: b.school.id })).items.map((t) => t.id)).toEqual([b.teacher.teacher.id]);
    expect((await listStudents(superAdmin, { ...page, schoolId: b.school.id })).items.map((s) => s.id)).toEqual([b.student.student.id]);
    expect((await listClasses(superAdmin, { ...page, schoolId: b.school.id })).items.map((c) => c.id)).toEqual([b.cls.id]);
    await expect(listTeachers(superAdmin, page)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await getStudent(superAdmin, b.student.student.id)).id).toBe(b.student.student.id);
    expect((await getTeacher(superAdmin, a.teacher.teacher.id)).id).toBe(a.teacher.teacher.id);
  });
});
