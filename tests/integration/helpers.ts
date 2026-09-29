/**
 * Shared fixtures for integration tests. The database is truncated before every
 * test (see tests/setup/integration.ts), so fixtures are created per test.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import type { AuthUser } from "@/lib/auth/types";
import type { Role } from "@/generated/prisma/enums";
import { loadAuthUser } from "@/lib/auth/session";
import { createUserWithPassword } from "@/modules/users/service";
import { installSchoolDefaults } from "@/modules/schools/service";
import { auth } from "@/lib/auth";

export const TEST_PASSWORD = "Password123!";

let counter = 0;
const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function createSchool(name = "Test School") {
  const school = await prisma.school.create({ data: { name, code: `T${uid().toUpperCase()}` } });
  await installSchoolDefaults(school.id);
  const year = await prisma.academicYear.create({ data: { schoolId: school.id, name: "2026/2027", startDate: new Date("2026-09-01T00:00:00Z"), endDate: new Date("2027-06-30T00:00:00Z"), isCurrent: true } });
  const term = await prisma.term.create({ data: { schoolId: school.id, academicYearId: year.id, name: "Term 1", startDate: new Date("2026-09-01T00:00:00Z"), endDate: new Date("2026-12-18T00:00:00Z"), isCurrent: true } });
  const periods = await prisma.period.findMany({ where: { schoolId: school.id }, orderBy: { order: "asc" } });
  return { school, year, term, periods };
}

export async function createUser(role: Role, schoolId: string | null, overrides: { name?: string; email?: string } = {}) {
  const email = overrides.email ?? `${role.toLowerCase()}-${uid()}@test.dev`;
  const user = await createUserWithPassword({ name: overrides.name ?? `${role} ${uid()}`, email, password: TEST_PASSWORD, role, schoolId });
  return user;
}

/** Resolves the full AuthUser (with profile ids) for a user id. */
export async function asUser(userId: string): Promise<AuthUser> {
  const u = await loadAuthUser(userId);
  if (!u) throw new Error(`User ${userId} not found or inactive`);
  return u;
}

export async function createTeacher(schoolId: string, opts: { departmentId?: string | null; subjectIds?: string[]; name?: string; maxWeeklyPeriods?: number } = {}) {
  const user = await createUser("TEACHER", schoolId, { name: opts.name });
  const teacher = await prisma.teacher.create({
    data: { schoolId, userId: user.id, employeeNumber: `T-${uid()}`, departmentId: opts.departmentId ?? null, maxWeeklyPeriods: opts.maxWeeklyPeriods ?? 25, subjects: { create: (opts.subjectIds ?? []).map((subjectId) => ({ subjectId })) } },
  });
  return { user, teacher, auth: await asUser(user.id) };
}

export async function createStudent(schoolId: string, classId: string | null, opts: { withLogin?: boolean; firstName?: string; lastName?: string } = {}) {
  const firstName = opts.firstName ?? "Student";
  const lastName = opts.lastName ?? uid();
  const user = opts.withLogin === false ? null : await createUser("STUDENT", schoolId, { name: `${firstName} ${lastName}` });
  const student = await prisma.student.create({ data: { schoolId, userId: user?.id ?? null, studentNumber: `S-${uid()}`, firstName, lastName, classId } });
  return { user, student, auth: user ? await asUser(user.id) : null };
}

export async function createGuardian(schoolId: string, studentIds: string[]) {
  const user = await createUser("PARENT", schoolId);
  const guardian = await prisma.guardian.create({ data: { schoolId, userId: user.id, students: { create: studentIds.map((studentId, i) => ({ studentId, isPrimary: i === 0 })) } } });
  return { user, guardian, auth: await asUser(user.id) };
}

/**
 * Builds a complete mini school: admin, department, subject, two teachers, a class with
 * three students (with logins), a guardian for the first student, one course and a
 * timetable slot for every weekday in period 1.
 */
export async function createSchoolFixture() {
  const { school, year, term, periods } = await createSchool();
  const adminUser = await createUser("SCHOOL_ADMIN", school.id);
  const principalUser = await createUser("PRINCIPAL", school.id);
  const department = await prisma.department.create({ data: { schoolId: school.id, name: "Mathematics", code: "MATH" } });
  const subject = await prisma.subject.create({ data: { schoolId: school.id, name: "Mathematics", code: "MATH", departmentId: department.id } });
  const otherSubject = await prisma.subject.create({ data: { schoolId: school.id, name: "History", code: "HIST" } });
  const teacher = await createTeacher(school.id, { departmentId: department.id, subjectIds: [subject.id], name: "Teacher One" });
  const teacher2 = await createTeacher(school.id, { departmentId: department.id, subjectIds: [subject.id], name: "Teacher Two" });
  const room = await prisma.room.create({ data: { schoolId: school.id, name: "Room 1", code: "R1" } });
  const cls = await prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "10A", gradeLevel: 10, homeroomTeacherId: teacher.teacher.id, roomId: room.id } });
  const students = [];
  for (let i = 0; i < 3; i++) students.push(await createStudent(school.id, cls.id, { firstName: `Kid${i + 1}`, lastName: "Tester" }));
  const guardian = await createGuardian(school.id, [students[0].student.id]);
  const course = await prisma.course.create({ data: { schoolId: school.id, academicYearId: year.id, classId: cls.id, subjectId: subject.id, teacherId: teacher.teacher.id } });
  const slots = [];
  for (let dow = 1; dow <= 7; dow++) {
    slots.push(await prisma.timetableSlot.create({ data: { schoolId: school.id, courseId: course.id, teacherId: teacher.teacher.id, classId: cls.id, periodId: periods[0].id, roomId: room.id, dayOfWeek: dow } }));
  }
  return {
    school,
    year,
    term,
    periods,
    department,
    subject,
    otherSubject,
    room,
    cls,
    course,
    slots,
    teacher,
    teacher2,
    students,
    guardian,
    admin: await asUser(adminUser.id),
    adminUser,
    principal: await asUser(principalUser.id),
  };
}

/** A second, isolated school with its own admin and teacher – for tenant-isolation tests. */
export async function createOtherSchool() {
  const { school, year } = await createSchool("Other School");
  const adminUser = await createUser("SCHOOL_ADMIN", school.id);
  const teacher = await createTeacher(school.id);
  const cls = await prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "9Z" } });
  const student = await createStudent(school.id, cls.id);
  return { school, year, cls, teacher, student, admin: await asUser(adminUser.id) };
}

// ───────────── HTTP helpers ─────────────

/** Signs in through better-auth and returns the Cookie header for subsequent requests. */
export async function signIn(email: string, password = TEST_PASSWORD): Promise<string> {
  const res = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  if (!res.ok) throw new Error(`Sign-in failed for ${email}: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie
    .split(/,(?=[^;]+=[^;]+)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

export type RouteHandler = (req: NextRequest, ctx?: { params?: Promise<Record<string, string>> | Record<string, string> }) => Promise<Response>;

/** Calls a route handler as an HTTP client would (JSON body, cookies, params). */
export async function api(handler: RouteHandler, opts: { method?: string; path?: string; body?: unknown; cookie?: string; params?: Record<string, string>; query?: Record<string, string> } = {}) {
  const url = new URL(opts.path ?? "/api/test", "http://localhost:3000");
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const req = new NextRequest(url, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", ...(opts.cookie ? { cookie: opts.cookie } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  let json: { data?: unknown; error?: { code: string; message: string; details?: unknown } } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  return { status: res.status, json, text, data: json.data as never, error: json.error };
}

export { prisma };
