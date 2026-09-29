import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { paged, paginate, type Pagination } from "@/lib/validation";
import { createUserWithPassword, generateTemporaryPassword } from "@/modules/users/service";
import type { z } from "zod";
import type { CreateGuardianInput, linkStudentSchema, updateGuardianSchema } from "./schema";

const include = {
  user: { select: { id: true, name: true, email: true, phone: true, isActive: true } },
  students: { include: { student: { select: { id: true, firstName: true, lastName: true, studentNumber: true, classId: true, class: { select: { id: true, name: true } } } } } },
} satisfies Prisma.GuardianInclude;

export async function listGuardians(user: AuthUser, query: Pagination & { q?: string; schoolId?: string }) {
  assertPermission(user, "guardians:read");
  const schoolId = resolveSchoolId(user, query.schoolId);
  const where: Prisma.GuardianWhereInput = {
    schoolId,
    ...(query.q ? { user: { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { email: { contains: query.q, mode: "insensitive" } }] } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.guardian.findMany({ where, include, orderBy: { user: { name: "asc" } }, ...paginate(query) }),
    prisma.guardian.count({ where }),
  ]);
  return paged(items, total, query);
}

export async function getGuardian(user: AuthUser, id: string) {
  const g = await prisma.guardian.findUnique({ where: { id }, include });
  if (!g) throw AppError.notFound("Guardian");
  assertSchoolAccess(user, g.schoolId);
  if (user.guardianId !== id) assertPermission(user, "guardians:read");
  return g;
}

async function assertStudents(schoolId: string, studentIds: string[]) {
  if (!studentIds.length) return;
  const count = await prisma.student.count({ where: { id: { in: studentIds }, schoolId } });
  if (count !== new Set(studentIds).size) throw AppError.validation("All students must belong to the same school");
}

export async function createGuardian(actor: AuthUser, input: CreateGuardianInput) {
  assertPermission(actor, "guardians:manage");
  const schoolId = resolveSchoolId(actor, input.schoolId);
  await assertStudents(schoolId, input.studentIds);
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw AppError.conflict("A user with this email already exists");
  const password = input.password ?? generateTemporaryPassword();
  const guardian = await prisma.$transaction(async (tx) => {
    const u = await createUserWithPassword({ name: input.name, email: input.email, password, role: "PARENT", schoolId, phone: input.phone }, tx);
    return tx.guardian.create({
      data: {
        schoolId,
        userId: u.id,
        phone: input.phone ?? null,
        address: input.address ?? null,
        students: { create: [...new Set(input.studentIds)].map((studentId, i) => ({ studentId, relationship: input.relationship, isPrimary: i === 0 })) },
      },
      include,
    });
  });
  await audit({ user: actor, schoolId, action: "guardian.create", entityType: "Guardian", entityId: guardian.id, after: guardian });
  return { guardian, temporaryPassword: input.password ? undefined : password };
}

export async function updateGuardian(actor: AuthUser, id: string, input: z.infer<typeof updateGuardianSchema>) {
  const before = await prisma.guardian.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Guardian");
  assertSchoolAccess(actor, before.schoolId);
  if (actor.guardianId !== id) assertPermission(actor, "guardians:manage");
  const guardian = await prisma.$transaction(async (tx) => {
    if (input.name !== undefined || input.phone !== undefined) await tx.user.update({ where: { id: before.userId }, data: { name: input.name, phone: input.phone } });
    return tx.guardian.update({ where: { id }, data: { phone: input.phone, address: input.address }, include });
  });
  await audit({ user: actor, schoolId: before.schoolId, action: "guardian.update", entityType: "Guardian", entityId: id, before, after: guardian });
  return guardian;
}

export async function linkStudent(actor: AuthUser, guardianId: string, input: z.infer<typeof linkStudentSchema>) {
  assertPermission(actor, "guardians:manage");
  const g = await prisma.guardian.findUnique({ where: { id: guardianId } });
  if (!g) throw AppError.notFound("Guardian");
  assertSchoolAccess(actor, g.schoolId);
  await assertStudents(g.schoolId, [input.studentId]);
  const link = await prisma.studentGuardian.upsert({
    where: { studentId_guardianId: { studentId: input.studentId, guardianId } },
    update: { relationship: input.relationship, isPrimary: input.isPrimary },
    create: { studentId: input.studentId, guardianId, relationship: input.relationship, isPrimary: input.isPrimary },
  });
  await audit({ user: actor, schoolId: g.schoolId, action: "guardian.link_student", entityType: "Guardian", entityId: guardianId, after: link });
  return link;
}

export async function unlinkStudent(actor: AuthUser, guardianId: string, studentId: string) {
  assertPermission(actor, "guardians:manage");
  const g = await prisma.guardian.findUnique({ where: { id: guardianId } });
  if (!g) throw AppError.notFound("Guardian");
  assertSchoolAccess(actor, g.schoolId);
  await prisma.studentGuardian.deleteMany({ where: { guardianId, studentId } });
  await audit({ user: actor, schoolId: g.schoolId, action: "guardian.unlink_student", entityType: "Guardian", entityId: guardianId, metadata: { studentId } });
}

/** Children linked to the calling parent. */
export async function myChildren(user: AuthUser) {
  if (!user.guardianId) return [];
  const links = await prisma.studentGuardian.findMany({
    where: { guardianId: user.guardianId },
    include: { student: { include: { class: { select: { id: true, name: true, gradeLevel: true } } } } },
  });
  return links.map((l) => l.student);
}
