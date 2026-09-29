import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, isAdmin, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { dayOfWeek, toDateOnly } from "@/lib/utils/dates";
import { addDays, startOfWeek } from "date-fns";
import { computeWorkload } from "@/modules/timetable/workload";
import { classRoster } from "@/modules/students/service";
import { rankSubstitutes, type CandidateTeacher, type SlotNeed } from "./eligibility";

const include = {
  timetableSlot: { include: { period: true, room: { select: { id: true, name: true } }, course: { include: { subject: { select: { id: true, name: true, departmentId: true } }, class: { select: { id: true, name: true } } } } } },
  absentTeacher: { include: { user: { select: { id: true, name: true } } } },
  substituteTeacher: { include: { user: { select: { id: true, name: true } } } },
  leaveRequest: { select: { id: true, type: true, startDate: true, endDate: true, status: true } },
} satisfies Prisma.SubstitutionInclude;

export async function listSubstitutions(user: AuthUser, filter: { from?: Date; to?: Date; status?: string; teacherId?: string } = {}) {
  assertPermission(user, "substitution:read");
  const schoolId = resolveSchoolId(user);
  const where: Prisma.SubstitutionWhereInput = { schoolId, status: filter.status as Prisma.SubstitutionWhereInput["status"], date: { gte: filter.from, lte: filter.to } };
  if (!isAdmin(user)) {
    const tid = user.teacherId ?? "__none__";
    where.OR = [{ absentTeacherId: tid }, { substituteTeacherId: tid }];
    if (user.role === "DEPARTMENT_HEAD") where.OR.push({ absentTeacher: { departmentId: user.departmentId ?? "__none__" } });
  } else if (filter.teacherId) {
    where.OR = [{ absentTeacherId: filter.teacherId }, { substituteTeacherId: filter.teacherId }];
  }
  return prisma.substitution.findMany({ where, include, orderBy: [{ date: "asc" }, { timetableSlot: { period: { order: "asc" } } }], take: 500 });
}

export async function getSubstitution(user: AuthUser, id: string) {
  assertPermission(user, "substitution:read");
  const sub = await prisma.substitution.findUnique({ where: { id }, include });
  if (!sub) throw AppError.notFound("Substitution");
  assertSchoolAccess(user, sub.schoolId);
  if (!isAdmin(user) && user.teacherId !== sub.absentTeacherId && user.teacherId !== sub.substituteTeacherId && user.role !== "DEPARTMENT_HEAD") throw AppError.forbidden();
  return sub;
}

/** Creates a PENDING substitution need for a slot on a date (idempotent per slot/date). */
export async function createSubstitutionNeed(schoolId: string, timetableSlotId: string, date: Date, leaveRequestId?: string | null, note?: string | null, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const slot = await tx.timetableSlot.findUnique({ where: { id: timetableSlotId } });
  if (!slot || slot.schoolId !== schoolId) throw AppError.notFound("Timetable slot");
  const d = toDateOnly(date);
  if (dayOfWeek(d) !== slot.dayOfWeek) throw AppError.validation("Date does not fall on the slot's weekday");
  return tx.substitution.upsert({
    where: { timetableSlotId_date: { timetableSlotId, date: d } },
    update: { leaveRequestId: leaveRequestId ?? undefined, note: note ?? undefined },
    create: { schoolId, timetableSlotId, date: d, absentTeacherId: slot.teacherId, leaveRequestId: leaveRequestId ?? null, note: note ?? null, status: "PENDING" },
  });
}

export async function createSubstitution(user: AuthUser, input: { timetableSlotId: string; date: Date; leaveRequestId?: string | null; note?: string | null }) {
  assertPermission(user, "substitution:manage");
  const schoolId = resolveSchoolId(user);
  const sub = await createSubstitutionNeed(schoolId, input.timetableSlotId, input.date, input.leaveRequestId, input.note);
  await audit({ user, schoolId, action: "substitution.create", entityType: "Substitution", entityId: sub.id, after: sub });
  return prisma.substitution.findUniqueOrThrow({ where: { id: sub.id }, include });
}

/** Builds candidate data for every active teacher in the school for a given slot/date. */
export async function buildCandidates(schoolId: string, slot: { dayOfWeek: number; periodId: string; teacherId: string; course: { subjectId: string; subject: { departmentId: string | null } } }, date: Date, excludeSubstitutionId?: string) {
  const d = toDateOnly(date);
  const weekStart = toDateOnly(startOfWeek(d, { weekStartsOn: 1 }));
  const weekEnd = toDateOnly(addDays(weekStart, 6));
  const teachers = await prisma.teacher.findMany({
    where: { schoolId },
    include: {
      user: { select: { name: true } },
      subjects: { select: { subjectId: true } },
      availability: { select: { dayOfWeek: true, periodId: true, type: true } },
      timetableSlots: { select: { dayOfWeek: true, periodId: true, classId: true, courseId: true, course: { select: { subjectId: true } } } },
      substitutions: { where: { date: { gte: weekStart, lte: weekEnd }, status: { in: ["ASSIGNED", "COMPLETED"] }, NOT: excludeSubstitutionId ? { id: excludeSubstitutionId } : undefined }, select: { date: true, timetableSlot: { select: { dayOfWeek: true, periodId: true } } } },
      leaveRequests: { where: { status: "APPROVED", startDate: { lte: d }, endDate: { gte: d } }, select: { id: true } },
      duties: { select: { weeklyHours: true } },
      homeroomClasses: { select: { id: true } },
    },
  });
  const need: SlotNeed = { dayOfWeek: slot.dayOfWeek, periodId: slot.periodId, subjectId: slot.course.subjectId, departmentId: slot.course.subject.departmentId, absentTeacherId: slot.teacherId };
  const candidates: CandidateTeacher[] = teachers.map((t) => {
    const workload = computeWorkload({
      teachingSlots: t.timetableSlots.map((s) => ({ courseId: s.courseId, classId: s.classId, subjectId: s.course.subjectId })),
      duties: t.duties,
      substitutionPeriods: t.substitutions.length,
      meetingHours: 0,
      homeroomClasses: t.homeroomClasses.length,
      leaveDays: 0,
      maxWeeklyPeriods: t.maxWeeklyPeriods,
    });
    return {
      id: t.id,
      name: t.user.name,
      status: t.status,
      subjectIds: t.subjects.map((s) => s.subjectId),
      departmentId: t.departmentId,
      busyKeys: new Set(t.timetableSlots.map((s) => `${s.dayOfWeek}:${s.periodId}`)),
      substitutionKeys: new Set(t.substitutions.filter((s) => s.date.getTime() === d.getTime()).map((s) => `${s.timetableSlot.dayOfWeek}:${s.timetableSlot.periodId}`)),
      onLeave: t.leaveRequests.length > 0,
      availability: t.availability,
      substitutionsThisWeek: t.substitutions.length,
      utilization: workload.utilization,
    };
  });
  return { need, ranked: rankSubstitutes(candidates, need) };
}

/** Transparent, ranked list of substitute candidates for a substitution need. */
export async function suggestSubstitutes(user: AuthUser, substitutionId: string) {
  assertPermission(user, "substitution:manage");
  const sub = await prisma.substitution.findUnique({ where: { id: substitutionId }, include });
  if (!sub) throw AppError.notFound("Substitution");
  assertSchoolAccess(user, sub.schoolId);
  const { need, ranked } = await buildCandidates(sub.schoolId, sub.timetableSlot, sub.date, sub.id);
  return { substitution: sub, need, candidates: ranked };
}

/** Assigns a substitute after re-validating every hard constraint server-side. */
export async function assignSubstitute(user: AuthUser, substitutionId: string, substituteTeacherId: string, note?: string | null) {
  assertPermission(user, "substitution:manage");
  const sub = await prisma.substitution.findUnique({ where: { id: substitutionId }, include });
  if (!sub) throw AppError.notFound("Substitution");
  assertSchoolAccess(user, sub.schoolId);
  if (sub.status === "CANCELLED" || sub.status === "COMPLETED") throw AppError.conflict(`Substitution is ${sub.status}`);
  const teacher = await prisma.teacher.findUnique({ where: { id: substituteTeacherId }, include: { user: { select: { id: true, name: true } } } });
  if (!teacher || teacher.schoolId !== sub.schoolId) throw AppError.validation("Substitute must belong to the same school");
  const { ranked } = await buildCandidates(sub.schoolId, sub.timetableSlot, sub.date, sub.id);
  const candidate = ranked.find((c) => c.teacherId === substituteTeacherId);
  if (!candidate) throw AppError.notFound("Candidate");
  if (!candidate.eligible) throw AppError.conflict("Substitute has a conflict", candidate.conflicts);

  const updated = await prisma.substitution.update({ where: { id: substitutionId }, data: { substituteTeacherId, status: "ASSIGNED", note: note ?? sub.note }, include });
  await audit({ user, schoolId: sub.schoolId, action: "substitution.assign", entityType: "Substitution", entityId: substitutionId, before: sub, after: updated });

  const lesson = `${sub.timetableSlot.course.subject.name} – ${sub.timetableSlot.course.class.name}, ${sub.timetableSlot.period.name}`;
  const dateStr = sub.date.toISOString().slice(0, 10);
  await notify({ schoolId: sub.schoolId, userId: teacher.user.id, type: "SUBSTITUTE_ASSIGNED", title: `Substitution assigned: ${lesson}`, body: `You are covering ${sub.absentTeacher.user.name} on ${dateStr}.`, link: `/substitutions/${substitutionId}`, email: true });
  await notify({ schoolId: sub.schoolId, userId: sub.absentTeacher.user.id, type: "CLASS_COVERED", title: `Your lesson is covered: ${lesson}`, body: `${teacher.user.name} will cover your lesson on ${dateStr}.`, link: `/substitutions/${substitutionId}` });
  if (sub.substituteTeacherId && sub.substituteTeacherId !== substituteTeacherId) {
    const previous = await prisma.teacher.findUnique({ where: { id: sub.substituteTeacherId }, select: { userId: true } });
    if (previous) await notify({ schoolId: sub.schoolId, userId: previous.userId, type: "GENERIC", title: `Substitution reassigned: ${lesson}`, body: `You no longer need to cover this lesson on ${dateStr}.` });
  }
  const roster = await classRoster(sub.timetableSlot.course.class.id);
  for (const s of roster) {
    if (s.userId) await notify({ schoolId: sub.schoolId, userId: s.userId, type: "GENERIC", title: `Substitute teacher on ${dateStr}`, body: `${teacher.user.name} will teach ${sub.timetableSlot.course.subject.name} (${sub.timetableSlot.period.name}).` });
  }
  return updated;
}

export async function updateSubstitutionStatus(user: AuthUser, substitutionId: string, status: "DECLINED" | "COMPLETED" | "CANCELLED" | "PENDING", note?: string | null) {
  const sub = await prisma.substitution.findUnique({ where: { id: substitutionId }, include });
  if (!sub) throw AppError.notFound("Substitution");
  assertSchoolAccess(user, sub.schoolId);
  const isSubstitute = user.teacherId && user.teacherId === sub.substituteTeacherId;
  if (status === "DECLINED") {
    if (!isSubstitute && !isAdmin(user)) throw AppError.forbidden("Only the assigned substitute can decline");
  } else {
    assertPermission(user, "substitution:manage");
  }
  const data: Prisma.SubstitutionUpdateInput = { status, note: note ?? undefined };
  if (status === "DECLINED" || status === "PENDING") {
    data.status = "PENDING";
    data.substituteTeacher = { disconnect: true };
  }
  const updated = await prisma.substitution.update({ where: { id: substitutionId }, data, include });
  await audit({ user, schoolId: sub.schoolId, action: `substitution.${status.toLowerCase()}`, entityType: "Substitution", entityId: substitutionId, before: sub, after: updated });
  if (status === "DECLINED") {
    const { schoolAdminUserIds } = await import("@/lib/notifications");
    for (const adminId of await schoolAdminUserIds(sub.schoolId)) {
      await notify({ schoolId: sub.schoolId, userId: adminId, type: "ALERT", title: "Substitution declined", body: `${user.name} declined to cover ${sub.timetableSlot.course.subject.name} on ${sub.date.toISOString().slice(0, 10)}.`, link: `/admin/substitutions` });
    }
  }
  return updated;
}

/** Substitutions still needing a teacher from today onwards (admin dashboard). */
export async function substitutionsNeeded(schoolId: string, from = new Date(), days = 7) {
  const start = toDateOnly(from);
  return prisma.substitution.findMany({ where: { schoolId, status: "PENDING", date: { gte: start, lte: toDateOnly(addDays(start, days)) } }, include, orderBy: [{ date: "asc" }, { timetableSlot: { period: { order: "asc" } } }] });
}
