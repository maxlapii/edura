import { prisma } from "@/lib/db";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import type { CreateSubjectInput, UpdateSubjectInput } from "./schema";

export async function listSubjects(user: AuthUser, schoolId?: string, departmentId?: string) {
  assertPermission(user, "subjects:read");
  const sid = resolveSchoolId(user, schoolId);
  return prisma.subject.findMany({
    where: { schoolId: sid, departmentId },
    orderBy: { name: "asc" },
    include: { department: { select: { id: true, name: true } }, _count: { select: { courses: true, teachers: true } } },
  });
}

async function assertDepartment(schoolId: string, departmentId?: string | null) {
  if (!departmentId) return;
  const d = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!d || d.schoolId !== schoolId) throw AppError.validation("Department must belong to the same school");
}

export async function createSubject(user: AuthUser, input: CreateSubjectInput) {
  assertPermission(user, "subjects:manage");
  const schoolId = resolveSchoolId(user, input.schoolId);
  await assertDepartment(schoolId, input.departmentId);
  const subject = await prisma.subject.create({ data: { schoolId, name: input.name, code: input.code, departmentId: input.departmentId ?? null } });
  await audit({ user, schoolId, action: "subject.create", entityType: "Subject", entityId: subject.id, after: subject });
  return subject;
}

export async function updateSubject(user: AuthUser, id: string, input: UpdateSubjectInput) {
  assertPermission(user, "subjects:manage");
  const before = await prisma.subject.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Subject");
  assertSchoolAccess(user, before.schoolId);
  await assertDepartment(before.schoolId, input.departmentId);
  const subject = await prisma.subject.update({ where: { id }, data: input });
  await audit({ user, schoolId: before.schoolId, action: "subject.update", entityType: "Subject", entityId: id, before, after: subject });
  return subject;
}

export async function deleteSubject(user: AuthUser, id: string) {
  assertPermission(user, "subjects:manage");
  const before = await prisma.subject.findUnique({ where: { id }, include: { _count: { select: { courses: true } } } });
  if (!before) throw AppError.notFound("Subject");
  assertSchoolAccess(user, before.schoolId);
  if (before._count.courses > 0) throw AppError.conflict("Subject is used by existing courses");
  await prisma.subject.delete({ where: { id } });
  await audit({ user, schoolId: before.schoolId, action: "subject.delete", entityType: "Subject", entityId: id, before });
}
