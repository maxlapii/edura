import { describe, expect, it } from "vitest";
import { api, asUser, createSchoolFixture, createUser, prisma, signIn, TEST_PASSWORD } from "../helpers";
import { createUser as createUserService, listUsers, setUserPassword, updateUser } from "@/modules/users/service";
import { GET as me } from "@/app/api/me/route";
import { PUT as setPasswordRoute } from "@/app/api/users/[id]/password/route";
import { POST as createUserRoute } from "@/app/api/users/route";

describe("users", () => {
  it("createUser returns a temporary password when none is given and the user can sign in with it", async () => {
    const f = await createSchoolFixture();
    const { user, temporaryPassword } = await createUserService(f.admin, { name: "New Staff", email: "New.Staff@Test.dev", role: "STAFF", phone: null });
    expect(temporaryPassword).toBeDefined();
    expect(temporaryPassword!.length).toBeGreaterThanOrEqual(8);
    expect(user).toMatchObject({ email: "new.staff@test.dev", role: "STAFF", schoolId: f.school.id, isActive: true });
    expect(user).not.toHaveProperty("password");

    const cookie = await signIn("new.staff@test.dev", temporaryPassword);
    const res = await api(me, { cookie });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ id: user.id, role: "STAFF" });

    // With an explicit password there is no temporary password.
    const explicit = await createUserService(f.admin, { name: "Explicit", email: "explicit@test.dev", role: "STAFF", password: TEST_PASSWORD, phone: null });
    expect(explicit.temporaryPassword).toBeUndefined();
    await expect(signIn("explicit@test.dev")).resolves.toContain("better-auth");
  });

  it("rejects duplicate emails with CONFLICT", async () => {
    const f = await createSchoolFixture();
    await expect(createUserService(f.admin, { name: "Dup", email: f.teacher.user.email, role: "STAFF", phone: null })).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    const res = await api(createUserRoute, { cookie: await signIn(f.adminUser.email), body: { name: "Dup", email: f.teacher.user.email.toUpperCase(), role: "STAFF" } });
    expect(res.status).toBe(409);
  });

  it("only super administrators can create or promote SUPER_ADMIN users", async () => {
    const f = await createSchoolFixture();
    await expect(createUserService(f.admin, { name: "Root", email: "root@test.dev", role: "SUPER_ADMIN", phone: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createUserService(f.principal, { name: "Root", email: "root@test.dev", role: "SUPER_ADMIN", phone: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateUser(f.admin, f.teacher.user.id, { role: "SUPER_ADMIN" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.user.count({ where: { role: "SUPER_ADMIN" } })).toBe(0);

    const superAdmin = await asUser((await createUser("SUPER_ADMIN", null)).id);
    const { user } = await createUserService(superAdmin, { name: "Root", email: "root@test.dev", role: "SUPER_ADMIN", phone: null });
    expect(user).toMatchObject({ role: "SUPER_ADMIN", schoolId: null });
  });

  it("listUsers paginates and filters by role and free text within the school", async () => {
    const f = await createSchoolFixture();
    await createUser("SCHOOL_ADMIN", (await prisma.school.create({ data: { name: "Elsewhere", code: "ELSE" } })).id);
    // Fixture: admin, principal, 2 teachers, 3 students, 1 parent = 8 users.
    const page1 = await listUsers(f.admin, { page: 1, pageSize: 3 });
    expect(page1).toMatchObject({ total: 8, page: 1, pageSize: 3, totalPages: 3 });
    expect(page1.items).toHaveLength(3);
    const page3 = await listUsers(f.admin, { page: 3, pageSize: 3 });
    expect(page3.items).toHaveLength(2);
    expect(page1.items.every((u) => u.schoolId === f.school.id)).toBe(true);

    const teachers = await listUsers(f.admin, { page: 1, pageSize: 25, role: "TEACHER" });
    expect(teachers.total).toBe(2);
    expect(teachers.items.map((u) => u.id).sort()).toEqual([f.teacher.user.id, f.teacher2.user.id].sort());

    const byName = await listUsers(f.admin, { page: 1, pageSize: 25, q: "teacher one" });
    expect(byName.items.map((u) => u.id)).toEqual([f.teacher.user.id]);
    const byEmail = await listUsers(f.admin, { page: 1, pageSize: 25, q: f.guardian.user.email });
    expect(byEmail.items.map((u) => u.id)).toEqual([f.guardian.user.id]);

    await prisma.user.update({ where: { id: f.teacher2.user.id }, data: { isActive: false } });
    expect((await listUsers(f.admin, { page: 1, pageSize: 25, isActive: "false" })).items.map((u) => u.id)).toEqual([f.teacher2.user.id]);
    await expect(listUsers(f.teacher.auth, { page: 1, pageSize: 25 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("updateUser cannot deactivate the calling account but can deactivate others", async () => {
    const f = await createSchoolFixture();
    await expect(updateUser(f.admin, f.admin.id, { isActive: false })).rejects.toMatchObject({ code: "BAD_REQUEST", status: 400 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: f.admin.id } })).isActive).toBe(true);

    const updated = await updateUser(f.admin, f.teacher2.user.id, { isActive: false, name: "Renamed Teacher" });
    expect(updated).toMatchObject({ isActive: false, name: "Renamed Teacher" });
    await expect(asUser(f.teacher2.user.id)).rejects.toThrow(/not found or inactive/);
  });

  it("setUserPassword deletes database sessions, rejects the old password and accepts the new one", async () => {
    const f = await createSchoolFixture();
    const oldCookie = await signIn(f.teacher.user.email);
    expect((await api(me, { cookie: oldCookie })).status).toBe(200);
    expect(await prisma.session.count({ where: { userId: f.teacher.user.id } })).toBe(1);

    const res = await api(setPasswordRoute, { method: "PUT", cookie: await signIn(f.adminUser.email), params: { id: f.teacher.user.id }, body: { password: "BrandNewPass123!" } });
    expect(res.status).toBe(200);

    expect(await prisma.session.count({ where: { userId: f.teacher.user.id } })).toBe(0);
    await expect(signIn(f.teacher.user.email, TEST_PASSWORD)).rejects.toThrow(/Sign-in failed/);
    const newCookie = await signIn(f.teacher.user.email, "BrandNewPass123!");
    expect((await api(me, { cookie: newCookie })).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: "user.set_password", entityId: f.teacher.user.id } })).toBe(1);
    const teacherCookie = await signIn(f.teacher.user.email, "BrandNewPass123!");
    expect((await api(setPasswordRoute, { method: "PUT", cookie: teacherCookie, params: { id: f.teacher2.user.id }, body: { password: "Hijack12345!" } })).status).toBe(403);
  });
  it("an existing session cookie is rejected immediately after an admin resets the password", async () => {
    const f = await createSchoolFixture();
    const oldCookie = await signIn(f.teacher.user.email);
    expect((await api(me, { cookie: oldCookie })).status).toBe(200);
    await setUserPassword(f.admin, f.teacher.user.id, "BrandNewPass123!");
    expect(await prisma.session.count({ where: { userId: f.teacher.user.id } })).toBe(0);
    expect((await api(me, { cookie: oldCookie })).status).toBe(401);
  });

  it("setUserPassword is scoped to the caller's school", async () => {
    const f = await createSchoolFixture();
    const otherAdmin = await createUser("SCHOOL_ADMIN", (await prisma.school.create({ data: { name: "Elsewhere", code: "ELSE" } })).id);
    await expect(setUserPassword(await asUser(otherAdmin.id), f.teacher.user.id, "Hijack12345!")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(signIn(f.teacher.user.email)).resolves.toBeTruthy();
  });
});
