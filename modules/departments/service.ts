import { prisma } from "@/lib/db";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, canAccessDepartment, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import type { CreateDepartmentInput, UpdateDepartmentInput } from "./schema";

const include = {
  headTeacher: { include: { user: { select: { id: true, name: true, email: true } } } },
  _count: { select: { teachers: true, subjects: true, staff: true } },
};

export async function listDepartments(user: AuthUser, schoolId?: string) {
  assertPermission(user, "departments:read");
  const sid = resolveSchoolId(user, schoolId);
  return prisma.department.findMany({ where: { schoolId: sid }, orderBy: { name: "asc" }, include });
}

export async function getDepartment(user: AuthUser, id: string) {
  assertPermission(user, "departments:read");
  const dept = await prisma.department.findUnique({
    where: { id },
    include: {
      ...include,
      teachers: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { user: { name: "asc" } } },
      subjects: { orderBy: { name: "asc" } },
    },
  });
  if (!dept) throw AppError.notFound("Department");
  assertSchoolAccess(user, dept.schoolId);
  return dept;
}

async function assertHeadTeacher(schoolId: string, headTeacherId?: string | null) {
  if (!headTeacherId) return;
  const t = await prisma.teacher.findUnique({ where: { id: headTeacherId } });
  if (!t || t.schoolId !== schoolId) throw AppError.validation("Head teacher must belong to the same school");
}

export async function createDepartment(user: AuthUser, input: CreateDepartmentInput) {
  assertPermission(user, "departments:manage");
  const schoolId = resolveSchoolId(user, input.schoolId);
  if (user.role === "DEPARTMENT_HEAD") throw AppError.forbidden("Department heads cannot create departments");
  await assertHeadTeacher(schoolId, input.headTeacherId);
  const dept = await prisma.$transaction(async (tx) => {
    const d = await tx.department.create({ data: { schoolId, name: input.name, code: input.code, description: input.description ?? null, headTeacherId: input.headTeacherId ?? null } });
    if (input.headTeacherId) {
      await tx.teacher.update({ where: { id: input.headTeacherId }, data: { departmentId: d.id } });
      await tx.user.updateMany({ where: { teacher: { id: input.headTeacherId }, role: "TEACHER" }, data: { role: "DEPARTMENT_HEAD" } });
    }
    return d;
  });
  await audit({ user, schoolId, action: "department.create", entityType: "Department", entityId: dept.id, after: dept });
  return dept;
}

export async function updateDepartment(user: AuthUser, id: string, input: UpdateDepartmentInput) {
  assertPermission(user, "departments:manage");
  const before = await prisma.department.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Department");
  assertSchoolAccess(user, before.schoolId);
  if (!canAccessDepartment(user, id)) throw AppError.forbidden("You can only manage your own department");
  if (input.headTeacherId !== undefined && user.role === "DEPARTMENT_HEAD") throw AppError.forbidden("Only administrators can change the department head");
  await assertHeadTeacher(before.schoolId, input.headTeacherId);
  const dept = await prisma.$transaction(async (tx) => {
    const d = await tx.department.update({ where: { id }, data: input });
    if (input.headTeacherId !== undefined && input.headTeacherId !== before.headTeacherId) {
      if (before.headTeacherId) {
        await tx.user.updateMany({ where: { teacher: { id: before.headTeacherId }, role: "DEPARTMENT_HEAD" }, data: { role: "TEACHER" } });
      }
      if (input.headTeacherId) {
        await tx.teacher.update({ where: { id: input.headTeacherId }, data: { departmentId: id } });
        await tx.user.updateMany({ where: { teacher: { id: input.headTeacherId }, role: "TEACHER" }, data: { role: "DEPARTMENT_HEAD" } });
      }
    }
    return d;
  });
  await audit({ user, schoolId: before.schoolId, action: "department.update", entityType: "Department", entityId: id, before, after: dept });
  return dept;
}

export async function deleteDepartment(user: AuthUser, id: string) {
  assertPermission(user, "departments:manage");
  if (user.role === "DEPARTMENT_HEAD") throw AppError.forbidden("Department heads cannot delete departments");
  const before = await prisma.department.findUnique({ where: { id }, include: { _count: { select: { teachers: true, subjects: true } } } });
  if (!before) throw AppError.notFound("Department");
  assertSchoolAccess(user, before.schoolId);
  if (before._count.teachers > 0 || before._count.subjects > 0) throw AppError.conflict("Department still has teachers or subjects assigned");
  await prisma.department.delete({ where: { id } });
  await audit({ user, schoolId: before.schoolId, action: "department.delete", entityType: "Department", entityId: id, before });
}
