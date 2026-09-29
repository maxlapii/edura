import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, assertPermission, canAccessDepartment, canAccessSchool, hasAnyPermission, hasPermission, isAdmin, isStaffLike, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import type { Role } from "@/generated/prisma/enums";

const ROLES: Role[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "DEPARTMENT_HEAD", "TEACHER", "STUDENT", "PARENT", "STAFF"];

describe("role permission matrix", () => {
  it("defines a permission set for every role", () => {
    for (const role of ROLES) expect(ROLE_PERMISSIONS[role]).toBeInstanceOf(Set);
  });

  it("only references known permissions", () => {
    const known = new Set<string>(PERMISSIONS);
    for (const role of ROLES) for (const p of ROLE_PERMISSIONS[role]) expect(known.has(p)).toBe(true);
  });

  it("SUPER_ADMIN has every permission", () => {
    for (const p of PERMISSIONS) expect(hasPermission({ role: "SUPER_ADMIN" }, p)).toBe(true);
  });

  it.each<[Role, string, boolean]>([
    ["TEACHER", "attendance:record", true],
    ["TEACHER", "grades:manage", true],
    ["TEACHER", "grades:lock", false],
    ["TEACHER", "leave:review", false],
    ["TEACHER", "users:manage", false],
    ["TEACHER", "students:read_sensitive", false],
    ["TEACHER", "support_cases:read_sensitive", false],
    ["DEPARTMENT_HEAD", "tasks:assign", true],
    ["DEPARTMENT_HEAD", "leave:read_all", true],
    ["DEPARTMENT_HEAD", "leave:review", false],
    ["DEPARTMENT_HEAD", "timetable:manage", false],
    ["SCHOOL_ADMIN", "leave:review", true],
    ["SCHOOL_ADMIN", "grades:lock", true],
    ["SCHOOL_ADMIN", "assignments:submit", false],
    ["SCHOOL_ADMIN", "dashboard:student", false],
    ["PRINCIPAL", "approvals:decide", true],
    ["STUDENT", "assignments:submit", true],
    ["STUDENT", "attendance:record", false],
    ["STUDENT", "grades:manage", false],
    ["STUDENT", "students:read", false],
    ["PARENT", "grades:read", true],
    ["PARENT", "grades:manage", false],
    ["PARENT", "students:manage", false],
    ["PARENT", "messages:send", true],
    ["STAFF", "maintenance:manage", true],
    ["STAFF", "grades:read", false],
    ["STAFF", "attendance:record", false],
  ])("%s has %s = %s", (role, permission, expected) => {
    expect(hasPermission({ role }, permission as never)).toBe(expected);
  });

  it("students and parents never get any manage/admin permission", () => {
    for (const role of ["STUDENT", "PARENT"] as Role[]) {
      for (const p of ROLE_PERMISSIONS[role]) {
        expect(p.endsWith(":manage")).toBe(false);
        expect(p).not.toMatch(/:lock|:review|:decide|:assign$|sensitive|audit|workflows|users:/);
      }
    }
  });
});

describe("permission helpers", () => {
  it("hasAnyPermission returns true when at least one matches", () => {
    expect(hasAnyPermission({ role: "TEACHER" }, ["users:manage", "attendance:record"])).toBe(true);
    expect(hasAnyPermission({ role: "STUDENT" }, ["users:manage", "attendance:record"])).toBe(false);
  });

  it("assertPermission throws a FORBIDDEN AppError", () => {
    expect(() => assertPermission({ role: "STUDENT" }, "grades:manage")).toThrowError(AppError);
    try {
      assertPermission({ role: "STUDENT" }, "grades:manage");
    } catch (e) {
      expect((e as AppError).code).toBe("FORBIDDEN");
      expect((e as AppError).status).toBe(403);
    }
    expect(() => assertPermission({ role: "TEACHER" }, "grades:manage")).not.toThrow();
  });

  it("isAdmin / isStaffLike", () => {
    expect(isAdmin({ role: "PRINCIPAL" })).toBe(true);
    expect(isAdmin({ role: "DEPARTMENT_HEAD" })).toBe(false);
    expect(isStaffLike({ role: "STAFF" })).toBe(true);
    expect(isStaffLike({ role: "PARENT" })).toBe(false);
  });
});

describe("school scope", () => {
  it("users can only access their own school", () => {
    expect(canAccessSchool({ role: "TEACHER", schoolId: "A" }, "A")).toBe(true);
    expect(canAccessSchool({ role: "TEACHER", schoolId: "A" }, "B")).toBe(false);
    expect(canAccessSchool({ role: "SCHOOL_ADMIN", schoolId: "A" }, "B")).toBe(false);
    expect(canAccessSchool({ role: "TEACHER", schoolId: "A" }, null)).toBe(false);
  });

  it("super admins can access any school but still need one", () => {
    expect(canAccessSchool({ role: "SUPER_ADMIN", schoolId: null }, "B")).toBe(true);
    expect(canAccessSchool({ role: "SUPER_ADMIN", schoolId: null }, undefined)).toBe(false);
  });

  it("resolveSchoolId rejects cross-school requests", () => {
    expect(resolveSchoolId({ role: "TEACHER", schoolId: "A" })).toBe("A");
    expect(resolveSchoolId({ role: "TEACHER", schoolId: "A" }, "A")).toBe("A");
    expect(() => resolveSchoolId({ role: "TEACHER", schoolId: "A" }, "B")).toThrow(AppError);
    expect(() => resolveSchoolId({ role: "TEACHER", schoolId: null })).toThrow(AppError);
    expect(resolveSchoolId({ role: "SUPER_ADMIN", schoolId: null }, "B")).toBe("B");
    expect(() => resolveSchoolId({ role: "SUPER_ADMIN", schoolId: null })).toThrow(AppError);
  });

  it("department scope applies to department heads only", () => {
    expect(canAccessDepartment({ role: "SCHOOL_ADMIN", departmentId: null }, "D1")).toBe(true);
    expect(canAccessDepartment({ role: "DEPARTMENT_HEAD", departmentId: "D1" }, "D1")).toBe(true);
    expect(canAccessDepartment({ role: "DEPARTMENT_HEAD", departmentId: "D1" }, "D2")).toBe(false);
    expect(canAccessDepartment({ role: "TEACHER", departmentId: "D1" }, "D1")).toBe(false);
  });
});
