import { prisma } from "@/lib/db";
import type { AuthUser } from "@/lib/auth/types";
import { resolveSchoolId } from "@/lib/permissions";
import { listAcademicYears } from "@/modules/academic";
import { listDepartments } from "@/modules/departments";
import { listSubjects } from "@/modules/subjects";
import { listClasses, listCourses } from "@/modules/classes";
import { teacherDirectory } from "@/modules/teachers";
import { listPeriods } from "@/modules/timetable";
import { listRooms } from "@/modules/facilities";
import { optional } from "./guard";

export type Option = { value: string; label: string };

/** The caller's school, or null when the account is not attached to one (platform super admin). */
function schoolOf(user: AuthUser): string | null {
  try {
    return resolveSchoolId(user);
  } catch {
    return null;
  }
}

export async function teacherOptions(user: AuthUser): Promise<Option[]> {
  const rows = await optional(() => teacherDirectory(user), []);
  return rows.map((t) => ({ value: t.id, label: `${t.user.name} (${t.employeeNumber})` }));
}

export async function allTeacherOptions(user: AuthUser): Promise<Option[]> {
  const schoolId = schoolOf(user);
  if (!schoolId) return [];
  const rows = await prisma.teacher.findMany({ where: { schoolId }, select: { id: true, employeeNumber: true, status: true, user: { select: { name: true } } }, orderBy: { user: { name: "asc" } } });
  return rows.map((t) => ({ value: t.id, label: `${t.user.name} (${t.employeeNumber})${t.status !== "ACTIVE" ? ` – ${t.status.toLowerCase()}` : ""}` }));
}

export async function subjectOptions(user: AuthUser): Promise<Option[]> {
  const rows = await optional(() => listSubjects(user), []);
  return rows.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }));
}

export async function departmentOptions(user: AuthUser): Promise<Option[]> {
  const rows = await optional(() => listDepartments(user), []);
  return rows.map((d) => ({ value: d.id, label: d.name }));
}

export async function classOptions(user: AuthUser, academicYearId?: string): Promise<Option[]> {
  const res = await optional(() => listClasses(user, { page: 1, pageSize: 200, academicYearId }), null);
  return (res?.items ?? []).map((c) => ({ value: c.id, label: `${c.name}${c.academicYear ? ` · ${c.academicYear.name}` : ""}` }));
}

export async function roomOptions(user: AuthUser): Promise<Option[]> {
  const rows = await optional(() => listRooms(user), []);
  return rows.map((r) => ({ value: r.id, label: `${r.name} (${r.code})` }));
}

export async function periodOptions(user: AuthUser): Promise<Option[]> {
  const rows = await optional(() => listPeriods(user), []);
  return rows.map((p) => ({ value: p.id, label: `${p.name} (${p.startTime}–${p.endTime})` }));
}

export async function academicYearOptions(user: AuthUser): Promise<Option[]> {
  const rows = await optional(() => listAcademicYears(user), []);
  return rows.map((y) => ({ value: y.id, label: `${y.name}${y.isCurrent ? " (current)" : ""}` }));
}

export async function termOptions(user: AuthUser): Promise<Option[]> {
  const rows = await optional(() => listAcademicYears(user), []);
  return rows.flatMap((y) => y.terms.map((t) => ({ value: t.id, label: `${y.name} · ${t.name}${t.isCurrent ? " (current)" : ""}` })));
}

export async function courseOptions(user: AuthUser): Promise<Option[]> {
  const rows = await optional(() => listCourses(user), []);
  return rows.map((c) => ({ value: c.id, label: `${c.class.name} · ${c.subject.name} · ${c.teacher.user.name}` }));
}

/** Active users of the school (for assignee pickers). */
export async function userOptions(user: AuthUser, roles?: string[]): Promise<Option[]> {
  const schoolId = schoolOf(user);
  if (!schoolId) return [];
  const rows = await prisma.user.findMany({
    where: { schoolId, isActive: true, ...(roles ? { role: { in: roles as never } } : {}) },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  return rows.map((u) => ({ value: u.id, label: `${u.name} · ${u.role.replace(/_/g, " ").toLowerCase()}` }));
}

/** Staff-like users (teachers, admins, staff) for support-case assignment. */
export function staffUserOptions(user: AuthUser) {
  return userOptions(user, ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "DEPARTMENT_HEAD", "TEACHER", "STAFF"]);
}

export async function studentOptions(user: AuthUser, where: { classId?: string | null; excludeClassId?: string } = {}): Promise<Option[]> {
  const schoolId = schoolOf(user);
  if (!schoolId) return [];
  const rows = await prisma.student.findMany({
    where: { schoolId, status: "ACTIVE", ...(where.classId !== undefined ? { classId: where.classId } : {}), ...(where.excludeClassId ? { NOT: { classId: where.excludeClassId } } : {}) },
    select: { id: true, firstName: true, lastName: true, studentNumber: true, class: { select: { name: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 1000,
  });
  return rows.map((s) => ({ value: s.id, label: `${s.lastName}, ${s.firstName} (${s.studentNumber})${s.class ? ` · ${s.class.name}` : " · no class"}` }));
}

export async function guardianOptions(user: AuthUser): Promise<Option[]> {
  const schoolId = schoolOf(user);
  if (!schoolId) return [];
  const rows = await prisma.guardian.findMany({ where: { schoolId }, select: { id: true, user: { select: { name: true, email: true } } }, orderBy: { user: { name: "asc" } }, take: 1000 });
  return rows.map((g) => ({ value: g.id, label: `${g.user.name} (${g.user.email})` }));
}

export function enumOptions(values: readonly string[]): Option[] {
  return values.map((v) => ({ value: v, label: v.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) }));
}
