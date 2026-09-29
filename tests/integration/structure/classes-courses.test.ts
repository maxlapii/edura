import { describe, expect, it } from "vitest";
import { asUser, createOtherSchool, createSchoolFixture, createStudent, createTeacher, prisma } from "../helpers";
import { assignStudentsToClass, createClass, createCourse, listMyCourses, updateCourse } from "@/modules/classes/service";
import { createDepartment } from "@/modules/departments/service";

describe("classes", () => {
  it("createClass validates that homeroom teacher, room and academic year belong to the school", async () => {
    const f = await createSchoolFixture();
    const other = await createOtherSchool();
    const foreignRoom = await prisma.room.create({ data: { schoolId: other.school.id, name: "B-1", code: "B1" } });
    const base = { academicYearId: f.year.id, name: "11B", gradeLevel: 11, capacity: null, roomId: null, homeroomTeacherId: null };

    await expect(createClass(f.admin, { ...base, homeroomTeacherId: other.teacher.teacher.id })).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 422 });
    await expect(createClass(f.admin, { ...base, roomId: foreignRoom.id })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(createClass(f.admin, { ...base, academicYearId: other.year.id })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(createClass(f.teacher.auth, base)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const cls = await createClass(f.admin, { ...base, homeroomTeacherId: f.teacher2.teacher.id, roomId: f.room.id, capacity: 30 });
    expect(cls).toMatchObject({ schoolId: f.school.id, name: "11B", homeroomTeacherId: f.teacher2.teacher.id, roomId: f.room.id, capacity: 30 });
  });

  it("assignStudentsToClass enforces capacity and same-school students", async () => {
    const f = await createSchoolFixture();
    const other = await createOtherSchool();
    const small = await prisma.schoolClass.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, name: "Small", capacity: 2 } });
    const ids = f.students.map((s) => s.student.id);

    await expect(assignStudentsToClass(f.admin, small.id, ids)).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    expect(await prisma.student.count({ where: { classId: small.id } })).toBe(0);

    expect(await assignStudentsToClass(f.admin, small.id, ids.slice(0, 2))).toEqual({ assigned: 2 });
    expect(await prisma.student.count({ where: { classId: small.id } })).toBe(2);
    // Re-assigning students already in the class does not count against capacity.
    expect(await assignStudentsToClass(f.admin, small.id, ids.slice(0, 2))).toEqual({ assigned: 2 });
    await expect(assignStudentsToClass(f.admin, small.id, [ids[2]])).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(assignStudentsToClass(f.admin, f.cls.id, [other.student.student.id])).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(assignStudentsToClass(f.admin, f.cls.id, ["missing-student"])).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect((await prisma.student.findUniqueOrThrow({ where: { id: other.student.student.id } })).classId).toBe(other.cls.id);
  });
});

describe("courses", () => {
  it("createCourse rejects inactive teachers and cross-school subjects/teachers", async () => {
    const f = await createSchoolFixture();
    const other = await createOtherSchool();
    const foreignSubject = await prisma.subject.create({ data: { schoolId: other.school.id, name: "Art", code: "ART" } });

    await expect(createCourse(f.admin, { classId: f.cls.id, subjectId: foreignSubject.id, teacherId: f.teacher2.teacher.id, name: null })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(createCourse(f.admin, { classId: f.cls.id, subjectId: f.otherSubject.id, teacherId: other.teacher.teacher.id, name: null })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(createCourse(f.admin, { classId: other.cls.id, subjectId: f.otherSubject.id, teacherId: f.teacher2.teacher.id, name: null })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await prisma.teacher.update({ where: { id: f.teacher2.teacher.id }, data: { status: "INACTIVE" } });
    await expect(createCourse(f.admin, { classId: f.cls.id, subjectId: f.otherSubject.id, teacherId: f.teacher2.teacher.id, name: null })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await prisma.teacher.update({ where: { id: f.teacher2.teacher.id }, data: { status: "SUSPENDED" } });
    await expect(createCourse(f.admin, { classId: f.cls.id, subjectId: f.otherSubject.id, teacherId: f.teacher2.teacher.id, name: null })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    await prisma.teacher.update({ where: { id: f.teacher2.teacher.id }, data: { status: "ON_LEAVE" } });
    const course = await createCourse(f.admin, { classId: f.cls.id, subjectId: f.otherSubject.id, teacherId: f.teacher2.teacher.id, name: "History 10A" });
    expect(course).toMatchObject({ schoolId: f.school.id, academicYearId: f.year.id, classId: f.cls.id, subjectId: f.otherSubject.id, teacherId: f.teacher2.teacher.id, name: "History 10A" });
  });

  it("updateCourse refuses a teacher change that clashes with the new teacher's timetable", async () => {
    const f = await createSchoolFixture();
    const cls2 = await prisma.schoolClass.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, name: "10B" } });
    const course2 = await prisma.course.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, classId: cls2.id, subjectId: f.otherSubject.id, teacherId: f.teacher2.teacher.id } });
    // teacher2 already teaches 10B on Monday period 1 – the same time as the fixture course.
    await prisma.timetableSlot.create({ data: { schoolId: f.school.id, courseId: course2.id, teacherId: f.teacher2.teacher.id, classId: cls2.id, periodId: f.periods[0].id, dayOfWeek: 1 } });

    await expect(updateCourse(f.admin, f.course.id, { teacherId: f.teacher2.teacher.id })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await prisma.course.findUniqueOrThrow({ where: { id: f.course.id } })).teacherId).toBe(f.teacher.teacher.id);
    expect(await prisma.timetableSlot.count({ where: { courseId: f.course.id, teacherId: f.teacher.teacher.id } })).toBe(7);
  });

  it("updateCourse re-points every timetable slot to the new teacher when there is no clash", async () => {
    const f = await createSchoolFixture();
    const other = await createOtherSchool();
    await expect(updateCourse(f.admin, f.course.id, { teacherId: other.teacher.teacher.id })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const updated = await updateCourse(f.admin, f.course.id, { teacherId: f.teacher2.teacher.id, name: "Maths 10A" });
    expect(updated).toMatchObject({ teacherId: f.teacher2.teacher.id, name: "Maths 10A" });
    const slots = await prisma.timetableSlot.findMany({ where: { courseId: f.course.id } });
    expect(slots).toHaveLength(7);
    expect(slots.every((s) => s.teacherId === f.teacher2.teacher.id)).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "course.update", entityId: f.course.id } })).toBe(1);
  });

  it("listMyCourses returns the right set for teacher, department head, student, parent, staff and admin", async () => {
    const f = await createSchoolFixture();
    const cls2 = await prisma.schoolClass.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, name: "10B" } });
    const historyCourse = await prisma.course.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, classId: cls2.id, subjectId: f.otherSubject.id, teacherId: f.teacher2.teacher.id } });
    const homeroomOnly = await createTeacher(f.school.id, { name: "Homeroom Only" });
    await prisma.schoolClass.update({ where: { id: cls2.id }, data: { homeroomTeacherId: homeroomOnly.teacher.id } });
    const lonely = await createStudent(f.school.id, null);
    const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

    expect(ids(await listMyCourses(f.teacher.auth))).toEqual([f.course.id]);
    expect(ids(await listMyCourses(f.teacher2.auth))).toEqual([historyCourse.id]);
    expect(ids(await listMyCourses(homeroomOnly.auth))).toEqual([historyCourse.id]);
    expect(ids(await listMyCourses(f.students[0].auth!))).toEqual([f.course.id]);
    expect(ids(await listMyCourses(f.guardian.auth))).toEqual([f.course.id]);
    expect(await listMyCourses(lonely.auth!)).toEqual([]);
    expect(ids(await listMyCourses(f.admin))).toEqual(ids([f.course, historyCourse]));
    expect(ids(await listMyCourses(f.principal))).toEqual(ids([f.course, historyCourse]));

    // A department head also sees the courses of their department's subjects.
    await prisma.subject.update({ where: { id: f.otherSubject.id }, data: { departmentId: f.department.id } });
    const science = await createDepartment(f.admin, { name: "Science", code: "SCI", headTeacherId: homeroomOnly.teacher.id, description: null });
    await prisma.subject.update({ where: { id: f.otherSubject.id }, data: { departmentId: science.id } });
    const head = await asUser(homeroomOnly.user.id);
    expect(head.role).toBe("DEPARTMENT_HEAD");
    expect(ids(await listMyCourses(head))).toEqual([historyCourse.id]);
    await prisma.subject.update({ where: { id: f.subject.id }, data: { departmentId: science.id } });
    expect(ids(await listMyCourses(head))).toEqual(ids([f.course, historyCourse]));
  });
});
