import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, isAdmin, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { paged, paginate, type Pagination } from "@/lib/validation";
import { createUserWithPassword, generateTemporaryPassword } from "@/modules/users/service";
import type { z } from "zod";
import type { CreateTeacherInput, UpdateTeacherInput, availabilitySchema, certificationSchema, dutySchema, professionalDevelopmentSchema } from "./schema";

const baseInclude = {
  user: { select: { id: true, name: true, email: true, phone: true, isActive: true, role: true } },
  department: { select: { id: true, name: true, code: true } },
  subjects: { include: { subject: { select: { id: true, name: true, code: true } } } },
} satisfies Prisma.TeacherInclude;

export async function listTeachers(user: AuthUser, query: Pagination & { q?: string; departmentId?: string; status?: string; subjectId?: string; schoolId?: string }) {
  assertPermission(user, "teachers:read");
  const schoolId = resolveSchoolId(user, query.schoolId);
  const where: Prisma.TeacherWhereInput = {
    schoolId,
    departmentId: query.departmentId,
    status: query.status as Prisma.TeacherWhereInput["status"],
    ...(query.subjectId ? { subjects: { some: { subjectId: query.subjectId } } } : {}),
    ...(query.q
      ? { OR: [{ user: { name: { contains: query.q, mode: "insensitive" } } }, { user: { email: { contains: query.q, mode: "insensitive" } } }, { employeeNumber: { contains: query.q, mode: "insensitive" } }] }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.teacher.findMany({ where, include: { ...baseInclude, _count: { select: { courses: true, timetableSlots: true } } }, orderBy: { user: { name: "asc" } }, ...paginate(query) }),
    prisma.teacher.count({ where }),
  ]);
  return paged(items, total, query);
}

/** Teachers can see their own full profile; others need teachers:read. Sensitive fields limited to admins/self. */
export async function getTeacher(user: AuthUser, id: string) {
  const teacher = await prisma.teacher.findUnique({
    where: { id },
    include: {
      ...baseInclude,
      availability: { include: { period: true }, orderBy: [{ dayOfWeek: "asc" }] },
      duties: { include: { period: true } },
      certifications: { orderBy: { expiresAt: "asc" } },
      professionalDev: { orderBy: { date: "desc" } },
      courses: { include: { subject: true, class: { select: { id: true, name: true, _count: { select: { students: true } } } } } },
      homeroomClasses: { select: { id: true, name: true } },
      headOfDepartment: { select: { id: true, name: true } },
    },
  });
  if (!teacher) throw AppError.notFound("Teacher");
  assertSchoolAccess(user, teacher.schoolId);
  const isSelf = user.teacherId === id;
  if (!isSelf) assertPermission(user, "teachers:read");
  if (!isSelf && !isAdmin(user)) {
    // Strip private details for colleagues.
    const { emergencyContactName: _a, emergencyContactPhone: _b, certifications: _c, professionalDev: _d, ...rest } = teacher;
    return { ...rest, emergencyContactName: null, emergencyContactPhone: null, certifications: [], professionalDev: [] };
  }
  return teacher;
}

async function validateTeacherRefs(schoolId: string, input: { departmentId?: string | null; subjectIds?: string[] }) {
  if (input.departmentId) {
    const d = await prisma.department.findUnique({ where: { id: input.departmentId } });
    if (!d || d.schoolId !== schoolId) throw AppError.validation("Department must belong to the same school");
  }
  if (input.subjectIds?.length) {
    const count = await prisma.subject.count({ where: { id: { in: input.subjectIds }, schoolId } });
    if (count !== new Set(input.subjectIds).size) throw AppError.validation("All subjects must belong to the same school");
  }
}

export async function createTeacher(actor: AuthUser, input: CreateTeacherInput) {
  assertPermission(actor, "teachers:manage");
  const schoolId = resolveSchoolId(actor, input.schoolId);
  await validateTeacherRefs(schoolId, input);
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw AppError.conflict("A user with this email already exists");
  const password = input.password ?? generateTemporaryPassword();
  const teacher = await prisma.$transaction(async (tx) => {
    const u = await createUserWithPassword({ name: input.name, email: input.email, password, role: "TEACHER", schoolId, phone: input.phone }, tx);
    return tx.teacher.create({
      data: {
        schoolId,
        userId: u.id,
        employeeNumber: input.employeeNumber,
        employmentType: input.employmentType,
        hireDate: input.hireDate ?? null,
        departmentId: input.departmentId ?? null,
        position: input.position ?? null,
        qualifications: input.qualifications,
        bio: input.bio ?? null,
        emergencyContactName: input.emergencyContactName ?? null,
        emergencyContactPhone: input.emergencyContactPhone ?? null,
        maxWeeklyPeriods: input.maxWeeklyPeriods,
        subjects: { create: [...new Set(input.subjectIds)].map((subjectId) => ({ subjectId })) },
      },
      include: baseInclude,
    });
  });
  await audit({ user: actor, schoolId, action: "teacher.create", entityType: "Teacher", entityId: teacher.id, after: teacher });
  return { teacher, temporaryPassword: input.password ? undefined : password };
}

export async function updateTeacher(actor: AuthUser, id: string, input: UpdateTeacherInput) {
  const before = await prisma.teacher.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Teacher");
  assertSchoolAccess(actor, before.schoolId);
  const isSelf = actor.teacherId === id;
  if (!isSelf) assertPermission(actor, "teachers:manage");
  // Teachers may edit their own contact/bio/qualification info but not employment fields.
  const data: Prisma.TeacherUpdateInput = {};
  const { subjectIds, name, phone, ...fields } = input;
  const selfEditable = new Set(["bio", "qualifications", "emergencyContactName", "emergencyContactPhone"]);
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (isSelf && !isAdmin(actor) && !selfEditable.has(k)) throw AppError.forbidden(`You cannot change ${k}`);
    (data as Record<string, unknown>)[k] = v;
  }
  await validateTeacherRefs(before.schoolId, { departmentId: input.departmentId, subjectIds });
  const teacher = await prisma.$transaction(async (tx) => {
    if (name !== undefined || phone !== undefined) {
      await tx.user.update({ where: { id: before.userId }, data: { name, phone } });
    }
    if (subjectIds) {
      await tx.teacherSubject.deleteMany({ where: { teacherId: id } });
      await tx.teacherSubject.createMany({ data: [...new Set(subjectIds)].map((subjectId) => ({ teacherId: id, subjectId })) });
    }
    if (input.status === "INACTIVE" || input.status === "SUSPENDED") {
      await tx.user.update({ where: { id: before.userId }, data: { isActive: false } });
      await tx.session.deleteMany({ where: { userId: before.userId } });
    } else if (input.status === "ACTIVE") {
      await tx.user.update({ where: { id: before.userId }, data: { isActive: true } });
    }
    return tx.teacher.update({ where: { id }, data, include: baseInclude });
  });
  await audit({ user: actor, schoolId: before.schoolId, action: "teacher.update", entityType: "Teacher", entityId: id, before, after: teacher });
  return teacher;
}

// ───────────── Availability ─────────────

export async function setAvailability(actor: AuthUser, teacherId: string, entries: z.infer<typeof availabilitySchema>[]) {
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
  if (!teacher) throw AppError.notFound("Teacher");
  assertSchoolAccess(actor, teacher.schoolId);
  if (actor.teacherId !== teacherId) assertPermission(actor, "teachers:manage");
  const periodIds = entries.map((e) => e.periodId).filter((p): p is string => !!p);
  if (periodIds.length) {
    const count = await prisma.period.count({ where: { id: { in: periodIds }, schoolId: teacher.schoolId } });
    if (count !== new Set(periodIds).size) throw AppError.validation("Periods must belong to the same school");
  }
  await prisma.$transaction([
    prisma.teacherAvailability.deleteMany({ where: { teacherId } }),
    prisma.teacherAvailability.createMany({ data: entries.map((e) => ({ teacherId, dayOfWeek: e.dayOfWeek, periodId: e.periodId ?? null, type: e.type, note: e.note ?? null })) }),
  ]);
  await audit({ user: actor, schoolId: teacher.schoolId, action: "teacher.availability.set", entityType: "Teacher", entityId: teacherId, metadata: { entries: entries.length } });
  return prisma.teacherAvailability.findMany({ where: { teacherId }, include: { period: true }, orderBy: [{ dayOfWeek: "asc" }] });
}

// ───────────── Duties ─────────────

export async function addDuty(actor: AuthUser, teacherId: string, input: z.infer<typeof dutySchema>) {
  assertPermission(actor, "teachers:manage");
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
  if (!teacher) throw AppError.notFound("Teacher");
  assertSchoolAccess(actor, teacher.schoolId);
  const duty = await prisma.teacherDuty.create({ data: { schoolId: teacher.schoolId, teacherId, ...input, dayOfWeek: input.dayOfWeek ?? null, periodId: input.periodId ?? null, description: input.description ?? null } });
  await audit({ user: actor, schoolId: teacher.schoolId, action: "teacher.duty.add", entityType: "TeacherDuty", entityId: duty.id, after: duty });
  return duty;
}

export async function removeDuty(actor: AuthUser, dutyId: string) {
  assertPermission(actor, "teachers:manage");
  const duty = await prisma.teacherDuty.findUnique({ where: { id: dutyId } });
  if (!duty) throw AppError.notFound("Duty");
  assertSchoolAccess(actor, duty.schoolId);
  await prisma.teacherDuty.delete({ where: { id: dutyId } });
  await audit({ user: actor, schoolId: duty.schoolId, action: "teacher.duty.remove", entityType: "TeacherDuty", entityId: dutyId, before: duty });
}

// ───────────── Professional development ─────────────

export async function addCertification(actor: AuthUser, teacherId: string, input: z.infer<typeof certificationSchema>) {
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
  if (!teacher) throw AppError.notFound("Teacher");
  assertSchoolAccess(actor, teacher.schoolId);
  if (actor.teacherId !== teacherId) assertPermission(actor, "professional_development:manage");
  const cert = await prisma.certification.create({ data: { schoolId: teacher.schoolId, teacherId, name: input.name, issuer: input.issuer ?? null, issuedAt: input.issuedAt ?? null, expiresAt: input.expiresAt ?? null } });
  await audit({ user: actor, schoolId: teacher.schoolId, action: "certification.add", entityType: "Certification", entityId: cert.id, after: cert });
  return cert;
}

export async function removeCertification(actor: AuthUser, id: string) {
  const cert = await prisma.certification.findUnique({ where: { id } });
  if (!cert) throw AppError.notFound("Certification");
  assertSchoolAccess(actor, cert.schoolId);
  if (actor.teacherId !== cert.teacherId) assertPermission(actor, "professional_development:manage");
  await prisma.certification.delete({ where: { id } });
}

export async function addProfessionalDevelopment(actor: AuthUser, teacherId: string, input: z.infer<typeof professionalDevelopmentSchema>) {
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
  if (!teacher) throw AppError.notFound("Teacher");
  assertSchoolAccess(actor, teacher.schoolId);
  if (actor.teacherId !== teacherId) assertPermission(actor, "professional_development:manage");
  return prisma.professionalDevelopment.create({ data: { schoolId: teacher.schoolId, teacherId, type: input.type, title: input.title, date: input.date ?? null, hours: input.hours ?? null, notes: input.notes ?? null, status: input.status } });
}

/** Certifications expiring within `days` days for a school (used by scheduled jobs). */
export async function listExpiringCertifications(schoolId: string, days: number) {
  const now = new Date();
  const until = new Date(now.getTime() + days * 86_400_000);
  return prisma.certification.findMany({
    where: { schoolId, expiresAt: { gte: now, lte: until } },
    include: { teacher: { include: { user: { select: { id: true, name: true } } } } },
  });
}

/** Simple directory of teachers for pickers (id, name, department). */
export async function teacherDirectory(user: AuthUser) {
  const schoolId = resolveSchoolId(user);
  return prisma.teacher.findMany({
    where: { schoolId, status: { in: ["ACTIVE", "ON_LEAVE"] } },
    select: { id: true, employeeNumber: true, departmentId: true, status: true, user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });
}
