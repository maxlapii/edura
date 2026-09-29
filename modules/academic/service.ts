import { prisma } from "@/lib/db";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import type { z } from "zod";
import type { CreateAcademicYearInput, CreateTermInput, updateAcademicYearSchema, updateTermSchema } from "./schema";

export async function listAcademicYears(user: AuthUser, schoolId?: string) {
  const sid = resolveSchoolId(user, schoolId);
  return prisma.academicYear.findMany({ where: { schoolId: sid }, orderBy: { startDate: "desc" }, include: { terms: { orderBy: { startDate: "asc" } } } });
}

export async function getCurrentAcademicYear(schoolId: string) {
  return (
    (await prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true }, include: { terms: true } })) ??
    (await prisma.academicYear.findFirst({ where: { schoolId }, orderBy: { startDate: "desc" }, include: { terms: true } }))
  );
}

export async function getCurrentTerm(schoolId: string, date = new Date()) {
  const current = await prisma.term.findFirst({ where: { schoolId, isCurrent: true } });
  if (current) return current;
  return prisma.term.findFirst({ where: { schoolId, startDate: { lte: date }, endDate: { gte: date } }, orderBy: { startDate: "desc" } });
}

export async function createAcademicYear(user: AuthUser, input: CreateAcademicYearInput) {
  assertPermission(user, "academic:manage");
  const schoolId = resolveSchoolId(user, input.schoolId);
  const year = await prisma.$transaction(async (tx) => {
    if (input.isCurrent) await tx.academicYear.updateMany({ where: { schoolId }, data: { isCurrent: false } });
    return tx.academicYear.create({ data: { schoolId, name: input.name, startDate: input.startDate, endDate: input.endDate, isCurrent: input.isCurrent } });
  });
  await audit({ user, schoolId, action: "academic_year.create", entityType: "AcademicYear", entityId: year.id, after: year });
  return year;
}

export async function updateAcademicYear(user: AuthUser, id: string, input: z.infer<typeof updateAcademicYearSchema>) {
  assertPermission(user, "academic:manage");
  const before = await prisma.academicYear.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Academic year");
  assertSchoolAccess(user, before.schoolId);
  const start = input.startDate ?? before.startDate;
  const end = input.endDate ?? before.endDate;
  if (end <= start) throw AppError.validation("endDate must be after startDate");
  const year = await prisma.$transaction(async (tx) => {
    if (input.isCurrent) await tx.academicYear.updateMany({ where: { schoolId: before.schoolId, id: { not: id } }, data: { isCurrent: false } });
    return tx.academicYear.update({ where: { id }, data: input });
  });
  await audit({ user, schoolId: before.schoolId, action: "academic_year.update", entityType: "AcademicYear", entityId: id, before, after: year });
  return year;
}

export async function createTerm(user: AuthUser, input: CreateTermInput) {
  assertPermission(user, "academic:manage");
  const year = await prisma.academicYear.findUnique({ where: { id: input.academicYearId } });
  if (!year) throw AppError.notFound("Academic year");
  assertSchoolAccess(user, year.schoolId);
  if (input.startDate < year.startDate || input.endDate > year.endDate) {
    throw AppError.validation("Term must fall within the academic year");
  }
  const term = await prisma.$transaction(async (tx) => {
    if (input.isCurrent) await tx.term.updateMany({ where: { schoolId: year.schoolId }, data: { isCurrent: false } });
    return tx.term.create({ data: { schoolId: year.schoolId, academicYearId: year.id, name: input.name, startDate: input.startDate, endDate: input.endDate, isCurrent: input.isCurrent } });
  });
  await audit({ user, schoolId: year.schoolId, action: "term.create", entityType: "Term", entityId: term.id, after: term });
  return term;
}

export async function updateTerm(user: AuthUser, id: string, input: z.infer<typeof updateTermSchema>) {
  assertPermission(user, "academic:manage");
  const before = await prisma.term.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Term");
  assertSchoolAccess(user, before.schoolId);
  const term = await prisma.$transaction(async (tx) => {
    if (input.isCurrent) await tx.term.updateMany({ where: { schoolId: before.schoolId, id: { not: id } }, data: { isCurrent: false } });
    return tx.term.update({ where: { id }, data: input });
  });
  await audit({ user, schoolId: before.schoolId, action: "term.update", entityType: "Term", entityId: id, before, after: term });
  return term;
}

export async function listTerms(user: AuthUser, academicYearId?: string) {
  const schoolId = resolveSchoolId(user);
  return prisma.term.findMany({ where: { schoolId, academicYearId }, orderBy: { startDate: "asc" } });
}
