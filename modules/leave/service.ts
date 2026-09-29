import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, hasPermission, isAdmin, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { dispatch } from "@/lib/workflows/engine";
import { inclusiveDays, rangesOverlap, toDateOnly, workingDays } from "@/lib/utils/dates";
import { affectedSlotDates } from "./impact";
import { buildCandidates, createSubstitutionNeed } from "@/modules/substitution/service";
import type { CreateLeaveRequestInput } from "./schema";

const include = {
  requester: { select: { id: true, name: true, email: true, role: true } },
  teacher: { include: { user: { select: { id: true, name: true } }, department: { select: { id: true, name: true } } } },
  reviewedBy: { select: { id: true, name: true } },
  substitutions: { include: { substituteTeacher: { include: { user: { select: { id: true, name: true } } } }, timetableSlot: { include: { period: true, course: { include: { subject: { select: { name: true } }, class: { select: { id: true, name: true } } } } } } } },
} satisfies Prisma.LeaveRequestInclude;

export async function createLeaveRequest(user: AuthUser, input: CreateLeaveRequestInput) {
  assertPermission(user, "leave:request");
  const schoolId = resolveSchoolId(user);
  let teacherId = user.teacherId ?? null;
  let requesterUserId = user.id;
  if (input.teacherId && input.teacherId !== user.teacherId) {
    assertPermission(user, "leave:review");
    const t = await prisma.teacher.findUnique({ where: { id: input.teacherId } });
    if (!t || t.schoolId !== schoolId) throw AppError.validation("Teacher must belong to the same school");
    teacherId = t.id;
    requesterUserId = t.userId;
  }
  const overlapping = await prisma.leaveRequest.findFirst({ where: { requesterUserId, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: input.endDate }, endDate: { gte: input.startDate } } });
  if (overlapping) throw AppError.conflict("An overlapping leave request already exists");
  const leave = await prisma.$transaction(async (tx) => {
    const l = await tx.leaveRequest.create({ data: { schoolId, requesterUserId, teacherId, type: input.type, startDate: input.startDate, endDate: input.endDate, reason: input.reason ?? null }, include });
    await tx.approval.create({ data: { schoolId, type: "LEAVE", entityType: "LeaveRequest", entityId: l.id, title: `${l.requester.name}: ${l.type} leave ${l.startDate.toISOString().slice(0, 10)} → ${l.endDate.toISOString().slice(0, 10)}`, requesterUserId } });
    return l;
  });
  await audit({ user, schoolId, action: "leave.request", entityType: "LeaveRequest", entityId: leave.id, after: leave });
  await dispatch("LEAVE_REQUESTED", schoolId, {
    sourceId: leave.id,
    leaveRequestId: leave.id,
    requesterUserId,
    requesterName: leave.requester.name,
    leaveType: leave.type,
    startDate: leave.startDate,
    endDate: leave.endDate,
    days: inclusiveDays(leave.startDate, leave.endDate),
  });
  return leave;
}

export async function listLeaveRequests(user: AuthUser, filter: { status?: string; from?: Date; to?: Date; scope?: "mine" | "all" } = {}) {
  const schoolId = resolveSchoolId(user);
  const where: Prisma.LeaveRequestWhereInput = { schoolId, status: filter.status as Prisma.LeaveRequestWhereInput["status"] };
  if (filter.from || filter.to) where.AND = [{ startDate: { lte: filter.to } }, { endDate: { gte: filter.from } }];
  if (filter.scope === "all" && hasPermission(user, "leave:read_all")) {
    if (user.role === "DEPARTMENT_HEAD") where.teacher = { departmentId: user.departmentId ?? "__none__" };
  } else {
    where.requesterUserId = user.id;
  }
  return prisma.leaveRequest.findMany({ where, include, orderBy: { startDate: "desc" }, take: 300 });
}

/** Leave request with impact analysis (affected lessons, students, suggested substitutes). */
export async function getLeaveRequest(user: AuthUser, id: string) {
  const leave = await prisma.leaveRequest.findUnique({ where: { id }, include });
  if (!leave) throw AppError.notFound("Leave request");
  assertSchoolAccess(user, leave.schoolId);
  const isOwner = leave.requesterUserId === user.id;
  if (!isOwner) {
    assertPermission(user, "leave:read_all");
    if (user.role === "DEPARTMENT_HEAD" && leave.teacher?.departmentId !== user.departmentId) throw AppError.forbidden();
  }
  const impact = await leaveImpact(leave, hasPermission(user, "leave:review"));
  return { ...leave, impact };
}

export async function leaveImpact(leave: { id: string; schoolId: string; teacherId: string | null; startDate: Date; endDate: Date; status: string }, withSuggestions: boolean) {
  if (!leave.teacherId) return { lessons: 0, days: inclusiveDays(leave.startDate, leave.endDate), workingDays: workingDays(leave.startDate, leave.endDate), affected: [], studentsAffected: 0, classesAffected: 0 };
  const slots = await prisma.timetableSlot.findMany({ where: { teacherId: leave.teacherId }, include: { period: true, room: { select: { name: true } }, course: { include: { subject: { select: { id: true, name: true, departmentId: true } }, class: { select: { id: true, name: true, _count: { select: { students: true } } } } } } } });
  const hits = affectedSlotDates(slots, leave.startDate, leave.endDate);
  const existing = await prisma.substitution.findMany({ where: { leaveRequestId: leave.id }, include: { substituteTeacher: { include: { user: { select: { id: true, name: true } } } } } });
  const affected = [];
  for (const hit of hits) {
    const slot = slots.find((s) => s.id === hit.slotId)!;
    const sub = existing.find((e) => e.timetableSlotId === slot.id && e.date.getTime() === hit.date.getTime()) ?? null;
    let suggestions: Awaited<ReturnType<typeof buildCandidates>>["ranked"] = [];
    if (withSuggestions && (!sub || sub.status === "PENDING")) {
      suggestions = (await buildCandidates(leave.schoolId, slot, hit.date, sub?.id)).ranked.filter((c) => c.eligible).slice(0, 5);
    }
    affected.push({ date: hit.date, slot: { id: slot.id, dayOfWeek: slot.dayOfWeek, period: slot.period, room: slot.room, course: slot.course }, substitution: sub, suggestions });
  }
  const classIds = new Set(hits.map((h) => slots.find((s) => s.id === h.slotId)!.course.class.id));
  const studentsAffected = [...classIds].reduce((sum, id) => sum + (slots.find((s) => s.course.class.id === id)?.course.class._count.students ?? 0), 0);
  return { lessons: hits.length, days: inclusiveDays(leave.startDate, leave.endDate), workingDays: workingDays(leave.startDate, leave.endDate), affected, studentsAffected, classesAffected: classIds.size };
}

/** Approve or reject. Approval creates PENDING substitution needs for each affected lesson. */
export async function reviewLeaveRequest(user: AuthUser, id: string, action: "APPROVE" | "REJECT", comment?: string | null) {
  assertPermission(user, "leave:review");
  const leave = await prisma.leaveRequest.findUnique({ where: { id }, include });
  if (!leave) throw AppError.notFound("Leave request");
  assertSchoolAccess(user, leave.schoolId);
  if (leave.status !== "PENDING") throw AppError.conflict(`Leave request is already ${leave.status}`);
  if (leave.requesterUserId === user.id) throw AppError.forbidden("You cannot review your own leave request");
  const status = action === "APPROVE" ? "APPROVED" : "REJECTED";
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const l = await tx.leaveRequest.update({ where: { id }, data: { status, reviewedById: user.id, reviewedAt: now, reviewComment: comment ?? null }, include });
    await tx.approval.updateMany({ where: { entityType: "LeaveRequest", entityId: id, status: "PENDING" }, data: { status, approverUserId: user.id, decisionAt: now, comment: comment ?? null } });
    if (status === "APPROVED" && l.teacherId) {
      const slots = await tx.timetableSlot.findMany({ where: { teacherId: l.teacherId }, select: { id: true, dayOfWeek: true } });
      for (const hit of affectedSlotDates(slots, l.startDate, l.endDate)) {
        await createSubstitutionNeed(l.schoolId, hit.slotId, hit.date, l.id, null, tx);
      }
      const today = toDateOnly(new Date());
      if (rangesOverlap(l.startDate, l.endDate, today, today)) await tx.teacher.update({ where: { id: l.teacherId }, data: { status: "ON_LEAVE" } });
    }
    return l;
  });
  await audit({ user, schoolId: leave.schoolId, action: `leave.${action.toLowerCase()}`, entityType: "LeaveRequest", entityId: id, before: leave, after: updated });
  const impact = await leaveImpact(updated, false);
  if (status === "APPROVED") {
    await dispatch("LEAVE_APPROVED", leave.schoolId, {
      sourceId: id,
      leaveRequestId: id,
      requesterUserId: leave.requesterUserId,
      requesterName: leave.requester.name,
      teacherId: leave.teacherId,
      startDate: leave.startDate,
      endDate: leave.endDate,
      affectedLessons: impact.lessons,
      reviewerName: user.name,
    });
  } else {
    await notify({ schoolId: leave.schoolId, userId: leave.requesterUserId, type: "LEAVE_REJECTED", title: "Your leave request was not approved", body: comment ?? undefined, link: `/leave/${id}`, email: true });
  }
  return { ...updated, impact };
}

export async function cancelLeaveRequest(user: AuthUser, id: string) {
  const leave = await prisma.leaveRequest.findUnique({ where: { id }, include });
  if (!leave) throw AppError.notFound("Leave request");
  assertSchoolAccess(user, leave.schoolId);
  if (leave.requesterUserId !== user.id && !hasPermission(user, "leave:review")) throw AppError.forbidden();
  if (leave.status === "CANCELLED" || leave.status === "REJECTED") throw AppError.conflict(`Leave request is ${leave.status}`);
  const updated = await prisma.$transaction(async (tx) => {
    const l = await tx.leaveRequest.update({ where: { id }, data: { status: "CANCELLED" }, include });
    await tx.approval.updateMany({ where: { entityType: "LeaveRequest", entityId: id, status: "PENDING" }, data: { status: "CANCELLED", decisionAt: new Date() } });
    await tx.substitution.updateMany({ where: { leaveRequestId: id, status: { in: ["PENDING", "ASSIGNED"] } }, data: { status: "CANCELLED" } });
    if (l.teacherId) {
      const stillOnLeave = await tx.leaveRequest.findFirst({ where: { teacherId: l.teacherId, status: "APPROVED", startDate: { lte: toDateOnly(new Date()) }, endDate: { gte: toDateOnly(new Date()) } } });
      if (!stillOnLeave) await tx.teacher.update({ where: { id: l.teacherId }, data: { status: "ACTIVE" } });
    }
    return l;
  });
  await audit({ user, schoolId: leave.schoolId, action: "leave.cancel", entityType: "LeaveRequest", entityId: id, before: leave, after: updated });
  for (const sub of leave.substitutions) {
    if (sub.substituteTeacher) await notify({ schoolId: leave.schoolId, userId: sub.substituteTeacher.user.id, type: "GENERIC", title: "Substitution cancelled", body: `${leave.requester.name}'s leave was cancelled; you no longer need to cover ${sub.timetableSlot.course.subject.name} on ${sub.date.toISOString().slice(0, 10)}.` });
  }
  return updated;
}

/** Teachers absent (on approved leave) on a date. */
export async function absentTeachers(schoolId: string, date = new Date()) {
  const d = toDateOnly(date);
  return prisma.leaveRequest.findMany({ where: { schoolId, status: "APPROVED", teacherId: { not: null }, startDate: { lte: d }, endDate: { gte: d } }, include: { teacher: { include: { user: { select: { id: true, name: true } }, department: { select: { name: true } } } } } });
}

/** Daily job: keep Teacher.status in sync with approved leave. */
export async function syncTeacherLeaveStatus(schoolId: string, date = new Date()) {
  const d = toDateOnly(date);
  const onLeave = await prisma.leaveRequest.findMany({ where: { schoolId, status: "APPROVED", teacherId: { not: null }, startDate: { lte: d }, endDate: { gte: d } }, select: { teacherId: true } });
  const ids = onLeave.map((l) => l.teacherId!).filter(Boolean);
  const [a, b] = await Promise.all([
    prisma.teacher.updateMany({ where: { schoolId, id: { in: ids }, status: "ACTIVE" }, data: { status: "ON_LEAVE" } }),
    prisma.teacher.updateMany({ where: { schoolId, id: { notIn: ids }, status: "ON_LEAVE" }, data: { status: "ACTIVE" } }),
  ]);
  return { markedOnLeave: a.count, markedActive: b.count };
}

export function isAdminUser(user: AuthUser) {
  return isAdmin(user);
}
