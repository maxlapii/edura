import { describe, expect, it } from "vitest";
import { createSchoolFixture, createUser, asUser, signIn, api, prisma } from "../helpers";
import { adminDashboard, dashboardForUser, departmentDashboard, parentDashboard, principalDashboard, staffDashboard, studentDashboard, teacherDashboard } from "@/modules/dashboards";
import { GET as dashboardRoute } from "@/app/api/dashboard/route";
import { toDateOnly } from "@/lib/utils/dates";

describe("dashboards", () => {
  it("teacher dashboard answers 'what do I need to do today?'", async () => {
    const f = await createSchoolFixture();
    const today = toDateOnly(new Date());
    await prisma.task.create({ data: { schoolId: f.school.id, title: "Overdue", assigneeUserId: f.teacher.user.id, dueDate: new Date("2020-01-01T00:00:00Z") } });
    const assignment = await prisma.assignment.create({ data: { schoolId: f.school.id, courseId: f.course.id, title: "HW", dueDate: new Date("2020-01-01T00:00:00Z") } });
    await prisma.submission.create({ data: { schoolId: f.school.id, assignmentId: assignment.id, studentId: f.students[0].student.id } });
    await prisma.meeting.create({ data: { schoolId: f.school.id, title: "Tomorrow", startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000), organizerUserId: f.adminUser.id, participants: { create: [{ userId: f.teacher.user.id }] } } });
    await prisma.notification.create({ data: { schoolId: f.school.id, userId: f.teacher.user.id, type: "GENERIC", title: "Hello" } });
    const d = await teacherDashboard(f.teacher.auth);
    expect(d.today.getTime()).toBe(today.getTime());
    expect(d.schedule.lessons).toHaveLength(1);
    expect(d.pendingAttendance).toHaveLength(1);
    expect(d.pendingGrading[0]).toMatchObject({ pending: 1 });
    expect(d.missingSubmissions).toBe(1);
    expect(d.tasks).toHaveLength(1);
    expect(d.overdueTasks).toBe(1);
    expect(d.meetings).toHaveLength(1);
    expect(d.unreadNotifications).toBeGreaterThanOrEqual(1);
    await expect(teacherDashboard(f.students[0].auth!)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admin and principal dashboards summarise school operations", async () => {
    const f = await createSchoolFixture();
    const today = toDateOnly(new Date());
    await prisma.leaveRequest.create({ data: { schoolId: f.school.id, requesterUserId: f.teacher.user.id, teacherId: f.teacher.teacher.id, startDate: today, endDate: today, status: "APPROVED" } });
    await prisma.substitution.create({ data: { schoolId: f.school.id, timetableSlotId: f.slots.find((s) => s.dayOfWeek === (today.getUTCDay() || 7))!.id, date: today, absentTeacherId: f.teacher.teacher.id, status: "PENDING" } });
    await prisma.approval.create({ data: { schoolId: f.school.id, type: "LEAVE", entityType: "LeaveRequest", entityId: "x", title: "Leave", requesterUserId: f.teacher.user.id } });
    await prisma.leaveRequest.create({ data: { schoolId: f.school.id, requesterUserId: f.teacher2.user.id, teacherId: f.teacher2.teacher.id, startDate: new Date("2026-12-01T00:00:00Z"), endDate: new Date("2026-12-01T00:00:00Z"), status: "PENDING" } });
    await prisma.maintenanceRequest.create({ data: { schoolId: f.school.id, title: "Leak", reportedByUserId: f.teacher.user.id, dueDate: new Date("2020-01-01T00:00:00Z") } });
    const a = await adminDashboard(f.admin);
    expect(a.counts).toEqual({ teachers: 2, students: 3, classes: 1, staff: 0 });
    expect(a.lessonsToday).toBe(1);
    expect(a.absentTeachers).toHaveLength(1);
    expect(a.substitutionsNeeded).toHaveLength(1);
    expect(a.pendingApprovals).toBe(1);
    expect(a.pendingLeave).toHaveLength(1);
    expect(a.maintenance.open).toBe(1);
    expect(a.maintenance.overdueCount).toBe(1);
    expect(a.workload.all).toHaveLength(2);
    const p = await principalDashboard(f.principal);
    expect(p.attendance30Days).toMatchObject({ total: 0, rate: 100 });
    expect(p.academic.gradedItems).toBe(0);
    await expect(adminDashboard(f.teacher.auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("department, student, parent and staff dashboards", async () => {
    const f = await createSchoolFixture();
    await prisma.department.update({ where: { id: f.department.id }, data: { headTeacherId: f.teacher.teacher.id } });
    await prisma.user.update({ where: { id: f.teacher.user.id }, data: { role: "DEPARTMENT_HEAD" } });
    const head = await asUser(f.teacher.user.id);
    const dep = await departmentDashboard(head);
    expect(dep.department?.id).toBe(f.department.id);
    expect(dep.teachers).toHaveLength(2);
    expect(dep.courses).toHaveLength(1);
    expect(dep.workload).toHaveLength(2);
    await expect(departmentDashboard(f.teacher2.auth)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const s = await studentDashboard(f.students[0].auth!);
    expect(s.student.id).toBe(f.students[0].student.id);
    expect(s.todayLessons).toHaveLength(1);
    expect(s.courses).toHaveLength(1);
    expect(s.attendance.stats.total).toBe(0);

    const p = await parentDashboard(f.guardian.auth);
    expect(p.children).toHaveLength(1);
    expect(p.children[0].child.id).toBe(f.students[0].student.id);
    expect(p.children[0].todayLessons).toHaveLength(1);

    const staffUser = await createUser("STAFF", f.school.id);
    await prisma.staff.create({ data: { schoolId: f.school.id, userId: staffUser.id, employeeNumber: "S1", staffType: "MAINTENANCE" } });
    const st = await staffDashboard(await asUser(staffUser.id));
    expect(st.maintenance).not.toBeNull();
    expect(st.tasks).toEqual([]);
  });

  it("dashboardForUser picks the right view per role and is exposed over HTTP", async () => {
    const f = await createSchoolFixture();
    expect((await dashboardForUser(f.admin)).kind).toBe("admin");
    expect((await dashboardForUser(f.principal)).kind).toBe("principal");
    expect((await dashboardForUser(f.teacher.auth)).kind).toBe("teacher");
    expect((await dashboardForUser(f.students[0].auth!)).kind).toBe("student");
    expect((await dashboardForUser(f.guardian.auth)).kind).toBe("parent");
    const staffUser = await createUser("STAFF", f.school.id);
    expect((await dashboardForUser(await asUser(staffUser.id))).kind).toBe("staff");
    await prisma.department.update({ where: { id: f.department.id }, data: { headTeacherId: f.teacher.teacher.id } });
    await prisma.user.update({ where: { id: f.teacher.user.id }, data: { role: "DEPARTMENT_HEAD" } });
    const head = await dashboardForUser(await asUser(f.teacher.user.id));
    expect(head.kind).toBe("teacher");
    expect("department" in head && head.department?.department?.id).toBe(f.department.id);
    const res = await api(dashboardRoute, { cookie: await signIn(f.guardian.user.email) });
    expect(res.status).toBe(200);
    expect((res.data as { kind: string }).kind).toBe("parent");
  });
});
