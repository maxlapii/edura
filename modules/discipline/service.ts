import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, hasPermission, isAdmin, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { toDateOnly } from "@/lib/utils/dates";
import { accessibleStudentWhere, assertStudentAccess, guardianUserIdsForStudent } from "@/modules/students/service";
import type { CreateIncidentInput, ListIncidentsQuery, UpdateIncidentInput } from "./schema";

const include = {
  student: { select: { id: true, firstName: true, lastName: true, studentNumber: true, classId: true, class: { select: { id: true, name: true } } } },
  reportedBy: { select: { id: true, name: true } },
} satisfies Prisma.DisciplineIncidentInclude;

function isStudentOrParent(user: AuthUser) {
  return user.role === "STUDENT" || user.role === "PARENT";
}

async function notifyGuardians(incident: { id: string; schoolId: string; studentId: string; date: Date; student: { firstName: string; lastName: string } }) {
  const guardianIds = await guardianUserIdsForStudent(incident.studentId);
  if (!guardianIds.length) return;
  await notifyMany(guardianIds, {
    schoolId: incident.schoolId,
    type: "GENERIC",
    title: "Behaviour incident recorded",
    body: `A behaviour incident involving ${incident.student.firstName} ${incident.student.lastName} was recorded on ${incident.date.toISOString().slice(0, 10)}. Please contact the school for details.`,
    link: `/students/${incident.studentId}`,
  });
}

export async function createIncident(user: AuthUser, input: CreateIncidentInput) {
  assertPermission(user, "discipline:manage");
  const student = await assertStudentAccess(user, input.studentId);
  const schoolId = resolveSchoolId(user, student.schoolId);
  const incident = await prisma.disciplineIncident.create({
    data: {
      schoolId,
      studentId: student.id,
      category: input.category,
      date: toDateOnly(input.date),
      severity: input.severity,
      description: input.description,
      reportedByUserId: user.id,
      actions: input.actions ?? null,
      parentNotified: input.parentNotified,
      followUp: input.followUp ?? null,
    },
    include,
  });
  await audit({ user, schoolId, action: "discipline.create", entityType: "DisciplineIncident", entityId: incident.id, after: incident });
  if (incident.parentNotified) await notifyGuardians(incident);
  return incident;
}

/** Incidents are never deleted; the creator or an administrator may correct them and every change is audited. */
export async function updateIncident(user: AuthUser, id: string, input: UpdateIncidentInput) {
  assertPermission(user, "discipline:manage");
  const before = await prisma.disciplineIncident.findUnique({ where: { id }, include });
  if (!before) throw AppError.notFound("Discipline incident");
  assertSchoolAccess(user, before.schoolId);
  if (before.reportedByUserId !== user.id && !isAdmin(user)) throw AppError.forbidden("Only the reporting staff member or an administrator can update an incident");
  const { date, ...rest } = input;
  const incident = await prisma.disciplineIncident.update({ where: { id }, data: { ...rest, date: date ? toDateOnly(date) : undefined }, include });
  await audit({ user, schoolId: before.schoolId, action: "discipline.update", entityType: "DisciplineIncident", entityId: id, before, after: incident });
  if (!before.parentNotified && incident.parentNotified) await notifyGuardians(incident);
  return incident;
}

export async function getIncident(user: AuthUser, id: string) {
  const incident = await prisma.disciplineIncident.findUnique({ where: { id }, include });
  if (!incident) throw AppError.notFound("Discipline incident");
  assertSchoolAccess(user, incident.schoolId);
  if (!isStudentOrParent(user)) assertPermission(user, "discipline:read");
  if (!isAdmin(user)) await assertStudentAccess(user, incident.studentId);
  return incident;
}

/**
 * Staff: scoped to students they can access (admins: whole school).
 * Students/parents: only for their own student, and only when `studentId` is given.
 */
export async function listIncidents(user: AuthUser, query: ListIncidentsQuery = {}) {
  const schoolId = resolveSchoolId(user);
  if (isStudentOrParent(user)) {
    if (!query.studentId) throw AppError.forbidden("Students and parents must specify a student");
    await assertStudentAccess(user, query.studentId);
  } else if (!hasPermission(user, "discipline:read")) {
    throw AppError.forbidden("Missing permission: discipline:read");
  }
  const where: Prisma.DisciplineIncidentWhereInput = {
    schoolId,
    studentId: query.studentId,
    severity: query.severity,
    date: query.from || query.to ? { gte: query.from ? toDateOnly(query.from) : undefined, lte: query.to ? toDateOnly(query.to) : undefined } : undefined,
    student: await accessibleStudentWhere(user, schoolId),
  };
  return prisma.disciplineIncident.findMany({ where, include, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 500 });
}
