import { describe, expect, it } from "vitest";
import { createSchoolFixture, createUser, signIn, api, TEST_PASSWORD, prisma } from "../helpers";
import { auth } from "@/lib/auth";
import { GET as me } from "@/app/api/me/route";
import { GET as listTeachers } from "@/app/api/teachers/route";
import { loadAuthUser } from "@/lib/auth/session";

describe("authentication", () => {
  it("signs in with email/password and creates a database session", async () => {
    const f = await createSchoolFixture();
    const cookie = await signIn(f.adminUser.email);
    expect(cookie).toContain("better-auth");
    const sessions = await prisma.session.count({ where: { userId: f.adminUser.id } });
    expect(sessions).toBe(1);
    const res = await api(me, { cookie });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ email: f.adminUser.email, role: "SCHOOL_ADMIN", schoolId: f.school.id });
  });

  it("rejects wrong passwords and unknown users", async () => {
    const f = await createSchoolFixture();
    await expect(signIn(f.adminUser.email, "wrong-password")).rejects.toThrow(/Sign-in failed/);
    await expect(signIn("nobody@test.dev")).rejects.toThrow(/Sign-in failed/);
  });

  it("does not allow public sign-up", async () => {
    const res = await auth.api.signUpEmail({ body: { email: "new@test.dev", password: TEST_PASSWORD, name: "New" }, asResponse: true }).catch((e: Response | Error) => e);
    const status = res instanceof Response ? res.status : 400;
    expect(status).toBeGreaterThanOrEqual(400);
    expect(await prisma.user.count({ where: { email: "new@test.dev" } })).toBe(0);
  });

  it("returns 401 for unauthenticated requests and blocks deactivated users", async () => {
    const f = await createSchoolFixture();
    expect((await api(listTeachers)).status).toBe(401);
    const cookie = await signIn(f.teacher.user.email);
    expect((await api(listTeachers, { cookie })).status).toBe(200);
    await prisma.user.update({ where: { id: f.teacher.user.id }, data: { isActive: false } });
    expect(await loadAuthUser(f.teacher.user.id)).toBeNull();
    expect((await api(listTeachers, { cookie })).status).toBe(401);
  });

  it("resolves profile ids and department scope into the AuthUser", async () => {
    const f = await createSchoolFixture();
    await prisma.department.update({ where: { id: f.department.id }, data: { headTeacherId: f.teacher.teacher.id } });
    await prisma.user.update({ where: { id: f.teacher.user.id }, data: { role: "DEPARTMENT_HEAD" } });
    const u = await loadAuthUser(f.teacher.user.id);
    expect(u).toMatchObject({ role: "DEPARTMENT_HEAD", teacherId: f.teacher.teacher.id, departmentId: f.department.id });
    const s = await loadAuthUser(f.students[0].user!.id);
    expect(s?.studentId).toBe(f.students[0].student.id);
    const g = await loadAuthUser(f.guardian.user.id);
    expect(g?.guardianId).toBe(f.guardian.guardian.id);
    const superAdmin = await createUser("SUPER_ADMIN", null);
    expect((await loadAuthUser(superAdmin.id))?.schoolId).toBeNull();
  });
});
