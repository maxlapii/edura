/**
 * Calls every GET route handler as different roles. This guards against handlers that crash
 * (500) or skip authentication (200 without a session), and exercises the thin route layer.
 */
import { describe, expect, it } from "vitest";
import { createSchoolFixture, signIn, api, prisma, type RouteHandler } from "../helpers";

const routes = import.meta.glob("../../../app/api/**/route.ts") as Record<string, () => Promise<Record<string, RouteHandler | undefined>>>;

function urlFor(file: string) {
  return file.replace(/^.*\/app\/api/, "/api").replace(/\/route\.ts$/, "");
}

describe("API smoke", () => {
  it("every GET route rejects anonymous callers and never crashes for an administrator or a student", async () => {
    const f = await createSchoolFixture();
    const assignment = await prisma.assignment.create({ data: { schoolId: f.school.id, courseId: f.course.id, title: "HW", dueDate: new Date() } });
    const submission = await prisma.submission.create({ data: { schoolId: f.school.id, assignmentId: assignment.id, studentId: f.students[0].student.id } });
    const grade = await prisma.grade.create({ data: { schoolId: f.school.id, studentId: f.students[0].student.id, courseId: f.course.id, assignmentId: assignment.id, score: 1, maxScore: 10 } });
    const task = await prisma.task.create({ data: { schoolId: f.school.id, title: "T", assigneeUserId: f.adminUser.id } });
    const idFor: Record<string, string> = {
      teachers: f.teacher.teacher.id,
      students: f.students[0].student.id,
      classes: f.cls.id,
      courses: f.course.id,
      assignments: assignment.id,
      submissions: submission.id,
      grades: grade.id,
      guardians: f.guardian.guardian.id,
      schools: f.school.id,
      users: f.adminUser.id,
      departments: f.department.id,
      subjects: f.subject.id,
      timetable: f.slots[0].id,
      periods: f.periods[0].id,
      "academic-years": f.year.id,
      terms: f.term.id,
      tasks: task.id,
      rooms: f.room.id,
    };
    const adminCookie = await signIn(f.adminUser.email);
    const studentCookie = await signIn(f.students[0].user!.email);
    const skip = ["/api/auth/[...all]", "/api/jobs"];
    let checked = 0;
    for (const [file, load] of Object.entries(routes)) {
      const path = urlFor(file);
      if (skip.some((s) => path.startsWith(s))) continue;
      const mod = await load();
      if (!mod.GET) continue;
      const segments = path.split("/");
      const resource = segments[2];
      const params: Record<string, string> = { id: idFor[resource] ?? "missing-id", name: "tasks", all: "" };
      const concrete = path.replace("[id]", params.id).replace("[name]", params.name);
      const anon = await api(mod.GET, { path: concrete, params });
      expect(anon.status, `${path} anonymous`).toBe(401);
      for (const [label, cookie] of [["admin", adminCookie], ["student", studentCookie]] as const) {
        const res = await api(mod.GET, { path: concrete, params, cookie });
        expect([200, 400, 403, 404, 422], `${path} as ${label} → ${res.status} ${res.text.slice(0, 200)}`).toContain(res.status);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(60);
  });
});
