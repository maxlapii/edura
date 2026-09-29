import { describe, expect, it } from "vitest";
import { createSchoolFixture, createStudent, signIn, api, prisma } from "../helpers";
import { createAssignment, createAssignmentSchema, deleteAssignment, getAssignment, listAssignments, submitAssignment, updateAssignment } from "@/modules/assignments";
import { enterGrades } from "@/modules/grades";
import { POST as submitRoute } from "@/app/api/assignments/[id]/submit/route";

const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY);
const input = (courseId: string, o: Record<string, unknown> = {}) => createAssignmentSchema.parse({ courseId, title: "Essay", dueDate: inDays(7), ...o });

describe("assignments", () => {
  it("teacher publishes an assignment and every student with a login is notified", async () => {
    const f = await createSchoolFixture();
    const a = await createAssignment(f.teacher.auth, input(f.course.id, { title: "Fractions" }));
    expect(a.status).toBe("PUBLISHED");
    const notes = await prisma.notification.findMany({ where: { type: "ASSIGNMENT_CREATED" } });
    expect(notes).toHaveLength(3);
    expect(new Set(notes.map((n) => n.userId))).toEqual(new Set(f.students.map((s) => s.user!.id)));
    expect(notes[0].title).toBe("New assignment: Fractions");
    expect(notes[0].link).toBe(`/assignments/${a.id}`);
  });

  it("only the course teacher or an admin can create assignments for a course", async () => {
    const f = await createSchoolFixture();
    await expect(createAssignment(f.teacher2.auth, input(f.course.id))).rejects.toMatchObject({ code: "FORBIDDEN" });
    const a = await createAssignment(f.admin, input(f.course.id));
    expect(a.courseId).toBe(f.course.id);
  });

  it("does not notify for drafts until they are published", async () => {
    const f = await createSchoolFixture();
    const a = await createAssignment(f.teacher.auth, input(f.course.id, { status: "DRAFT" }));
    expect(await prisma.notification.count({ where: { type: "ASSIGNMENT_CREATED" } })).toBe(0);
    const updated = await updateAssignment(f.teacher.auth, a.id, { status: "PUBLISHED" });
    expect(updated.status).toBe("PUBLISHED");
    expect(await prisma.notification.count({ where: { type: "ASSIGNMENT_CREATED" } })).toBe(3);
    // publishing again does not re-notify
    await updateAssignment(f.teacher.auth, a.id, { title: "Renamed" });
    expect(await prisma.notification.count({ where: { type: "ASSIGNMENT_CREATED" } })).toBe(3);
  });

  it("student submits through the route; teacher is notified; late flag depends on due date", async () => {
    const f = await createSchoolFixture();
    const student = f.students[0];
    const cookie = await signIn(student.user!.email);
    const onTime = await createAssignment(f.teacher.auth, input(f.course.id));
    const res = await api(submitRoute, { cookie, body: { content: "my work" }, params: { id: onTime.id } });
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ status: "SUBMITTED", isLate: false, studentId: student.student.id, content: "my work" });
    const teacherNote = await prisma.notification.findFirst({ where: { userId: f.teacher.user.id, title: `New submission: ${onTime.title}` } });
    expect(teacherNote).not.toBeNull();

    const late = await createAssignment(f.teacher.auth, input(f.course.id, { title: "Late one", dueDate: inDays(-1) }));
    const lateRes = await api(submitRoute, { cookie, body: { content: "sorry" }, params: { id: late.id } });
    expect(lateRes.status).toBe(201);
    expect(lateRes.data).toMatchObject({ status: "SUBMITTED", isLate: true });
    expect(await prisma.submission.count({ where: { studentId: student.student.id } })).toBe(2);
  });

  it("rejects submissions from students outside the class (403) and after grading (409)", async () => {
    const f = await createSchoolFixture();
    const a = await createAssignment(f.teacher.auth, input(f.course.id));
    const otherClass = await prisma.schoolClass.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, name: "10B" } });
    const outsider = await createStudent(f.school.id, otherClass.id);
    const res = await api(submitRoute, { cookie: await signIn(outsider.user!.email), body: { content: "x" }, params: { id: a.id } });
    expect(res.status).toBe(403);
    expect(res.error?.code).toBe("FORBIDDEN");

    const student = f.students[0];
    const cookie = await signIn(student.user!.email);
    expect((await api(submitRoute, { cookie, body: { content: "v1" }, params: { id: a.id } })).status).toBe(201);
    await enterGrades(f.teacher.auth, { assignmentId: a.id, grades: [{ studentId: student.student.id, score: 90 }] });
    const again = await api(submitRoute, { cookie, body: { content: "v2" }, params: { id: a.id } });
    expect(again.status).toBe(409);
    expect(again.error?.code).toBe("CONFLICT");
    await expect(submitAssignment(student.auth!, a.id, { attachments: [] })).rejects.toMatchObject({ code: "CONFLICT" });
    // a teacher cannot submit (no assignments:submit)
    expect((await api(submitRoute, { cookie: await signIn(f.teacher.user.email), body: { content: "x" }, params: { id: a.id } })).status).toBe(403);
  });

  describe("listAssignments filters", () => {
    async function seed() {
      const f = await createSchoolFixture();
      const upcomingMissing = await createAssignment(f.teacher.auth, input(f.course.id, { title: "A upcoming, not submitted", dueDate: inDays(5) }));
      const overdueMissing = await createAssignment(f.teacher.auth, input(f.course.id, { title: "B overdue, not submitted", dueDate: inDays(-2) }));
      const upcomingSubmitted = await createAssignment(f.teacher.auth, input(f.course.id, { title: "C upcoming, submitted", dueDate: inDays(3) }));
      const draft = await createAssignment(f.teacher.auth, input(f.course.id, { title: "D draft", status: "DRAFT" }));
      const student = f.students[0];
      await submitAssignment(student.auth!, upcomingSubmitted.id, { content: "done", attachments: [] });
      return { f, student, upcomingMissing, overdueMissing, upcomingSubmitted, draft };
    }
    const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id).sort();

    it("student: missing / submitted / upcoming / overdue (drafts never shown)", async () => {
      const { f, student, upcomingMissing, overdueMissing, upcomingSubmitted } = await seed();
      expect(ids(await listAssignments(student.auth!))).toEqual(ids([upcomingMissing, overdueMissing, upcomingSubmitted]));
      expect(ids(await listAssignments(student.auth!, { filter: "missing" }))).toEqual(ids([upcomingMissing, overdueMissing]));
      expect(ids(await listAssignments(student.auth!, { filter: "submitted" }))).toEqual(ids([upcomingSubmitted]));
      expect(ids(await listAssignments(student.auth!, { filter: "upcoming" }))).toEqual(ids([upcomingMissing, upcomingSubmitted]));
      expect(ids(await listAssignments(student.auth!, { filter: "overdue" }))).toEqual(ids([overdueMissing]));
      // a student sees only their own submission embedded
      const rows = await listAssignments(student.auth!, { filter: "submitted" });
      expect(rows[0].submissions).toHaveLength(1);
      expect(rows[0].submissions[0].studentId).toBe(student.student.id);
      // parents see published assignments of their linked child's class
      expect(ids(await listAssignments(f.guardian.auth))).toEqual(ids([upcomingMissing, overdueMissing, upcomingSubmitted]));
    });

    it("teacher: missing lists past-due assignments with fewer submissions than the roster; graded lists graded ones", async () => {
      const { f, student, overdueMissing, upcomingSubmitted, draft } = await seed();
      const missing = await listAssignments(f.teacher.auth, { filter: "missing" });
      expect(missing.map((a) => a.id)).toContain(overdueMissing.id);
      expect(await listAssignments(f.teacher.auth, { filter: "graded" })).toEqual([]);
      await enterGrades(f.teacher.auth, { assignmentId: upcomingSubmitted.id, grades: [{ studentId: student.student.id, score: 70 }] });
      expect(ids(await listAssignments(f.teacher.auth, { filter: "graded" }))).toEqual(ids([upcomingSubmitted]));
      // teachers do see their drafts; another teacher sees nothing for this course
      expect((await listAssignments(f.teacher.auth)).map((a) => a.id)).toContain(draft.id);
      expect(await listAssignments(f.teacher2.auth)).toEqual([]);
    });
    it("teacher: missing excludes assignments that are not yet due", async () => {
      const { f, upcomingMissing } = await seed();
      const missing = await listAssignments(f.teacher.auth, { filter: "missing" });
      expect(missing.map((a) => a.id)).not.toContain(upcomingMissing.id);
    });
  });

  it("getAssignment: teacher gets roster states and counts, student and parent only their own rows", async () => {
    const f = await createSchoolFixture();
    const [s1, s2, s3] = f.students;
    const pastDue = await createAssignment(f.teacher.auth, input(f.course.id, { title: "Past", dueDate: inDays(-1) }));
    await submitAssignment(s1.auth!, pastDue.id, { content: "late", attachments: [] });
    await submitAssignment(s3.auth!, pastDue.id, { content: "late but graded", attachments: [] });
    await enterGrades(f.teacher.auth, { assignmentId: pastDue.id, grades: [{ studentId: s3.student.id, score: 80 }] });

    const counts = (v: unknown) => (v as { counts?: Record<string, number> }).counts;
    const view = await getAssignment(f.teacher.auth, pastDue.id);
    const stateOf = (id: string) => view.roster.find((r) => r.student.id === id)!.state;
    expect(stateOf(s1.student.id)).toBe("LATE");
    expect(stateOf(s2.student.id)).toBe("MISSING");
    expect(stateOf(s3.student.id)).toBe("GRADED");
    expect(counts(view)).toEqual({ LATE: 1, MISSING: 1, GRADED: 1 });

    const future = await createAssignment(f.teacher.auth, input(f.course.id, { title: "Future", dueDate: inDays(4) }));
    await submitAssignment(s1.auth!, future.id, { content: "on time", attachments: [] });
    const view2 = await getAssignment(f.teacher.auth, future.id);
    expect(counts(view2)).toEqual({ SUBMITTED: 1, PENDING: 2 });

    const studentView = await getAssignment(s2.auth!, pastDue.id);
    expect(studentView.roster).toEqual([]);
    expect(studentView.submissions).toEqual([]);
    const s1View = await getAssignment(s1.auth!, pastDue.id);
    expect(s1View.submissions.map((s) => s.studentId)).toEqual([s1.student.id]);
    expect(s1View.grades).toEqual([]); // s1 has no grade; s3's DRAFT grade is not leaked

    const parentView = await getAssignment(f.guardian.auth, pastDue.id); // guardian of s1
    expect(parentView.roster).toEqual([]);
    expect(parentView.submissions.map((s) => s.studentId)).toEqual([s1.student.id]);
    expect(parentView.grades).toEqual([]);

    // drafts are hidden from students and parents
    const draft = await createAssignment(f.teacher.auth, input(f.course.id, { status: "DRAFT" }));
    await expect(getAssignment(s1.auth!, draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getAssignment(f.guardian.auth, draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // another teacher has no access
    await expect(getAssignment(f.teacher2.auth, pastDue.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("delete is blocked once grades exist", async () => {
    const f = await createSchoolFixture();
    const a = await createAssignment(f.teacher.auth, input(f.course.id));
    await submitAssignment(f.students[0].auth!, a.id, { content: "x", attachments: [] });
    await enterGrades(f.teacher.auth, { assignmentId: a.id, grades: [{ studentId: f.students[0].student.id, score: 50 }] });
    await expect(deleteAssignment(f.teacher.auth, a.id)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.assignment.count({ where: { id: a.id } })).toBe(1);

    const b = await createAssignment(f.teacher.auth, input(f.course.id));
    await expect(deleteAssignment(f.teacher2.auth, b.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await deleteAssignment(f.teacher.auth, b.id);
    expect(await prisma.assignment.count({ where: { id: b.id } })).toBe(0);
  });
});
