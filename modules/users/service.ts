import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { hashPassword } from "@/lib/auth/password";
import { assertPermission, assertSchoolAccess, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { paged, paginate, type Pagination } from "@/lib/validation";
import type { Role } from "@/generated/prisma/enums";
import type { CreateUserInput, UpdateUserInput } from "./schema";

const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  schoolId: true,
  isActive: true,
  phone: true,
  image: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export function generateTemporaryPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

/**
 * Low-level helper: creates a user with an email/password credential account.
 * Used by admin provisioning and the seed script. Does no permission checks.
 */
export async function createUserWithPassword(
  data: { name: string; email: string; password: string; role: Role; schoolId: string | null; phone?: string | null },
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const passwordHash = await hashPassword(data.password);
  const user = await tx.user.create({
    data: { name: data.name, email: data.email.toLowerCase(), role: data.role, schoolId: data.schoolId, phone: data.phone ?? null, emailVerified: true },
  });
  // better-auth expects the credential account's accountId to equal the user id.
  await tx.account.create({ data: { userId: user.id, providerId: "credential", accountId: user.id, password: passwordHash } });
  return user;
}

function assertCanManageRole(actor: AuthUser, role: Role) {
  if (role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") {
    throw AppError.forbidden("Only super administrators can manage super administrators");
  }
}

export async function createUser(actor: AuthUser, input: CreateUserInput) {
  assertPermission(actor, "users:manage");
  assertCanManageRole(actor, input.role);
  const schoolId = input.role === "SUPER_ADMIN" ? null : resolveSchoolId(actor, input.schoolId);
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw AppError.conflict("A user with this email already exists");
  const password = input.password ?? generateTemporaryPassword();
  const user = await createUserWithPassword({ ...input, password, schoolId });
  await audit({ user: actor, schoolId, action: "user.create", entityType: "User", entityId: user.id, after: { ...user, password: undefined } });
  return { user: sanitize(user), temporaryPassword: input.password ? undefined : password };
}

export async function listUsers(actor: AuthUser, query: Pagination & { q?: string; role?: Role; isActive?: "true" | "false"; schoolId?: string }) {
  assertPermission(actor, "users:manage");
  const schoolId = resolveSchoolId(actor, query.schoolId);
  const where: Prisma.UserWhereInput = {
    schoolId,
    role: query.role,
    isActive: query.isActive === undefined ? undefined : query.isActive === "true",
    ...(query.q ? { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { email: { contains: query.q, mode: "insensitive" } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, select: PUBLIC_USER_SELECT, orderBy: { name: "asc" }, ...paginate(query) }),
    prisma.user.count({ where }),
  ]);
  return paged(items, total, query);
}

export async function getUser(actor: AuthUser, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: PUBLIC_USER_SELECT });
  if (!user) throw AppError.notFound("User");
  if (actor.id !== userId) {
    assertPermission(actor, "users:manage");
    assertSchoolAccess(actor, user.schoolId);
  }
  return user;
}

export async function updateUser(actor: AuthUser, userId: string, input: UpdateUserInput) {
  assertPermission(actor, "users:manage");
  const before = await prisma.user.findUnique({ where: { id: userId } });
  if (!before) throw AppError.notFound("User");
  if (before.schoolId) assertSchoolAccess(actor, before.schoolId);
  assertCanManageRole(actor, before.role);
  if (input.role) assertCanManageRole(actor, input.role);
  if (input.isActive === false && actor.id === userId) throw AppError.badRequest("You cannot deactivate your own account");
  const user = await prisma.user.update({ where: { id: userId }, data: input, select: PUBLIC_USER_SELECT });
  await audit({ user: actor, schoolId: before.schoolId, action: "user.update", entityType: "User", entityId: userId, before: sanitize(before), after: user });
  return user;
}

export async function setUserPassword(actor: AuthUser, userId: string, password: string) {
  assertPermission(actor, "users:manage");
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw AppError.notFound("User");
  if (target.schoolId) assertSchoolAccess(actor, target.schoolId);
  assertCanManageRole(actor, target.role);
  const passwordHash = await hashPassword(password);
  const account = await prisma.account.findFirst({ where: { userId, providerId: "credential" } });
  if (account) {
    await prisma.account.update({ where: { id: account.id }, data: { password: passwordHash } });
  } else {
    await prisma.account.create({ data: { userId, providerId: "credential", accountId: userId, password: passwordHash } });
  }
  await prisma.session.deleteMany({ where: { userId } });
  await audit({ user: actor, schoolId: target.schoolId, action: "user.set_password", entityType: "User", entityId: userId });
}

function sanitize<T extends { [k: string]: unknown }>(user: T) {
  const { emailVerified: _ev, image: _img, ...rest } = user;
  return rest;
}

export async function getUserProfile(actor: AuthUser) {
  return prisma.user.findUnique({
    where: { id: actor.id },
    select: {
      ...PUBLIC_USER_SELECT,
      school: { select: { id: true, name: true, code: true, timezone: true } },
      teacher: { select: { id: true, employeeNumber: true, departmentId: true, status: true, department: { select: { id: true, name: true } } } },
      staff: { select: { id: true, employeeNumber: true, staffType: true } },
      student: { select: { id: true, studentNumber: true, classId: true } },
      guardian: { select: { id: true, students: { select: { student: { select: { id: true, firstName: true, lastName: true, classId: true } } } } } },
    },
  });
}
