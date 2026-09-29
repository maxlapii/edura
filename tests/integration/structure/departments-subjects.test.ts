import { describe, expect, it } from "vitest";
import { api, asUser, createOtherSchool, createSchoolFixture, prisma, signIn } from "../helpers";
import { createDepartment, deleteDepartment, updateDepartment } from "@/modules/departments/service";
import { createSubject, deleteSubject, updateSubject } from "@/modules/subjects/service";
import { POST as createSubjectRoute } from "@/app/api/subjects/route";

describe("departments", () => {
  it("creating a department with a head promotes that teacher to DEPARTMENT_HEAD and moves them into the department", async () => {
    const f = await createSchoolFixture();
    const dept = await createDepartment(f.admin, { name: "Science", code: "sci", headTeacherId: f.teacher2.teacher.id, description: null });
    expect(dept).toMatchObject({ code: "sci", headTeacherId: f.teacher2.teacher.id, schoolId: f.school.id });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: f.teacher2.user.id } });
    expect(user.role).toBe("DEPARTMENT_HEAD");
    expect((await prisma.teacher.findUniqueOrThrow({ where: { id: f.teacher2.teacher.id } })).departmentId).toBe(dept.id);
    const head = await asUser(f.teacher2.user.id);
    expect(head).toMatchObject({ role: "DEPARTMENT_HEAD", departmentId: dept.id });
  });

  it("changing the head demotes the previous head back to TEACHER and promotes the new one", async () => {
    const f = await createSchoolFixture();
    const dept = await createDepartment(f.admin, { name: "Science", code: "SCI", headTeacherId: f.teacher2.teacher.id, description: null });
    await updateDepartment(f.admin, dept.id, { headTeacherId: f.teacher.teacher.id });

    expect((await prisma.user.findUniqueOrThrow({ where: { id: f.teacher2.user.id } })).role).toBe("TEACHER");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: f.teacher.user.id } })).role).toBe("DEPARTMENT_HEAD");
    expect((await prisma.department.findUniqueOrThrow({ where: { id: dept.id } })).headTeacherId).toBe(f.teacher.teacher.id);

    await updateDepartment(f.admin, dept.id, { headTeacherId: null });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: f.teacher.user.id } })).role).toBe("TEACHER");
  });

  it("a department head can only edit their own department and never the head assignment", async () => {
    const f = await createSchoolFixture();
    await updateDepartment(f.admin, f.department.id, { headTeacherId: f.teacher.teacher.id });
    const science = await createDepartment(f.admin, { name: "Science", code: "SCI", headTeacherId: null, description: null });
    const head = await asUser(f.teacher.user.id);
    expect(head.departmentId).toBe(f.department.id);

    const own = await updateDepartment(head, f.department.id, { description: "Numbers and shapes" });
    expect(own.description).toBe("Numbers and shapes");
    await expect(updateDepartment(head, science.id, { description: "Hijacked" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateDepartment(head, f.department.id, { headTeacherId: f.teacher2.teacher.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createDepartment(head, { name: "Arts", code: "ART", headTeacherId: null, description: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteDepartment(head, science.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateDepartment(f.teacher2.auth, f.department.id, { description: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("delete is blocked while teachers or subjects are attached", async () => {
    const f = await createSchoolFixture();
    await expect(deleteDepartment(f.admin, f.department.id)).rejects.toMatchObject({ code: "CONFLICT", status: 409 });

    const empty = await createDepartment(f.admin, { name: "Arts", code: "ART", headTeacherId: null, description: null });
    await createSubject(f.admin, { name: "Drama", code: "DRA", departmentId: empty.id });
    await expect(deleteDepartment(f.admin, empty.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await prisma.subject.deleteMany({ where: { code: "DRA" } });
    await deleteDepartment(f.admin, empty.id);
    expect(await prisma.department.findUnique({ where: { id: empty.id } })).toBeNull();
  });

  it("head teacher must belong to the same school", async () => {
    const f = await createSchoolFixture();
    const other = await createOtherSchool();
    await expect(createDepartment(f.admin, { name: "Science", code: "SCI", headTeacherId: other.teacher.teacher.id, description: null })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(updateDepartment(f.admin, f.department.id, { headTeacherId: other.teacher.teacher.id })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.teacher.user.id } })).role).toBe("TEACHER");
  });
});

describe("subjects", () => {
  it("subject codes are unique per school (P2002 mapped to 409 by the route)", async () => {
    const f = await createSchoolFixture();
    const other = await createOtherSchool();
    const res = await api(createSubjectRoute, { cookie: await signIn(f.adminUser.email), body: { name: "Maths again", code: "math" } });
    expect(res.status).toBe(409);
    expect(res.error?.code).toBe("CONFLICT");
    expect(await prisma.subject.count({ where: { schoolId: f.school.id, code: "MATH" } })).toBe(1);

    // The same code is fine in another school.
    const created = await createSubject(other.admin, { name: "Mathematics", code: "MATH", departmentId: null });
    expect(created.schoolId).toBe(other.school.id);
  });

  it("a subject's department must belong to the same school", async () => {
    const f = await createSchoolFixture();
    const other = await createOtherSchool();
    const foreignDept = await prisma.department.create({ data: { schoolId: other.school.id, name: "Foreign", code: "FOR" } });
    await expect(createSubject(f.admin, { name: "Physics", code: "PHY", departmentId: foreignDept.id })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(updateSubject(f.admin, f.subject.id, { departmentId: foreignDept.id })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(updateSubject(f.admin, f.subject.id, { departmentId: "does-not-exist" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const ok = await createSubject(f.admin, { name: "Physics", code: "PHY", departmentId: f.department.id });
    expect(ok).toMatchObject({ schoolId: f.school.id, departmentId: f.department.id });
  });

  it("subjects used by courses cannot be deleted and teachers cannot manage subjects", async () => {
    const f = await createSchoolFixture();
    await expect(deleteSubject(f.admin, f.subject.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await deleteSubject(f.admin, f.otherSubject.id);
    expect(await prisma.subject.findUnique({ where: { id: f.otherSubject.id } })).toBeNull();
    await expect(createSubject(f.teacher.auth, { name: "Art", code: "ART", departmentId: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
