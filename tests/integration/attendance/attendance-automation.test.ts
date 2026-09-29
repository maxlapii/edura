import { describe, expect, it } from "vitest";
import { createSchoolFixture, prisma } from "../helpers";
import { emailOutbox } from "@/tests/setup/integration";
import { openSession, recordAttendance } from "@/modules/attendance/service";
import { toDateOnly } from "@/lib/utils/dates";

const today = toDateOnly(new Date());
const daysAgo = (n: number) => new Date(today.getTime() - n * 86_400_000);

async function submitAbsent(f: Awaited<ReturnType<typeof createSchoolFixture>>, date: Date, studentId: string, status: "ABSENT" | "PRESENT" | "LATE" = "ABSENT") {
  const { session } = await openSession(f.teacher.auth, { courseId: f.course.id, date, periodId: null, timetableSlotId: null });
  await recordAttendance(f.teacher.auth, session.id, { markAllPresent: true, submit: true, records: [{ studentId, status }] });
  return session;
}

describe("attendance automation", () => {
  it("notifies the guardian (in-app + email) and records a workflow run when a student is marked ABSENT", async () => {
    const f = await createSchoolFixture();
    const s0 = f.students[0].student;
    const session = await submitAbsent(f, today, s0.id);

    const notifications = await prisma.notification.findMany({ where: { type: "STUDENT_ABSENT" } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ userId: f.guardian.user.id, schoolId: f.school.id, title: "Kid1 Tester was absent from Mathematics (10A)", link: `/students/${s0.id}` });
    expect(notifications[0].body).toContain(today.toISOString().slice(0, 10));
    expect(notifications[0].emailSentAt).toBeInstanceOf(Date);

    expect(emailOutbox.sent).toHaveLength(1);
    expect(emailOutbox.sent[0]).toMatchObject({ to: f.guardian.user.email, subject: "[Edura] Kid1 Tester was absent from Mathematics (10A)" });
    expect(emailOutbox.sent[0].text).toContain(`/students/${s0.id}`);

    const runs = await prisma.workflowRun.findMany({ where: { schoolId: f.school.id } });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ trigger: "ATTENDANCE_RECORDED", status: "SUCCESS", error: null });
    expect(runs[0].ruleId).not.toBeNull();
    expect(runs[0].payload).toMatchObject({ sessionId: session.id, studentId: s0.id, status: "ABSENT", guardianUserIds: [f.guardian.user.id] });
    expect(runs[0].result).toEqual({ actions: [{ type: "SEND_NOTIFICATION", detail: "1 recipient(s)" }] });

    // Re-submitting the same session with the student still absent does not notify again.
    await recordAttendance(f.teacher.auth, session.id, { markAllPresent: true, submit: true, records: [{ studentId: s0.id, status: "ABSENT", note: "confirmed" }] });
    expect(await prisma.notification.count({ where: { type: "STUDENT_ABSENT" } })).toBe(1);
    expect(emailOutbox.sent).toHaveLength(1);
    expect(await prisma.workflowRun.count()).toBe(1);
  });

  it("an absent student without guardians still produces a run but no notification", async () => {
    const f = await createSchoolFixture();
    await submitAbsent(f, today, f.students[1].student.id);
    expect(await prisma.notification.count()).toBe(0);
    expect(emailOutbox.sent).toHaveLength(0);
    const run = await prisma.workflowRun.findFirstOrThrow({ where: { trigger: "ATTENDANCE_RECORDED" } });
    expect(run).toMatchObject({ status: "SUCCESS", result: { actions: [{ type: "SEND_NOTIFICATION", detail: "0 recipient(s)" }] } });
  });

  it("PRESENT and LATE records create no notification, email or workflow run", async () => {
    const f = await createSchoolFixture();
    await submitAbsent(f, today, f.students[0].student.id, "PRESENT");
    await submitAbsent(f, daysAgo(1), f.students[0].student.id, "LATE");
    expect(await prisma.notification.count()).toBe(0);
    expect(emailOutbox.sent).toHaveLength(0);
    expect(await prisma.workflowRun.count()).toBe(0);
    expect(await prisma.task.count()).toBe(0);
  });

  it("reaching the absence threshold alerts admins + homeroom teacher and creates a follow-up task", async () => {
    const f = await createSchoolFixture();
    const s0 = f.students[0].student;
    await submitAbsent(f, daysAgo(2), s0.id);
    await submitAbsent(f, daysAgo(1), s0.id);
    expect(await prisma.workflowRun.count({ where: { trigger: "ABSENCE_THRESHOLD_REACHED" } })).toBe(0);
    expect(await prisma.task.count()).toBe(0);

    await submitAbsent(f, today, s0.id);
    const runs = await prisma.workflowRun.findMany({ where: { trigger: "ABSENCE_THRESHOLD_REACHED" } });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: "SUCCESS" });
    expect(runs[0].payload).toMatchObject({ studentId: s0.id, absenceCount: 3, threshold: 3, windowDays: 30, homeroomTeacherUserId: f.teacher.user.id });

    const tasks = await prisma.task.findMany();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ schoolId: f.school.id, assigneeUserId: f.teacher.user.id, title: "Follow up on absences: Kid1 Tester", priority: "HIGH", status: "TODO", source: "WORKFLOW" });
    expect(tasks[0].dueDate!.getTime()).toBeGreaterThan(Date.now() + 2 * 86_400_000);

    const alerts = await prisma.notification.findMany({ where: { type: "ABSENCE_THRESHOLD" } });
    expect(alerts.map((a) => a.userId).sort()).toEqual([f.admin.id, f.principal.id, f.teacher.user.id].sort());
    expect(alerts[0].body).toBe("Kid1 Tester has 3 absences in the last 30 days.");
    // Three absence notifications for the guardian, one per day.
    expect(await prisma.notification.count({ where: { type: "STUDENT_ABSENT", userId: f.guardian.user.id } })).toBe(3);
    expect(emailOutbox.sent).toHaveLength(3);
  });

  it("respects the school's configured threshold and disabled rules", async () => {
    const f = await createSchoolFixture();
    await prisma.school.update({ where: { id: f.school.id }, data: { settings: { absenceThreshold: 2 } } });
    await prisma.workflowRule.updateMany({ where: { schoolId: f.school.id, trigger: "ATTENDANCE_RECORDED" }, data: { isActive: false } });
    const s0 = f.students[0].student;
    await submitAbsent(f, daysAgo(1), s0.id);
    await submitAbsent(f, today, s0.id);

    expect(await prisma.notification.count({ where: { type: "STUDENT_ABSENT" } })).toBe(0);
    expect(emailOutbox.sent).toHaveLength(0);
    expect(await prisma.workflowRun.count({ where: { trigger: "ATTENDANCE_RECORDED" } })).toBe(0);
    expect(await prisma.workflowRun.count({ where: { trigger: "ABSENCE_THRESHOLD_REACHED" } })).toBe(1);
    expect(await prisma.task.count({ where: { assigneeUserId: f.teacher.user.id } })).toBe(1);
  });
});
