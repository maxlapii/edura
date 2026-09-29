import { prisma } from "@/lib/db";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, isAdmin, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { dayOfWeek, toDateOnly } from "@/lib/utils/dates";
import { addDays } from "date-fns";
import { countUnread, listNotifications } from "@/lib/notifications";
import { teacherDaySchedule, schoolWorkload } from "@/modules/timetable/service";
import { pendingAttendanceForTeacher, repeatedAbsenceStudents, studentAttendanceSummary } from "@/modules/attendance/service";
import { pendingGrading, gradeSubmissionStatus, studentGrades } from "@/modules/grades/service";
import { listAssignments } from "@/modules/assignments/service";
import { listTasks } from "@/modules/tasks/service";
import { listLeaveRequests, absentTeachers } from "@/modules/leave/service";
import { listSubstitutions, substitutionsNeeded } from "@/modules/substitution/service";
import { upcomingMeetingsForUser } from "@/modules/meetings/service";
import { recentAnnouncementsForUser } from "@/modules/announcements/service";
import { upcomingEvents } from "@/modules/events/service";
import { maintenanceDashboard } from "@/modules/facilities/service";
import { pendingApprovalsCount } from "@/modules/approvals/service";
import { listLessonPlans } from "@/modules/lessonPlans/service";
import { myChildren } from "@/modules/guardians/service";
import { listMyCourses } from "@/modules/classes/service";

/** Daily attendance rate for the last `days` days (school-wide, or for one teacher's courses). */
export async function attendanceTrend(schoolId: string, days = 14, teacherId?: string, now = new Date()) {
  const end = toDateOnly(now);
  const start = addDays(end, -(days - 1));
  const rows = await prisma.attendanceRecord.groupBy({
    by: ["date", "status"],
    where: { schoolId, date: { gte: start, lte: end }, session: { status: "SUBMITTED", ...(teacherId ? { course: { teacherId } } : {}) } },
    _count: { _all: true },
  });
  const byDate = new Map<string, { present: number; total: number }>();
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 10);
    const cur = byDate.get(key) ?? { present: 0, total: 0 };
    if (r.status !== "EXCUSED") cur.total += r._count._all;
    if (r.status === "PRESENT" || r.status === "LATE") cur.present += r._count._all;
    byDate.set(key, cur);
  }
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(start, i);
    const key = d.toISOString().slice(0, 10);
    const v = byDate.get(key);
    return { date: key, rate: v && v.total ? Number(((v.present / v.total) * 100).toFixed(1)) : null, total: v?.total ?? 0 };
  });
}

/** Attendance records by status over the last `days` days (school-wide, or for one teacher's courses). */
export async function attendanceBreakdown(schoolId: string, days = 30, teacherId?: string, now = new Date()) {
  const end = toDateOnly(now);
  const start = addDays(end, -(days - 1));
  const rows = await prisma.attendanceRecord.groupBy({
    by: ["status"],
    where: { schoolId, date: { gte: start, lte: end }, session: { status: "SUBMITTED", ...(teacherId ? { course: { teacherId } } : {}) } },
    _count: { _all: true },
  });
  const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 };
  for (const r of rows) counts[r.status] = r._count._all;
  return counts;
}

/** "What do I need to do today?" for a teacher. */
export async function teacherDashboard(user: AuthUser, now = new Date()) {
  assertPermission(user, "dashboard:teacher");
  if (!user.teacherId) throw AppError.forbidden("No teacher profile");
  const today = toDateOnly(now);
  const [schedule, pendingAttendance, pendingGrades, missing, tasks, leave, substitutions, meetings, announcements, notifications, unread, lessonPlans] = await Promise.all([
    teacherDaySchedule(user, user.teacherId, today),
    pendingAttendanceForTeacher(user.teacherId, today),
    pendingGrading(user),
    listAssignments(user, { filter: "missing" }),
    listTasks(user, { status: "OPEN" }),
    listLeaveRequests(user, { scope: "mine" }),
    listSubstitutions(user, { from: today, to: addDays(today, 7) }),
    upcomingMeetingsForUser(user.id, 7, now),
    recentAnnouncementsForUser(user, 5),
    listNotifications(user.id, { unreadOnly: true, take: 10 }),
    countUnread(user.id),
    listLessonPlans(user, { from: today, to: today }),
  ]);
  const [attendanceTrendData, attendanceStatus, myClasses] = await Promise.all([
    attendanceTrend(user.schoolId!, 14, user.teacherId, now),
    attendanceBreakdown(user.schoolId!, 30, user.teacherId, now),
    prisma.course.findMany({
      where: { teacherId: user.teacherId },
      select: { id: true, subject: { select: { name: true } }, class: { select: { id: true, name: true, _count: { select: { students: true } } } } },
      orderBy: { class: { name: "asc" } },
    }),
  ]);
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const nextLesson = schedule.lessons.find((l) => {
    const [h, m] = l.slot.period.endTime.split(":").map(Number);
    return h * 60 + m > nowMinutes;
  }) ?? null;
  return {
    today,
    schedule,
    nextLesson,
    pendingAttendance,
    pendingGrading: pendingGrades,
    missingSubmissions: missing.length,
    tasks: tasks.filter((t) => t.assigneeUserId === user.id),
    overdueTasks: tasks.filter((t) => t.assigneeUserId === user.id && t.dueDate && t.dueDate < now).length,
    leave: leave.slice(0, 5),
    substitutions,
    meetings,
    announcements,
    notifications,
    unreadNotifications: unread,
    lessonPlansToday: lessonPlans,
    attendanceTrend: attendanceTrendData,
    attendanceStatus,
    myClasses: myClasses.map((c) => ({ courseId: c.id, subject: c.subject.name, className: c.class.name, students: c.class._count.students })),
  };
}

/** School operations overview for administrators. */
export async function adminDashboard(user: AuthUser, now = new Date()) {
  assertPermission(user, "dashboard:admin");
  const schoolId = resolveSchoolId(user);
  const today = toDateOnly(now);
  const dow = dayOfWeek(today);
  const [lessonsToday, absent, needed, alerts, pendingApprovals, gradeStatus, workload, events, maintenance, tasks, pendingLeave, meetings, announcements, counts] = await Promise.all([
    prisma.timetableSlot.count({ where: { schoolId, dayOfWeek: dow } }),
    absentTeachers(schoolId, today),
    substitutionsNeeded(schoolId, today, 7),
    repeatedAbsenceStudents(schoolId),
    pendingApprovalsCount(schoolId),
    gradeSubmissionStatus(user),
    schoolWorkload(user, now),
    upcomingEvents(schoolId, 14, now),
    maintenanceDashboard(schoolId, now),
    prisma.task.findMany({ where: { schoolId, status: { in: ["TODO", "IN_PROGRESS"] } }, include: { assignee: { select: { id: true, name: true } } }, orderBy: { dueDate: "asc" }, take: 200 }),
    prisma.leaveRequest.findMany({ where: { schoolId, status: "PENDING" }, include: { requester: { select: { id: true, name: true } } }, orderBy: { startDate: "asc" }, take: 10 }),
    upcomingMeetingsForUser(user.id, 7, now),
    recentAnnouncementsForUser(user, 5),
    Promise.all([
      prisma.teacher.count({ where: { schoolId, status: { in: ["ACTIVE", "ON_LEAVE"] } } }),
      prisma.student.count({ where: { schoolId, status: "ACTIVE" } }),
      prisma.schoolClass.count({ where: { schoolId } }),
      prisma.staff.count({ where: { schoolId, status: "ACTIVE" } }),
    ]),
  ]);
  const attendanceToday = await prisma.attendanceRecord.groupBy({ by: ["status"], where: { schoolId, date: today, session: { status: "SUBMITTED" } }, _count: { _all: true } });
  const sessionsToday = await prisma.attendanceSession.count({ where: { schoolId, date: today, status: "SUBMITTED" } });
  const [trend, attendanceStatus, classSizes] = await Promise.all([
    attendanceTrend(schoolId, 14, undefined, now),
    attendanceBreakdown(schoolId, 30, undefined, now),
    prisma.schoolClass.findMany({ where: { schoolId }, select: { id: true, name: true, _count: { select: { students: true } } }, orderBy: [{ gradeLevel: "asc" }, { name: "asc" }] }),
  ]);
  return {
    today,
    attendanceTrend: trend,
    attendanceStatus,
    classSizes: classSizes.map((c) => ({ id: c.id, name: c.name, students: c._count.students })),
    counts: { teachers: counts[0], students: counts[1], classes: counts[2], staff: counts[3] },
    lessonsToday,
    attendanceToday: { sessions: sessionsToday, byStatus: Object.fromEntries(attendanceToday.map((a) => [a.status, a._count._all])) },
    absentTeachers: absent,
    substitutionsNeeded: needed,
    attendanceAlerts: alerts.slice(0, 10),
    pendingApprovals,
    pendingLeave,
    pendingGrades: gradeStatus.filter((g) => g.status === "PENDING"),
    workload: { overloaded: workload.filter((w) => w.level === "OVERLOADED" || w.level === "HIGH"), underutilized: workload.filter((w) => w.level === "UNDERUTILIZED"), all: workload },
    upcomingEvents: events,
    maintenance,
    tasks: { open: tasks.length, overdue: tasks.filter((t) => t.dueDate && t.dueDate < now), upcoming: tasks.slice(0, 10) },
    meetings,
    announcements,
  };
}

/** High-level operational visibility for the principal. */
export async function principalDashboard(user: AuthUser, now = new Date()) {
  assertPermission(user, "dashboard:principal");
  const schoolId = resolveSchoolId(user);
  const base = await adminDashboard(user, now);
  const from = addDays(toDateOnly(now), -30);
  const [attendance30, supportCases, discipline, academic] = await Promise.all([
    prisma.attendanceRecord.groupBy({ by: ["status"], where: { schoolId, date: { gte: from }, session: { status: "SUBMITTED" } }, _count: { _all: true } }),
    prisma.supportCase.groupBy({ by: ["status"], where: { schoolId }, _count: { _all: true } }),
    prisma.disciplineIncident.groupBy({ by: ["severity"], where: { schoolId, date: { gte: from } }, _count: { _all: true } }),
    prisma.grade.aggregate({ where: { schoolId, status: { in: ["SUBMITTED", "LOCKED"] } }, _avg: { score: true }, _count: { _all: true } }),
  ]);
  const total = attendance30.reduce((s, a) => s + a._count._all, 0);
  const present = attendance30.filter((a) => a.status === "PRESENT" || a.status === "LATE").reduce((s, a) => s + a._count._all, 0);
  return {
    ...base,
    attendance30Days: { total, rate: total ? Number(((present / total) * 100).toFixed(1)) : 100, byStatus: Object.fromEntries(attendance30.map((a) => [a.status, a._count._all])) },
    supportCases: Object.fromEntries(supportCases.map((s) => [s.status, s._count._all])),
    discipline30Days: Object.fromEntries(discipline.map((d) => [d.severity, d._count._all])),
    academic: { gradedItems: academic._count._all, averageScore: academic._avg.score ? Number(academic._avg.score.toFixed(1)) : null },
  };
}

/** Department view for a department head. */
export async function departmentDashboard(user: AuthUser, now = new Date()) {
  assertPermission(user, "dashboard:department");
  const schoolId = resolveSchoolId(user);
  const departmentId = user.departmentId;
  if (!departmentId) throw AppError.forbidden("No department scope");
  const [department, teachers, courses, workload, gradeStatus, meetings, tasks, lessonPlans] = await Promise.all([
    prisma.department.findUnique({ where: { id: departmentId }, include: { subjects: true, headTeacher: { include: { user: { select: { name: true } } } } } }),
    prisma.teacher.findMany({ where: { schoolId, departmentId }, include: { user: { select: { id: true, name: true, email: true } }, _count: { select: { courses: true } } }, orderBy: { user: { name: "asc" } } }),
    prisma.course.findMany({ where: { schoolId, subject: { departmentId } }, include: { subject: { select: { name: true } }, class: { select: { id: true, name: true } }, teacher: { include: { user: { select: { name: true } } } } } }),
    schoolWorkload(user, now),
    gradeSubmissionStatus(user),
    upcomingMeetingsForUser(user.id, 14, now),
    listTasks(user, { scope: "all", status: "OPEN" }),
    prisma.lessonPlan.groupBy({ by: ["status"], where: { schoolId, course: { subject: { departmentId } } }, _count: { _all: true } }),
  ]);
  return { department, teachers, courses, workload, pendingGrades: gradeStatus.filter((g) => g.status === "PENDING"), gradeStatus, meetings, tasks, curriculum: Object.fromEntries(lessonPlans.map((l) => [l.status, l._count._all])) };
}

export async function studentDashboard(user: AuthUser, now = new Date()) {
  assertPermission(user, "dashboard:student");
  if (!user.studentId) throw AppError.forbidden("No student profile");
  const today = toDateOnly(now);
  const student = await prisma.student.findUniqueOrThrow({ where: { id: user.studentId }, include: { class: { select: { id: true, name: true } } } });
  const [courses, assignments, attendance, grades, events, announcements, notifications] = await Promise.all([
    listMyCourses(user),
    listAssignments(user, { filter: "upcoming" }),
    studentAttendanceSummary(user, user.studentId),
    studentGrades(user, user.studentId),
    upcomingEvents(student.schoolId, 30, now),
    recentAnnouncementsForUser(user, 5),
    listNotifications(user.id, { unreadOnly: true, take: 10 }),
  ]);
  const dow = dayOfWeek(today);
  const todayLessons = student.classId ? await prisma.timetableSlot.findMany({ where: { classId: student.classId, dayOfWeek: dow }, include: { period: true, room: { select: { name: true } }, course: { include: { subject: { select: { name: true } }, teacher: { include: { user: { select: { name: true } } } } } } }, orderBy: { period: { order: "asc" } } }) : [];
  return { today, student, todayLessons, courses, upcomingAssignments: assignments.slice(0, 10), attendance: { stats: attendance.stats, flagged: attendance.flagged }, grades, events: events.filter((e) => e.audience === "SCHOOL" || e.audience === "STUDENTS"), announcements, notifications };
}

export async function parentDashboard(user: AuthUser, now = new Date()) {
  assertPermission(user, "dashboard:parent");
  const children = await myChildren(user);
  const today = toDateOnly(now);
  const dow = dayOfWeek(today);
  const perChild = await Promise.all(
    children.map(async (child) => {
      const [attendance, grades, todayLessons, assignments] = await Promise.all([
        studentAttendanceSummary(user, child.id),
        studentGrades(user, child.id),
        child.classId ? prisma.timetableSlot.findMany({ where: { classId: child.classId, dayOfWeek: dow }, include: { period: true, course: { include: { subject: { select: { name: true } } } } }, orderBy: { period: { order: "asc" } } }) : [],
        prisma.assignment.findMany({ where: { status: "PUBLISHED", course: { classId: child.classId ?? "__none__" }, dueDate: { gte: now } }, include: { course: { include: { subject: { select: { name: true } } } }, submissions: { where: { studentId: child.id } } }, orderBy: { dueDate: "asc" }, take: 10 }),
      ]);
      return { child, attendance: { stats: attendance.stats, flagged: attendance.flagged, recentAbsences: attendance.recentAbsences }, grades: { overall: grades.overall, courses: grades.courses.map((c) => ({ subject: c.subject, average: c.summary.average, letter: c.summary.letter })) }, todayLessons, assignments };
    }),
  );
  const schoolId = user.schoolId;
  const [events, announcements, notifications] = await Promise.all([
    schoolId ? upcomingEvents(schoolId, 30, now) : [],
    recentAnnouncementsForUser(user, 5),
    listNotifications(user.id, { unreadOnly: true, take: 10 }),
  ]);
  return { today, children: perChild, events: events.filter((e) => e.audience === "SCHOOL" || e.audience === "PARENTS"), announcements, notifications };
}

export async function staffDashboard(user: AuthUser, now = new Date()) {
  const today = toDateOnly(now);
  const schoolId = resolveSchoolId(user);
  const [tasks, meetings, announcements, notifications, maintenance, events] = await Promise.all([
    listTasks(user, { status: "OPEN" }),
    upcomingMeetingsForUser(user.id, 7, now),
    recentAnnouncementsForUser(user, 5),
    listNotifications(user.id, { unreadOnly: true, take: 10 }),
    isAdmin(user) || user.role === "STAFF" ? maintenanceDashboard(schoolId, now) : null,
    upcomingEvents(schoolId, 14, now),
  ]);
  return { today, tasks, meetings, announcements, notifications, maintenance, events };
}

/** Picks the right dashboard for the caller's role. */
export async function dashboardForUser(user: AuthUser, now = new Date()) {
  switch (user.role) {
    case "SUPER_ADMIN":
    case "SCHOOL_ADMIN":
      return { kind: "admin" as const, data: await adminDashboard(user, now) };
    case "PRINCIPAL":
      return { kind: "principal" as const, data: await principalDashboard(user, now) };
    case "DEPARTMENT_HEAD":
      return { kind: "teacher" as const, data: await teacherDashboard(user, now), department: await departmentDashboard(user, now) };
    case "TEACHER":
      return { kind: "teacher" as const, data: await teacherDashboard(user, now) };
    case "STUDENT":
      return { kind: "student" as const, data: await studentDashboard(user, now) };
    case "PARENT":
      return { kind: "parent" as const, data: await parentDashboard(user, now) };
    case "STAFF":
      return { kind: "staff" as const, data: await staffDashboard(user, now) };
  }
}
