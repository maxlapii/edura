import type { AuthUser } from "@/lib/auth/types";
import { AppError } from "@/lib/utils/errors";
import type { Permission } from "./permissions";
import { ADMIN_ROLES, ROLE_PERMISSIONS, STAFF_LIKE_ROLES } from "./roles";

export type { Permission } from "./permissions";
export { PERMISSIONS } from "./permissions";
export { ROLE_PERMISSIONS, ADMIN_ROLES, STAFF_LIKE_ROLES } from "./roles";

export function hasPermission(user: Pick<AuthUser, "role">, permission: Permission): boolean {
  return ROLE_PERMISSIONS[user.role]?.has(permission) ?? false;
}

export function hasAnyPermission(user: Pick<AuthUser, "role">, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(user, p));
}

export function assertPermission(user: Pick<AuthUser, "role">, permission: Permission): void {
  if (!hasPermission(user, permission)) {
    throw AppError.forbidden(`Missing permission: ${permission}`);
  }
}

export function isAdmin(user: Pick<AuthUser, "role">): boolean {
  return ADMIN_ROLES.has(user.role);
}

export function isStaffLike(user: Pick<AuthUser, "role">): boolean {
  return STAFF_LIKE_ROLES.has(user.role);
}

/**
 * School scope: every school-owned record must belong to the caller's school.
 * SUPER_ADMIN may operate on any school (but must still name one).
 */
export function canAccessSchool(user: Pick<AuthUser, "role" | "schoolId">, schoolId: string | null | undefined): boolean {
  if (!schoolId) return false;
  if (user.role === "SUPER_ADMIN") return true;
  return user.schoolId === schoolId;
}

export function assertSchoolAccess(user: Pick<AuthUser, "role" | "schoolId">, schoolId: string | null | undefined): void {
  if (!canAccessSchool(user, schoolId)) {
    throw AppError.forbidden("Resource belongs to another school");
  }
}

/** Resolves the school the caller is operating on. SUPER_ADMIN may pass an explicit school id. */
export function resolveSchoolId(user: Pick<AuthUser, "role" | "schoolId">, explicit?: string | null): string {
  if (user.role === "SUPER_ADMIN" && explicit) return explicit;
  if (!user.schoolId) throw AppError.forbidden("User is not attached to a school");
  if (explicit && explicit !== user.schoolId) throw AppError.forbidden("Resource belongs to another school");
  return user.schoolId;
}

/** Department scope: department heads act only within their own department. */
export function canAccessDepartment(user: Pick<AuthUser, "role" | "departmentId">, departmentId: string | null | undefined): boolean {
  if (isAdmin(user)) return true;
  if (user.role === "DEPARTMENT_HEAD") return !!departmentId && user.departmentId === departmentId;
  return false;
}
