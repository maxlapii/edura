/**
 * Database-backed scheduled jobs. No Redis: trigger `runAllJobs()` from a cron
 * (`pnpm jobs:run`), a platform scheduler hitting POST /api/jobs, or manually.
 * Every run is recorded in JobRun; jobs are idempotent within a day.
 */
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { dispatch } from "@/lib/workflows/engine";
import { getSchoolSettings } from "@/modules/schools/service";
import { listExpiringCertifications } from "@/modules/teachers/service";
import { processOverdueAssignments } from "@/modules/assignments/service";
import { processOverdueTasks } from "@/modules/tasks/service";
import { syncTeacherLeaveStatus } from "@/modules/leave/service";
import { addDays } from "date-fns";

export type JobName =
  | "overdue-assignments"
  | "overdue-tasks"
  | "certification-expiry"
  | "grade-reminders"
  | "leave-status-sync"
  | "meeting-reminders"
  | "substitution-completion";

export interface JobResult {
  name: JobName;
  status: "SUCCESS" | "FAILED";
  result?: unknown;
  error?: string;
  durationMs: number;
}

type JobFn = (schoolId: string, now: Date) => Promise<unknown>;

async function certificationExpiry(schoolId: string, now: Date) {
  const settings = await getSchoolSettings(schoolId);
  const certs = await listExpiringCertifications(schoolId, settings.certificationExpiryWarningDays);
  const weekStart = new Date(now.getTime() - 7 * 86_400_000);
  let emitted = 0;
  for (const c of certs) {
    const recent = await prisma.workflowRun.findFirst({ where: { schoolId, trigger: "CERTIFICATION_EXPIRING", createdAt: { gte: weekStart }, payload: { path: ["certificationId"], equals: c.id } } });
    if (recent) continue; // remind at most weekly
    await dispatch("CERTIFICATION_EXPIRING", schoolId, {
      sourceId: c.id,
      certificationId: c.id,
      certificationName: c.name,
      expiresAt: c.expiresAt,
      teacherId: c.teacherId,
      teacherUserId: c.teacher.user.id,
      teacherName: c.teacher.user.name,
    });
    emitted++;
  }
  return { expiring: certs.length, emitted };
}

async function gradeReminders(schoolId: string, now: Date) {
  const settings = await getSchoolSettings(schoolId);
  const cutoff = new Date(now.getTime() - settings.gradeSubmissionReminderDays * 86_400_000);
  // Assignments past due for more than N days with submissions still ungraded.
  const assignments = await prisma.assignment.findMany({
    where: { schoolId, status: { not: "DRAFT" }, dueDate: { lt: cutoff }, submissions: { some: { status: "SUBMITTED" } } },
    include: { course: { include: { subject: { select: { name: true } }, class: { select: { name: true } }, teacher: { select: { userId: true } } } }, _count: { select: { submissions: { where: { status: "SUBMITTED" } } } } },
  });
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  let emitted = 0;
  for (const a of assignments) {
    const already = await prisma.workflowRun.findFirst({ where: { schoolId, trigger: "GRADE_MISSING", createdAt: { gte: new Date(dayStart.getTime() - 2 * 86_400_000) }, payload: { path: ["assignmentId"], equals: a.id } } });
    if (already) continue;
    await dispatch("GRADE_MISSING", schoolId, {
      sourceId: a.id,
      assignmentId: a.id,
      assignmentTitle: a.title,
      courseName: `${a.course.subject.name} (${a.course.class.name})`,
      teacherUserId: a.course.teacher.userId,
      pendingCount: a._count.submissions,
      dueDate: a.dueDate,
    });
    emitted++;
  }
  return { assignments: assignments.length, emitted };
}

async function meetingReminders(schoolId: string, now: Date) {
  const meetings = await prisma.meeting.findMany({
    where: { schoolId, status: "SCHEDULED", startsAt: { gte: now, lte: addDays(now, 1) } },
    include: { participants: { select: { userId: true } } },
  });
  let sent = 0;
  for (const m of meetings) {
    for (const p of m.participants) {
      const exists = await prisma.notification.findFirst({ where: { userId: p.userId, type: "MEETING_REMINDER", link: `/meetings/${m.id}` } });
      if (exists) continue;
      await notify({ schoolId, userId: p.userId, type: "MEETING_REMINDER", title: `Reminder: ${m.title}`, body: `Starts ${m.startsAt.toISOString().replace("T", " ").slice(0, 16)}`, link: `/meetings/${m.id}` });
      sent++;
    }
  }
  return { meetings: meetings.length, sent };
}

async function substitutionCompletion(schoolId: string, now: Date) {
  const yesterday = new Date(now.getTime() - 86_400_000);
  const r = await prisma.substitution.updateMany({ where: { schoolId, status: "ASSIGNED", date: { lt: yesterday } }, data: { status: "COMPLETED" } });
  return { completed: r.count };
}

export const JOBS: Record<JobName, JobFn> = {
  "overdue-assignments": (s, now) => processOverdueAssignments(s, now),
  "overdue-tasks": (s, now) => processOverdueTasks(s, now),
  "certification-expiry": certificationExpiry,
  "grade-reminders": gradeReminders,
  "leave-status-sync": (s, now) => syncTeacherLeaveStatus(s, now),
  "meeting-reminders": meetingReminders,
  "substitution-completion": substitutionCompletion,
};

export async function runJob(name: JobName, now = new Date()): Promise<JobResult> {
  const started = Date.now();
  const run = await prisma.jobRun.create({ data: { name, status: "RUNNING" } });
  try {
    const schools = await prisma.school.findMany({ where: { isActive: true }, select: { id: true } });
    const result: Record<string, unknown> = {};
    for (const s of schools) result[s.id] = await JOBS[name](s.id, now);
    await prisma.jobRun.update({ where: { id: run.id }, data: { status: "SUCCESS", finishedAt: new Date(), result: JSON.parse(JSON.stringify(result)) } });
    return { name, status: "SUCCESS", result, durationMs: Date.now() - started };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.jobRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), error: message } });
    console.error(`[jobs] ${name} failed`, err);
    return { name, status: "FAILED", error: message, durationMs: Date.now() - started };
  }
}

export async function runAllJobs(now = new Date()): Promise<JobResult[]> {
  const results: JobResult[] = [];
  for (const name of Object.keys(JOBS) as JobName[]) results.push(await runJob(name, now));
  return results;
}

export async function recentJobRuns(take = 50) {
  return prisma.jobRun.findMany({ orderBy: { startedAt: "desc" }, take });
}
