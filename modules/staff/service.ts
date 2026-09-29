import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { paged, paginate, type Pagination } from "@/lib/validation";
import { createUserWithPassword, generateTemporaryPassword } from "@/modules/users/service";
import type { CreateStaffInput, UpdateStaffInput } from "./schema";

const include = {
  user: { select: { id: true, name: true, email: true, phone: true, isActive: true, role: true } },
  department: { select: { id: true, name: true } },
} satisfies Prisma.StaffInclude;

export async function listStaff(user: AuthUser, query: Pagination & { q?: string; staffType?: string; status?: string; schoolId?: string }) {
  assertPermission(user, "staff:read");
  const schoolId = resolveSchoolId(user, query.schoolId);
  const where: Prisma.StaffWhereInput = {
    schoolId,
    staffType: query.staffType as Prisma.StaffWhereInput["staffType"],
    status: query.status as Prisma.StaffWhereInput["status"],
    ...(query.q ? { OR: [{ user: { name: { contains: query.q, mode: "insensitive" } } }, { employeeNumber: { contains: query.q, mode: "insensitive" } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.staff.findMany({ where, include, orderBy: { user: { name: "asc" } }, ...paginate(query) }),
    prisma.staff.count({ where }),
  ]);
  return paged(items, total, query);
}

export async function getStaff(user: AuthUser, id: string) {
  const s = await prisma.staff.findUnique({ where: { id }, include });
  if (!s) throw AppError.notFound("Staff member");
  assertSchoolAccess(user, s.schoolId);
  if (user.staffId !== id) assertPermission(user, "staff:read");
  return s;
}

export async function createStaff(actor: AuthUser, input: CreateStaffInput) {
  assertPermission(actor, "staff:manage");
  const schoolId = resolveSchoolId(actor, input.schoolId);
  if (input.role !== "STAFF") assertPermission(actor, "users:manage");
  if (input.departmentId) {
    const d = await prisma.department.findUnique({ where: { id: input.departmentId } });
    if (!d || d.schoolId !== schoolId) throw AppError.validation("Department must belong to the same school");
  }
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw AppError.conflict("A user with this email already exists");
  const password = input.password ?? generateTemporaryPassword();
  const staff = await prisma.$transaction(async (tx) => {
    const u = await createUserWithPassword({ name: input.name, email: input.email, password, role: input.role, schoolId, phone: input.phone }, tx);
    return tx.staff.create({
      data: {
        schoolId,
        userId: u.id,
        employeeNumber: input.employeeNumber,
        staffType: input.staffType,
        departmentId: input.departmentId ?? null,
        position: input.position ?? null,
        workSchedule: (input.workSchedule as Prisma.InputJsonValue) ?? undefined,
      },
      include,
    });
  });
  await audit({ user: actor, schoolId, action: "staff.create", entityType: "Staff", entityId: staff.id, after: staff });
  return { staff, temporaryPassword: input.password ? undefined : password };
}

export async function updateStaff(actor: AuthUser, id: string, input: UpdateStaffInput) {
  assertPermission(actor, "staff:manage");
  const before = await prisma.staff.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Staff member");
  assertSchoolAccess(actor, before.schoolId);
  const { name, phone, workSchedule, ...fields } = input;
  const staff = await prisma.$transaction(async (tx) => {
    if (name !== undefined || phone !== undefined) await tx.user.update({ where: { id: before.userId }, data: { name, phone } });
    if (input.status === "INACTIVE") {
      await tx.user.update({ where: { id: before.userId }, data: { isActive: false } });
      await tx.session.deleteMany({ where: { userId: before.userId } });
    } else if (input.status === "ACTIVE") {
      await tx.user.update({ where: { id: before.userId }, data: { isActive: true } });
    }
    return tx.staff.update({ where: { id }, data: { ...fields, workSchedule: workSchedule === undefined ? undefined : ((workSchedule ?? undefined) as Prisma.InputJsonValue | undefined) }, include });
  });
  await audit({ user: actor, schoolId: before.schoolId, action: "staff.update", entityType: "Staff", entityId: id, before, after: staff });
  return staff;
}

/** User ids of maintenance staff for a school (workflow recipients). */
export async function maintenanceStaffUserIds(schoolId: string): Promise<string[]> {
  const rows = await prisma.staff.findMany({ where: { schoolId, staffType: "MAINTENANCE", status: "ACTIVE" }, select: { userId: true } });
  return rows.map((r) => r.userId);
}
