import { describe, expect, it } from "vitest";
import { createSchoolFixture, createUser, asUser, signIn, api, prisma } from "../helpers";
import { REPORT_NAMES, REPORT_CATALOG, generateReport, isReportName, type ReportName } from "@/modules/reports";
import { GET as reportRoute } from "@/app/api/reports/[name]/route";
import { GET as catalogRoute } from "@/app/api/reports/route";

async function seed() {
  const f = await createSchoolFixture();
  const session = await prisma.attendanceSession.create({ data: { schoolId: f.school.id, courseId: f.course.id, date: new Date("2026-09-14T00:00:00Z"), status: "SUBMITTED" } });
  await prisma.attendanceRecord.createMany({ data: f.students.map((s, i) => ({ schoolId: f.school.id, sessionId: session.id, studentId: s.student.id, date: session.date, status: i === 0 ? "ABSENT" : "PRESENT" })) });
  const assignment = await prisma.assignment.create({ data: { schoolId: f.school.id, courseId: f.course.id, title: "HW", dueDate: new Date("2026-09-20T00:00:00Z"), maxScore: 10 } });
  await prisma.submission.create({ data: { schoolId: f.school.id, assignmentId: assignment.id, studentId: f.students[0].student.id, status: "SUBMITTED" } });
  await prisma.grade.create({ data: { schoolId: f.school.id, studentId: f.students[1].student.id, courseId: f.course.id, termId: f.term.id, assignmentId: assignment.id, score: 8, maxScore: 10, status: "SUBMITTED" } });
  await prisma.lessonPlan.create({ data: { schoolId: f.school.id, courseId: f.course.id, teacherId: f.teacher.teacher.id, title: "L1", status: "COMPLETED" } });
  await prisma.leaveRequest.create({ data: { schoolId: f.school.id, requesterUserId: f.teacher.user.id, teacherId: f.teacher.teacher.id, startDate: new Date("2026-10-01T00:00:00Z"), endDate: new Date("2026-10-02T00:00:00Z"), status: "APPROVED" } });
  await prisma.substitution.create({ data: { schoolId: f.school.id, timetableSlotId: f.slots[3].id, date: new Date("2026-10-01T00:00:00Z"), absentTeacherId: f.teacher.teacher.id, substituteTeacherId: f.teacher2.teacher.id, status: "ASSIGNED" } });
  await prisma.maintenanceRequest.create({ data: { schoolId: f.school.id, title: "Broken chair", reportedByUserId: f.teacher.user.id, dueDate: new Date("2020-01-01T00:00:00Z") } });
  await prisma.event.create({ data: { schoolId: f.school.id, title: "Fair", startsAt: new Date("2026-10-10T09:00:00Z"), endsAt: new Date("2026-10-10T12:00:00Z") } });
  await prisma.task.create({ data: { schoolId: f.school.id, title: "Old task", assigneeUserId: f.teacher.user.id, dueDate: new Date("2020-01-01T00:00:00Z") } });
  await prisma.teacherDuty.create({ data: { schoolId: f.school.id, teacherId: f.teacher.teacher.id, name: "Bus duty", weeklyHours: 1 } });
  return f;
}

describe("reports", () => {
  it("every report generates for an administrator with its declared columns", async () => {
    const f = await seed();
    for (const name of REPORT_NAMES) {
      const report = await generateReport(f.admin, name, { format: "json", classId: name === "class-attendance" ? f.cls.id : undefined });
      expect(report.name).toBe(name);
      expect(report.columns.length).toBeGreaterThan(0);
      for (const row of report.rows) for (const col of report.columns) expect(row).toHaveProperty(col);
    }
    expect(REPORT_CATALOG.map((r) => r.name).sort()).toEqual([...REPORT_NAMES].sort());
    expect(isReportName("tasks")).toBe(true);
    expect(isReportName("nope")).toBe(false);
  });

  it("reports contain the seeded facts", async () => {
    const f = await seed();
    const attendance = await generateReport(f.admin, "student-attendance", { format: "json" });
    expect(attendance.rows).toHaveLength(3);
    expect(attendance.rows[0]).toMatchObject({ absent: 1, attendanceRate: 0 });
    const cls = await generateReport(f.admin, "class-attendance", { format: "json", classId: f.cls.id });
    expect(cls.rows).toHaveLength(3);
    const completion = await generateReport(f.admin, "assignment-completion", { format: "json" });
    expect(completion.rows[0]).toMatchObject({ students: 3, submitted: 1, missing: 2 });
    const grading = await generateReport(f.admin, "grading-status", { format: "json" });
    expect(grading.rows[0]).toMatchObject({ submitted: 1, status: "SUBMITTED" });
    const teacherGrading = await generateReport(f.teacher.auth, "grading-status", { format: "json" });
    expect(teacherGrading.rows[0]).toMatchObject({ pending: 1 });
    const curriculum = await generateReport(f.teacher.auth, "curriculum-progress", { format: "json" });
    expect(curriculum.rows[0]).toMatchObject({ planned: 1, completed: 1, completionRate: 100 });
    const workload = await generateReport(f.admin, "teacher-workload", { format: "json" });
    expect(workload.rows.find((r) => r.name === "Teacher One")).toMatchObject({ teachingPeriods: 7, dutyHours: 1 });
    const ownWorkload = await generateReport(f.teacher.auth, "teacher-workload", { format: "json" });
    expect(ownWorkload.rows).toHaveLength(1);
    expect((await generateReport(f.admin, "teacher-attendance", { format: "json" })).rows[0]).toMatchObject({ leaveRequests: 1, days: 2 });
    expect((await generateReport(f.admin, "leave", { format: "json" })).summary).toMatchObject({ approved: 1 });
    expect((await generateReport(f.admin, "substitution", { format: "json" })).summary).toMatchObject({ perSubstitute: { "Teacher Two": 1 } });
    expect((await generateReport(f.admin, "maintenance", { format: "json" })).summary).toMatchObject({ open: 1, overdue: 1 });
    expect((await generateReport(f.admin, "events", { format: "json" })).rows).toHaveLength(1);
    expect((await generateReport(f.admin, "tasks", { format: "json" })).summary).toMatchObject({ overdue: 1 });
    expect((await generateReport(f.teacher.auth, "tasks", { format: "json" })).rows).toHaveLength(1);
    expect((await generateReport(f.admin, "class-performance", { format: "json" })).rows[0]).toMatchObject({ class: "10A", subject: "Mathematics", average: 80 });
    await expect(generateReport(f.admin, "class-attendance", { format: "json" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("enforces who may run which report", async () => {
    const f = await seed();
    for (const name of ["teacher-attendance", "leave", "substitution", "maintenance", "class-performance"] as ReportName[]) {
      await expect(generateReport(f.teacher.auth, name, { format: "json" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(generateReport(f.teacher.auth, "teacher-workload", { format: "json", teacherId: f.teacher2.teacher.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(generateReport(f.students[0].auth!, "student-attendance", { format: "json" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(generateReport(f.guardian.auth, "assignment-completion", { format: "json" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const head = await asUser((await createUser("DEPARTMENT_HEAD", f.school.id)).id);
    await expect(generateReport(head, "leave", { format: "json" })).resolves.toBeTruthy();
  });

  it("serves JSON and CSV over HTTP and 404s unknown reports", async () => {
    const f = await seed();
    const cookie = await signIn(f.adminUser.email);
    const json = await api(reportRoute, { cookie, params: { name: "tasks" } });
    expect(json.status).toBe(200);
    expect((json.data as { rows: unknown[] }).rows).toHaveLength(1);
    const csv = await api(reportRoute, { cookie, params: { name: "student-attendance" }, query: { format: "csv" } });
    expect(csv.status).toBe(200);
    expect(csv.text.split("\n")[0]).toBe("studentNumber,name,class,total,present,absent,late,excused,attendanceRate");
    expect((await api(reportRoute, { cookie, params: { name: "nope" } })).status).toBe(404);
    expect((await api(reportRoute, { cookie: await signIn(f.students[0].user!.email), params: { name: "student-attendance" } })).status).toBe(403);
    const catalog = await api(catalogRoute, { cookie });
    expect((catalog.data as unknown[]).length).toBe(REPORT_NAMES.length);
  });
});
