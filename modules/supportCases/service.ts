import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, hasPermission, isAdmin, isStaffLike, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { accessibleStudentWhere, assertStudentAccess, canAccessStudent } from "@/modules/students/service";
import type {
  AddSupportCaseNoteInput,
  AssignSupportCaseInput,
  CreateSupportCaseInput,
  ListSupportCasesQuery,
  SupportCaseStatusChangeInput,
  UpdateSupportCaseInput,
} from "./schema";

const listInclude = {
  student: { select: { id: true, schoolId: true, firstName: true, lastName: true, studentNumber: true, classId: true, class: { select: { id: true, name: true } } } },
  assignedTo: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
  _count: { select: { notes: true } },
} satisfies Prisma.SupportCaseInclude;

const detailInclude = {
  ...listInclude,
  notes: { include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.SupportCaseInclude;

type CaseLike = { isSensitive: boolean; createdByUserId: string; assignedToUserId: string | null };

/** Students and parents never see support cases. */
function assertStaffOnly(user: AuthUser) {
  if (user.role === "STUDENT" || user.role === "PARENT" || !isStaffLike(user)) throw AppError.forbidden("Support cases are only visible to school staff");
}

/** Sensitive content is visible to support_cases:read_sensitive holders, the creator and the assignee. */
export function canViewSensitive(user: AuthUser, c: CaseLike): boolean {
  if (!c.isSensitive) return true;
  return hasPermission(user, "support_cases:read_sensitive") || c.createdByUserId === user.id || c.assignedToUserId === user.id;
}

function redact<T extends CaseLike & { description: string | null; notes?: unknown[] }>(user: AuthUser, c: T) {
  if (canViewSensitive(user, c)) return { ...c, redacted: false };
  return { ...c, description: null, notes: [] as T["notes"], redacted: true };
}

function canManageCase(user: AuthUser, c: CaseLike): boolean {
  return isAdmin(user) || c.createdByUserId === user.id || c.assignedToUserId === user.id;
}

async function validateAssignee(schoolId: string, userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, schoolId: true, role: true, isActive: true } });
  if (!u || u.schoolId !== schoolId || !u.isActive) throw AppError.validation("Assignee must be an active user of the same school");
  if (!isStaffLike(u)) throw AppError.validation("Support cases can only be assigned to school staff");
  return u;
}

async function loadCase(user: AuthUser, id: string) {
  const c = await prisma.supportCase.findUnique({ where: { id }, include: detailInclude });
  if (!c) throw AppError.notFound("Support case");
  assertSchoolAccess(user, c.schoolId);
  return c;
}

async function createFollowUpTask(user: AuthUser, c: { id: string; schoolId: string; title: string; studentId: string; assignedToUserId: string | null; followUpDate: Date | null }) {
  if (!c.assignedToUserId || !c.followUpDate) return null;
  return prisma.task.create({
    data: {
      schoolId: c.schoolId,
      title: `Follow up support case: ${c.title}`,
      description: `Student support follow-up. See /students/${c.studentId}`,
      assigneeUserId: c.assignedToUserId,
      createdByUserId: user.id,
      dueDate: c.followUpDate,
      priority: "MEDIUM",
      source: "STUDENT_SUPPORT",
      sourceId: c.id,
    },
  });
}

async function notifyAssignee(c: { id: string; schoolId: string; title: string; studentId: string; assignedToUserId: string | null; category: string }) {
  if (!c.assignedToUserId) return;
  await notify({
    schoolId: c.schoolId,
    userId: c.assignedToUserId,
    type: "GENERIC",
    title: `Support case assigned: ${c.title}`,
    body: `A ${c.category.toLowerCase()} support case has been assigned to you.`,
    link: `/students/${c.studentId}`,
  });
}

export async function createSupportCase(user: AuthUser, input: CreateSupportCaseInput) {
  assertPermission(user, "support_cases:manage");
  assertStaffOnly(user);
  const student = await assertStudentAccess(user, input.studentId);
  const schoolId = resolveSchoolId(user, student.schoolId);
  if (input.assignedToUserId) await validateAssignee(schoolId, input.assignedToUserId);
  const c = await prisma.supportCase.create({
    data: {
      schoolId,
      studentId: student.id,
      category: input.category,
      title: input.title,
      description: input.description ?? null,
      isSensitive: input.isSensitive,
      assignedToUserId: input.assignedToUserId ?? null,
      createdByUserId: user.id,
      status: input.assignedToUserId ? "ASSIGNED" : "OPEN",
      followUpDate: input.followUpDate ?? null,
    },
    include: detailInclude,
  });
  await audit({ user, schoolId, action: "support_case.create", entityType: "SupportCase", entityId: c.id, after: { ...c, description: c.isSensitive ? "[sensitive]" : c.description } });
  if (c.assignedToUserId && c.assignedToUserId !== user.id) await notifyAssignee(c);
  await createFollowUpTask(user, c);
  return redact(user, c);
}

export async function getSupportCase(user: AuthUser, id: string) {
  assertPermission(user, "support_cases:read");
  assertStaffOnly(user);
  const c = await loadCase(user, id);
  if (!canManageCase(user, c) && !(await canAccessStudent(user, c.student))) throw AppError.forbidden("You do not have access to this support case");
  return redact(user, c);
}

/** Teachers see cases they created, are assigned to, or that belong to students they can access. */
export async function listSupportCases(user: AuthUser, query: ListSupportCasesQuery = {}) {
  assertPermission(user, "support_cases:read");
  assertStaffOnly(user);
  const schoolId = resolveSchoolId(user);
  const where: Prisma.SupportCaseWhereInput = {
    schoolId,
    studentId: query.studentId,
    status: query.status,
    category: query.category,
    assignedToUserId: query.assignedToUserId,
  };
  if (!isAdmin(user)) {
    where.OR = [{ createdByUserId: user.id }, { assignedToUserId: user.id }, { student: await accessibleStudentWhere(user, schoolId) }];
  }
  const items = await prisma.supportCase.findMany({ where, include: listInclude, orderBy: [{ status: "asc" }, { followUpDate: "asc" }, { createdAt: "desc" }], take: 500 });
  return items.map((c) => redact(user, c));
}

export async function addSupportCaseNote(user: AuthUser, id: string, input: AddSupportCaseNoteInput) {
  assertPermission(user, "support_cases:manage");
  assertStaffOnly(user);
  const before = await loadCase(user, id);
  if (!canManageCase(user, before)) throw AppError.forbidden("Only the creator, the assignee or an administrator can add notes");
  const note = await prisma.$transaction(async (tx) => {
    const n = await tx.supportCaseNote.create({ data: { caseId: id, authorUserId: user.id, body: input.body, followUpDate: input.followUpDate ?? null } });
    if (input.followUpDate) {
      await tx.supportCase.update({ where: { id }, data: { followUpDate: input.followUpDate, status: before.status === "RESOLVED" ? before.status : "FOLLOW_UP" } });
    }
    return n;
  });
  await audit({ user, schoolId: before.schoolId, action: "support_case.note", entityType: "SupportCase", entityId: id, metadata: { noteId: note.id, followUpDate: input.followUpDate ?? null } });
  if (input.followUpDate && before.assignedToUserId) {
    await createFollowUpTask(user, { ...before, followUpDate: input.followUpDate });
  }
  return note;
}

export async function assignSupportCase(user: AuthUser, id: string, input: AssignSupportCaseInput) {
  assertPermission(user, "support_cases:manage");
  assertStaffOnly(user);
  const before = await loadCase(user, id);
  if (!isAdmin(user) && before.createdByUserId !== user.id) throw AppError.forbidden("Only the creator or an administrator can assign a support case");
  await validateAssignee(before.schoolId, input.assignedToUserId);
  const c = await prisma.supportCase.update({
    where: { id },
    data: { assignedToUserId: input.assignedToUserId, status: before.status === "OPEN" ? "ASSIGNED" : before.status },
    include: detailInclude,
  });
  await audit({ user, schoolId: before.schoolId, action: "support_case.assign", entityType: "SupportCase", entityId: id, metadata: { from: before.assignedToUserId, to: input.assignedToUserId } });
  if (before.assignedToUserId !== c.assignedToUserId) {
    if (c.assignedToUserId !== user.id) await notifyAssignee(c);
    await createFollowUpTask(user, c);
  }
  return redact(user, c);
}

export async function updateSupportCaseStatus(user: AuthUser, id: string, input: SupportCaseStatusChangeInput) {
  assertPermission(user, "support_cases:manage");
  assertStaffOnly(user);
  const before = await loadCase(user, id);
  if (!canManageCase(user, before)) throw AppError.forbidden();
  const c = await prisma.supportCase.update({
    where: { id },
    data: { status: input.status, resolvedAt: input.status === "RESOLVED" ? (before.resolvedAt ?? new Date()) : null },
    include: detailInclude,
  });
  await audit({ user, schoolId: before.schoolId, action: "support_case.status", entityType: "SupportCase", entityId: id, metadata: { from: before.status, to: input.status } });
  return redact(user, c);
}

export async function updateSupportCase(user: AuthUser, id: string, input: UpdateSupportCaseInput) {
  assertPermission(user, "support_cases:manage");
  assertStaffOnly(user);
  const before = await loadCase(user, id);
  if (!canManageCase(user, before)) throw AppError.forbidden();
  const c = await prisma.supportCase.update({ where: { id }, data: input, include: detailInclude });
  const mask = (x: typeof before | typeof c) => ({ ...x, notes: undefined, description: x.isSensitive ? "[sensitive]" : x.description });
  await audit({ user, schoolId: before.schoolId, action: "support_case.update", entityType: "SupportCase", entityId: id, before: mask(before), after: mask(c) });
  return redact(user, c);
}
