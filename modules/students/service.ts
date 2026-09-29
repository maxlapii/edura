import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, hasPermission, isAdmin, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { paged, paginate, type Pagination } from "@/lib/validation";
import { createUserWithPassword, generateTemporaryPassword } from "@/modules/users/service";
import type { CreateStudentInput, UpdateStudentInput } from "./schema";

const listInclude = {
  class: { select: { id: true, name: true, gradeLevel: true } },
  user: { select: { id: true, email: true, isActive: true } },
} satisfies Prisma.StudentInclude;

/**
 * Object-level access:
 *  - admins/staff: any student in the school
 *  - teachers: students in classes they teach or homeroom (department heads: their department's courses too)
 *  - students: only themselves
 *  - parents: only linked children
 */
export async function canAccessStudent(user: AuthUser, student: { id: string; schoolId: string; classId: string | null }): Promise<boolean> {
  if (user.role !== "SUPER_ADMIN" && user.schoolId !== student.schoolId) return false;
  if (isAdmin(user) || user.role === "STAFF") return true;
  if (user.studentId) return user.studentId === student.id;
  if (user.guardianId) {
    const link = await prisma.studentGuardian.findFirst({ where: { guardianId: user.guardianId, studentId: student.id } });
    return !!link;
  }
  if (user.teacherId) {
    if (!student.classId) return false;
    const course = await prisma.course.findFirst({
      where: {
        classId: student.classId,
        OR: [
          { teacherId: user.teacherId },
          { class: { homeroomTeacherId: user.teacherId } },
          ...(user.role === "DEPARTMENT_HEAD" && user.departmentId ? [{ subject: { departmentId: user.departmentId } }] : []),
          { timetableSlots: { some: { substitutions: { some: { substituteTeacherId: user.teacherId, status: "ASSIGNED" } } } } },
        ],
      },
      select: { id: true },
    });
    if (course) return true;
    const homeroom = await prisma.schoolClass.findFirst({ where: { id: student.classId, homeroomTeacherId: user.teacherId }, select: { id: true } });
    return !!homeroom;
  }
  return false;
}

export async function assertStudentAccess(user: AuthUser, studentId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, schoolId: true, classId: true } });
  if (!student) throw AppError.notFound("Student");
  if (!(await canAccessStudent(user, student))) throw AppError.forbidden("You do not have access to this student");
  return student;
}

/** Student ids the caller may see (used to scope list queries for teachers/parents/students). */
export async function accessibleStudentWhere(user: AuthUser, schoolId: string): Promise<Prisma.StudentWhereInput> {
  if (isAdmin(user) || user.role === "STAFF") return { schoolId };
  if (user.studentId) return { schoolId, id: user.studentId };
  if (user.guardianId) return { schoolId, guardians: { some: { guardianId: user.guardianId } } };
  if (user.teacherId) {
    return {
      schoolId,
      class: {
        OR: [
          { homeroomTeacherId: user.teacherId },
          { courses: { some: { teacherId: user.teacherId } } },
          ...(user.role === "DEPARTMENT_HEAD" && user.departmentId ? [{ courses: { some: { subject: { departmentId: user.departmentId } } } }] : []),
        ],
      },
    };
  }
  return { id: "__none__" };
}

export async function listStudents(user: AuthUser, query: Pagination & { q?: string; classId?: string; status?: string; schoolId?: string }) {
  assertPermission(user, "students:read");
  const schoolId = resolveSchoolId(user, query.schoolId);
  const scope = await accessibleStudentWhere(user, schoolId);
  const where: Prisma.StudentWhereInput = {
    AND: [
      scope,
      {
        classId: query.classId,
        status: (query.status as Prisma.StudentWhereInput["status"]) ?? undefined,
        ...(query.q
          ? { OR: [{ firstName: { contains: query.q, mode: "insensitive" } }, { lastName: { contains: query.q, mode: "insensitive" } }, { studentNumber: { contains: query.q, mode: "insensitive" } }] }
          : {}),
      },
    ],
  };
  const [items, total] = await Promise.all([
    prisma.student.findMany({ where, include: listInclude, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], ...paginate(query) }),
    prisma.student.count({ where }),
  ]);
  return paged(items, total, query);
}

/** Unified student profile. Sensitive fields are stripped without students:read_sensitive. */
export async function getStudent(user: AuthUser, id: string) {
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      ...listInclude,
      class: { include: { homeroomTeacher: { include: { user: { select: { id: true, name: true } } } }, academicYear: { select: { id: true, name: true } } } },
      guardians: { include: { guardian: { include: { user: { select: { id: true, name: true, email: true, phone: true } } } } } },
      supportCases: { orderBy: { createdAt: "desc" }, take: 10 },
      disciplineIncidents: { orderBy: { date: "desc" }, take: 10 },
    },
  });
  if (!student) throw AppError.notFound("Student");
  if (!(await canAccessStudent(user, student))) throw AppError.forbidden("You do not have access to this student");
  const sensitive = hasPermission(user, "students:read_sensitive") || user.studentId === id || (user.guardianId && student.guardians.some((g) => g.guardianId === user.guardianId));
  const supportVisible = hasPermission(user, "support_cases:read_sensitive");
  return {
    ...student,
    medicalNotes: sensitive ? student.medicalNotes : null,
    supportCases: student.supportCases.filter((c) => !c.isSensitive || supportVisible).map((c) => (supportVisible ? c : { ...c, description: null })),
    disciplineIncidents: hasPermission(user, "discipline:read") || user.guardianId || user.studentId ? student.disciplineIncidents : [],
  };
}

async function validateClass(schoolId: string, classId?: string | null) {
  if (!classId) return;
  const c = await prisma.schoolClass.findUnique({ where: { id: classId } });
  if (!c || c.schoolId !== schoolId) throw AppError.validation("Class must belong to the same school");
}

export async function createStudent(actor: AuthUser, input: CreateStudentInput) {
  assertPermission(actor, "students:manage");
  const schoolId = resolveSchoolId(actor, input.schoolId);
  await validateClass(schoolId, input.classId);
  if (input.email && (await prisma.user.findUnique({ where: { email: input.email } }))) throw AppError.conflict("A user with this email already exists");
  const password = input.password ?? generateTemporaryPassword();
  const student = await prisma.$transaction(async (tx) => {
    let userId: string | null = null;
    if (input.email) {
      const u = await createUserWithPassword({ name: `${input.firstName} ${input.lastName}`, email: input.email, password, role: "STUDENT", schoolId }, tx);
      userId = u.id;
    }
    return tx.student.create({
      data: {
        schoolId,
        userId,
        studentNumber: input.studentNumber,
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth ?? null,
        gender: input.gender ?? null,
        classId: input.classId ?? null,
        enrollmentDate: input.enrollmentDate ?? null,
        notes: input.notes ?? null,
        medicalNotes: input.medicalNotes ?? null,
      },
      include: listInclude,
    });
  });
  await audit({ user: actor, schoolId, action: "student.create", entityType: "Student", entityId: student.id, after: { ...student, medicalNotes: undefined } });
  return { student, temporaryPassword: input.email && !input.password ? password : undefined };
}

export async function updateStudent(actor: AuthUser, id: string, input: UpdateStudentInput) {
  assertPermission(actor, "students:manage");
  const before = await prisma.student.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Student");
  assertSchoolAccess(actor, before.schoolId);
  await validateClass(before.schoolId, input.classId);
  if (input.medicalNotes !== undefined) assertPermission(actor, "students:read_sensitive");
  const student = await prisma.$transaction(async (tx) => {
    const s = await tx.student.update({ where: { id }, data: input, include: listInclude });
    if (before.userId && (input.firstName || input.lastName)) {
      await tx.user.update({ where: { id: before.userId }, data: { name: `${s.firstName} ${s.lastName}` } });
    }
    if (before.userId && input.status && input.status !== "ACTIVE") {
      await tx.user.update({ where: { id: before.userId }, data: { isActive: false } });
    }
    return s;
  });
  await audit({ user: actor, schoolId: before.schoolId, action: "student.update", entityType: "Student", entityId: id, before: { ...before, medicalNotes: undefined }, after: { ...student, medicalNotes: undefined } });
  return student;
}

/** Students for a class roster (used by attendance, assignments). Verifies access through the class's courses. */
export async function classRoster(classId: string) {
  return prisma.student.findMany({ where: { classId, status: "ACTIVE" }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true, studentNumber: true, userId: true } });
}

/** Guardian user ids for a set of students (for notifications). */
export async function guardianUserIdsForStudent(studentId: string): Promise<string[]> {
  const links = await prisma.studentGuardian.findMany({ where: { studentId }, include: { guardian: { select: { userId: true } } } });
  return links.map((l) => l.guardian.userId);
}
