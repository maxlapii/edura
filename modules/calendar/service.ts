import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { Audience } from "@/generated/prisma/enums";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, isAdmin, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { addDaysDateOnly, inclusiveDays, toDateOnly, todayDateOnly } from "@/lib/utils/dates";
import { MAX_CALENDAR_DAYS, type CalendarQuery } from "./schema";
import { combineDateAndTime, dateKey, expandWeeklySlots, filterKinds, mergeCalendar, type CalendarEntry } from "./expand";

export type { CalendarEntry, CalendarKind } from "./expand";

interface Range {
  /** Date-only start (UTC midnight). */
  from: Date;
  /** Date-only end (UTC midnight). */
  to: Date;
  /** Exclusive upper bound: end of `to` day. */
  toEnd: Date;
}

const slotInclude = {
  period: { select: { id: true, name: true, order: true, startTime: true, endTime: true } },
  room: { select: { id: true, name: true } },
  class: { select: { id: true, name: true } },
  teacher: { select: { id: true, user: { select: { id: true, name: true } } } },
  course: { select: { id: true, subject: { select: { id: true, name: true } } } },
} satisfies Prisma.TimetableSlotInclude;

type Slot = Prisma.TimetableSlotGetPayload<{ include: typeof slotInclude }>;

function resolveRange(q: Partial<CalendarQuery>): Range {
  const from = q.from ? toDateOnly(q.from) : todayDateOnly();
  const to = q.to ? toDateOnly(q.to) : addDaysDateOnly(from, 6);
  if (to < from) throw AppError.validation("to must be on or after from");
  const days = inclusiveDays(from, to);
  if (days > MAX_CALENDAR_DAYS) throw AppError.validation(`Calendar range cannot exceed ${MAX_CALENDAR_DAYS} days`, { days, max: MAX_CALENDAR_DAYS });
  return { from, to, toEnd: addDaysDateOnly(to, 1) };
}

/** Unified calendar for the caller, scoped by role. */
export async function getCalendar(user: AuthUser, query: Partial<CalendarQuery> = {}): Promise<CalendarEntry[]> {
  assertPermission(user, "calendar:read");
  const schoolId = resolveSchoolId(user);
  const range = resolveRange(query);

  const lists: CalendarEntry[][] = [await holidayEntries(schoolId, range)];

  if (isAdmin(user)) {
    lists.push(
      await meetingEntries(user.id, schoolId, range, true),
      await eventEntries(schoolId, range, {}),
      await leaveEntries(schoolId, range, { status: "APPROVED" }),
      await substitutionEntries(schoolId, range),
      await termEntries(schoolId, range),
    );
  } else if (user.role === "TEACHER" || user.role === "DEPARTMENT_HEAD") {
    lists.push(
      await teacherLessonEntries(user, schoolId, range),
      await meetingEntries(user.id, schoolId, range, false),
      await eventEntries(schoolId, range, { audience: ["SCHOOL", "TEACHERS"], userId: user.id }),
      await leaveEntries(schoolId, range, { requesterUserId: user.id }),
    );
  } else if (user.role === "STAFF") {
    lists.push(
      await meetingEntries(user.id, schoolId, range, false),
      await eventEntries(schoolId, range, { audience: ["SCHOOL", "STAFF"], userId: user.id }),
      await leaveEntries(schoolId, range, { requesterUserId: user.id }),
    );
  } else if (user.role === "STUDENT") {
    const student = user.studentId ? await prisma.student.findUnique({ where: { id: user.studentId }, select: { id: true, classId: true } }) : null;
    if (student?.classId) {
      lists.push(await classLessonEntries(schoolId, [student.classId], range), await assignmentEntries(schoolId, [student.classId], range));
    }
    lists.push(await eventEntries(schoolId, range, { audience: ["SCHOOL", "STUDENTS"], userId: user.id, studentIds: student ? [student.id] : [] }));
  } else if (user.role === "PARENT") {
    const links = user.guardianId
      ? await prisma.studentGuardian.findMany({ where: { guardianId: user.guardianId }, select: { student: { select: { id: true, firstName: true, lastName: true, classId: true } } } })
      : [];
    const children = links.map((l) => l.student);
    const classIds = [...new Set(children.map((c) => c.classId).filter((c): c is string => !!c))];
    const childByClass = new Map<string, string[]>();
    for (const c of children) if (c.classId) childByClass.set(c.classId, [...(childByClass.get(c.classId) ?? []), `${c.firstName} ${c.lastName}`]);
    if (classIds.length) {
      lists.push(await classLessonEntries(schoolId, classIds, range, childByClass), await assignmentEntries(schoolId, classIds, range, childByClass));
    }
    lists.push(await eventEntries(schoolId, range, { audience: ["SCHOOL", "PARENTS"], userId: user.id, studentIds: children.map((c) => c.id) }));
  }

  return filterKinds(mergeCalendar(...lists), query.kinds);
}

// ───────────── Lessons ─────────────

function lessonEntry(slot: Slot, date: Date, extra: Record<string, unknown> = {}): CalendarEntry {
  return {
    id: `${slot.id}:${dateKey(date)}`,
    kind: "LESSON",
    title: `${slot.course.subject.name} · ${slot.class.name}`,
    start: combineDateAndTime(date, slot.period.startTime),
    end: combineDateAndTime(date, slot.period.endTime),
    allDay: false,
    link: `/classes/${slot.class.id}`,
    meta: {
      slotId: slot.id,
      date: dateKey(date),
      courseId: slot.course.id,
      classId: slot.class.id,
      className: slot.class.name,
      subjectId: slot.course.subject.id,
      subject: slot.course.subject.name,
      teacherId: slot.teacher.id,
      teacherName: slot.teacher.user.name,
      period: slot.period.name,
      periodOrder: slot.period.order,
      room: slot.room?.name ?? null,
      ...extra,
    },
  };
}

/** A teacher's own lessons (minus the ones covered by someone else) plus lessons they cover as substitute. */
async function teacherLessonEntries(user: AuthUser, schoolId: string, range: Range): Promise<CalendarEntry[]> {
  if (!user.teacherId) return [];
  const [own, subs] = await Promise.all([
    prisma.timetableSlot.findMany({ where: { schoolId, teacherId: user.teacherId }, include: slotInclude }),
    prisma.substitution.findMany({
      where: { schoolId, date: { gte: range.from, lte: range.to }, OR: [{ absentTeacherId: user.teacherId }, { substituteTeacherId: user.teacherId }], status: { in: ["PENDING", "ASSIGNED", "COMPLETED"] } },
      include: { timetableSlot: { include: slotInclude }, substituteTeacher: { select: { id: true, user: { select: { name: true } } } } },
    }),
  ]);
  const subKey = (slotId: string, date: Date) => `${slotId}:${dateKey(date)}`;
  const absent = new Map(subs.filter((s) => s.absentTeacherId === user.teacherId).map((s) => [subKey(s.timetableSlotId, s.date), s]));
  const entries: CalendarEntry[] = [];
  for (const { slot, date } of expandWeeklySlots(own, range.from, range.to)) {
    const sub = absent.get(subKey(slot.id, date));
    if (sub?.substituteTeacherId && sub.substituteTeacherId !== user.teacherId) {
      entries.push(lessonEntry(slot, date, { covered: true, substitutionId: sub.id, substituteTeacherId: sub.substituteTeacherId, substituteName: sub.substituteTeacher?.user.name ?? null, substitutionStatus: sub.status }));
    } else {
      entries.push(lessonEntry(slot, date, sub ? { substitutionId: sub.id, substitutionStatus: sub.status, covered: false } : {}));
    }
  }
  for (const s of subs) {
    if (s.substituteTeacherId !== user.teacherId || s.status === "PENDING") continue;
    const e = lessonEntry(s.timetableSlot, s.date, { substitution: true, substitutionId: s.id, substitutionStatus: s.status, absentTeacherId: s.absentTeacherId });
    e.title = `Cover: ${e.title}`;
    e.link = `/substitutions/${s.id}`;
    entries.push(e);
  }
  return entries;
}

async function classLessonEntries(schoolId: string, classIds: string[], range: Range, childByClass?: Map<string, string[]>): Promise<CalendarEntry[]> {
  const slots = await prisma.timetableSlot.findMany({ where: { schoolId, classId: { in: classIds } }, include: slotInclude });
  return expandWeeklySlots(slots, range.from, range.to).map(({ slot, date }) => lessonEntry(slot, date, childByClass ? { children: childByClass.get(slot.classId) ?? [] } : {}));
}

// ───────────── Assignments ─────────────

async function assignmentEntries(schoolId: string, classIds: string[], range: Range, childByClass?: Map<string, string[]>): Promise<CalendarEntry[]> {
  const assignments = await prisma.assignment.findMany({
    where: { schoolId, status: { in: ["PUBLISHED", "CLOSED"] }, dueDate: { gte: range.from, lt: range.toEnd }, course: { classId: { in: classIds } } },
    include: { course: { select: { id: true, classId: true, subject: { select: { name: true } }, class: { select: { name: true } } } } },
  });
  return assignments.map((a) => ({
    id: a.id,
    kind: "ASSIGNMENT" as const,
    title: `Due: ${a.title}`,
    start: a.dueDate,
    end: null,
    allDay: false,
    link: `/assignments/${a.id}`,
    meta: { courseId: a.course.id, classId: a.course.classId, className: a.course.class.name, subject: a.course.subject.name, status: a.status, ...(childByClass ? { children: childByClass.get(a.course.classId) ?? [] } : {}) },
  }));
}

// ───────────── Meetings ─────────────

async function meetingEntries(userId: string, schoolId: string, range: Range, includeAll: boolean): Promise<CalendarEntry[]> {
  const where: Prisma.MeetingWhereInput = { schoolId, status: { not: "CANCELLED" }, startsAt: { lt: range.toEnd }, endsAt: { gte: range.from } };
  if (!includeAll) where.OR = [{ organizerUserId: userId }, { participants: { some: { userId, status: { not: "DECLINED" } } } }];
  else where.OR = [{ organizerUserId: userId }, { participants: { some: { userId } } }];
  const meetings = await prisma.meeting.findMany({ where, include: { room: { select: { name: true } }, organizer: { select: { id: true, name: true } }, _count: { select: { participants: true } } }, orderBy: { startsAt: "asc" } });
  return meetings.map((m) => ({
    id: m.id,
    kind: "MEETING" as const,
    title: m.title,
    start: m.startsAt,
    end: m.endsAt,
    allDay: false,
    link: `/meetings/${m.id}`,
    meta: { type: m.type, status: m.status, room: m.room?.name ?? m.location ?? null, organizerUserId: m.organizer.id, organizerName: m.organizer.name, participants: m._count.participants },
  }));
}

// ───────────── Events / holidays / exams ─────────────

interface EventScope {
  audience?: Audience[];
  userId?: string;
  studentIds?: string[];
}

function eventKind(type: string): CalendarEntry["kind"] {
  if (type === "HOLIDAY") return "HOLIDAY";
  if (type === "EXAM") return "EXAM";
  return "EVENT";
}

function eventEntry(e: { id: string; title: string; type: string; status: string; startsAt: Date; endsAt: Date; location: string | null; audience: string; organizer: { id: string; name: string } | null }): CalendarEntry {
  const kind = eventKind(e.type);
  return {
    id: e.id,
    kind,
    title: e.title,
    start: e.startsAt,
    end: e.endsAt,
    allDay: kind === "HOLIDAY",
    link: `/events/${e.id}`,
    meta: { type: e.type, status: e.status, location: e.location, audience: e.audience, organizerUserId: e.organizer?.id ?? null, organizerName: e.organizer?.name ?? null },
  };
}

const eventSelect = { id: true, title: true, type: true, status: true, startsAt: true, endsAt: true, location: true, audience: true, organizer: { select: { id: true, name: true } } } satisfies Prisma.EventSelect;

/** Events (non-holiday) visible in the scope. Admins (empty scope) see every non-cancelled event. */
async function eventEntries(schoolId: string, range: Range, scope: EventScope): Promise<CalendarEntry[]> {
  const where: Prisma.EventWhereInput = { schoolId, type: { not: "HOLIDAY" }, startsAt: { lt: range.toEnd }, endsAt: { gte: range.from } };
  if (scope.audience) {
    where.status = "SCHEDULED";
    const or: Prisma.EventWhereInput[] = [{ audience: { in: scope.audience } }, { type: "EXAM" }];
    if (scope.userId) or.push({ organizerUserId: scope.userId }, { participants: { some: { userId: scope.userId } } });
    if (scope.studentIds?.length) or.push({ participants: { some: { studentId: { in: scope.studentIds } } } });
    where.OR = or;
  } else {
    where.status = { not: "CANCELLED" };
  }
  const events = await prisma.event.findMany({ where, select: eventSelect, orderBy: { startsAt: "asc" } });
  return events.map(eventEntry);
}

/** School holidays are Events of type HOLIDAY; visible to everyone. */
async function holidayEntries(schoolId: string, range: Range): Promise<CalendarEntry[]> {
  const events = await prisma.event.findMany({ where: { schoolId, type: "HOLIDAY", status: "SCHEDULED", startsAt: { lt: range.toEnd }, endsAt: { gte: range.from } }, select: eventSelect, orderBy: { startsAt: "asc" } });
  return events.map(eventEntry);
}

// ───────────── Leave / substitutions / terms ─────────────

async function leaveEntries(schoolId: string, range: Range, filter: { status?: "APPROVED"; requesterUserId?: string }): Promise<CalendarEntry[]> {
  const where: Prisma.LeaveRequestWhereInput = { schoolId, startDate: { lte: range.to }, endDate: { gte: range.from } };
  if (filter.requesterUserId) {
    where.requesterUserId = filter.requesterUserId;
    where.status = { in: ["PENDING", "APPROVED"] };
  } else {
    where.status = filter.status ?? "APPROVED";
  }
  const leaves = await prisma.leaveRequest.findMany({ where, include: { requester: { select: { id: true, name: true } } }, orderBy: { startDate: "asc" } });
  return leaves.map((l) => ({
    id: l.id,
    kind: "LEAVE" as const,
    title: filter.requesterUserId ? `Leave (${l.type.toLowerCase()})${l.status === "PENDING" ? " – pending" : ""}` : `${l.requester.name} on leave`,
    start: l.startDate,
    end: l.endDate,
    allDay: true,
    link: `/leave/${l.id}`,
    meta: { type: l.type, status: l.status, requesterUserId: l.requester.id, requesterName: l.requester.name, teacherId: l.teacherId },
  }));
}

/** Admin view: substitutions still needing a substitute (plus assigned ones) in range. */
async function substitutionEntries(schoolId: string, range: Range): Promise<CalendarEntry[]> {
  const subs = await prisma.substitution.findMany({
    where: { schoolId, date: { gte: range.from, lte: range.to }, status: { in: ["PENDING", "ASSIGNED"] } },
    include: { timetableSlot: { include: slotInclude }, absentTeacher: { select: { user: { select: { name: true } } } }, substituteTeacher: { select: { id: true, user: { select: { name: true } } } } },
    orderBy: { date: "asc" },
  });
  return subs.map((s) => {
    const slot = s.timetableSlot;
    return {
      id: s.id,
      kind: "SUBSTITUTION" as const,
      title: `${s.status === "PENDING" ? "Substitute needed" : "Substitution"}: ${slot.course.subject.name} · ${slot.class.name}`,
      start: combineDateAndTime(s.date, slot.period.startTime),
      end: combineDateAndTime(s.date, slot.period.endTime),
      allDay: false,
      link: `/substitutions/${s.id}`,
      meta: { status: s.status, slotId: slot.id, classId: slot.class.id, className: slot.class.name, subject: slot.course.subject.name, period: slot.period.name, room: slot.room?.name ?? null, absentTeacherId: s.absentTeacherId, absentTeacherName: s.absentTeacher.user.name, substituteTeacherId: s.substituteTeacherId, substituteName: s.substituteTeacher?.user.name ?? null },
    };
  });
}

async function termEntries(schoolId: string, range: Range): Promise<CalendarEntry[]> {
  const terms = await prisma.term.findMany({ where: { schoolId, startDate: { lt: range.toEnd }, endDate: { gte: range.from } }, include: { academicYear: { select: { id: true, name: true } } }, orderBy: { startDate: "asc" } });
  return terms.map((t) => ({
    id: t.id,
    kind: "TERM" as const,
    title: `${t.name} (${t.academicYear.name})`,
    start: t.startDate,
    end: t.endDate,
    allDay: true,
    link: null,
    meta: { academicYearId: t.academicYear.id, academicYear: t.academicYear.name, isCurrent: t.isCurrent },
  }));
}
