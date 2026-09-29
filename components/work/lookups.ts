/** Small server-side lookups (Prisma) shared by the work pages for select options. */
import { prisma } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";

export interface Option {
  id: string;
  name: string;
}

export const STAFF_LIKE: Role[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "DEPARTMENT_HEAD", "TEACHER", "STAFF"];

/** Active staff-like users (admins, teachers, staff) of a school. */
export async function staffUsers(schoolId: string | null | undefined): Promise<Array<Option & { role: Role }>> {
  if (!schoolId) return [];
  return prisma.user.findMany({ where: { schoolId, isActive: true, role: { in: STAFF_LIKE } }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } });
}

/** Every active user of a school (for admin-level recipient pickers). */
export async function schoolUsers(schoolId: string | null | undefined): Promise<Array<Option & { role: Role }>> {
  if (!schoolId) return [];
  return prisma.user.findMany({ where: { schoolId, isActive: true }, select: { id: true, name: true, role: true }, orderBy: [{ role: "asc" }, { name: "asc" }] });
}

export async function roomOptions(schoolId: string | null | undefined): Promise<Array<Option & { code: string }>> {
  if (!schoolId) return [];
  return prisma.room.findMany({ where: { schoolId, isActive: true }, select: { id: true, name: true, code: true }, orderBy: [{ building: "asc" }, { name: "asc" }] });
}

export async function departmentOptions(schoolId: string | null | undefined): Promise<Option[]> {
  if (!schoolId) return [];
  return prisma.department.findMany({ where: { schoolId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export async function classOptions(schoolId: string | null | undefined): Promise<Option[]> {
  if (!schoolId) return [];
  return prisma.schoolClass.findMany({ where: { schoolId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

/** Users a student or parent may message: school admins plus the teachers (course + homeroom) of their (children's) classes. Mirrors modules/communication. */
export async function allowedRecipientsForStudentLike(user: { schoolId: string | null; studentId?: string | null; guardianId?: string | null }): Promise<Array<Option & { role: Role }>> {
  if (!user.schoolId) return [];
  const classIds = new Set<string>();
  if (user.studentId) {
    const s = await prisma.student.findUnique({ where: { id: user.studentId }, select: { classId: true } });
    if (s?.classId) classIds.add(s.classId);
  } else if (user.guardianId) {
    const links = await prisma.studentGuardian.findMany({ where: { guardianId: user.guardianId }, select: { student: { select: { classId: true } } } });
    for (const l of links) if (l.student.classId) classIds.add(l.student.classId);
  }
  const ids = [...classIds];
  const [admins, courses, classes] = await Promise.all([
    prisma.user.findMany({ where: { schoolId: user.schoolId, role: { in: ["SCHOOL_ADMIN", "PRINCIPAL"] }, isActive: true }, select: { id: true, name: true, role: true } }),
    ids.length ? prisma.course.findMany({ where: { classId: { in: ids } }, select: { teacher: { select: { user: { select: { id: true, name: true, role: true, isActive: true } } } } } }) : Promise.resolve([]),
    ids.length ? prisma.schoolClass.findMany({ where: { id: { in: ids } }, select: { homeroomTeacher: { select: { user: { select: { id: true, name: true, role: true, isActive: true } } } } } }) : Promise.resolve([]),
  ]);
  const map = new Map<string, Option & { role: Role }>();
  for (const a of admins) map.set(a.id, a);
  for (const c of courses) if (c.teacher.user.isActive) map.set(c.teacher.user.id, { id: c.teacher.user.id, name: c.teacher.user.name, role: c.teacher.user.role });
  for (const c of classes) if (c.homeroomTeacher?.user.isActive) map.set(c.homeroomTeacher.user.id, { id: c.homeroomTeacher.user.id, name: c.homeroomTeacher.user.name, role: c.homeroomTeacher.user.role });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
