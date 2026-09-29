/**
 * The required end-to-end MVP scenario (CLAUDE.md §48), driven through the real UI for every
 * user-facing step. Reference data that has no journey value (a second teacher, extra
 * students, a guardian) is created through the JSON API to keep the run focused and fast.
 */
import { test, expect, request as playwrightRequest, type APIRequestContext, type Page } from "@playwright/test";
import { PASSWORD, apiCall, apiLogin, isoDow, login, todayIso, uid } from "./helpers";
import { execSync } from "node:child_process";
import path from "node:path";

const BASE = `http://localhost:${process.env.E2E_PORT ?? 3100}`;
const DB_URL = process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const SUPER_EMAIL = "e2e-super@edura.dev";

async function ctxFor(email: string): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({ baseURL: BASE });
  await apiLogin(ctx, BASE, email);
  return ctx;
}

async function switchUser(page: Page, email: string) {
  await page.context().clearCookies();
  await login(page, email);
}

function isoDate(daysFromToday: number) {
  return new Date(Date.now() + daysFromToday * 86_400_000).toISOString().slice(0, 10);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  // A super administrator must exist to create the school; the seed script is not used here.
  execSync(`npx tsx ${path.join(__dirname, "seed-super-admin.ts")} ${SUPER_EMAIL}`, { stdio: "inherit", env: { ...process.env, DATABASE_URL: DB_URL } });
});

test("admin sets up the school, the teacher runs their day, and a leave request is covered by a substitute", async ({ page }) => {
  test.setTimeout(240_000);
  const run = uid();
  const schoolCode = `E2E${run.toUpperCase()}`;
  const adminEmail = `admin-${run}@e2e.dev`;
  const teacherEmail = `teacher-${run}@e2e.dev`;
  const teacher2Email = `teacher2-${run}@e2e.dev`;
  const studentEmail = `student-${run}@e2e.dev`;
  const parentEmail = `parent-${run}@e2e.dev`;
  const today = todayIso();

  // ── Super admin creates the school (UI) and its administrator (API) ─────────────────────────
  await login(page, SUPER_EMAIL);
  await page.goto("/admin/schools");
  const schoolForm = page.getByTestId("school-form");
  await schoolForm.locator('[name="name"]').fill(`E2E School ${run}`);
  await schoolForm.locator('[name="code"]').fill(schoolCode);
  await schoolForm.getByTestId("submit").click();
  await expect(page.getByText(`E2E School ${run}`).first()).toBeVisible();

  const superApi = await ctxFor(SUPER_EMAIL);
  const schools = await apiCall<Array<{ id: string; code: string }>>(superApi, BASE, "GET", "/api/schools");
  const school = schools.find((s) => s.code === schoolCode)!;
  expect(school).toBeTruthy();
  await apiCall(superApi, BASE, "POST", "/api/users", { name: "E2E Admin", email: adminEmail, password: PASSWORD, role: "SCHOOL_ADMIN", schoolId: school.id });

  // ── Admin creates the academic year (UI) ────────────────────────────────────────────────────
  await switchUser(page, adminEmail);
  await page.goto("/admin/academic-years");
  const yearForm = page.getByTestId("academic-year-form");
  await yearForm.locator('[name="name"]').fill("2026/2027");
  await yearForm.locator('[name="startDate"]').fill("2026-09-01");
  await yearForm.locator('[name="endDate"]').fill("2027-06-30");
  const isCurrent = yearForm.locator('[name="isCurrent"]');
  if ((await isCurrent.count()) && !(await isCurrent.isChecked())) await isCurrent.check();
  await yearForm.getByTestId("submit").click();
  await expect(page.getByText("2026/2027").first()).toBeVisible();

  const adminApi = await ctxFor(adminEmail);
  const years = await apiCall<Array<{ id: string; name: string }>>(adminApi, BASE, "GET", "/api/academic-years");
  const year = years.find((y) => y.name === "2026/2027")!;
  await apiCall(adminApi, BASE, "POST", "/api/terms", { academicYearId: year.id, name: "Term 1", startDate: "2026-09-01", endDate: "2026-12-18", isCurrent: true });

  // ── Admin creates teachers (UI for the first, API for the second) ───────────────────────────
  await page.goto("/admin/subjects");
  const subjectForm = page.getByTestId("subject-form");
  await subjectForm.locator('[name="name"]').fill("Mathematics");
  await subjectForm.locator('[name="code"]').fill(`MATH${run.slice(0, 3).toUpperCase()}`);
  await subjectForm.getByTestId("submit").click();
  await expect(page.getByText("Mathematics").first()).toBeVisible();
  const subjects = await apiCall<Array<{ id: string; name: string }>>(adminApi, BASE, "GET", "/api/subjects");
  const subject = subjects.find((s) => s.name === "Mathematics")!;

  await page.goto("/admin/teachers/new");
  const teacherForm = page.getByTestId("teacher-form");
  await teacherForm.locator('[name="name"]').fill("Tina Teacher");
  await teacherForm.locator('[name="email"]').fill(teacherEmail);
  await teacherForm.locator('[name="password"]').fill(PASSWORD);
  await teacherForm.locator('[name="employeeNumber"]').fill(`T-${run}`);
  const subjectSelect = teacherForm.locator('[name="subjectIds"]');
  if (await subjectSelect.count()) await subjectSelect.selectOption({ value: subject.id }).catch(() => {});
  await teacherForm.getByTestId("submit").click();
  await expect(page.getByText("Tina Teacher").first()).toBeVisible({ timeout: 15_000 });
  const teachers = await apiCall<{ items: Array<{ id: string; user: { email: string } }> }>(adminApi, BASE, "GET", "/api/teachers?pageSize=50");
  const teacher = teachers.items.find((t) => t.user.email === teacherEmail)!;
  await apiCall(adminApi, BASE, "PATCH", `/api/teachers/${teacher.id}`, { subjectIds: [subject.id] });
  const teacher2 = (await apiCall<{ teacher: { id: string } }>(adminApi, BASE, "POST", "/api/teachers", { name: "Sam Substitute", email: teacher2Email, password: PASSWORD, employeeNumber: `T2-${run}`, subjectIds: [subject.id] })).teacher;

  // ── Admin creates the class (UI), students (UI + API) and a guardian (API) ──────────────────
  await page.goto("/admin/classes/new");
  const classForm = page.getByTestId("class-form");
  await classForm.locator('[name="academicYearId"]').selectOption({ value: year.id }).catch(() => {});
  await classForm.locator('[name="name"]').fill("10A");
  const gradeLevel = classForm.locator('[name="gradeLevel"]');
  if (await gradeLevel.count()) await gradeLevel.fill("10");
  await classForm.getByTestId("submit").click();
  await expect(page.getByText("10A").first()).toBeVisible({ timeout: 15_000 });
  const classes = await apiCall<{ items: Array<{ id: string; name: string }> }>(adminApi, BASE, "GET", "/api/classes");
  const cls = classes.items.find((c) => c.name === "10A")!;

  await page.goto("/admin/students/new");
  const studentForm = page.getByTestId("student-form");
  await studentForm.locator('[name="firstName"]').fill("Sara");
  await studentForm.locator('[name="lastName"]').fill("Student");
  await studentForm.locator('[name="studentNumber"]').fill(`S-${run}`);
  await studentForm.locator('[name="classId"]').selectOption({ value: cls.id }).catch(() => {});
  await studentForm.locator('[name="email"]').fill(studentEmail);
  const studentPassword = studentForm.locator('[name="password"]');
  if (await studentPassword.count()) await studentPassword.fill(PASSWORD);
  await studentForm.getByTestId("submit").click();
  await expect(page.getByText("Sara Student").first()).toBeVisible({ timeout: 15_000 });
  const students = await apiCall<{ items: Array<{ id: string; firstName: string }> }>(adminApi, BASE, "GET", `/api/students?classId=${cls.id}`);
  const student = students.items.find((s) => s.firstName === "Sara")!;
  if (!(await studentPassword.count())) await apiCall(adminApi, BASE, "PUT", `/api/users/${(await apiCall<{ user: { id: string } }>(adminApi, BASE, "GET", `/api/students/${student.id}`)).user.id}/password`, { password: PASSWORD });
  for (const name of ["Ben", "Cleo"]) {
    await apiCall(adminApi, BASE, "POST", "/api/students", { firstName: name, lastName: "Student", studentNumber: `S-${name}-${run}`, classId: cls.id });
  }
  await apiCall(adminApi, BASE, "POST", "/api/guardians", { name: "Paula Parent", email: parentEmail, password: PASSWORD, studentIds: [student.id] });

  // ── Admin assigns the teacher to the class (course, UI) and builds the timetable (UI) ───────
  await page.goto(`/admin/classes/${cls.id}`);
  const courseForm = page.getByTestId("course-form");
  await courseForm.locator('[name="subjectId"]').selectOption({ value: subject.id });
  await courseForm.locator('[name="teacherId"]').selectOption({ value: teacher.id });
  await courseForm.getByTestId("submit").click();
  await expect(page.getByTestId("course-row").first()).toBeVisible({ timeout: 15_000 });
  const courses = await apiCall<Array<{ id: string; classId: string }>>(adminApi, BASE, "GET", `/api/courses?classId=${cls.id}`);
  const course = courses[0];
  expect(course).toBeTruthy();

  await page.goto("/admin/timetable");
  const slotForm = page.getByTestId("timetable-slot-form");
  await slotForm.locator('[name="courseId"]').selectOption({ value: course.id });
  await slotForm.locator('[name="dayOfWeek"]').selectOption({ value: String(isoDow()) });
  await slotForm.locator('[name="periodId"]').selectOption({ index: 1 }).catch(async () => slotForm.locator('[name="periodId"]').selectOption({ index: 0 }));
  await slotForm.getByTestId("submit").click();
  await expect.poll(async () => (await apiCall<unknown[]>(adminApi, BASE, "GET", `/api/timetable?classId=${cls.id}`)).length, { timeout: 15_000 }).toBe(1);
  const slot = (await apiCall<Array<{ id: string; periodId: string }>>(adminApi, BASE, "GET", `/api/timetable?classId=${cls.id}`))[0];
  // The same lesson also exists a week later (weekly timetable) — used by the leave step.

  // ── Teacher logs in, sees today's schedule, opens the class ─────────────────────────────────
  await switchUser(page, teacherEmail);
  await expect(page.getByText("Mathematics").first()).toBeVisible();
  await page.goto("/schedule");
  await expect(page.getByText("Mathematics").first()).toBeVisible();
  await page.goto(`/classes/${course.id}`);
  await expect(page.getByText(/Sara/).first()).toBeVisible();

  // ── Teacher records attendance (Sara absent) ────────────────────────────────────────────────
  await page.goto(`/attendance/take?courseId=${course.id}&slotId=${slot.id}&date=${today}`);
  const attendanceForm = page.getByTestId("attendance-form");
  await attendanceForm.locator(`[name="status-${student.id}"]`).selectOption("ABSENT");
  await attendanceForm.getByTestId("submit").click();
  await page.waitForURL(/\/attendance\/sessions\//, { timeout: 15_000 });
  await expect(page.getByText(/absent/i).first()).toBeVisible();

  // Attendance statistics update …
  const teacherApi = await ctxFor(teacherEmail);
  const summary = await apiCall<{ stats: { absent: number; total: number } }>(teacherApi, BASE, "GET", `/api/students/${student.id}/attendance`);
  expect(summary.stats).toMatchObject({ absent: 1, total: 1 });
  await page.goto(`/classes/${course.id}/attendance`);
  await expect(page.getByText(/Sara/).first()).toBeVisible();

  // … and the parent is notified.
  const parentApi = await ctxFor(parentEmail);
  await expect
    .poll(async () => (await apiCall<{ items: Array<{ type: string }> }>(parentApi, BASE, "GET", "/api/notifications")).items.filter((n) => n.type === "STUDENT_ABSENT").length, { timeout: 15_000 })
    .toBe(1);

  // ── Teacher creates an assignment ───────────────────────────────────────────────────────────
  await page.goto(`/assignments/new?courseId=${course.id}`);
  const assignmentForm = page.getByTestId("assignment-form");
  const courseSelect = assignmentForm.locator('[name="courseId"]');
  if (await courseSelect.count()) await courseSelect.selectOption({ value: course.id }).catch(() => {});
  await assignmentForm.locator('[name="title"]').fill("Fractions homework");
  await assignmentForm.locator('[name="dueDate"]').fill(`${isoDate(3)}T17:00`);
  await assignmentForm.locator('[name="maxScore"]').fill("20");
  await assignmentForm.getByTestId("submit").click();
  await page.waitForURL(/\/assignments\/(?!new)[^/?]+$/, { timeout: 15_000 });
  const assignmentId = page.url().split("/").pop()!;
  await expect(page.getByText("Fractions homework").first()).toBeVisible();

  // ── Student submits the assignment ──────────────────────────────────────────────────────────
  await switchUser(page, studentEmail);
  await page.goto(`/assignments/${assignmentId}`);
  const submissionForm = page.getByTestId("submission-form");
  await submissionForm.locator('[name="content"]').fill("Here is my homework.");
  await submissionForm.getByTestId("submit").click();
  const studentApi = await ctxFor(studentEmail);
  await expect.poll(async () => (await apiCall<{ submissions: unknown[] }>(studentApi, BASE, "GET", `/api/assignments/${assignmentId}`)).submissions.length, { timeout: 15_000 }).toBe(1);

  // ── Teacher grades it and submits the grades ────────────────────────────────────────────────
  await switchUser(page, teacherEmail);
  await page.goto(`/assignments/${assignmentId}`);
  const gradingForm = page.getByTestId("grading-form");
  await gradingForm.locator(`[name="score-${student.id}"]`).fill("18");
  await gradingForm.getByTestId("submit").click();
  await expect.poll(async () => (await apiCall<{ courses: Array<{ grades: Array<{ score: number }> }> }>(teacherApi, BASE, "GET", `/api/students/${student.id}/grades`)).courses[0]?.grades[0]?.score, { timeout: 15_000 }).toBe(18);
  page.on("dialog", (d) => d.accept());
  await page.goto(`/classes/${course.id}/gradebook`);
  await page.getByTestId("submit-grades").click();
  await expect.poll(async () => (await apiCall<{ courses: Array<{ grades: Array<{ status: string }> }> }>(teacherApi, BASE, "GET", `/api/students/${student.id}/grades`)).courses[0]?.grades[0]?.status, { timeout: 15_000 }).toBe("SUBMITTED");

  // ── The grade appears in the student's record ───────────────────────────────────────────────
  await switchUser(page, studentEmail);
  await page.goto("/grades");
  await expect(page.getByText("18").first()).toBeVisible();
  await expect(page.getByText("Mathematics").first()).toBeVisible();

  // ── Teacher requests leave for next week's lesson ───────────────────────────────────────────
  await switchUser(page, teacherEmail);
  await page.goto("/leave");
  const leaveForm = page.getByTestId("leave-form");
  await leaveForm.locator('[name="type"]').selectOption("PERSONAL");
  await leaveForm.locator('[name="startDate"]').fill(isoDate(7));
  await leaveForm.locator('[name="endDate"]').fill(isoDate(7));
  const reason = leaveForm.locator('[name="reason"]');
  if (await reason.count()) await reason.fill("Family appointment");
  await leaveForm.getByTestId("submit").click();
  await page.waitForURL(/\/leave\/[^/]+$/, { timeout: 15_000 });
  const leaveId = page.url().split("/").pop()!;
  await expect(page.getByText(/pending/i).first()).toBeVisible();

  // ── Admin approves: affected classes identified, substitutes suggested ──────────────────────
  await switchUser(page, adminEmail);
  const impact = await apiCall<{ impact: { lessons: number; affected: Array<{ suggestions: Array<{ teacherId: string }> }> } }>(adminApi, BASE, "GET", `/api/leave/${leaveId}`);
  expect(impact.impact.lessons).toBe(1);
  expect(impact.impact.affected[0].suggestions.map((s) => s.teacherId)).toContain(teacher2.id);
  await page.goto(`/admin/leave/${leaveId}`);
  await expect(page.getByText("Mathematics").first()).toBeVisible();
  await expect(page.getByText("Sam Substitute").first()).toBeVisible();
  await page.getByTestId("approve").click();
  await expect.poll(async () => (await apiCall<{ status: string }>(adminApi, BASE, "GET", `/api/leave/${leaveId}`)).status, { timeout: 15_000 }).toBe("APPROVED");
  const substitutions = await apiCall<Array<{ id: string; status: string }>>(adminApi, BASE, "GET", `/api/substitutions?status=PENDING`);
  expect(substitutions).toHaveLength(1);

  // ── Admin assigns the suggested substitute ──────────────────────────────────────────────────
  await page.goto(`/admin/substitutions/${substitutions[0].id}`);
  const candidate = page.locator(`[data-testid="candidate"][data-id="${teacher2.id}"]`);
  await expect(candidate).toBeVisible();
  await candidate.getByTestId("assign").click();
  await expect(page.getByText(/assigned/i).first()).toBeVisible({ timeout: 15_000 });

  // ── Affected teacher, substitute and class are notified ─────────────────────────────────────
  const types = async (email: string) => (await apiCall<{ items: Array<{ type: string }> }>(await ctxFor(email), BASE, "GET", "/api/notifications")).items.map((n) => n.type);
  expect(await types(teacher2Email)).toContain("SUBSTITUTE_ASSIGNED");
  expect(await types(teacherEmail)).toContain("CLASS_COVERED");
  expect(await types(teacherEmail)).toContain("LEAVE_APPROVED");
  const studentTypes = await types(studentEmail);
  expect(studentTypes.length).toBeGreaterThan(0);
});
