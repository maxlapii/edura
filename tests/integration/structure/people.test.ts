import { describe, expect, it } from "vitest";
import { api, asUser, createOtherSchool, createSchoolFixture, prisma, signIn } from "../helpers";
import { addCertification, listExpiringCertifications, setAvailability, updateTeacher } from "@/modules/teachers/service";
import { createStudent as createStudentService, getStudent } from "@/modules/students/service";
import { createGuardian, myChildren } from "@/modules/guardians/service";
import { createStaff } from "@/modules/staff/service";
import { loadAuthUser } from "@/lib/auth/session";
import { POST as createTeacherRoute } from "@/app/api/teachers/route";
import { GET as me } from "@/app/api/me/route";

const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);

describe("teachers", () => {
  it("POST /api/teachers creates user + teacher + subjects and the temporary password signs in", async () => {
    const f = await createSchoolFixture();
    const res = await api(createTeacherRoute, {
      cookie: await signIn(f.adminUser.email),
      body: { name: "Nadia Novak", email: "Nadia.Novak@test.dev", employeeNumber: "T-900", employmentType: "PART_TIME", hireDate: "2026-09-01", departmentId: f.department.id, subjectIds: [f.subject.id, f.otherSubject.id, f.subject.id], emergencyContactName: "Sam Novak", qualifications: ["BSc Maths"] },
    });
    expect(res.status).toBe(201);
    const data = res.data as { teacher: { id: string; employmentType: string; user: { id: string; role: string; email: string }; subjects: { subjectId: string }[]; department: { id: string } }; temporaryPassword?: string };
    expect(data.temporaryPassword).toBeDefined();
    expect(data.teacher).toMatchObject({ employmentType: "PART_TIME", department: { id: f.department.id }, user: { role: "TEACHER", email: "nadia.novak@test.dev" } });
    expect(data.teacher.subjects.map((s) => s.subjectId).sort()).toEqual([f.subject.id, f.otherSubject.id].sort());

    const cookie = await signIn("nadia.novak@test.dev", data.temporaryPassword);
    const profile = await api(me, { cookie });
    expect(profile.status).toBe(200);
    expect(profile.data).toMatchObject({ role: "TEACHER", teacher: { id: data.teacher.id } });
    expect((await loadAuthUser(data.teacher.user.id))?.teacherId).toBe(data.teacher.id);
    expect(await prisma.auditLog.count({ where: { action: "teacher.create", entityId: data.teacher.id, userId: f.admin.id } })).toBe(1);

    const dup = await api(createTeacherRoute, { cookie: await signIn(f.adminUser.email), body: { name: "Nadia Again", email: "nadia.novak@test.dev", employeeNumber: "T-901" } });
    expect(dup.status).toBe(409);
    const foreign = await api(createTeacherRoute, { cookie: await signIn(f.adminUser.email), body: { name: "Foreign Subject", email: "fs@test.dev", employeeNumber: "T-902", subjectIds: ["nope"] } });
    expect(foreign.status).toBe(422);
  });

  it("a teacher can update their own bio but not employment fields, and cannot edit colleagues", async () => {
    const f = await createSchoolFixture();
    const own = await updateTeacher(f.teacher.auth, f.teacher.teacher.id, { bio: "I love numbers", qualifications: ["MSc"], emergencyContactPhone: "555" });
    expect(own).toMatchObject({ bio: "I love numbers", qualifications: ["MSc"], emergencyContactPhone: "555" });

    await expect(updateTeacher(f.teacher.auth, f.teacher.teacher.id, { employmentType: "PART_TIME" })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(updateTeacher(f.teacher.auth, f.teacher.teacher.id, { status: "ON_LEAVE" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateTeacher(f.teacher.auth, f.teacher.teacher.id, { maxWeeklyPeriods: 5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateTeacher(f.teacher.auth, f.teacher2.teacher.id, { bio: "hijack" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const t = await prisma.teacher.findUniqueOrThrow({ where: { id: f.teacher.teacher.id } });
    expect(t).toMatchObject({ employmentType: "FULL_TIME", status: "ACTIVE", maxWeeklyPeriods: 25 });

    const byAdmin = await updateTeacher(f.admin, f.teacher.teacher.id, { employmentType: "CONTRACT", name: "Teacher Renamed", subjectIds: [f.otherSubject.id] });
    expect(byAdmin.employmentType).toBe("CONTRACT");
    expect(byAdmin.user.name).toBe("Teacher Renamed");
    expect(byAdmin.subjects.map((s) => s.subjectId)).toEqual([f.otherSubject.id]);
  });

  it("setting status INACTIVE deactivates the login and clears sessions; ACTIVE restores it", async () => {
    const f = await createSchoolFixture();
    const cookie = await signIn(f.teacher.user.email);
    expect((await api(me, { cookie })).status).toBe(200);

    await updateTeacher(f.admin, f.teacher.teacher.id, { status: "INACTIVE" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: f.teacher.user.id } })).isActive).toBe(false);
    expect(await prisma.session.count({ where: { userId: f.teacher.user.id } })).toBe(0);
    expect((await api(me, { cookie })).status).toBe(401);
    expect(await loadAuthUser(f.teacher.user.id)).toBeNull();

    await updateTeacher(f.admin, f.teacher.teacher.id, { status: "ACTIVE" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: f.teacher.user.id } })).isActive).toBe(true);
    expect((await asUser(f.teacher.user.id)).teacherId).toBe(f.teacher.teacher.id);
  });

  it("setAvailability replaces existing entries and validates periods", async () => {
    const f = await createSchoolFixture();
    const other = await createOtherSchool();
    const first = await setAvailability(f.teacher.auth, f.teacher.teacher.id, [
      { dayOfWeek: 1, periodId: f.periods[0].id, type: "UNAVAILABLE", note: "Doctor" },
      { dayOfWeek: 2, periodId: null, type: "PREFERRED_SUBSTITUTION", note: null },
    ]);
    expect(first).toHaveLength(2);
    const replaced = await setAvailability(f.admin, f.teacher.teacher.id, [{ dayOfWeek: 5, periodId: f.periods[7].id, type: "PREFERRED", note: null }]);
    expect(replaced).toHaveLength(1);
    expect(replaced[0]).toMatchObject({ dayOfWeek: 5, type: "PREFERRED", period: { id: f.periods[7].id } });
    expect(await prisma.teacherAvailability.count({ where: { teacherId: f.teacher.teacher.id } })).toBe(1);

    const foreignPeriod = await prisma.period.findFirstOrThrow({ where: { schoolId: other.school.id } });
    await expect(setAvailability(f.admin, f.teacher.teacher.id, [{ dayOfWeek: 1, periodId: foreignPeriod.id, type: "AVAILABLE", note: null }])).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(setAvailability(f.teacher2.auth, f.teacher.teacher.id, [])).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.teacherAvailability.count({ where: { teacherId: f.teacher.teacher.id } })).toBe(1);
  });

  it("addCertification and listExpiringCertifications report only certificates expiring within the window", async () => {
    const f = await createSchoolFixture();
    const soon = await addCertification(f.teacher.auth, f.teacher.teacher.id, { name: "First Aid", issuer: "Red Cross", issuedAt: null, expiresAt: daysFromNow(10) });
    await addCertification(f.admin, f.teacher.teacher.id, { name: "Teaching Licence", issuer: null, issuedAt: null, expiresAt: daysFromNow(100) });
    await addCertification(f.admin, f.teacher2.teacher.id, { name: "Expired", issuer: null, issuedAt: null, expiresAt: daysFromNow(-1) });
    await addCertification(f.admin, f.teacher2.teacher.id, { name: "No expiry", issuer: null, issuedAt: null, expiresAt: null });
    await expect(addCertification(f.teacher2.auth, f.teacher.teacher.id, { name: "Fake", issuer: null, issuedAt: null, expiresAt: null })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const expiring = await listExpiringCertifications(f.school.id, 30);
    expect(expiring.map((c) => c.id)).toEqual([soon.id]);
    expect(expiring[0].teacher.user.id).toBe(f.teacher.user.id);
    expect((await listExpiringCertifications(f.school.id, 120)).map((c) => c.name).sort()).toEqual(["First Aid", "Teaching Licence"]);
  });
});

describe("students and guardians", () => {
  it("createStudent with an email creates a login; without one it does not", async () => {
    const f = await createSchoolFixture();
    const withLogin = await createStudentService(f.admin, { firstName: "Ada", lastName: "Lovelace", studentNumber: "S-1000", email: "ada@test.dev", classId: f.cls.id, dateOfBirth: null, gender: null, enrollmentDate: null, notes: null, medicalNotes: null });
    expect(withLogin.temporaryPassword).toBeDefined();
    expect(withLogin.student.user).toMatchObject({ email: "ada@test.dev", isActive: true });
    const cookie = await signIn("ada@test.dev", withLogin.temporaryPassword);
    expect((await api(me, { cookie })).data).toMatchObject({ role: "STUDENT", student: { id: withLogin.student.id, classId: f.cls.id } });

    const noLogin = await createStudentService(f.admin, { firstName: "Bo", lastName: "Quiet", studentNumber: "S-1001", email: null, classId: null, dateOfBirth: null, gender: null, enrollmentDate: null, notes: null, medicalNotes: null });
    expect(noLogin.temporaryPassword).toBeUndefined();
    expect(noLogin.student.userId).toBeNull();

    const other = await createOtherSchool();
    await expect(createStudentService(f.admin, { firstName: "X", lastName: "Y", studentNumber: "S-1002", email: null, classId: other.cls.id, dateOfBirth: null, gender: null, enrollmentDate: null, notes: null, medicalNotes: null })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(createStudentService(f.teacher.auth, { firstName: "X", lastName: "Y", studentNumber: "S-1003", email: null, classId: null, dateOfBirth: null, gender: null, enrollmentDate: null, notes: null, medicalNotes: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("getStudent strips medicalNotes for a teacher but not for an admin", async () => {
    const f = await createSchoolFixture();
    const s = f.students[0].student;
    await prisma.student.update({ where: { id: s.id }, data: { medicalNotes: "Peanut allergy" } });
    expect((await getStudent(f.teacher.auth, s.id)).medicalNotes).toBeNull();
    expect((await getStudent(f.admin, s.id)).medicalNotes).toBe("Peanut allergy");
    expect((await getStudent(f.principal, s.id)).medicalNotes).toBe("Peanut allergy");
  });

  it("createGuardian links students and the parent's myChildren returns them", async () => {
    const f = await createSchoolFixture();
    const other = await createOtherSchool();
    const [s0, s1] = f.students.map((s) => s.student);
    await expect(createGuardian(f.admin, { name: "Foreign Parent", email: "fp@test.dev", studentIds: [other.student.student.id], relationship: "PARENT", phone: null, address: null })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const { guardian, temporaryPassword } = await createGuardian(f.admin, { name: "Pat Parent", email: "pat@test.dev", studentIds: [s0.id, s1.id, s0.id], relationship: "MOTHER", phone: "123", address: null });
    expect(temporaryPassword).toBeDefined();
    expect(guardian.students).toHaveLength(2);
    expect(guardian.students.find((l) => l.student.id === s0.id)).toMatchObject({ isPrimary: true, relationship: "MOTHER" });
    expect(guardian.students.find((l) => l.student.id === s1.id)).toMatchObject({ isPrimary: false });

    const parent = await asUser(guardian.userId);
    expect(parent).toMatchObject({ role: "PARENT", guardianId: guardian.id });
    const children = await myChildren(parent);
    expect(children.map((c) => c.id).sort()).toEqual([s0.id, s1.id].sort());
    expect(children[0].class).toMatchObject({ id: f.cls.id, name: "10A" });
    expect(await myChildren(f.teacher.auth)).toEqual([]);
    await expect(signIn("pat@test.dev", temporaryPassword)).resolves.toBeTruthy();
  });

  it("createStaff with an admin role requires users:manage; non-admins cannot create staff", async () => {
    const f = await createSchoolFixture();
    const { staff, temporaryPassword } = await createStaff(f.admin, { name: "Office Admin", email: "office@test.dev", employeeNumber: "ST-1", staffType: "ADMINISTRATIVE", role: "SCHOOL_ADMIN", departmentId: null, position: null, workSchedule: null, phone: null });
    expect(staff.user.role).toBe("SCHOOL_ADMIN");
    expect(temporaryPassword).toBeDefined();
    expect((await asUser(staff.userId)).staffId).toBe(staff.id);

    const plain = await createStaff(f.admin, { name: "Janitor", email: "janitor@test.dev", employeeNumber: "ST-2", staffType: "MAINTENANCE", role: "STAFF", departmentId: f.department.id, position: null, workSchedule: null, phone: null });
    expect(plain.staff.user.role).toBe("STAFF");
    expect(plain.staff.department?.id).toBe(f.department.id);

    // Neither TEACHER nor DEPARTMENT_HEAD hold staff:manage / users:manage.
    await prisma.user.update({ where: { id: f.teacher2.user.id }, data: { role: "DEPARTMENT_HEAD" } });
    const head = await asUser(f.teacher2.user.id);
    await expect(createStaff(head, { name: "Nope", email: "nope@test.dev", employeeNumber: "ST-3", staffType: "OTHER", role: "SCHOOL_ADMIN", departmentId: null, position: null, workSchedule: null, phone: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createStaff(f.teacher.auth, { name: "Nope", email: "nope@test.dev", employeeNumber: "ST-3", staffType: "OTHER", role: "STAFF", departmentId: null, position: null, workSchedule: null, phone: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const other = await createOtherSchool();
    await expect(createStaff(f.admin, { name: "Nope", email: "nope@test.dev", employeeNumber: "ST-3", staffType: "OTHER", role: "STAFF", departmentId: (await prisma.department.create({ data: { schoolId: other.school.id, name: "F", code: "F" } })).id, position: null, workSchedule: null, phone: null })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await prisma.user.count({ where: { email: "nope@test.dev" } })).toBe(0);
  });
});
