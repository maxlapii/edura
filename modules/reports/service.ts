import { prisma } from "@/lib/db";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, isAdmin, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { computeAttendanceStats } from "@/modules/attendance/stats";
import { schoolWorkload, teacherWorkload } from "@/modules/timetable/service";
import { gradeSubmissionStatus, pendingGrading } from "@/modules/grades/service";
import { classAttendanceSummary } from "@/modules/attendance/service";
import { z } from "zod";
import { dateOnlySchema } from "@/lib/validation";

export const reportQuerySchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  classId: z.string().optional(),
  teacherId: z.string().optional(),
  termId: z.string().optional(),
  format: z.enum(["json", "csv"]).default("json"),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export interface Report {
  name: string;
  title: string;
  generatedAt: Date;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  summary?: Record<string, unknown>;
}

export const REPORT_NAMES = [
  "teacher-workload",
  "teacher-attendance",
  "student-attendance",
  "class-attendance",
  "assignment-completion",
  "grading-status",
  "curriculum-progress",
  "leave",
  "substitution",
  "maintenance",
  "events",
  "tasks",
  "class-performance",
] as const;
export type ReportName = (typeof REPORT_NAMES)[number];

export const REPORT_CATALOG: Array<{ name: ReportName; title: string; audience: "teacher" | "school" }> = [
  { name: "teacher-workload", title: "Teacher workload", audience: "school" },
  { name: "teacher-attendance", title: "Teacher attendance (leave)", audience: "school" },
  { name: "student-attendance", title: "Student attendance", audience: "teacher" },
  { name: "class-attendance", title: "Class attendance", audience: "teacher" },
  { name: "assignment-completion", title: "Assignment completion", audience: "teacher" },
  { name: "grading-status", title: "Grading status", audience: "teacher" },
  { name: "curriculum-progress", title: "Curriculum progress", audience: "teacher" },
  { name: "leave", title: "Leave", audience: "school" },
  { name: "substitution", title: "Substitution", audience: "school" },
  { name: "maintenance", title: "Maintenance", audience: "school" },
  { name: "events", title: "Events", audience: "school" },
  { name: "tasks", title: "Tasks", audience: "teacher" },
  { name: "class-performance", title: "Class performance", audience: "school" },
];

function requireTeacherScope(user: AuthUser, teacherId?: string) {
  if (isAdmin(user) || user.role === "DEPARTMENT_HEAD") return teacherId;
  if (!user.teacherId) throw AppError.forbidden();
  if (teacherId && teacherId !== user.teacherId) throw AppError.forbidden("You can only report on yourself");
  return user.teacherId;
}

export async function generateReport(user: AuthUser, name: ReportName, q: ReportQuery): Promise<Report> {
  const schoolId = resolveSchoolId(user);
  const generatedAt = new Date();
  const range = { from: q.from, to: q.to };
  switch (name) {
    case "teacher-workload": {
      assertPermission(user, "workload:read");
      const rows = isAdmin(user) || user.role === "DEPARTMENT_HEAD" ? await schoolWorkload(user) : [await teacherWorkload(user, requireTeacherScope(user, q.teacherId)!)];
      return { name, title: "Teacher workload", generatedAt, columns: ["name", "teachingPeriods", "classes", "subjects", "preparationPeriods", "substitutionPeriods", "meetingHours", "dutyHours", "totalPeriods", "maxWeeklyPeriods", "utilization", "level"], rows, summary: { overloaded: rows.filter((r) => r.level === "OVERLOADED").length, underutilized: rows.filter((r) => r.level === "UNDERUTILIZED").length } };
    }
    case "teacher-attendance": {
      assertPermission(user, "reports:school");
      const leaves = await prisma.leaveRequest.findMany({ where: { schoolId, status: "APPROVED", teacherId: { not: null }, ...(q.from || q.to ? { AND: [{ startDate: { lte: q.to } }, { endDate: { gte: q.from } }] } : {}) }, include: { teacher: { include: { user: { select: { name: true } } } } } });
      const byTeacher = new Map<string, { name: string; leaveRequests: number; days: number }>();
      for (const l of leaves) {
        const key = l.teacherId!;
        const cur = byTeacher.get(key) ?? { name: l.teacher!.user.name, leaveRequests: 0, days: 0 };
        cur.leaveRequests++;
        cur.days += Math.round((l.endDate.getTime() - l.startDate.getTime()) / 86_400_000) + 1;
        byTeacher.set(key, cur);
      }
      const rows = [...byTeacher.entries()].map(([teacherId, v]) => ({ teacherId, ...v }));
      return { name, title: "Teacher attendance (approved leave)", generatedAt, columns: ["name", "leaveRequests", "days"], rows };
    }
    case "student-attendance": {
      assertPermission(user, "attendance:read");
      if (user.studentId || user.guardianId) throw AppError.forbidden();
      const teacherScope = !isAdmin(user) && user.role !== "DEPARTMENT_HEAD" ? { OR: [{ homeroomTeacherId: user.teacherId ?? "__none__" }, { courses: { some: { teacherId: user.teacherId ?? "__none__" } } }] } : undefined;
      const records = await prisma.attendanceRecord.findMany({
        where: { schoolId, session: { status: "SUBMITTED" }, date: { gte: q.from, lte: q.to }, student: { classId: q.classId, class: teacherScope } },
        select: { studentId: true, status: true, student: { select: { firstName: true, lastName: true, studentNumber: true, class: { select: { name: true } } } } },
      });
      const grouped = new Map<string, { name: string; studentNumber: string; class: string; records: Array<{ status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" }> }>();
      for (const r of records) {
        const g = grouped.get(r.studentId) ?? { name: `${r.student.firstName} ${r.student.lastName}`, studentNumber: r.student.studentNumber, class: r.student.class?.name ?? "", records: [] };
        g.records.push({ status: r.status });
        grouped.set(r.studentId, g);
      }
      const rows = [...grouped.entries()].map(([studentId, g]) => ({ studentId, name: g.name, studentNumber: g.studentNumber, class: g.class, ...computeAttendanceStats(g.records) })).sort((a, b) => a.attendanceRate - b.attendanceRate);
      return { name, title: "Student attendance", generatedAt, columns: ["studentNumber", "name", "class", "total", "present", "absent", "late", "excused", "attendanceRate"], rows, summary: { ...computeAttendanceStats(records) } };
    }
    case "class-attendance": {
      if (!q.classId) throw AppError.badRequest("classId is required");
      const s = await classAttendanceSummary(user, q.classId, range);
      const rows = s.rows.map((r) => ({ studentNumber: r.student.studentNumber, name: `${r.student.firstName} ${r.student.lastName}`, ...r.stats, recentAbsences: r.recentAbsences, flagged: r.flagged }));
      return { name, title: `Class attendance – ${s.className}`, generatedAt, columns: ["studentNumber", "name", "total", "present", "absent", "late", "excused", "attendanceRate", "recentAbsences", "flagged"], rows, summary: { ...s.overall } };
    }
    case "assignment-completion": {
      assertPermission(user, "assignments:read");
      if (user.studentId || user.guardianId) throw AppError.forbidden();
      const teacherId = requireTeacherScope(user, q.teacherId);
      const assignments = await prisma.assignment.findMany({ where: { schoolId, status: { not: "DRAFT" }, course: { teacherId, classId: q.classId }, dueDate: { gte: q.from, lte: q.to } }, include: { course: { include: { subject: { select: { name: true } }, class: { select: { id: true, name: true } }, teacher: { include: { user: { select: { name: true } } } } } }, submissions: { select: { isLate: true, status: true } } } });
      const rows = [];
      for (const a of assignments) {
        const roster = await prisma.student.count({ where: { classId: a.course.class.id, status: "ACTIVE" } });
        const submitted = a.submissions.length;
        rows.push({ assignmentId: a.id, title: a.title, course: `${a.course.subject.name} (${a.course.class.name})`, teacher: a.course.teacher.user.name, dueDate: a.dueDate, students: roster, submitted, late: a.submissions.filter((s) => s.isLate).length, graded: a.submissions.filter((s) => s.status === "GRADED").length, missing: roster - submitted, completionRate: roster ? Number(((submitted / roster) * 100).toFixed(1)) : 0 });
      }
      return { name, title: "Assignment completion", generatedAt, columns: ["title", "course", "teacher", "dueDate", "students", "submitted", "late", "graded", "missing", "completionRate"], rows };
    }
    case "grading-status": {
      if (isAdmin(user) || user.role === "DEPARTMENT_HEAD") {
        const rows = (await gradeSubmissionStatus(user, q.termId)).map((r) => ({ course: `${r.course.subject.name} (${r.course.class.name})`, teacher: r.course.teacher.user.name, draft: r.counts.DRAFT, submitted: r.counts.SUBMITTED, locked: r.counts.LOCKED, total: r.total, status: r.status }));
        return { name, title: "Grade submission status", generatedAt, columns: ["course", "teacher", "draft", "submitted", "locked", "total", "status"], rows, summary: { pending: rows.filter((r) => r.status === "PENDING").length } };
      }
      const rows = (await pendingGrading(user)).map((r) => ({ assignment: r.assignment.title, course: `${r.assignment.course.subject.name} (${r.assignment.course.class.name})`, dueDate: r.assignment.dueDate, pending: r.pending }));
      return { name, title: "Pending grading", generatedAt, columns: ["assignment", "course", "dueDate", "pending"], rows };
    }
    case "curriculum-progress": {
      assertPermission(user, "lesson_plans:read");
      const teacherId = requireTeacherScope(user, q.teacherId);
      const courses = await prisma.course.findMany({ where: { schoolId, teacherId, classId: q.classId }, include: { subject: { select: { name: true } }, class: { select: { name: true } }, teacher: { include: { user: { select: { name: true } } } }, lessonPlans: { select: { status: true } } } });
      const rows = courses.map((c) => {
        const total = c.lessonPlans.length;
        const completed = c.lessonPlans.filter((p) => p.status === "COMPLETED").length;
        return { course: `${c.subject.name} (${c.class.name})`, teacher: c.teacher.user.name, planned: total, completed, ready: c.lessonPlans.filter((p) => p.status === "READY").length, draft: c.lessonPlans.filter((p) => p.status === "DRAFT").length, completionRate: total ? Number(((completed / total) * 100).toFixed(1)) : 0 };
      });
      return { name, title: "Curriculum progress", generatedAt, columns: ["course", "teacher", "planned", "completed", "ready", "draft", "completionRate"], rows };
    }
    case "leave": {
      assertPermission(user, "leave:read_all");
      const rows = (await prisma.leaveRequest.findMany({ where: { schoolId, ...(q.from || q.to ? { AND: [{ startDate: { lte: q.to } }, { endDate: { gte: q.from } }] } : {}), ...(user.role === "DEPARTMENT_HEAD" ? { teacher: { departmentId: user.departmentId ?? "__none__" } } : {}) }, include: { requester: { select: { name: true } }, reviewedBy: { select: { name: true } }, _count: { select: { substitutions: true } } }, orderBy: { startDate: "desc" } })).map((l) => ({ requester: l.requester.name, type: l.type, startDate: l.startDate, endDate: l.endDate, status: l.status, reviewedBy: l.reviewedBy?.name ?? "", substitutions: l._count.substitutions, reason: l.reason ?? "" }));
      return { name, title: "Leave requests", generatedAt, columns: ["requester", "type", "startDate", "endDate", "status", "reviewedBy", "substitutions", "reason"], rows, summary: { pending: rows.filter((r) => r.status === "PENDING").length, approved: rows.filter((r) => r.status === "APPROVED").length } };
    }
    case "substitution": {
      assertPermission(user, "substitution:read");
      if (!isAdmin(user) && user.role !== "DEPARTMENT_HEAD") throw AppError.forbidden();
      const subs = await prisma.substitution.findMany({ where: { schoolId, date: { gte: q.from, lte: q.to } }, include: { absentTeacher: { include: { user: { select: { name: true } } } }, substituteTeacher: { include: { user: { select: { name: true } } } }, timetableSlot: { include: { period: true, course: { include: { subject: { select: { name: true } }, class: { select: { name: true } } } } } } }, orderBy: { date: "desc" } });
      const rows = subs.map((s) => ({ date: s.date, period: s.timetableSlot.period.name, course: `${s.timetableSlot.course.subject.name} (${s.timetableSlot.course.class.name})`, absentTeacher: s.absentTeacher.user.name, substitute: s.substituteTeacher?.user.name ?? "", status: s.status }));
      const perTeacher = new Map<string, number>();
      for (const s of subs) if (s.substituteTeacher) perTeacher.set(s.substituteTeacher.user.name, (perTeacher.get(s.substituteTeacher.user.name) ?? 0) + 1);
      return { name, title: "Substitutions", generatedAt, columns: ["date", "period", "course", "absentTeacher", "substitute", "status"], rows, summary: { pending: rows.filter((r) => r.status === "PENDING").length, perSubstitute: Object.fromEntries(perTeacher) } };
    }
    case "maintenance": {
      assertPermission(user, "maintenance:manage");
      const rows = (await prisma.maintenanceRequest.findMany({ where: { schoolId, createdAt: { gte: q.from, lte: q.to } }, include: { room: { select: { name: true } }, reportedBy: { select: { name: true } }, assignedTo: { select: { name: true } } }, orderBy: { createdAt: "desc" } })).map((m) => ({ title: m.title, category: m.category, room: m.room?.name ?? "", priority: m.priority, status: m.status, reportedBy: m.reportedBy.name, assignedTo: m.assignedTo?.name ?? "", createdAt: m.createdAt, dueDate: m.dueDate, resolvedAt: m.resolvedAt, overdue: !!m.dueDate && m.dueDate < generatedAt && !["RESOLVED", "CLOSED"].includes(m.status) }));
      return { name, title: "Maintenance requests", generatedAt, columns: ["title", "category", "room", "priority", "status", "reportedBy", "assignedTo", "createdAt", "dueDate", "resolvedAt", "overdue"], rows, summary: { open: rows.filter((r) => !["RESOLVED", "CLOSED"].includes(r.status)).length, overdue: rows.filter((r) => r.overdue).length } };
    }
    case "events": {
      assertPermission(user, "events:read");
      const rows = (await prisma.event.findMany({ where: { schoolId, startsAt: { gte: q.from, lte: q.to } }, include: { organizer: { select: { name: true } }, _count: { select: { participants: true } } }, orderBy: { startsAt: "asc" } })).map((e) => ({ title: e.title, type: e.type, startsAt: e.startsAt, endsAt: e.endsAt, location: e.location ?? "", organizer: e.organizer?.name ?? "", status: e.status, participants: e._count.participants }));
      return { name, title: "Events", generatedAt, columns: ["title", "type", "startsAt", "endsAt", "location", "organizer", "status", "participants"], rows };
    }
    case "tasks": {
      assertPermission(user, "tasks:read");
      const where = { schoolId, ...(isAdmin(user) ? {} : user.role === "DEPARTMENT_HEAD" ? { assignee: { teacher: { departmentId: user.departmentId ?? "__none__" } } } : { assigneeUserId: user.id }) };
      const rows = (await prisma.task.findMany({ where, include: { assignee: { select: { name: true } } }, orderBy: { dueDate: "asc" } })).map((t) => ({ title: t.title, assignee: t.assignee.name, priority: t.priority, status: t.status, source: t.source, dueDate: t.dueDate, overdue: !!t.dueDate && t.dueDate < generatedAt && (t.status === "TODO" || t.status === "IN_PROGRESS") }));
      return { name, title: "Tasks", generatedAt, columns: ["title", "assignee", "priority", "status", "source", "dueDate", "overdue"], rows, summary: { open: rows.filter((r) => r.status === "TODO" || r.status === "IN_PROGRESS").length, overdue: rows.filter((r) => r.overdue).length } };
    }
    case "class-performance": {
      assertPermission(user, "reports:school");
      const grades = await prisma.grade.findMany({ where: { schoolId, termId: q.termId, status: { in: ["SUBMITTED", "LOCKED"] }, course: { classId: q.classId } }, select: { score: true, maxScore: true, course: { select: { class: { select: { id: true, name: true } }, subject: { select: { name: true } } } } } });
      const groups = new Map<string, { class: string; subject: string; sum: number; n: number }>();
      for (const g of grades) {
        const key = `${g.course.class.id}:${g.course.subject.name}`;
        const cur = groups.get(key) ?? { class: g.course.class.name, subject: g.course.subject.name, sum: 0, n: 0 };
        cur.sum += g.maxScore ? (g.score / g.maxScore) * 100 : 0;
        cur.n++;
        groups.set(key, cur);
      }
      const rows = [...groups.values()].map((g) => ({ class: g.class, subject: g.subject, grades: g.n, average: Number((g.sum / g.n).toFixed(1)) })).sort((a, b) => a.class.localeCompare(b.class) || a.subject.localeCompare(b.subject));
      return { name, title: "Class performance", generatedAt, columns: ["class", "subject", "grades", "average"], rows };
    }
  }
}

export function isReportName(name: string): name is ReportName {
  return (REPORT_NAMES as readonly string[]).includes(name);
}
