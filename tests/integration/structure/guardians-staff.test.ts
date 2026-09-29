import { describe, expect, it } from "vitest";
import { createSchoolFixture, createOtherSchool, createUser, asUser, signIn, api, prisma, TEST_PASSWORD } from "../helpers";
import { createGuardian, getGuardian, linkStudent, listGuardians, myChildren, unlinkStudent, updateGuardian } from "@/modules/guardians";
import { createStaff, getStaff, listStaff, maintenanceStaffUserIds, updateStaff } from "@/modules/staff";
import { POST as createGuardianRoute, GET as listGuardiansRoute } from "@/app/api/guardians/route";
import { GET as getGuardianRoute, PATCH as patchGuardianRoute } from "@/app/api/guardians/[id]/route";
import { POST as linkRoute, DELETE as unlinkRoute } from "@/app/api/guardians/[id]/students/route";
import { GET as childrenRoute } from "@/app/api/guardians/me/children/route";
import { POST as createStaffRoute, GET as listStaffRoute } from "@/app/api/staff/route";
import { GET as getStaffRoute, PATCH as patchStaffRoute } from "@/app/api/staff/[id]/route";

describe("guardians", () => {
  it("creates a parent login linked to students and lets the parent see only their children", async () => {
    const f = await createSchoolFixture();
    const { guardian, temporaryPassword } = await createGuardian(f.admin, { name: "Pat Parent", email: "pat@test.dev", studentIds: [f.students[1].student.id, f.students[2].student.id], relationship: "MOTHER" });
    expect(temporaryPassword).toBeTruthy();
    expect(guardian.students).toHaveLength(2);
    expect(guardian.students.find((s) => s.isPrimary)?.student.id).toBe(f.students[1].student.id);
    const cookie = await signIn("pat@test.dev", temporaryPassword);
    const kids = await api(childrenRoute, { cookie });
    expect((kids.data as unknown[]).length).toBe(2);
    const parent = await asUser(guardian.userId);
    expect((await myChildren(parent)).map((c) => c.id).sort()).toEqual([f.students[1].student.id, f.students[2].student.id].sort());
    expect(await myChildren(f.admin)).toEqual([]);
    await expect(createGuardian(f.admin, { name: "Dup", email: "pat@test.dev", studentIds: [], relationship: "PARENT" })).rejects.toMatchObject({ code: "CONFLICT" });
    const other = await createOtherSchool();
    await expect(createGuardian(f.admin, { name: "X", email: "x@test.dev", studentIds: [other.student.student.id], relationship: "PARENT" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(createGuardian(f.teacher.auth, { name: "X", email: "x2@test.dev", studentIds: [], relationship: "PARENT" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("links, unlinks, updates and lists guardians with scope checks", async () => {
    const f = await createSchoolFixture();
    const g = f.guardian.guardian;
    await linkStudent(f.admin, g.id, { studentId: f.students[1].student.id, relationship: "FATHER", isPrimary: false });
    await linkStudent(f.admin, g.id, { studentId: f.students[1].student.id, relationship: "GUARDIAN", isPrimary: true });
    expect((await getGuardian(f.admin, g.id)).students).toHaveLength(2);
    await unlinkStudent(f.admin, g.id, f.students[1].student.id);
    expect((await getGuardian(f.guardian.auth, g.id)).students).toHaveLength(1);
    await expect(getGuardian(f.students[0].auth!, g.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const other = await createOtherSchool();
    await expect(getGuardian(other.admin, g.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(linkStudent(f.admin, g.id, { studentId: other.student.student.id, relationship: "PARENT", isPrimary: false })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const updated = await updateGuardian(f.guardian.auth, g.id, { name: "Renamed", phone: "123" });
    expect(updated.user.name).toBe("Renamed");
    expect(updated.phone).toBe("123");
    await expect(updateGuardian(f.teacher.auth, g.id, { name: "Nope" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const list = await listGuardians(f.admin, { page: 1, pageSize: 10, q: "Renamed" });
    expect(list.total).toBe(1);
    expect((await listGuardians(other.admin, { page: 1, pageSize: 10 })).total).toBe(0);
  });

  it("guardian routes", async () => {
    const f = await createSchoolFixture();
    const cookie = await signIn(f.adminUser.email);
    const created = await api(createGuardianRoute, { cookie, body: { name: "Route Parent", email: "route@test.dev", studentIds: [f.students[2].student.id] } });
    expect(created.status).toBe(201);
    const id = (created.data as { guardian: { id: string } }).guardian.id;
    expect((await api(listGuardiansRoute, { cookie })).status).toBe(200);
    expect((await api(getGuardianRoute, { cookie, params: { id } })).status).toBe(200);
    expect((await api(patchGuardianRoute, { cookie, method: "PATCH", params: { id }, body: { phone: "999" } })).status).toBe(200);
    expect((await api(linkRoute, { cookie, params: { id }, body: { studentId: f.students[0].student.id } })).status).toBe(201);
    expect((await api(unlinkRoute, { cookie, method: "DELETE", params: { id }, query: { studentId: f.students[0].student.id } })).status).toBe(204);
    expect((await api(createGuardianRoute, { cookie: await signIn(f.teacher.user.email), body: { name: "X", email: "x@test.dev" } })).status).toBe(403);
  });
});

describe("staff", () => {
  it("creates staff members with logins and role choices", async () => {
    const f = await createSchoolFixture();
    const { staff, temporaryPassword } = await createStaff(f.admin, { name: "Sam Support", email: "sam@test.dev", employeeNumber: "S-1", staffType: "MAINTENANCE", role: "STAFF" });
    expect(staff.user.role).toBe("STAFF");
    expect(temporaryPassword).toBeTruthy();
    await signIn("sam@test.dev", temporaryPassword);
    expect(await maintenanceStaffUserIds(f.school.id)).toEqual([staff.userId]);
    const admin = await createStaff(f.admin, { name: "Office", email: "office@test.dev", password: TEST_PASSWORD, employeeNumber: "S-2", staffType: "ADMINISTRATIVE", role: "SCHOOL_ADMIN", departmentId: f.department.id });
    expect(admin.staff.user.role).toBe("SCHOOL_ADMIN");
    expect(admin.temporaryPassword).toBeUndefined();
    await expect(createStaff(f.admin, { name: "Dup", email: "sam@test.dev", employeeNumber: "S-3", staffType: "OTHER", role: "STAFF" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(createStaff(f.admin, { name: "Bad dept", email: "bd@test.dev", employeeNumber: "S-4", staffType: "OTHER", role: "STAFF", departmentId: "nope" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(createStaff(f.teacher.auth, { name: "X", email: "x@test.dev", employeeNumber: "S-5", staffType: "OTHER", role: "STAFF" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists, reads, updates and deactivates staff", async () => {
    const f = await createSchoolFixture();
    const { staff, temporaryPassword } = await createStaff(f.admin, { name: "Lib Rarian", email: "lib@test.dev", employeeNumber: "S-9", staffType: "LIBRARIAN", role: "STAFF" });
    const self = await asUser(staff.userId);
    expect((await getStaff(self, staff.id)).id).toBe(staff.id);
    expect((await listStaff(f.admin, { page: 1, pageSize: 10, staffType: "LIBRARIAN" })).total).toBe(1);
    expect((await listStaff(f.admin, { page: 1, pageSize: 10, q: "Rarian" })).items[0].id).toBe(staff.id);
    const updated = await updateStaff(f.admin, staff.id, { name: "Lib Updated", position: "Head librarian", workSchedule: { mon: "8-4" } });
    expect(updated.user.name).toBe("Lib Updated");
    expect(updated.position).toBe("Head librarian");
    const cookie = await signIn("lib@test.dev", temporaryPassword);
    await updateStaff(f.admin, staff.id, { status: "INACTIVE" });
    expect((await api(getStaffRoute, { cookie, params: { id: staff.id } })).status).toBe(401);
    await updateStaff(f.admin, staff.id, { status: "ACTIVE" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: staff.userId } })).isActive).toBe(true);
    const other = await createOtherSchool();
    await expect(getStaff(other.admin, staff.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateStaff(other.admin, staff.id, { position: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getStaff(f.teacher.auth, staff.id)).resolves.toBeTruthy();
    await expect(getStaff(f.students[0].auth!, staff.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("staff routes", async () => {
    const f = await createSchoolFixture();
    const cookie = await signIn(f.adminUser.email);
    const created = await api(createStaffRoute, { cookie, body: { name: "Route Staff", email: "rs@test.dev", employeeNumber: "S-77", staffType: "IT" } });
    expect(created.status).toBe(201);
    const id = (created.data as { staff: { id: string } }).staff.id;
    expect((await api(listStaffRoute, { cookie, query: { staffType: "IT" } })).status).toBe(200);
    expect((await api(getStaffRoute, { cookie, params: { id } })).status).toBe(200);
    expect((await api(patchStaffRoute, { cookie, method: "PATCH", params: { id }, body: { position: "Sysadmin" } })).status).toBe(200);
    expect((await api(createStaffRoute, { cookie: await signIn(f.students[0].user!.email), body: { name: "X", email: "x@test.dev", employeeNumber: "1", staffType: "IT" } })).status).toBe(403);
    const superAdmin = await createUser("SUPER_ADMIN", null);
    expect((await api(listStaffRoute, { cookie: await signIn(superAdmin.email), query: { schoolId: f.school.id } })).status).toBe(200);
  });
});
