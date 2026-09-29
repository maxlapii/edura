import { describe, expect, it } from "vitest";
import { emailOutbox } from "../../setup/integration";
import { createSchoolFixture, prisma } from "../helpers";
import { JOBS, recentJobRuns, runAllJobs, runJob } from "@/lib/jobs";
import { createAssignment, createAssignmentSchema, submitAssignment } from "@/modules/assignments";

const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY);
const assignment = (courseId: string, o: Record<string, unknown> = {}) => createAssignmentSchema.parse({ courseId, title: "Homework", dueDate: inDays(-1), ...o });

describe("scheduled jobs", () => {
  it("overdue-assignments emits ASSIGNMENT_OVERDUE once per missing student", async () => {
    const f = await createSchoolFixture();
    const a = await createAssignment(f.teacher.auth, assignment(f.course.id, { title: "Essay" }));
    await submitAssignment(f.students[0].auth!, a.id, { content: "done", attachments: [] });
    await createAssignment(f.teacher.auth, assignment(f.course.id, { title: "Not due yet", dueDate: inDays(2) }));
    await createAssignment(f.teacher.auth, assignment(f.course.id, { title: "Draft", status: "DRAFT" }));
    await prisma.notification.deleteMany();

    const first = await runJob("overdue-assignments");
    expect(first.status).toBe("SUCCESS");
    expect(first.result).toEqual({ [f.school.id]: { assignments: 1, emitted: 2 } });
    const runs = await prisma.workflowRun.findMany({ where: { trigger: "ASSIGNMENT_OVERDUE" } });
    expect(runs).toHaveLength(2);
    expect(new Set(runs.map((r) => (r.payload as { studentId: string }).studentId))).toEqual(new Set([f.students[1].student.id, f.students[2].student.id]));
    const notes = await prisma.notification.findMany({ where: { type: "ASSIGNMENT_OVERDUE" } });
    expect(new Set(notes.map((n) => n.userId))).toEqual(new Set([f.students[1].user!.id, f.students[2].user!.id]));
    expect(notes[0]).toMatchObject({ title: "Overdue: Essay", link: `/assignments/${a.id}` });
    expect(notes[0].body).toContain("Mathematics (10A)");
    // the guardian is linked to the student who submitted → not notified
    expect(await prisma.notification.count({ where: { userId: f.guardian.user.id } })).toBe(0);

    const second = await runJob("overdue-assignments");
    expect(second.result).toEqual({ [f.school.id]: { assignments: 1, emitted: 0 } });
    expect(await prisma.workflowRun.count({ where: { trigger: "ASSIGNMENT_OVERDUE" } })).toBe(2);
    expect(await prisma.notification.count({ where: { type: "ASSIGNMENT_OVERDUE" } })).toBe(2);
    expect(await prisma.jobRun.count({ where: { name: "overdue-assignments", status: "SUCCESS" } })).toBe(2);
  });

  it("certification-expiry reminds the teacher and admins and creates a renewal task (at most weekly)", async () => {
    const f = await createSchoolFixture();
    const cert = await prisma.certification.create({ data: { schoolId: f.school.id, teacherId: f.teacher.teacher.id, name: "First Aid", expiresAt: inDays(10) } });
    await prisma.certification.create({ data: { schoolId: f.school.id, teacherId: f.teacher2.teacher.id, name: "Far away", expiresAt: inDays(90) } });
    await prisma.certification.create({ data: { schoolId: f.school.id, teacherId: f.teacher2.teacher.id, name: "Already expired", expiresAt: inDays(-1) } });
    emailOutbox.sent.length = 0;

    const res = await runJob("certification-expiry");
    expect(res.result).toEqual({ [f.school.id]: { expiring: 1, emitted: 1 } });
    const run = await prisma.workflowRun.findFirstOrThrow({ where: { trigger: "CERTIFICATION_EXPIRING" } });
    expect(run.status).toBe("SUCCESS");
    expect(run.payload).toMatchObject({ certificationId: cert.id, certificationName: "First Aid", teacherId: f.teacher.teacher.id, teacherUserId: f.teacher.user.id, teacherName: f.teacher.user.name });
    const notes = await prisma.notification.findMany({ where: { type: "CERTIFICATION_EXPIRING" } });
    expect(new Set(notes.map((n) => n.userId))).toEqual(new Set([f.teacher.user.id, f.adminUser.id, f.principal.id]));
    expect(notes[0].title).toBe("Certification expiring: First Aid");
    expect(notes[0].link).toBe(`/teachers/${f.teacher.teacher.id}`);
    expect(notes.every((n) => n.emailSentAt !== null)).toBe(true);
    expect(emailOutbox.sent.map((m) => m.to).sort()).toEqual([f.adminUser.email, f.principal.email, f.teacher.user.email].sort());
    const tasks = await prisma.task.findMany();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ assigneeUserId: f.teacher.user.id, title: "Renew certification: First Aid", priority: "HIGH", source: "WORKFLOW", sourceId: cert.id });
    expect(tasks[0].dueDate!.getTime()).toBeGreaterThan(Date.now() + 13 * DAY);

    // second run within the week: nothing new
    expect((await runJob("certification-expiry")).result).toEqual({ [f.school.id]: { expiring: 1, emitted: 0 } });
    expect(await prisma.task.count()).toBe(1);
    expect(await prisma.notification.count({ where: { type: "CERTIFICATION_EXPIRING" } })).toBe(3);
  });

  it("grade-reminders emits GRADE_MISSING for past-due assignments with ungraded submissions", async () => {
    const f = await createSchoolFixture();
    const a = await createAssignment(f.teacher.auth, assignment(f.course.id, { title: "Lab report", dueDate: inDays(-5) }));
    await submitAssignment(f.students[0].auth!, a.id, { content: "x", attachments: [] });
    await submitAssignment(f.students[1].auth!, a.id, { content: "y", attachments: [] });
    // recently due (inside the 2-day grace period) → not yet reminded
    const recent = await createAssignment(f.teacher.auth, assignment(f.course.id, { title: "Recent", dueDate: inDays(-1) }));
    await submitAssignment(f.students[2].auth!, recent.id, { content: "z", attachments: [] });
    // past due but nothing to grade
    await createAssignment(f.teacher.auth, assignment(f.course.id, { title: "Nobody submitted", dueDate: inDays(-9) }));

    const res = await runJob("grade-reminders");
    expect(res.result).toEqual({ [f.school.id]: { assignments: 1, emitted: 1 } });
    const run = await prisma.workflowRun.findFirstOrThrow({ where: { trigger: "GRADE_MISSING" } });
    expect(run.payload).toMatchObject({ assignmentId: a.id, assignmentTitle: "Lab report", courseName: "Mathematics (10A)", teacherUserId: f.teacher.user.id, pendingCount: 2 });
    const note = await prisma.notification.findFirstOrThrow({ where: { type: "GRADE_REMINDER" } });
    expect(note).toMatchObject({ userId: f.teacher.user.id, title: "Grades pending: Mathematics (10A)", body: "2 submission(s) in Mathematics (10A) are waiting to be graded.", link: `/assignments/${a.id}` });
    const task = await prisma.task.findFirstOrThrow();
    expect(task).toMatchObject({ assigneeUserId: f.teacher.user.id, title: "Grade Mathematics (10A): Lab report", priority: "MEDIUM", source: "WORKFLOW", sourceId: a.id });

    expect((await runJob("grade-reminders")).result).toEqual({ [f.school.id]: { assignments: 1, emitted: 0 } });
    expect(await prisma.task.count()).toBe(1);
    expect(await prisma.notification.count({ where: { type: "GRADE_REMINDER" } })).toBe(1);
  });

  it("meeting-reminders notifies participants of meetings within 24h exactly once", async () => {
    const f = await createSchoolFixture();
    const soon = await prisma.meeting.create({ data: { schoolId: f.school.id, title: "Department sync", startsAt: new Date(Date.now() + 2 * 3_600_000), endsAt: new Date(Date.now() + 3 * 3_600_000), organizerUserId: f.adminUser.id, participants: { create: [{ userId: f.teacher.user.id }, { userId: f.teacher2.user.id }] } } });
    await prisma.meeting.create({ data: { schoolId: f.school.id, title: "Next week", startsAt: inDays(6), endsAt: inDays(6), organizerUserId: f.adminUser.id, participants: { create: [{ userId: f.teacher.user.id }] } } });
    await prisma.meeting.create({ data: { schoolId: f.school.id, title: "Cancelled", status: "CANCELLED", startsAt: new Date(Date.now() + 3_600_000), endsAt: new Date(Date.now() + 2 * 3_600_000), organizerUserId: f.adminUser.id, participants: { create: [{ userId: f.teacher.user.id }] } } });

    const res = await runJob("meeting-reminders");
    expect(res.result).toEqual({ [f.school.id]: { meetings: 1, sent: 2 } });
    const notes = await prisma.notification.findMany({ where: { type: "MEETING_REMINDER" } });
    expect(new Set(notes.map((n) => n.userId))).toEqual(new Set([f.teacher.user.id, f.teacher2.user.id]));
    expect(notes[0]).toMatchObject({ title: "Reminder: Department sync", link: `/meetings/${soon.id}` });
    expect((await runJob("meeting-reminders")).result).toEqual({ [f.school.id]: { meetings: 1, sent: 0 } });
    expect(await prisma.notification.count({ where: { type: "MEETING_REMINDER" } })).toBe(2);
  });

  it("runAllJobs records one SUCCESS JobRun per job", async () => {
    const f = await createSchoolFixture();
    const names = Object.keys(JOBS);
    const results = await runAllJobs();
    expect(results.map((r) => r.name)).toEqual(names);
    expect(results.every((r) => r.status === "SUCCESS" && r.error === undefined && r.durationMs >= 0)).toBe(true);
    const rows = await prisma.jobRun.findMany({ orderBy: { startedAt: "asc" } });
    expect(rows.map((r) => r.name)).toEqual(names);
    expect(rows.every((r) => r.status === "SUCCESS" && r.finishedAt !== null && r.error === null)).toBe(true);
    expect(rows.every((r) => Object.keys(r.result as object).includes(f.school.id))).toBe(true);
    expect((await recentJobRuns(3)).map((r) => r.name)).toEqual(names.slice(-3).reverse());
    // inactive schools are skipped
    await prisma.school.update({ where: { id: f.school.id }, data: { isActive: false } });
    expect((await runJob("leave-status-sync")).result).toEqual({});
  });
});
