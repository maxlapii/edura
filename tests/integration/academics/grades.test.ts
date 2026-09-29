import { describe, expect, it } from "vitest";
import { createSchoolFixture, createStudent, signIn, api, prisma } from "../helpers";
import { createAssignment, createAssignmentSchema, submitAssignment } from "@/modules/assignments";
import { changeGradeStatus, courseGradebook, createAssessment, enterGrades, gradeHistory, gradeSubmissionStatus, pendingGrading, studentGrades, updateGrade } from "@/modules/grades";
import { POST as gradesRoute } from "@/app/api/grades/route";

const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY);

async function seed() {
  const f = await createSchoolFixture();
  const assignment = await createAssignment(f.teacher.auth, createAssignmentSchema.parse({ courseId: f.course.id, title: "Quiz 1", dueDate: inDays(3), maxScore: 50 }));
  const student = f.students[0];
  await submitAssignment(student.auth!, assignment.id, { content: "answers", attachments: [] });
  return { f, assignment, student };
}

describe("grades", () => {
  it("validates scores against maxScore and roster membership with per-student details", async () => {
    const { f, assignment, student } = await seed();
    const otherClass = await prisma.schoolClass.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, name: "10B" } });
    const outsider = await createStudent(f.school.id, otherClass.id, { withLogin: false });
    const err = await enterGrades(f.teacher.auth, { assignmentId: assignment.id, grades: [{ studentId: student.student.id, score: 51 }, { studentId: outsider.student.id, score: 10 }] }).catch((e) => e);
    expect(err).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(err.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ studentId: student.student.id, error: expect.stringContaining("exceed") }),
        expect.objectContaining({ studentId: outsider.student.id, error: "Student is not in this class" }),
      ]),
    );
    expect(await prisma.grade.count()).toBe(0);
  });

  it("enters DRAFT grades with history, marks the submission GRADED and notifies the student; re-entry updates", async () => {
    const { f, assignment, student } = await seed();
    const [grade] = await enterGrades(f.teacher.auth, { assignmentId: assignment.id, grades: [{ studentId: student.student.id, score: 45, comment: "Good" }] });
    expect(grade).toMatchObject({ status: "DRAFT", score: 45, maxScore: 50, letter: "A", comment: "Good", gradedById: f.teacher.user.id, termId: f.term.id });
    const submission = await prisma.submission.findUniqueOrThrow({ where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: student.student.id } } });
    expect(submission).toMatchObject({ status: "GRADED", feedback: "Good" });
    const note = await prisma.notification.findFirst({ where: { userId: student.user!.id, type: "ASSIGNMENT_GRADED" } });
    expect(note?.title).toBe("Grade posted: Quiz 1");
    expect(note?.body).toBe("You scored 45/50.");

    const [again] = await enterGrades(f.teacher.auth, { assignmentId: assignment.id, grades: [{ studentId: student.student.id, score: 30 }] });
    expect(again.id).toBe(grade.id);
    expect(again).toMatchObject({ score: 30, letter: "D", comment: "Good" });
    const history = await gradeHistory(f.teacher.auth, grade.id);
    expect(history.map((h) => [h.reason, h.previousScore, h.newScore])).toEqual([
      ["Updated", 45, 30],
      ["Entered", null, 45],
    ]);
    expect(await prisma.grade.count()).toBe(1);
  });

  it("updateGrade writes history with the given reason and validates the score", async () => {
    const { f, assignment, student } = await seed();
    const [grade] = await enterGrades(f.teacher.auth, { assignmentId: assignment.id, grades: [{ studentId: student.student.id, score: 40 }] });
    const updated = await updateGrade(f.teacher.auth, grade.id, { score: 42, reason: "Re-marked question 3" });
    expect(updated.score).toBe(42);
    const history = await prisma.gradeHistory.findMany({ where: { gradeId: grade.id }, orderBy: { createdAt: "desc" } });
    expect(history[0]).toMatchObject({ previousScore: 40, newScore: 42, reason: "Re-marked question 3", changedById: f.teacher.user.id });
    await expect(updateGrade(f.teacher.auth, grade.id, { score: 99 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(updateGrade(f.teacher2.auth, grade.id, { score: 41 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("SUBMIT / LOCK / UNLOCK lifecycle: locking needs grades:lock and locked grades are immutable", async () => {
    const { f, assignment, student } = await seed();
    const [grade] = await enterGrades(f.teacher.auth, { assignmentId: assignment.id, grades: [{ studentId: student.student.id, score: 40 }] });
    expect(await changeGradeStatus(f.teacher.auth, f.course.id, "SUBMIT")).toEqual({ updated: 1 });
    expect((await prisma.grade.findUniqueOrThrow({ where: { id: grade.id } })).status).toBe("SUBMITTED");

    await expect(changeGradeStatus(f.teacher.auth, f.course.id, "LOCK")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await changeGradeStatus(f.admin, f.course.id, "LOCK")).toEqual({ updated: 1 });
    const locked = await prisma.grade.findUniqueOrThrow({ where: { id: grade.id } });
    expect(locked.status).toBe("LOCKED");
    expect(locked.lockedAt).not.toBeNull();

    await expect(enterGrades(f.teacher.auth, { assignmentId: assignment.id, grades: [{ studentId: student.student.id, score: 41 }] })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(updateGrade(f.admin, grade.id, { score: 41 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await prisma.grade.findUniqueOrThrow({ where: { id: grade.id } })).score).toBe(40);

    expect(await changeGradeStatus(f.admin, f.course.id, "UNLOCK")).toEqual({ updated: 1 });
    const unlocked = await prisma.grade.findUniqueOrThrow({ where: { id: grade.id } });
    expect(unlocked.status).toBe("SUBMITTED");
    expect(unlocked.lockedAt).toBeNull();
    // re-entering a SUBMITTED grade keeps it SUBMITTED
    const [re] = await enterGrades(f.teacher.auth, { assignmentId: assignment.id, grades: [{ studentId: student.student.id, score: 44 }] });
    expect(re.status).toBe("SUBMITTED");
  });

  it("students and parents see grades only once they are submitted", async () => {
    const { f, assignment, student } = await seed();
    await enterGrades(f.teacher.auth, { assignmentId: assignment.id, grades: [{ studentId: student.student.id, score: 40 }] });
    expect((await studentGrades(student.auth!, student.student.id)).courses).toEqual([]);
    expect((await studentGrades(f.guardian.auth, student.student.id)).courses).toEqual([]);
    // teachers see drafts
    expect((await studentGrades(f.teacher.auth, student.student.id)).courses[0].grades).toHaveLength(1);

    await changeGradeStatus(f.teacher.auth, f.course.id, "SUBMIT");
    const mine = await studentGrades(student.auth!, student.student.id);
    expect(mine.courses).toHaveLength(1);
    expect(mine.courses[0]).toMatchObject({ courseId: f.course.id, subject: "Mathematics", summary: { average: 80, letter: "B", graded: 1 } });
    expect(mine.overall).toBe(80);
    expect((await studentGrades(f.guardian.auth, student.student.id)).courses).toHaveLength(1);
    // a student cannot read a classmate's grades
    await expect(studentGrades(f.students[1].auth!, student.student.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("courseGradebook returns per-student summaries and status counts; students are refused", async () => {
    const { f, assignment, student } = await seed();
    await enterGrades(f.teacher.auth, { assignmentId: assignment.id, grades: [{ studentId: student.student.id, score: 25 }] });
    const book = await courseGradebook(f.teacher.auth, f.course.id);
    expect(book.rows).toHaveLength(3);
    expect(book.assignments.map((a) => a.id)).toEqual([assignment.id]);
    const row = book.rows.find((r) => r.student.id === student.student.id)!;
    expect(row.summary).toEqual({ average: 50, letter: "F", graded: 1, total: 1 });
    expect(book.rows.find((r) => r.student.id === f.students[1].student.id)!.summary.average).toBeNull();
    expect(book.status).toEqual({ pending: 1, submitted: 0, locked: 0, missing: 2 });
    await expect(courseGradebook(student.auth!, f.course.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(courseGradebook(f.guardian.auth, f.course.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(courseGradebook(f.teacher2.auth, f.course.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("assessment grades are weighted into the course summary", async () => {
    const { f, assignment, student } = await seed();
    await enterGrades(f.teacher.auth, { assignmentId: assignment.id, grades: [{ studentId: student.student.id, score: 40 }] }); // 80%, weight 1
    const assessment = await createAssessment(f.teacher.auth, { courseId: f.course.id, title: "Midterm", type: "EXAM", maxScore: 200, weight: 3 });
    expect(assessment).toMatchObject({ courseId: f.course.id, weight: 3, maxScore: 200 });
    await expect(createAssessment(f.teacher2.auth, { courseId: f.course.id, title: "Nope", type: "TEST", maxScore: 10, weight: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const [g] = await enterGrades(f.teacher.auth, { assessmentId: assessment.id, grades: [{ studentId: student.student.id, score: 100 }] }); // 50%, weight 3
    expect(g).toMatchObject({ assessmentId: assessment.id, assignmentId: null, maxScore: 200, termId: f.term.id });
    const view = await studentGrades(f.teacher.auth, student.student.id);
    expect(view.courses[0].summary).toEqual({ average: 57.5, letter: "F", graded: 2, total: 2 });
    const book = await courseGradebook(f.teacher.auth, f.course.id);
    expect(book.rows.find((r) => r.student.id === student.student.id)!.summary.average).toBe(57.5);
    expect(book.status.missing).toBe(3 * 2 - 2);
  });

  it("pendingGrading lists assignments with ungraded submissions and gradeSubmissionStatus summarises per course", async () => {
    const { f, assignment, student } = await seed();
    const pending = await pendingGrading(f.teacher.auth);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ assignment: { id: assignment.id }, pending: 1 });
    expect(await pendingGrading(f.teacher2.auth)).toEqual([]);
    expect((await pendingGrading(f.admin)).map((r) => r.assignment.id)).toEqual([assignment.id]);
    // a teacher cannot inspect another teacher's queue
    await expect(pendingGrading(f.teacher2.auth, f.teacher.teacher.id)).rejects.toMatchObject({ code: "FORBIDDEN" });

    let status = await gradeSubmissionStatus(f.admin);
    expect(status.find((s) => s.course.id === f.course.id)).toMatchObject({ status: "NONE", total: 0 });
    await enterGrades(f.teacher.auth, { assignmentId: assignment.id, grades: [{ studentId: student.student.id, score: 40 }] });
    expect(await pendingGrading(f.teacher.auth)).toEqual([]);
    status = await gradeSubmissionStatus(f.admin);
    expect(status.find((s) => s.course.id === f.course.id)).toMatchObject({ status: "PENDING", counts: { DRAFT: 1, SUBMITTED: 0, LOCKED: 0 } });
    await changeGradeStatus(f.teacher.auth, f.course.id, "SUBMIT");
    status = await gradeSubmissionStatus(f.admin);
    expect(status.find((s) => s.course.id === f.course.id)!.status).toBe("SUBMITTED");
    await expect(gradeSubmissionStatus(f.teacher.auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("POST /api/grades: students get 403, a teacher of another course gets 403, the course teacher succeeds", async () => {
    const { f, assignment, student } = await seed();
    const body = { assignmentId: assignment.id, grades: [{ studentId: student.student.id, score: 33 }] };
    const asStudent = await api(gradesRoute, { cookie: await signIn(student.user!.email), body });
    expect(asStudent.status).toBe(403);
    expect(asStudent.error?.code).toBe("FORBIDDEN");
    const asOtherTeacher = await api(gradesRoute, { cookie: await signIn(f.teacher2.user.email), body });
    expect(asOtherTeacher.status).toBe(403);
    expect(await prisma.grade.count()).toBe(0);

    const bad = await api(gradesRoute, { cookie: await signIn(f.teacher.user.email), body: { assignmentId: assignment.id, grades: [{ studentId: student.student.id, score: 500 }] } });
    expect(bad.status).toBe(422);
    const ok = await api(gradesRoute, { cookie: await signIn(f.teacher.user.email), body });
    expect(ok.status).toBe(200);
    expect(ok.data).toEqual([expect.objectContaining({ score: 33, status: "DRAFT" })]);
    expect((await api(gradesRoute, { cookie: await signIn(f.teacher.user.email), body: { grades: [] } })).status).toBe(422);
  });
});
