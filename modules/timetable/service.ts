import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, isAdmin, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { dayOfWeek, toDateOnly } from "@/lib/utils/dates";
import { addDays, differenceInCalendarDays, startOfWeek } from "date-fns";
import type { z } from "zod";
import { findConflicts, type Conflict } from "./conflicts";
import { computeWorkload, type WorkloadSummary } from "./workload";
import type { CreateSlotInput, periodSchema, updateSlotSchema } from "./schema";

export const slotInclude = {
  period: true,
  room: { select: { id: true, name: true, code: true } },
  course: { include: { subject: { select: { id: true, name: true, code: true } }, class: { select: { id: true, name: true, _count: { select: { students: true } } } }, teacher: { select: { id: true, user: { select: { id: true, name: true } } } } } },
} satisfies Prisma.TimetableSlotInclude;

// ───────────── Periods ─────────────

export async function listPeriods(user: AuthUser, schoolId?: string) {
  const sid = resolveSchoolId(user, schoolId);
  return prisma.period.findMany({ where: { schoolId: sid }, orderBy: { order: "asc" } });
}

export async function createPeriod(user: AuthUser, input: z.infer<typeof periodSchema>) {
  assertPermission(user, "timetable:manage");
  const schoolId = resolveSchoolId(user);
  const period = await prisma.period.create({ data: { schoolId, ...input } });
  await audit({ user, schoolId, action: "period.create", entityType: "Period", entityId: period.id, after: period });
  return period;
}

export async function updatePeriod(user: AuthUser, id: string, input: Partial<z.infer<typeof periodSchema>>) {
  assertPermission(user, "timetable:manage");
  const before = await prisma.period.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Period");
  assertSchoolAccess(user, before.schoolId);
  const period = await prisma.period.update({ where: { id }, data: input });
  await audit({ user, schoolId: before.schoolId, action: "period.update", entityType: "Period", entityId: id, before, after: period });
  return period;
}

export async function deletePeriod(user: AuthUser, id: string) {
  assertPermission(user, "timetable:manage");
  const before = await prisma.period.findUnique({ where: { id }, include: { _count: { select: { timetableSlots: true } } } });
  if (!before) throw AppError.notFound("Period");
  assertSchoolAccess(user, before.schoolId);
  if (before._count.timetableSlots > 0) throw AppError.conflict("Period is used by timetable slots");
  await prisma.period.delete({ where: { id } });
}

// ───────────── Slots ─────────────

/** Checks a candidate slot against the school's timetable and returns conflicts (no writes). */
export async function checkSlotConflicts(schoolId: string, candidate: { id?: string; teacherId: string; classId: string; roomId?: string | null; dayOfWeek: number; periodId: string }): Promise<Conflict[]> {
  const existing = await prisma.timetableSlot.findMany({
    where: { schoolId, dayOfWeek: candidate.dayOfWeek, periodId: candidate.periodId },
    select: { id: true, teacherId: true, classId: true, roomId: true, dayOfWeek: true, periodId: true },
  });
  return findConflicts(existing, candidate);
}

async function resolveCourseForSlot(user: AuthUser, courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw AppError.notFound("Course");
  assertSchoolAccess(user, course.schoolId);
  return course;
}

async function assertPeriodAndRoom(schoolId: string, periodId: string, roomId?: string | null) {
  const period = await prisma.period.findUnique({ where: { id: periodId } });
  if (!period || period.schoolId !== schoolId) throw AppError.validation("Period must belong to the same school");
  if (roomId) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room || room.schoolId !== schoolId) throw AppError.validation("Room must belong to the same school");
  }
}

export async function createSlot(user: AuthUser, input: CreateSlotInput) {
  assertPermission(user, "timetable:manage");
  const course = await resolveCourseForSlot(user, input.courseId);
  await assertPeriodAndRoom(course.schoolId, input.periodId, input.roomId);
  const candidate = { teacherId: course.teacherId, classId: course.classId, roomId: input.roomId ?? null, dayOfWeek: input.dayOfWeek, periodId: input.periodId };
  const conflicts = await checkSlotConflicts(course.schoolId, candidate);
  if (conflicts.length) throw AppError.conflict("Timetable conflict", conflicts);
  const slot = await prisma.timetableSlot.create({ data: { schoolId: course.schoolId, courseId: course.id, ...candidate }, include: slotInclude });
  await audit({ user, schoolId: course.schoolId, action: "timetable.slot.create", entityType: "TimetableSlot", entityId: slot.id, after: slot });
  return slot;
}

/** Creates many slots atomically; fails with the full conflict list if any conflict. */
export async function createSlots(user: AuthUser, inputs: CreateSlotInput[]) {
  assertPermission(user, "timetable:manage");
  const schoolId = resolveSchoolId(user);
  const courses = await prisma.course.findMany({ where: { id: { in: [...new Set(inputs.map((i) => i.courseId))] }, schoolId } });
  const byId = new Map(courses.map((c) => [c.id, c]));
  const candidates = inputs.map((i) => {
    const course = byId.get(i.courseId);
    if (!course) throw AppError.validation(`Course ${i.courseId} not found in this school`);
    return { courseId: course.id, teacherId: course.teacherId, classId: course.classId, roomId: i.roomId ?? null, dayOfWeek: i.dayOfWeek, periodId: i.periodId };
  });
  const existing = await prisma.timetableSlot.findMany({ where: { schoolId }, select: { id: true, teacherId: true, classId: true, roomId: true, dayOfWeek: true, periodId: true } });
  const errors: Array<{ index: number; conflicts: Conflict[] }> = [];
  const accepted: typeof existing = [...existing];
  candidates.forEach((c, index) => {
    const conflicts = findConflicts(accepted, c);
    if (conflicts.length) errors.push({ index, conflicts });
    else accepted.push({ id: `new-${index}`, ...c });
  });
  if (errors.length) throw AppError.conflict("Timetable conflicts detected", errors);
  const result = await prisma.timetableSlot.createMany({ data: candidates.map((c) => ({ schoolId, ...c })) });
  await audit({ user, schoolId, action: "timetable.slot.bulk_create", entityType: "TimetableSlot", metadata: { count: result.count } });
  return { created: result.count };
}

export async function updateSlot(user: AuthUser, id: string, input: z.infer<typeof updateSlotSchema>) {
  assertPermission(user, "timetable:manage");
  const before = await prisma.timetableSlot.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Timetable slot");
  assertSchoolAccess(user, before.schoolId);
  const course = input.courseId ? await resolveCourseForSlot(user, input.courseId) : await prisma.course.findUniqueOrThrow({ where: { id: before.courseId } });
  const periodId = input.periodId ?? before.periodId;
  const roomId = input.roomId === undefined ? before.roomId : input.roomId;
  await assertPeriodAndRoom(before.schoolId, periodId, roomId);
  const candidate = { id, teacherId: course.teacherId, classId: course.classId, roomId, dayOfWeek: input.dayOfWeek ?? before.dayOfWeek, periodId };
  const conflicts = await checkSlotConflicts(before.schoolId, candidate);
  if (conflicts.length) throw AppError.conflict("Timetable conflict", conflicts);
  const slot = await prisma.timetableSlot.update({ where: { id }, data: { courseId: course.id, ...candidate, id: undefined }, include: slotInclude });
  await audit({ user, schoolId: before.schoolId, action: "timetable.slot.update", entityType: "TimetableSlot", entityId: id, before, after: slot });
  return slot;
}

export async function deleteSlot(user: AuthUser, id: string) {
  assertPermission(user, "timetable:manage");
  const before = await prisma.timetableSlot.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Timetable slot");
  assertSchoolAccess(user, before.schoolId);
  await prisma.timetableSlot.delete({ where: { id } });
  await audit({ user, schoolId: before.schoolId, action: "timetable.slot.delete", entityType: "TimetableSlot", entityId: id, before });
}

// ───────────── Schedules ─────────────

export type ScheduleFilter = { teacherId?: string; classId?: string; roomId?: string; dayOfWeek?: number };

/** Weekly schedule for a teacher/class/room. Non-admins can only view their own or their class's schedule. */
export async function weeklySchedule(user: AuthUser, filter: ScheduleFilter) {
  assertPermission(user, "timetable:read");
  const schoolId = resolveSchoolId(user);
  if (!isAdmin(user) && user.role !== "STAFF" && user.role !== "DEPARTMENT_HEAD") {
    if (user.teacherId) {
      if (filter.classId) {
        const teaches = await prisma.course.findFirst({ where: { classId: filter.classId, OR: [{ teacherId: user.teacherId }, { class: { homeroomTeacherId: user.teacherId } }] } });
        if (!teaches) throw AppError.forbidden("You do not teach this class");
      } else if (filter.teacherId && filter.teacherId !== user.teacherId && !filter.roomId) {
        throw AppError.forbidden("You can only view your own schedule");
      } else if (!filter.roomId) {
        filter = { ...filter, teacherId: user.teacherId };
      }
    } else if (user.studentId) {
      const s = await prisma.student.findUnique({ where: { id: user.studentId } });
      if (!s?.classId) return [];
      filter = { classId: s.classId, dayOfWeek: filter.dayOfWeek };
    } else if (user.guardianId) {
      if (!filter.classId) throw AppError.badRequest("classId is required");
      const link = await prisma.studentGuardian.findFirst({ where: { guardianId: user.guardianId, student: { classId: filter.classId } } });
      if (!link) throw AppError.forbidden("Class is not linked to your children");
      filter = { classId: filter.classId, dayOfWeek: filter.dayOfWeek };
    }
  }
  return prisma.timetableSlot.findMany({
    where: { schoolId, teacherId: filter.teacherId, classId: filter.classId, roomId: filter.roomId, dayOfWeek: filter.dayOfWeek },
    include: slotInclude,
    orderBy: [{ dayOfWeek: "asc" }, { period: { order: "asc" } }],
  });
}

/**
 * A teacher's lessons for a specific date, including lessons they cover as a substitute
 * and flags for their own lessons that are covered by someone else.
 */
export async function teacherDaySchedule(user: AuthUser, teacherId: string, date: Date) {
  assertPermission(user, "timetable:read");
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
  if (!teacher) throw AppError.notFound("Teacher");
  assertSchoolAccess(user, teacher.schoolId);
  if (!isAdmin(user) && user.role !== "DEPARTMENT_HEAD" && user.teacherId !== teacherId) throw AppError.forbidden("You can only view your own schedule");
  const d = toDateOnly(date);
  const dow = dayOfWeek(d);
  const [own, covering, sessions] = await Promise.all([
    prisma.timetableSlot.findMany({ where: { teacherId, dayOfWeek: dow }, include: { ...slotInclude, substitutions: { where: { date: d, status: { in: ["ASSIGNED", "PENDING"] } }, include: { substituteTeacher: { include: { user: { select: { id: true, name: true } } } } } } }, orderBy: { period: { order: "asc" } } }),
    prisma.substitution.findMany({ where: { substituteTeacherId: teacherId, date: d, status: "ASSIGNED" }, include: { timetableSlot: { include: slotInclude }, absentTeacher: { include: { user: { select: { id: true, name: true } } } } } }),
    prisma.attendanceSession.findMany({ where: { date: d, timetableSlot: { OR: [{ teacherId }, { substitutions: { some: { substituteTeacherId: teacherId, date: d } } }] } }, select: { timetableSlotId: true, status: true, id: true } }),
  ]);
  const sessionBySlot = new Map(sessions.map((s) => [s.timetableSlotId, s]));
  const lessons = [
    ...own.map((slot) => ({
      slot,
      kind: "OWN" as const,
      coveredBy: slot.substitutions[0]?.substituteTeacher ?? null,
      substitutionStatus: slot.substitutions[0]?.status ?? null,
      attendanceSession: sessionBySlot.get(slot.id) ?? null,
    })),
    ...covering.map((sub) => ({
      slot: sub.timetableSlot,
      kind: "SUBSTITUTION" as const,
      coveringFor: sub.absentTeacher,
      substitutionStatus: sub.status,
      attendanceSession: sessionBySlot.get(sub.timetableSlotId) ?? null,
    })),
  ].sort((a, b) => a.slot.period.order - b.slot.period.order);
  return { date: d, dayOfWeek: dow, lessons };
}

// ───────────── Workload ─────────────

export async function teacherWorkload(user: AuthUser, teacherId: string, referenceDate = new Date()): Promise<WorkloadSummary & { teacherId: string; name: string; departmentId: string | null }> {
  assertPermission(user, "workload:read");
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId }, include: { user: { select: { name: true } } } });
  if (!teacher) throw AppError.notFound("Teacher");
  assertSchoolAccess(user, teacher.schoolId);
  if (!isAdmin(user) && user.role !== "DEPARTMENT_HEAD" && user.teacherId !== teacherId) throw AppError.forbidden("You can only view your own workload");
  return computeTeacherWorkload(teacher, referenceDate);
}

async function computeTeacherWorkload(teacher: { id: string; schoolId: string; maxWeeklyPeriods: number; user: { name: string }; departmentId: string | null }, referenceDate: Date) {
  const weekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);
  const [slots, duties, substitutions, meetings, leaves, homerooms] = await Promise.all([
    prisma.timetableSlot.findMany({ where: { teacherId: teacher.id }, select: { courseId: true, classId: true, course: { select: { subjectId: true } } } }),
    prisma.teacherDuty.findMany({ where: { teacherId: teacher.id }, select: { weeklyHours: true } }),
    prisma.substitution.count({ where: { substituteTeacherId: teacher.id, status: { in: ["ASSIGNED", "COMPLETED"] }, date: { gte: toDateOnly(weekStart), lte: toDateOnly(weekEnd) } } }),
    prisma.meetingParticipant.findMany({ where: { userId: (await prisma.teacher.findUnique({ where: { id: teacher.id }, select: { userId: true } }))!.userId, meeting: { startsAt: { gte: weekStart, lte: addDays(weekEnd, 1) }, status: { not: "CANCELLED" } } }, include: { meeting: { select: { startsAt: true, endsAt: true } } } }),
    prisma.leaveRequest.findMany({ where: { teacherId: teacher.id, status: "APPROVED", startDate: { lte: toDateOnly(weekEnd) }, endDate: { gte: toDateOnly(weekStart) } } }),
    prisma.schoolClass.count({ where: { homeroomTeacherId: teacher.id } }),
  ]);
  const meetingHours = meetings.reduce((sum, m) => sum + Math.max(0, (m.meeting.endsAt.getTime() - m.meeting.startsAt.getTime()) / 3_600_000), 0);
  const leaveDays = leaves.reduce((sum, l) => {
    const s = l.startDate < toDateOnly(weekStart) ? toDateOnly(weekStart) : l.startDate;
    const e = l.endDate > toDateOnly(weekEnd) ? toDateOnly(weekEnd) : l.endDate;
    return sum + differenceInCalendarDays(e, s) + 1;
  }, 0);
  const summary = computeWorkload({
    teachingSlots: slots.map((s) => ({ courseId: s.courseId, classId: s.classId, subjectId: s.course.subjectId })),
    duties,
    substitutionPeriods: substitutions,
    meetingHours,
    homeroomClasses: homerooms,
    leaveDays,
    maxWeeklyPeriods: teacher.maxWeeklyPeriods,
  });
  return { teacherId: teacher.id, name: teacher.user.name, departmentId: teacher.departmentId, ...summary };
}

/** Workload for every active teacher in the school (department heads: their department only). */
export async function schoolWorkload(user: AuthUser, referenceDate = new Date()) {
  assertPermission(user, "workload:read");
  const schoolId = resolveSchoolId(user);
  const where: Prisma.TeacherWhereInput = { schoolId, status: { in: ["ACTIVE", "ON_LEAVE"] } };
  if (user.role === "DEPARTMENT_HEAD") where.departmentId = user.departmentId ?? "__none__";
  else if (!isAdmin(user)) throw AppError.forbidden();
  const teachers = await prisma.teacher.findMany({ where, include: { user: { select: { name: true } } }, orderBy: { user: { name: "asc" } } });
  const rows = await Promise.all(teachers.map((t) => computeTeacherWorkload(t, referenceDate)));
  return rows;
}
