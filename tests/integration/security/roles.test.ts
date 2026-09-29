import { describe, expect, it } from "vitest";
import { api, createSchoolFixture, createUser, prisma, signIn } from "../helpers";
import { POST as createTeacherRoute, GET as listTeachersRoute } from "@/app/api/teachers/route";
import { GET as listUsersRoute } from "@/app/api/users/route";
import { POST as createClassRoute } from "@/app/api/classes/route";
import { GET as pendingGradesRoute } from "@/app/api/grades/pending/route";
import { GET as auditRoute } from "@/app/api/audit/route";
import { POST as createDepartmentRoute } from "@/app/api/departments/route";
import { POST as createSlotRoute } from "@/app/api/timetable/route";

describe("role permissions through the HTTP routes", () => {
  it("STUDENT cannot create teachers", async () => {
    const f = await createSchoolFixture();
    const res = await api(createTeacherRoute, { cookie: await signIn(f.students[0].user!.email), body: { name: "Hacker", email: "hacker@test.dev", employeeNumber: "T-666" } });
    expect(res.status).toBe(403);
    expect(res.error).toMatchObject({ code: "FORBIDDEN", message: expect.stringContaining("teachers:manage") });
    expect(await prisma.user.count({ where: { email: "hacker@test.dev" } })).toBe(0);
  });

  it("PARENT cannot list users", async () => {
    const f = await createSchoolFixture();
    const res = await api(listUsersRoute, { cookie: await signIn(f.guardian.user.email) });
    expect(res.status).toBe(403);
    expect(res.error?.code).toBe("FORBIDDEN");
  });

  it("TEACHER cannot create classes or timetable slots", async () => {
    const f = await createSchoolFixture();
    const cookie = await signIn(f.teacher.user.email);
    const cls = await api(createClassRoute, { cookie, body: { academicYearId: f.year.id, name: "Rogue" } });
    expect(cls.status).toBe(403);
    expect(await prisma.schoolClass.count({ where: { name: "Rogue" } })).toBe(0);
    const slot = await api(createSlotRoute, { cookie, body: { courseId: f.course.id, dayOfWeek: 1, periodId: f.periods[1].id } });
    expect(slot.status).toBe(403);
    expect(await prisma.timetableSlot.count({ where: { schoolId: f.school.id } })).toBe(7);
  });

  it("STAFF cannot read pending grading", async () => {
    const f = await createSchoolFixture();
    const staff = await createUser("STAFF", f.school.id);
    const res = await api(pendingGradesRoute, { cookie: await signIn(staff.email) });
    expect(res.status).toBe(403);
    expect(res.error?.message).toContain("grades:read");
    // but staff can read the teacher directory
    expect((await api(listTeachersRoute, { cookie: await signIn(staff.email) })).status).toBe(200);
    // and a teacher can read their own pending grading
    expect((await api(pendingGradesRoute, { cookie: await signIn(f.teacher.user.email) })).status).toBe(200);
  });

  it("DEPARTMENT_HEAD passes the coarse permission but the service refuses department creation", async () => {
    const f = await createSchoolFixture();
    await prisma.department.update({ where: { id: f.department.id }, data: { headTeacherId: f.teacher.teacher.id } });
    await prisma.user.update({ where: { id: f.teacher.user.id }, data: { role: "DEPARTMENT_HEAD" } });
    const res = await api(createDepartmentRoute, { cookie: await signIn(f.teacher.user.email), body: { name: "Shadow", code: "SHD" } });
    expect(res.status).toBe(403);
    expect(res.error?.message).toMatch(/Department heads cannot create/);
    expect(await prisma.department.count({ where: { code: "SHD" } })).toBe(0);
  });

  it("TEACHER cannot read the audit log; SCHOOL_ADMIN can and sees prior actions", async () => {
    const f = await createSchoolFixture();
    const adminCookie = await signIn(f.adminUser.email);
    const created = await api(createTeacherRoute, { cookie: adminCookie, body: { name: "Audited Teacher", email: "audited@test.dev", employeeNumber: "T-777" } });
    expect(created.status).toBe(201);
    const teacherId = (created.data as { teacher: { id: string } }).teacher.id;

    const denied = await api(auditRoute, { cookie: await signIn(f.teacher.user.email) });
    expect(denied.status).toBe(403);
    const asStudent = await api(auditRoute, { cookie: await signIn(f.students[0].user!.email) });
    expect(asStudent.status).toBe(403);

    const allowed = await api(auditRoute, { cookie: adminCookie });
    expect(allowed.status).toBe(200);
    const rows = allowed.data as { action: string; entityType: string; entityId: string | null; schoolId: string; user: { id: string } | null }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.schoolId === f.school.id)).toBe(true);
    const entry = rows.find((r) => r.action === "teacher.create");
    expect(entry).toMatchObject({ entityType: "Teacher", entityId: teacherId, user: { id: f.admin.id } });

    const filtered = await api(auditRoute, { cookie: adminCookie, query: { entityType: "Teacher", entityId: teacherId } });
    expect((filtered.data as { action: string }[]).map((r) => r.action)).toEqual(["teacher.create"]);
    const principal = await api(auditRoute, { cookie: await signIn((await prisma.user.findUniqueOrThrow({ where: { id: f.principal.id } })).email) });
    expect(principal.status).toBe(200);
  });
});
