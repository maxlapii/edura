import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, isAdmin, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { dayOfWeek, toDateOnly } from "@/lib/utils/dates";
import { dispatch } from "@/lib/workflows/engine";
import { getSchoolSettings } from "@/modules/schools/service";
import { assertCourseAccess } from "@/modules/classes/service";
import { assertStudentAccess, classRoster, guardianUserIdsForStudent } from "@/modules/students/service";
import { computeAttendanceStats, countRecentAbsences, type Status } from "./stats";
import type { OpenSessionInput, RecordAttendanceInput } from "./schema";

const sessionInclude = {
  course: { include: { subject: { select: { id: true, name: true } }, class: { select: { id: true, name: true } }, teacher: { include: { user: { select: { id: true, name: true } } } } } },
  period: true,
  records: { include: { student: { select: { id: true, firstName: true, lastName: true, studentNumber: true } } }, orderBy: { student: { lastName: "asc" } } },
} satisfies Prisma.AttendanceSessionInclude;

async function assertCanRecord(user: AuthUser, course: { id: string; teacherId: string; classId: string; schoolId: string; subjectId: string }) {
  assertPermission(user, "attendance:record");
  await assertCourseAccess(user, course);
  if (user.studentId || user.guardianId) throw AppError.forbidden();
}

/** Finds or creates the attendance session for a course/date/period and returns it with the roster. */
export async function openSession(user: AuthUser, input: OpenSessionInput) {
  const course = await prisma.course.findUnique({ where: { id: input.courseId } });
  if (!course) throw AppError.notFound("Course");
  await assertCanRecord(user, course);
  const date = toDateOnly(input.date);
  let periodId = input.periodId ?? null;
  let timetableSlotId = input.timetableSlotId ?? null;
  if (timetableSlotId) {
    const slot = await prisma.timetableSlot.findUnique({ where: { id: timetableSlotId } });
    if (!slot || slot.courseId !== course.id) throw AppError.validation("Timetable slot does not belong to this course");
    periodId = slot.periodId;
  } else if (!periodId) {
    // Default to the course's slot on that day if there is exactly one.
    const slots = await prisma.timetableSlot.findMany({ where: { courseId: course.id, dayOfWeek: dayOfWeek(date) } });
    if (slots.length === 1) {
      periodId = slots[0].periodId;
      timetableSlotId = slots[0].id;
    }
  }
  const existing = await prisma.attendanceSession.findFirst({ where: { courseId: course.id, date, periodId }, include: sessionInclude });
  const session =
    existing ??
    (await prisma.attendanceSession.create({
      data: { schoolId: course.schoolId, courseId: course.id, date, periodId, timetableSlotId, recordedById: user.teacherId ?? null },
      include: sessionInclude,
    }));
  const roster = await classRoster(course.classId);
  return { session, roster };
}

/**
 * Records attendance for a session. Idempotent (upsert per student). Emits
 * ATTENDANCE_RECORDED per absent student and ABSENCE_THRESHOLD_REACHED when the
 * school's threshold is crossed.
 */
export async function recordAttendance(user: AuthUser, sessionId: string, input: RecordAttendanceInput) {
  const session = await prisma.attendanceSession.findUnique({ where: { id: sessionId }, include: { course: { include: { subject: true, class: { select: { id: true, name: true, homeroomTeacher: { select: { userId: true } } } } } } } });
  if (!session) throw AppError.notFound("Attendance session");
  await assertCanRecord(user, session.course);
  if (session.status === "SUBMITTED" && !isAdmin(user)) {
    // Teachers may still correct their own submitted session on the same day.
    if (session.recordedById !== user.teacherId) throw AppError.forbidden("Session already submitted");
  }
  const roster = await classRoster(session.course.classId);
  const rosterIds = new Set(roster.map((s) => s.id));
  for (const r of input.records) {
    if (!rosterIds.has(r.studentId)) throw AppError.validation(`Student ${r.studentId} is not in this class`);
  }
  const byStudent = new Map(input.records.map((r) => [r.studentId, r]));
  const rows = roster
    .map((s) => byStudent.get(s.id) ?? (input.markAllPresent ? { studentId: s.id, status: "PRESENT" as Status, note: null, minutesLate: null } : null))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const previous = await prisma.attendanceRecord.findMany({ where: { sessionId }, select: { studentId: true, status: true } });
  const prevStatus = new Map(previous.map((p) => [p.studentId, p.status]));

  await prisma.$transaction(async (tx) => {
    for (const r of rows) {
      await tx.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId, studentId: r.studentId } },
        update: { status: r.status, note: r.note ?? null, minutesLate: r.minutesLate ?? null },
        create: { schoolId: session.schoolId, sessionId, studentId: r.studentId, date: session.date, status: r.status, note: r.note ?? null, minutesLate: r.minutesLate ?? null },
      });
    }
    await tx.attendanceSession.update({
      where: { id: sessionId },
      data: { status: input.submit ? "SUBMITTED" : "OPEN", submittedAt: input.submit ? new Date() : null, recordedById: user.teacherId ?? session.recordedById },
    });
  });

  await audit({ user, schoolId: session.schoolId, action: "attendance.record", entityType: "AttendanceSession", entityId: sessionId, metadata: { count: rows.length, submitted: input.submit } });

  // Automation: notify guardians of newly-absent students and detect repeated absences.
  const settings = await getSchoolSettings(session.schoolId);
  const courseName = `${session.course.subject.name} (${session.course.class.name})`;
  const newlyAbsent = rows.filter((r) => r.status === "ABSENT" && prevStatus.get(r.studentId) !== "ABSENT");
  for (const r of newlyAbsent) {
    const student = roster.find((s) => s.id === r.studentId)!;
    const guardianUserIds = await guardianUserIdsForStudent(r.studentId);
    const payload = {
      sourceId: sessionId,
      sessionId,
      studentId: r.studentId,
      studentName: `${student.firstName} ${student.lastName}`,
      studentUserId: student.userId,
      guardianUserIds,
      status: r.status,
      note: r.note ?? "",
      date: session.date,
      courseId: session.courseId,
      courseName,
      classId: session.course.classId,
    };
    await dispatch("ATTENDANCE_RECORDED", session.schoolId, payload);

    const history = await prisma.attendanceRecord.findMany({
      where: { studentId: r.studentId, date: { lte: session.date }, OR: [{ session: { status: "SUBMITTED" } }, { sessionId }] },
      select: { status: true, date: true },
    });
    const absenceCount = countRecentAbsences(history, session.date, settings.absenceWindowDays);
    if (absenceCount === settings.absenceThreshold || (absenceCount > settings.absenceThreshold && absenceCount % settings.absenceThreshold === 0)) {
      await dispatch("ABSENCE_THRESHOLD_REACHED", session.schoolId, {
        ...payload,
        absenceCount,
        threshold: settings.absenceThreshold,
        windowDays: settings.absenceWindowDays,
        homeroomTeacherUserId: session.course.class.homeroomTeacher?.userId ?? null,
      });
    }
  }

  return prisma.attendanceSession.findUniqueOrThrow({ where: { id: sessionId }, include: sessionInclude });
}

export async function getSession(user: AuthUser, sessionId: string) {
  assertPermission(user, "attendance:read");
  const session = await prisma.attendanceSession.findUnique({ where: { id: sessionId }, include: sessionInclude });
  if (!session) throw AppError.notFound("Attendance session");
  await assertCourseAccess(user, session.course);
  if (user.studentId) session.records = session.records.filter((r) => r.studentId === user.studentId);
  if (user.guardianId) {
    const links = await prisma.studentGuardian.findMany({ where: { guardianId: user.guardianId }, select: { studentId: true } });
    const ids = new Set(links.map((l) => l.studentId));
    session.records = session.records.filter((r) => ids.has(r.studentId));
  }
  return session;
}

export async function listSessions(user: AuthUser, filter: { courseId?: string; classId?: string; from?: Date; to?: Date }) {
  assertPermission(user, "attendance:read");
  const schoolId = resolveSchoolId(user);
  const where: Prisma.AttendanceSessionWhereInput = { schoolId, courseId: filter.courseId, course: filter.classId ? { classId: filter.classId } : undefined, date: { gte: filter.from, lte: filter.to } };
  if (!isAdmin(user) && user.teacherId) where.course = { ...(where.course as object), OR: [{ teacherId: user.teacherId }, { class: { homeroomTeacherId: user.teacherId } }] };
  if (user.studentId) where.course = { ...(where.course as object), class: { students: { some: { id: user.studentId } } } };
  if (user.guardianId) where.course = { ...(where.course as object), class: { students: { some: { guardians: { some: { guardianId: user.guardianId } } } } } };
  return prisma.attendanceSession.findMany({
    where,
    include: { course: { include: { subject: { select: { name: true } }, class: { select: { id: true, name: true } } } }, period: true, _count: { select: { records: true } } },
    orderBy: [{ date: "desc" }, { period: { order: "asc" } }],
    take: 200,
  });
}

/** Attendance summary for a student (percentage, counts, recent records). */
export async function studentAttendanceSummary(user: AuthUser, studentId: string, range: { from?: Date; to?: Date } = {}) {
  assertPermission(user, "attendance:read");
  await assertStudentAccess(user, studentId);
  const records = await prisma.attendanceRecord.findMany({
    where: { studentId, session: { status: "SUBMITTED" }, date: { gte: range.from, lte: range.to } },
    include: { session: { include: { course: { include: { subject: { select: { name: true } } } }, period: { select: { name: true } } } } },
    orderBy: { date: "desc" },
  });
  const stats = computeAttendanceStats(records);
  const settings = await getSchoolSettings((await prisma.student.findUniqueOrThrow({ where: { id: studentId }, select: { schoolId: true } })).schoolId);
  const recentAbsences = countRecentAbsences(records, toDateOnly(new Date()), settings.absenceWindowDays);
  return { studentId, stats, recentAbsences, threshold: settings.absenceThreshold, flagged: recentAbsences >= settings.absenceThreshold, records: records.slice(0, 100) };
}

/** Per-student attendance for a class (for teachers/admins). */
export async function classAttendanceSummary(user: AuthUser, classId: string, range: { from?: Date; to?: Date } = {}) {
  assertPermission(user, "attendance:read");
  const cls = await prisma.schoolClass.findUnique({ where: { id: classId } });
  if (!cls) throw AppError.notFound("Class");
  assertSchoolAccess(user, cls.schoolId);
  if (!isAdmin(user) && user.role !== "DEPARTMENT_HEAD") {
    if (!user.teacherId) throw AppError.forbidden();
    const teaches = await prisma.course.findFirst({ where: { classId, OR: [{ teacherId: user.teacherId }, { class: { homeroomTeacherId: user.teacherId } }] } });
    if (!teaches) throw AppError.forbidden("You do not teach this class");
  }
  const settings = await getSchoolSettings(cls.schoolId);
  const students = await classRoster(classId);
  const records = await prisma.attendanceRecord.findMany({ where: { studentId: { in: students.map((s) => s.id) }, session: { status: "SUBMITTED" }, date: { gte: range.from, lte: range.to } }, select: { studentId: true, status: true, date: true } });
  const byStudent = new Map<string, typeof records>();
  for (const r of records) byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]);
  const today = toDateOnly(new Date());
  const rows = students.map((s) => {
    const recs = byStudent.get(s.id) ?? [];
    const recent = countRecentAbsences(recs, today, settings.absenceWindowDays);
    return { student: s, stats: computeAttendanceStats(recs), recentAbsences: recent, flagged: recent >= settings.absenceThreshold };
  });
  return { classId, className: cls.name, threshold: settings.absenceThreshold, windowDays: settings.absenceWindowDays, rows, overall: computeAttendanceStats(records) };
}

/** Students in the school with repeated absences (admin dashboard). */
export async function repeatedAbsenceStudents(schoolId: string) {
  const settings = await getSchoolSettings(schoolId);
  const today = toDateOnly(new Date());
  const from = new Date(today.getTime() - (settings.absenceWindowDays - 1) * 86_400_000);
  const grouped = await prisma.attendanceRecord.groupBy({
    by: ["studentId"],
    where: { schoolId, status: "ABSENT", date: { gte: from, lte: today }, session: { status: "SUBMITTED" } },
    _count: { _all: true },
    having: { studentId: { _count: { gte: settings.absenceThreshold } } },
  });
  const students = await prisma.student.findMany({ where: { id: { in: grouped.map((g) => g.studentId) } }, include: { class: { select: { id: true, name: true } } } });
  return grouped
    .map((g) => ({ student: students.find((s) => s.id === g.studentId)!, absences: g._count._all }))
    .filter((r) => r.student)
    .sort((a, b) => b.absences - a.absences);
}

/** Today's lessons for a teacher that still have no submitted attendance session. */
export async function pendingAttendanceForTeacher(teacherId: string, date = new Date()) {
  const d = toDateOnly(date);
  const dow = dayOfWeek(d);
  const [slots, covering] = await Promise.all([
    prisma.timetableSlot.findMany({ where: { teacherId, dayOfWeek: dow, substitutions: { none: { date: d, status: "ASSIGNED" } } }, include: { period: true, course: { include: { subject: { select: { name: true } }, class: { select: { id: true, name: true } } } } } }),
    prisma.substitution.findMany({ where: { substituteTeacherId: teacherId, date: d, status: "ASSIGNED" }, include: { timetableSlot: { include: { period: true, course: { include: { subject: { select: { name: true } }, class: { select: { id: true, name: true } } } } } } } }),
  ]);
  const all = [...slots, ...covering.map((c) => c.timetableSlot)];
  const sessions = await prisma.attendanceSession.findMany({ where: { date: d, timetableSlotId: { in: all.map((s) => s.id) }, status: "SUBMITTED" }, select: { timetableSlotId: true } });
  const done = new Set(sessions.map((s) => s.timetableSlotId));
  return all.filter((s) => !done.has(s.id)).sort((a, b) => a.period.order - b.period.order);
}
