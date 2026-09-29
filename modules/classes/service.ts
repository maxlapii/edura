import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, isAdmin, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { paged, paginate, type Pagination } from "@/lib/validation";
import type { CreateClassInput, CreateCourseInput, UpdateClassInput, UpdateCourseInput } from "./schema";

const teacherUser = { include: { user: { select: { id: true, name: true, email: true } } } } as const;

export const courseInclude = {
  subject: { select: { id: true, name: true, code: true } },
  class: { select: { id: true, name: true, gradeLevel: true, academicYearId: true } },
  teacher: teacherUser,
} satisfies Prisma.CourseInclude;

// ───────────────────────── Classes ─────────────────────────

export async function listClasses(user: AuthUser, query: Pagination & { q?: string; academicYearId?: string; gradeLevel?: number; schoolId?: string }) {
  assertPermission(user, "classes:read");
  const schoolId = resolveSchoolId(user, query.schoolId);
  const where: Prisma.SchoolClassWhereInput = {
    schoolId,
    academicYearId: query.academicYearId,
    gradeLevel: query.gradeLevel,
    ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.schoolClass.findMany({
      where,
      orderBy: [{ gradeLevel: "asc" }, { name: "asc" }],
      include: { homeroomTeacher: teacherUser, room: { select: { id: true, name: true } }, academicYear: { select: { id: true, name: true } }, _count: { select: { students: true, courses: true } } },
      ...paginate(query),
    }),
    prisma.schoolClass.count({ where }),
  ]);
  return paged(items, total, query);
}

export async function getClass(user: AuthUser, id: string) {
  assertPermission(user, "classes:read");
  const cls = await prisma.schoolClass.findUnique({
    where: { id },
    include: {
      homeroomTeacher: teacherUser,
      room: true,
      academicYear: true,
      students: { where: { status: "ACTIVE" }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] },
      courses: { include: courseInclude, orderBy: { subject: { name: "asc" } } },
    },
  });
  if (!cls) throw AppError.notFound("Class");
  assertSchoolAccess(user, cls.schoolId);
  return cls;
}

async function validateClassRefs(schoolId: string, input: { homeroomTeacherId?: string | null; roomId?: string | null; academicYearId?: string }) {
  if (input.academicYearId) {
    const y = await prisma.academicYear.findUnique({ where: { id: input.academicYearId } });
    if (!y || y.schoolId !== schoolId) throw AppError.validation("Academic year must belong to the same school");
  }
  if (input.homeroomTeacherId) {
    const t = await prisma.teacher.findUnique({ where: { id: input.homeroomTeacherId } });
    if (!t || t.schoolId !== schoolId) throw AppError.validation("Homeroom teacher must belong to the same school");
  }
  if (input.roomId) {
    const r = await prisma.room.findUnique({ where: { id: input.roomId } });
    if (!r || r.schoolId !== schoolId) throw AppError.validation("Room must belong to the same school");
  }
}

export async function createClass(user: AuthUser, input: CreateClassInput) {
  assertPermission(user, "classes:manage");
  const schoolId = resolveSchoolId(user, input.schoolId);
  await validateClassRefs(schoolId, input);
  const cls = await prisma.schoolClass.create({
    data: {
      schoolId,
      academicYearId: input.academicYearId,
      name: input.name,
      gradeLevel: input.gradeLevel ?? null,
      homeroomTeacherId: input.homeroomTeacherId ?? null,
      roomId: input.roomId ?? null,
      capacity: input.capacity ?? null,
    },
  });
  await audit({ user, schoolId, action: "class.create", entityType: "SchoolClass", entityId: cls.id, after: cls });
  return cls;
}

export async function updateClass(user: AuthUser, id: string, input: UpdateClassInput) {
  assertPermission(user, "classes:manage");
  const before = await prisma.schoolClass.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Class");
  assertSchoolAccess(user, before.schoolId);
  await validateClassRefs(before.schoolId, input);
  const cls = await prisma.schoolClass.update({ where: { id }, data: input });
  await audit({ user, schoolId: before.schoolId, action: "class.update", entityType: "SchoolClass", entityId: id, before, after: cls });
  return cls;
}

export async function deleteClass(user: AuthUser, id: string) {
  assertPermission(user, "classes:manage");
  const before = await prisma.schoolClass.findUnique({ where: { id }, include: { _count: { select: { students: true } } } });
  if (!before) throw AppError.notFound("Class");
  assertSchoolAccess(user, before.schoolId);
  if (before._count.students > 0) throw AppError.conflict("Class still has students. Move them first.");
  await prisma.schoolClass.delete({ where: { id } });
  await audit({ user, schoolId: before.schoolId, action: "class.delete", entityType: "SchoolClass", entityId: id, before });
}

export async function assignStudentsToClass(user: AuthUser, classId: string, studentIds: string[]) {
  assertPermission(user, "classes:manage");
  const cls = await prisma.schoolClass.findUnique({ where: { id: classId }, include: { _count: { select: { students: true } } } });
  if (!cls) throw AppError.notFound("Class");
  assertSchoolAccess(user, cls.schoolId);
  const students = await prisma.student.findMany({ where: { id: { in: studentIds } } });
  if (students.length !== studentIds.length || students.some((s) => s.schoolId !== cls.schoolId)) {
    throw AppError.validation("All students must exist and belong to the same school");
  }
  const newcomers = students.filter((s) => s.classId !== classId).length;
  if (cls.capacity && cls._count.students + newcomers > cls.capacity) {
    throw AppError.conflict(`Class capacity (${cls.capacity}) would be exceeded`);
  }
  await prisma.student.updateMany({ where: { id: { in: studentIds } }, data: { classId } });
  await audit({ user, schoolId: cls.schoolId, action: "class.assign_students", entityType: "SchoolClass", entityId: classId, metadata: { studentIds } });
  return { assigned: studentIds.length };
}

// ───────────────────────── Courses ─────────────────────────

export async function listCourses(user: AuthUser, filter: { classId?: string; teacherId?: string; subjectId?: string; academicYearId?: string; schoolId?: string } = {}) {
  assertPermission(user, "classes:read");
  const schoolId = resolveSchoolId(user, filter.schoolId);
  return prisma.course.findMany({
    where: { schoolId, classId: filter.classId, teacherId: filter.teacherId, subjectId: filter.subjectId, academicYearId: filter.academicYearId },
    include: { ...courseInclude, _count: { select: { timetableSlots: true, assignments: true } } },
    orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }],
  });
}

export async function getCourse(user: AuthUser, id: string) {
  const course = await prisma.course.findUnique({ where: { id }, include: { ...courseInclude, timetableSlots: { include: { period: true, room: true } } } });
  if (!course) throw AppError.notFound("Course");
  assertSchoolAccess(user, course.schoolId);
  await assertCourseAccess(user, course);
  return course;
}

/**
 * Object-level rule: teachers may only access courses they teach (or homeroom / department when head);
 * students only courses of their class; parents only courses of their children's classes.
 */
export async function assertCourseAccess(user: AuthUser, course: { id: string; teacherId: string; classId: string; schoolId: string; subjectId?: string }) {
  assertSchoolAccess(user, course.schoolId);
  if (isAdmin(user)) return;
  if (user.role === "DEPARTMENT_HEAD" && user.departmentId) {
    const subject = await prisma.subject.findUnique({ where: { id: course.subjectId ?? "" }, select: { departmentId: true } });
    if (subject?.departmentId === user.departmentId) return;
  }
  if (user.teacherId) {
    if (course.teacherId === user.teacherId) return;
    const cls = await prisma.schoolClass.findUnique({ where: { id: course.classId }, select: { homeroomTeacherId: true } });
    if (cls?.homeroomTeacherId === user.teacherId) return;
    const sub = await prisma.substitution.findFirst({ where: { substituteTeacherId: user.teacherId, timetableSlot: { courseId: course.id }, status: "ASSIGNED" } });
    if (sub) return;
    throw AppError.forbidden("You do not teach this course");
  }
  if (user.studentId) {
    const s = await prisma.student.findUnique({ where: { id: user.studentId }, select: { classId: true } });
    if (s?.classId === course.classId) return;
    throw AppError.forbidden("This course is not part of your class");
  }
  if (user.guardianId) {
    const link = await prisma.studentGuardian.findFirst({ where: { guardianId: user.guardianId, student: { classId: course.classId } } });
    if (link) return;
    throw AppError.forbidden("This course is not linked to your children");
  }
  if (user.role === "STAFF") return; // read-only listing for staff
  throw AppError.forbidden();
}

export async function createCourse(user: AuthUser, input: CreateCourseInput) {
  assertPermission(user, "classes:manage");
  const [cls, subject, teacher] = await Promise.all([
    prisma.schoolClass.findUnique({ where: { id: input.classId } }),
    prisma.subject.findUnique({ where: { id: input.subjectId } }),
    prisma.teacher.findUnique({ where: { id: input.teacherId } }),
  ]);
  if (!cls) throw AppError.notFound("Class");
  assertSchoolAccess(user, cls.schoolId);
  if (!subject || subject.schoolId !== cls.schoolId) throw AppError.validation("Subject must belong to the same school");
  if (!teacher || teacher.schoolId !== cls.schoolId) throw AppError.validation("Teacher must belong to the same school");
  if (teacher.status === "INACTIVE" || teacher.status === "SUSPENDED") throw AppError.validation("Teacher is not active");
  const course = await prisma.course.create({
    data: { schoolId: cls.schoolId, academicYearId: cls.academicYearId, classId: cls.id, subjectId: subject.id, teacherId: teacher.id, name: input.name ?? null },
    include: courseInclude,
  });
  await audit({ user, schoolId: cls.schoolId, action: "course.create", entityType: "Course", entityId: course.id, after: course });
  return course;
}

export async function updateCourse(user: AuthUser, id: string, input: UpdateCourseInput) {
  assertPermission(user, "classes:manage");
  const before = await prisma.course.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Course");
  assertSchoolAccess(user, before.schoolId);
  if (input.teacherId && input.teacherId !== before.teacherId) {
    const teacher = await prisma.teacher.findUnique({ where: { id: input.teacherId } });
    if (!teacher || teacher.schoolId !== before.schoolId) throw AppError.validation("Teacher must belong to the same school");
    // Changing the teacher must not create timetable conflicts for the new teacher.
    const slots = await prisma.timetableSlot.findMany({ where: { courseId: id } });
    for (const slot of slots) {
      const clash = await prisma.timetableSlot.findFirst({ where: { schoolId: before.schoolId, teacherId: input.teacherId, dayOfWeek: slot.dayOfWeek, periodId: slot.periodId, NOT: { id: slot.id } } });
      if (clash) throw AppError.conflict("New teacher already has a lesson in one of this course's timetable slots");
    }
  }
  const course = await prisma.$transaction(async (tx) => {
    const c = await tx.course.update({ where: { id }, data: input, include: courseInclude });
    if (input.teacherId && input.teacherId !== before.teacherId) {
      await tx.timetableSlot.updateMany({ where: { courseId: id }, data: { teacherId: input.teacherId } });
    }
    return c;
  });
  await audit({ user, schoolId: before.schoolId, action: "course.update", entityType: "Course", entityId: id, before, after: course });
  return course;
}

export async function deleteCourse(user: AuthUser, id: string) {
  assertPermission(user, "classes:manage");
  const before = await prisma.course.findUnique({ where: { id }, include: { _count: { select: { grades: true, attendanceSessions: true } } } });
  if (!before) throw AppError.notFound("Course");
  assertSchoolAccess(user, before.schoolId);
  if (before._count.grades > 0 || before._count.attendanceSessions > 0) throw AppError.conflict("Course has grades or attendance records");
  await prisma.course.delete({ where: { id } });
  await audit({ user, schoolId: before.schoolId, action: "course.delete", entityType: "Course", entityId: id, before });
}

/** Courses visible to the caller: own courses for teachers; class courses for students/parents; all for admins. */
export async function listMyCourses(user: AuthUser) {
  const schoolId = resolveSchoolId(user);
  const where: Prisma.CourseWhereInput = { schoolId };
  if (isAdmin(user) || user.role === "STAFF") {
    // all
  } else if (user.teacherId) {
    where.OR = [{ teacherId: user.teacherId }, { class: { homeroomTeacherId: user.teacherId } }];
    if (user.role === "DEPARTMENT_HEAD" && user.departmentId) where.OR.push({ subject: { departmentId: user.departmentId } });
  } else if (user.studentId) {
    where.class = { students: { some: { id: user.studentId } } };
  } else if (user.guardianId) {
    where.class = { students: { some: { guardians: { some: { guardianId: user.guardianId } } } } };
  } else {
    return [];
  }
  return prisma.course.findMany({
    where,
    include: { ...courseInclude, class: { select: { id: true, name: true, gradeLevel: true, academicYearId: true, _count: { select: { students: true } } } } },
    orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }],
  });
}
